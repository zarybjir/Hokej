#!/usr/bin/env python3
"""Vygeneruje hlášky komentátora (český hlas Piper „jirka“, licence CC0) do sounds/voice/.
Použití: python3 tools/gen_voice.py /cesta/k/cs_CZ-jirka-medium.onnx
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
] + surnames + cities

def slug(t):
    s = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_') or 'x'

def main(model):
    voice = PiperVoice.load(model)
    cfg = SynthesisConfig(length_scale=0.92, noise_scale=0.5, noise_w_scale=0.4)
    os.makedirs(OUT, exist_ok=True)
    manifest, used = {}, set()
    for t in PHRASES:
        f = slug(t)
        while f in used: f += '_'
        used.add(f)
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as w:
            voice.synthesize_wav(t, w, syn_config=cfg)
        wav = os.path.join('/tmp', f + '.wav'); open(wav, 'wb').write(buf.getvalue())
        mp3 = os.path.join(OUT, f + '.mp3')
        # ořez ticha, mírná komprese a „sportovní“ barva
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af',
                        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,highpass=f=90,acompressor=threshold=-18dB:ratio=3,volume=1.4',
                        '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '48k', mp3], check=True)
        os.remove(wav)
        manifest[t] = f + '.mp3'
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(len(manifest), 'hlášek')

if __name__ == '__main__':
    main(sys.argv[1])
