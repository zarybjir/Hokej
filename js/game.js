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
// ---------- sport: hokej (výchozí) nebo malá kopaná ----------
// Fotbal používá stejné jádro: mění jen fyziku pohybu a míče a velikost branky (viz football.js).
const PH_HOCKEY = { ...PH, BZ: 0.3 };
const PH_FOOTBALL = { GRIP: 300, BRAKE: 150, ACC: 46, MAXV: 14.5, TURBO: 1.28, GLIDE: 7, PF: 0.6, PR: 0.36, PLR: 1.0, GR: 1.3, BE: 0.5, BZ: 0.55 };
const PH_POLO = { GRIP: 70, BRAKE: 34, ACC: 20, MAXV: 9.5, TURBO: 1.3, GLIDE: 2.4, PF: 2.2, PR: 0.36, PLR: 1.1, GR: 1.3, BE: 0.4, BZ: 0.15 };   // plavání, míč na vodě
let SPORT = 'hockey';
function applySport(s) {
  SPORT = ['football', 'polo', 'curling'].includes(s) ? s : 'hockey';
  Object.assign(PH, PH_HOCKEY, SPORT === 'football' ? PH_FOOTBALL : SPORT === 'polo' ? PH_POLO : {});
  Object.assign(RINK, SPORT === 'football' ? { NET_W: 5, NET_H: 6.5 } : SPORT === 'polo' ? { NET_W: 5, NET_H: 3 } : { NET_W: 3, NET_H: 4 });
}
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
  constructor(team, info, arcade) {
    Object.assign(this, { team, id: info.id, role: info.role, name: info.name, first: info.first, num: info.num, hand: info.hand, line: info.line || 0 });
    this.isGoalie = info.role === 'G'; this.cap = !!info.cap;
    // atributy (40–99) → herní parametry
    const A = this.at = info.at || {}, n = (v, lo, hi) => lo + ((v || 75) - 55) / 44 * (hi - lo);
    // atributy mají jen mírný vliv: o výsledku má rozhodovat šikovnost hráče, slabší sestava jen ztěžuje
    if (this.isGoalie) { this.gk = 0.99 + ((A.REF || 78) - 78) * 0.002; this.gkMove = n(A.RYC, 0.97, 1.03); this.spd = 1; this.pow = 1; this.acc = 1; this.pas = 0.95; this.chk = 0.9; }
    else { this.spd = n(A.RYC, 0.92, 1.07); this.pow = n(A.SIL, 0.92, 1.08); this.chk = n(A.SIL, 0.92, 1.1); this.acc = n(A.PRE, 0.9, 1.08); this.pas = this.acc; }
    this.staMul = 0.8 - ((A.STA || 75) - 75) * 0.008;
    // arkádový režim: rozdíly mezi hráči jsou třikrát větší – hvězda je znát, silný tým opravdu přehrává slabý
    if (arcade) { for (const k of ['spd', 'pow', 'chk', 'acc', 'pas', 'gkMove']) if (this[k] != null) this[k] = 1 + (this[k] - 1) * 3; if (this.isGoalie) this.gk = clamp(0.99 + (this.gk - 0.99) * 2.5, 0.93, 1.035); this.pas = this.isGoalie ? this.pas : this.acc; this.staMul = 0.8 + (this.staMul - 0.8) * 2; }
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
    this.stamina = 1; this.boost = 1; this.turbo = false; this.ctrl = -1; this.pickCD = 0; this.inX = 0; this.inY = 0; this.faceDir = null;
    this.oneTimerQ = false;
    this.ai = { t: Math.random() * 0.2, wind: 0, ph: Math.random() * 10, tx: 0, ty: 0 };
    this.stats = { g: 0, a: 0, s: 0, h: 0, sv: 0, sa: 0, pm: 0, toi: 0, fw: 0, fl: 0 };
  }
}

class Game {
  constructor(cfg) {
    this.cfg = cfg; this.silent = !!cfg.silent; this.demo = !!cfg.demo;
    applySport(cfg.sport); this.sport = SPORT; this.fb = SPORT === 'football' || SPORT === 'polo';   // fb = míčová hra nad společným jádrem
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
    const t = { style: teamStyle(idx), mom: 0, idx, def, side, dir: 1, players: [], skaters: [], goalie: null, score: 0, shots: 0, hits: 0, humans: [],
      chaser: null, presser: null, presser2: null, marks: new Map(), tactics: ((this.cfg.tactics && this.cfg.tactics[side]) || [1, 1, 1]).slice(), thinkT: Math.random() * 0.15, cpu: true, spdMod: 1, line: 0, change: null, pim: 0, ppg: 0, ppOpp: 0 };
    const R = (this.cfg.rosters && this.cfg.rosters[side]) || buildRoster(idx);
    t.lines = R.lines.map((l) => l.map((r) => new Player(t, r, this.cfg.arcade)));
    t.goalies = R.goalies.map((r) => new Player(t, r, this.cfg.arcade));
    t.goalie = t.goalies[0]; t.goalie.onIce = true;
    t.roster = [...t.lines.flat(), ...t.goalies];
    t.skaters = t.lines[0].slice(); t.skaters.forEach((p) => (p.onIce = true));
    this.setPlayers(t);
    return t;
  }
  rebuildAll() { this.all = [...this.teams[0].players, ...this.teams[1].players]; }
  setPlayers(t) { t.players = t.pulled ? t.skaters.slice() : [...t.skaters, t.goalie]; }
  // ---------- hlavní smyčka ----------
  // zásah má váhu: krátké zastavení hry a trhnutí kamery (jen v živém zápase, jde vypnout s otřesy obrazu)
  impact(stop, punch) {
    if (this.silent || this.demo || Settings.data.camShake === false) return;
    this.hitStop = Math.max(this.hitStop || 0, stop); this.punch = Math.max(this.punch || 0, punch);
  }
  update(dt) {
    if (this.paused) return;
    this.punch = Math.max(0, (this.punch || 0) - dt * 2.5);
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    if (this.slowT > 0) { this.slowT -= dt; dt *= 0.4; }   // zpomalení, když puk padá do branky
    this.handleHumans(dt);
    this.acc += dt;
    const h = 1 / 120; let n = 0;
    while (this.acc >= h && n < 10) { this.step(h); this.acc -= h; n++; }
    if (n >= 10) this.acc = 0;
    // efekty
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    // vyloučený hráč odjíždí z místa faulu na trestnou lavici (nezmizí naráz)
    for (const pn of this.penalties) if (pn.wt != null && pn.wt < 2.8 && !this.silent) {
      pn.wt += dt; const u = clamp(pn.wt / 2.8, 0, 1), e = u * u * (3 - 2 * u), p = pn.player, D = Math.hypot(pn.bx - pn.fx, pn.by - pn.fy);
      p.x = lerp(pn.fx, pn.bx, e); p.y = lerp(pn.fy, pn.by, e); p.spdN = D * 6 * u * (1 - u) / 2.8; p.stride += dt * p.spdN * 0.3; p.dir = u < 0.97 ? Math.atan2(pn.by - pn.fy, pn.bx - pn.fx) : Math.PI / 2;
    }
    if (this.lower) { this.lower.t += dt; if (this.lower.t > this.lower.dur) this.lower = null; }
    if (this.tv) { this.tv.t += dt; if (this.tv.t > this.tv.dur || this.state === 'play' && this.tv.t > 1.5) this.tv = null; }
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.6);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.goalLightT = Math.max(0, this.goalLightT - dt);
    // nadšení davu
    const pk = this.puck;
    let ex = clamp((Math.abs(pk.x) - 45) / 45, 0, 1) * 0.7 + 0.25 * (this.teams[0].mom || 0);   // domácí na vlně = hlasitější hala
    if (pk.shot) ex = 0.9;
    if (this.state === 'goal') ex = 1;
    Sfx.target = ex;
    // zvuk bruslí podle průměrné rychlosti hráčů; prudké zabrzdění hráče škrábne o led (jen hokej)
    let sk = 0;
    if (!this.fb && this.state === 'play') {
      for (const p of this.all) {
        const v = Math.hypot(p.vx, p.vy); sk += v;
        if (dt > 0 && p.sv0 > 15 && (p.sv0 - v) / dt > 55 && this.time - (p.scrT || -9) > 0.7 && !(p.downT > 0)) { p.scrT = this.time; this.sfx('scrape', clamp(p.sv0 / 60, 0.15, 0.5)); }
        p.sv0 = v;
        // odrazy bruslí hráčů poblíž puku: říznutí při každém kroku
        const sn = Math.floor((p.stride || 0) / Math.PI); if (sn !== p.strN) { p.strN = sn; if (v > 9 && this.time - (this.strT || 0) > 0.11 && Math.hypot(p.x - this.puck.x, p.y - this.puck.y) < 40) { this.strT = this.time; this.sfx('stride', clamp(v / 90, 0.08, 0.28)); } }
      }
      sk /= Math.max(1, this.all.length) * 22;
    }
    Sfx.tick(dt, this.silent ? 0.45 : 1, this.silent ? 0 : sk);
  }
  step(h) {
    this.time += h; this.stateT += h;
    const pk = this.puck;
    if (this.state !== 'replay') { this.updateEnergy(h); this.updateRefs(h, false); }
    if (this.toast) { this.toast.t += h; if (this.toast.t > this.toast.dur) this.toast = null; }
    switch (this.state) {
      case 'intro': {
        // nástup: hráči vyjedou od vlastní branky na svá místa, na obrazovce základní sestavy (A přeskočí)
        const show = !this.fb && !this.silent && !this.demo && !this.practice, dur = show ? 5 : 2.2;
        if (show && this.stateT < dur - 0.6) {
          if (!this.introPos) this.introPos = this.all.filter((p) => !p.isGoalie).map((p, i) => ({ p, tx: p.x, ty: p.y, sx: -p.team.dir * 72, sy: p.y * 0.35 + ((i % 5) - 2) * 2.5 }));
          const u = clamp(this.stateT / (dur - 0.6), 0, 1), e = u * u * (3 - 2 * u), de = 6 * u * (1 - u) / (dur - 0.6);
          for (const q of this.introPos) { const p = q.p; p.x = lerp(q.sx, q.tx, e); p.y = lerp(q.sy, q.ty, e); p.spdN = Math.hypot(q.tx - q.sx, q.ty - q.sy) * de; p.vx = p.vy = 0; p.dir = Math.atan2(q.ty - q.sy, q.tx - q.sx); p.stride += h * p.spdN * 0.3; p.carry = false; }
          this.lineupShow = true;
        } else { if (this.introPos) { for (const q of this.introPos) { q.p.x = q.tx; q.p.y = q.ty; } this.introPos = null; } this.lineupShow = false; this.freeze(); }
        if (this.stateT > dur) { this.state = this.practice && this.practice.kind === 'shoot' ? 'play' : 'faceoff'; this.stateT = 0; }
        break;
      }
      case 'faceoff':
        this.freeze();
        this.goalieMoveAll(h);
        if (!pk.drop && this.stateT > 0.9) { pk.drop = true; }
        if (pk.drop) { pk.vz -= PH.G * h; pk.z += pk.vz * h; if (pk.z <= 0) { pk.z = 0; this.resolveFaceoff(); } }
        break;
      case 'play':
        if (this.period === 3 && !this.lastMin && !this.practice && this.clock < Math.min(60, this.periodLen * 0.2)) { this.lastMin = true; this.say('Poslední minuta!', false, 1); }
        if (!this.practice) this.clock -= h;
        else if (this.practice.kind === 'pp' && this.teams[0].dir * pk.x < RINK.BLUE_X - 3 && !pk.inNet) { this.whistle('VYHOZENO', this.practiceSpot()); break; }
        this.thinkAll(h);
        this.movePlayers(h);
        this.updatePuck(h);
        this.updateBattle(h);
        this.updatePressure(h);
        this.updateMood(h);
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
        if (this.stateT > 1.4 && !this.psPending && this.hl && this.time - this.hl.t < 6.5 && !this.silent && !this.demo && !this.practice && Settings.data.replay && this.rec.length > 90) {
          // před vhazováním záznam toho nejlepšího z poslední akce (tvrdý hit, zákrok, tyčka)
          const spot = this.stopSpot, what = this.hl.what; this.hl = null;
          this.replayThen = () => { this.setupFaceoff(spot[0], spot[1]); };
          this.startReplay(); this.replay.what = what; break;
        }
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
        r.f += h * 60 * (r.pass ? 0.34 : 0.55);
        // druhý průchod: závěr akce znovu, pomaleji a z jiné kamery (za brankou / nízko od mantinelu)
        if (r.f >= r.frames.length - 1) { if (!r.pass && r.frames.length > 130) { r.pass = 1; r.f = r.frames.length - 110; } else this.endReplay(); }
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
        if (this.starShow) { if (this.stateT > 7) this.endStars(); else for (const p of this.all) p.celebT = 3 - (this.stateT % 2.8); }
        break;
    }
  }
  confirm() {
    if (this.state === 'replay') this.endReplay();
    else if (this.state === 'goal' && this.stateT > 1.2) this.afterGoal();
    else if (this.state === 'periodEnd' && this.stateT > 1.2) this.nextPeriod();
    else if (this.state === 'intro' && this.introPos && this.stateT > 0.5) this.stateT = 4.4;
    else if (this.state === 'final' && this.starShow) { if (this.stateT > 1) this.endStars(); }
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
      // obranný postoj bez puku: LT = čelem k puku, pravá páčka = čelem zvoleným směrem; hráč couvá a líp odebírá puk
      p.stance = null;
      if (pk.owner !== p && this.state === 'play') {
        if (st.rx || st.ry) p.stance = Math.atan2(st.rx * VIEW.ry - st.ry * VIEW.fy, st.rx * VIEW.rx - st.ry * VIEW.fx);
        else if (st.lt) { const o = pk.owner || pk; p.stance = Math.atan2(o.y - p.y, o.x - p.x); }
      }
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
        else if (!pk.owner && pk.passTarget === p) { p.oneTouchQ = true; p.otAt = this.time; }
        else if (pk.owner && pk.owner.team === p.team && pk.owner.ctrl < 0) this.pass(pk.owner, p, false);
        else if (pk.held && pk.held.team === p.team) this.passTo(pk.held, p.x, p.y, false, p);
        else this.switchPlayer(h);
      }
      if (d.pressed('x')) {
        const q = h.player;
        if (pk.owner === q) { q.winding = true; q.windT = 0; q.snapQ = lt; }
        else if (!pk.owner && pk.passTarget === q) { q.oneTimerQ = true; q.otAt = this.time; }
        else if (this.time - (q.relT || -9) < 0.6) {}   // těsně po střele nebo přihrávce se X nepočítá jako bodyček
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
    if (h.player) { h.player.ctrl = -1; h.player.winding = false; h.player.windT = 0; h.player.stk = null; h.player.stance = null; }
    h.player = p; p.ctrl = h.idx; p.oneTimerQ = false;
  }
}

// Další metody třídy Game jsou v souborech game-*.js: každý předá třídu s metodami, které se sem zkopírují.
function gameMixin(C) { for (const k of Object.getOwnPropertyNames(C.prototype)) if (k !== 'constructor') Game.prototype[k] = C.prototype[k]; }
