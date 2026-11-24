#!/usr/bin/env python3
"""Vygeneruje hlášky komentátora hlasem Piper.
Česky (hlas „jirka“, CC0) do sounds/voice/:      python3 tools/gen_voice.py /cesta/k/cs_CZ-jirka-medium.onnx
Anglicky (hlas „joe“, CC0) do sounds/voice-en/:  python3 tools/gen_voice.py /cesta/k/en_US-joe-medium.onnx en
Potřebuje: pip install piper-tts, ffmpeg."""
import json, os, re, subprocess, sys, unicodedata, wave, io
from piper import PiperVoice, SynthesisConfig

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'sounds', 'voice')
data = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf-8').read()
surnames = re.findall(r"'([^']+)'", data[data.index('const SURNAMES'):data.index('const INITIALS')])
cities = sorted(set(re.findall(r"city: '([^']+)'", data)))

PHRASES = [
    # úvod a třetiny
    'Vítejte u zápasu.', 'Dobrý večer, vítejte na stadionu.', 'proti', 'Komentář zapnut.',
    'Začíná první třetina.', 'Začíná druhá třetina.', 'Začíná třetí třetina.', 'Jdeme do prodloužení!',
    'Konec první třetiny.', 'Konec druhé třetiny.', 'Konec třetí třetiny.', 'Rolba vyjíždí na led.',
    'Konec zápasu! Vítězí', 'Konec zápasu. Remíza.',
    # góly
    'Gól!', 'A je to tam!', 'Gól! Puk je v síti!', 'Gól! Neuvěřitelné!', 'Góóól!', 'Skóroval', 'Gól v přesilovce!',
    # střely a zákroky
    'Chytil to!', 'Lapačka!', 'Jistý zákrok.', 'Výborný zákrok!', 'Brankář je na místě.', 'Skvělá reakce!', 'Vyrazil to!',
    'Tyčka!', 'Zvoní tyčka!', 'Střela!', 'Pálí!', 'Dělovka od modré!', 'Z první!',
    # souboje
    'Ten to schytal!', 'Tvrdý hit!', 'Au, to bolelo!', 'Pořádný bodyček!',
    # vyloučení
    'Odložené vyloučení.', 'Vyloučení!', 'Dvě minuty!', 'Rozhodčí vylučuje.',
    'hákování', 'podrážení', 'sekání', 'napadení zezadu', 'narážení na mantinel', 'bránění ve hře', 'hrubost',
    # zranění
    'Ofsajd!', 'Postavení mimo hru.', 'Zakázané uvolnění.',
    'Zdá se, že je zraněný.', 'To nevypadá dobře.', 'Zraněný hráč odchází do kabin.', 'nedohraje.',
    # nájezdy, odvolání brankáře, tlak, průběh zápasu
    'O vítězi rozhodnou samostatné nájezdy!', 'Nájezd.', 'Proměnil!', 'Je to tam!', 'Neproměnil.', 'Zákrok!', 'Brankář vyhrál souboj.', 'Trestné střílení!',
    'Brankář jede na střídačku!', 'Odvolávají brankáře!', 'Do prázdné branky!',
    'Domácí drží soupeře v pásmu.', 'Velký tlak v útočném pásmu!', 'Soupeř se nemůže dostat z pásma.', 'Jsou na vlně!',
    'Hattrick!', 'Jeho druhý gól!', 'Dva góly krátce po sobě!', 'Vyrovnáno!', 'Jdou do vedení!', 'Poslední minuta!', 'Zlomená hůl!',
] + surnames + cities

# anglický komentář: klíč zůstává český (tak hlášku volá hra), čte se anglický text
EN = {
    'Vítejte u zápasu.': 'Welcome to the game!', 'Dobrý večer, vítejte na stadionu.': 'Good evening, hockey fans, and welcome!', 'proti': 'versus', 'Komentář zapnut.': 'Commentary on.',
    'Začíná první třetina.': 'The first period is under way!', 'Začíná druhá třetina.': 'Here we go, second period!', 'Začíná třetí třetina.': 'The third period begins!', 'Jdeme do prodloužení!': 'We are going to overtime!',
    'Konec první třetiny.': 'That is the end of the first period.', 'Konec druhé třetiny.': 'End of the second period.', 'Konec třetí třetiny.': 'End of the third period.', 'Rolba vyjíždí na led.': 'Here comes the zamboni.',
    'Konec zápasu! Vítězí': 'That is the game! The winner is', 'Konec zápasu. Remíza.': 'That is the game. It ends in a tie.',
    'Gól!': 'He scores!', 'A je to tam!': 'It is in the net!', 'Gól! Puk je v síti!': 'He shoots, he scores!', 'Gól! Neuvěřitelné!': 'Goal! Unbelievable!', 'Góóól!': 'Goal! What a goal!', 'Skóroval': 'Scored by', 'Gól v přesilovce!': 'A power play goal!',
    'Chytil to!': 'Caught it!', 'Lapačka!': 'Glove save!', 'Jistý zákrok.': 'Easy save.', 'Výborný zákrok!': 'What a save!', 'Brankář je na místě.': 'The goalie was right there.', 'Skvělá reakce!': 'Great reflexes!', 'Vyrazil to!': 'Kicked away!',
    'Tyčka!': 'Off the post!', 'Zvoní tyčka!': 'He rings it off the iron!', 'Střela!': 'Shot!', 'Pálí!': 'He fires!', 'Dělovka od modré!': 'A cannon from the blue line!', 'Z první!': 'One timer!',
    'Ten to schytal!': 'Oh, he got crushed!', 'Tvrdý hit!': 'Big hit!', 'Au, to bolelo!': 'Ouch! That hurt!', 'Pořádný bodyček!': 'What a body check!',
    'Odložené vyloučení.': 'Delayed penalty coming.', 'Vyloučení!': 'Penalty!', 'Dvě minuty!': 'Two minutes!', 'Rozhodčí vylučuje.': 'The referee calls a penalty.',
    'hákování': 'hooking', 'podrážení': 'tripping', 'sekání': 'slashing', 'napadení zezadu': 'checking from behind', 'narážení na mantinel': 'boarding', 'bránění ve hře': 'interference', 'hrubost': 'roughing',
    'Ofsajd!': 'Offside!', 'Postavení mimo hru.': 'That is offside.', 'Zakázané uvolnění.': 'Icing.',
    'O vítězi rozhodnou samostatné nájezdy!': 'We are going to a shootout!', 'Nájezd.': 'Here he comes.', 'Proměnil!': 'He scores!', 'Je to tam!': 'It is in!', 'Neproměnil.': 'No goal.', 'Zákrok!': 'Save!', 'Brankář vyhrál souboj.': 'The goalie wins that one.', 'Trestné střílení!': 'Penalty shot!',
    'Brankář jede na střídačku!': 'The goalie is heading to the bench!', 'Odvolávají brankáře!': 'They pull the goalie!', 'Do prázdné branky!': 'Into the empty net!',
    'Domácí drží soupeře v pásmu.': 'They are keeping the pressure on.', 'Velký tlak v útočném pásmu!': 'Huge pressure in the zone!', 'Soupeř se nemůže dostat z pásma.': 'They just cannot clear the puck.', 'Jsou na vlně!': 'They have all the momentum!',
    'Hattrick!': 'Hat trick!', 'Jeho druhý gól!': 'His second of the night!', 'Dva góly krátce po sobě!': 'Back to back goals!', 'Vyrovnáno!': 'We are tied!', 'Jdou do vedení!': 'They take the lead!', 'Poslední minuta!': 'One minute to go!', 'Zlomená hůl!': 'Broken stick!',
    'Zdá se, že je zraněný.': 'He seems to be hurt.', 'To nevypadá dobře.': 'That does not look good.', 'Zraněný hráč odchází do kabin.': 'The injured player is heading to the locker room.', 'nedohraje.': 'will not return.',
}
def text_for(t, lang):
    if lang != 'en': return t
    return EN.get(t) or unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode()   # jména a města bez diakritiky

def slug(t):
    s = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_') or 'x'

def main(model, lang='cs'):
    global OUT
    if lang == 'en': OUT += '-en'
    voice = PiperVoice.load(model)
    # svižné tempo; zvolání (končí vykřičníkem) rychleji, proměnlivěji, o kousek výš a hlasitěji
    cfg = SynthesisConfig(length_scale=0.8, noise_scale=0.55, noise_w_scale=0.45)
    hot = SynthesisConfig(length_scale=0.74, noise_scale=0.8, noise_w_scale=0.65)
    if lang == 'en': cfg, hot = SynthesisConfig(length_scale=0.85, noise_scale=0.667, noise_w_scale=0.6), SynthesisConfig(length_scale=0.8, noise_scale=0.8, noise_w_scale=0.7)
    os.makedirs(OUT, exist_ok=True)
    manifest, used = {}, set()
    for t in PHRASES:
        f = slug(t)
        while f in used: f += '_'
        used.add(f)
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as w:
            say = text_for(t, lang); loud = say.endswith('!')
            voice.synthesize_wav(say, w, syn_config=hot if loud else cfg)
        wav = os.path.join('/tmp', f + '.wav'); open(wav, 'wb').write(buf.getvalue())
        mp3 = os.path.join(OUT, f + '.mp3')
        # ořez ticha, mírná komprese a „sportovní“ barva
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af',
                        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,highpass=f=90,acompressor=threshold=-18dB:ratio=3,' + ('asetrate=22050*1.06,aresample=22050,volume=1.8' if loud else 'volume=1.4'),
                        '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '48k', mp3], check=True)
        os.remove(wav)
        manifest[t] = f + '.mp3'
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(len(manifest), 'hlášek')

if __name__ == '__main__':
    main(*sys.argv[1:3])
