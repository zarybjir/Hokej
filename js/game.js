'use strict';
// ---------- Herní logika: fyzika, pravidla, AI ----------
const DIFF = [
  { name: 'Dětská', react: 0.32, cpuSpd: 0.78, cpuAcc: 0.35, cpuGk: -0.2, myGk: 0.14, think: 0.5, aggr: 0.25, fo: -0.25, kids: true },
  { name: 'Lehká', react: 0.2, cpuSpd: 0.9, cpuAcc: 0.7, cpuGk: -0.1, myGk: 0.06, think: 0.34, aggr: 0.55, fo: -0.12 },
  { name: 'Normální', react: 0.14, cpuSpd: 0.97, cpuAcc: 1.0, cpuGk: -0.02, myGk: 0.02, think: 0.22, aggr: 0.9, fo: 0 },
  { name: 'Těžká', react: 0.1, cpuSpd: 1.04, cpuAcc: 1.2, cpuGk: 0.05, myGk: -0.02, think: 0.13, aggr: 1.3, fo: 0.12 },
  { name: 'Legenda', react: 0.07, cpuSpd: 1.08, cpuAcc: 1.35, cpuGk: 0.08, myGk: -0.05, think: 0.09, aggr: 1.6, fo: 0.2 },
];
// rozhodčí: bílo-černé pruhy, hlavní má oranžové pásky
const REF_TEAM = { jersey: '#f2f2f2', stripe: '#111111', numCol: '#111111', helmet: '#121212', pants: '#111111',
  def: { c1: '#111111', c2: '#f2f2f2', c3: '#111111', abbr: '', pants: '#111111' } };
const PH = { GRIP: 112, BRAKE: 85, ACC: 40, MAXV: 25, TURBO: 1.27, GLIDE: 0.55, PF: 0.2, G: 32, PR: 0.3, PLR: 1.2, GR: 1.6, BE: 0.6 };
const SWING_T = 0.13; // doba švihu od nápřahu k úderu do puku
const HUMAN_COLORS = ['#ffd21f', '#2ee6ff', '#ff4fd8', '#7dff4f'];
const PERIOD_NAMES = ['', '1. TŘETINA', '2. TŘETINA', '3. TŘETINA', 'PRODLOUŽENÍ'];
const FOULS = { hook: 'HÁKOVÁNÍ', trip: 'PODRÁŽENÍ', slash: 'SEKÁNÍ', back: 'NAPADENÍ ZEZADU', board: 'NARÁŽENÍ NA MANTINEL', interf: 'BRÁNĚNÍ VE HŘE', rough: 'HRUBOST' };

// zranění: typ a délka léčení (počet zápasů); příčina 'foul' / 'tired' / 'sim'
const INJURIES = {
  foul: [['pohmožděné rameno', 1, 3, 4], ['zranění kotníku', 2, 6, 3], ['otřes mozku', 3, 8, 2], ['zranění kolena', 4, 12, 1.5], ['zlomené zápěstí', 6, 14, 1], ['naražená žebra', 1, 4, 3]],
  tired: [['natažený sval', 1, 4, 5], ['natržený tříslový sval', 3, 7, 2], ['zranění zad', 2, 5, 1.5]],
};
function rollInjury(cause) {
  const L = INJURIES[cause] || INJURIES[Math.random() < 0.6 ? 'foul' : 'tired'];
  let r = Math.random() * L.reduce((a, q) => a + q[3], 0), q = L[0];
  for (const x of L) { r -= x[3]; if (r <= 0) { q = x; break; } }
  return { name: q[0], games: q[1] + Math.floor(Math.random() * (q[2] - q[1] + 1)) };
}
function gamesWord(n) { return n === 1 ? 'zápas' : n < 5 ? 'zápasy' : 'zápasů'; }
const INJ_FOUL = { hook: 0.02, trip: 0.05, slash: 0.04, back: 0.15, board: 0.11, interf: 0.03, rough: 0.08 };

function lightness(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

class Player {
  constructor(team, info) {
    Object.assign(this, { team, id: info.id, role: info.role, name: info.name, first: info.first, num: info.num, hand: info.hand, line: info.line || 0 });
    this.isGoalie = info.role === 'G'; this.cap = !!info.cap;
    // atributy (40–99) → herní parametry
    const A = this.at = info.at || {}, n = (v, lo, hi) => lo + ((v || 75) - 55) / 44 * (hi - lo);
    // atributy mají jen mírný vliv: o výsledku má rozhodovat šikovnost hráče, slabší sestava jen ztěžuje
    if (this.isGoalie) { this.gk = 0.99 + ((A.REF || 78) - 78) * 0.002; this.gkMove = n(A.RYC, 0.97, 1.03); this.spd = 1; this.pow = 1; this.acc = 1; this.pas = 0.95; this.chk = 0.9; }
    else { this.spd = n(A.RYC, 0.92, 1.07); this.pow = n(A.SIL, 0.92, 1.08); this.chk = n(A.SIL, 0.92, 1.1); this.acc = n(A.PRE, 0.9, 1.08); this.pas = this.acc; }
    this.staMul = 0.8 - ((A.STA || 75) - 75) * 0.008;
    // hmotnost: těžší hráč vyhrává souboje a hůř se mu bere puk, ale pomaleji zrychluje
    if (!info.kg) { let h = 7; for (const ch of String(info.name) + info.num) h = (h * 31 + ch.charCodeAt(0)) >>> 0; Object.assign(info, playerBody(this.role, A.SIL, mulberry32(h))); }
    this.kg = info.kg; this.cm = info.cm; this.mass = this.kg / 88;
    this.reach = 1 + (this.cm - 185) / 185 * 0.9; // vyšší hráč = delší hůl a paže (zhruba ±8 %)
    // obratnost (rychlost + přesnost): brzdění, zatáčení, rozjezd – mírně (±3 %)
    this.agil = this.isGoalie ? 1 : n(((A.RYC || 75) + (A.PRE || 75)) / 2, 0.97, 1.03);
    this.pMass = this.isGoalie ? this.mass * 2.5 : this.mass;   // brankář v postoji s betony se nedá odstrčit
    // X-faktor a forma (forma ±3 % → rychlost, síla střely, přesnost jen o ±2 %)
    this.trait = info.trait != null ? info.trait : traitOf(info);
    this.form = info.form != null ? info.form : clamp(gauss() * 0.012, -0.025, 0.025);
    const fm = 1 + this.form * 0.6;
    if (this.isGoalie) { this.gk += this.form * 0.1 + (this.trait === 'W' ? 0.004 : 0); }
    else {
      this.spd *= fm; this.pow *= fm; this.acc *= fm;
      if (this.trait === 'R') { this.spd *= 1.03; this.agil *= 1.02; }
      if (this.trait === 'E') this.chk *= 1.06;
      if (this.trait === 'P') this.pas = Math.min(1.12, this.pas + 0.03);
    }
    this.snipe = this.trait === 'S' ? 0.85 : 1;
    this.onIce = false; this.goBench = false;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.dir = 0;
    this.stride = Math.random() * 6; this.spdN = 0; this.carry = false;
    this.downT = 0; this.lie = 0; this.checkT = 0; this.checkHit = false; this.pokeA = 0; this.pokeCD = 0; this.checkCD = 0;
    this.winding = false; this.windT = 0; this.dekeT = 0; this.recoverT = 0; this.saveT = 0; this.saveKind = 0; this.holdT = 0;
    this.stamina = 1; this.turbo = false; this.ctrl = -1; this.pickCD = 0; this.inX = 0; this.inY = 0; this.faceDir = null;
    this.oneTimerQ = false;
    this.ai = { t: Math.random() * 0.2, wind: 0, ph: Math.random() * 10, tx: 0, ty: 0 };
    this.stats = { g: 0, a: 0, s: 0, h: 0, sv: 0, sa: 0, pm: 0, toi: 0, fw: 0, fl: 0 };
  }
}

class Game {
  constructor(cfg) {
    this.cfg = cfg; this.silent = !!cfg.silent; this.demo = !!cfg.demo;
    this.diff = DIFF[cfg.diff == null ? 1 : cfg.diff];
    this.periodLen = cfg.periodLen || 180;
    this.otMode = cfg.ot || '3v3';   // '3v3' | '5v5' | 'off'
    this.otLen = clamp(Math.round(this.periodLen / 3), 60, 300);
    this.time = 0; this.period = 1; this.clock = this.periodLen; this.acc = 0;
    this.autoChange = cfg.autoChange !== false;
    this.teams = [this.makeTeam(cfg.home, 0), this.makeTeam(cfg.away, 1)];
    this.rebuildAll();
    this.refs = [{ kind: 'R', side: -1 }, { kind: 'L', side: 1, k: -1 }, { kind: 'L', side: -1, k: 1 }].map((r, i) => ({
      ...r, isRef: true, team: REF_TEAM, num: 0, name: i ? 'Čárový' : 'Rozhodčí', hand: 1, x: 0, y: 0, vx: 0, vy: 0, dir: 0,
      stride: Math.random() * 6, spdN: 0, arm: 0, armDir: 0, downT: 0, ctrl: -1 }));
    this.toast = null;
    this.penOn = cfg.penalties !== false;
    this.penLen = clamp(this.periodLen * 0.13, 25, 120); // „2 minuty" úměrně délce třetiny
    this.penalties = []; this.pending = null;
    this.injOn = cfg.injuries !== false; this.injuries = []; this.injWait = null;
    // stav ledu: mřížka 2×2 stopy, 0 = čerstvý led, 1 = rozbrušený se sněhem
    this.ice = new Float32Array(100 * 43);
    this.iceWear = 180 / this.periodLen; // led se za třetinu opotřebuje stejně, ať je dlouhá jakkoli
    this.puck = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null, held: null, passTarget: null, passT: 0, wasPass: false,
      shot: null, lastTouch: null, history: [], oneTimer: false, reboundT: 0, deflT: 0, ignore: new Map(), drop: false, inNet: 0 };
    this.humans = (cfg.humans || []).map((h, i) => ({ idx: i, dev: h.dev, team: this.teams[h.team], player: null, foPress: -9, color: HUMAN_COLORS[i % 4], assist: h.assist || 0, swT: 0, autoT: 0 }));
    for (const h of this.humans) h.team.humans.push(h);
    for (const t of this.teams) t.cpu = t.humans.length === 0;
    // počítač hraje taktiku podle povahy týmu (útočné / obranné kluby); lidský tým podle nastavení
    for (const t of this.teams) if (t.cpu) { const d = t.def; t.tactics = d.off >= d.def + 3 ? [2, 1, 1] : d.def >= d.off + 3 ? [1, 0, 0] : [1, 1, 1]; }
    this.vsHuman = this.humans.length > 0 && this.teams.some((t) => t.cpu);
    for (const t of this.teams) t.spdMod = t.cpu && this.vsHuman ? this.diff.cpuSpd : 1;
    this.setColors();
    this.banner = null; this.pops = []; this.lower = null; this.shake = 0; this.goalLight = 0; this.goalLightT = 0;
    this.rec = []; this.recSkip = 0; this.replay = null; this.paused = false; this.over = false; this.goals = [];
    this.practice = cfg.practice ? { kind: cfg.practice, goals: 0, shots: 0 } : null;
    this.achOn = !this.demo && !this.silent && this.humans.length > 0 && typeof Ach !== 'undefined';
    this.hGoals = new Map(); this.shotLog = [];
    this.state = 'intro'; this.stateT = 0;
    this.setDirs();
    this.setupFaceoff(...this.practiceSpot());
    this.state = 'intro';
    if (this.practice) this.showBanner('TRÉNINK', { shoot: 'Střelba a přihrávky', pp: 'Přesilovka 5 na 4', so: 'Nájezdy', sog: 'Nájezdy – jsi brankář' }[this.practice.kind], 2.2);
    else this.showBanner(PERIOD_NAMES[1], this.teams[0].def.city + ' vs ' + this.teams[1].def.city, 2.2);
    if (this.practice && (this.practice.kind === 'so' || this.practice.kind === 'sog')) { this.state = 'play'; this.startShootout(); }
    if (!this.silent && !this.practice) { Sfx.organ(0); this.say([pick(['Vítejte u zápasu.', 'Dobrý večer, vítejte na stadionu.']), this.teams[0].def.city, 'proti', this.teams[1].def.city], true); }
  }

  // ---------- pomocné ----------
  makeTeam(idx, side) {
    const def = TEAMS[idx];
    const t = { idx, def, side, dir: 1, players: [], skaters: [], goalie: null, score: 0, shots: 0, hits: 0, humans: [],
      chaser: null, presser: null, presser2: null, marks: new Map(), tactics: ((this.cfg.tactics && this.cfg.tactics[side]) || [1, 1, 1]).slice(), thinkT: Math.random() * 0.15, cpu: true, spdMod: 1, line: 0, change: null, pim: 0, ppg: 0, ppOpp: 0 };
    const R = (this.cfg.rosters && this.cfg.rosters[side]) || buildRoster(idx);
    t.lines = R.lines.map((l) => l.map((r) => new Player(t, r)));
    t.goalies = R.goalies.map((r) => new Player(t, r));
    t.goalie = t.goalies[0]; t.goalie.onIce = true;
    t.roster = [...t.lines.flat(), ...t.goalies];
    t.skaters = t.lines[0].slice(); t.skaters.forEach((p) => (p.onIce = true));
    this.setPlayers(t);
    return t;
  }
  rebuildAll() { this.all = [...this.teams[0].players, ...this.teams[1].players]; }
  setPlayers(t) { t.players = t.pulled ? t.skaters.slice() : [...t.skaters, t.goalie]; }
  // ---------- odvolání brankáře (šestý hráč do pole) ----------
  // počítač: na konci 3. třetiny při prohře o 1–2 góly, a při odloženém vyloučení soupeře; člověk: z pauzy
  wantsPull(t, atFaceoff) {
    if (this.shootout || this.practice) return false;
    if (!t.cpu) return !!t.wantPull;
    const opp = this.other(t), diff = opp.score - t.score;
    if (!atFaceoff && this.pending && this.pending.team === opp) return true;
    if (this.period !== 3 || diff < 1 || diff > 2) return false;
    return this.clock < Math.max(10, this.periodLen * (diff === 2 ? 0.15 : 0.1));
  }
  goalieOff(t) { return t.pulled || t.goalie.leaving; }
  startPull(t) {
    const g = t.goalie;
    if (t.pulled || g.leaving || this.puck.held === g || this.state !== 'play') return;
    g.leaving = true;
    if (t.humans.length || this.other(t).humans.length) this.toast = { text: 'BRANKÁŘ ' + t.def.abbr + ' JEDE NA STŘÍDAČKU', t: 0, dur: 1.8 };
    this.say(pick(['Brankář jede na střídačku!', 'Odvolávají brankáře!']), false, 0.8);
  }
  // brankář je venku: z lavice naskočí šestý hráč
  completePull(t, atFaceoff) {
    const g = t.goalie; g.leaving = false; t.pulled = true; g.onIce = false; g.ctrl = -1;
    if (this.puck.held === g) this.puck.held = null;
    this.setPlayers(t); this.ensureExtra(t, atFaceoff); this.rebuildAll();
    if (!atFaceoff) this.pop('PRÁZDNÁ BRANKA', g.x, g.y, '#ffe066');
  }
  pickExtra(t) {
    const L = t.change ? t.change.to : t.line, soon = this.lineup(t, L);
    const c = t.lines.flat().filter((q) => !q.onIce && !q.inBox && !q.injured && !soon.includes(q));
    if (!c.length) return null;
    return c.reduce((a, b) => (b.stamina + (b.role[1] !== 'D' ? 0.15 : 0) > a.stamina + (a.role[1] !== 'D' ? 0.15 : 0) ? b : a));
  }
  ensureExtra(t, atFaceoff) {
    if (!t.pulled || t.skaters.some((q) => q.extra)) return;
    const nw = this.pickExtra(t); if (!nw) return;
    const door = this.benchDoor(t);
    t.skaters.push(nw); nw.extra = true;
    Object.assign(nw, { x: door.x + rand(-3, 3), y: door.y - 1.5, vx: rand(-4, 4), vy: -10, dir: -Math.PI / 2, downT: 0, checkT: 0, pokeA: 0,
      winding: false, windT: 0, dekeT: 0, recoverT: 0, inX: 0, inY: 0, turbo: false, oneTimerQ: false, pickCD: 0, faceDir: null, ctrl: -1, onIce: true, goBench: false });
    this.setPlayers(t); this.rebuildAll();
  }
  // brankář se vrací během hry: šestý hráč jede na střídačku, brankář vyjíždí ze dveří
  returnGoalie(t) {
    const g = t.goalie;
    if (g.leaving) { g.leaving = false; return; }
    if (!t.pulled) return;
    t.pulled = false; g.onIce = true;
    const door = this.benchDoor(t);
    Object.assign(g, { x: door.x, y: door.y - 1.5, vx: 0, vy: -6, holdT: 0, saveT: 0, downT: 0, returning: true });
    g.ai.tx = g.x; g.ai.ty = g.y;
    for (const p of t.skaters) if (p.extra) { p.extra = false; p.extraOut = true; p.goBench = true; if (p.ctrl >= 0) { const hm = this.humans.find((q) => q.player === p); if (hm) { p.ctrl = -1; hm.player = null; this.switchPlayer(hm); } } }
    this.setPlayers(t); this.rebuildAll();
  }
  // při přerušení: brankář zpět do branky, šestý hráč pryč
  resetPull(t) {
    const g = t.goalie; g.leaving = false; g.returning = false; g.onIce = true;
    for (const p of t.roster) { p.extra = false; p.extraOut = false; }
    t.pulled = false;
  }
  // únava: 1 = odpočatý; pod 60 % energie výkon klesá
  fat(p) { return p.isGoalie ? 1 : 0.7 + 0.3 * clamp(p.stamina / 0.6, 0, 1); }
  lineEnergy(t, L) { const l = t.lines[L]; return l.reduce((a, p) => a + p.stamina, 0) / l.length; }
  pickLine(t) {
    let best = (t.line + 1) % 3, be = -1;
    const match = t.cpu && this.other(t).line === 0;   // počítač: proti 1. formaci soupeře raději vlastní 1. formaci
    for (let L = 0; L < 3; L++) { if (L === t.line) continue; const e = this.lineEnergy(t, L) + (L === (t.line + 1) % 3 ? 0.05 : 0) + (match && L === 0 ? 0.1 : 0); if (e > be) { be = e; best = L; } }
    return best;
  }
  benchDoor(t) { return { x: t.side === 0 ? -22 : 22, y: RINK.HW - 2.5 }; }
  // role, které tým kvůli vyloučení nesmí obsadit
  outRoles(t) {
    const pens = this.penalties.filter((pn) => pn.team === t);
    if (!pens.length) return [];
    // post, na který kvůli zranění a vyloučení nezbyl nikdo, se vynechá přednostně
    const all = t.lines.flat(), out = ROLES.filter((r) => !all.some((q) => q.role === r && !q.inBox && !q.injured)).slice(0, pens.length);
    for (const pn of pens) {
      if (out.length >= pens.length) break;
      // v oslabení se vynechává křídlo (centr vhazuje), u obránců obránce
      let r = pn.role === 'C' ? 'LW' : pn.role;
      if (out.includes(r)) r = ['LW', 'RW', 'LD', 'RD', 'C'].find((q) => !out.includes(q));
      out.push(r);
    }
    return out;
  }
  ot3() { return this.period === 4 && this.otMode === '3v3'; }
  // trénink: kde začíná akce (střelba = za modrou, přesilovka = vhazování v útočném pásmu)
  practiceSpot() {
    const pr = this.practice; if (!pr) return [0, 0];
    const s = this.teams[0].dir;
    return pr.kind === 'pp' ? [s * 69, Math.random() < 0.5 ? 22 : -22] : [s * 20, 0];
  }
  // 3 na 3 v prodloužení: centr, křídlo, obránce; vyloučení soupeře přidá čtvrtého hráče (pravidlo NHL)
  baseRoles(t) {
    const pr = this.practice;
    if (pr && t !== this.teams[0]) return pr.kind === 'pp' ? ['C', 'RW', 'LD', 'RD'] : [];
    if (!this.ot3() && !this.cfg.three) return ROLES;
    const mine = this.penalties.filter((pn) => pn.team === t).length, theirs = this.penalties.filter((pn) => pn.team !== t).length;
    return theirs > mine ? ['C', 'LW', 'RW', 'LD'] : ['C', 'RW', 'LD'];
  }
  lineup(t, L) {
    const out = this.ot3() || this.cfg.three ? [] : this.outRoles(t);
    return this.baseRoles(t).filter((r) => !out.includes(r)).map((r) => {
      let p = t.lines[L].find((q) => q.role === r);
      if (p.inBox || p.injured) p = [0, 1, 2].map((k) => t.lines[k].find((q) => q.role === r)).filter((q) => !q.inBox && !q.injured).sort((a, b) => b.stamina - a.stamina)[0];
      return p;
    }).filter(Boolean);
  }
  inBox(t) { return t.roster.filter((p) => p.inBox); }
  instantChange(t, L) {
    for (const p of t.skaters) { p.onIce = false; p.goBench = false; p.ctrl = -1; p.extra = false; p.extraOut = false; }
    t.skaters = this.lineup(t, L); t.skaters.forEach((p) => { p.onIce = true; p.goBench = false; });
    this.setPlayers(t); t.line = L; t.change = null;
    this.rebuildAll();
  }
  requestChange(t, manual) {
    if (t.change || this.state !== 'play') { if (manual && this.state !== 'play') t.change = { to: this.pickLine(t), t: 0 }; return; }
    const to = this.pickLine(t);
    const going = t.skaters.filter((p) => p.line !== to);
    if (!going.length) return;
    t.change = { to, t: 0 };
    for (const p of going) p.goBench = true;
    if (t.humans.length) this.toast = { text: 'STŘÍDÁNÍ: FORMACE ' + (to + 1), t: 0, dur: 1.8 };
  }
  updateEnergy(h) {
    for (const t of this.teams) for (const p of t.roster) {
      if (p.isGoalie) continue;
      if (!p.onIce) p.stamina = Math.min(1, p.stamina + h / 30);
      else if (this.state === 'play') {
        p.stats.toi += h;
        const press = 1 + clamp(((this.other(t).zoneT || 0) - 8) / 20, 0, 0.5);   // dlouhý tlak soupeře v našem pásmu unavuje
        p.stamina = Math.max(0, p.stamina - h * (0.6 + 0.6 * clamp(p.spdN / 25, 0, 1)) / 70 * p.staMul * [0.92, 1, 1.1][this.tacOf(t)] * press);
        // velké vyčerpání: hrozí natažený sval
        if (p.stamina < 0.1 && Math.random() < h * 0.02 * (1 - p.stamina / 0.1) * p.staMul) this.hurt(p, 'tired');
      }
      else p.stamina = Math.min(1, p.stamina + h * 0.012);
    }
  }
  updateChanges(h) {
    for (const t of this.teams) {
      const ch = t.change;
      if (!ch) continue;
      if (!t.skaters.some((p) => p.goBench)) { t.line = ch.to; t.change = null; continue; }
      ch.t += h;
      const door = this.benchDoor(t);
      for (const p of t.skaters.slice()) {
        if (!p.goBench || p.extraOut) continue;
        const d = Math.hypot(p.x - door.x, p.y - door.y);
        if ((d < 10 || (ch.t > 14 && p.ctrl < 0)) && this.puck.owner !== p && this.puck.held !== p && p.downT <= 0) {
          let nw = p.extra ? this.pickExtra(t) : this.lineup(t, ch.to).find((q) => q.role === p.role);
          if (nw && nw.onIce) { nw.extra = false; nw.goBench = false; nw = null; } // nový hráč už je na ledě jako šestý
          if (nw) this.swapIn(t, p, nw, door);
          else { t.skaters.splice(t.skaters.indexOf(p), 1); p.onIce = false; p.goBench = false; this.setPlayers(t); this.rebuildAll(); }
        }
      }
      // lidský hráč přejde na čerstvého spoluhráče, unavený jede sám na střídačku
      for (const hm of t.humans) {
        if (!hm.player || !hm.player.goBench) continue;
        const fresh = t.skaters.filter((q) => !q.goBench && !q.injured && q.ctrl < 0);
        if (fresh.length) {
          const pk = this.puck, best = fresh.reduce((a, b) => (Math.hypot(a.x - pk.x, a.y - pk.y) < Math.hypot(b.x - pk.x, b.y - pk.y) ? a : b));
          this.assign(hm, best);
        }
      }
      if (!t.skaters.some((p) => p.goBench)) { t.line = ch.to; t.change = null; }
    }
  }
  swapIn(t, old, nw, door) {
    const i = t.skaters.indexOf(old);
    if (i < 0 || !nw) return;
    t.skaters[i] = nw;
    old.onIce = false; old.goBench = false; old.carry = false; nw.extra = !!old.extra; old.extra = false;
    Object.assign(nw, { x: door.x + rand(-3, 3), y: door.y - 1.5, vx: rand(-4, 4), vy: -10, dir: -Math.PI / 2, downT: 0, checkT: 0, pokeA: 0,
      winding: false, windT: 0, dekeT: 0, recoverT: 0, inX: 0, inY: 0, turbo: false, oneTimerQ: false, pickCD: 0, faceDir: null, ctrl: -1, onIce: true, goBench: false });
    if (old.ctrl >= 0) { const hm = this.humans.find((q) => q.player === old); old.ctrl = -1; if (hm) { hm.player = nw; nw.ctrl = hm.idx; } }
    if (this.puck.passTarget === old) this.puck.passTarget = null;
    this.setPlayers(t);
    this.rebuildAll();
  }
  // ---------- fauly a vyloučení ----------
  foul(off, victim, type) {
    if (this.state === 'play' && Math.random() < (INJ_FOUL[type] || 0.05) * (1.6 - victim.stamina * 0.6)) this.hurt(victim, 'foul');
    if (!this.penOn || this.state !== 'play' || this.pending || off.isGoalie || off.inBox) return;
    // spoluhráči řízení počítačem hrají v týmu člověka opatrně: většinu jejich faulů rozhodčí nechá být
    if (off.ctrl < 0 && off.team.humans.length && Math.random() < 0.75) return;
    const t = off.team;
    if (this.outRoles(t).length >= 2) return; // víc než 5 na 3 se nehraje
    // trestné střílení: faul zezadu na hráče v samostatném úniku (před ním už jen brankář)
    if (['back', 'hook', 'trip', 'slash'].includes(type) && !this.shootout && !this.practice && !this.ot3() && !this.cfg.three) {
      const vt = victim.team, s = vt.dir, had = this.puck.owner === victim || this.time - (victim.lastPuckT || -9) < 0.6;
      const alone = s * victim.x > 0 && !t.skaters.some((o) => o !== off && o.downT <= 0 && s * (o.x - victim.x) > -2);
      if (had && alone && !this.goalieOff(t)) { this.startPenaltyShot(vt, victim, off, type); return; }
    }
    this.pending = { team: t, player: off, type, victim };
    const own = this.puck.owner || this.puck.held;
    if (own && own.team !== t) {
      // odložené vyloučení: hraje se, dokud se puku nedotkne faulující tým
      this.toast = { text: 'ODLOŽENÉ VYLOUČENÍ: ' + FOULS[type], t: 0, dur: 2.2 };
      this.pop('FAUL!', victim.x, victim.y, '#ff5a3c');
      this.say('Odložené vyloučení.', false, 0.6);
    } else this.whistlePenalty();
  }
  whistlePenalty() {
    const pd = this.pending; if (!pd) return;
    const s = pd.team.dir, pk = this.puck;
    pk.owner = null; pk.held = null;
    this.whistle('VYLOUČENÍ', [-s * 69, (pk.y >= 0 ? 1 : -1) * 22]);
  }
  assess(pd) {
    const p = pd.player, t = pd.team, box = this.boxPos(t);
    p.inBox = true; p.onIce = false; p.goBench = false; p.stats.pim = (p.stats.pim || 0) + 2;
    if (p.ctrl >= 0) { const hm = this.humans.find((q) => q.player === p); p.ctrl = -1; if (hm) { const q = t.skaters.find((x) => x !== p && x.ctrl < 0); hm.player = q || null; if (q) q.ctrl = hm.idx; } }
    const i = t.skaters.indexOf(p);
    if (i >= 0) { t.skaters.splice(i, 1); this.setPlayers(t); this.rebuildAll(); }
    if (this.puck.owner === p) this.puck.owner = null;
    const k = this.penalties.filter((pn) => pn.team === t).length;
    Object.assign(p, { x: box.x + k * 2.6, y: box.y, vx: 0, vy: 0, dir: Math.PI / 2, spdN: 0, downT: 0, winding: false, windT: 0, pokeA: 0, carry: false });
    this.penalties.push({ team: t, player: p, role: p.role, left: this.penLen, total: this.penLen, type: pd.type });
    t.pim++; this.other(t).ppOpp++;
    if (t === this.teams[0]) this.sfx('boo', 1); else { this.sfx('cheer', 0.5); this.sfx('claps'); }
    this.lower = { title: '#' + p.num + ' ' + p.name.toUpperCase() + ' (' + t.def.abbr + ')', sub: FOULS[pd.type] + ' — 2 minuty', team: t, t: 0, dur: 3.4 };
    this.say([pick(['Vyloučení!', 'Dvě minuty!', 'Rozhodčí vylučuje.']), p.name, FOULS[pd.type].toLowerCase()], true);
  }
  // ---------- zranění ----------
  hurt(p, cause) {
    if (!this.injOn || p.injured || p.isGoalie || !p.onIce || this.state !== 'play') return;
    const t = p.team;
    // nejvýš 2 zranění na tým a zápas, a nikdy dva hráči na stejném postu (sestava musí jít složit)
    if (t.roster.filter((q) => q.injured).length >= 2 || t.roster.some((q) => q.injured && q.role === p.role)) return;
    p.injured = rollInjury(cause); p.injured.cause = cause;
    this.injuries.push({ team: t, player: p, ...p.injured, period: this.period });
    p.downT = Math.max(p.downT, 2.5); p.lie = p.lie || p.dir + Math.PI; p.winding = false; p.windT = 0;
    if (this.puck.owner === p) this.loosePuck(p, p.vx * 0.5, p.vy * 0.5);
    this.pop('ZRANĚNÍ!', p.x, p.y, '#ff5a3c');
    if (!this.injWait) this.injWait = { p, t: 0 };
  }
  updateInjuries(h) {
    for (const t of this.teams) for (const p of t.skaters) if (p.injured) p.downT = Math.max(p.downT, 0.4);
    // lidský hráč nepřebírá zraněného
    for (const hm of this.humans) if (hm.player && hm.player.injured) { hm.player.ctrl = -1; hm.player = null; this.switchPlayer(hm); }
    const w = this.injWait; if (!w || this.state !== 'play') return;
    w.t += h;
    const own = this.puck.owner || this.puck.held;
    // rozhodčí přeruší hru, až má puk tým zraněného (nebo nikdo), nejpozději po 5 s
    if ((w.t > 1.2 && (!own || own.team === w.p.team)) || w.t > 5) {
      const pk = this.puck;
      pk.owner = null; pk.held = null;
      this.whistle('ZRANĚNÍ', this.nearestDot(pk.x, pk.y));
      this.announceInjury(w.p);
    }
  }
  announceInjury(p) {
    const t = p.team, I = p.injured;
    this.toast = { text: 'ZRANĚNÍ: #' + p.num + ' ' + p.name.toUpperCase() + ' (' + t.def.abbr + ') NEDOHRAJE ZÁPAS', t: 0, dur: 3.2 };
    if (!this.pending) this.lower = { title: '#' + p.num + ' ' + p.name.toUpperCase() + ' (' + t.def.abbr + ')', sub: 'ZRANĚNÍ — ' + I.name + ', nedohraje zápas', team: t, t: 0, dur: 3.6 };
    this.say([pick(['Zdá se, že je zraněný.', 'To nevypadá dobře.', 'Zraněný hráč odchází do kabin.']), p.name, 'nedohraje.'], true);
  }
  nearestDot(x, y) {
    const xs = [-69, -20, 0, 20, 69], ys = [-22, 22];
    const fx = xs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    return fx === 0 ? [0, 0] : [fx, y >= 0 ? 22 : -22];
  }
  boxPos(t) { return { x: t.side === 0 ? -9 : 9, y: -RINK.HW - 3.2 }; }
  endPenalty(pn, enterNow) {
    const i = this.penalties.indexOf(pn); if (i < 0) return;
    this.penalties.splice(i, 1);
    const p = pn.player, t = pn.team;
    p.inBox = false;
    if (!enterNow) return; // sestava se doplní při vhazování
    // hráč na roli se vrací z trestné lavice
    const box = this.boxPos(t), out = this.outRoles(t);
    const L = t.change ? t.change.to : t.line;
    for (const nw of this.lineup(t, L)) {
      if (t.skaters.some((q) => q.role === nw.role) || nw.onIce) continue;
      t.skaters.push(nw);
      Object.assign(nw, { x: box.x, y: -RINK.HW + 2.5, vx: 0, vy: 10, dir: Math.PI / 2, downT: 0, checkT: 0, pokeA: 0, winding: false, windT: 0,
        dekeT: 0, recoverT: 0, inX: 0, inY: 0, turbo: false, oneTimerQ: false, pickCD: 0, faceDir: null, ctrl: -1, onIce: true, goBench: false });
    }
    this.setPlayers(t); this.rebuildAll();
    if (t.humans.length || this.other(t).humans.length) this.toast = { text: 'KONEC VYLOUČENÍ: ' + t.def.abbr, t: 0, dur: 1.8 };
  }
  updatePenalties(h) {
    for (const pn of this.penalties.slice()) { pn.left -= h; if (pn.left <= 0) this.endPenalty(pn, true); }
  }
  boxPlayers() {
    return this.penalties.map((pn) => pn.player);
  }

  // ---------- rozhodčí ----------
  refTarget(r) {
    const pk = this.puck, ax = Math.abs(pk.x), sx = sgn(pk.x || 1);
    if (r.kind === 'R') {
      if (ax < 25) return [pk.x * 0.4, -sgn(pk.y || 1) * (RINK.HW - 6)];
      return [sx * clamp(ax + 12, 30, 82), -sgn(pk.y || 1) * (rinkHalfWidthAt(sx * clamp(ax + 12, 30, 82)) - 6)];
    }
    const bx = r.k * RINK.BLUE_X;
    let tx = ax > RINK.BLUE_X ? (sx === r.k ? bx + r.k * 1.5 : r.k * 6) : bx + (pk.x - bx) * 0.15;
    return [tx, r.side * (RINK.HW - 4.5)];
  }
  updateRefs(h, place) {
    const pk = this.puck;
    for (const r of this.refs) {
      let [tx, ty] = this.refTarget(r);
      const dropping = (this.state === 'faceoff' || this.state === 'intro') && r === this.dropRef;
      if (dropping) { tx = this.foSpot[0]; ty = this.foSpot[1] + r.dropSide * 3.4; }
      else {
        // drž se mimo puk a hráče
        const dpx = r.x - pk.x, dpy = r.y - pk.y, dp = Math.hypot(dpx, dpy);
        if (dp < 14) { tx += (dpx / (dp || 1)) * (14 - dp) * 1.5; ty += (dpy / (dp || 1)) * (14 - dp) * 1.5; }
      }
      if (place) { r.x = tx; r.y = clamp(ty, -RINK.HW + 3, RINK.HW - 3); r.vx = r.vy = 0; }
      const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy), maxV = dropping ? 10 : 21;
      let tvx = 0, tvy = 0;
      if (d > 1) { const m = Math.min(1, d / 10); tvx = (dx / d) * maxV * m; tvy = (dy / d) * maxV * m; }
      let dvx = tvx - r.vx, dvy = tvy - r.vy; const dl = Math.hypot(dvx, dvy), lim = 30 * h;
      if (dl > lim) { dvx *= lim / dl; dvy *= lim / dl; }
      r.vx += dvx; r.vy += dvy; r.x += r.vx * h; r.y += r.vy * h;
      const c = rinkContact(r.x, r.y, 1.4); if (c) { r.x -= c.nx * c.pen; r.y -= c.ny * c.pen; }
      for (const p of this.all) {
        const ex = r.x - p.x, ey = r.y - p.y, e = Math.hypot(ex, ey);
        if (e < 2.6 && e > 0.01) { r.x += (ex / e) * (2.6 - e); r.y += (ey / e) * (2.6 - e); }
      }
      r.spdN = Math.hypot(r.vx, r.vy); r.stride += h * r.spdN * 0.3;
      const fd = dropping ? Math.atan2(-r.dropSide, 0) : Math.atan2(pk.y - r.y, pk.x - r.x);
      r.dir += clamp(angDiff(r.dir, fd), -6 * h, 6 * h);
      r.arm = 0;
      if (dropping && !pk.drop) r.arm = 3;
      if (r.kind === 'R' && (this.state === 'stop' || (this.pending && this.state === 'play'))) r.arm = 1;
      if (r.kind === 'L' && this.icing && this.state === 'play') r.arm = 1; // čárový signalizuje odložený icing
      if (r.kind === 'R' && this.state === 'goal' && this.stateT < 3) { r.arm = 2; r.armDir = Math.atan2(-r.y, this.goalLight * RINK.GOAL_X - r.x); }
    }
  }
  setColors() {
    const [h, a] = this.teams;
    h.jersey = h.def.c1; h.stripe = h.def.c2;
    if (lightness(h.def.c1) > 0.7) {
      a.jersey = a.def.c1; a.stripe = a.def.c2;
      if (lightness(a.def.c1) > 0.7) { a.jersey = a.def.c2; a.stripe = a.def.c1; }
    } else { a.jersey = '#f2f2f2'; a.stripe = a.def.c1; }
    for (const t of this.teams) {
      const L = lightness(t.jersey);
      t.numCol = L > 0.6 ? (lightness(t.stripe) < 0.6 ? t.stripe : '#111') : '#ffffff';
      t.helmet = L > 0.7 ? (lightness(t.stripe) < 0.7 ? t.stripe : t.def.pants) : t.jersey;
      t.pants = t.def.pants;
      // lemovka: kontrastní k dresu i k pruhům
      const d = t.def, cand = L > 0.7 ? [d.c3, d.c2, d.c1, '#111111'] : ['#ffffff', d.c3, d.c2];
      t.trim = cand.find((q) => Math.abs(lightness(q) - L) > 0.3 && q !== t.stripe) || cand[0];
    }
  }
  setDirs() {
    const flip = this.period % 2 === 0;
    this.teams[0].dir = flip ? -1 : 1;
    this.teams[1].dir = -this.teams[0].dir;
  }
  other(t) { return t === this.teams[0] ? this.teams[1] : this.teams[0]; }
  sfx(n, ...a) { if (!this.silent) Sfx[n](...a); }
  say(text, prio, chance) { if (!this.silent) Voice.say(text, prio, chance); }
  showBanner(text, sub, dur = 2, color) { this.banner = { text, sub, t: 0, dur, color }; }
  pop(text, x, y, color = '#fff') { this.pops.push({ text, x, y, t: 0, color }); }
  thinkFor(t) { return t.cpu && this.vsHuman ? this.diff.think : 0.2; }
  aggrFor(t) {
    const base = t.cpu && this.vsHuman ? this.diff.aggr : 0.85;
    const cpuM = t.cpu ? [0.55, 1, 1.5][this.cfg.cpuAggr == null ? 1 : this.cfg.cpuAggr] : 1;
    return base * cpuM * [0.8, 1, 1.2][this.tacOf(t)];
  }
  // taktika právě hrající formace: 0 obranná, 1 vyvážená, 2 útočná
  tacOf(t) { const v = t.tactics && t.tactics[t.line]; return v == null ? 1 : v; }

  // ---------- buly ----------
  setupFaceoff(fx, fy) {
    this.foSpot = [fx, fy]; this.battle = null; for (const t of this.teams) t.zoneT = 0;
    if (this.injWait) { if (this.injWait.p.onIce && !this.toast) this.announceInjury(this.injWait.p); this.injWait = null; }
    for (const t of [this.teams[1], this.teams[0]]) {   // domácí střídají poslední (vidí sestavu hostů)
      this.resetPull(t);
      // střídání při přerušení
      const auto = t.cpu || this.autoChange;
      if (t.iced) { t.iced = false; t.change = null; for (const p of t.skaters) p.goBench = false; this.instantChange(t, t.line); continue; } // po icingu se nestřídá
      if (t.change) this.instantChange(t, t.change.to);
      else if (auto && this.lineEnergy(t, t.line) < 0.72) { const nx = this.pickLine(t); if (this.lineEnergy(t, nx) > this.lineEnergy(t, t.line) + 0.1) this.instantChange(t, nx); }
      // počítač jako domácí: proti nejlepší formaci soupeře pošle svou nejlepší (je-li odpočatá)
      if (t.cpu && t === this.teams[0] && !this.practice && !this.cfg.three && this.other(t).line === 0 && t.line !== 0 && this.lineEnergy(t, 0) > 0.62) this.instantChange(t, 0);
      this.instantChange(t, t.line); // sestava podle vyloučení
      for (const p of t.skaters) p.goBench = false;
      // šestý hráč: počítač ne při vhazování ve vlastním pásmu
      if (this.wantsPull(t, true) && (!t.cpu || t.dir * fx > -30)) this.completePull(t, true);
    }
    for (const t of this.teams) {
      const s = t.dir;
      const pos = { C: [fx - s * 2.4, fy], LW: [fx - s * 4, fy + s * 15], RW: [fx - s * 4, fy - s * 15], LD: [fx - s * 17, fy + s * 10], RD: [fx - s * 17, fy - s * 10], X: [fx - s * 9, fy + (fy >= 0 ? -1 : 1) * 7] };
      for (const p of t.skaters) {
        p.foTake = p.role === 'C' && !p.extra; p.foReady = true; p.foSwipe = 0;
        let [x, y] = pos[p.extra ? 'X' : p.role];
        x = clamp(x, -85, 85); const hw = rinkHalfWidthAt(x) - 3; y = clamp(y, -hw, hw);
        Object.assign(p, { x, y, vx: 0, vy: 0, dir: s > 0 ? 0 : Math.PI, downT: 0, checkT: 0, pokeA: 0, winding: false, windT: 0,
          dekeT: 0, recoverT: 0, inX: 0, inY: 0, turbo: false, oneTimerQ: false, pickCD: 0, faceDir: null });
        p.ai.t = rand(0, 0.3);
      }
      const g = t.goalie;
      Object.assign(g, { x: -s * (RINK.GOAL_X - 2.5), y: 0, vx: 0, vy: 0, dir: s > 0 ? 0 : Math.PI, holdT: 0, saveT: 0, downT: 0 });
      g.ai.tx = g.x; g.ai.ty = g.y;
    }
    const pk = this.puck;
    Object.assign(pk, { x: fx, y: fy, z: 4.5, vx: 0, vy: 0, vz: 0, owner: null, held: null, passTarget: null, passT: 0, wasPass: false,
      shot: null, lastTouch: null, history: [], oneTimer: false, reboundT: 0, deflT: 0, drop: false, inNet: 0 });
    pk.ignore.clear();
    // čárový jde k bodu vhazování, ostatní na svá místa
    let best = null, bd = 1e9;
    for (const r of this.refs) if (r.kind === 'L') { const d = Math.abs(r.k * RINK.BLUE_X - fx); if (d < bd) { bd = d; best = r; } }
    this.dropRef = Math.abs(fx) < 1 ? this.refs[0] : best;
    this.dropRef.dropSide = fy > 0 ? 1 : -1;
    if (Math.abs(fy) < 1) this.dropRef.dropSide = -1;
    for (const t of this.teams) {
      for (const p of t.roster) p.ctrl = -1;
      const order = ['C', 'RW', 'LW', 'LD', 'RD'];
      t.humans.forEach((h, i) => { const p = t.skaters.find((q) => q.role === order[i % 5] && q.ctrl < 0) || t.skaters.find((q) => q.ctrl < 0); h.player = p; if (p) p.ctrl = h.idx; h.foPress = -9; });
    }
    this.state = 'faceoff'; this.stateT = 0; this.camSnap = true;
    this.updateRefs(0, true);   // až teď: vhazující rozhodčí se postaví přímo k bodu vhazování
    if (this.practice && this.practice.kind === 'shoot') {
      const t = this.teams[0], h = this.humans[0], p = (h && h.player) || t.skaters[0];
      Object.assign(pk, { z: 0, owner: p, lastTouch: p, history: [p] });
      p.x = fx - t.dir * 3; p.y = fy;
      for (const q of this.all) { q.foTake = false; q.foReady = false; }
      this.state = 'play';
    }
  }
  resolveFaceoff() {
    const c = this.teams.map((t) => t.skaters.find((p) => p.role === 'C') || t.skaters.find((p) => p.role[1] === 'W') || t.skaters[0]);
    let pr0 = 0.5 + (c[0].pas - c[1].pas) * 0.6;
    for (let i = 0; i < 2; i++) {
      const t = this.teams[i];
      let bonus = 0;
      const h = this.humans.find((q) => q.player === c[i]);
      if (h) { const d = this.time - h.foPress; if (d >= 0 && d < 0.4) bonus = 0.3; else if (d < 1.0) bonus = 0.08; }
      else if (t.cpu && this.vsHuman) bonus = this.diff.fo;
      if (t.skaters.some((q) => q.cap)) bonus += 0.03;   // kapitán na ledě
      pr0 += i === 0 ? bonus : -bonus;
    }
    const [fx, fy] = this.foSpot, pk = this.puck;
    // vázání: vyrovnané buly skončí volným pukem mezi centry
    if (Math.abs(clamp(pr0, 0.08, 0.92) - 0.5) < 0.12 && Math.random() < 0.2) {
      const a = rand(0, TAU); pk.vx = Math.cos(a) * rand(3, 7); pk.vy = Math.sin(a) * rand(3, 7); pk.z = 0; pk.vz = 0;
      pk.lastTouch = null; pk.history = []; c[0].pickCD = c[1].pickCD = 0.55;
      this.pop('VÁZÁNÍ', fx, fy, '#cfd8ea');
    } else {
      const win = Math.random() < clamp(pr0, 0.08, 0.92) ? 0 : 1, W = this.teams[win], s = W.dir;
      c[win].stats.fw++; c[1 - win].stats.fl++;
      const hw = this.humans.find((q) => q.player === c[win]);
      const fwd = hw ? hw.foFwd : (W.cpu && s * fx > 40 && Math.random() < 0.25);
      const tx = fwd ? fx + s * 7 : fx - s * 14, ty = fy + (fwd ? sgn(-fy || 1) * rand(3, 7) : rand(-9, 9)), d = Math.hypot(tx - fx, ty - fy), sp = fwd ? rand(10, 14) : rand(13, 19);
      pk.vx = ((tx - fx) / d) * sp; pk.vy = ((ty - fy) / d) * sp; pk.z = 0; pk.vz = 0;
      pk.lastTouch = c[win]; pk.history = [c[win]];
    }
    if (pk.lastTouch) c[0].pickCD = c[1].pickCD = 0.2;
    for (const p of this.all) { p.foTake = false; p.foReady = false; }
    c[0].foSwipe = c[1].foSwipe = 0.35;
    this.state = 'play'; this.stateT = 0;
    this.sfx('stick', 0.7);
  }

  // ---------- hlavní smyčka ----------
  update(dt) {
    if (this.paused) return;
    this.handleHumans(dt);
    this.acc += dt;
    const h = 1 / 120; let n = 0;
    while (this.acc >= h && n < 10) { this.step(h); this.acc -= h; n++; }
    if (n >= 10) this.acc = 0;
    // efekty
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.lower) { this.lower.t += dt; if (this.lower.t > this.lower.dur) this.lower = null; }
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.6);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.goalLightT = Math.max(0, this.goalLightT - dt);
    // nadšení davu
    const pk = this.puck;
    let ex = clamp((Math.abs(pk.x) - 45) / 45, 0, 1) * 0.7;
    if (pk.shot) ex = 0.9;
    if (this.state === 'goal') ex = 1;
    Sfx.target = ex;
    Sfx.tick(dt, this.silent ? 0.45 : 1);
  }
  step(h) {
    this.time += h; this.stateT += h;
    const pk = this.puck;
    if (this.state !== 'replay') { this.updateEnergy(h); this.updateRefs(h, false); }
    if (this.toast) { this.toast.t += h; if (this.toast.t > this.toast.dur) this.toast = null; }
    switch (this.state) {
      case 'intro':
        this.freeze();
        if (this.stateT > 2.2) { this.state = this.practice && this.practice.kind === 'shoot' ? 'play' : 'faceoff'; this.stateT = 0; }
        break;
      case 'faceoff':
        this.freeze();
        this.goalieMoveAll(h);
        if (!pk.drop && this.stateT > 0.9) { pk.drop = true; }
        if (pk.drop) { pk.vz -= PH.G * h; pk.z += pk.vz * h; if (pk.z <= 0) { pk.z = 0; this.resolveFaceoff(); } }
        break;
      case 'play':
        if (!this.practice) this.clock -= h;
        else if (this.practice.kind === 'pp' && this.teams[0].dir * pk.x < RINK.BLUE_X - 3 && !pk.inNet) { this.whistle('VYHOZENO', this.practiceSpot()); break; }
        this.thinkAll(h);
        this.movePlayers(h);
        this.updatePuck(h);
        this.updateBattle(h);
        this.updatePressure(h);
        this.updateChanges(h);
        this.updatePenalties(h);
        this.checkOffside();
        this.checkIcing();
        this.updateInjuries(h);
        this.record();
        if (this.clock <= 0 && this.state === 'play') { this.clock = 0; this.endPeriod(); }
        break;
      case 'stop':
        this.glide(); this.movePlayers(h); this.updatePuck(h); this.updateInjuries(h);
        if (this.psPending && this.stateT > 1.6) { this.beginPenaltyShot(); break; }
        if (this.stateT > 1.4 && !this.psPending) {
          this.setupFaceoff(this.stopSpot[0], this.stopSpot[1]);
          if (Math.random() < 0.5) this.sfx('organ', Math.floor(Math.random() * 4));
        }
        break;
      case 'goal':
        this.glide(); this.movePlayers(h); this.updatePuck(h);
        if (this.stateT < 1.2) this.record();
        if (this.stateT > 3.6) this.afterGoal();
        break;
      case 'replay': {
        const r = this.replay;
        r.f += h * 60 * 0.55;
        if (r.f >= r.frames.length - 1) this.endReplay();
        break;
      }
      case 'periodEnd':
        // rolba: ručně (lidský hráč ji může řídit), automaticky, nebo vůbec
        if (this.cfg.zamboni === 'manual' && this.humans.length && !this.zamUsed && this.stateT > 3) this.startZamboni();
        else if (this.stateT > 14) this.nextPeriod();
        break;
      case 'zamboni':
        this.updateZamboni(h);
        break;
      case 'shootout':
        this.stepShootout(h);
        break;
      case 'final':
        if (this.demo && this.stateT > 6) this.over = true;
        break;
    }
  }
  confirm() {
    if (this.state === 'replay') this.endReplay();
    else if (this.state === 'goal' && this.stateT > 1.2) this.afterGoal();
    else if (this.state === 'periodEnd' && this.stateT > 1.2) this.nextPeriod();
    else if (this.state === 'final' && this.stateT > 1.5) this.over = true;
  }
  freeze() {
    for (const p of this.all) {
      p.vx = 0; p.vy = 0; p.spdN = 0; p.carry = false;
      if (!p.isGoalie) { const s = p.team.dir; p.dir = s > 0 ? 0 : Math.PI; }
    }
  }
  glide() { for (const p of this.all) { if (p.ctrl < 0 || this.state !== 'play') { p.inX = 0; p.inY = 0; p.turbo = false; p.winding = false; p.windT = 0; } } }

  // ---------- lidští hráči ----------
  handleHumans(dt = 1 / 60) {
    const pk = this.puck;
    for (const h of this.humans) {
      const d = h.dev, p = h.player;
      if (!p && this.state !== 'shootout') continue;
      const st = d.st;
      if (this.state === 'shootout') { this.soHuman(h); continue; }
      if (d.pressed('lb')) this.requestChange(h.team, true);
      const ax = st.lx, ay = -st.ly; // páčka → svět podle kamery
      p.inX = ax * VIEW.rx + ay * VIEW.fx; p.inY = ax * VIEW.ry + ay * VIEW.fy; p.turbo = st.rt || st.rb;
      // pravá páčka: kam držet hůl s pukem (vůči tělu hráče), plynule
      if (st.rx || st.ry) {
        const wx = st.rx * VIEW.rx - st.ry * VIEW.fx, wy = st.rx * VIEW.ry - st.ry * VIEW.fy, c = Math.cos(p.dir), s = Math.sin(p.dir);
        const k = Math.min(1, dt * 14), o = p.stk || [p.hand * 0.4, 0];
        p.stk = [o[0] + (clamp(-wx * s + wy * c, -1, 1) - o[0]) * k, o[1] + (clamp(wx * c + wy * s, -1, 1) - o[1]) * k];
      } else p.stk = null;
      if (this.state === 'faceoff') {
        // páčka k soupeřově brance při stisku = vyhrát buly dopředu (na střelu), jinak dozadu k obránci
        if (d.pressed('a') || d.pressed('x')) { h.foPress = this.time; h.foFwd = (p.inX * h.team.dir) > 0.5; }
        if (h.assist >= 2) h.foPress = this.time - 0.1; continue;
      }
      if (this.state !== 'play') continue;
      const B = this.battle;
      if (B && (B.a === p || B.b === p)) { if (d.pressed('x') || d.pressed('b')) { if (B.a === p) B.pa = Math.min(4, B.pa + 1); else B.pb = Math.min(4, B.pb + 1); } continue; }
      if (h.assist) this.assistHuman(h, Math.hypot(st.lx, st.ly) > 0.25);
      const lt = st.lt;
      if (d.pressed('a')) {
        const back = pk.owner === p && p.spdN > 9 && Math.hypot(p.inX, p.inY) > 0.5 && (p.inX * p.vx + p.inY * p.vy) / p.spdN < -0.6;
        if (pk.owner === p && lt) this.bankPass(p, this.choosePassTarget(p, p.inX, p.inY));
        else if (back && this.dropPass(p)) {}
        else if (pk.owner === p) this.pass(p, this.choosePassTarget(p, p.inX, p.inY), false);
        else if (!pk.owner && pk.passTarget === p) p.oneTouchQ = true;
        else if (pk.owner && pk.owner.team === p.team && pk.owner.ctrl < 0) this.pass(pk.owner, p, false);
        else if (pk.held && pk.held.team === p.team) this.passTo(pk.held, p.x, p.y, false, p);
        else this.switchPlayer(h);
      }
      if (d.pressed('x')) {
        const q = h.player;
        if (pk.owner === q) { q.winding = true; q.windT = 0; q.snapQ = lt; }
        else if (!pk.owner && pk.passTarget === q) q.oneTimerQ = true;
        else if (lt) this.dive(q);
        else this.startCheck(q);
      }
      const cur = h.player;
      if (cur.winding && !st.x) this.releaseShot(cur, cur.snapQ || st.lt);
      if (d.pressed('b')) { if (pk.owner === cur) this.deke(cur); else if (this.time - (cur.relT || -9) > 0.6) { if (lt) this.liftStick(cur); else this.poke(cur); } }
      if (d.pressed('y')) { if (pk.owner === cur) this.saucer(cur, cur.inX, cur.inY); else this.switchPlayer(h); }
    }
  }
  // paměť poloh pro zpožděné reakce AI (posledních ~0,5 s, krok 1/120 s)
  remember(p) {
    if (!p.hb) { p.hb = new Float32Array(64 * 4); p.hi = 0; p.hn = 0; }
    const i = p.hi * 4; p.hb[i] = p.x; p.hb[i + 1] = p.y; p.hb[i + 2] = p.vx; p.hb[i + 3] = p.vy;
    p.hi = (p.hi + 1) % 64; p.hn = Math.min(64, p.hn + 1);
  }
  // kde AI „vidí“ hráče: se zpožděním podle obtížnosti (klička obránce zmate)
  seen(p, t) {
    let tau = (t.cpu && this.vsHuman ? this.diff.react : 0.14) + (p.dekeT > 0 ? 0.15 : 0);
    const k = Math.min(Math.round(tau * 120), (p.hn || 0) - 1);
    if (!p.hb || k <= 0) return { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    const i = ((p.hi - 1 - k) % 64 + 64) % 64 * 4, b = p.hb;
    // poloha z minulosti posunutá o tehdejší rychlost (AI odhaduje, kam jedeš)
    return { x: b[i] + b[i + 2] * tau, y: b[i + 1] + b[i + 3] * tau, vx: b[i + 2], vy: b[i + 3] };
  }
  // vibrace ovladače hráče, který ovládá p
  feel(p, s, ms) { if (p.ctrl < 0 || this.silent) return; const h = this.humans.find((q) => q.player === p); if (h) Input.rumble(h.dev, s, ms); }
  // ---------- asistence pro lidského hráče (1 = částečná, 2 = plná / děti) ----------
  assistOf(p) { if (p.ctrl < 0) return 0; const h = this.humans.find((q) => q.player === p); return h ? h.assist : 0; }
  assistHuman(h, stick) {
    const pk = this.puck, p = h.player, own = pk.owner || pk.held, ours = own && own.team === h.team;
    // automatické přepnutí na hráče nejblíž puku, když ho nemáme
    h.swT -= 1 / 60;
    if (!ours && h.swT <= 0 && p !== pk.owner) {
      h.swT = h.assist >= 2 ? 0.25 : 0.6;
      const dp = Math.hypot(p.x - pk.x, p.y - pk.y);
      let best = null, bd = dp - (h.assist >= 2 ? 4 : 9);
      for (const q of h.team.skaters) { if (q === p || q.ctrl >= 0 || q.goBench || q.injured || q.downT > 0) continue; const d = Math.hypot(q.x - pk.x, q.y - pk.y); if (d < bd) { bd = d; best = q; } }
      if (best) this.assign(h, best);
    }
    if (h.assist < 2) return;
    const c = h.player;
    // plná asistence: bez páčky hráč sám napadá soupeře s pukem / jede pro volný puk
    const kids = !!this.diff.kids;
    if (!stick && pk.owner !== c && !ours && (kids || Math.hypot(pk.x - c.x, pk.y - c.y) < 30)) {
      const tx = own ? own.x + own.vx * 0.25 : pk.x + pk.vx * 0.2, ty = own ? own.y + own.vy * 0.25 : pk.y + pk.vy * 0.2;
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
      c.inX = dx / d; c.inY = dy / d; c.turbo = kids && d > 12;
      h.autoT -= 1 / 60;
      if (own && d < 4.5 && h.autoT <= 0) { h.autoT = kids ? 0.5 : 1.1; if (Math.random() < 0.7) this.poke(c); else this.startCheck(c); }
    }
  }
  switchPlayer(h) {
    const pk = this.puck; let best = null, bd = 1e9;
    for (const q of h.team.skaters) {
      if (q === h.player || (q.ctrl >= 0 && q.ctrl !== h.idx) || q.goBench || q.injured) continue;
      const d = Math.hypot(q.x - pk.x, q.y - pk.y) + (q.downT > 0 ? 30 : 0);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) this.assign(h, best);
  }
  assign(h, p) {
    if (h.player === p) return;
    if (h.player) { h.player.ctrl = -1; h.player.winding = false; h.player.windT = 0; h.player.stk = null; }
    h.player = p; p.ctrl = h.idx; p.oneTimerQ = false;
  }

  // ---------- akce ----------
  choosePassTarget(p, ix, iy) {
    const m = Math.hypot(ix, iy), a = m > 0.3 ? Math.atan2(iy, ix) : p.dir;
    let best = null, bs = 1e9;
    for (const q of p.team.skaters) {
      if (q === p || q.downT > 0) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      let s = Math.abs(angDiff(a, Math.atan2(dy, dx))) * 45 + d * 0.22;
      if (this.laneBlocked(p, q)) s += 14;
      if (s < bs) { bs = s; best = q; }
    }
    return best;
  }
  laneBlocked(p, q) {
    for (const o of this.other(p.team).skaters) {
      if (o.downT > 0) continue;
      if (segDist(o.x, o.y, p.x, p.y, q.x, q.y) < 3.2) {
        const t = ((o.x - p.x) * (q.x - p.x) + (o.y - p.y) * (q.y - p.y)) / ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 + 0.01);
        if (t > 0.08 && t < 0.95) return true;
      }
    }
    return false;
  }
  pass(p, m, saucer) { if (m) this.passTo(p, m.x, m.y, saucer, m); }
  // zpětná přihrávka na místo (drop pass): puk zůstane ležet pro spoluhráče za tebou
  dropPass(p) {
    const pk = this.puck, sp = Math.hypot(p.vx, p.vy) || 1;
    const m = p.team.skaters.find((q) => q !== p && q.downT <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < 22 && ((q.x - p.x) * p.vx + (q.y - p.y) * p.vy) / sp < -2);
    if (!m) return false;
    pk.owner = null; pk.vx = -p.vx / sp * 4 + p.vx * 0.1; pk.vy = -p.vy / sp * 4 + p.vy * 0.1; pk.vz = 0; pk.z = 0;
    pk.passTarget = m; pk.passT = 1.2; pk.wasPass = true; pk.shot = null; pk.lastTouch = p;
    p.pickCD = 0.7; p.relT = this.time; p.passFT = 0.2;
    this.pop('NECHÁVÁ', p.x, p.y, '#cfd8ea'); this.sfx('stick', 0.4);
    return true;
  }
  // přihrávka o mantinel: míří do bodu na mantinelu tak, aby se puk odrazil ke spoluhráči
  bankPass(p, m) {
    const pk = this.puck; if (!m || (pk.owner !== p)) return;
    const tx = m.x + m.vx * 0.5, ty = m.y + m.vy * 0.5;
    if (Math.abs(pk.x) > 70 || Math.abs(tx) > 70) return this.pass(p, m, false);   // v rozích by odraz nevyšel
    const side = (pk.y + ty) >= 0 ? 1 : -1, wy = side * (RINK.HW - PH.PR), e = 0.5;
    const dP = Math.abs(wy - pk.y), dT = Math.abs(wy - ty), L = tx - pk.x;
    const ax = pk.x + L * dP / (dP + dT / e), a = Math.atan2(wy - pk.y, ax - pk.x) + gauss() * (1.15 - p.pas) * 0.05;
    const speed = clamp(Math.hypot(L, dP + dT) * 0.6 + 45, 55, 85);
    pk.owner = null; pk.vx = Math.cos(a) * speed; pk.vy = Math.sin(a) * speed; pk.vz = 0; pk.z = 0;
    pk.passTarget = m; pk.passT = 2.5; pk.wasPass = true; pk.shot = null; pk.oneTimer = false; pk.lastTouch = p;
    p.pickCD = 0.3; p.winding = false; p.windT = 0; p.relT = this.time; p.passFT = 0.22;
    this.pop('O MANTINEL', p.x, p.y, '#cfd8ea'); this.sfx('stick', 0.7);
  }
  passTo(p, tx, ty, saucer, m) {
    const pk = this.puck;
    if (pk.owner !== p && pk.held !== p) return;
    let dist = Math.hypot(tx - pk.x, ty - pk.y);
    let speed = saucer ? clamp(dist * 0.8 + 22, 30, 62) : clamp(dist * 0.7 + 40, 46, 84);
    // přehled (PŘE): lepší hráč líp nahraje do běhu, naslepo za záda i na dlouhou vzdálenost
    const vis = p.isGoalie ? 0.5 : clamp((p.pas - 0.9) / 0.18, 0, 1);
    if (m) for (let i = 0; i < 2; i++) {
      const t = dist / speed, lead = 0.7 + 0.25 * vis;
      tx = m.x + m.vx * t * lead; ty = m.y + m.vy * t * lead;
      dist = Math.hypot(tx - pk.x, ty - pk.y);
    }
    let err = (1.15 - p.pas) * 0.07;
    if (!p.isGoalie && Math.abs(angDiff(p.dir, Math.atan2(ty - pk.y, tx - pk.x))) > 1.7) err += 0.015 + (1 - vis) * 0.05;
    if (dist > 55) err += (1 - vis) * 0.02;
    const ang = Math.atan2(ty - pk.y, tx - pk.x) + gauss() * err;
    pk.owner = null; pk.held = null;
    pk.vx = Math.cos(ang) * speed; pk.vy = Math.sin(ang) * speed;
    if (saucer) { const t = dist / speed; pk.vz = PH.G * t * 0.5; pk.z = 0.3; } else { pk.vz = 0; pk.z = 0; }
    pk.passTarget = m || null; pk.passT = dist / speed + 0.6; pk.wasPass = true; pk.shot = null; pk.oneTimer = false;
    pk.lastTouch = p; p.pickCD = 0.3; p.winding = false; p.windT = 0; p.relT = this.time; p.passFT = saucer ? 0.3 : 0.22; p.actDir = ang;
    if (p.isGoalie) { p.holdT = 0; pk.ignore.set(p, this.time + 0.8); }
    this.sfx('stick', 0.7);
  }
  saucer(p, ix, iy) {
    const s = p.team.dir, m = Math.hypot(ix, iy);
    const q = m > 0.3 ? this.choosePassTarget(p, ix, iy) : null;
    if (q && Math.abs(angDiff(Math.atan2(iy, ix), Math.atan2(q.y - p.y, q.x - p.x))) < 0.6) this.pass(p, q, true);
    else this.dump(p);
  }
  dump(p) {
    const s = p.team.dir;
    // u mantinelu: puk po zemi podél mantinelu, objede roh za brankou
    if (Math.abs(p.y) > 22 && s * p.x < 60) { this.passTo(p, s * 93, sgn(p.y) * 41, false, null); return; }
    this.passTo(p, s * 84, (p.y >= 0 ? 1 : -1) * 28 * (Math.random() < 0.3 ? -1 : 1), true, null);
  }
  // X: ťuknutí = zápěstí, držení = příklep; LT + X = švihovka nahoru; páčka od branky = placka k ledu
  releaseShot(p, snap) {
    const w = p.windT, s = p.team.dir;
    const aim = p.ctrl >= 0 && Math.abs(p.inY) > 0.35 ? sgn(p.inY) : null;
    const low = p.ctrl >= 0 && p.inX * s < -0.5;
    if (w < 0.22) this.shoot(p, 0, false, aim, false, { snap, z: snap ? 'high' : low ? 'low' : null });
    else { p.swingT = SWING_T; p.swingW = w; p.swingArgs = [clamp((w - 0.22) / 0.75, 0, 1), true, aim, false, { z: low ? 'low' : null }]; p.winding = false; }
  }
  shoot(p, power, slap, aimY, oneTimer, opt = {}) {
    const pk = this.puck;
    if (pk.owner !== p) { p.winding = false; p.windT = 0; return; }
    const s = p.team.dir, nx = s * RINK.GOAL_X, g = this.other(p.team).goalie;
    let ty;
    const ast = this.assistOf(p);
    if (ast >= 2 && aimY == null) aimY = null; // plná asistence: bez míření páčkou střílí sám do volného rohu
    const empty = this.goalieOff(this.other(p.team));
    if (empty) ty = (aimY != null ? aimY * 1.2 : 0) + rand(-0.8, 0.8);
    else if (aimY != null) ty = aimY * 2.45;
    else {
      const off = g.y;
      ty = (Math.abs(off) > 0.4 ? -sgn(off) : pick([-1, 1])) * 2.45;
      if (Math.random() < 0.25) ty *= rand(0, 0.6);
    }
    const tz = empty ? rand(0.1, 1.2) : opt.z === 'high' ? rand(2.5, 3.75) : opt.z === 'low' ? rand(0.1, 0.6) : slap ? rand(0.15, 3.6) : rand(0.25, 3.3);
    const dx = nx - pk.x, dy = ty - pk.y, d = Math.hypot(dx, dy);
    const ft = this.fat(p);
    // bekhend: střela „přes tělo" (hráč není natočený k brance) – slabší a méně přesná, ale brankáře zaskočí
    const sd = angDiff(p.dir, Math.atan2(dy, dx)), bh = !slap && !oneTimer && ((sgn(sd) === -sgn(p.hand) && Math.abs(sd) > 1.3) || Math.abs(sd) > 2.6);   // na straně bez hole
    let speed = slap ? (80 + 38 * power) * p.pow * (0.85 + 0.15 * ft) : (58 + 16 * p.pow) * (0.9 + 0.1 * ft);
    if (opt.snap) speed *= 1.12; if (bh) speed *= 0.8;
    let err = ((slap ? 0.05 : 0.036) * (1.32 - p.acc) + clamp(d / 100, 0, 0.6) * 0.03) / (0.7 + 0.3 * ft);
    err *= p.snipe || 1;
    if (opt.snap) err *= 1.35; if (bh) err *= 1.25;
    if (p.team.cpu && this.vsHuman) err *= 2 - this.diff.cpuAcc;
    if (oneTimer) err *= 1.25;
    if (ast) err *= ast >= 2 ? (this.diff.kids ? 0.4 : 0.6) : 0.8;
    const ang = Math.atan2(dy, dx) + gauss() * err;
    const t = d / speed, vz = (tz + 0.5 * PH.G * t * t) / t;
    pk.owner = null; pk.vx = Math.cos(ang) * speed; pk.vy = Math.sin(ang) * speed; pk.vz = vz; pk.z = 0.1;
    pk.shot = { by: p, team: p.team, t: this.time, counted: false, dist: d, deke: this.time - (p.dekeAt || -9) < 0.7, sx: pk.x, sy: pk.y, bh, high: opt.z === 'high', snap: !!opt.snap };
    if (this.state === 'play') { pk.shot.log = { team: p.team, u: s * pk.x, v: s * pk.y, res: 'miss', by: p, t: this.time }; this.shotLog.push(pk.shot.log); }
    if (bh) this.pop('BEKHEND', p.x, p.y, '#cfd8ea'); else if (opt.snap) this.pop('ŠVIHOVKA', p.x, p.y, '#cfd8ea');
    p.team.crashT = this.time + 1.6; p.team.crashBy = p; pk.shot.human = p.ctrl >= 0;
    pk.oneTimer = !!oneTimer; pk.passTarget = null; pk.wasPass = false; pk.lastTouch = p; p.pickCD = 0.35;
    p.winding = false; p.windT = 0; p.relT = this.time; p.shotFT = slap ? 0.5 : 0.32; p.shotSlap = slap; p.actDir = ang; p.shotBh = bh;
    if (slap) this.sfx('slap', 0.6 + 0.4 * power); else this.sfx('stick', 1);
    if (oneTimer) { this.pop('Z PRVNÍ!', p.x, p.y, '#ffd21f'); this.say('Z první!', false, 0.6); }
    else if (slap && Math.abs(pk.x - nx) > 45) this.say('Dělovka od modré!', false, 0.35);
    else this.say(pick(['Střela!', 'Pálí!']), false, 0.18);
  }
  startCheck(p) {
    if (p.checkCD > 0 || p.downT > 0 || p.carry) return;
    p.checkCD = 0.9; p.checkT = 0.4; p.checkHit = false; p.hip = false;
    // bodyček bokem: stojíš (pomalu) a soupeř s pukem projíždí kolem tebe
    const o = this.puck.owner;
    if (p.spdN < 9 && o && o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) < 5.5 && Math.hypot(o.vx, o.vy) > 12) {
      p.hip = true; p.checkT = 0.35;
      const nx = o.x - p.x, ny = o.y - p.y, d = Math.hypot(nx, ny) || 1; p.vx += nx / d * 5; p.vy += ny / d * 5;
      return;
    }
    p.vx += Math.cos(p.dir) * 9; p.vy += Math.sin(p.dir) * 9;
    const sp = Math.hypot(p.vx, p.vy); if (sp > 34) { p.vx *= 34 / sp; p.vy *= 34 / sp; }
  }
  // zvednutí hokejky (LT + B): stejný pohyb hole jako šťouchnutí, vyhodnotí se až při dotyku
  liftStick(p) { this.poke(p, true); }
  // lehnout do střely (LT + X bez puku): velká šance zblokovat, ale chvíli ležíš
  dive(p) {
    if (p.downT > 0 || p.carry) return;
    const pk = this.puck, o = pk.owner;
    p.downT = 0.95; p.blockT = 0.95; p.lie = p.dir; p.winding = false;
    if (o) p.lie = Math.atan2(o.y - p.y, o.x - p.x);
    p.vx *= 0.4; p.vy *= 0.4;
    this.pop('LEHÁ DO STŘELY', p.x, p.y, '#cfd8ea');
  }
  // šťouchnutí holí: hůl vyjede směrem k puku a zásah se vyhodnotí, až čepel doopravdy dorazí (pokeResolve)
  poke(p, lift) {
    if (p.pokeCD > 0 || p.downT > 0) return;
    p.pokeCD = lift ? 0.7 : 0.55; p.pokeA = 1; p.pokeHit = false; p.pokeLift = !!lift;
    const pk = this.puck, a = Math.atan2(pk.y - p.y, pk.x - p.x), d = Math.hypot(pk.x - p.x, pk.y - p.y);
    const cone = p.ctrl < 0 ? 1.3 : this.assistOf(p) >= 2 ? 1.6 : 1.1;   // hůl dosáhne jen před hráče
    p.pokeDir = d < 9 && Math.abs(angDiff(p.dir, a)) < cone ? a : p.dir;
  }
  // čepel je vysunutá: co hůl (úsečka hráč → čepel) opravdu zasáhla?
  pokeResolve(p) {
    const pk = this.puck, o = pk.owner, R = p.reach, b = pokeBlade(p.pokeDir, 0.5, R), bx = p.x + b[0], by = p.y + b[1];
    const onPuck = pk.z < 1.5 && segDist(pk.x, pk.y, p.x, p.y, bx, by) < 1.7 && Math.hypot(pk.x - p.x, pk.y - p.y) > 1.5;
    const touches = (q) => Math.hypot(q.x - p.x, q.y - p.y) > 2 && segDist(q.x, q.y, p.x, p.y, bx, by) < PH.PLR + 0.2;   // hůl o tělo / brusle
    if (o && o.team !== p.team) {
      const behind = Math.cos(o.dir) * (o.x - p.x) + Math.sin(o.dir) * (o.y - p.y) > 1.5; // útočí zezadu
      const body = touches(o);
      if (p.pokeLift) {
        // zvednutí hole: čepel musí k holi soupeře (k puku), nejlíp z boku nebo zezadu
        if (!onPuck && !(body && Math.hypot(pk.x - bx, pk.y - by) < 3)) return;
        const side = Math.abs(angDiff(o.dir, Math.atan2(p.y - o.y, p.x - o.x))) > 1.0;
        let ch = (side ? 0.5 : 0.2) + 0.3 * (p.chk * this.fat(p) - o.chk);
        if (o.dekeT > 0) ch *= 0.5;
        if (Math.random() < ch) {
          this.loosePuck(o, o.vx * 0.35 + rand(-3, 3), o.vy * 0.35 + rand(-3, 3)); o.pickCD = 0.6; p.pickCD = 0;
          this.pop('ZVEDNUTÁ HŮL', o.x, o.y, '#cfd8ea'); this.sfx('stick', 0.7);
        } else if (body && behind && Math.random() < 0.03) this.foul(p, o, 'hook');
        return;
      }
      if (onPuck) {
        let ch = 0.5 + 0.35 * (p.chk * this.fat(p) - 1) - 0.25 * (o.chk - 1) - 0.15 * (o.mass - p.mass);
        if (p.team.cpu && this.vsHuman) ch += (this.diff.aggr - 1) * 0.15;
        const pa = this.assistOf(p); if (pa) ch += pa >= 2 ? (this.diff.kids ? 0.25 : 0.1) : 0.05;
        if (o.dekeT > 0) ch *= 0.3;
        if ((p.x - o.x) * (pk.x - o.x) + (p.y - o.y) * (pk.y - o.y) < 0) ch -= 0.08 + 0.25 * (o.chk - 1);   // puk krytý tělem
        if (o.winding) ch += 0.2;
        if (Math.random() < ch) {
          const a = p.pokeDir + rand(-0.9, 0.9), v = rand(9, 17);
          this.loosePuck(o, Math.cos(a) * v + o.vx * 0.3, Math.sin(a) * v + o.vy * 0.3);
          p.pickCD = 0.1; this.sfx('stick', 0.8);
          if (body && behind && Math.random() < 0.015) this.foul(p, o, 'hook');
        } else if (body && behind && Math.random() < 0.025) this.foul(p, o, 'hook');
      } else if (body) {
        // hůl minula puk a trefila hráče: zezadu hákování, do bruslí podražení
        if (behind && Math.random() < 0.04) this.foul(p, o, 'hook');
        else if (Math.random() < 0.02) {
          o.downT = 0.8; o.lie = Math.atan2(o.y - p.y, o.x - p.x); this.loosePuck(o, o.vx * 0.5, o.vy * 0.5);
          this.foul(p, o, 'trip');
        }
      }
      return;
    }
    if (!o && !pk.held && onPuck && !p.pokeLift) {
      pk.vx = Math.cos(p.pokeDir) * 14 + p.vx * 0.5; pk.vy = Math.sin(p.pokeDir) * 14 + p.vy * 0.5; pk.lastTouch = p;
      this.sfx('stick', 0.5); return;
    }
    // sekání: hůl zasáhla soupeře bez puku
    for (const q of this.other(p.team).skaters) {
      if (q.downT > 0 || q === o || !touches(q)) continue;
      if (Math.random() < 0.08) this.foul(p, q, 'slash');
      break;
    }
  }
  deke(p) {
    if (p.dekeT > 0) return;
    p.dekeT = 0.45; p.dekeAt = this.time;
    const lx = -Math.sin(p.dir), ly = Math.cos(p.dir);
    let side = Math.random() < 0.5 ? -1 : 1;
    if (p.ctrl >= 0 && Math.hypot(p.inX, p.inY) > 0.3) side = sgn(lx * p.inX + ly * p.inY);
    p.vx += lx * side * 9; p.vy += ly * side * 9;
  }
  loosePuck(from, vx, vy) {
    const pk = this.puck;
    pk.owner = null; pk.vx = vx; pk.vy = vy; pk.vz = 0; pk.z = 0; pk.passTarget = null; pk.shot = null;
    from.pickCD = 0.45; from.winding = false; from.windT = 0;
  }
  hit(a, b, rel, nx, ny) {
    const sp = Math.hypot(a.vx, a.vy);
    // hybnost: těžší a rychlejší útočník srazí lehčího soupeře, do těžkého se odrazí sám
    const mr = a.mass / b.mass;
    const force = (Math.max(rel, 0) + sp * 0.35) * Math.pow(mr, 0.5) + 6 * a.chk * this.fat(a) - 6 * (b.chk * this.fat(b) - 0.9) + (a.turbo ? 3 : 0) + (mr - 1) * 8
      + (a.hip ? 4 + Math.hypot(b.vx, b.vy) * 0.25 : 0) + (a.trait === 'E' ? 3 : 0);
    if (a.hip && force > 16) this.pop('BOKEM!', b.x, b.y, '#ff9a5a');
    a.checkT = 0; a.checkHit = true;
    if (force < 13 * Math.sqrt(b.mass)) {
      this.sfx('board', 0.3);
      if (mr < 0.88) { const k = (1 - mr) * 10; a.vx -= nx * k; a.vy -= ny * k; if (mr < 0.8 && sp > 18) this.pop('ODRAZIL SE', a.x, a.y, '#cfd8ea'); }
      return;
    }
    // posouzení bodyčeku rozhodčím
    const fromBehind = Math.cos(b.dir) * nx + Math.sin(b.dir) * ny > 0.75;
    const atBoards = !!rinkContact(b.x, b.y, 4.5);
    const late = this.puck.owner !== b && this.time - (b.lastPuckT || -9) > 1.3 && Math.hypot(this.puck.x - b.x, this.puck.y - b.y) > 10;
    if (fromBehind && force > 18 && Math.random() < 0.55) this.foul(a, b, 'back');
    else if (atBoards && force > 24 && Math.random() < 0.45) this.foul(a, b, 'board');
    else if (late && Math.random() < 0.55) this.foul(a, b, 'interf');
    else if (force > 36 && Math.random() < 0.25) this.foul(a, b, 'rough');
    // těžší hráč náraz lehčího často ustojí (jen ho to odsune)
    const stay = clamp((1 / mr - 1.04) * 1.4 + (force < 24 ? 0.05 : -0.15), 0, 0.4);
    if (Math.random() < stay) {
      b.vx += nx * force * 0.25 / b.mass; b.vy += ny * force * 0.25 / b.mass; a.vx -= nx * 6; a.vy -= ny * 6;
      this.sfx('hit', 0.4); this.pop('USTÁL TO', b.x, b.y, '#cfd8ea'); this.feel(b, 0.45, 160); this.feel(a, 0.35, 140);
      return;
    }
    b.downT = 0.9 + Math.min(1.2, force * 0.035 * Math.sqrt(mr)); b.lie = Math.atan2(ny, nx) + rand(-0.5, 0.5);
    b.winding = false; b.windT = 0;
    b.vx += nx * force * 0.45 / Math.sqrt(b.mass); b.vy += ny * force * 0.45 / Math.sqrt(b.mass);
    a.team.hits++; a.stats.h++;
    this.feel(b, clamp(force / 30, 0.4, 1), 260); this.feel(a, clamp(force / 45, 0.25, 0.7), 180);
    if (this.puck.owner === b) this.loosePuck(b, b.vx * 0.6 + rand(-6, 6), b.vy * 0.6 + rand(-6, 6));
    this.sfx('hit', clamp(force / 30, 0.4, 1));
    this.shake = Math.max(this.shake, clamp(force / 25, 0.2, 1) * 0.6);
    if (force > 24) {
      if (this.achOn && a.ctrl >= 0) Ach.unlock('hit');
      this.pop('TVRDÝ HIT!', b.x, b.y, '#ff5a3c');
      this.say(pick(['Ten to schytal!', 'Tvrdý hit!', 'Au, to bolelo!', 'Pořádný bodyček!']), false, 0.6);
    }
  }

  // ---------- fyzika hráčů ----------
  movePlayers(h) {
    const pk = this.puck;
    this.goalieMoveAll(h);
    for (const p of this.all) {
      if (p.isGoalie) continue;
      p.pokeA = Math.max(0, p.pokeA - h * 3.3); p.pokeCD -= h;
      if (p.pokeA > 0 && p.pokeA <= 0.55 && !p.pokeHit) { p.pokeHit = true; if (p.downT <= 0 && this.state === 'play') this.pokeResolve(p); } p.checkCD -= h; p.pickCD -= h;
      if (p.checkT > 0) { p.checkT -= h; if (p.checkT <= 0 && !p.checkHit) p.recoverT = 0.3; }
      if (p.blockT > 0) p.blockT -= h;
      p.dekeT = Math.max(0, p.dekeT - h); p.recoverT = Math.max(0, p.recoverT - h); if (p.shotFT > 0) p.shotFT -= h; if (p.passFT > 0) p.passFT -= h; if (p.foSwipe > 0) p.foSwipe -= h; if (p.celebT > 0) p.celebT -= h;
      p.carry = pk.owner === p;
      if (p.downT > 0) {
        p.downT -= h; const f = 1 - 3 * h; p.vx *= f; p.vy *= f; p.spdN = Math.hypot(p.vx, p.vy);
        this.integrate(p, h); continue;
      }
      if (p.winding) { p.windT = Math.min(1.2, p.windT + h * 1.4); if (!p.carry) { p.winding = false; p.windT = 0; } }
      if (p.swingT > 0) {
        // švih dolů: hůl se vrací k puku, při dopadu vystřelí
        p.swingT -= h; p.windT = p.swingW * Math.max(0, p.swingT) / SWING_T;
        if (!p.carry) { p.swingT = 0; p.windT = 0; }
        else if (p.swingT <= 0) this.shoot(p, ...p.swingArgs);
      }
      let ix = p.inX, iy = p.inY, m = Math.hypot(ix, iy);
      if (m > 1) { ix /= m; iy /= m; m = 1; }
      const ft = this.fat(p);
      const snow = this.iceAt(p.x, p.y), mf = Math.pow(1 / p.mass, 0.15);
      let maxV = PH.MAXV * p.spd * p.team.spdMod * ft * Math.pow(1 / p.mass, 0.04) * (1 - 0.04 * snow),
        acc = PH.ACC * (0.8 + 0.2 * p.spd) * (0.8 + 0.2 * ft) * mf * (1 - 0.06 * snow);
      if (p.carry) maxV *= 0.94;
      if (p.turbo && m > 0.3 && p.stamina > 0.08 && !p.winding) { maxV *= PH.TURBO; acc *= 1.3; p.stamina = Math.max(0, p.stamina - h * 0.024 * p.staMul); }
      if (p.recoverT > 0) acc *= 0.35;
      if (p.winding || p.swingT > 0) { const f = 1 - 1.3 * h; p.vx *= f; p.vy *= f; }
      else if (m > 0.12) {
        // bruslení se setrvačností: v rychlosti se zatáčí po oblouku (boční přilnavost brusle),
        // proti směru jízdy se brzdí smykem, rozjezd z místa je přímý; vše podle obratnosti hráče
        const sp0 = Math.hypot(p.vx, p.vy), tx = ix / m, ty = iy / m, want = maxV * m, ag = p.agil * (1 - 0.1 * snow);
        p.braking = false;
        if (sp0 < 5) {
          let dvx = tx * want - p.vx, dvy = ty * want - p.vy;
          const dl = Math.hypot(dvx, dvy), lim = acc * 1.1 * ag * h;
          if (dl > lim) { dvx *= lim / dl; dvy *= lim / dl; }
          p.vx += dvx; p.vy += dvy;
        } else {
          const ux = p.vx / sp0, uy = p.vy / sp0, cosA = ux * tx + uy * ty, cr = ux * ty - uy * tx;
          let sp = sp0, dir = Math.atan2(uy, ux);
          if (cosA < -0.3) { sp = Math.max(0, sp - PH.BRAKE * ag * h); p.braking = true; }
          else {
            const grip = PH.GRIP * ag * (p.turbo ? 0.88 : 1) * (p.carry ? 0.95 : 1), wMax = grip / Math.max(sp, 5);
            const turn = clamp(Math.atan2(cr, cosA), -wMax * h, wMax * h);
            dir += turn;
            sp *= 1 - Math.min(0.5, Math.abs(turn) / h / wMax) * 0.15 * h;       // ostrá zatáčka ubírá trochu rychlosti
            const a = acc * ag * (1 - 0.3 * clamp(sp / maxV, 0, 1));             // čím rychleji, tím pomaleji přidává
            sp += clamp(want - sp, -acc * 0.5 * h, a * h);
          }
          p.vx = Math.cos(dir) * sp; p.vy = Math.sin(dir) * sp;
        }
      } else { const f = 1 - PH.GLIDE * (1 + 0.3 * snow) * h; p.vx *= f; p.vy *= f; }
      // natočení
      const sp = Math.hypot(p.vx, p.vy);
      let fd = null;
      if (p.winding || p.swingT > 0) fd = Math.atan2(-p.y, p.team.dir * RINK.GOAL_X - p.x);
      else if (m > 0.2) fd = Math.atan2(iy, ix);
      else if (p.faceDir != null) fd = p.faceDir;
      else if (sp > 3) fd = Math.atan2(p.vy, p.vx);
      if (fd != null) { const r = (p.carry ? 7 : 9) * h; p.dir += clamp(angDiff(p.dir, fd), -r, r); }
      p.stride += h * (sp * 0.3 + (m > 0.5 ? 1.5 : 0));
      // brusle rozrývají led: víc při rychlé jízdě a prudkém brzdění
      if (this.state === 'play') { const dec = Math.max(0, (p.spdN || 0) - sp) / h; this.scuff(p.x, p.y, h * this.iceWear * (0.06 + sp * 0.036 + (dec > 45 ? 1.8 : 0))); }
      // kličkování s pukem na rozbitém ledu: puk může odskočit z hokejky
      if (p.carry && snow > 0.3 && Math.random() < snow * sp / 25 * h * 0.05) { this.loosePuck(p, p.vx + rand(-5, 5), p.vy + rand(-5, 5)); this.pop('PUK ODSKOČIL', p.x, p.y, '#cfd8ea'); }
      p.spdN = sp;
      this.integrate(p, h);
      this.remember(p);
    }
    this.collidePlayers();
  }
  integrate(p, h) {
    p.x += p.vx * h; p.y += p.vy * h;
    const r = p.isGoalie ? PH.GR : PH.PLR;
    const c = rinkContact(p.x, p.y, r);
    if (c) {
      p.x -= c.nx * c.pen; p.y -= c.ny * c.pen;
      const vn = p.vx * c.nx + p.vy * c.ny;
      if (vn > 0) { p.vx -= 1.25 * vn * c.nx; p.vy -= 1.25 * vn * c.ny; if (vn > 14) this.sfx('board', clamp(vn / 40, 0.2, 0.8)); }
    }
    if (!p.isGoalie) {
      for (const sN of [-1, 1]) {
        const x0 = sN > 0 ? RINK.GOAL_X : -RINK.GOAL_X - RINK.NET_D, x1 = x0 + RINK.NET_D;
        if (p.x > x0 - r && p.x < x1 + r && p.y > -RINK.NET_W - r && p.y < RINK.NET_W + r) {
          const pl = p.x - (x0 - r), pr = x1 + r - p.x, pb = p.y + RINK.NET_W + r, pt = RINK.NET_W + r - p.y;
          const m = Math.min(pl, pr, pb, pt);
          if (m === pl) { p.x -= pl; p.vx = Math.min(0, p.vx); } else if (m === pr) { p.x += pr; p.vx = Math.max(0, p.vx); }
          else if (m === pb) { p.y -= pb; p.vy = Math.min(0, p.vy); } else { p.y += pt; p.vy = Math.max(0, p.vy); }
        }
      }
    }
  }
  collidePlayers() {
    const A = this.all;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const a = A[i], b = A[j];
      const ra = a.isGoalie ? PH.GR : PH.PLR, rb = b.isGoalie ? PH.GR : PH.PLR;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = ra + rb;
      if (d >= min || d < 0.001) continue;
      const nx = dx / d, ny = dy / d, pen = min - d;
      const ma = a.pMass, mb = b.pMass, mt = ma + mb;
      a.x -= nx * pen * mb / mt; a.y -= ny * pen * mb / mt; b.x += nx * pen * ma / mt; b.y += ny * pen * ma / mt;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (a.team !== b.team && this.state === 'play') {
        if (a.checkT > 0 && !b.isGoalie && b.downT <= 0) this.hit(a, b, rel, nx, ny);
        else if (b.checkT > 0 && !a.isGoalie && a.downT <= 0) this.hit(b, a, rel, -nx, -ny);
      }
      if (rel > 0) {
        const imp = rel * 0.8;
        a.vx -= imp * nx * mb / mt; a.vy -= imp * ny * mb / mt; b.vx += imp * nx * ma / mt; b.vy += imp * ny * ma / mt;
        // kontakt je cítit: lidský hráč dostane vibraci, při větší rychlosti se lehce otřese obraz
        // tělem do soupeře s pukem: zpomalí ho a puk může odskočit
        if (rel > 9 && this.state === 'play' && a.team !== b.team) {
          const pk = this.puck, car = pk.owner === a ? a : pk.owner === b ? b : null;
          if (car) { const o = car === a ? b : a; if (Math.random() < clamp(0.18 * o.mass / car.mass * (rel / 15), 0, 0.45)) { this.loosePuck(car, car.vx * 0.4 + rand(-5, 5), car.vy * 0.4 + rand(-5, 5)); this.pop('ZTRÁTA!', car.x, car.y, '#cfd8ea'); } }
        }
        if (rel > 6 && this.state === 'play') { this.feel(a, rel / 40, 90); this.feel(b, rel / 40, 90); if (a.ctrl >= 0 || b.ctrl >= 0) this.shake = Math.max(this.shake, clamp(rel / 60, 0, 0.35)); }
      }
    }
  }

  // ---------- brankáři ----------
  goalieMoveAll(h) { for (const t of this.teams) if (!t.pulled) this.goalieMove(t.goalie, h); }
  goalieMove(g, h) {
    const sN = -g.team.dir, gl = RINK.GOAL_X, gx = sN * gl, pk = this.puck;
    g.saveT = Math.max(0, g.saveT - h); g.carry = false;
    if (g.leaving) {
      // odvolaný brankář jede k lavici
      const dr = this.benchDoor(g.team), dx = dr.x - g.x, dy = dr.y - g.y, d = Math.hypot(dx, dy) || 1, v = 21;
      let dvx = dx / d * v - g.vx, dvy = dy / d * v - g.vy; const dl = Math.hypot(dvx, dvy), lim = 60 * h;
      if (dl > lim) { dvx *= lim / dl; dvy *= lim / dl; }
      g.vx += dvx; g.vy += dvy; g.dir += clamp(angDiff(g.dir, Math.atan2(g.vy, g.vx)), -6 * h, 6 * h);
      g.spdN = Math.hypot(g.vx, g.vy); g.stride += h * g.spdN * 0.3;
      this.integrate(g, h);
      if (d < 7) this.completePull(g.team, false);
      return;
    }
    if (pk.held === g && this.state === 'play') {
      g.holdT += h;
      if (g.holdT > 0.9) {
        let near = 1e9;
        for (const o of this.other(g.team).skaters) near = Math.min(near, Math.hypot(o.x - g.x, o.y - g.y));
        const human = g.team.humans.length > 0;
        if (near < 13 || g.holdT > (human ? 3 : 2.2)) this.whistle('ZAKRYTÝ PUK', [sN * 69, (pk.y >= 0 ? 1 : -1) * 22]);
        else if (!human || g.holdT > 1.6) {
          let best = null, bs = -1e9;
          for (const q of g.team.skaters) { if (q.downT > 0) continue; const sc = this.openScore(q, g); if (sc > bs) { bs = sc; best = q; } }
          if (best) this.passTo(g, best.x, best.y, false, best);
        }
      }
    }
    let tx, ty;
    if (sN * pk.x > gl) { tx = sN * (gl - 1.3); ty = (pk.y >= 0 ? 1 : -1) * 2.3; }
    else {
      const dx = pk.x - gx, dy = pk.y, d = Math.hypot(dx, dy) || 1, r = clamp(1.6 + d * 0.045, 1.6, 4.2);
      tx = gx + (dx / d) * r; ty = (dy / d) * r;
      if (!pk.owner && !pk.held && pk.vx * sN > 20) {
        const t = (gx - pk.x) / pk.vx;
        if (t > 0 && t < 1) { const yA = pk.y + pk.vy * t; if (Math.abs(yA) < 5) ty = lerp(ty, clamp(yA, -2.6, 2.6), 0.5); }
      }
    }
    if (g.hIn && this.state === 'shootout') {
      // brankář řízený hráčem při nájezdu: páčka = vyjetí / posun do strany
      tx += g.hIn.x * 3.5; ty += g.hIn.y * 3;
      tx = sN * clamp(sN * tx, gl - 10, gl - 1); ty = clamp(ty, -5, 5);
    }
    g.pokeCD = (g.pokeCD || 0) - h;
    if (sN * tx > gl - 1.0) tx = sN * (gl - 1.0);
    const k = Math.min(1, h * 7 * g.gk);
    g.ai.tx = lerp(g.ai.tx, tx, k); g.ai.ty = lerp(g.ai.ty, ty, k);
    if (this.state === 'intro' || this.state === 'faceoff') { g.ai.tx = tx; g.ai.ty = ty; }
    if (g.returning && Math.hypot(g.x - gx, g.y) < 6) g.returning = false;
    const maxV = (g.returning ? 22 : 15) * (g.gkMove || g.gk);
    let tvx = (g.ai.tx - g.x) * 7, tvy = (g.ai.ty - g.y) * 7;
    const tl = Math.hypot(tvx, tvy); if (tl > maxV) { tvx *= maxV / tl; tvy *= maxV / tl; }
    let dvx = tvx - g.vx, dvy = tvy - g.vy; const dl = Math.hypot(dvx, dvy), lim = 80 * h;
    if (dl > lim) { dvx *= lim / dl; dvy *= lim / dl; }
    g.vx += dvx; g.vy += dvy;
    const fd = Math.atan2(pk.y - g.y, pk.x - g.x);
    g.dir += clamp(angDiff(g.dir, fd), -8 * h, 8 * h);
    g.spdN = Math.hypot(g.vx, g.vy);
    g.stride += h * g.spdN * 0.3;
    this.integrate(g, h);
  }
  goalieCover(g) {
    const pk = this.puck;
    if (this.pending && this.pending.team === g.team && this.state === 'play') { pk.owner = null; pk.vx = pk.vy = 0; this.whistlePenalty(); return; }
    pk.held = g; pk.owner = null; pk.vx = pk.vy = pk.vz = 0; pk.passTarget = null; pk.shot = null; pk.history = [g]; pk.lastTouch = g;
    g.holdT = 0;
    this.sfx('stick', 0.3);
  }
  goalieSaves(px, py) {
    const pk = this.puck, sp = Math.hypot(pk.vx, pk.vy);
    for (const t of this.teams) {
      const g = t.goalie, sN = -t.dir;
      if (t.pulled || g.leaving || (g.returning && Math.hypot(g.x + t.dir * RINK.GOAL_X, g.y) > 8)) continue;
      if ((pk.ignore.get(g) || 0) > this.time) continue;
      const d = segDist(g.x, g.y, px, py, pk.x, pk.y);
      if (sp < 16) {
        if (d < 2.2 && pk.z < 2 && sN * pk.x > RINK.GOAL_X - 12) { this.goalieCover(g); return; }
        continue;
      }
      if (pk.vx * sN <= 0 || pk.z > 6) continue;
      // puk míjí rovinu brankáře (nebo letí přímo do něj)
      const gu = sN * g.x, pu = sN * px, cu = sN * pk.x;
      let lat;
      if (pu < gu && cu >= gu) { const f = (gu - pu) / (cu - pu); lat = Math.abs(py + (pk.y - py) * f - g.y); }
      else if (d < 1.4) lat = d;
      else continue;
      const tt = (sN * RINK.GOAL_X - pk.x) / pk.vx;
      let onNet = false;
      if (tt > 0) {
        const yA = pk.y + pk.vy * tt, zA = pk.z + pk.vz * tt - 0.5 * PH.G * tt * tt;
        onNet = Math.abs(yA) < RINK.NET_W + 0.2 && zA < RINK.NET_H + 0.3;
      }
      const reach = 3.2 + 0.6 * g.gk;
      if ((!onNet && lat > 1.2) || lat > reach) { pk.ignore.set(g, this.time + 0.5); continue; }
      let sv = 0.974 + (g.gk - 1) * 0.6;
      if (this.vsHuman) sv += t.cpu ? this.diff.cpuGk : this.diff.myGk;
      sv += [0.025, 0, -0.02][this.tacOf(t)];   // obranná taktika = horší šance soupeře, útočná = víc protiútoků
      sv -= clamp((sp - 60) / 200, 0, 0.22);
      sv -= clamp((lat - 1.4) * 0.11, -0.05, 0.3);
      if (pk.oneTimer) sv -= 0.09;
      if (pk.reboundT > 0) sv -= 0.03;
      if (pk.deflT > 0) sv -= 0.12;
      if (pk.shot && pk.shot.deke && pk.shot.dist < 30) sv -= 0.06;   // střela po kličce zblízka
      if (pk.shot && pk.shot.bh && pk.shot.dist < 25) sv -= 0.015;     // bekhend zblízka
      if (pk.shot && pk.shot.high && pk.z > 2.4) sv -= 0.02;             // pod víko
      if (this.state === 'shootout') sv -= 0.14;
      else {
        // clona: hráč těsně před brankářem v dráze střely
        let scr = 0; const gxN = sN * RINK.GOAL_X, sh = pk.shot;
        if (sh && sh.sx != null) for (const o of this.all) {
          if (o.isGoalie || o.downT > 0 || o === sh.by) continue;
          const dg = Math.hypot(o.x - gxN, o.y);
          if (dg > 22 || dg < 3 || dg > sh.dist - 4) continue;
          if (segDist(o.x, o.y, sh.sx, sh.sy, gxN, 0) < 2.2) scr += o.team === t ? 0.015 : 0.03;
        }
        if (scr > 0 && pk.shot && Math.random() < 0.3) this.pop('CLONA', g.x, g.y, '#cfd8ea');
        sv -= Math.min(scr, 0.05);
        if ((this.other(t).zoneT || 0) > 10) sv -= 0.01;
      }                        // nájezd: střelec má čas i prostor
      if (pk.shot) sv += clamp((pk.shot.dist - 30) / 120, -0.06, 0.12);
      sv -= clamp((Math.hypot(g.vx, g.vy) - 6) / 40, 0, 0.1);
      sv = clamp(sv, 0.25, 0.97);
      if (Math.random() < sv) { this.save(g, sp, onNet); return; }
      pk.ignore.set(g, this.time + 0.6);
    }
  }
  save(g, sp, onNet) {
    const pk = this.puck, sN = -g.team.dir;
    if (onNet && pk.shot && pk.shot.log) pk.shot.log.res = 'save';
    if (onNet && pk.shot && !pk.shot.counted && this.state !== 'shootout') {
      pk.shot.counted = true; pk.shot.team.shots++; pk.shot.by.stats.s++; g.stats.sa++; g.stats.sv++;
    }
    g.saveT = 0.5; g.saveKind = pk.z < 1.0 ? 1 : (pk.y - g.y) * sN > 0 ? 2 : 3;
    if ((sp < 62 && pk.z > 0.7 && Math.random() < 0.55) || (sp < 40 && Math.random() < 0.5)) {
      this.goalieCover(g);
      if (onNet) this.say(pick(['Chytil to!', 'Lapačka!', 'Jistý zákrok.']), false, 0.3);
    } else {
      const ang = (sN > 0 ? Math.PI : 0) + rand(-1.15, 1.15), rs = rand(10, 24) * clamp(sp / 80, 0.6, 1.4);
      pk.vx = Math.cos(ang) * rs; pk.vy = Math.sin(ang) * rs; pk.vz = pk.z > 1 ? rand(0, 5) : 0;
      pk.reboundT = 1.5; pk.shot = null; pk.oneTimer = false; pk.passTarget = null; pk.lastTouch = g;
      pk.ignore.set(g, this.time + 0.35);
      this.sfx('board', 0.25); this.sfx('stick', 0.6);
      if (onNet) {
        if (Math.random() < 0.35) this.pop('ZÁKROK!', g.x, g.y, '#9fe3ff');
        this.say(pick(['Výborný zákrok!', 'Brankář je na místě.', 'Skvělá reakce!', 'Vyrazil to!']), false, 0.35);
      }
    }
    this.sfx('ooh', 0.6);
  }

  // ---------- puk ----------
  updatePuck(h) {
    const pk = this.puck;
    if (pk.reboundT > 0) pk.reboundT -= h;
    if (pk.deflT > 0) pk.deflT -= h;
    if (pk.passT > 0) { pk.passT -= h; if (pk.passT <= 0) pk.passTarget = null; }
    if (pk.held) {
      const g = pk.held;
      pk.x = g.x + Math.cos(g.dir) * 1.1; pk.y = g.y + Math.sin(g.dir) * 1.1; pk.z = 1.6; pk.vx = pk.vy = pk.vz = 0;
      return;
    }
    if (pk.owner) {
      pk.touchX = pk.owner.x; pk.touchTeam = pk.owner.team; // odkud naposledy tým puk hrál (pro zakázané uvolnění)
      const o = pk.owner, off = bladeOffset(o.dir, o.hand, !(o.winding && o.windT > 0.15) && !(o.swingT > 0), this.time, 0, 0, o.reach, o.ctrl >= 0 ? o.stk : null);   // při nápřahu puk leží tam, kam dopadne čepel
      pk.x = o.x + off[0]; pk.y = o.y + off[1]; pk.z = 0; pk.vx = o.vx; pk.vy = o.vy; pk.vz = 0;
      const c = rinkContact(pk.x, pk.y, PH.PR);
      if (c) { pk.x -= c.nx * c.pen; pk.y -= c.ny * c.pen; }
      for (const sN of [-1, 1]) {
        const u = sN * pk.x;
        if (u > RINK.GOAL_X - 0.3 && u < RINK.GOAL_X + RINK.NET_D + 0.3 && Math.abs(pk.y) < RINK.NET_W + 0.3) {
          if (u < RINK.GOAL_X + 1) pk.x = sN * (RINK.GOAL_X - 0.4);
          else pk.y = (pk.y >= 0 ? 1 : -1) * (RINK.NET_W + 0.4);
        }
      }
      return;
    }
    const px = pk.x, py = pk.y, pz = pk.z;
    pk.x += pk.vx * h; pk.y += pk.vy * h;
    if (pk.z > 0 || pk.vz > 0) {
      pk.vz -= PH.G * h; pk.z += pk.vz * h;
      if (pk.z <= 0) { pk.z = 0; if (pk.vz < -5) pk.vz = -pk.vz * 0.3; else pk.vz = 0; }
    }
    if (pk.z <= 0.01) {
      // tření a poskakování puku podle stavu ledu (sníh brzdí, nerovnosti puk odrážejí)
      const snow = this.iceAt(pk.x, pk.y), v = Math.hypot(pk.vx, pk.vy);
      const f = 1 - PH.PF * (1 + 0.4 * snow) * h; pk.vx *= f; pk.vy *= f;
      if (v < 4) { const f2 = Math.max(0, 1 - (1.2 + 0.5 * snow) * h); pk.vx *= f2; pk.vy *= f2; }
      if (v > 8 && snow > 0.2 && Math.random() < snow * h * 2) {
        const a = gauss() * 0.06 * snow, c = Math.cos(a), s = Math.sin(a), vx = pk.vx;
        pk.vx = vx * c - pk.vy * s; pk.vy = vx * s + pk.vy * c;
        if (Math.random() < 0.4) pk.vz = Math.max(pk.vz, rand(1.5, 4) * snow);
      }
    }
    if (pk.inNet) { this.keepInNet(); return; }
    if (this.checkNets(px, py, pz)) return;
    const c = rinkContact(pk.x, pk.y, PH.PR);
    if (c) {
      pk.x -= c.nx * c.pen; pk.y -= c.ny * c.pen;
      const vn = pk.vx * c.nx + pk.vy * c.ny;
      if (vn > 0) {
        // odraz podle úhlu: šikmo puk sjede po mantinelu (i kolem rohu za brankou), zpříma se odrazí;
        // tření o mantinel (Coulomb) bere tečnou rychlost úměrně síle nárazu
        const tx = -c.ny, ty = c.nx, vt = pk.vx * tx + pk.vy * ty, sp = Math.hypot(vn, vt), k = vn / sp;
        const e = 0.85 * PH.BE * clamp((k - 0.2) / 0.3, 0, 1) * (1 + 0.1 * gauss());
        const vt2 = vt - sgn(vt) * Math.min(Math.abs(vt), 0.2 * (1 + e) * vn + 8 * h);
        pk.vx = vt2 * tx - e * vn * c.nx; pk.vy = vt2 * ty - e * vn * c.ny;
        if (vn > 10) this.sfx('board', clamp(vn / 90, 0.15, 0.6));
        else if (k < 0.3 && Math.abs(vt) > 22 && this.time - (this.rimT || 0) > 0.13) { this.rimT = this.time; this.sfx('rim', clamp(Math.abs(vt) / 80, 0.2, 0.6)); }
        if (vn > 30) pk.shot = null;
      }
    }
    if (this.state === 'play') { this.goalieSaves(px, py); if (!pk.held) this.pickups(); }
    else if (this.state === 'shootout') { this.goalieSaves(px, py); if (!pk.held && !this.shootout.shot) this.pickups(); }
  }
  keepInNet() {
    const pk = this.puck, sN = pk.inNet, u = sN * pk.x;
    if (u > RINK.GOAL_X + RINK.NET_D - 0.5) { pk.x = sN * (RINK.GOAL_X + RINK.NET_D - 0.5); pk.vx *= -0.2; }
    if (u < RINK.GOAL_X + 0.3) { pk.x = sN * (RINK.GOAL_X + 0.3); pk.vx *= -0.2; }
    if (Math.abs(pk.y) > RINK.NET_W - 0.4) { pk.y = sgn(pk.y) * (RINK.NET_W - 0.4); pk.vy *= -0.3; }
    if (pk.z > RINK.NET_H - 0.4) { pk.z = RINK.NET_H - 0.4; pk.vz = 0; }
    pk.vx *= 0.96; pk.vy *= 0.96;
  }
  checkNets(px, py, pz) {
    const pk = this.puck, gl = RINK.GOAL_X, W = RINK.NET_W;
    for (const sN of [1, -1]) {
      const pu = sN * px, cu = sN * pk.x;
      if (pu < gl && cu >= gl) {
        const t = (gl - pu) / (cu - pu), yc = py + (pk.y - py) * t, zc = pz + (pk.z - pz) * t, ay = Math.abs(yc);
        if (ay < W - PH.PR && zc < RINK.NET_H - 0.2) {
          if (this.state === 'play') { this.goal(sN); return true; }
          if (this.state === 'shootout' && this.shootout.phase === 'run') { pk.inNet = sN; this.soEnd(true); return true; }
          pk.vx *= -0.3; pk.x = sN * (gl - 0.1); return true;
        }
        if (ay < W + 0.45 && zc < RINK.NET_H + 0.35) {
          pk.x = sN * (gl - 0.1);
          if (zc > RINK.NET_H - 0.2) { pk.vz = -Math.abs(pk.vz) * 0.4 + 2; pk.vx *= -0.4; }
          else { pk.vx = -pk.vx * 0.55; pk.vy += sgn(yc) * rand(3, 10); }
          if (pk.shot && this.state === 'play') {
            this.feel(pk.lastTouch || pk, 0.5, 150); this.sfx('post'); this.pop('TYČKA!', pk.x, pk.y, '#ffe066'); this.say(pick(['Tyčka!', 'Zvoní tyčka!']), true, 0.8); this.sfx('ooh', 1);
            pk.shot = null;
          } else this.sfx('stick', 0.6);
          return false;
        }
      }
      // tělo branky (zezadu / z boku)
      if (cu > gl && cu < gl + RINK.NET_D && Math.abs(pk.y) < W + PH.PR && pk.z < RINK.NET_H) {
        if (pu >= gl + RINK.NET_D) { pk.x = sN * (gl + RINK.NET_D + PH.PR); pk.vx = -pk.vx * 0.3; }
        else if (Math.abs(py) >= W) { pk.y = sgn(py) * (W + PH.PR); pk.vy = -pk.vy * 0.3; }
        else { pk.x = sN * (gl + RINK.NET_D + PH.PR); }
        this.sfx('stick', 0.3);
      }
    }
    return false;
  }
  pickups() {
    const pk = this.puck;
    if (pk.z > 1.3) return;
    const sp = Math.hypot(pk.vx, pk.vy);
    let best = null, bd = 2.0;
    for (const p of this.all) {
      if (p.isGoalie || (p.downT > 0 && !(p.blockT > 0)) || p.pickCD > 0) continue;
      if (p.blockT > 0) { const d = Math.hypot(p.x - pk.x, p.y - pk.y) - 2.4; if (d < bd) { bd = d; best = p; } continue; }
      const off = bladeOffset(p.dir, p.hand, false, this.time, p.winding ? p.windT : 0, p.pokeA, p.reach);
      let d = Math.hypot(p.x + off[0] - pk.x, p.y + off[1] - pk.y) - (p.reach - 1) * 2.5 - (p.ctrl >= 0 && this.assistOf(p) >= 2 ? 0.8 : 0);
      const db = Math.hypot(p.x - pk.x, p.y - pk.y) - 0.4;
      if (db < d) d = db;
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const p = best;
    if (sp > 52 && pk.passTarget !== p) {
      if (pk.shot && pk.shot.team === p.team) {
        // spoluhráč před brankou tečuje střelu
        const s = p.team.dir, dn = Math.hypot(s * RINK.GOAL_X - p.x, p.y);
        if (pk.shot.by !== p && dn < 24 && pk.z < 2.5 && Math.random() < (p.ctrl >= 0 ? 0.45 : 0.3)) {
          const a = Math.atan2(pk.vy, pk.vx) + rand(-0.35, 0.35), ns = sp * rand(0.6, 0.8);
          pk.vx = Math.cos(a) * ns; pk.vy = Math.sin(a) * ns; pk.vz = rand(0, 2.5); pk.deflT = 0.6;
          pk.lastTouch = p; pk.history.push(p); p.pickCD = 0.3;
          this.pop('TEČ!', p.x, p.y, '#ffd21f'); this.sfx('stick', 0.8);
          return;
        }
        p.pickCD = 0.25; return;
      }
      if (Math.random() < (p.blockT > 0 ? 0.85 : 0.4 * (pk.shot && pk.shot.team !== p.team ? [1.4, 1, 0.9][this.tacOf(p.team)] : 1))) {
        const a = Math.atan2(pk.vy, pk.vx) + rand(-1.2, 1.2), ns = sp * rand(0.2, 0.5);
        pk.vx = Math.cos(a) * ns; pk.vy = Math.sin(a) * ns; pk.vz = rand(0, 5); pk.deflT = 0.5;
        if (pk.shot && pk.shot.team !== p.team) { if (pk.shot.log) pk.shot.log.res = 'block'; pk.shot = null; this.pop('BLOK!', p.x, p.y, '#ddd'); }
        else if (pk.shot) { pk.lastTouch = p; pk.history.push(p); }
        p.pickCD = 0.3; this.sfx('stick', 0.8);
        return;
      }
      p.pickCD = 0.25; return;
    }
    if (sp > 95 && Math.random() < 0.3) { p.pickCD = 0.2; return; }
    if (p.downT > 0) { pk.vx *= 0.25; pk.vy *= 0.25; p.pickCD = 0.3; return; }   // ležící hráč puk jen zastaví
    if (sp < 25 && !this.battle && this.state === 'play' && rinkContact(pk.x, pk.y, 4)) {
      const o = this.other(p.team).skaters.find((q) => q.downT <= 0 && q.pickCD <= 0 && Math.hypot(q.x - pk.x, q.y - pk.y) < 4.5);
      if (o) {
        this.battle = { a: p, b: o, t: 0, pa: 0, pb: 0 }; p.pickCD = o.pickCD = 0.5; pk.vx *= 0.3; pk.vy *= 0.3;
        this.pop('SOUBOJ', pk.x, pk.y, '#cfd8ea'); this.feel(p, 0.35, 200); this.feel(o, 0.35, 200); this.sfx('board', 0.3);
        return;
      }
    }
    this.gain(p);
  }
  gain(p) {
    const pk = this.puck, wasPass = pk.wasPass, reb = pk.reboundT > 0 && pk.lastTouch && pk.lastTouch.isGoalie && pk.lastTouch.team !== p.team;
    const last = pk.history[pk.history.length - 1];
    if (last && last.team !== p.team) pk.history = [];
    if (pk.history[pk.history.length - 1] !== p) pk.history.push(p);
    if (pk.history.length > 6) pk.history.shift();
    Object.assign(pk, { owner: p, held: null, passTarget: null, shot: null, oneTimer: false, deflT: 0, wasPass: false, lastTouch: p, z: 0, vz: 0 });
    p.lastPuckT = this.time;
    if (this.pending && this.pending.team === p.team && this.state === 'play') { this.whistlePenalty(); return; }
    this.sfx('stick', 0.35);
    // přepnutí lidského hráče na nosiče puku
    if (p.ctrl < 0 && p.team.humans.length) {
      const hs = p.team.humans;
      let h = hs[0];
      if (hs.length > 1) {
        const passer = pk.history.length > 1 ? pk.history[pk.history.length - 2] : null;
        h = hs.find((q) => q.player === passer) || hs.reduce((a, b) => (Math.hypot(a.player.x - p.x, a.player.y - p.y) < Math.hypot(b.player.x - p.x, b.player.y - p.y) ? a : b));
      }
      this.assign(h, p);
    }
    for (const q of this.all) if (q !== p) { q.oneTimerQ = false; q.oneTouchQ = false; }
    if (p.oneTimerQ) { p.oneTimerQ = false; this.shoot(p, 0.85, true, p.ctrl >= 0 && Math.abs(p.inY) > 0.35 ? sgn(p.inY) : null, true); return; }
    if (p.oneTouchQ) {
      // přihrávka z první: puk hned dál ve směru páčky (o kousek méně přesně)
      p.oneTouchQ = false; const m = this.choosePassTarget(p, p.inX, p.inY);
      if (m) { const pas = p.pas; p.pas -= 0.04; this.pass(p, m, false); p.pas = pas; this.pop('Z PRVNÍ', p.x, p.y, '#cfd8ea'); return; }
    }
    if (p.ctrl < 0 && reb && this.state === 'play') {
      const s = p.team.dir, dn = Math.hypot(s * RINK.GOAL_X - p.x, p.y);
      if (dn < 18 && Math.random() < 0.3) { this.shoot(p, 0, false, null, false); return; }   // dorážka
    }
    if (p.ctrl < 0 && wasPass) {
      const s = p.team.dir, u = s * p.x, dn = Math.hypot(s * RINK.GOAL_X - p.x, p.y);
      if (u > 55 && u < 86 && dn < 38 && Math.abs(p.y) < 24 && Math.random() < 0.35) this.shoot(p, 0.75, true, null, true);
    }
  }

  // ---------- AI ----------
  // kam dojede volný puk za T sekund (včetně odrazu a sjetí po mantinelu)
  predictPuck(T) {
    const pk = this.puck, o = pk.owner || pk.held;
    if (o) return [o.x + o.vx * T, o.y + o.vy * T];
    let x = pk.x, y = pk.y, vx = pk.vx, vy = pk.vy;
    const dt = 1 / 30;
    for (let t = 0; t < T; t += dt) {
      x += vx * dt; y += vy * dt; const f = 1 - PH.PF * dt; vx *= f; vy *= f;
      const c = rinkContact(x, y, PH.PR);
      if (c) {
        x -= c.nx * c.pen; y -= c.ny * c.pen;
        const vn = vx * c.nx + vy * c.ny;
        if (vn > 0) {
          const tx = -c.ny, ty = c.nx, vt = vx * tx + vy * ty, k = vn / Math.hypot(vn, vt), e = 0.85 * PH.BE * clamp((k - 0.2) / 0.3, 0, 1);
          const vt2 = vt - sgn(vt) * Math.min(Math.abs(vt), 0.2 * (1 + e) * vn + 8 * dt);
          vx = vt2 * tx - e * vn * c.nx; vy = vt2 * ty - e * vn * c.ny;
        }
      }
    }
    return [x, y];
  }
  // tlak v útočném pásmu: jak dlouho tým drží puk v pásmu soupeře
  updatePressure(h) {
    const pk = this.puck, own = pk.owner || pk.held, H = this.teams[0];
    // domácí fanoušci skandují v přesilovce a při dlouhém tlaku
    const pp = this.penalties.some((pn) => pn.team !== H) && !this.penalties.some((pn) => pn.team === H);
    if ((pp || (H.zoneT || 0) > 10) && this.time - (this.chantT || -99) > 11) { this.chantT = this.time; this.sfx('chant'); }
    for (const t of this.teams) {
      const inZone = t.dir * pk.x > RINK.BLUE_X && !(own && own.team !== t);
      const was = t.zoneT || 0;
      t.zoneT = inZone ? was + h : 0;
      if (was < 12 && t.zoneT >= 12) {
        if (this.humans.length) this.toast = { text: 'TLAK V PÁSMU: ' + t.def.abbr, t: 0, dur: 1.6 };
        this.say(pick(['Domácí drží soupeře v pásmu.', 'Velký tlak v útočném pásmu!', 'Soupeř se nemůže dostat z pásma.']), false, 0.5);
      }
    }
  }
  // souboj o puk u mantinelu: rozhoduje síla, hmotnost, únava a (u člověka) mačkání X / B
  updateBattle(h) {
    const B = this.battle; if (!B) return;
    const { a, b } = B, pk = this.puck;
    B.t += h;
    if (pk.owner || pk.held || a.downT > 0 || b.downT > 0 || !a.onIce || !b.onIce || Math.hypot(a.x - pk.x, a.y - pk.y) > 7 || Math.hypot(b.x - pk.x, b.y - pk.y) > 7) { this.battle = null; return; }
    for (const q of [a, b]) {
      q.pickCD = Math.max(q.pickCD, 0.05);
      const dx = pk.x - q.x, dy = pk.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (d > 2) { q.vx += dx / d * 20 * h; q.vy += dy / d * 20 * h; }
    }
    pk.vx *= 1 - 3 * h; pk.vy *= 1 - 3 * h;
    if (B.t > 0.7) {
      const str = (q, pr) => q.chk * this.fat(q) + (q.mass - 1) * 0.6 + pr * 0.05 + (q.team.cpu && this.vsHuman ? (this.diff.aggr - 1) * 0.05 : 0);
      const pa = clamp(0.5 + (str(a, B.pa) - str(b, B.pb)) * 1.4, 0.15, 0.85);
      const w = Math.random() < pa ? a : b, l = w === a ? b : a;
      this.battle = null; w.pickCD = 0; l.pickCD = 0.45; l.recoverT = 0.3;
      this.feel(w, 0.5, 160); this.feel(l, 0.4, 160); this.sfx('board', 0.25);
      this.gain(w);
    }
  }
  thinkAll(h) {
    for (const t of this.teams) { t.thinkT -= h; if (t.thinkT <= 0) { t.thinkT = 0.15; this.teamThink(t); } }
    for (const p of this.all) {
      if (p.isGoalie || p.ctrl >= 0) continue;
      if (p.downT > 0) { p.inX = p.inY = 0; continue; }
      this.aiSkater(p, h);
    }
  }
  teamThink(t) {
    const pk = this.puck, opp = this.other(t), owner = pk.owner || pk.held;
    const ais = t.skaters.filter((p) => p.ctrl < 0 && p.downT <= 0 && !p.goBench), hum = t.skaters.filter((p) => p.ctrl >= 0);
    // automatické střídání za běhu
    // jen když máme puk, nebo je volný v útočném pásmu soupeře a soupeř ho nemá
    if (!t.change && (t.cpu || this.autoChange) && this.state === 'play') {
      const e = t.skaters.reduce((a, p) => a + p.stamina, 0) / Math.max(1, t.skaters.length), pu = t.dir * pk.x;
      const ownHas = owner && owner.team === t;
      const deepLoose = !owner && pu > RINK.BLUE_X + 2 && !(pk.passTarget && pk.passTarget.team !== t);
      if (e < 0.5 && (ownHas || deepLoose)) this.requestChange(t);
    }
    // soupeř získal puk během střídání: kdo je ještě daleko od střídačky, zůstává ve hře
    if (t.change && owner && owner.team !== t && this.state === 'play') {
      const dr = this.benchDoor(t);
      for (const p of t.skaters) if (p.goBench && p.ctrl < 0 && Math.hypot(p.x - dr.x, p.y - dr.y) > 28) p.goBench = false;
    }
    if (this.state === 'play') {
      const want = this.wantsPull(t, false), g = t.goalie;
      if (want && !t.pulled && !g.leaving) {
        const ours = owner && owner.team === t;
        if (!t.cpu || (ours && (t.dir * pk.x > -25 || (this.pending && this.pending.team === opp)))) this.startPull(t);
      } else if (!want && (t.pulled || g.leaving)) this.returnGoalie(t);
      // počítač: soupeř získal puk u naší branky dřív, než brankář odjel → zpátky do branky
      if (t.cpu && g.leaving && owner && owner.team === opp && t.dir * owner.x < -20 && !(this.pending && this.pending.team === opp)) g.leaving = false;
      if (t.pulled && !t.change) this.ensureExtra(t);
      // šestý hráč, který jel na lavici, u dveří zmizí
      const dr = this.benchDoor(t);
      for (const p of t.skaters.slice()) if (p.extraOut && pk.owner !== p && Math.hypot(p.x - dr.x, p.y - dr.y) < 10) {
        t.skaters.splice(t.skaters.indexOf(p), 1); p.onIce = false; p.goBench = false; p.extraOut = false; p.ctrl = -1; this.setPlayers(t); this.rebuildAll();
      }
    }
    t.chaser = null; t.presser = null; t.marks = new Map(); t.support = null;
    const near = (list, x, y) => { let b = null, bd = 1e9; for (const p of list) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; b = p; } } return [b, bd]; };
    if (!owner) {
      const px = pk.x + pk.vx * 0.35, py = pk.y + pk.vy * 0.35;
      const [a, ad] = near(ais, px, py), [, hd] = near(hum, px, py);
      if (a && !(hd < ad - 8)) t.chaser = a;
      // puk objíždí mantinel za naší brankou: druhý hráč mu jede naproti
      const pp = this.predictPuck(1.1);
      if (t.dir * pp[0] < -62 && Math.hypot(pk.vx, pk.vy) > 12) { const [b2] = near(ais.filter((q) => q !== t.chaser), pp[0], pp[1]); t.support = b2 || null; }
    } else if (owner.team !== t && !owner.isGoalie) {
      const [a, ad] = near(ais, owner.x, owner.y), [, hd] = near(hum, owner.x, owner.y);
      // obranná taktika nenapadá hluboko v pásmu soupeře, útočná napadá ve dvou
      const deep = t.dir * owner.x;
      if (a && !(hd < ad - 6) && !(this.tacOf(t) === 0 && deep > 32)) t.presser = a;
      t.presser2 = null;
      if (this.tacOf(t) === 2 && deep > 18) { const rest = ais.filter((q) => q !== t.presser && q.role[1] !== 'D'); const [b2] = near(rest, owner.x, owner.y); t.presser2 = b2 || null; }
      const gx = -t.dir * RINK.GOAL_X;
      const attackers = opp.skaters.filter((o) => o !== owner).sort((a, b) => Math.hypot(a.x - gx, a.y) - Math.hypot(b.x - gx, b.y));
      const free = ais.filter((p) => p !== t.presser && p !== t.presser2);
      for (const o of attackers.slice(0, 3)) {
        if (!free.length) break;
        let bi = 0, bd = 1e9;
        free.forEach((p, i) => { const d = Math.hypot(p.x - o.x, p.y - o.y); if (d < bd) { bd = d; bi = i; } });
        t.marks.set(free[bi], o); free.splice(bi, 1);
      }
      // když se útočník s pukem blíží k brance, nejbližší krycí hráč mu pomůže zastoupit cestu
      t.helper = null;
      if (Math.hypot(owner.x - gx, owner.y) < 42) {
        let hb = null, hd = 1e9;
        for (const [p] of t.marks) { const d = Math.hypot(p.x - owner.x, p.y - owner.y); if (d < hd && d < 28) { hd = d; hb = p; } }
        t.helper = hb;
      }
    }
  }
  aiSkater(p, h) {
    const t = p.team, s = t.dir, pk = this.puck;
    if (p.goBench && pk.owner !== p) {
      const dr = this.benchDoor(t), dx = dr.x - p.x, dy = dr.y - p.y, d = Math.hypot(dx, dy) || 1;
      p.inX = dx / d; p.inY = dy / d; p.turbo = d > 30 && p.stamina > 0.25; p.faceDir = null;
      return;
    }
    if (pk.owner === p) return this.aiCarrier(p, h);
    let tx, ty, urg = false, turbo = false;
    p.faceDir = null;
    if (t.chaser === p) {
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      [tx, ty] = this.predictPuck(clamp(d / 32, 0, 1.1));
      turbo = d > 18 && p.stamina > 0.35; urg = true;
    } else if (t.support === p) {
      [tx, ty] = this.predictPuck(1.3); urg = true;
    } else if (t.presser === p && pk.owner) {
      // obránce drží mezeru mezi útočníkem a brankou (podle rychlosti útočníka) a teprve pak napadá
      const o = pk.owner, os = this.seen(o, t), gx = -s * RINK.GOAL_X, dx = gx - os.x, dy = -os.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
      const d = Math.hypot(o.x - p.x, o.y - p.y), osp = Math.hypot(os.vx, os.vy);
      // obránce: nejdřív se dostat mezi útočníka a branku, pak držet těsnou mezeru a napadat
      const along = (p.x - os.x) * ux + (p.y - os.y) * uy, lead = 0.25;
      if (along < 1.5) {
        const back = 5 + osp * 0.25;                      // projetý: dobruslit si postavení
        tx = os.x + os.vx * lead + ux * back; ty = os.y + os.vy * lead + uy * back;
      } else {
        const gap = clamp(2.5 + osp * 0.1, 2.5, 5);
        tx = os.x + os.vx * lead + ux * gap; ty = os.y + os.vy * lead + uy * gap;
      }
      turbo = d > 14 && p.stamina > 0.3; urg = true;
      p.ai.t -= h;
      if (p.ai.t <= 0) {
        p.ai.t = this.thinkFor(t) * rand(0.7, 1.3);
        if (d < 6.5) {
          const ag = this.aggrFor(t), fa = Math.abs(angDiff(p.dir, Math.atan2(o.y - p.y, o.x - p.x)));
          const rear = Math.cos(o.dir) * (o.x - p.x) + Math.sin(o.dir) * (o.y - p.y) > d * 0.5; // byl by to faul zezadu
          const sideOn = Math.abs(angDiff(o.dir, Math.atan2(p.y - o.y, p.x - o.x))) > 1.0;
          if (fa < 0.8 && p.spdN > 9 && (!rear || Math.random() < 0.12 * ag) && Math.random() < 0.2 * ag) this.startCheck(p);
          else if (sideOn && d < 4.5 && Math.random() < 0.12) this.liftStick(p);
          else if (Math.random() < 0.55 * ag) this.poke(p);
        }
      }
    } else if (t.presser2 === p && pk.owner) {
      // druhý napadající: zavírá přihrávku do středu
      const o = this.seen(pk.owner, t);
      tx = o.x + o.vx * 0.3 + t.dir * -6; ty = o.y * 0.5; urg = true; turbo = p.stamina > 0.4;
    } else if (t.marks.has(p) && t.helper === p && pk.owner) {
      // pomoc: zastoupit útočníkovi s pukem cestu do slotu
      const o = this.seen(pk.owner, t), gx = -s * RINK.GOAL_X;
      tx = o.x + (gx - o.x) * 0.45; ty = o.y * 0.5; urg = true;
    } else if (t.marks.has(p)) {
      const o = this.seen(t.marks.get(p), t), gx = -s * RINK.GOAL_X;
      // obránce v dráze příklepu si lehne do střely
      const sh = pk.owner;
      if (sh && sh.winding && sh.windT > 0.3 && sh.team !== t && p.downT <= 0 && Math.random() < 0.02) {
        const dl = segDist(p.x, p.y, sh.x, sh.y, gx, 0), ds = Math.hypot(sh.x - p.x, sh.y - p.y);
        if (dl < 2.5 && ds < 18 && ds > 5) { this.dive(p); return; }
      }
      tx = o.x + (gx - o.x) * 0.28; ty = o.y * 0.8;
    } else [tx, ty] = this.spotFor(p);
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 1.2) { p.inX = 0; p.inY = 0; }
    else { const m = urg ? 1 : clamp(d / 10, 0.25, 1); p.inX = (dx / d) * m; p.inY = (dy / d) * m; }
    if (d < 4 && !urg) p.faceDir = Math.atan2(pk.y - p.y, pk.x - p.x);
    p.turbo = turbo;
  }
  spotFor(p) {
    const t = p.team, s = t.dir, pk = this.puck, owner = pk.owner || pk.held;
    const pu = s * pk.x, pv = s * pk.y, ph = p.ai.ph, tm = this.time, D = p.role[1] === 'D';
    let u, v;
    const off = owner ? owner.team === t : pu > 5;
    if (off) {
      if (pu > 18) {
        const tac = this.tacOf(t), dU = [27, 33, 42][tac];   // obránci: obranná taktika vzadu, útočná až k modré
        const S = { C: [60, 0], LW: [72, 17], RW: [72, -17], LD: [dU, 16], RD: [dU, -16], X: [80, Math.sin(ph) > 0 ? 7 : -7] }[p.extra ? 'X' : p.role];
        u = S[0] + Math.sin(tm * 0.6 + ph) * (D ? 3 : 7); v = S[1] + Math.cos(tm * 0.45 + ph * 1.3) * (D ? 6 : 7);
        if (p.role === 'C' && Math.sin(tm * 0.4 + ph) > 0.5) { u = 78; v = Math.sin(ph) > 0 ? 4 : -4; }
      } else {
        const S = { C: [pu + 14, -pv * 0.3], LW: [pu + 24, 22], RW: [pu + 24, -22], LD: [pu - 16, 15], RD: [pu - 16, -15], X: [pu + 20, pv > 0 ? -8 : 8] }[p.extra ? 'X' : p.role];
        u = S[0]; v = S[1];
        if (!D) u = Math.min(u, 70);
      }
      // po střele: útočníci jdou k brance na dorážku
      if ((p.role === 'C' || p.extra) && pu > 30 && this.time < (t.crashT || 0) && t.crashBy !== p) { u = 82; v = sgn(pv || 1) * 3; }
      // nabídnout se: z několika míst kolem postu vyber to nejvolnější s průchozí přihrávkou od nosiče
      else if (owner && owner.team === t && owner !== p) {
        const ai = p.ai;
        if (!ai.spotT || this.time > ai.spotT) {
          ai.spotT = this.time + rand(0.35, 0.6);
          const opp = this.other(t).skaters.filter((o) => o.downT <= 0);
          let bd = [0, 0], bs = -1e9;
          for (const [du, dv] of [[0, 0], [6, 0], [-6, 0], [0, 7], [0, -7], [5, 5], [5, -5], [-5, 5], [-5, -5]]) {
            const wx = s * (u + du), wy = s * (v + dv);
            let open = 30; for (const o of opp) open = Math.min(open, Math.hypot(o.x - wx, o.y - wy));
            let sc = Math.min(open, 16) - Math.hypot(du, dv) * 0.25;
            if (opp.some((o) => segDist(o.x, o.y, owner.x, owner.y, wx, wy) < 3)) sc -= 6;
            if (sc > bs) { bs = sc; bd = [du, dv]; }
          }
          ai.sdu = bd[0]; ai.sdv = bd[1];
        }
        u += ai.sdu || 0; v += ai.sdv || 0;
      }
      // ofsajd: dokud puk není v útočném pásmu, nikdo nesmí být za modrou čárou
      if (this.cfg.offside !== false && pu < RINK.BLUE_X) u = Math.min(u, RINK.BLUE_X - 1.5);
    } else {
      const tac = this.tacOf(t), fb = [-21, -13, -7][tac], db = [-32, -28, -24][tac], dmax = [44, 50, 56][tac];
      const S = { C: [pu + fb + 1, pv * 0.5], LW: [pu + fb, 18 * (tac ? 1 : 0.7)], RW: [pu + fb, -18 * (tac ? 1 : 0.7)], LD: [Math.min(pu + db, dmax), 12], RD: [Math.min(pu + db, dmax), -12], X: [pu + fb - 6, 0] }[p.extra ? 'X' : p.role];
      u = S[0]; v = S[1];
      // ve vlastním pásmu nikdy za branku: útočníci hlídají slot a modrou, obránci brankoviště
      u = Math.max(u, D ? -80 : [-62, -66, -70][tac]);
      if (tac === 0 && !D && pu < -25) v *= 0.6;                     // obranná taktika: zahustit střed
    }
    u = clamp(u, -84, 84);
    const hw = rinkHalfWidthAt(s * u) - 4; v = clamp(v, -hw, hw);
    return [s * u, s * v];
  }
  aiCarrier(p, h) {
    const t = p.team, s = t.dir, opp = this.other(t), u = s * p.x, v = s * p.y;
    let td = 1e9, thr = null;
    for (const o of opp.skaters) { if (o.downT > 0) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < td) { td = d; thr = o; } }
    const front = thr ? s * (thr.x - p.x) > -1 : false;
    let tu, tv;
    if (u > 86) { tu = 80; tv = (v >= 0 ? 1 : -1) * 16; }
    else if (u < 52) { tu = u + 28; tv = v * 0.55; }
    else { tu = 76; tv = (Math.abs(v) < 6 ? v : v * 0.4) + (v >= 0 ? 3 : -3); }
    for (const o of opp.skaters) {
      if (o.downT > 0) continue;
      const du = s * o.x - u, dv = s * o.y - v, d = Math.hypot(du, dv);
      if (d < 16 && du > -4) { const w = (16 - d) / 16; tv += (dv >= 0 ? -1 : 1) * w * 16; tu -= w * 4; }
    }
    // ofsajd: když je spoluhráč ještě v útočném pásmu, počkej před modrou (ať se vrátí)
    if (this.cfg.offside !== false && u < RINK.BLUE_X && t.skaters.some((q) => q !== p && s * q.x > RINK.BLUE_X + 0.5)) tu = Math.min(tu, RINK.BLUE_X - 4);
    tu = clamp(tu, -85, 85);
    const hw = rinkHalfWidthAt(s * tu) - 5; tv = clamp(tv, -hw, hw);
    const dx = s * tu - p.x, dy = s * tv - p.y, d = Math.hypot(dx, dy) || 1;
    p.inX = dx / d; p.inY = dy / d; p.faceDir = null;
    p.turbo = td > 13 && p.stamina > 0.4 && u < 65;
    if (p.winding) { p.ai.wind -= h; if (p.ai.wind <= 0 || td < 3.5) this.releaseShot(p); return; }
    if (p.swingT > 0) return;
    p.ai.t -= h;
    if (p.ai.t > 0) return;
    p.ai.t = this.thinkFor(t) * rand(0.7, 1.3);
    const dn = Math.hypot(s * RINK.GOAL_X - p.x, p.y);
    if (this.goalieOff(opp) && u > -70) {
      const gx = s * RINK.GOAL_X, clear = !opp.skaters.some((o) => o.downT <= 0 && segDist(o.x, o.y, p.x, p.y, gx, 0) < 3.5);
      if (clear && Math.abs(v) < 34 && Math.random() < (u > 30 ? 0.8 : 0.45)) { this.shoot(p, 0, false, null, false); return; }
    }
    let sp = 0;
    if (u > 38 && u < 88) {
      sp = dn < 20 ? 0.5 : dn < 32 ? 0.24 : dn < 48 ? 0.08 : 0.02;
      const a = Math.atan2(Math.abs(v), RINK.GOAL_X - u);
      if (a > 1.15) sp *= 0.15; else if (a > 0.9) sp *= 0.5;
      if (Math.abs(angDiff(p.dir, Math.atan2(-p.y, s * RINK.GOAL_X - p.x))) > 1.4) sp *= 0.3;   // zády k brance raději nestřílí
    }
    if (Math.random() < sp) {
      if (dn > 30 && td > 9 && Math.random() < 0.65) { p.winding = true; p.windT = 0; p.ai.wind = rand(0.35, 0.8); }
      else { const sn = dn > 15 && dn < 38 && Math.random() < 0.3; this.shoot(p, 0, false, null, false, { snap: sn, z: sn ? 'high' : Math.random() < 0.2 ? 'low' : null }); }
      return;
    }
    const my = this.openScore(p, p);
    let best = null, bs = -1e9;
    const vis = clamp((p.pas - 0.9) / 0.18, 0, 1);
    for (const q of t.skaters) {
      if (q === p || q.downT > 0) continue;
      // hráč s horším přehledem občas nevidí spoluhráče za zády
      if (Math.abs(angDiff(p.dir, Math.atan2(q.y - p.y, q.x - p.x))) > 1.9 && Math.random() > 0.25 + 0.7 * vis) continue;
      const sc = this.openScore(q, p); if (sc > bs) { bs = sc; best = q; }
    }
    const pressure = td < 9 && front;
    const back = best && s * (best.x - p.x) < -6;
    if (best && ((pressure && bs > my - (back ? -6 : 4) && Math.random() < (back ? 0.3 : 0.55)) || (bs > my + (back ? 18 : 10) && Math.random() < 0.4))) {
      if (this.laneBlocked(p, best) && Math.abs(p.x) < 65 && Math.random() < 0.35) this.bankPass(p, best); else this.pass(p, best, false);
      return;
    }
    if (pressure && p.spdN > 10 && Math.random() < 0.02 && this.dropPass(p)) return;
    const offRisk = this.cfg.offside !== false && t.skaters.some((q) => q !== p && s * q.x > RINK.BLUE_X + 0.5);
    const iceRisk = this.cfg.icing !== false && u < 1 && !(t.skaters.length < opp.skaters.length);
    if (pressure && u > -15 && u < 28 && !offRisk && !iceRisk && Math.random() < 0.18) { this.dump(p); return; }
    if (t.change && u > -30 && u < 40 && !offRisk && !iceRisk && Math.random() < 0.6) { this.dump(p); return; } // nahoď a střídej
    if (td < 5.5 && front && Math.random() < 0.25) this.deke(p);
  }
  openScore(q, from) {
    const s = q.team.dir, u = s * q.x, v = s * q.y;
    let open = 25;
    for (const o of this.other(q.team).skaters) { if (o.downT > 0) continue; open = Math.min(open, Math.hypot(o.x - q.x, o.y - q.y)); }
    let sc = open * 1.2 + clamp(u, -60, 85) * 0.3;
    if (u > 55 && Math.abs(v) < 22) sc += 12;
    if (q !== from) {
      if (this.laneBlocked(from, q)) sc -= 25;
      // ofsajd: přihrávka zpoza modré na hráče v útočném pásmu (nebo když tam někdo zůstal) je zakázaná
      if (this.cfg.offside !== false && s * from.x <= RINK.BLUE_X && (u > RINK.BLUE_X - 1 || q.team.skaters.some((o) => o !== from && s * o.x > RINK.BLUE_X + 0.5))) sc -= 200;
      // dopředu je lepší; dozadu jen když to opravdu stojí za to
      const adv = s * (q.x - from.x);
      sc += clamp(adv, -40, 40) * 0.35;
      if (adv < -6) sc -= 8;
      const d = Math.hypot(q.x - from.x, q.y - from.y);
      if (d > 75) sc -= 15; if (d < 10) sc -= 10;
    }
    return sc;
  }

  // ---------- přerušení, góly, třetiny ----------
  whistle(reason, spot) {
    this.icing = null;
    if (this.pending) { this.assess(this.pending); this.pending = null; }
    this.state = 'stop'; this.stateT = 0; this.stopSpot = this.practice ? this.practiceSpot() : spot;
    this.sfx('whistle');
    this.showBanner(reason, '', 1.4);
  }
  goal(sN) {
    const pk = this.puck, team = this.teams.find((t) => t.dir === sN), opp = this.other(team);
    team.score++;
    pk.inNet = sN;
    const en = this.goalieOff(opp);
    if (pk.shot && pk.shot.log && pk.shot.team === team) pk.shot.log.res = 'goal';
    else { const L = this.shotLog[this.shotLog.length - 1]; if (L && L.team === team && L.res !== 'goal' && this.time - (L.t || 0) < 4) L.res = 'goal'; }
    if (pk.shot && !pk.shot.counted && pk.shot.team === team) { pk.shot.counted = true; team.shots++; pk.shot.by.stats.s++; if (!en) opp.goalie.stats.sa++; }
    const hist = pk.history.filter((p) => p.team === team && !p.isGoalie);
    const scorer = hist.length ? hist[hist.length - 1] : null;
    const assists = [];
    for (let i = hist.length - 2; i >= 0 && assists.length < 2; i--) if (hist[i] !== scorer && !assists.includes(hist[i])) assists.push(hist[i]);
    if (scorer) { scorer.stats.g++; scorer.celebT = 3; }
    if (this.practice) this.practice.goals++;
    this.achGoal(team, opp, scorer, en);
    for (const a of assists) a.stats.a++;
    let ppNote = en ? 'Do prázdné branky' : '';
    if (this.pending && this.pending.team !== team) { ppNote = 'Vyloučení se ruší'; this.pending = null; }
    else if (this.pending) { this.assess(this.pending); this.pending = null; }
    const oppPen = this.penalties.filter((pn) => pn.team === opp), ownPen = this.penalties.filter((pn) => pn.team === team);
    if (oppPen.length > ownPen.length) {
      team.ppg++; ppNote = 'Gól v přesilovce';
      const pn = oppPen.reduce((a, b) => (a.left < b.left ? a : b));
      this.endPenalty(pn, false);
    }
    if (ppNote !== 'Gól v přesilovce') { for (const q of team.skaters) q.stats.pm++; for (const q of opp.skaters) q.stats.pm--; }
    this.goals.push({ team, scorer, assists, period: this.period, clock: this.clock, pp: ppNote === 'Gól v přesilovce', en });
    this.state = 'goal'; this.stateT = 0; this.goalLight = sN; this.goalLightT = 4;
    this.showBanner('GÓÓÓL!', team.def.city + ' ' + team.def.name, 3.4, team.jersey);
    const who = scorer ? '#' + scorer.num + ' ' + scorer.name.toUpperCase() : 'VLASTNÍ GÓL';
    const ast = (assists.length ? 'Asistence: ' + assists.map((a) => a.name).join(', ') : 'Bez asistence') + (ppNote ? '  •  ' + ppNote : '');
    this.lower = { title: who, sub: ast, team, t: 0, dur: 3.6 };
    this.sfx('horn'); this.sfx('cheer', 1);
    this.say([pick(['Gól!', 'A je to tam!', 'Gól! Puk je v síti!', 'Gól! Neuvěřitelné!', 'Góóól!']), ppNote === 'Gól v přesilovce' ? 'Gól v přesilovce!' : en ? 'Do prázdné branky!' : null, scorer ? 'Skóroval' : null, scorer ? scorer.name : null], true);
    for (const p of team.skaters) { p.inX = 0; p.inY = 0; }
  }
  // výzvy: gól hráče, kterého řídí člověk
  achGoal(team, opp, scorer, en) {
    for (const T of this.teams) if (T.humans.length) { const d = this.other(T).score - T.score; if (d >= 2) T.wasDown2 = true; }
    if (!this.achOn || !scorer || !team.humans.length) return;
    const pk = this.puck, human = scorer.ctrl >= 0 || (pk.shot && pk.shot.human && pk.shot.by === scorer) || (pk.deflT > 0 && pk.lastTouch === scorer && scorer.ctrl >= 0);
    if (!human) return;
    const A = (id) => Ach.unlock(id);
    A('goal');
    const n = (this.hGoals.get(scorer) || 0) + 1; this.hGoals.set(scorer, n); if (n >= 3 && !this.practice) A('hat');
    if (this.practice) { if (this.practice.kind === 'shoot' && this.practice.goals >= 10) A('practice'); return; }
    const oppPen = this.penalties.filter((pn) => pn.team === opp).length, ownPen = this.penalties.filter((pn) => pn.team === team).length;
    if (oppPen > ownPen) A('pp');
    if (ownPen > oppPen) A('sh');
    if (en) A('en');
    if (this.goalieOff(team)) A('sixer');
    if (this.period === 4) A('ot');
    if (pk.oneTimer) A('ot1');
    if (pk.deflT > 0) A('tip');
  }
  afterGoal() {
    if (this.practice) { this.rec = []; this.setupFaceoff(...this.practiceSpot()); return; }
    if (this.period > 3) return this.finish();
    if (Settings.data.replay && !this.demo && this.rec.length > 60) this.startReplay();
    else this.afterReplay();
  }
  startReplay() {
    this.replay = { frames: this.rec.slice(-250), f: 0 };
    this.state = 'replay'; this.stateT = 0;
  }
  endReplay() { this.replay = null; this.afterReplay(); }
  afterReplay() {
    this.rec = [];
    this.setupFaceoff(...this.practiceSpot());
    this.sfx('organ', Math.floor(Math.random() * 4));
  }
  record() {
    this.recSkip ^= 1;
    if (this.recSkip) return;
    const pk = this.puck;
    this.rec.push({
      px: pk.x, py: pk.y, pz: pk.z,
      refs: this.refs.map((r) => ({ ref: r, isRef: true, team: r.team, kind: r.kind, x: r.x, y: r.y, dir: r.dir, stride: r.stride, spdN: r.spdN, arm: r.arm, armDir: r.armDir, downT: 0 })),
      pl: this.all.map((p) => ({ ref: p, x: p.x, y: p.y, dir: p.dir, stride: p.stride, spdN: p.spdN, downT: p.downT, lie: p.lie,
        windT: p.winding || p.swingT > 0 ? p.windT : 0, shotFT: p.shotFT || 0, shotSlap: p.shotSlap, passFT: p.passFT || 0, celebT: p.celebT || 0, foTake: p.foTake, foReady: p.foReady, foSwipe: p.foSwipe || 0, pokeA: p.pokeA, stk: p.ctrl >= 0 ? p.stk : null, pokeDir: p.pokeDir, pokeLift: p.pokeLift, actDir: p.actDir, shotBh: p.shotBh, checkT: p.checkT, hip: p.hip, blockT: p.blockT, saveT: p.saveT, saveKind: p.saveKind, isGoalie: p.isGoalie, team: p.team,
        num: p.num, hand: p.hand, carry: p.carry, ctrl: -1, role: p.role, reach: p.reach })),
    });
    if (this.rec.length > 330) this.rec.shift();
  }
  endPeriod() {
    this.sfx('buzzer');
    if (this.pending) { this.assess(this.pending); this.pending = null; }
    const [a, b] = this.teams;
    if (this.period >= 3 && a.score !== b.score) return this.finish();
    if (this.period >= 4 || (this.period === 3 && this.otMode === 'off')) return this.cfg.shootout !== false && !this.demo ? this.startShootout() : this.finish();
    this.state = 'periodEnd'; this.stateT = 0;
    this.say('Konec ' + ['', 'první', 'druhé', 'třetí'][this.period] + ' třetiny.', true);
  }
  // ---------- rolba o přestávce ----------
  startZamboni() {
    if (this.state !== 'periodEnd') return;
    this.state = 'zamboni'; this.stateT = 0; this.zamUsed = true; this.iceManual = true;
    this.zam = { x: -24, y: RINK.HW - 6, dir: -Math.PI / 2, v: 0, ix: 0, iy: 0 };
    this.zamDirt0 = Math.max(1, this.iceDirty());
    this.banner = null;
    this.say('Rolba vyjíždí na led.', true);
  }
  updateZamboni(h) {
    const z = this.zam;
    // vyhlazený vstup (rolba je těžká, nereaguje škubnutím)
    z.sx = (z.sx || 0) + (z.ix - (z.sx || 0)) * Math.min(1, h * 5); z.sy = (z.sy || 0) + (z.iy - (z.sy || 0)) * Math.min(1, h * 5);
    const m = Math.min(1, Math.hypot(z.sx, z.sy));
    let want = m > 0.15 ? Math.atan2(z.sy, z.sx) : null;
    // u mantinelu: pohled dopředu, plynulé stočení podél stěny místo nárazů
    const fx = Math.cos(z.dir), fy = Math.sin(z.dir), look = 6.5 + Math.max(0, z.v) * 0.5;
    const c = rinkContact(z.x + fx * look, z.y + fy * look, 4.6);
    if (c && z.v > 0.5) {
      const t1 = Math.atan2(c.nx, -c.ny), t2 = t1 + Math.PI, tang = Math.abs(angDiff(z.dir, t1)) < Math.abs(angDiff(z.dir, t2)) ? t1 : t2;
      const into = fx * c.nx + fy * c.ny, k = clamp(c.pen / 3 + 0.3, 0, 1);
      // když hráč míří od stěny, necháme ho; jinak sklouzneme podél ní
      if (want == null || Math.cos(want) * c.nx + Math.sin(want) * c.ny > -0.2) want = want == null ? tang : Math.atan2(Math.sin(want) * (1 - k) + Math.sin(tang) * k, Math.cos(want) * (1 - k) + Math.cos(tang) * k);
      if (into > 0.3) z.v *= 1 - Math.min(1, h * 1.2 * into);
    }
    if (want != null) {
      const rate = 1.15 * clamp(0.3 + Math.abs(z.v) / 9, 0, 1);
      z.dir += clamp(angDiff(z.dir, want), -rate * h, rate * h);
    }
    if (m > 0.15) z.v += (m * 13 - z.v) * Math.min(1, h * 0.9); else z.v *= 1 - Math.min(1, h * 1.4);
    z.x += Math.cos(z.dir) * z.v * h; z.y += Math.sin(z.dir) * z.v * h;
    // kondicionér za zadní nápravou obnoví led v pásu 7,5 stopy
    const rx = z.x - Math.cos(z.dir) * 8.6, ry = z.y - Math.sin(z.dir) * 8.6, lx = -Math.sin(z.dir), ly = Math.cos(z.dir);
    for (let k = -3.6; k <= 3.6; k += 0.9) for (const b of [-0.9, 0, 0.9]) this.ice[this.iceIdx(rx + lx * k + Math.cos(z.dir) * b, ry + ly * k + Math.sin(z.dir) * b)] = 0;
    // náraz do mantinelu (rolba je dlouhá: kontrolujeme předek, střed i zadek)
    for (const k of [6.5, 0, -6.5]) {
      const px = z.x + Math.cos(z.dir) * k, py = z.y + Math.sin(z.dir) * k, c = rinkContact(px, py, 3.8);
      if (c) {
        z.x -= c.nx * c.pen; z.y -= c.ny * c.pen;
        const into = (Math.cos(z.dir) * c.nx + Math.sin(z.dir) * c.ny) * z.v;
        if (into > 5) { this.sfx('board', clamp(into / 15, 0.2, 0.6)); z.v *= 0.7; }
      }
    }
  }
  endZamboni() { if (this.state === 'zamboni') { if (this.achOn && this.zamPct() >= 95) Ach.unlock('zam'); this.zam = null; this.nextPeriod(); } }
  // ---------- trestné střílení ----------
  startPenaltyShot(T, shooter, off, type) {
    const pk = this.puck; pk.owner = null; pk.held = null;
    this.icing = null; this.battle = null;
    this.whistle('TRESTNÉ STŘÍLENÍ', [0, 0]);
    this.psPending = { T, shooter };
    this.lower = { title: 'TRESTNÉ STŘÍLENÍ', sub: FOULS[type] + ' — #' + off.num + ' ' + off.name.toUpperCase() + ' (' + off.team.def.abbr + ')', team: T, t: 0, dur: 3.2 };
    this.say(['Trestné střílení!', shooter.name], true);
  }
  beginPenaltyShot() {
    const { T, shooter } = this.psPending; this.psPending = null;
    for (const t of this.teams) this.resetPull(t);
    const i = this.teams.indexOf(T);
    this.shootout = { att: [[], []], turn: i, order: [0, 0], phase: 'wait', t: 1.2, n: 1, single: true, fixed: shooter };
    T.soList = [shooter];
    this.state = 'shootout'; this.stateT = 0; this.all = [];
  }
  endPenaltyShot(goal) {
    const so = this.shootout, T = so.shootTeam, side = this.puck.y >= 0 ? 1 : -1;
    this.shootout = null;
    for (const t of this.teams) { this.resetPull(t); this.instantChange(t, t.line); t.goalie.hIn = null; }
    this.state = 'play';
    if (goal) { this.puck.history = [so.shooter]; this.puck.shot = null; this.goal(T.dir); }
    else { this.pop('NEPROMĚNIL', so.def.goalie.x, so.def.goalie.y, '#9fe3ff'); this.whistle('ZÁKROK', [T.dir * 69, side * 22]); }
  }
  // ---------- nájezdy ----------
  startShootout() {
    this.penalties = []; this.pending = null; this.icing = null; this.injWait = null;
    for (const t of this.teams) {
      this.resetPull(t);
      // pořadí střelců: nejšikovnější útočníci, pak obránci
      t.soList = t.lines.flat().filter((p) => !p.injured && !p.inBox)
        .sort((a, b) => (b.role[1] !== 'D') - (a.role[1] !== 'D') || (b.acc + b.pow * 0.5) - (a.acc + a.pow * 0.5));
    }
    this.shootout = { att: [[], []], turn: this.practice ? (this.practice.kind === 'sog' ? 1 : 0) : 1, order: [0, 0], phase: 'wait', t: 0, n: 0 };
    this.state = 'shootout'; this.stateT = 0;
    this.all = []; this.puck.owner = null; this.puck.held = null;
    if (!this.practice) this.showBanner('NÁJEZDY', 'Tři série, pak náhlá smrt', 2.4);
    this.sfx('organ', 2);
    this.say('O vítězi rozhodnou samostatné nájezdy!', true);
  }
  beginAttempt() {
    const so = this.shootout, T = this.teams[so.turn], D = this.other(T), pk = this.puck;
    const p = so.fixed || T.soList[so.order[so.turn]++ % T.soList.length];
    Object.assign(so, { phase: 'run', t: 0, shot: false, shotT: 0, shooter: p, shootTeam: T, def: D, deked: false, wound: false,
      style: pick(['shot', 'deke', 'deke', 'slap', 'shot']), lane: rand(-1, 1), ph: rand(0, 6), shootAt: rand(18, 30) });
    T.pulled = true; D.pulled = false;
    for (const t of this.teams) for (const q of t.roster) { q.ctrl = -1; q.onIce = false; }
    const g = D.goalie, s = T.dir;
    p.onIce = true; g.onIce = true; g.hIn = null; g.leaving = false; g.returning = false;
    Object.assign(p, { x: -s * 4, y: rand(-3, 3), vx: s * 6, vy: 0, dir: s > 0 ? 0 : Math.PI, downT: 0, checkT: 0, pokeA: 0, winding: false, windT: 0,
      dekeT: 0, recoverT: 0, inX: 0, inY: 0, turbo: false, oneTimerQ: false, pickCD: 0, faceDir: null, stamina: 1, extra: false, goBench: false });
    Object.assign(g, { x: s * (RINK.GOAL_X - 2.5), y: 0, vx: 0, vy: 0, holdT: 0, saveT: 0, downT: 0, dir: s > 0 ? 0 : Math.PI });
    g.ai.tx = g.x; g.ai.ty = 0;
    this.all = [p, g];
    Object.assign(pk, { x: p.x + s * 2, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: p, held: null, passTarget: null, shot: null, lastTouch: p, history: [p], inNet: 0, reboundT: 0, deflT: 0, oneTimer: false });
    pk.ignore.clear();
    for (const h of this.humans) { h.player = null; if (h.team === T && !T.humans.some((q) => q.player)) { h.player = p; p.ctrl = h.idx; } }
    this.lower = { title: '#' + p.num + ' ' + p.name.toUpperCase() + ' (' + T.def.abbr + ')', sub: (so.att[so.turn].length + 1) + '. NÁJEZD, BRANKÁŘ ' + g.name.toUpperCase(), team: T, t: 0, dur: 2.6 };
    this.say(['Nájezd.', p.name], false, 0.7);
    this.camSnap = true;
  }
  stepShootout(h) {
    const so = this.shootout, pk = this.puck; so.t += h;
    if (so.phase === 'wait') { if (so.t > (so.n ? 1.9 : 2.6)) this.beginAttempt(); return; }
    if (so.phase === 'over') { if (so.t > 2.8) { this.shootout.phase = 'end'; this.finish(); } return; }
    if (so.phase !== 'run') return;
    const p = so.shooter, s = so.shootTeam.dir;
    if (p.ctrl < 0) this.aiShooter(p, h);
    this.movePlayers(h);
    this.updatePuck(h);
    if (this.shootout !== so || so.phase !== 'run') return;
    this.record();
    if (pk.shot && !so.shot) { so.shot = true; so.shotT = so.t; }
    const lost = !pk.owner && !so.shot && Math.hypot(pk.vx, pk.vy) < 3 && Math.hypot(pk.x - p.x, pk.y - p.y) > 7;
    if (pk.held || (so.shot && so.t - so.shotT > 1.7) || lost || s * pk.x > RINK.GOAL_X + 1.5 || so.t > 13) this.soEnd(false);
  }
  // počítač při nájezdu: kličkuje, střílí zápěstím, po kličce nebo příklepem
  aiShooter(p, h) {
    const so = this.shootout, s = p.team.dir, gx = s * RINK.GOAL_X, pk = this.puck;
    if (pk.owner !== p) {
      if (!so.shot) { const dx = pk.x - p.x, dy = pk.y - p.y, d = Math.hypot(dx, dy) || 1; p.inX = dx / d; p.inY = dy / d; } else { p.inX = 0; p.inY = 0; }
      return;
    }
    const dn = Math.hypot(gx - p.x, p.y);
    const ty = so.lane * clamp((dn - 14) / 40, 0, 1) * 12 + (dn > 25 ? Math.sin(so.t * 1.7 + so.ph) * 3 : 0), tx = gx - s * 6;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    p.inX = dx / d; p.inY = dy / d; p.turbo = false;
    if (p.winding) { p.ai.wind -= h; if (p.ai.wind <= 0) this.releaseShot(p); return; }
    if (so.style === 'slap' && dn < 40 && !so.wound) { so.wound = true; p.winding = true; p.windT = 0; p.ai.wind = rand(0.45, 0.7); }
    else if (so.style === 'shot' && dn < so.shootAt) this.shoot(p, 0, false, null, false);
    else if (so.style === 'deke') {
      if (dn < 19 && !so.deked) { so.deked = true; this.deke(p); }
      else if (so.deked && p.dekeT < 0.2) this.shoot(p, 0, false, null, false);
    }
    if (pk.owner === p && dn < 9) this.shoot(p, 0, false, null, false);
  }
  // člověk při nájezdu: střelec (páčka, X střela, B klička) nebo brankář (páčka = postavení, X/A = vypíchnutí)
  soHuman(h) {
    const so = this.shootout, d = h.dev, st = d.st;
    if (!so || so.phase !== 'run') return;
    const ax = st.lx, ay = -st.ly, wx = ax * VIEW.rx + ay * VIEW.fx, wy = ax * VIEW.ry + ay * VIEW.fy;
    if (h.team === so.def) {
      const g = so.def.goalie; g.hIn = { x: wx, y: wy };
      if (d.pressed('x') || d.pressed('a')) this.goaliePoke(g, so.shooter);
      return;
    }
    const p = h.player; if (!p) return;
    p.inX = wx; p.inY = wy; p.turbo = st.rt || st.rb;
    const pk = this.puck;
    if (d.pressed('x') && pk.owner === p) { p.winding = true; p.windT = 0; }
    if (p.winding && !st.x) this.releaseShot(p);
    if (d.pressed('b') && pk.owner === p) this.deke(p);
  }
  goaliePoke(g, p) {
    if (g.pokeCD > 0) return;
    g.pokeCD = 1.3; g.saveT = 0.4; g.saveKind = 1;
    const pk = this.puck, d = Math.hypot(p.x - g.x, p.y - g.y);
    if (pk.owner === p && d < 7.5 && Math.random() < (p.dekeT > 0 ? 0.2 : 0.6)) {
      this.loosePuck(p, (pk.x - g.x) * 2 + rand(-4, 4), (pk.y - g.y) * 2 + rand(-4, 4));
      this.pop('VYPÍCHNUTO!', g.x, g.y, '#9fe3ff'); this.sfx('stick', 0.9);
      this.soEnd(false);
    } else {
      // netrefil: brankář vyjel z postavení
      g.ai.tx += (p.x - g.x) * 0.35; g.ai.ty += (p.y - g.y) * 0.35;
    }
  }
  soEnd(goal) {
    if (this.shootout.single) { if (this.achOn && !goal && this.shootout.def.humans.length) Ach.unlock('soSave'); return this.endPenaltyShot(goal); }
    const so = this.shootout, T = so.shootTeam, i = this.teams.indexOf(T), g = so.def.goalie;
    so.att[i].push(goal); so.n++; so.phase = 'wait'; so.t = 0; g.hIn = null;
    if (this.achOn) { if (goal && so.shooter.ctrl >= 0) Ach.unlock('soGoal'); if (!goal && so.def.humans.length) Ach.unlock('soSave'); }
    if (goal) {
      this.goalLight = T.dir; this.goalLightT = 2; this.sfx('horn', 1.2); this.sfx('cheer', 0.8);
      this.showBanner('GÓL!', so.shooter.name.toUpperCase(), 1.6, T.jersey);
      this.say(pick(['Proměnil!', 'Je to tam!', 'Gól!']), true);
    } else {
      this.showBanner(this.puck.held || this.puck.reboundT > 0 ? 'ZÁKROK!' : 'NEPROMĚNIL', '', 1.4);
      this.sfx('ooh', 0.8); this.say(pick(['Zákrok!', 'Neproměnil.', 'Brankář vyhrál souboj.']), false, 0.8);
    }
    if (this.practice) {
      this.practice.shots++; if (goal) this.practice.goals++;
      if (this.achOn && goal && T.humans.length && this.practice.goals >= 5) Ach.unlock('soGoal');
      return;
    }
    so.turn = 1 - so.turn;
    // rozhodnuto? (3 série, pak náhlá smrt)
    const [A, B] = so.att, gA = A.filter(Boolean).length, gB = B.filter(Boolean).length;
    let win = null;
    if (A.length <= 3 && B.length <= 3) {
      const rA = 3 - A.length, rB = 3 - B.length;
      if (gA + rA < gB) win = 1; else if (gB + rB < gA) win = 0;
    }
    if (win == null && A.length === B.length && A.length >= 3 && gA !== gB) win = gA > gB ? 0 : 1;
    if (win != null) {
      const W = this.teams[win]; W.score++; this.soWinner = W;
      so.phase = 'over'; so.t = 0;
    }
  }
  // ---------- zakázané uvolnění (icing) ----------
  // puk zahraný zpoza středové čáry přejede nedotčený brankovou čáru soupeře (mimo branku)
  checkIcing() {
    const pk = this.puck, prev = this.icePrev == null ? pk.x : this.icePrev;
    this.icePrev = pk.x;
    if (this.cfg.icing === false || this.state !== 'play') { this.icing = null; return; }
    const ic = this.icing;
    if (ic) {
      // odložený icing: rozhoduje, kdo se puku dotkne první
      const by = pk.owner || pk.held || (pk.lastTouch !== ic.lt ? pk.lastTouch : null);
      if (!by) return;
      this.icing = null;
      if (by.team === ic.team || by.isGoalie) { this.pop('BEZ ICINGU', by.x, by.y, '#cfd8ea'); return; } // dostihl ho útočník / zahrál brankář
      this.icings = (this.icings || 0) + 1;
      ic.team.iced = true;
      this.say('Zakázané uvolnění.', false, 0.8);
      this.whistle('ZAKÁZANÉ UVOLNĚNÍ', [-ic.team.dir * 69, ic.side * 22]);
      return;
    }
    if (pk.owner || pk.held || pk.inNet || !pk.lastTouch) return;
    const t = pk.lastTouch.team, sN = t.dir;
    if (pk.lastTouch.isGoalie || pk.touchTeam !== t || sN * (pk.touchX == null ? pk.x : pk.touchX) >= 0) return;
    if (!(sN * prev <= RINK.GOAL_X && sN * pk.x > RINK.GOAL_X) || Math.abs(pk.y) <= RINK.NET_W + 0.3) return;
    if (t.skaters.length < this.other(t).skaters.length) return; // tým v oslabení smí puk vyhodit
    if (this.cfg.icingMode === 'instant') {
      // okamžitý icing: píská se hned po přejetí brankové čáry
      this.icings = (this.icings || 0) + 1; t.iced = true;
      this.say('Zakázané uvolnění.', false, 0.8);
      this.whistle('ZAKÁZANÉ UVOLNĚNÍ', [-sN * 69, (pk.y >= 0 ? 1 : -1) * 22]);
      return;
    }
    // čárový zvedne ruku a čeká, kdo puk zahraje
    this.icing = { team: t, lt: pk.lastTouch, side: pk.y >= 0 ? 1 : -1 };
    this.pop('ICING?', pk.x, pk.y, '#ffe066');
  }
  // ---------- ofsajd ----------
  // puk vjede do útočného pásma a někdo z útočícího týmu (kromě hráče s pukem) už je za modrou čárou
  checkOffside() {
    const pk = this.puck, prev = this.offPrev == null ? pk.x : this.offPrev;
    this.offPrev = pk.x;
    if (this.cfg.offside === false || this.state !== 'play' || pk.held) return;
    for (const t of this.teams) {
      const sN = t.dir;
      if (!(sN * prev <= RINK.BLUE_X && sN * pk.x > RINK.BLUE_X)) continue;
      const by = pk.owner || pk.lastTouch;
      if (!by || by.team !== t) continue;
      const off = t.skaters.find((q) => q !== pk.owner && !q.goBench && sN * q.x > RINK.BLUE_X + 1.2);
      if (!off) continue;
      this.offsides = (this.offsides || 0) + 1;
      this.pop('OFSAJD', off.x, off.y, '#ffe066');
      this.say('Ofsajd!', false, 0.8);
      this.whistle('OFSAJD', [sN * 20, (pk.y >= 0 ? 1 : -1) * 22]);
      return;
    }
  }
  // ---------- stav ledu ----------
  iceIdx(x, y) { return Math.floor(clamp(y + 42.5, 0, 84.9) / 2) * 100 + Math.floor(clamp(x + 100, 0, 199.9) / 2); }
  iceAt(x, y) { return this.ice[this.iceIdx(x, y)]; }
  scuff(x, y, a) { const i = this.iceIdx(x, y); this.ice[i] = Math.min(1, this.ice[i] + a); }
  iceQuality() { let s = 0; for (const v of this.ice) s += v; return clamp(100 - s / this.ice.length * 160, 0, 100); }
  iceDirty() { let n = 0; for (const v of this.ice) if (v > 0.08) n++; return n; }
  zamPct() { return this.zamDirt0 ? clamp(100 * (1 - this.iceDirty() / this.zamDirt0), 0, 100) : 100; }
  nextPeriod() {
    if (this.cfg.zamboni !== 'off' && !this.zamUsed) this.ice.fill(0); // automatická rolba
    this.zamUsed = false;
    this.period++; this.clock = this.period === 4 ? this.otLen : this.periodLen; this.setDirs();
    for (const t of this.teams) { for (const p of t.roster) p.stamina = 1; t.change = null; t.wantPull = false; this.instantChange(t, 0); }
    this.setupFaceoff(0, 0);
    this.state = 'intro'; this.stateT = 0;
    this.showBanner(PERIOD_NAMES[this.period], this.period === 4 ? (this.otMode === '3v3' ? '3 na 3 — rozhodne první gól' : 'Náhlá smrt — rozhodne první gól') : '', 2.2);
    this.sfx('organ', this.period);
    this.say(this.period === 4 ? 'Jdeme do prodloužení!' : 'Začíná ' + ['', 'první', 'druhá', 'třetí'][this.period] + ' třetina.', true);
  }
  finish() {
    this.state = 'final'; this.stateT = 0;
    for (const t of this.teams) { t.wantPull = false; if (!this.shootout) { this.resetPull(t); this.instantChange(t, t.line); } }
    const [a, b] = this.teams;
    const win = a.score > b.score ? a : b.score > a.score ? b : null;
    this.winner = win;
    if (this.achOn && win && win.humans.length && this.other(win).cpu && !this.practice) {
      const A = (id) => Ach.unlock(id);
      A('win'); if (Ach.count('wins') >= 10) A('wins10');
      if (this.other(win).score === 0) A('shut');
      if (this.cfg.diff >= 3) A('hard'); if (this.cfg.diff >= 4) A('legend');
      if (this.soWinner === win) A('so');
      if (this.cfg.three) A('three');
      if (win.wasDown2) A('comeback');
    }
    const all = this.teams.flatMap((t) => t.roster).filter((p) => !p.isGoalie || p === p.team.goalie).map((p) => {
      let sc = p.stats.g * 3 + p.stats.a * 2 + p.stats.h * 0.3 + p.stats.s * 0.2;
      if (p.isGoalie) sc = p.stats.sv * 0.3 - (p.stats.sa - p.stats.sv) * 1.0 + (win === p.team ? 1.5 : 0);
      if (win === p.team) sc += 0.5;
      return { p, sc };
    }).sort((x, y) => y.sc - x.sc);
    this.stars = all.slice(0, 3).map((o) => o.p);
    this.sfx('horn', 3.2); this.sfx('cheer', 0.8);
    this.say(win ? ['Konec zápasu! Vítězí', win.def.city] : 'Konec zápasu. Remíza.', true);
  }
}
