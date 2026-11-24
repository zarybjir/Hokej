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
4. **Nečti celé velké soubory.** `js/game.js` (~120 kB), `js/render3d.js`, `js/career.js` a `js/app.js`
   jsou velké – grepni název metody a čti jen okolí (Read s offset/limit).
5. **Nikdy nečti** `lib/` (přibalené Three.js), `models/*.glb`, `models/player.glb.b64.txt`
   ani `sounds/` – jsou to binárky nebo cizí kód. Seznam hlášek komentátora je v `sounds/voice/manifest.json`.
6. Když zadání jde udělat jednodušeji, než bylo popsáno, řekni to dřív, než začneš psát.

## Struktura

- `index.html` – jen canvasy a importmap; `js/boot.js` načte Three.js (ES moduly → `window.THREE`,
  `window.PP`…) a pak **klasické skripty v pořadí**:
  `util, data, audio, input, game, led, render, touch, render3d, players3d, career, ach, update, app`.
  Skripty nejsou moduly: všechno je globální (`'use strict'`, top-level `const`/`function`).
  Nový soubor = přidat ho do pole `files` v `boot.js` na správné místo.
- `js/game.js` – herní logika: `class Player`, `class Game` (fyzika bruslení `PH`, puk, střely,
  bodyčeky, fauly/tresty/zranění, střídání, buly, brankáři, AI `teamThink`/`aiSkater`/`aiCarrier`),
  obtížnosti `DIFF`.
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

Souřadnice hry: x podél kluziště, y napříč, z nahoru, jednotky **stopy**; render3d je převádí na three.js (x, z, −y).

## Ukládání (localStorage)

Klíče: `hokej98` (Settings), `hokej98-career2` (kariéra), `hokej98-ach` (úspěchy), `TeamNames.KEY`.
Při změně formátu uložených dat zachovej zpětnou kompatibilitu (doplň chybějící pole výchozí hodnotou),
ať hráčům nezmizí rozehraná kariéra. Přístup vždy v `try/catch` jako ve stávajícím kódu.

## Spuštění a ověření

- `python3 server.py 47098` a otevřít `http://127.0.0.1:47098/index.html` (z `file://` se skripty nenačtou).
- Po změně ověř aspoň načtení bez chyb v konzoli (Playwright/Chromium) a že se dá spustit zápas.
- Syntaxi rychle zkontroluješ `node --check js/<soubor>.js`.

## Vydání verze

- Při vydání zvyš `build` a `version` ve `version.json`, nastav `date` a do `notes` dej 2–4 krátké
  české body. Podle toho hra nabízí aktualizaci (větev `main`).
- Commit ve stylu `1.44: krátký popis změn`.
- Když přibude nebo se změní funkce viditelná pro hráče, uprav i `README.md` (je česky).

## Styl

- Texty ve hře, komentáře v kódu, README i commity česky.
- Drž se stávajícího stylu: krátké názvy, kompaktní kód, sekce oddělené `// ---------- název ----------`.
