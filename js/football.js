'use strict';
// ---------- Malá kopaná 5+1 ----------
// Nadstavba nad hokejovým jádrem (class Game): stejní hráči, AI a střídání, ale míč, běh,
// auty, rohy, kopy od branky, volné kopy, penalty a karty. Hraje se v hale uvnitř mantinelů,
// hřiště vymezují lajny: branková čára je na úrovni hokejové (RINK.GOAL_X), postranní FB.HW.
const FB = { HW: 35, BOXD: 22, BOXW: 24, SPOT: 26, DIST: 15 };
const FB_KO = { C: [-1.5, 0], LW: [-10, 20], RW: [-10, -20], LD: [-42, 12], RD: [-42, -12] };   // výkop: vlastní polovina

class Football extends Game {
  constructor(cfg) {
    super({ ...cfg, sport: cfg.sport === 'polo' ? 'polo' : 'football', offside: false, icing: false, zamboni: cfg.sport === 'polo' || !cfg.zamboni ? 'off' : cfg.zamboni, sticks: false, three: false, practice: null, ot: cfg.ot === 'off' ? 'off' : '5v5' });
    for (const t of this.teams) for (const p of t.roster) p.reach *= 0.6;   // míč u nohy, dosah nohy místo hole
    this.iceWear = 0;
    this.grass = new Uint8Array(100 * 43).fill(255); this.grassV = 0;   // výška trávy po buňkách 2×2 stopy (255 = neposekaná)
    // počasí a hřiště (jen fotbal): za deště se dělají kaluže; krtince jsou na dešti nezávislé
    const fbw = this.sport === 'football', wr = cfg.weather === 'random';
    this.rain = fbw && (cfg.weather === 'rain' || (wr && Math.random() < 0.4));
    this.molesOn = fbw && (cfg.moles === true || (wr && Math.random() < 0.5));
    this.puddles = []; this.moles = []; this.wetT = 0;
    if (this.rain) { this.addPuddle(); this.addPuddle(); }
    this.setupFaceoff(0, 0); this.state = 'intro';
  }
  // ---------- sekání trávníku o poločase: traktůrek jezdí jako rolba, za sebou nechává posekaný pruh ----------
  updateZamboni(h) {
    super.updateZamboni(h);
    const z = this.zam, fx = Math.cos(z.dir), fy = Math.sin(z.dir), cx = z.x - fx * 3.5, cy = z.y - fy * 3.5;
    for (let k = -4; k <= 4; k += 0.8) for (const b of [-0.8, 0, 0.8]) { const i = this.iceIdx(cx - fy * k + fx * b, cy + fx * k + fy * b); if (this.grass[i] !== 40) { this.grass[i] = 40; this.grassV++; } }
  }
  // kolik procent hřiště je posekáno
  zamPct() {
    let n = 0, all = 0;
    for (let j = 0; j < 43; j++) for (let i = 0; i < 100; i++) { if (Math.abs(i * 2 - 99) > RINK.GOAL_X || Math.abs(j * 2 - 41.5) > FB.HW) continue; all++; if (this.grass[j * 100 + i] === 40) n++; }
    return 100 * n / all;
  }
  endZamboni() { if (this.state === 'zamboni') { this.zam = null; this.nextPeriod(); } }
  // ---------- počasí: kaluže a krtince ----------
  // volné místo na hřišti dál od ostatních kaluží a krtinců
  freeSpot(gap) {
    for (let i = 0; i < 30; i++) {
      const x = rand(-1, 1) * (RINK.GOAL_X - 7), y = rand(-1, 1) * (FB.HW - 5);
      if (this.puddles.concat(this.moles).every((q) => Math.hypot(q.x - x, q.y - y) > gap + (q.R || 2))) return [x, y];
    }
    return null;
  }
  addPuddle() { const s = this.freeSpot(7); if (s) this.puddles.push({ x: s[0], y: s[1], r: 1, R: rand(3.5, 6.5), rot: rand(0, TAU) }); }
  updateWeather(h) {
    if (!this.rain) return;
    for (const q of this.puddles) q.r = Math.min(q.R, q.r + h * 0.1);
    this.wetT += h;
    if (this.wetT > 24 && this.puddles.length < 7) { this.wetT = 0; this.addPuddle(); }
  }
  moleHit(m, off) {
    m.peek = false; m.up = 0; m.pt = rand(10, 18); this.moleCards = (this.moleCards || 0) + 1;
    off.yc = (off.yc || 0) + 1; const red = off.yc >= 2;
    this.stopBall();
    if (red && this.penOn && this.outRoles(off.team).length < 2) { this.assess({ team: off.team, player: off, type: 'rough' }); this.penalties[this.penalties.length - 1].left = 1e9; this.reds = (this.reds || 0) + 1; }
    this.rs = { kind: 'freekick', team: this.other(off.team), spot: [clamp(m.x + (m.x > 0 ? -2.6 : 2.6), -RINK.GOAL_X + 3, RINK.GOAL_X - 3), clamp(m.y, -FB.HW + 2, FB.HW - 2)] };   // kope se kousek vedle krtince
    this.whistle('TREFIL KRTKA');
    this.lower = { title: '#' + off.num + ' ' + off.name.toUpperCase() + ' (' + off.team.def.abbr + ')', sub: 'TREFIL KRTKA — ' + (red ? 'ČERVENÁ KARTA' : 'ŽLUTÁ KARTA'), team: off.team, t: 0, dur: 3.2 };
    this.say(red ? 'Červená karta!' : 'Žlutá karta.', true);
  }
  // míč na zemi: kaluž ho brzdí, krtinec ho vychýlí a nadhodí
  groundFx(h) {
    const pk = this.puck, v = Math.hypot(pk.vx, pk.vy);
    // krtek: občas na chvíli vykoukne z krtince; kdo ho trefí míčem, dostane žlutou kartu
    for (const m of this.moles) {
      m.pt = (m.pt == null ? rand(5, 12) : m.pt) - h;
      if (m.pt <= 0) { m.peek = !m.peek; m.pt = m.peek ? 2.6 : rand(8, 16); }
      m.up = clamp((m.up || 0) + (m.peek ? 1 : -1) * h * 5, 0, 1);
      // hráč, který přes vykukujícího krtka přeběhne, o něj zakopne, upadne a ztratí míč
      if (m.up > 0.6) for (const t of this.teams) for (const q of t.skaters) {
        if (q.downT > 0 || q.inBox || Math.hypot(q.vx, q.vy) < 9 || Math.hypot(q.x - m.x, q.y - m.y) > 1.5) continue;
        q.downT = 1.1; q.lie = Math.atan2(q.vy, q.vx); if (pk.owner === q) this.loosePuck(q, q.vx * 0.6, q.vy * 0.6);
        q.vx *= 0.3; q.vy *= 0.3; this.trips = (this.trips || 0) + 1; this.sfx('stick', 0.5); this.pop('ZAKOPL O KRTKA', m.x, m.y, '#d8b27a');
      }
      if (m.up > 0.6 && !pk.owner && pk.lastTouch && v > 6 && pk.z < 1.8 && Math.hypot(pk.x - m.x, pk.y - m.y) < 1.2) return this.moleHit(m, pk.lastTouch);
    }
    if (pk.owner || pk.z > 0.4) return;
    for (const q of this.puddles) if (Math.hypot(pk.x - q.x, pk.y - q.y) < q.r) {
      const k = Math.exp(-2.2 * h); pk.vx *= k; pk.vy *= k;
      if (v > 12 && this.time - (this.splT || -9) > 0.3) { this.splT = this.time; this.splash = { x: pk.x, y: pk.y, t: this.time }; this.sfx('rim', 0.25); }
      break;
    }
    for (const m of this.moles) {
      const d = Math.hypot(pk.x - m.x, pk.y - m.y);
      if (d > 1.9) { if (pk.mole === m) pk.mole = null; continue; }
      if (d > 1.3 || pk.mole === m || v < 5) continue;
      const a = Math.atan2(pk.vy, pk.vx) + rand(-0.6, 0.6); pk.mole = m;
      pk.vx = Math.cos(a) * v * 0.75; pk.vy = Math.sin(a) * v * 0.75; pk.vz = 2 + v * 0.16; pk.z = Math.max(pk.z, 0.05);
      this.moleHits = (this.moleHits || 0) + 1; this.sfx('stick', 0.4); this.pop('KRTINEC!', m.x, m.y, '#d8b27a');
    }
  }
  // ---------- texty ----------
  showBanner(text, sub, dur, color) { super.showBanner(String(text).replace('TŘETINA', 'POLOČAS').replace('TRESTNÉ STŘÍLENÍ', 'PENALTA').replace('NÁJEZDY', 'PENALTY'), sub, dur, color); }
  say(text, prio, chance) {
    const M = { 'Začíná první třetina.': 'Začíná první poločas.', 'Začíná druhá třetina.': 'Začíná druhý poločas.', 'Konec první třetiny.': 'Konec prvního poločasu.', 'Konec druhé třetiny.': 'Konec druhého poločasu.',
      'Dělovka od modré!': 'Střela!', 'Lapačka!': 'Chytil to!', 'Trestné střílení!': 'Penalta!', 'O vítězi rozhodnou samostatné nájezdy!': 'O vítězi rozhodnou penalty!', 'Nájezd.': null, 'Rolba vyjíždí na led.': null, 'Gól v přesilovce!': null };
    const f = (t) => (t in M ? M[t] : t);
    super.say(Array.isArray(text) ? text.map(f) : f(text), prio, chance);
  }
  boxPlayers() { return []; }   // vyloučený (červená karta) je v šatně, ne na trestné lavici
  // ---------- rozehrání: výkop, aut, roh, kop od branky, volný kop ----------
  // Před přerušením se nastaví this.rs = { kind, team, spot }; bez něj je to výkop.
  whistle(reason, spot) {
    if (this.molesOn && this.moles.length < 3 && Math.random() < 0.1) { const s = this.freeSpot(5); if (s) this.moles.push({ x: s[0], y: s[1], born: this.time }); }   // krtek vyleze při přerušení
    if (!this.rs) this.rs = { kind: 'freekick', team: this.teams[spot && spot[0] > 0 ? (this.teams[0].dir < 0 ? 0 : 1) : (this.teams[0].dir < 0 ? 1 : 0)], spot: [clamp(spot ? spot[0] : 0, -80, 80), clamp(spot ? spot[1] : 0, -34, 34)] };
    super.whistle(reason, this.rs.spot);
  }
  setupFaceoff() {
    const rs = this.rs || { kind: 'kickoff', team: this.koTeam || this.teams[this.period % 2 ? 0 : 1], spot: [0, 0] };
    this.rs = null; this.koTeam = null; this.cur = rs;
    super.setupFaceoff(rs.spot[0], rs.spot[1]);   // sestavy, střídání, brankáři, rozhodčí
    const pk = this.puck, T = rs.team, [bx, by] = rs.spot;
    Object.assign(pk, { x: bx, y: by, z: 0, vz: 0, owner: null });
    let taker = null;
    if (rs.kind === 'kickoff') {
      for (const t of this.teams) for (const p of t.skaters) { const [u, v] = FB_KO[p.role] || [-20, 0], k = t === T ? 1 : 2.2; p.x = t.dir * (p.role === 'C' ? u * k * (t === T ? 1 : 4) : u); p.y = t.dir * v; }
      taker = T.skaters.find((p) => p.role === 'C') || T.skaters[0];
    } else {
      // rozestavení podle herní situace (útočící tým má míč)
      const any = T.skaters[0]; pk.owner = any;
      for (const t of this.teams) for (const p of t.skaters) { const [x, y] = this.spotFor(p); p.x = x; p.y = clamp(y, -FB.HW + 2, FB.HW - 2); }
      pk.owner = null;
      if (rs.kind !== 'goalkick') {
        taker = T.skaters.reduce((a, b) => (Math.hypot(a.x - bx, a.y - by) < Math.hypot(b.x - bx, b.y - by) ? a : b));
        if (rs.kind === 'corner') taker = T.skaters.find((p) => p.role === (by * T.dir > 0 ? 'LW' : 'RW')) || taker;
      }
    }
    if (taker) { taker.x = bx - Math.sign(bx || T.dir) * (rs.kind === 'kickoff' ? T.dir * 1.5 * Math.sign(bx || T.dir) : 0.5); taker.y = by - Math.sign(by) * 0.8; if (rs.kind === 'kickoff') { taker.x = -T.dir * 1.5; taker.y = 0; } }
    // soupeř musí odstoupit od míče
    if (rs.kind !== 'kickoff') for (const p of this.other(T).skaters) {
      const dx = p.x - bx, dy = p.y - by, d = Math.hypot(dx, dy) || 1;
      if (d < FB.DIST) { const tx = -T.dir, k = FB.DIST / d; p.x = bx + (d > 1 ? dx * k : tx * FB.DIST); p.y = clamp(by + (d > 1 ? dy * k : 0), -FB.HW + 2, FB.HW - 2); p.x = clamp(p.x, -RINK.GOAL_X + 2, RINK.GOAL_X - 2); }
    }
    for (const p of this.all) { p.vx = p.vy = 0; if (!p.isGoalie) p.dir = Math.atan2(by - p.y, bx - p.x); p.foTake = false; p.foReady = false; }
    rs.taker = taker;
    if (taker) { taker.dir = rs.kind === 'kickoff' ? (T.dir > 0 ? 0 : Math.PI) : Math.atan2(-by, T.dir * RINK.GOAL_X * 0.6 - bx); const h = T.humans[0]; if (h) this.assign(h, taker); }
  }
  // konec čekání na hvizd: míč dostane rozehrávající hráč (nebo brankář do rukou)
  resolveFaceoff() {
    const rs = this.cur, pk = this.puck;
    for (const p of this.all) { p.foTake = false; p.foReady = false; }
    this.state = 'play'; this.stateT = 0;
    if (rs.kind === 'goalkick') this.goalieCover(rs.team.goalie);
    else { Object.assign(pk, { owner: rs.taker, lastTouch: rs.taker, history: [rs.taker], z: 0 }); rs.taker.pickCD = 0; }
    this.protT = this.time + (rs.kind === 'kickoff' ? 0.8 : 2);   // soupeř nesmí hned napadat
    this.sfx('whistle');
  }
  // ---------- míč mimo hřiště ----------
  updatePuck(h) {
    super.updatePuck(h);
    const pk = this.puck;
    if (this.state !== 'play' || pk.inNet || pk.held) return;
    if (this.rain) this.updateWeather(h);
    if (this.rain || this.moles.length) this.groundFx(h);
    const sy = pk.y >= 0 ? 1 : -1, sN = pk.x >= 0 ? 1 : -1, last = pk.owner || pk.lastTouch;
    if (Math.abs(pk.y) > FB.HW + 0.4 && Math.abs(pk.x) <= RINK.GOAL_X + 0.6) {
      this.outs = (this.outs || 0) + 1;
      this.rs = { kind: 'kickin', team: last ? this.other(last.team) : this.teams[0], spot: [clamp(pk.x, -RINK.GOAL_X + 3, RINK.GOAL_X - 3), sy * (FB.HW - 0.5)] };
      this.stopBall(); this.whistle('AUT'); this.say('Aut.', false, 0.5);
    } else if (Math.abs(pk.x) > RINK.GOAL_X + 0.8) {
      const D = this.teams.find((t) => t.dir === -sN), A = this.other(D);   // D brání branku na této straně
      if (last && last.team === D) { this.corners = (this.corners || 0) + 1; this.rs = { kind: 'corner', team: A, spot: [sN * (RINK.GOAL_X - 1.2), sy * (FB.HW - 1.2)] }; A.corners = (A.corners || 0) + 1; this.stopBall(); this.whistle('ROHOVÝ KOP'); this.say('Rohový kop.', false, 0.7); }
      else { this.rs = { kind: 'goalkick', team: D, spot: [sN * (RINK.GOAL_X - 6), 0] }; this.stopBall(); this.whistle('KOP OD BRANKY'); }
    }
  }
  stopBall() { const pk = this.puck; pk.owner = null; pk.vx = pk.vy = pk.vz = 0; pk.shot = null; pk.passTarget = null; }
  // ---------- souboje: X = odebrání míče ve stoje, B = skluz ----------
  startCheck(p) { if (p.ctrl < 0 && Math.random() < 0.3) this.slide(p); else super.poke(p); }
  poke(p, lift) { if (p.ctrl >= 0 && !lift) this.slide(p); else super.poke(p); }
  dive(p) { this.slide(p); }
  slide(p) {
    if (p.downT > 0 || p.pokeCD > 0 || p.carry || this.time < this.protT) return;
    p.pokeCD = 1.3; p.slideT = 0.6; p.slideHit = false; p.downT = 0.8; p.lie = p.dir;
    const v = Math.max(Math.hypot(p.vx, p.vy) * 1.15, 17); p.vx = Math.cos(p.dir) * v; p.vy = Math.sin(p.dir) * v;
  }
  movePlayers(h) {
    super.movePlayers(h);
    const pk = this.puck;
    for (const p of this.all) {
      if (!(p.slideT > 0)) continue;
      p.slideT -= h;
      if (p.slideHit || this.state !== 'play') continue;
      const fx = p.x + Math.cos(p.dir) * 2.2, fy = p.y + Math.sin(p.dir) * 2.2, o = pk.owner;
      if (Math.hypot(pk.x - fx, pk.y - fy) < 2.4 && pk.z < 1.5 && !pk.held && (!o || o.team !== p.team)) {
        // čistý skluz do míče
        p.slideHit = true;
        if (o) { this.loosePuck(o, p.vx * 0.7 + rand(-4, 4), p.vy * 0.7 + rand(-4, 4)); o.stagT = 0.4; this.pop('SKLUZ!', p.x, p.y, '#7dff8a'); }
        else { pk.vx = p.vx * 0.8; pk.vy = p.vy * 0.8; pk.lastTouch = p; }
        this.sfx('stick', 0.7);
      } else for (const q of this.other(p.team).skaters) {
        if (q.downT > 0 || Math.hypot(q.x - fx, q.y - fy) > 1.9) continue;
        // trefil hráče místo míče: faul, zezadu tvrdší
        p.slideHit = true;
        const behind = Math.cos(q.dir) * (q.x - p.x) + Math.sin(q.dir) * (q.y - p.y) > 1.2;
        q.downT = 0.9; q.lie = Math.atan2(q.y - p.y, q.x - p.x); if (pk.owner === q) this.loosePuck(q, q.vx * 0.4, q.vy * 0.4);
        this.foul(p, q, behind ? 'back' : 'trip'); break;
      }
    }
  }
  // ---------- počítač: drží se v hřišti, místo nahození kolmá přihrávka, občas nedovolený zákrok ----------
  spotFor(p) { const [x, y] = super.spotFor(p); return [clamp(x, -RINK.GOAL_X + 4, RINK.GOAL_X - 4), clamp(y, -FB.HW + 5, FB.HW - 5)]; }
  aiSkater(p, h) {
    super.aiSkater(p, h);
    if (Math.abs(p.y) > FB.HW - 3.5 && p.y * p.inY > 0) p.inY = -Math.sign(p.y) * 0.7;          // od postranní čáry
    if (Math.abs(p.x) > RINK.GOAL_X - 2.5 && p.x * p.inX > 0) p.inX = -Math.sign(p.x) * 0.7;      // od brankové čáry
  }
  dump(p) { const s = p.team.dir; this.passTo(p, s * clamp(s * p.x + 34, -70, 74), p.y * 0.4 + rand(-8, 8), true, null); }
  pokeResolve(p) {
    if (this.time < this.protT) return;
    const o = this.puck.owner;
    super.pokeResolve(p);
    // zákrok zezadu do nohou
    if (o && o.team !== p.team && this.state === 'play' && Math.hypot(o.x - p.x, o.y - p.y) < 3.4 && Math.cos(o.dir) * (o.x - p.x) + Math.sin(o.dir) * (o.y - p.y) > 1.2 && Math.random() < 0.16) this.foul(p, o, 'trip');
  }
  // brankář část střel vyrazí na roh
  save(g, sp, onNet) {
    super.save(g, sp, onNet);
    const pk = this.puck;
    if (!pk.held && pk.reboundT > 0 && Math.random() < 0.35) { const sN = -g.team.dir, sd = pk.y >= g.y ? 1 : -1; pk.y = sd * Math.max(Math.abs(pk.y), RINK.NET_W - 1); pk.vx = sN * rand(7, 12); pk.vy = sd * rand(24, 32); pk.vz = rand(2, 6); pk.ignore.set(g, this.time + 1); }   // vedle tyče, ne do branky
  }
  // ---------- fauly, karty, penalty ----------
  foul(off, victim, type) {
    if (this.state !== 'play' || off.isGoalie || off.inBox) return;
    if (Math.random() < (type === 'back' ? 0.08 : 0.03)) this.hurt(victim, 'foul');
    if (!this.penOn) return;
    if (off.ctrl < 0 && off.team.humans.length && Math.random() < 0.6) return;   // spoluhráči počítače faulují opatrně
    const T = victim.team, s = T.dir, hard = type === 'back';
    this.fouls = (this.fouls || 0) + 1; off.team.pim++;
    let card = '';
    if (Math.random() < (hard ? 0.6 : 0.15)) { off.yc = (off.yc || 0) + 1; card = off.yc >= 2 || (hard && Math.random() < 0.2) ? 'ČERVENÁ KARTA' : 'ŽLUTÁ KARTA'; }
    const inBox = s * victim.x > RINK.GOAL_X - FB.BOXD && s * victim.x < RINK.GOAL_X && Math.abs(victim.y) < FB.BOXW;
    this.stopBall();
    if (card === 'ČERVENÁ KARTA' && this.outRoles(off.team).length < 2) { this.assess({ team: off.team, player: off, type: 'rough' }); this.penalties[this.penalties.length - 1].left = 1e9; this.reds = (this.reds || 0) + 1; }
    if (inBox) { this.pens = (this.pens || 0) + 1; this.startPenaltyShot(T, victim, off, 'trip'); }
    else { this.rs = { kind: 'freekick', team: T, spot: [clamp(victim.x, -RINK.GOAL_X + 3, RINK.GOAL_X - 3), clamp(victim.y, -FB.HW + 2, FB.HW - 2)] }; this.whistle('VOLNÝ KOP'); }
    this.lower = { title: '#' + off.num + ' ' + off.name.toUpperCase() + ' (' + off.team.def.abbr + ')', sub: 'FAUL' + (card ? ' — ' + card : '') + (inBox ? ' — PENALTA' : ''), team: off.team, t: 0, dur: 3.2 };
    if (card) this.say(card === 'ČERVENÁ KARTA' ? 'Červená karta!' : 'Žlutá karta.', true); else if (!inBox) this.say('Faul.', false, 0.7);
  }
  // penalta (i rozstřel): střelec stojí s míčem na značce, brankář na čáře
  beginAttempt() {
    super.beginAttempt();
    const so = this.shootout, p = so.shooter, s = so.shootTeam.dir, g = so.def.goalie;
    Object.assign(p, { x: s * (RINK.GOAL_X - FB.SPOT - 2), y: 0, vx: 0, vy: 0, dir: s > 0 ? 0 : Math.PI });
    Object.assign(g, { x: s * (RINK.GOAL_X - 1.2), y: 0 }); g.ai.tx = g.x; g.ai.ty = 0;
    so.kickAt = rand(0.9, 1.5);
  }
  aiShooter(p, h) { const so = this.shootout; p.inX = p.inY = 0; if (this.puck.owner === p && so.t > so.kickAt) this.shoot(p, rand(0.3, 0.8), true, pick([-1, -0.7, 0.7, 1]), false, { z: Math.random() < 0.4 ? 'high' : null }); }
  endPenaltyShot(goal) {
    const so = this.shootout, D = so.def;
    if (goal) this.koTeam = D; else this.rs = { kind: 'goalkick', team: D, spot: [-D.dir * (RINK.GOAL_X - 6), 0] };
    super.endPenaltyShot(goal);
  }
  // ---------- poločasy ----------
  goal(sN) { super.goal(sN); this.koTeam = this.teams.find((t) => t.dir !== sN); }   // rozehrává tým, který dostal gól
  afterGoal() { if (this.period > 3) return this.finish(); super.afterGoal(); }
  endPeriod() {
    if (this.pending) this.pending = null;
    const [a, b] = this.teams;
    if (this.period === 1) { this.state = 'periodEnd'; this.stateT = 0; this.say('Konec prvního poločasu.', true); return; }
    if (a.score !== b.score) return this.finish();
    if (this.period === 2 && this.otMode !== 'off') { this.period = 3; this.state = 'periodEnd'; this.stateT = 0; return; }   // další je prodloužení (číslo 4 jako v hokeji)
    return this.cfg.shootout !== false && !this.demo ? this.startShootout() : this.finish();
  }
}

// ---------- fotbalový pohár: vyřazovací turnaj osmi týmů (čtvrtfinále, semifinále, finále) ----------
// Stav v localStorage `hokej98-cup`: { team, alive: [týmy v pořadí pavouka], rounds: [[{ a, b, sa, sb, w }]], champ }.
const Cup = {
  KEY: 'hokej98-cup', c: null, NAMES: ['ČTVRTFINÁLE', 'SEMIFINÁLE', 'FINÁLE'],
  load() { if (this.c) return this.c; try { const c = JSON.parse(localStorage.getItem(this.KEY) || 'null'); if (c && Array.isArray(c.alive) && Array.isArray(c.rounds)) this.c = c; } catch (e) {} return this.c; },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.c)); } catch (e) {} },
  start(team) {
    const rest = TEAMS.map((_, i) => i).filter((i) => i !== team).sort(() => Math.random() - 0.5).slice(0, 7);
    this.c = { team, alive: [team, ...rest].sort(() => Math.random() - 0.5), rounds: [], champ: null }; this.save(); return this.c;
  },
  // soupeř hráčova týmu v dalším kole (null = vypadl nebo je po turnaji)
  next() { const c = this.c; if (!c || c.champ != null) return null; const i = c.alive.indexOf(c.team); return i < 0 ? null : c.alive[i ^ 1]; },
  simScore(a, b) { const pa = clamp(0.5 + (teamRatings(a).OVR - teamRatings(b).OVR) * 0.03, 0.15, 0.85), wa = Math.random() < pa, w = 1 + Math.floor(Math.random() * 3), l = Math.floor(Math.random() * w); return wa ? [w, l, a] : [l, w, b]; },
  // odehraje kolo: hráčův zápas podle výsledku (sa:sb, vítěz w), ostatní se dosimulují; když hráč vypadl, dohraje se turnaj celý
  advance(res) {
    const c = this.c; if (!c || c.champ != null) return;
    do {
      const round = [], al = [];
      for (let i = 0; i < c.alive.length; i += 2) {
        const a = c.alive[i], b = c.alive[i + 1], mine = res && (a === c.team || b === c.team);
        const [sa, sb, w] = mine ? (a === c.team ? [res.sf, res.sa, res.won ? a : b] : [res.sa, res.sf, res.won ? b : a]) : this.simScore(a, b);
        round.push({ a, b, sa, sb, w }); al.push(w);
      }
      c.rounds.push(round); c.alive = al; res = null;
      if (al.length === 1) c.champ = al[0];
    } while (c.champ == null && !c.alive.includes(c.team));
    this.save();
  },
};
