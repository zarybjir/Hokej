'use strict';
// ---------- Hra: fauly a vyloučení, zranění, rozhodčí, buly, icing, ofsajd ----------
// Metody třídy Game (viz game.js); soubor se načítá až po game.js.
gameMixin(class {
  // ---------- fauly a vyloučení ----------
  foul(off, victim, type) {
    const hadPuck = this.puck.owner === victim;   // zjistit dřív, než mu případné zranění puk vezme
    if (this.state === 'play' && Math.random() < (INJ_FOUL[type] || 0.05) * (1.6 - victim.stamina * 0.6)) this.hurt(victim, 'foul');
    if (!this.penOn || this.state !== 'play' || this.pending || off.isGoalie || off.inBox) return;
    // spoluhráči řízení počítačem hrají v týmu člověka opatrně: většinu jejich faulů rozhodčí nechá být
    if (off.ctrl < 0 && off.team.humans.length && Math.random() < 0.75) return;
    const t = off.team;
    if (this.outRoles(t).length >= 2) return; // víc než 5 na 3 se nehraje
    // trestné střílení: faul zezadu na hráče v samostatném úniku (před ním už jen brankář)
    if (['back', 'hook', 'trip', 'slash'].includes(type) && !this.shootout && !this.practice && !this.ot3() && !this.cfg.three) {
      const vt = victim.team, s = vt.dir, had = hadPuck || this.time - (victim.lastPuckT || -9) < 0.6;
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
    this.color(pick(['That is a lazy penalty.', 'You cannot do that. Easy call for the referee.']), 0.5, 2.4);
    const p = pd.player, t = pd.team, box = this.boxPos(t);
    p.inBox = true; p.onIce = false; p.goBench = false; p.stats.pim = (p.stats.pim || 0) + 2;
    if (p.ctrl >= 0) { const hm = this.humans.find((q) => q.player === p); p.ctrl = -1; if (hm) { const q = t.skaters.find((x) => x !== p && x.ctrl < 0); hm.player = q || null; if (q) q.ctrl = hm.idx; } }
    const i = t.skaters.indexOf(p);
    if (i >= 0) { t.skaters.splice(i, 1); this.setPlayers(t); this.rebuildAll(); }
    if (this.puck.owner === p) this.puck.owner = null;
    const k = this.penalties.filter((pn) => pn.team === t).length;
    const fx = p.x, fy = p.y;
    Object.assign(p, { x: box.x + k * 2.6, y: box.y, vx: 0, vy: 0, dir: Math.PI / 2, spdN: 0, downT: 0, winding: false, windT: 0, pokeA: 0, carry: false });
    this.penalties.push({ team: t, player: p, role: p.role, left: this.penLen, total: this.penLen, type: pd.type, fx, fy, bx: p.x, by: p.y, wt: 0 });   // fx…wt: odjezd na trestnou lavici (jen na pohled)
    if (!this.silent) { p.x = fx; p.y = fy; }
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
    if ((KITS[h.def.abbr] || {}).swap) { h.jersey = h.def.c2; h.stripe = h.def.c1; }   // domácí dres v druhé barvě (podle předlohy)
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
  // postřeh spolukomentátora (jen hokej; hlášky jsou v tools/gen_voice.py COLOR)
  color(text, chance = 1, delay) { this.lastColor = text; if (!this.silent && !this.demo && !this.fb && Math.random() < chance) Voice.color(text, delay); }
  say(text, prio, chance) { if (!this.silent) Voice.say(text, prio, chance); }
  showBanner(text, sub, dur = 2, color) { this.banner = { text, sub, t: 0, dur, color }; }
  pop(text, x, y, color = '#fff') {
    this.pops.push({ text, x, y, t: 0, color });
    // událost u lidského hráče se ukáže i u jeho jména pod kolečkem
    for (const hm of this.humans) { const p = hm.player; if (p && Math.hypot(p.x - x, p.y - y) < 5) this.note(p, text); }
  }
  note(p, text) { if (p && p.ctrl >= 0) { p.note = text; p.noteT = this.time; } }
  thinkFor(t) { return t.cpu && this.vsHuman ? this.diff.think : 0.2; }
  aggrFor(t) {
    const base = t.cpu && this.vsHuman ? this.diff.aggr : 0.85;
    const cpuM = t.cpu ? [0.55, 1, 1.5][this.cfg.cpuAggr == null ? 1 : this.cfg.cpuAggr] : 1;
    const style = { heavy: 1.25, pass: 0.9, trap: 0.9, gun: 1 }[t.style] || 1;
    return base * cpuM * [0.8, 1, 1.2][this.tacOf(t)] * style * (t.angryT > this.time ? 1.3 : 1);   // po tvrdém hitu na svého hráče to chvíli vrací
  }
  // taktika právě hrající formace: 0 obranná, 1 vyvážená, 2 útočná
  tacOf(t) { if (t.tacOver != null) return t.tacOver; const v = t.tactics && t.tactics[t.line]; return v == null ? 1 : v; }

  // ---------- buly ----------
  setupFaceoff(fx, fy) {
    this.foSpot = [fx, fy]; this.battle = null; for (const t of this.teams) t.zoneT = 0;
    this.offPrev = fx; this.icePrev = fx;   // puk se na vhazování přenesl: to není přejetí modré ani brankové čáry
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
});
