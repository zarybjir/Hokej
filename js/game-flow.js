'use strict';
// ---------- Hra: přerušení, góly, třetiny, rolba, trestné střílení, nájezdy, stav ledu ----------
// Metody třídy Game (viz game.js); soubor se načítá až po game.js.
gameMixin(class {
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
    this.addMom(team, 0.6); if (!en) opp.goalie.conf = Math.max(-1, (opp.goalie.conf || 0) - 0.5);
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
    // komentář k průběhu: hattrick, druhý gól, dva góly po sobě, vyrovnání, vedení
    const lastG = this.goals[this.goals.length - 1], ng = scorer ? scorer.stats.g : 0;
    const ctxNote = ng === 3 ? 'Hattrick!' : ng === 2 ? 'Jeho druhý gól!' : lastG && lastG.team === team && lastG.period === this.period && lastG.clock - this.clock < 45 ? 'Dva góly krátce po sobě!'
      : team.score === opp.score ? 'Vyrovnáno!' : team.score === opp.score + 1 ? 'Jdou do vedení!' : null;
    this.goals.push({ team, scorer, assists, period: this.period, clock: this.clock, pp: ppNote === 'Gól v přesilovce', en });
    this.state = 'goal'; this.stateT = 0; this.goalLight = sN; this.goalLightT = 4;
    if (!this.silent && !this.demo) { this.slowT = 0.5; this.punch = 1; }
    this.showBanner('GÓÓÓL!', team.def.city + ' ' + team.def.name, 3.4, team.jersey);
    const who = scorer ? '#' + scorer.num + ' ' + scorer.name.toUpperCase() : 'VLASTNÍ GÓL';
    const ast = (assists.length ? 'Asistence: ' + assists.map((a) => a.name).join(', ') : 'Bez asistence') + (ppNote ? '  •  ' + ppNote : '');
    this.lower = { title: who, sub: ast, team, t: 0, dur: 3.6 };
    this.sfx('horn'); this.sfx('cheer', 1);
    this.say([pick(['Gól!', 'A je to tam!', 'Gól! Puk je v síti!', 'Gól! Neuvěřitelné!', 'Góóól!']), ppNote === 'Gól v přesilovce' ? 'Gól v přesilovce!' : en ? 'Do prázdné branky!' : null, scorer ? 'Skóroval' : null, scorer ? scorer.name : null, ctxNote], true);
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
    if (this.replayThen) { const f = this.replayThen; this.replayThen = null; this.rec = []; return f(); }   // záznam při přerušení: pak vhazování
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
        windT: p.winding || p.swingT > 0 ? p.windT : 0, shotFT: p.shotFT || 0, shotSlap: p.shotSlap, passFT: p.passFT || 0, celebT: p.celebT || 0, foTake: p.foTake, foReady: p.foReady, foSwipe: p.foSwipe || 0, pokeA: p.pokeA, stagT: p.stagT, stamina: p.stamina, noStick: p.noStick > 0, stk: p.ctrl >= 0 ? p.stk : null, pokeDir: p.pokeDir, pokeLift: p.pokeLift, actDir: p.actDir, shotBh: p.shotBh, checkT: p.checkT, hip: p.hip, blockT: p.blockT, saveT: p.saveT, saveKind: p.saveKind, isGoalie: p.isGoalie, team: p.team,
        pkOff: p.carry ? p.pkOff : null, num: p.num, hand: p.hand, carry: p.carry, ctrl: -1, role: p.role, reach: p.reach })),
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
});
