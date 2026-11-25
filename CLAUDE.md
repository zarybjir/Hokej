# Hokej '98 – pokyny pro Claude

Arkádový 3D hokej v prohlížeči (Three.js, WebGL, Gamepad API). Bez build kroku a bez npm.
Cíl: Steam Deck / Legion Go S (SteamOS, Chromium v kiosku), funguje i na mobilu (dotyk).

## Jak pracovat (šetři kód i tokeny)

1. **Než něco napíšeš, najdi, jestli to už neexistuje.** Grepni název nebo podobnou funkci.
   Pomocné funkce jsou v `js/util.js` (`clamp`, `lerp`, `rand`, `pick`, `angDiff`, `mulberry32`,
   `segDist`, `rinkContact`…), týmy a soupisky v `js/data.js` (`buildRoster`, `teamRatings`, `natOf`).
2. **Nejmenší změna, která funguje.** Žádné refaktory, přejmenovávání ani „úklid“, o které nikdo
   nežádal. Nepřidávej abstrakce pro jedno použití.
3. **Žádné nové závislosti ani build nástroje.** Hra musí běžet offline jen ze složky repa.
4. **Nečti celé velké soubory.** `js/render3d.js`, `js/career.js`, `js/app.js` a soubory `js/game*.js`
   jsou velké – grepni název metody a čti jen okolí (Read s offset/limit). Herní logika je rozdělená
   podle oblastí (viz Struktura), otevři jen soubor, kterého se změna týká.
5. **Nikdy nečti** `lib/` (přibalené Three.js), `models/*.glb`, `models/player.glb.b64.txt`
   ani `sounds/` – jsou to binárky nebo cizí kód. Seznam hlášek komentátora je v `sounds/voice/manifest.json`.
6. Když zadání jde udělat jednodušeji, než bylo popsáno, řekni to dřív, než začneš psát.

## Struktura

- `index.html` – jen canvasy a importmap; `js/boot.js` načte Three.js (ES moduly → `window.THREE`,
  `window.PP`…) a pak **klasické skripty v pořadí**:
  `util, data, audio, input, game, game-lines, game-rules, game-actions, game-physics, game-ai, game-flow,
  football, waterpolo, curling, led, render, touch, render3d, players3d, career, ach, update, app`.
  Skripty nejsou moduly: všechno je globální (`'use strict'`, top-level `const`/`function`).
  Nový soubor = přidat ho do pole `files` v `boot.js` na správné místo.
- `js/game.js` – jádro hry: konstanty (`DIFF`, `PH`), `class Player`, `class Game` (konstruktor, hlavní
  smyčka `update`/`step`, vstupy lidských hráčů a asistence). Zbytek třídy `Game` je v souborech
  `game-*.js`; každý volá `gameMixin(class { … })` a jeho metody se zkopírují na `Game.prototype`:
  - `game-lines.js` – sestavy, střídání formací, odvolání brankáře
  - `game-rules.js` – fauly a vyloučení, zranění, rozhodčí, buly, icing, ofsajd
  - `game-actions.js` – přihrávky, střely, hůl (šťouchnutí, zvednutí), bodyčeky
  - `game-physics.js` – bruslení a srážky, brankáři, puk
  - `game-ai.js` – AI (`teamThink`, `aiSkater`, `aiCarrier`), tlak v pásmu, souboje u mantinelu
  - `game-flow.js` – přerušení, góly, třetiny, rolba, trestné střílení, nájezdy, stav ledu
  Nová metoda `Game` patří do souboru podle oblasti, ne do `game.js`.
- `js/football.js` – malá kopaná 5+1: `class Football extends Game` přepisuje jen to, co se liší (rozehrání
  místo buly, auty/rohy/kopy od branky, skluzy, fauly a karty, penalty, poločasy). Sport nastavuje
  `applySport()` v `game.js` (fyzika `PH`, rozměr branky v `RINK`); v jádře je odlišné chování za `this.fb`.
  Ve 3D přepíná `G3.setSport()` (trávník, branky, míč) a `HModel` podle `SPORT` (dres, běh `poseFoot`).
  Změna společného jádra se musí ověřit pro všechny sporty (testy pokrývají hokej, fotbal i pólo).
- `js/waterpolo.js` – `class WaterPolo extends Football`: čtvrtiny (`q`), útočný čas (`sc`), vyloučení na 20 s,
  přihrávky vzduchem. `this.fb` je pravda i pro pólo; rozdíly jsou za `this.sport === 'polo'`.
- `js/curling.js` – `class Curling` stojí samostatně (není to `Game`), pro `App`, `R` a `G3` jen nabízí stejné
  rozhraní (`teams`, `all`, `puck` jako cíl kamery, `state`, `update`, `confirm`); pozná se podle `g.curl`.
  Fyzika kamene je v `curlStep`, konstanty v `CURL`. Kreslí ho `R.drawCurling` a `G3.paintCurl`/`buildStones`.
- `js/app.js` – objekt `App`: obrazovky, menu, nastavení, hlavní smyčka (start na konci souboru).
- `js/career.js` – objekt `Career`: liga, pohár, play-off, přestupy, smlouvy, draft, vývoj; obrazovky kariéry od sekce „obrazovky kariéry“.
- `js/render3d.js` – `G3`: Three.js scéna, kluziště, kamera (`ZOOMS`), grafika (`GFX`).
- `js/players3d.js` – 3D modely hráčů, výstroj, IK a procedurální animace.
- `js/render.js` – 2D vrstva (HUD, menu, popisky); `js/led.js` – LED font a displej.
- `js/audio.js` – `Sfx` (WebAudio syntéza) + skládání komentáře z MP3.
- `js/input.js` – gamepady + klávesnice, mapování; `js/touch.js` – dotykové ovládání.
- `js/ach.js` – úspěchy; `js/update.js` – kontrola/instalace aktualizací přes `server.py`.
- `server.py` + `hokej.sh` – lokální server (port 47098) a spouštěč pro SteamOS, aktualizace z GitHubu.
- `tools/gen_voice.py` – přegenerování hlášek komentátora (Piper TTS).
- `tools/bake_moves.js` – převod klipů motion capture na `models/moves.json` (dráhy chodidel, rukou a pánve
  pro běh, klus a kop; používá je `HModel.poseFoot`, klouby dopočítá IK). Počasí ve fotbale: `Football.groundFx`,
  `G3.syncWeather`.
- `tests/` – automatické testy (`run.js` logika v Node, `browser.js` Playwright, `lib.js` zavaděč).

Souřadnice hry: x podél kluziště, y napříč, z nahoru, jednotky **stopy**; render3d je převádí na three.js (x, z, −y).

## Ukládání (localStorage)

Klíče: `hokej98` (Settings), `hokej98-career2` (kariéra), `hokej98-ach` (úspěchy), `TeamNames.KEY`.
Při změně formátu uložených dat zachovej zpětnou kompatibilitu (doplň chybějící pole výchozí hodnotou),
ať hráčům nezmizí rozehraná kariéra. Přístup vždy v `try/catch` jako ve stávajícím kódu.

## Spuštění a ověření

- `python3 server.py 47098` a otevřít `http://127.0.0.1:47098/index.html` (z `file://` se skripty nenačtou).
- **Po každé změně herní logiky spusť `node tests/run.js`** (asi 20 s, bez prohlížeče a bez npm): zápasy
  počítač × počítač s kontrolou rozumných čísel, prodloužení, nájezdy, odvolání brankáře, trestné
  střílení, trénink, icing, ofsajd, šťouchnutí, mapování ovladače, kariéra a starší uložené pozice.
  Jeden test pustíš filtrem: `node tests/run.js nájezdy`.
- Po změně menu, vykreslování nebo vstupu spusť i `node tests/browser.js` (potřebuje Playwright
  s Chromiem; načte hru, projde obrazovky a odehraje zápas s náhodným ovládáním, hlídá chyby v konzoli).
- **Když opravíš chybu nebo přidáš pravidlo, přidej k tomu test** do `tests/run.js`, ať se chyba nevrátí.
  Testy používají pevný seed náhody (`tests/lib.js`), takže jsou opakovatelné.
- Syntaxi rychle zkontroluješ `node --check js/<soubor>.js`.

## Vydání verze

- Při vydání zvyš `build` a `version` ve `version.json`, nastav `date` a do `notes` dej 2–4 krátké
  české body. Podle toho hra nabízí aktualizaci (větev `main`).
- Commit ve stylu `1.44: krátký popis změn`.
- Když přibude nebo se změní funkce viditelná pro hráče, uprav i `README.md` (je česky).

## Styl

- Texty ve hře, komentáře v kódu, README i commity česky.
- Drž se stávajícího stylu: krátké názvy, kompaktní kód, sekce oddělené `// ---------- název ----------`.
