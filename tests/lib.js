'use strict';
// ---------- Načtení herní logiky do Node (bez prohlížeče) ----------
// Skripty hry nejsou moduly, proto se spojí v pořadí z js/boot.js a vyhodnotí najednou.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

function load(seed = 12345) {
  // náhrady za prohlížeč
  const store = {};
  global.window = { addEventListener() {} };
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', getGamepads: () => [] }, writable: true, configurable: true });   // novější Node má navigator jen pro čtení
  global.performance = { now: () => Date.now() };
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  // opakovatelná náhoda: stejný seed = stejný průběh testů
  let a = seed >>> 0;
  Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const boot = fs.readFileSync(path.join(ROOT, 'js/boot.js'), 'utf8');
  const all = JSON.parse(boot.match(/const files = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const logic = all.filter((f) => !['led', 'render', 'touch', 'render3d', 'players3d', 'update', 'app'].includes(f));   // bez vykreslování
  const src = logic.map((f) => fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8').replace(/^'use strict';/, '')).join('\n');
  return (0, eval)("'use strict';" + src + '\n;({ Game, Football, WaterPolo, Cup, Curling, CURL, STONES, curlPath, curlV0, curlW, FB, Player, DIFF, RINK, PH, TEAMS, ROLES, Settings, Input, Career, Ach, ACH, pokeBlade, bladeOffset, rinkContact, plOvr, buildRoster, files: ' + JSON.stringify(all) + ' })');
}

// odehraje zápas počítač × počítač; each(g) se volá po každém snímku
function playGame(G, cfg, each, maxT = 4000) {
  const g = new G.Game({ humans: [], silent: true, periodLen: 120, ...cfg });
  for (let t = 0; g.state !== 'final' && t < maxT; t += 1 / 60) {
    g.update(1 / 60);
    if (g.state === 'periodEnd') g.nextPeriod();
    if (g.state === 'replay') g.endReplay();
    if (each) each(g);
  }
  return g;
}
// ovladač, který nic nemačká (pro „lidský“ tým v testech)
const idleDev = () => ({ st: { lx: 0, ly: 0, rx: 0, ry: 0 }, pressed: () => false });

module.exports = { ROOT, load, playGame, idleDev };
