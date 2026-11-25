'use strict';
// ---------- Curling ----------
// Samostatná hra (nedědí z Game): dvě družstva střídavě pouštějí kameny k terči (dům), 8 kamenů na end.
// Pro vykreslování a menu nabízí stejné rozhraní jako Game (teams, all, puck jako cíl kamery, state, update…).
// Dráha vede podél osy x: odraz (HACK) → čára hodu (HOG1) → vzdálená čára (HOG2) → střed domu (TEE) → zadní čára (BACK).
const CURL = { HACK: -63, HOG1: -30, HOG2: 36, TEE: 57, BACK: 63.5, HW: 7.2, R: 0.48, HOUSE: 6, MU: 2.0, CURLK: 0.36, V0: [15.2, 26.4], SWEEP: 0.82 };   // led brzdí víc než ve skutečnosti, ať hod netrvá půl minuty
// kameny na výběr: váha (hybnost při nárazu, těžší má nižší nejvyšší rychlost), vyvážení (přesnost odhodu),
// tření (kolik rotace jde kameni dát, jak silně zatáčí a jak rychle se rotace zastaví = tvar dráhy)
const STONES = [
  { name: 'KLASICKÝ', m: 1, bal: 1, grip: 1 },
  { name: 'TĚŽKÝ', m: 1.35, bal: 1.15, grip: 1.1 },
  { name: 'LEHKÝ', m: 0.72, bal: 0.9, grip: 0.9 },
  { name: 'PŘESNÝ', m: 1, bal: 0.4, grip: 0.7 },
  { name: 'DRSNÝ', m: 1.1, bal: 1.3, grip: 1.45 },
];
const stoneMaxSpin = (st) => (st.grip < 0.8 ? 2 : st.grip > 1.2 ? 4 : 3);   // nejvyšší stupeň rotace (stupeň = 0,5)
const CURL_ENDS = { 1: 2, 2: 2, 3: 3, 5: 4, 10: 6, 20: 8 };   // počet endů podle volby délky v menu

// jeden krok pohybu kamene: brzdění ledem, zatáčení podle rotace (silnější, když kámen zpomaluje), zametání
function curlStep(s, h, sweep) {
  const v = Math.hypot(s.vx, s.vy);
  if (v < 0.06) { s.vx = s.vy = 0; return false; }
  const gr = s.grip || 1; s.spin = (s.spin || 0) * Math.exp(-0.05 * gr * gr * gr * h);   // drsnější kámen zatáčí víc, ale rotace mu dřív dojde
  const ux = s.vx / v, uy = s.vy / v, aL = s.spin * gr * CURL.CURLK * (1 - clamp(v / 29, 0, 0.85)) * (sweep ? 0.5 : 1);
  s.vx += -uy * aL * h; s.vy += ux * aL * h;
  const nv = Math.max(0, v - CURL.MU * (sweep ? CURL.SWEEP : 1) * h), k = nv / v;
  s.vx *= k; s.vy *= k; s.x += s.vx * h; s.y += s.vy * h;
  return true;
}
// kam kámen dojede bez srážek (a kde projde úrovní tx)
function curlPath(x, y, vx, vy, spin, sweep, tx, pts, grip = 1) {
  const s = { x, y, vx, vy, spin, grip }; let yAt = null;
  for (let i = 0; i < 4000 && curlStep(s, 1 / 60, sweep); i++) { if (yAt == null && tx != null && s.x >= tx) yAt = s.y; if (pts && i % 12 === 0) pts.push([s.x, s.y]); }
  return { x: s.x, y: s.y, yAt: yAt == null ? s.y : yAt };
}
// úhel odhodu, aby kámen s rychlostí v0 a rotací prošel bodem (tx, ty) nebo se tam zastavil
function curlAngle(v0, spin, tx, ty, grip = 1) {
  let lo = -0.35, hi = 0.35;
  for (let i = 0; i < 22; i++) { const a = (lo + hi) / 2, r = curlPath(CURL.HOG1, 0, Math.cos(a) * v0, Math.sin(a) * v0, spin, false, tx, null, grip); if (r.yAt < ty) lo = a; else hi = a; }
  return (lo + hi) / 2;
}
const curlVmax = (m = 1) => CURL.V0[1] * Math.pow(m, -0.35);   // těžší kámen se nedá odhodit tak rychle
const curlV0 = (w, m) => CURL.V0[0] + (curlVmax(m) - CURL.V0[0]) * clamp(w, 0, 1);
const curlW = (dist, m) => clamp((Math.sqrt(2 * CURL.MU * Math.max(1, dist)) - CURL.V0[0]) / (curlVmax(m) - CURL.V0[0]), 0, 1);   // síla, aby kámen ujel dist

class Curling {
  constructor(cfg) {
    applySport('curling'); this.sport = 'curling'; this.curl = true;
    this.cfg = cfg; this.silent = !!cfg.silent; this.demo = false;
    this.diffI = cfg.diff == null ? 1 : cfg.diff; this.diff = DIFF[this.diffI];
    this.ends = cfg.ends || 4; this.end = 1; this.period = 1; this.clock = 0; this.time = 0;
    this.teams = [cfg.home, cfg.away].map((idx, side) => ({ idx, def: TEAMS[idx], side, dir: 1, score: 0, byEnd: [], humans: [], shots: 0, hits: 0, pim: 0, ppg: 0, ppOpp: 0, cpu: true }));
    Game.prototype.setColors.call(this);   // barvy dresů stejně jako v ostatních sportech
    this.humans = (cfg.humans || []).map((h, i) => ({ idx: i, dev: h.dev, team: this.teams[h.team], color: HUMAN_COLORS[i % 4], player: null }));
    for (const h of this.humans) { h.team.humans.push(h); h.team.cpu = false; }
    for (const t of this.teams) t.stone = STONES[t.cpu ? 0 : clamp(cfg.stone | 0, 0, STONES.length - 1)];   // lidé hrají zvoleným kamenem, počítač klasickým
    // čtyři hráči družstva: házející, dva metaři a skip (ukazuje koštětem cíl)
    for (const t of this.teams) { t.crew = buildRoster(t.idx).lines[0].slice(0, 4).map((info) => { const p = new Player(t, info); p.broom = true; return p; }); }
    this.all = []; this.refs = []; this.penalties = []; this.pops = []; this.injuries = []; this.stars = [];
    this.banner = null; this.lower = null; this.toast = null; this.shake = 0; this.paused = false; this.over = false; this.camSnap = true;
    this.puck = { x: CURL.TEE - 8, y: 0, z: 0, vx: 0, vy: 0, owner: null, held: null };   // jen cíl kamery
    this.hammer = 1;   // poslední kámen v 1. endu mají hosté
    this.startEnd();
    this.state = 'intro'; this.stateT = 0;
    this.msg = { text: 'CURLING', sub: this.teams[0].def.city + ' vs ' + this.teams[1].def.city + '  •  ' + this.ends + ' ENDŮ', t: 0, dur: 2.4 };
  }
  sfx(n, ...a) { if (!this.silent) Sfx[n](...a); }
  other(t) { return t === this.teams[0] ? this.teams[1] : this.teams[0]; }
  startEnd() { this.stones = []; this.n = 0; this.nextThrow(); }
  // kdo hází: tým bez výhody posledního kamene začíná, pak se střídají
  curTeam() { const first = this.teams[1 - this.hammer]; return this.n % 2 === 0 ? first : this.other(first); }
  left(t) { return 8 - this.stones.filter((s) => s.team === t).length - 0 + this.stones.filter((s) => s.team === t && s.out).length * 0; }
  nextThrow() {
    const T = this.T = this.curTeam();
    this.wDraw = curlW(CURL.TEE - CURL.HOG1, T.stone.m);
    this.aim = { y: 0, spin: 1, w: 0 }; this.meter = 0; this.meterDir = 1; this.sweep = false; this.cur = null; this.ai = null;
    this.state = 'aim'; this.stateT = 0;
    const [th, s1, s2, skip] = T.crew;
    Object.assign(th, { x: CURL.HACK + 1.5, y: 0, dir: 0, spdN: 0, lunge: 0.6, sweep: false, noBroom: true });
    Object.assign(s1, { x: CURL.HOG1 - 6, y: 2.6, dir: -Math.PI / 2, spdN: 0, sweep: false, lunge: 0 });
    Object.assign(s2, { x: CURL.HOG1 - 3, y: -2.6, dir: Math.PI / 2, spdN: 0, sweep: false, lunge: 0 });
    Object.assign(skip, { x: CURL.TEE + 2.5, y: 0, dir: Math.PI, spdN: 0, sweep: false, lunge: 0, broomAt: [CURL.TEE, 0] });
    this.all = T.crew.slice();
    this.path = null;
  }
  // ---------- stav kamenů ----------
  inPlay() { return this.stones.filter((s) => !s.out); }
  dist(s) { return Math.hypot(s.x - CURL.TEE, s.y); }
  inHouse(s) { return this.dist(s) <= CURL.HOUSE + CURL.R; }
  // skóre endu: tým s nejbližším kamenem bere bod za každý svůj kámen blíž, než je nejlepší soupeřův
  countEnd() {
    const st = this.inPlay().filter((s) => this.inHouse(s)).sort((a, b) => this.dist(a) - this.dist(b));
    if (!st.length) return { team: null, pts: 0 };
    const T = st[0].team; let pts = 0;
    for (const s of st) { if (s.team !== T) break; pts++; }
    return { team: T, pts };
  }
  // ---------- hlavní smyčka ----------
  update(dt) {
    if (this.paused) return;
    // hod soupeře jde zrychlit podržením A
    if (this.T.cpu && this.humans.some((h) => h.dev.st.a) && (this.state === 'run' || this.state === 'slide' || this.state === 'aim')) dt *= 3;
    this.time += dt; this.stateT += dt;
    if (this.msg) { this.msg.t += dt; if (this.msg.t > this.msg.dur) this.msg = null; }
    for (const p of this.pops) p.t += dt; this.pops = this.pops.filter((p) => p.t < 1.6);
    const T = this.T, hm = T.humans[0], d = hm ? hm.dev : null, [th, s1, s2, skip] = T.crew;
    switch (this.state) {
      case 'intro': if (this.stateT > 2.4) { this.state = 'aim'; this.stateT = 0; } break;
      case 'aim': {
        if (d) {
          this.aim.y = clamp(this.aim.y + (d.st.lx * VIEW.ry) * 5.5 * dt, -CURL.HW + 0.8, CURL.HW - 0.8);
          // rotace: Y otočí směr, LB/RB ubírá a přidává (stupně po 0,5; kolik jich je, záleží na tření kamene)
          const mx = stoneMaxSpin(T.stone), sg = this.aim.spin >= 0 ? 1 : -1, lv = clamp(Math.round(Math.abs(this.aim.spin) * 2), 1, mx);
          if (d.pressed('y')) { this.aim.spin = -sg * lv * 0.5; this.sfx('stick', 0.4); }
          else if (d.pressed('lb') || d.pressed('rb')) { this.aim.spin = sg * clamp(lv + (d.pressed('rb') ? 1 : -1), 1, mx) * 0.5; this.sfx('stick', 0.4); }
          if (d.pressed('a') && this.stateT > 0.3) { this.state = 'power'; this.stateT = 0; this.meter = 0; this.meterDir = 1; }
        } else {
          if (!this.ai) this.ai = this.aiShot();
          this.aim.y += (this.ai.y - this.aim.y) * Math.min(1, dt * 4); this.aim.spin = this.ai.spin;
          if (this.stateT > 1.1) { this.aim.y = this.ai.y; this.aim.w = this.ai.w; this.release(this.ai.tx); }
        }
        skip.broomAt = [CURL.TEE, this.aim.y]; skip.y = this.aim.y + 0.4;
        this.puck.x = CURL.TEE - 9; this.puck.y = this.aim.y * 0.4;
        break;
      }
      case 'power': {
        this.meter += this.meterDir * dt * 0.85; if (this.meter >= 1) { this.meter = 1; this.meterDir = -1; } else if (this.meter <= 0) { this.meter = 0; this.meterDir = 1; }
        if (d && d.pressed('a') && this.stateT > 0.15) { this.aim.w = this.meter; this.release(); }
        if (d && d.pressed('b')) { this.state = 'aim'; this.stateT = 0; }
        break;
      }
      case 'slide': {
        // odraz a skluz k čáře hodu: kámen drží házející
        const c = this.cur, v = this.v0 * clamp(this.stateT / 0.5, 0.25, 1);
        c.x += Math.cos(this.ang) * v * dt; c.y = 0;
        th.x = c.x - 2.6; th.y = 0; th.spdN = v; th.lunge = 1;
        if (c.x >= CURL.HOG1) { c.vx = Math.cos(this.ang) * this.v0; c.vy = Math.sin(this.ang) * this.v0; c.moving = true; this.state = 'run'; this.stateT = 0; this.sfx('stick', 0.5); }
        this.puck.x = c.x + 10; this.puck.y = 0;
        break;
      }
      case 'run': {
        const c = this.cur;
        // zametání: člověk drží X, počítač zametá, když kámen nedojede k cíli
        if (d) this.sweep = !!d.st.x && !c.hit && c.x < CURL.TEE + 2;
        else { this.aiT = (this.aiT || 0) - dt; if (this.aiT <= 0) { this.aiT = 0.25; const r = curlPath(c.x, c.y, c.vx, c.vy, c.spin, false, null, null, c.grip); this.sweep = !c.hit && c.moving && r.x < this.tx - 1.2; } }
        if (!c.moving) this.sweep = false;
        if (this.sweep && this.time - (this.swT || 0) > 0.16) { this.swT = this.time; this.sfx('rim', 0.35); }
        for (let i = 0; i < 2; i++) this.stepStones(dt / 2);
        th.spdN = Math.max(0, th.spdN - dt * 9); th.x += th.spdN * dt * 0.6; th.lunge = Math.max(0.3, th.lunge - dt * 0.6);
        // metaři doprovázejí kámen
        [s1, s2].forEach((p, i) => {
          const tx = c.x + (i ? 4.6 : 3), ty = c.y + (i ? -1.9 : 1.9), dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy), v = c.moving && c.x < CURL.TEE + 4 ? Math.min(dd * 12, 30) : 0;
          if (dd > 0.05) { p.x += dx / dd * v * dt; p.y += dy / dd * v * dt; }
          p.spdN = v; p.stride = (p.stride || 0) + dt * v * 0.3; p.dir = Math.atan2(c.y - p.y, c.x - 0.6 - p.x); p.sweep = this.sweep; p.broomAt = c.moving ? [c.x + (i ? 2.2 : 1.3), c.y + (i ? -0.25 : 0.25) + (this.sweep ? Math.sin(this.time * 24 + i * 2) * 0.55 : 0)] : null;
        });
        skip.broomAt = null; skip.y += ((this.aim.y >= 0 ? -9.5 : 9.5) - skip.y) * Math.min(1, dt * 2);   // skip ustoupí z dráhy
        const mv = this.stones.filter((s) => s.moving && !s.out);
        const lead = mv.length ? mv.reduce((a, b) => (b.x > a.x ? b : a)) : c;
        this.puck.x = clamp(lead.x + 8, CURL.HOG1, CURL.TEE - 4); this.puck.y = lead.y * 0.5;
        if (!mv.length) { this.settle(); }
        break;
      }
      case 'settle': if (this.stateT > 1.1) { this.n++; if (this.n >= 16) this.finishEnd(); else this.nextThrow(); } break;
      case 'endScore': if (this.stateT > 6) this.confirm(); break;
    }
  }
  // odhod: úhel se dopočítá tak, aby kámen s touto silou a rotací mířil na koště skipa
  release(tx) {
    const T = this.T, w = this.aim.w;
    const st = T.stone;
    this.v0 = curlV0(w, st.m); this.tx = tx != null ? tx : CURL.TEE;
    let ang = curlAngle(this.v0, this.aim.spin, this.tx, this.aim.y, st.grip);
    if (T.cpu) { const e = [1.5, 1.1, 0.8, 0.5, 0.3][this.diffI]; ang += gauss() * 0.0045 * e; this.v0 *= 1 + gauss() * 0.012 * e; }
    else { ang += gauss() * 0.0024 * st.bal; this.v0 *= 1 + gauss() * 0.006 * st.bal; }   // hůř vyvážený kámen se pouští méně přesně
    this.ang = ang;
    this.cur = { team: T, x: CURL.HACK + 4, y: 0, vx: 0, vy: 0, spin: this.aim.spin, m: st.m, grip: st.grip, moving: false, out: false, hit: false, no: this.stones.length };
    this.stones.push(this.cur); T.shots++;
    this.state = 'slide'; this.stateT = 0; this.sfx('stick', 0.6);
  }
  stepStones(h) {
    const S = this.stones, R = CURL.R;
    for (const s of S) { if (s.out || !s.moving) continue; if (!curlStep(s, h, this.sweep && s === this.cur)) s.moving = false; }
    // srážky: kameny si vymění hybnost ve směru spojnice; těžší kámen lehčí odhodí dál a sám se zbrzdí méně
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const a = S[i], b = S[j]; if (a.out || b.out || (!a.moving && !b.moving)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d >= 2 * R || d < 1e-4) continue;
      const nx = dx / d, ny = dy / d, rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny, pen = 2 * R - d;
      a.x -= nx * pen / 2; a.y -= ny * pen / 2; b.x += nx * pen / 2; b.y += ny * pen / 2;
      if (rel <= 0) continue;
      const ma = a.m || 1, mb = b.m || 1, imp = rel * 1.92 / (1 / ma + 1 / mb); a.vx -= imp / ma * nx; a.vy -= imp / ma * ny; b.vx += imp / mb * nx; b.vy += imp / mb * ny;
      a.moving = b.moving = true; a.hit = b.hit = true; a.spin *= 0.3; b.spin = 0;
      if (rel > 1.5) { this.sfx('post'); this.sfx('board', clamp(rel / 14, 0.2, 0.8)); this.shake = Math.max(this.shake, clamp(rel / 30, 0, 0.4)); if (a.team !== b.team) this.T.hits++; }
    }
    // kámen za zadní čárou nebo na postranní čáře je mimo hru
    for (const s of S) if (!s.out && (s.x > CURL.BACK + R || Math.abs(s.y) > CURL.HW - R)) { s.out = true; s.moving = false; }
  }
  settle() {
    const c = this.cur;
    // kámen, který nepřejel vzdálenou čáru a ničeho se nedotkl, se odstraní
    if (!c.out && !c.hit && c.x < CURL.HOG2 + CURL.R) { c.out = true; this.pops.push({ text: 'NEDOJEL', x: c.x, y: c.y, t: 0, color: '#ff9a7a' }); }
    this.state = 'settle'; this.stateT = 0; this.sweep = false;
    for (const p of this.T.crew) { p.sweep = false; p.spdN = 0; p.broomAt = null; }
  }
  finishEnd() {
    const r = this.countEnd();
    for (const t of this.teams) t.byEnd.push(t === r.team ? r.pts : 0);
    if (r.team) { r.team.score += r.pts; this.hammer = this.teams.indexOf(this.other(r.team)); }   // kdo bodoval, příště začíná
    this.lastEnd = r; this.state = 'endScore'; this.stateT = 0; this.puck.x = CURL.TEE - 6; this.puck.y = 0;
    this.sfx(r.pts ? 'cheer' : 'ooh', 0.6);
  }
  confirm() {
    if (this.state === 'intro') { this.state = 'aim'; this.stateT = 0; }
    else if (this.state === 'endScore' && this.stateT > 0.8) {
      const [a, b] = this.teams;
      if (this.end >= this.ends && a.score !== b.score) { this.winner = a.score > b.score ? a : b; this.state = 'final'; this.stateT = 0; this.sfx('horn', 2); this.all = []; return; }
      this.end++; this.period = this.end; this.startEnd(); this.camSnap = true;   // při remíze se hraje dodatečný end
    } else if (this.state === 'final' && this.stateT > 1.5) this.over = true;
  }
  // ---------- počítač: výběr hodu ----------
  aiShot() {
    const T = this.T, O = this.other(T), st = this.inPlay().filter((s) => this.inHouse(s)).sort((a, b) => this.dist(a) - this.dist(b));
    const shot = st[0], spin = Math.random() < 0.5 ? 1 : -1, left = 16 - this.n;
    // soupeř má nejbližší kámen: buď ho vyrazit, nebo dojet ještě blíž ke středu (když je kde)
    if (shot && shot.team === O) {
      const dS = this.dist(shot);
      if (dS < 1.6 || Math.random() < 0.45) return { y: shot.y, tx: shot.x, w: clamp(0.6 + rand(-0.05, 0.12), 0, 1), spin, kind: 'takeout' };
      const side = shot.y >= 0 ? -1 : 1, r = rand(0, Math.max(0.3, dS - 1.3));
      return { y: side * r * 0.8, tx: CURL.TEE - rand(0, 0.8), w: curlW(CURL.TEE - CURL.HOG1, T.stone.m), spin, kind: 'draw' };
    }
    // vedeme v domě a end se chýlí ke konci: postavit stráž před dům
    if (shot && shot.team === T && left <= 8 && Math.random() < 0.5) { const gx = CURL.TEE - rand(10, 15); return { y: shot.y * 0.6 + rand(-1, 1), tx: gx, w: curlW(gx - CURL.HOG1, T.stone.m), spin, kind: 'guard' }; }
    // jinak dojet do domu, co nejblíž středu (mimo místa, kde už kámen stojí)
    let y = rand(-2.2, 2.2), x = CURL.TEE - rand(-0.5, 2.5);
    for (let k = 0; k < 6 && this.inPlay().some((s) => Math.hypot(s.x - x, s.y - y) < 1.6); k++) { y = rand(-3.5, 3.5); x = CURL.TEE - rand(-1, 3.5); }
    return { y, tx: x, w: curlW(x - CURL.HOG1, T.stone.m), spin, kind: 'draw' };
  }
  // nápověda dráhy pro míření (při síle „do domu")
  aimPath() {
    const st = this.T.stone, v0 = curlV0(this.state === 'power' ? this.meter : this.wDraw, st.m), a = curlAngle(v0, this.aim.spin, CURL.TEE, this.aim.y, st.grip), pts = [[CURL.HOG1, 0]];
    curlPath(CURL.HOG1, 0, Math.cos(a) * v0, Math.sin(a) * v0, this.aim.spin, false, null, pts, st.grip);
    return pts;
  }
}
