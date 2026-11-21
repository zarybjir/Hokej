'use strict';
// ---------- Fiktivní týmy ligy ----------
const TEAMS = [
  { city: 'Praha', name: 'Gryfové', abbr: 'PRG', c1: '#b3122e', c2: '#f4c542', c3: '#1b1b1b', pants: '#1b1b1b', off: 88, def: 84, gk: 86, spd: 86 },
  { city: 'Brno', name: 'Vlci', abbr: 'BRN', c1: '#0b6e3a', c2: '#f0f0f0', c3: '#d7b400', pants: '#0d2e1b', off: 86, def: 87, gk: 84, spd: 84 },
  { city: 'Ostrava', name: 'Havíři', abbr: 'OVA', c1: '#1f3f7a', c2: '#ff7a1a', c3: '#ffffff', pants: '#111c33', off: 84, def: 89, gk: 88, spd: 82 },
  { city: 'Plzeň', name: 'Sládci', abbr: 'PLZ', c1: '#c26a00', c2: '#2b1a0e', c3: '#ffffff', pants: '#2b1a0e', off: 90, def: 80, gk: 82, spd: 85 },
  { city: 'Liberec', name: 'Rysi', abbr: 'LBC', c1: '#1e9bd7', c2: '#0a2240', c3: '#ffffff', pants: '#0a2240', off: 85, def: 85, gk: 85, spd: 90 },
  { city: 'Olomouc', name: 'Sokoli', abbr: 'OLM', c1: '#5b2c83', c2: '#e8b923', c3: '#ffffff', pants: '#2a1440', off: 83, def: 86, gk: 87, spd: 85 },
  { city: 'K. Vary', name: 'Gejzíři', abbr: 'KVA', c1: '#00898a', c2: '#ffffff', c3: '#0b2b2b', pants: '#0b2b2b', off: 87, def: 82, gk: 83, spd: 88 },
  { city: 'Budějovice', name: 'Medvědi', abbr: 'CBU', c1: '#161616', c2: '#f2b705', c3: '#c8102e', pants: '#161616', off: 89, def: 86, gk: 80, spd: 83 },
  { city: 'Zlín', name: 'Ševci', abbr: 'ZLN', c1: '#d9262e', c2: '#1d4fa0', c3: '#ffffff', pants: '#1d4fa0', off: 82, def: 88, gk: 90, spd: 82 },
  { city: 'Hradec', name: 'Lvi', abbr: 'HKR', c1: '#e6e6e6', c2: '#c8102e', c3: '#111111', pants: '#c8102e', off: 86, def: 84, gk: 86, spd: 87 },
];

const SURNAMES = ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Pokorný',
  'Pospíšil', 'Hájek', 'Král', 'Jelínek', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Doležal', 'Zeman', 'Kolář',
  'Navrátil', 'Čermák', 'Vaněk', 'Blažek', 'Kříž', 'Kovář', 'Bartoš', 'Vlček', 'Polák', 'Musil', 'Šimek',
  'Konečný', 'Malý', 'Holub', 'Štěpánek', 'Kadlec', 'Dostál', 'Soukup', 'Mareš', 'Moravec', 'Sýkora', 'Valenta',
  'Matoušek', 'Tichý', 'Bureš', 'Vávra', 'Škoda', 'Hrubý', 'Mach', 'Janda', 'Šindelář', 'Kopecký', 'Hruška',
  'Zelenka', 'Řezníček', 'Brabec', 'Kubíček', 'Lukáš', 'Toman', 'Bednář', 'Šťastný', 'Jireš', 'Klíma', 'Oliva'];
const INITIALS = 'ADFJKLMOPRSTVZ'.split('');
const ROLES = ['C', 'LW', 'RW', 'LD', 'RD'];
const ROLE_NAMES = { C: 'Centr', LW: 'Levé křídlo', RW: 'Pravé křídlo', LD: 'Levý obránce', RD: 'Pravý obránce', G: 'Brankář' };

// Soupiska: 3 formace (C, LW, RW, LD, RD) + 2 brankáři. Atributy 40–99:
// SIL = síla (bodyčeky, krytí puku, tvrdost střely), RYC = rychlost, PRE = přesnost (střely, přihrávky),
// STA = stamina (jak rychle se unaví), REF = reflexy brankáře.
function buildRoster(teamIdx) {
  const t = TEAMS[teamIdx], rnd = mulberry32(teamIdx * 7919 + 13);
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
      return p;
    }));
  }
  const goalies = [0, 1].map((k) => {
    const p = person('G', [1, 29, 30, 31, 33, 35, 39, 40, 50, 60]);
    p.line = k;
    p.at = { REF: att(74 + dev(t.gk) + (k ? -8 : 3) + r(-3, 3)), RYC: att(70 + dev(t.gk) * 0.6 + r(-8, 8)), STA: att(78 + r(-10, 10)) };
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
