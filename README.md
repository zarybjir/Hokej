# Hokej '98

Arkádový hokej ve stylu her z konce 90. let v plném 3D (WebGL / Three.js): lesklý led se zrcadlením,
plexisklo s odlesky, hráči jako 3D modely s kostrou v hokejové výstroji (dres se jménem a číslem,
helma s plexi štítem, rukavice, brusle, brankářské betony a maska) animovaní inverzní kinematikou,
stíny, tribuny plné diváků a LED pás.
Každý tým má 3 formace (centr, 2 křídla, 2 obránci) a 2 brankáře. Hráči mají atributy **síla**
(bodyčeky, krytí puku, tvrdost střely), **rychlost**, **přesnost** (střely, přihrávky) a **stamina**
(jak rychle se unaví); brankáři reflexy. Na ledě se hráči unavují, unavení jsou pomalejší a méně
přesní, na střídačce se zotaví. Formace se střídají za běhu (hráči dojedou ke dvířkům střídačky)
nebo při přerušení — automaticky, nebo ručně tlačítkem **LB**. Na ledě jsou rozhodčí (hlavní
s oranžovými pásky a dva čároví), kteří vhazují a signalizují. Čísla jsou na zádech, ramenou
a helmě, nad hráčem s pukem je jmenovka.

**Fauly a vyloučení:** rozhodčí trestá hákování (šťouchnutí zezadu), podrážení (hůl do nohou místo
do puku), sekání (šťouchnutí do hráče bez puku), napadení zezadu, narážení na mantinel, bránění ve hře
(bodyček do hráče bez puku) a hrubost. Když má faulovaný tým puk, je vyloučení **odložené** — rozhodčí
zvedne ruku a píská, až se puku dotkne faulující tým (gól v té chvíli vyloučení ruší). Vyloučený hráč jde
na trestnou lavici a tým hraje v oslabení (5 na 4, nejvýš 5 na 3); gól v přesilovce trest ukončí.
Délka trestu „2 minuty“ se přepočítává podle délky třetiny (u 3min třetin 25 s, u 20min třetin 2 min).
Fauly lze vypnout v menu *Exhibice* nebo v Nastavení.
**Zranění:** po faulu (nejčastěji po napadení zezadu a narážení na mantinel) nebo při velkém
vyčerpání (hráč s téměř prázdnou energií si natáhne sval) se hráč může zranit — zůstane ležet,
rozhodčí přeruší hru, až má puk jeho tým, a hráč zápas nedohraje; za něj nastupuje hráč na stejném
postu z jiné formace. Zranění lze vypnout v Nastavení.
HUD je ve stylu bílého bodového LED displeje jako na stadionu; ovládaný hráč má pod sebou
na ledě rozsegmentovaný kruh ve své barvě (1P žlutá, 2P tyrkysová).
Pohled seshora (kluziště na výšku, scrolluje se nahoru/dolů; v Nastavení lze přepnout na TV kameru
z boku) s nastavitelným zoomem. Příklepy, golfáky z první,
bodyčeky, varhany, houkačka, záznam gólu a tři hvězdy zápasu. Pro 1–2 hráče (až 4)
proti počítači nebo proti sobě, i ve spolupráci.

Běží v prohlížeči (WebGL + Gamepad API), bez instalace čehokoli dalšího — Three.js je přibalené
ve složce `lib/`, takže hra funguje i offline.
**Vyváženost:** atributy hráčů, hmotnost, stav ledu i únava mají jen mírný vliv — rozhoduje
šikovnost. Se slabší sestavou to má hráč těžší, ale šikovnější hráč vyhraje (počítač proti počítači
vyhrává tým o 10 bodů silnější zhruba ve 2 zápasech ze 3, s rozdílem necelého gólu).

**Obtížnost a asistence:** obtížnosti Dětská / Lehká / Normální / Těžká / Legenda, k tomu **rychlost hry**
(70–125 %) a **asistence pro každého hráče zvlášť** (Nastavení → Hra, nebo tlačítkem **Y** na obrazovce
výběru ovladačů): *Částečná* přepíná na hráče u puku a zpřesní střely, *Plná (děti)* navíc sama napadá
soupeře s pukem, když hráč nedrží páčku, sama míří do volného rohu, snadněji sebere puk a vyhraje buly.
Obtížnost *Dětská* (pomalý a mírný soupeř, silnější vlastní brankář) zapne plnou asistenci oběma hráčům.

**Fyzika:** každý hráč má výšku a hmotnost (72–107 kg podle síly, obránci a brankáři jsou těžší;
vidíš je na soupisce). Těžší hráč pomaleji zrychluje, ale v soubojích rozhoduje hybnost —
rozjetý těžký hráč lehčího srazí, lehčí do těžkého často jen narazí (*ustál to*) nebo se sám odrazí,
a těžšímu se hůř bere puk. Vyšší hráč má delší dosah hokejkou (asi ±8 %): dál dosáhne při šťouchnutí holí, dřív
sebere volný puk a vede ho dál od těla; ve hře je i o kousek větší. **Stav ledu** se během třetiny zhoršuje tam, kde se jezdí (nejvíc při
prudkém brzdění): rozbrušený led se sněhem brzdí puk i bruslaře, puk na něm poskakuje a mění
směr a při kličkování může odskočit z hokejky. Stav ledu je vidět na stopách bruslí a v procentech
v přestávce; rolba led obnoví (ruční rolba jen tam, kudy projedeš).

**Týmy:** 32 týmů z měst NHL ve skutečných barvách, rozdělených do Východní a Západní konference
a čtyř divizí. Přezdívky, znaky i hráči jsou vlastní (oficiální názvy a loga NHL jsou chráněné
ochrannými známkami). V Nastavení → *Vlastní názvy týmů* si můžeš města, přezdívky a zkratky přepsat
podle sebe — uloží se jen v tvém prohlížeči.

**Dresy:** domácí v klubové barvě, hosté v bílé; každý tým má svůj styl pruhů (lem dresu, rukávy,
štulpny), sedlo s lemovkou, výstřih se šněrováním, znak na prsou, jméno a číslo s dvojitým obrysem
na zádech, čísla na ramenou a helmě, znak na helmě a boční pruh na kalhotách.

**Grafika (kvalita VYSOKÁ):** bloom (záře světel a branková světla), barevné ladění jako v TV
přenosu, rampy světel nad ledem, které se v ledu odrážejí, stopy bruslí, které se během třetiny
hromadí (o přestávce je smaže rolba), sníh od bruslí při prudkém brzdění a v ostrých obratech.
Hráči mají objemnější výstroj, v zatáčkách se naklánějí a překládají nohy a po střele dokončí
švih holí. Kamera mírně odjede při rychlé akci a přiblíží se v klidné hře.

## Legion Go S / Steam Deck (SteamOS)

1. Přepni do **plochy** (Steam → Napájení → Přepnout na plochu).
2. V aplikaci **Discover** nainstaluj **Chromium** (pokud ho ještě nemáš).
3. Stáhni tento repozitář (na GitHubu *Code → Download ZIP*) a rozbal ho třeba do
   `~/Games/hokej`, aby v ní ležel `hokej.sh` a `index.html`.
   Nebo v Konsoli: `git clone https://github.com/zarybjir/Hokej ~/Games/hokej`
4. Souboru `hokej.sh` povol spouštění: pravé tlačítko → *Vlastnosti → Oprávnění → Je spustitelný*
   (nebo v Konsoli `chmod +x ~/Games/hokej/hokej.sh`).
5. Ve Steamu na ploše: **Hry → Přidat hru mimo Steam… → Procházet** → vyber `hokej.sh`
   (v dialogu přepni filtr na *Všechny soubory*) → **Přidat vybrané programy**.
6. Volitelně ji ve vlastnostech přejmenuj na „Hokej '98".
7. Vrať se do **herního režimu** a spusť hru z knihovny (sekce *Mimo Steam*).

**Ovladač:** ve hře zmáčkni tlačítko Steam/Legion → *Nastavení ovladače* a zvol šablonu
**Gamepad** (ne „Webový prohlížeč" — ta mapuje páčku na myš).

**Dva hráči:** Legion Go S má jeden vestavěný ovladač, druhý hráč potřebuje další gamepad
(Bluetooth nebo USB — Xbox, PlayStation, 8BitDo…). Na obrazovce *Výběr ovladačů* si každý
posune svůj ovladač páčkou k týmu: oba na různé strany = proti sobě, oba na stejnou stranu =
spolupráce proti počítači.

**Ukončení:** tlačítko Steam → *Ukončit hru*.

**Aktualizace:** hra si při spuštění sama zjistí, jestli je na GitHubu nová verze, a nainstaluje ji
(potřebuje internet). Ručně: *Nastavení → Aktualizace → Zkontrolovat / Aktualizovat teď*, tam jde
automatika i vypnout. Pokud máš hru nainstalovanou přes `git clone`, aktualizuje se přes `git pull`,
jinak se stáhne ZIP z GitHubu a přepíše soubory hry (uložené kariéry a nastavení zůstanou — jsou
v prohlížeči). **Pokud máš starší verzi hry než 1.19, aktualizuj ji jednou ručně** (znovu stáhni ZIP
nebo `git pull` v Konsoli) — teprve nová verze `hokej.sh` spouští server, který umí aktualizace.

Spouštěč `hokej.sh` spustí lokální server `server.py` (`python3`, je součástí SteamOS) na portu 47098 a
Chromium v režimu kiosku s povoleným zvukem bez kliknutí. Log je v `~/.cache/hokej98.log`.
Najde i Google Chrome, Brave nebo Edge (flatpak), případně Firefox (tam ale zvuk může začít až
po stisku klávesy).

## Na mobilu / tabletu

Hra má dotykové ovládání: virtuální páčka vlevo (kdekoli na levé polovině displeje), vpravo tlačítka
A / B / X / Y jako na gamepadu, SPRINT, STŘÍDÁNÍ, ZOOM a pauza. Objeví se po prvním dotyku a zmizí,
jakmile použiješ gamepad nebo klávesnici. Telefon drž na šířku. Na telefonu se automaticky použije
grafika STŘEDNÍ (jde změnit v Nastavení).

## Na počítači

Spusť `./hokej.sh`, nebo ve složce hry `python3 -m http.server 47098` a otevři
<http://127.0.0.1:47098/>. (Přímé otevření `index.html` z disku nefunguje — prohlížeč z `file://`
nenačte JavaScriptové moduly.) Funguje gamepad i klávesnice:

- **Klávesnice 1:** WASD, J = A, K = X, L = B, I = Y, Mezerník = sprint, Esc = pauza
- **Klávesnice 2:** šipky, Num1 = A, Num2 = X, Num3 = B, Num5 = Y, Num0 = sprint, Enter = pauza

## Ovládání (Xbox rozložení)

| | S pukem | Bez puku |
|---|---|---|
| Levá páčka | bruslení | bruslení |
| RT / RB | sprint | sprint |
| A | přihrávka ve směru páčky | přepnout hráče / „přihraj mi" |
| X | střela — ťuknutí = zápěstí, držení = příklep | bodyček |
| B | klička | šťouchnutí holí |
| Y | lobovaná přihrávka / nahození | přepnout hráče |
| LB | střídání formace | střídání formace |
| View (Back) | zoom kamery | zoom kamery |
| Menu | pauza | pauza |

- **Střídání:** LB pošle formaci na střídačku, nastoupí nejodpočatější. Energii formací ukazuje
  panel hráče vlevo dole (F1–F3). Počítač střídá vždy sám.
- **Golfák z první:** zmáčkni X, zatímco k tobě letí přihrávka.
- **Míření:** páčka do strany při vystřelení = levá/pravá tyč (bez míření střílí hráč sám k volnější tyči).
- Páčka vždy odpovídá obrazovce: nahoru = nahoru po ledě. Domácí útočí v 1. a 3. třetině nahoru, ve 2. dolů (hosté naopak).
- **Buly:** zmáčkni A nebo X přesně ve chvíli, kdy puk dopadne na led.

## Rolba

O přestávce mezi třetinami vyjíždí rolba. V Nastavení → *Rolba o přestávce* zvolíš:
- **AUTOMATICKY** – led se uklidí sám (na obrazovce přestávky můžeš i tak stisknout **Y** a řídit ji),
- **ŘÍDÍM SÁM** – rolba vyjede a řídíš ji ty: páčka/D-pad = směr jízdy, **B** (nebo START) = hotovo.
  Kondicionér vzadu smaže stopy bruslí pod sebou, ukazatel ukazuje, kolik procent ušlapaného ledu
  je uklizeno. Co neuklidíš, zůstane na ledě i v další třetině,
- **VYPNUTÁ** – led se celý zápas neuklízí.

## Nastavení

Nastavení je rozdělené do karet (přepínání **LB / RB**, na klávesnici Q / E): **Obraz** (kamera, zoom, grafika, celá obrazovka, jmenovka,
záznam po gólu, FPS), **Zvuk** (hlasitost, komentář), **Hra** (obtížnost, střídání, fauly, zranění,
rolba), **Týmy** (vlastní názvy) a **Aktualizace** (verze, kontrola, instalace, automatika).

V menu *Exhibice*: domácí a hosté (karty s hodnocením týmu, **Y = soupiska** se statistikami všech
hráčů), délka třetiny, obtížnost (lehká / normální / těžká / legenda), střídání (automaticky / ručně).

V Nastavení dále: kamera (seshora / z boku),
zoom (5 úrovní, ve hře i tlačítkem LB), kvalita grafiky (vysoká = zrcadlení ledu a ostré stíny,
střední, nízká — pokud by hra na zařízení trhala), hlasitost, hlasový komentář
(systémová syntéza řeči — pokud v systému není, hra je prostě bez komentáře), záznam po gólu.

## Kariéra

V hlavním menu **KARIÉRA** převezmeš jeden z 32 klubů a vedeš ho sezónu po sezóně (pozice se ukládá
do prohlížeče, rozehranou kariéru jde kdykoli načíst).

- **Liga:** tvoje konference — 16 týmů, dvoukolově každý s každým (30 kol). Výhra 3 body, výhra po prodloužení
  či nájezdech 2, prohra po prodloužení 1. Tabulka, výsledky kola a statistiky střelců.
- **Play-off:** nejlepších 8 hraje na 2 vítězné zápasy (1–8, 4–5, 2–7, 3–6), pavouk až do finále.
- **Pohár:** vyřazovací pohár 8 týmů, kola se hrají mezi ligovými koly (po 10., 20. a 30. kole); losuje se z celé soutěže, i z druhé konference.
- **Zápasy** odehraješ sám (všechny připojené ovladače hrají za tvůj tým, soupeř je počítač)
  nebo je necháš **simulovat**; jde i „simulovat do konce sezóny“.
- **Soupiska a sestava:** přeskládání formací (A prohodí dva hráče, Y seřadí automaticky).
- **Přestupy:** přestupní okno je otevřené do 23. kola, kupovat jde od všech 31 klubů. Hráče koupíš výměnou za svého hráče
  na stejném postu plus doplatek z rozpočtu; počítačové týmy přestupují mezi sebou, nabízejí
  se i volní hráči. Rozpočet roste z diváků na domácích zápasech a z prémií za umístění.
- **Zranění:** zraněný hráč vynechá podle typu zranění 1–14 zápasů (natažený sval, otřes mozku,
  zranění kolena, zlomené zápěstí…). Zranění vznikají v odehraných i simulovaných zápasech, jsou
  vidět na soupisce, v přehledu klubu a ve zprávách. Místo zraněného se formace posunou a díru
  zaplní junior z farmy.
- **Mezi sezónami** hráči stárnou: mladí se zlepšují, starší ztrácejí, nad 35 let končí
  a nahradí je junioři. Zprávy shrnují přestupy, ocenění a historii vítězů.

## Komentátor

Komentář je předem namluvený neuronovým českým hlasem **Piper „jirka“** (licence CC0) — 224 hlášek
včetně jmen hráčů a měst, uložených v `sounds/voice/`. Hra je skládá dohromady („Vyloučení! — Novák —
hákování“), takže funguje i bez systémové hlasové syntézy (ta na SteamOS chybí). Hlášky se dají
přegenerovat skriptem `tools/gen_voice.py` (potřebuje `pip install piper-tts`, ffmpeg a model hlasu).
U vlastních názvů týmů z editoru komentátor město vynechá.

## Postavy a pohyby

Hráči jsou postava **Universal Base Character** od Quaternius (CC0) s dresem a výstrojí
(objemné kalhoty, chrániče holení a kolen, ramenní a loketní chrániče, helma, brusle). Střely a oslavy
používají **skutečné pohyby z motion capture** (CMU Graphics Lab Motion Capture Database,
mocap.cs.cmu.edu, převedené na tuto postavu sadou codepawl/cmu-mocap-glb): příklep a švih podle
golfového švihu, oslava gólu podle „high five“. Bruslení, buly a vedení puku jsou dopočítávané
(volný záznam bruslení neexistuje). Soubor `models/player.glb` = postava + klipy.

## Zdroje

- 3D engine: [Three.js](https://threejs.org) (MIT, `lib/THREE-LICENSE`).
- Model postavy: „X Bot“ z [Mixamo](https://www.mixamo.com) (Adobe), převzatý z ukázek Three.js
  (`models/xbot.glb`). Výstroj, barvy dresů a animace bruslení jsou dělané kódem ve hře.
