'use strict';
// ---------- Týmy: města NHL v jejich barvách, přezdívky a znaky jsou vlastní ----------
// conf: 0 = Východ, 1 = Západ; div: divize; sym: symbol ve znaku
const TEAMS = [
  // Východ – Atlantická divize
  { city: 'Boston', name: 'Ironsides', abbr: 'BOS', c1: '#111111', c2: '#ffb81c', c3: '#ffffff', pants: '#111111', sym: 'anchor', conf: 0, div: 'ATLANTIC', off: 87, def: 89, gk: 88, spd: 84 },
  { city: 'Buffalo', name: 'Blizzard', abbr: 'BUF', c1: '#003087', c2: '#ffb81c', c3: '#ffffff', pants: '#003087', sym: 'flake', conf: 0, div: 'ATLANTIC', off: 85, def: 82, gk: 83, spd: 88 },
  { city: 'Detroit', name: 'Motors', abbr: 'DET', c1: '#ce1126', c2: '#ffffff', c3: '#111111', pants: '#ce1126', sym: 'gear', conf: 0, div: 'ATLANTIC', off: 86, def: 84, gk: 84, spd: 85 },
  { city: 'Florida', name: 'Barracudas', abbr: 'FLA', c1: '#c8102e', c2: '#041e42', c3: '#b9975b', pants: '#041e42', sym: 'fang', conf: 0, div: 'ATLANTIC', off: 89, def: 88, gk: 89, spd: 86 },
  { city: 'Montreal', name: 'Voyageurs', abbr: 'MTL', c1: '#af1e2d', c2: '#192168', c3: '#ffffff', pants: '#192168', sym: 'fleur', conf: 0, div: 'ATLANTIC', off: 85, def: 83, gk: 85, spd: 87 },
  { city: 'Ottawa', name: 'Centurions', abbr: 'OTT', c1: '#c52032', c2: '#111111', c3: '#c2912c', pants: '#111111', sym: 'helm', conf: 0, div: 'ATLANTIC', off: 86, def: 84, gk: 85, spd: 86 },
  { city: 'Tampa Bay', name: 'Mantas', abbr: 'TBM', c1: '#002868', c2: '#ffffff', c3: '#6cace4', pants: '#002868', sym: 'wave', conf: 0, div: 'ATLANTIC', off: 90, def: 85, gk: 90, spd: 84 },
  { city: 'Toronto', name: 'Northmen', abbr: 'TOR', c1: '#00205b', c2: '#ffffff', c3: '#a2aaad', pants: '#00205b', sym: 'leaf', conf: 0, div: 'ATLANTIC', off: 91, def: 84, gk: 85, spd: 87 },
  // Východ – Metropolitní divize
  { city: 'Carolina', name: 'Squalls', abbr: 'CAR', c1: '#ce1126', c2: '#111111', c3: '#ffffff', pants: '#111111', sym: 'storm', conf: 0, div: 'METRO', off: 87, def: 90, gk: 86, spd: 89 },
  { city: 'Columbus', name: 'Cannons', abbr: 'CBC', c1: '#002654', c2: '#ce1126', c3: '#ffffff', pants: '#002654', sym: 'star', conf: 0, div: 'METRO', off: 84, def: 83, gk: 83, spd: 86 },
  { city: 'New Jersey', name: 'Hellhounds', abbr: 'NJH', c1: '#ce1126', c2: '#111111', c3: '#ffffff', pants: '#111111', sym: 'flame', conf: 0, div: 'METRO', off: 88, def: 86, gk: 85, spd: 89 },
  { city: 'Long Island', name: 'Mariners', abbr: 'LIM', c1: '#00539b', c2: '#f47d30', c3: '#ffffff', pants: '#00539b', sym: 'anchor', conf: 0, div: 'METRO', off: 84, def: 87, gk: 88, spd: 83 },
  { city: 'New York', name: 'Knights', abbr: 'NYK', c1: '#0038a8', c2: '#ce1126', c3: '#ffffff', pants: '#0038a8', sym: 'crown', conf: 0, div: 'METRO', off: 88, def: 85, gk: 90, spd: 85 },
  { city: 'Philadelphia', name: 'Liberty', abbr: 'PHI', c1: '#f74902', c2: '#111111', c3: '#ffffff', pants: '#111111', sym: 'bell', conf: 0, div: 'METRO', off: 84, def: 85, gk: 83, spd: 86 },
  { city: 'Pittsburgh', name: 'Forgemen', abbr: 'PIT', c1: '#111111', c2: '#fcb514', c3: '#ffffff', pants: '#111111', sym: 'hammer', conf: 0, div: 'METRO', off: 87, def: 82, gk: 83, spd: 84 },
  { city: 'Washington', name: 'Eagles', abbr: 'WSH', c1: '#c8102e', c2: '#041e42', c3: '#ffffff', pants: '#041e42', sym: 'wing', conf: 0, div: 'METRO', off: 88, def: 86, gk: 86, spd: 85 },
  // Západ – Centrální divize
  { city: 'Chicago', name: 'Bisons', abbr: 'CHI', c1: '#cf0a2c', c2: '#111111', c3: '#ffffff', pants: '#111111', sym: 'horns', conf: 1, div: 'CENTRAL', off: 84, def: 81, gk: 83, spd: 87 },
  { city: 'Colorado', name: 'Yetis', abbr: 'COL', c1: '#6f263d', c2: '#236192', c3: '#a2aaad', pants: '#111111', sym: 'peak', conf: 1, div: 'CENTRAL', off: 91, def: 87, gk: 85, spd: 91 },
  { city: 'Dallas', name: 'Mustangs', abbr: 'DAL', c1: '#006847', c2: '#8f8f8c', c3: '#ffffff', pants: '#111111', sym: 'star', conf: 1, div: 'CENTRAL', off: 89, def: 89, gk: 89, spd: 86 },
  { city: 'Minnesota', name: 'Lumberjacks', abbr: 'MIN', c1: '#154734', c2: '#a6192e', c3: '#eaaa00', pants: '#154734', sym: 'tree', conf: 1, div: 'CENTRAL', off: 86, def: 87, gk: 86, spd: 85 },
  { city: 'Nashville', name: 'Outlaws', abbr: 'NSH', c1: '#ffb81c', c2: '#041e42', c3: '#ffffff', pants: '#041e42', sym: 'note', conf: 1, div: 'CENTRAL', off: 84, def: 85, gk: 87, spd: 84 },
  { city: 'St. Louis', name: 'Arches', abbr: 'STL', c1: '#002f87', c2: '#fcb514', c3: '#ffffff', pants: '#041e42', sym: 'arch', conf: 1, div: 'CENTRAL', off: 85, def: 85, gk: 84, spd: 85 },
  { city: 'Utah', name: 'Canyons', abbr: 'UTA', c1: '#6cace4', c2: '#111111', c3: '#ffffff', pants: '#111111', sym: 'peak', conf: 1, div: 'CENTRAL', off: 86, def: 84, gk: 85, spd: 87 },
  { city: 'Winnipeg', name: 'Aviators', abbr: 'WPG', c1: '#041e42', c2: '#004c97', c3: '#ac162c', pants: '#041e42', sym: 'jet', conf: 1, div: 'CENTRAL', off: 88, def: 86, gk: 91, spd: 85 },
  // Západ – Pacifická divize
  { city: 'Anaheim', name: 'Condors', abbr: 'ANA', c1: '#f47a38', c2: '#111111', c3: '#b9975b', pants: '#111111', sym: 'wing', conf: 1, div: 'PACIFIC', off: 84, def: 82, gk: 84, spd: 87 },
  { city: 'Calgary', name: 'Broncs', abbr: 'CGY', c1: '#c8102e', c2: '#f1be48', c3: '#111111', pants: '#111111', sym: 'flame', conf: 1, div: 'PACIFIC', off: 85, def: 85, gk: 85, spd: 85 },
  { city: 'Edmonton', name: 'Drillers', abbr: 'EDM', c1: '#041e42', c2: '#ff4c00', c3: '#ffffff', pants: '#041e42', sym: 'drop', conf: 1, div: 'PACIFIC', off: 92, def: 84, gk: 84, spd: 90 },
  { city: 'Los Angeles', name: 'Monarchs', abbr: 'LAM', c1: '#111111', c2: '#a2aaad', c3: '#ffffff', pants: '#111111', sym: 'crown', conf: 1, div: 'PACIFIC', off: 86, def: 88, gk: 86, spd: 84 },
  { city: 'San Jose', name: 'Comets', abbr: 'SJC', c1: '#006d75', c2: '#ea7200', c3: '#111111', pants: '#111111', sym: 'comet', conf: 1, div: 'PACIFIC', off: 83, def: 81, gk: 82, spd: 86 },
  { city: 'Seattle', name: 'Orcas', abbr: 'SEA', c1: '#001628', c2: '#99d9d9', c3: '#e9072b', pants: '#001628', sym: 'wave', conf: 1, div: 'PACIFIC', off: 85, def: 85, gk: 84, spd: 86 },
  { city: 'Vancouver', name: 'Tides', abbr: 'VAN', c1: '#00205b', c2: '#00843d', c3: '#ffffff', pants: '#00205b', sym: 'wave', conf: 1, div: 'PACIFIC', off: 87, def: 85, gk: 88, spd: 85 },
  { city: 'Las Vegas', name: 'High Rollers', abbr: 'LVR', c1: '#b4975a', c2: '#333f42', c3: '#c8102e', pants: '#333f42', sym: 'diamond', conf: 1, div: 'PACIFIC', off: 87, def: 88, gk: 87, spd: 86 },
];
const CONF_NAMES = ['VÝCHODNÍ KONFERENCE', 'ZÁPADNÍ KONFERENCE'];
// vlastní názvy týmů (editor v Nastavení) – ukládají se jen v tomto prohlížeči
const TEAM_DEFAULTS = TEAMS.map((t) => ({ city: t.city, name: t.name, abbr: t.abbr }));
const TeamNames = {
  KEY: 'hokej98-teams',
  load() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) {}
    TEAMS.forEach((t, i) => Object.assign(t, TEAM_DEFAULTS[i], o[i] || {}));
  },
  save() {
    const o = {};
    TEAMS.forEach((t, i) => { const d = TEAM_DEFAULTS[i]; if (t.city !== d.city || t.name !== d.name || t.abbr !== d.abbr) o[i] = { city: t.city, name: t.name, abbr: t.abbr }; });
    try { localStorage.setItem(this.KEY, JSON.stringify(o)); } catch (e) {}
  },
};
TeamNames.load();

// ---------- znak týmu (canvas, střed 0,0, velikost ~ 200 × 200) ----------
function emblemSymbol(g, sym) {
  const P = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  const C = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  switch (sym) {
    case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 26 : 62; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } P(pts); break; }
    case 'crown': P([[-60, 36], [-62, -34], [-32, 0], [0, -50], [32, 0], [62, -34], [60, 36]]); C(-62, -38, 9); C(0, -54, 10); C(62, -38, 9); break;
    case 'anchor': g.fillRect(-7, -48, 14, 96); g.fillRect(-34, -30, 68, 12); C(0, -54, 14);
      g.lineWidth = 14; g.strokeStyle = g.fillStyle; g.beginPath(); g.arc(0, 4, 48, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      P([[-58, 4], [-38, 20], [-60, 30]]); P([[58, 4], [38, 20], [60, 30]]); break;
    case 'flake': for (let k = 0; k < 6; k++) { g.save(); g.rotate(k * Math.PI / 3); g.fillRect(-6, -62, 12, 62); P([[0, -46], [-20, -60], [-16, -66], [0, -54], [16, -66], [20, -60]]); g.restore(); } C(0, 0, 14); break;
    case 'gear': for (let k = 0; k < 10; k++) { g.save(); g.rotate(k * Math.PI / 5); g.fillRect(-10, -62, 20, 22); g.restore(); } C(0, 0, 46); break;
    case 'fang': P([[-58, -40], [58, -40], [40, -24], [24, 40], [8, -24], [-8, -24], [-24, 40], [-40, -24]]); break;
    case 'fleur': C(0, -32, 18); P([[0, -66], [16, -30], [0, 30], [-16, -30]]); P([[-14, 0], [-60, -30], [-46, 8], [-14, 24]]); P([[14, 0], [60, -30], [46, 8], [14, 24]]); g.fillRect(-40, 22, 80, 12); P([[-10, 34], [10, 34], [0, 62]]); break;
    case 'helm': P([[-46, 50], [-50, -10], [-30, -46], [0, -56], [30, -46], [50, -10], [46, 50], [20, 50], [20, 0], [-20, 0], [-20, 50]]); P([[-6, -56], [6, -56], [10, -84], [-10, -84]]); break;
    case 'wave': for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-64, -30 + k * 30); for (let x = -64; x <= 64; x += 4) g.lineTo(x, -30 + k * 30 + Math.sin(x / 14 + k) * 12); g.lineTo(64, -16 + k * 30); for (let x = 64; x >= -64; x -= 4) g.lineTo(x, -16 + k * 30 + Math.sin(x / 14 + k) * 12); g.closePath(); g.fill(); } break;
    case 'leaf': P([[0, -66], [12, -34], [34, -44], [28, -14], [60, -12], [40, 8], [52, 22], [14, 18], [6, 40], [6, 62], [-6, 62], [-6, 40], [-14, 18], [-52, 22], [-40, 8], [-60, -12], [-28, -14], [-34, -44], [-12, -34]]); break;
    case 'storm': P([[-30, -60], [30, -60], [6, -14], [34, -14], [-24, 62], [-6, 6], [-34, 6]]); break;
    case 'flame': g.beginPath(); g.moveTo(0, 62); g.bezierCurveTo(-58, 50, -54, -6, -20, -30); g.bezierCurveTo(-20, -10, -8, 0, 0, 2); g.bezierCurveTo(-6, -30, 10, -50, 4, -70);
      g.bezierCurveTo(40, -44, 58, 0, 40, 30); g.bezierCurveTo(30, 52, 14, 60, 0, 62); g.fill(); break;
    case 'bell': g.beginPath(); g.moveTo(-50, 40); g.quadraticCurveTo(-40, 30, -38, -10); g.quadraticCurveTo(-34, -54, 0, -56); g.quadraticCurveTo(34, -54, 38, -10); g.quadraticCurveTo(40, 30, 50, 40); g.closePath(); g.fill(); C(0, 50, 12); g.fillRect(-6, -70, 12, 16); break;
    case 'hammer': g.save(); g.rotate(-0.6); g.fillRect(-8, -30, 16, 96); g.fillRect(-40, -56, 80, 30); g.restore(); break;
    case 'wing': for (let k = 0; k < 4; k++) P([[-60 + k * 4, -40 + k * 22], [60, -54 + k * 26], [50, -36 + k * 26], [-50 + k * 6, -24 + k * 22]]); break;
    case 'horns': g.beginPath(); g.ellipse(0, 10, 40, 46, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(-30, -14); g.quadraticCurveTo(-74, -20, -58, -66); g.quadraticCurveTo(-50, -36, -20, -32); g.fill();
      g.beginPath(); g.moveTo(30, -14); g.quadraticCurveTo(74, -20, 58, -66); g.quadraticCurveTo(50, -36, 20, -32); g.fill(); break;
    case 'peak': P([[-66, 50], [-24, -36], [-6, -8], [16, -56], [66, 50]]); break;
    case 'tree': P([[0, -66], [40, -14], [20, -14], [52, 26], [-52, 26], [-20, -14], [-40, -14]]); g.fillRect(-9, 26, 18, 32); break;
    case 'note': C(-24, 38, 20); C(34, 26, 20); g.fillRect(-10, -48, 12, 86); g.fillRect(48, -60, 12, 86); P([[-10, -48], [60, -60], [60, -40], [-10, -28]]); break;
    case 'arch': g.lineWidth = 18; g.strokeStyle = g.fillStyle; g.beginPath(); g.moveTo(-50, 56); g.quadraticCurveTo(0, -130, 50, 56); g.stroke(); break;
    case 'jet': P([[0, -66], [10, -30], [62, 6], [62, 18], [10, 4], [8, 40], [24, 54], [24, 62], [0, 56], [-24, 62], [-24, 54], [-8, 40], [-10, 4], [-62, 18], [-62, 6], [-10, -30]]); break;
    case 'drop': g.beginPath(); g.moveTo(0, -66); g.bezierCurveTo(30, -20, 46, 6, 46, 24); g.arc(0, 24, 46, 0, Math.PI); g.bezierCurveTo(-46, 6, -30, -20, 0, -66); g.fill(); break;
    case 'comet': C(28, -24, 30); P([[8, -2], [-66, 58], [4, -34]]); P([[12, 0], [-50, 64], [-2, 4]]); break;
    case 'diamond': P([[0, -64], [50, 0], [0, 64], [-50, 0]]); break;
    default: C(0, 0, 50);
  }
}
// obrázková loga týmů (gfx/logos/<zkratka>.png); kdo ho nemá, dostane kreslený kulatý znak
const LOGOS = {};
if (typeof Image !== 'undefined') for (const k of TEAMS.map((t) => t.abbr)) { const im = new Image(); im.onload = () => { LOGOS[k] = im; }; im.src = 'gfx/logos/' + k + '.png'; }
// kulatý znak: obruč s názvem města, uprostřed symbol
function drawEmblem(g, T, size) {
  if (LOGOS[T.abbr]) { const d = size * 1.12; g.drawImage(LOGOS[T.abbr], -d / 2, -d / 2, d, d); return; }
  const s = size / 200;
  g.save(); g.scale(s, s);
  const dark = lightness(T.c1) < 0.5, ring = T.c2, inner = T.c1;
  g.fillStyle = T.c3; g.beginPath(); g.arc(0, 0, 100, 0, TAU); g.fill();
  g.fillStyle = ring; g.beginPath(); g.arc(0, 0, 94, 0, TAU); g.fill();
  g.fillStyle = T.c3; g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fill();
  g.fillStyle = inner; g.beginPath(); g.arc(0, 0, 65, 0, TAU); g.fill();
  // text po obvodu
  const txt = T.city.toUpperCase(), n = txt.length, span = Math.min(Math.PI * 1.15, n * 0.2);
  g.fillStyle = lightness(ring) > 0.55 ? '#111' : '#fff'; g.font = 'bold 20px "DejaVu Sans", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 - span / 2 + (i + 0.5) * span / n; g.save(); g.rotate(a + Math.PI / 2); g.fillText(txt[i], 0, -82); g.restore(); }
  const nm = T.name.toUpperCase(), m = nm.length, sp2 = Math.min(Math.PI * 1.0, m * 0.19);
  for (let i = 0; i < m; i++) { const a = Math.PI / 2 + sp2 / 2 - (i + 0.5) * sp2 / m; g.save(); g.rotate(a - Math.PI / 2); g.fillText(nm[i], 0, 82); g.restore(); }
  // symbol
  g.save(); g.scale(0.82, 0.82);
  g.fillStyle = dark ? ring : (lightness(ring) < 0.6 ? ring : T.c3);
  if (lightness(g.fillStyle) > 0.85 && !dark) g.fillStyle = '#111';
  g.translate(3, 3); g.globalAlpha = 0.35; const fs = g.fillStyle; g.fillStyle = '#000'; emblemSymbol(g, T.sym); g.globalAlpha = 1; g.fillStyle = fs; g.translate(-3, -3);
  emblemSymbol(g, T.sym);
  g.restore();
  g.restore();
}

const SURNAMES = ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Pokorný',
  'Pospíšil', 'Hájek', 'Král', 'Jelínek', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Doležal', 'Zeman', 'Kolář',
  'Navrátil', 'Čermák', 'Vaněk', 'Blažek', 'Kříž', 'Kovář', 'Bartoš', 'Vlček', 'Polák', 'Musil', 'Šimek',
  'Konečný', 'Malý', 'Holub', 'Štěpánek', 'Kadlec', 'Dostál', 'Soukup', 'Mareš', 'Moravec', 'Sýkora', 'Valenta',
  'Matoušek', 'Tichý', 'Bureš', 'Vávra', 'Škoda', 'Hrubý', 'Mach', 'Janda', 'Šindelář', 'Kopecký', 'Hruška',
  'Zelenka', 'Řezníček', 'Brabec', 'Kubíček', 'Lukáš', 'Toman', 'Bednář', 'Šťastný', 'Jireš', 'Klíma', 'Oliva',
  'Miller', 'Johnson', 'Smith', 'Brown', 'Wilson', 'Anderson', 'Thompson', 'Martin', 'Walker', 'Hall', 'Young', 'King', 'Wright',
  'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Campbell', 'Parker', 'Evans', 'Collins',
  'Stewart', 'Murphy', 'Cook', 'Rogers', 'Morgan', 'Cooper', 'Reed', 'Bailey', 'Kelly', 'Howard', 'Ward', 'Watson', 'Brooks', 'Bennett',
  'Gray', 'Hughes', 'Price', 'Sanders', 'Foster', 'Tremblay', 'Gagnon', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin',
  'Pelletier', 'Belanger', 'Lindqvist', 'Nilsson', 'Eriksson', 'Larsson', 'Johansson', 'Lehtonen', 'Virtanen', 'Korhonen',
  'Heikkinen', 'Ivanov', 'Petrov', 'Smirnov', 'Volkov', 'Morozov', 'Sokolov', 'Novotný', 'Kováč', 'Horváth', 'Varga', 'Nagy'];
const INITIALS = 'ADFJKLMOPRSTVZ'.split('');
// stát původu podle příjmení (vlaječka na soupisce)
const NAT_OF = (() => {
  const m = {};
  const set = (code, names) => names.split(' ').forEach((n) => (m[n] = code));
  set('NA', 'Miller Johnson Smith Brown Wilson Anderson Thompson Martin Walker Hall Young King Wright Scott Green Baker Adams Nelson Carter Mitchell Roberts Turner Campbell Parker Evans Collins Stewart Murphy Cook Rogers Morgan Cooper Reed Bailey Kelly Howard Ward Watson Brooks Bennett Gray Hughes Price Sanders Foster');
  set('CAN', 'Tremblay Gagnon Bouchard Gauthier Morin Lavoie Fortin Pelletier Belanger');
  set('SWE', 'Lindqvist Nilsson Eriksson Larsson Johansson');
  set('FIN', 'Lehtonen Virtanen Korhonen Heikkinen');
  set('RUS', 'Ivanov Petrov Smirnov Volkov Morozov Sokolov');
  set('SVK', 'Kováč Horváth Varga Nagy');
  return m;
})();
function natOf(p) {
  const n = NAT_OF[p.name];
  if (!n) return 'CZE';
  if (n !== 'NA') return n;
  let h = 3; for (const ch of String(p.name) + p.num) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 5 < 3 ? 'CAN' : 'USA';
}
const NAT_NAMES = { CZE: 'Česko', SVK: 'Slovensko', CAN: 'Kanada', USA: 'USA', SWE: 'Švédsko', FIN: 'Finsko', RUS: 'Rusko' };
// malá vlajka (x, y = levý horní roh)
function drawFlag(g, code, x, y, w = 22, h = 14) {
  g.save(); g.translate(x, y);
  const band = (cols, vert) => cols.forEach((c, i) => { g.fillStyle = c; if (vert) g.fillRect(i * w / cols.length, 0, w / cols.length + 0.5, h); else g.fillRect(0, i * h / cols.length, w, h / cols.length + 0.5); });
  if (code === 'CZE') { band(['#ffffff', '#d7141a']); g.fillStyle = '#11457e'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.5, h / 2); g.lineTo(0, h); g.fill(); }
  else if (code === 'SVK') { band(['#ffffff', '#0b4ea2', '#ee1c25']); g.fillStyle = '#ee1c25'; g.fillRect(w * 0.18, h * 0.22, w * 0.26, h * 0.56); g.fillStyle = '#ffffff'; g.fillRect(w * 0.29, h * 0.3, w * 0.04, h * 0.36); g.fillRect(w * 0.23, h * 0.38, w * 0.16, h * 0.06); }
  else if (code === 'CAN') { band(['#d52b1e', '#ffffff', '#ffffff', '#d52b1e'], true); g.fillStyle = '#d52b1e'; const cx = w / 2, cy = h / 2, r = h * 0.32; g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.9, cy); g.lineTo(cx + r * 0.3, cy + r * 0.2); g.lineTo(cx, cy + r * 0.9); g.lineTo(cx - r * 0.3, cy + r * 0.2); g.lineTo(cx - r * 0.9, cy); g.closePath(); g.fill(); }
  else if (code === 'USA') { for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, i * h / 7, w, h / 7 + 0.5); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.42, h * 0.54); }
  else if (code === 'SWE') { g.fillStyle = '#006aa7'; g.fillRect(0, 0, w, h); g.fillStyle = '#fecc00'; g.fillRect(w * 0.3, 0, w * 0.14, h); g.fillRect(0, h * 0.4, w, h * 0.2); }
  else if (code === 'FIN') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#002f6c'; g.fillRect(w * 0.28, 0, w * 0.16, h); g.fillRect(0, h * 0.38, w, h * 0.24); }
  else if (code === 'RUS') band(['#ffffff', '#0039a6', '#d52b1e']);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
  g.restore();
}
const ROLES = ['C', 'LW', 'RW', 'LD', 'RD'];
const ROLE_NAMES = { C: 'Centr', LW: 'Levé křídlo', RW: 'Pravé křídlo', LD: 'Levý obránce', RD: 'Pravý obránce', G: 'Brankář' };

// Soupiska: 3 formace (C, LW, RW, LD, RD) + 2 brankáři. Atributy 40–99:
// SIL = síla (bodyčeky, krytí puku, tvrdost střely), RYC = rychlost, PRE = přesnost (střely, přihrávky),
// STA = stamina (jak rychle se unaví), REF = reflexy brankáře.
// postava hráče: hmotnost podle síly (obránci a brankáři těžší), výška podle hmotnosti
function playerBody(role, SIL, rnd = Math.random) {
  const D = role[1] === 'D', G = role === 'G';
  const kg = Math.round(clamp((G ? 86 : 83) + ((SIL || 75) - 75) * 0.55 + (D ? 6 : 0) + (rnd() - 0.5) * 14, 72, 116));
  const cm = Math.round(clamp(176 + (kg - 85) * 0.55 + (G ? 4 : 0) + (rnd() - 0.5) * 10, 170, 203));
  return { kg, cm };
}
// typy hráčů (X-faktory): mají je jen hráči s výrazným atributem (88+, brankář 84+), každý jednu mírnou schopnost
const TRAITS = { S: 'OSTROSTŘELEC', P: 'TVŮRCE HRY', E: 'SILÁK', R: 'RYCHLÍK', W: 'ZEĎ' };
const TRAIT_HINT = { S: 'přesnější střela', P: 'přesnější přihrávky', E: 'silnější bodyček a souboje', R: 'rychlejší bruslení', W: 'brankář chytá o kousek víc' };
function traitOf(p) {
  const a = p.at || {};
  if (p.role === 'G') return (a.REF || 0) >= 84 ? 'W' : '';
  const best = ['PRE', 'RYC', 'SIL'].reduce((x, k) => ((a[k] || 0) > (a[x] || 0) ? k : x), 'PRE');
  if ((a[best] || 0) < 88) return '';
  let h = 3; for (const ch of String(p.name) + p.num) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return best === 'RYC' ? 'R' : best === 'SIL' ? 'E' : h % 2 ? 'S' : 'P';
}
// herní styl týmu (jak hraje počítač): podle zaměření klubu, u vyrovnaných klubů střídavě
const STYLES = { heavy: 'TVRDÁ HRA', pass: 'KOMBINACE', trap: 'OBRANA A BREJKY', gun: 'ÚTOK' };
function teamStyle(idx) { const d = TEAMS[idx]; return d.off >= d.def + 3 ? 'gun' : d.def >= d.off + 3 ? 'trap' : idx % 2 ? 'heavy' : 'pass'; }
function buildRoster(teamIdx) {
  const t = TEAMS[teamIdx], rnd = mulberry32(teamIdx * 7919 + 13), rk = mulberry32(teamIdx * 131 + 5);
  const used = new Set(), nums = new Set();
  const r = (a, b) => a + rnd() * (b - a);
  const att = (v) => Math.round(clamp(v, 42, 99));
  const person = (role, numPool) => {
    let sn; do { sn = SURNAMES[Math.floor(rnd() * SURNAMES.length)]; } while (used.has(sn));
    used.add(sn);
    let num; do { num = numPool ? numPool[Math.floor(rnd() * numPool.length)] : 2 + Math.floor(rnd() * 96); } while (nums.has(num));
    nums.add(num);
    return { role, num, name: sn, first: INITIALS[Math.floor(rnd() * INITIALS.length)] + '.', hand: rnd() < 0.6 ? 1 : -1 };
  };
  const lines = [], dev = (v) => (v - 85) * 2.2;
  for (let L = 0; L < 3; L++) {
    const mod = [6, 0, -7][L];
    lines.push(ROLES.map((role) => {
      const p = person(role), D = role[1] === 'D';
      p.line = L;
      p.at = {
        SIL: att(72 + dev(D ? t.def + 2 : (t.off + t.def) / 2) + (D ? 6 : 0) + mod + r(-8, 8)),
        RYC: att(72 + dev(t.spd) - (D ? 4 : 0) + mod + r(-8, 8)),
        PRE: att(72 + dev(t.off) - (D ? 8 : 0) + mod + r(-8, 8)),
        STA: att(72 + r(-16, 18) + mod * 0.4),
      };
      Object.assign(p, playerBody(role, p.at.SIL, rk));
      return p;
    }));
  }
  const goalies = [0, 1].map((k) => {
    const p = person('G', [1, 29, 30, 31, 33, 35, 39, 40, 50, 60]);
    p.line = k;
    p.at = { REF: att(74 + dev(t.gk) + (k ? -8 : 3) + r(-3, 3)), RYC: att(70 + dev(t.gk) * 0.6 + r(-8, 8)), STA: att(78 + r(-10, 10)) };
    Object.assign(p, playerBody('G', 75, rk));
    return p;
  });
  return { lines, goalies };
}
// souhrnné hodnocení týmu (z první a druhé formace)
const TEAM_RATINGS = new Map();
function teamRatings(idx) {
  if (TEAM_RATINGS.has(idx)) return TEAM_RATINGS.get(idx);
  const R = buildRoster(idx), sk = R.lines[0].concat(R.lines[1]);
  const avg = (k) => Math.round(sk.reduce((a, p) => a + p.at[k], 0) / sk.length);
  const out = { SIL: avg('SIL'), RYC: avg('RYC'), PRE: avg('PRE'), STA: avg('STA'), REF: R.goalies[0].at.REF };
  out.OVR = Math.round((out.SIL + out.RYC + out.PRE + out.STA * 0.5 + out.REF * 1.5) / 5);
  TEAM_RATINGS.set(idx, out);
  return out;
}
