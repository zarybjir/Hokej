'use strict';
// ---------- Hra: střídání formací, sestavy, odvolání brankáře ----------
// Metody třídy Game (viz game.js); soubor se načítá až po game.js.
gameMixin(class {
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
});
