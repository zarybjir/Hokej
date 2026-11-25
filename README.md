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

**Reakce počítače:** hráči počítače reagují se zpožděním podle obtížnosti (Legenda 0,07 s, Těžká 0,10 s,
Normální 0,14 s, Lehká 0,20 s, Dětská 0,32 s); klička je zmate na další zlomek sekundy.

**Bruslení a souboje:** bruslení má setrvačnost: v rychlosti se zatáčí po oblouku (čím rychleji,
tím širší), proti směru jízdy hráč brzdí smykem, z místa se rozjíždí přímo; obratnější hráč (rychlost
a přesnost) brzdí, zrychluje a zatáčí o kousek lépe. Hráči se dostanou do skutečného kontaktu
(rameno na rameno); srážky a bodyčeky jsou cítit — **vibrace ovladače** (Nastavení → Zvuk) a lehký
**otřes obrazu** (Nastavení → Obraz), obojí jde vypnout.

**Taktika formací:** v pauze (START → *Taktika formací*) nastavíš každé lajně taktiku a platí hned:
*obranná* (útočníci se vracejí, nenapadá se hluboko, víc blokovaných střel, šetří síly – méně gólů na obou
stranách), *vyvážená*, *útočná* (napadání ve dvou, obránci u modré – víc gólů, ale i víc protiútoků, víc
únavy). Počítač volí taktiku podle povahy klubu. V Nastavení → Hra je i **agresivita soupeře**
(nízká / normální / vysoká) a **ofsajd** (pravidlo jde vypnout; počítač ho dodržuje – drží se před modrou
a nenahrává do pásma na hráče, kteří tam už stojí) a **zakázané uvolnění** (odložený icing: puk vyhozený zpoza červené
čáry přes brankovou čáru soupeře → čárový rozhodčí zvedne ruku („ICING?") a píská se, až když se puku
dotkne bránící hráč v poli; dotkne-li se ho dřív útočník provinilého týmu nebo brankář, icing se ruší.
Pak vhazování u vlastní branky a provinilý tým nesmí střídat; v oslabení je vyhození povolené; počítač
z vlastní poloviny nenahazuje). Icing jde přepnout na **okamžitý** (píská se hned) nebo vypnout.

**Prodloužení a nájezdy:** při remíze po 3. třetině se hraje prodloužení na první gól — **3 na 3**
(vyloučení soupeře = 4 na 3), 5 na 5, nebo žádné. Když nerozhodne, jedou se **nájezdy** (3 série, pak
náhlá smrt). Při nájezdu řídíš střelce (páčka, X střela, B klička); když bráníš, řídíš brankáře
(páčka = postavení, vyjetí proti střelci, X = vypíchnutí puku). Vše v Nastavení → Hra.

**Trestné střílení:** faul zezadu (napadení, hákování, podrážení, sekání) na hráče v samostatném
úniku znamená trestné střílení místo vyloučení. Řídíš střelce, nebo brankáře jako u nájezdů.

**Střely a buly:** střela „přes tělo" na straně bez hole je **bekhend** (slabší a méně přesná, ale zblízka
zaskočí brankáře). Na buly rozhoduje načasování; páčka k soupeřově brance při stisku = vyhrát puk dopředu
na střelu. Vyrovnané buly občas skončí **vázáním** a volným pukem. Domácí mají **poslední střídání**:
počítač jako domácí pošle proti tvé 1. formaci svou nejlepší.

**X-faktory a forma:** nejlepší hráči (atribut 88+, brankář 84+) mají jednu mírnou schopnost
(★ ostrostřelec, tvůrce hry, silák, rychlík, zeď). Forma (▲▼) mění výkon o ±2 %; v kariéře ji
zvedají body v zápasech.

**Hůl a kontakt:** šťouchnutí (B) a zvednutí hole (LT + B) míří na puk, pokud je před tebou, a zásah
se vyhodnotí až ve chvíli, kdy čepel doopravdy dorazí — puk vypíchneš, jen když na něj hůl dosáhne.
Hákování, podražení a sekání se pískají jen tehdy, když hůl zasáhne tělo soupeře. Při příklepu puk
leží na místě a odletí až při úderu hole.

**Zlomená hůl:** při tvrdém příklepu může prasknout hokejka (asi jednou za tři zápasy). Puk jen
odskočí a hráč je 6 s bez hole: nemůže sebrat puk ani šťouchat, bodyček mu zůstává.

**Střídání s pukem:** když se střídá formace a ty vedeš puk, hráč zůstává tvůj, dokud nepřihraješ
nebo o puk nepřijdeš. Těsně po střele nebo přihrávce se X nepočítá jako bodyček.

**Odebírání puku:** proti počítači má tvoje hůl o něco delší dosah a šťouchnutí i střet tělem vyšší
šanci na zisk puku — nejvíc na Dětské a Lehké, na Normální znatelně, na Legendu vůbec. Počítač tuhle
pomoc nemá.

**Odezva a cit v ovládání:** tvrdý hit, tyčka a těžký zákrok na okamžik zastaví hru a trhnou kamerou
(vypneš s otřesy obrazu), gól padá zpomaleně, za rychlým pukem je stopa. Nad hráčem, který napřahuje,
je ukazatel síly střely. Střela se míří páčkou plynule (do stran, k brance nahoru, od branky po ledě).
Stisk X nebo A těsně před dopadem přihrávky na hůl dá přesnější a tvrdší střelu či přihrávku z první
(„PŘESNĚ!"). **Sprint** je zásoba na 2,5 s, která se sama dobíjí (modrý ukazatel vedle energie).
Páčka proti směru jízdy udělá ostré zastavení a rychlý výpad novým směrem.

**Soupeř s povahou:** každý tým má herní styl (tvrdá hra, kombinace, obrana a brejky, útok) – je vidět
na kartě týmu. Hvězdy hrají podle svého typu (ostrostřelec pálí z první, silák dohrává, rychlík jede do
brejku). Počítač pod tlakem kazí přihrávky, při prohře ve třetí třetině riskuje, těsné vedení brání
a po tvrdém hitu na svého hráče to chvíli vrací. **Momentum** (proužek pod zkratkou týmu) roste po gólu,
hitech a zákrocích; tým na vlně je nepatrně rychlejší a jeho brankář jistější. Při přerušení se přehraje
záznam tvrdého hitu, zákroku nebo tyčky a komentátor hlásí hattrick, vyrovnání či poslední minutu.

**Statistiky zápasu:** v pauze nebo na konci zápasu (Y) — mapa střel obou týmů, čas na ledě, +/−,
střely, úspěšnost na buly, zblokované střely, přesilovky.

**Odvolání brankáře:** počítač odvolá brankáře na konci zápasu, když prohrává o 1–2 góly, a při
odloženém vyloučení soupeře. Ty v pauze zvolíš *ODVOLAT BRANKÁŘE* (a *VRÁTIT BRANKÁŘE*): brankář dojede
na střídačku a naskočí šestý hráč. Hráč s volnou dráhou střílí do prázdné branky i z dálky.

**Hra u branky a u mantinelu:** po střele najíždí centr na dorážku, spoluhráč před brankou může střelu
**tečovat**, hráči v dráze střely dělají brankáři **clonu**. Volný puk u mantinelu znamená **souboj**
(rozhoduje síla, hmotnost a únava; mačkáním X/B pomůžeš). Hráč s pukem ho kryje tělem. Počítač
nahazuje puk po mantinelu a předvídá, kam puk objede (obránce mu jede naproti za branku).
Spoluhráči se nabízejí do volných míst, kam vede průchozí přihrávka. **Přihrávky** podle atributu
PŘE: šikovnější hráč přesněji nahraje do běhu, naslepo za záda a na dálku. **Tlak v pásmu:** když
tým dlouho drží puk v útočném pásmu, bránící hráči se rychleji unavují.

**Režimy:** *Exhibice* (5 na 5 nebo **3 na 3**), *Kariéra*, *Trénink* (střelba a přihrávky bez soupeřů,
přesilovka 5 na 4, nájezdy jako střelec nebo brankář) a *Výzvy* — 24 úspěchů (hattrick, čisté konto,
obrat, gól v oslabení, nájezdy, mistr ligy…), ukládají se v zařízení.

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

## Fotbal (malá kopaná 5+1)

V hlavním menu je nahoře **FOTBAL**, pod ním **HOKEJ**. Fotbal se hraje ve stejné hale na trávníku
uvnitř mantinelů: 5 hráčů v poli a brankář, dva poločasy, stejné týmy a soupisky jako v hokeji
(střídá se po pětkách jako v hokeji).

- **Pravidla:** míč za postranní čárou = aut (rozehrává se nohou), za brankovou čárou roh nebo kop
  od branky, po gólu výkop. Faul = volný kop, ve vápně penalta. Žlutá a červená karta – po červené
  (nebo dvou žlutých) hraje tým do konce zápasu v oslabení. Při remíze prodloužení na první gól, pak penalty.
- **Ovládání s míčem:** A přihrávka, Y vysoký míč, X střela (drž = rána, páčkou míříš), B klička,
  pravá páčka vede míč. **Bez míče:** X odebrání ve stoje, B skluz (do hráče = faul, zezadu karta),
  LT obranný postoj.
- **Počasí** (volba před zápasem): JASNO, DÉŠŤ nebo NÁHODNĚ. Za deště se na hřišti postupně dělají
  kaluže, které brzdí míč na zemi, a při přerušení občas vyroste krtinec – míč se od něj odrazí
  jinam a nadskočí.
- **Pohyb hráčů:** běh, klus a kop jdou po drahách ze skutečného motion capture (CMU, klipy
  09_01, 16_35 a 10_01 ze sady codepawl/cmu-mocap-glb); skluz a zákroky brankáře jsou dopočítané.
- Kariéra, trénink a výzvy jsou zatím jen hokejové.

## Vodní pólo

Třetí položka menu. Hraje se v bazénu ve stejné hale, 5 hráčů v poli a brankář (zjednodušeně – skutečné
pólo má 6+1), čtyři čtvrtiny, při remíze pětimetrové hody.

- **Útočný čas 30 s** (ukazatel ÚTOK pod skóre) – kdo do té doby nevystřelí, ztrácí míč.
- **Fauly:** běžný faul = volný hod, hrubý nebo zezadu = vyloučení na 20 s, faul na hráče s míčem
  před brankou může být pětimetrový hod.
- **Ovládání** jako ve fotbale, jen přihrávky jdou vždy vzduchem a místo skluzu je výpad po míči (X/B).

## Curling

Čtvrtá položka menu. Každý tým má v endu 8 kamenů, hází se střídavě; bod za každý kámen blíž středu
kruhů, než je nejlepší kámen soupeře. Kdo end prohraje, má v dalším výhodu posledního kamene (tečka
u názvu týmu). Počet endů se řídí položkou POČET ENDŮ, při remíze se hraje dodatečný end.

1. **Míření:** levou páčkou posouváš koště skipa (kam má kámen dojet), Y / LB / RB mění rotaci –
   kámen se ke konci dráhy stáčí. Čárkovaná čára ukazuje dráhu při síle „do domu“.
2. **Síla:** A zastaví běžící ukazatel – STRÁŽ (před kruhy), DO DOMU, VYRAŽENÍ.
3. **Zametání:** po odhodu drž X – kámen dojede dál a méně zatáčí.

Při hodu počítače můžeš držet A a čekání zrychlit.
Curling se vždy hraje z pohledu shora za kamenem (nastavení kamery se ho netýká).

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
| A | přihrávka ve směru páčky (páčka dozadu = nechat puk spoluhráči za sebou) | přepnout hráče / „přihraj mi" / A během přihrávky k tobě = přihrávka z první |
| LT + A | přihrávka o mantinel | |
| X | střela — ťuknutí = zápěstí, držení = příklep; páčka od branky = placka k ledu | bodyček (vestoje = bokem) |
| LT + X | švihovka pod víko | lehnout do střely |
| B | klička | šťouchnutí holí |
| LT + B | | zvednout soupeři hokejku |
| Y | lobovaná přihrávka / nahození | přepnout hráče |
| Pravá páčka | vedení puku: do strany, před sebe, k tělu (soupeř na krytý puk hůř dosáhne) | |
| drž LT | | obranný postoj: hráč se otočí čelem k puku, couvá (pomaleji) a jistěji odebírá puk |
| Pravá páčka bez puku | | obranný postoj čelem zvoleným směrem |
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
rolba), **Ovládání** (podmenu *Hráč 1 / Hráč 2 – ovladač* a *– klávesnice*: přemapování všech akcí i směrů,
zachytává se jen tlačítko z vybraného ovladače; *Test ovladačů* ukáže, co hra z ovladače čte;
nestandardní ovladače dostanou výchozí linuxové rozložení),
**Týmy** (vlastní názvy) a **Aktualizace** (verze, kontrola, instalace, automatika).

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
- **Soupiska a sestava:** přeskládání formací (A prohodí dva hráče, Y seřadí automaticky), X zvolí
  **kapitána** (na ledě mírně pomáhá při vhazování). Náhradníci a draftovaní hráči jsou na **farmě**.
- **Smlouvy a platy:** každý hráč má plat a smlouvu na 1–3 roky; výplaty týmu musí zůstat pod
  **platovým stropem 55 mil. Kč** (hlídá se i při přestupech). Hráči v posledním roce smlouvy
  prodloužíš (X o rok, Y o 3 roky), jinak v létě odejdou mezi volné hráče.
- **Draft:** po sezóně si vybereš jednoho z mladíků (18–19 let) s potenciálem A–D; slabší tým
  vybírá dřív.
- **Vývoj během sezóny:** třikrát za sezónu se mladí hráči zlepšují (víc ti, kdo hrají v 1.–2. formaci,
  a jen do svého potenciálu), veteráni nad 32 let pomalu ztrácejí.
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

Komentář je předem namluvený neuronovým českým hlasem **Piper „jirka“** (licence CC0) — 249 hlášek
včetně jmen hráčů a měst, uložených v `sounds/voice/`. Hra je skládá dohromady („Vyloučení! — Novák —
hákování“), takže funguje i bez systémové hlasové syntézy (ta na SteamOS chybí). Hlášky se dají
přegenerovat skriptem `tools/gen_voice.py` (potřebuje `pip install piper-tts`, ffmpeg a model hlasu).
U vlastních názvů týmů z editoru komentátor město vynechá.

Výchozí je **anglický komentátor** (hlas Piper „joe“, CC0, `sounds/voice-en/`) — má živější intonaci než
český hlas. Češtinu zapneš v Nastavení → Zvuk → *Jazyk komentáře*. Anglické hlášky se generují
`python3 tools/gen_voice.py en_US-joe-medium.onnx en`.

## Postavy a pohyby

Hráči jsou postava **Universal Base Character** od Quaternius (CC0) s dresem a výstrojí
(objemné kalhoty, chrániče holení a kolen, ramenní a loketní chrániče, helma, brusle). Střely a oslavy
používají **skutečné pohyby z motion capture** (CMU Graphics Lab Motion Capture Database,
mocap.cs.cmu.edu, převedené na tuto postavu sadou codepawl/cmu-mocap-glb): příklep a švih podle
golfového švihu, oslava gólu podle „high five“. Bruslení, buly a vedení puku jsou dopočítávané
(volný záznam bruslení neexistuje). Soubor `models/player.glb` = postava + klipy.

## Vývoj a testy

Herní logika je v `js/game.js` (jádro) a `js/game-*.js` (sestavy, pravidla, akce, fyzika, AI, průběh zápasu).
Testy se pouštějí bez instalace čehokoli: `node tests/run.js` (logika, asi 20 s) a volitelně
`node tests/browser.js` (potřebuje Playwright). Pokyny pro úpravy jsou v `CLAUDE.md`.

## Zdroje

- 3D engine: [Three.js](https://threejs.org) (MIT, `lib/THREE-LICENSE`).
- Model postavy: „X Bot“ z [Mixamo](https://www.mixamo.com) (Adobe), převzatý z ukázek Three.js
  (`models/xbot.glb`). Výstroj, barvy dresů a animace bruslení jsou dělané kódem ve hře.
- Písmo menu: **Barlow Condensed** (The Barlow Project Authors, licence SIL OFL 1.1 – `fonts/OFL.txt`).
