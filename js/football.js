'use strict';
// ---------- Malá kopaná 5+1 ----------
// Nadstavba nad hokejovým jádrem (class Game): stejní hráči, AI a střídání, ale míč, běh,
// auty, rohy, kopy od branky, volné kopy, penalty a karty. Hraje se v hale uvnitř mantinelů,
// hřiště vymezují lajny: branková čára je na úrovni hokejové (RINK.GOAL_X), postranní FB.HW.
const FB = { HW: 35, BOXD: 22, BOXW: 24, SPOT: 26, DIST: 15 };
const FB_KO = { C: [-1.5, 0], LW: [-10, 20], RW: [-10, -20], LD: [-42, 12], RD: [-42, -12] };   // výkop: vlastní polovina

class Football extends Game {
  constructor(cfg) {
    super({ ...cfg, sport: cfg.sport === 'polo' ? 'polo' : 'football', offside: false, icing: false, zamboni: 'off', sticks: false, three: false, practice: null, ot: cfg.ot === 'off' ? 'off' : '5v5' });
    for (const t of this.teams) for (const p of t.roster) p.reach *= 0.6;   // míč u nohy, dosah nohy místo hole
    this.iceWear = 0;
    this.setupFaceoff(0, 0); this.state = 'intro';
  }
  // ---------- texty ----------
  showBanner(text, sub, dur, color) { super.showBanner(String(text).replace('TŘETINA', 'POLOČAS').replace('TRESTNÉ STŘÍLENÍ', 'PENALTA').replace('NÁJEZDY', 'PENALTY'), sub, dur, color); }
  say(text, prio, chance) {
    const M = { 'Začíná první třetina.': 'Začíná první poločas.', 'Začíná druhá třetina.': 'Začíná druhý poločas.', 'Konec první třetiny.': 'Konec prvního poločasu.', 'Konec druhé třetiny.': 'Konec druhého poločasu.',
      'Dělovka od modré!': 'Střela!', 'Lapačka!': 'Chytil to!', 'Trestné střílení!': 'Penalta!', 'O vítězi rozhodnou samostatné nájezdy!': 'O vítězi rozhodnou penalty!', 'Nájezd.': null, 'Gól v přesilovce!': null };
    const f = (t) => (t in M ? M[t] : t);
    super.say(Array.isArray(text) ? text.map(f) : f(text), prio, chance);
  }
  boxPlayers() { return []; }   // vyloučený (červená karta) je v šatně, ne na trestné lavici
  // ---------- rozehrání: výkop, aut, roh, kop od branky, volný kop ----------
  // Před přerušením se nastaví this.rs = { kind, team, spot }; bez něj je to výkop.
  whistle(reason, spot) {
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
    this.sfx('whistle');
    if (this.pending) this.pending = null;
    const [a, b] = this.teams;
    if (this.period === 1) { this.state = 'periodEnd'; this.stateT = 0; this.say('Konec prvního poločasu.', true); return; }
    if (a.score !== b.score) return this.finish();
    if (this.period === 2 && this.otMode !== 'off') { this.period = 3; this.state = 'periodEnd'; this.stateT = 0; return; }   // další je prodloužení (číslo 4 jako v hokeji)
    return this.cfg.shootout !== false && !this.demo ? this.startShootout() : this.finish();
  }
}
