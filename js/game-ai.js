'use strict';
// ---------- Hra: AI – tým, hráči bez puku, hráč s pukem ----------
// Metody třídy Game (viz game.js); soubor se načítá až po game.js.
gameMixin(class {
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
  // ---------- nálada zápasu: momentum, reakce počítače na stav, jistota brankářů ----------
  addMom(t, v) {
    if (this.practice || this.shootout) return;
    const was = t.mom; t.mom = clamp(t.mom + v, 0, 1); const o = this.other(t); o.mom = Math.max(0, o.mom - v * 0.5);
    if (was < 0.7 && t.mom >= 0.7 && this.state === 'play') { if (this.humans.length) this.toast = { text: t.def.abbr + ' JSOU NA VLNĚ', t: 0, dur: 1.8 }; this.say('Jsou na vlně!', false, 0.7); }
  }
  updateMood(h) {
    for (const t of this.teams) {
      t.mom = Math.max(0, t.mom - h / 50);
      const g = t.goalie; g.conf = (g.conf || 0) * (1 - h / 40);
      // počítač reaguje na stav: ve 3. třetině při prohře riskuje, těsné vedení v závěru brání
      if (t.cpu && !this.practice) {
        const d = t.score - this.other(t).score, late = this.period === (this.fb ? 2 : 3) ? 1 - this.clock / this.periodLen : this.period > 3 ? 1 : 0;
        t.tacOver = d < 0 && late > 0.45 ? 2 : d > 0 && d <= 2 && late > 0.7 ? 0 : null;
      }
    }
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
    // přetlačování: ukazatel m (−1 = vyhrává b, +1 = a) se posouvá podle síly, únavy a mačkání tlačítka a náhodně cuká;
    // hráči se o sebe opírají (battleT pro animaci). Rozhodne se, až jeden druhého přetlačí, nejpozději po 1,6 s.
    const str = (q, pr) => q.chk * this.fat(q) + (q.mass - 1) * 0.6 + pr * 0.05 + (q.team.cpu && this.vsHuman ? (this.diff.aggr - 1) * 0.05 : 0);
    B.m = clamp((B.m || 0) + ((str(a, B.pa) - str(b, B.pb)) * 2.4 + gauss() * 2.2) * h, -1, 1);
    a.battleT = b.battleT = 0.2; a.battleDir = Math.atan2(b.y - a.y, b.x - a.x); b.battleDir = a.battleDir + Math.PI;
    if (this.time - (B.sT || 0) > 0.35) { B.sT = this.time; this.sfx('board', 0.12); }
    if (B.t > 0.5 && (Math.abs(B.m) >= 1 || B.t > 1.6)) {
      const w = B.m > 0 || (B.m === 0 && Math.random() < 0.5) ? a : b, l = w === a ? b : a;
      this.battle = null; w.pickCD = 0; l.pickCD = 0.45; l.recoverT = 0.3; l.stagT = 0.35;
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
          const hitM = (t.style === 'heavy' ? 1.5 : 1) * (p.trait === 'E' ? 1.5 : 1);
          if (fa < 0.8 && p.spdN > 9 && (!rear || Math.random() < 0.12 * ag) && Math.random() < 0.2 * ag * hitM) this.startCheck(p);
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
    } else {
      [tx, ty] = this.spotFor(p);
      // útok vedený člověkem: spoluhráči sprintují na svá místa, ať je komu přihrát
      if (pk.owner && pk.owner.team === t && pk.owner.ctrl >= 0 && p.role[1] !== 'D') { const dd = Math.hypot(tx - p.x, ty - p.y); if (dd > 6) { urg = true; turbo = dd > 12 && p.stamina > 0.3; } }
    }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 1.2) { p.inX = 0; p.inY = 0; }
    else { const m = urg ? 1 : p.ai.offer > this.time ? clamp(d / 6, 0.45, 1) : clamp(d / 10, 0.25, 1); p.inX = (dx / d) * m; p.inY = (dy / d) * m; }   // při nabízení se hýbe svižněji
    if (d < 4 && !urg) p.faceDir = Math.atan2(pk.y - p.y, pk.x - p.x);
    p.turbo = turbo;
  }
  // ze které strany lidský tým nejčastěji střílí (průměr posledních střel, kladné = vyšší y)
  shotSide(T) {
    if (!T.humans.length) return 0;
    const L = this.shotLog.filter((q) => q.team === T).slice(-8); if (L.length < 4) return 0;
    return L.reduce((a, q) => a + clamp(q.v * T.dir, -20, 20), 0) / L.length * 0.35;
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
        // člověk vede puk v pásmu: křídlo na vzdálené straně si najede k zadní tyčce, střed do slotu
        if (owner && owner.ctrl >= 0 && owner !== p && !D && !p.extra) { if (p.role === 'C') { u = 68; v = -sgn(pv || 1) * 5; } else if ((p.role === 'LW') === (pv < 0)) { u = 81; v = -sgn(pv || 1) * 7; } }
        // přesilovka: nacvičené rozestavení 1-3-1 – obránce na modré, dva na hrazení, jeden v mezeře, jeden clonící před brankou
        if (!this.fb && !p.extra && t.skaters.length > this.other(t).skaters.length && t.skaters.length >= 5) {
          const P = { LD: [37, 0], LW: [59, 25], RD: [59, -25], C: [66, pv > 0 ? -3 : 3], RW: [82, pv > 0 ? 3 : -3] }[p.role];
          u = P[0] + Math.sin(tm * 0.5 + ph) * 2; v = P[1] + Math.cos(tm * 0.4 + ph) * 2;
        }
      } else {
        const hu = owner && owner.ctrl >= 0 ? 10 : 0;   // před lidským hráčem s pukem jedou útočníci dál dopředu (až k modré), ať má přihrávku do jízdy
        const S = { C: [pu + 14 + hu * 0.6, -pv * 0.3], LW: [pu + 24 + hu, 22], RW: [pu + 24 + hu, -22], LD: [pu - 16, 15], RD: [pu - 16, -15], X: [pu + 20, pv > 0 ? -8 : 8] }[p.extra ? 'X' : p.role];
        u = S[0]; v = S[1];
        if (!D) u = Math.min(u, 70);
      }
      // po střele: útočníci jdou k brance na dorážku
      if ((p.role === 'C' || p.extra) && pu > 30 && this.time < (t.crashT || 0) && t.crashBy !== p) { u = 82; v = sgn(pv || 1) * 3; }
      // nabídnout se: z několika míst kolem postu vyber to nejvolnější s průchozí přihrávkou od nosiče
      else if (owner && owner.team === t && owner !== p) {
        const ai = p.ai;
        if (!ai.spotT || this.time > ai.spotT) {
          ai.spotT = this.time + rand(0.25, 0.45);
          const opp = this.other(t).skaters.filter((o) => o.downT <= 0);
          let bd = [0, 0], bs = -1e9;
          // útočníci hledají v širším okolí: volné místo, průchozí přihrávka, v pásmu blíž k brance a ke středu
          const R = D ? [[0, 0], [6, 0], [-6, 0], [0, 7], [0, -7]] : [0, 6, -6, 12, -12].flatMap((a) => [0, 6, -6, 12, -12].map((b) => [a, b]));
          for (const [du, dv] of R) {
            const cu = u + du, cv = v + dv, wx = s * cu, wy = s * cv;
            if (Math.abs(cv) > 38 || cu > 86 || Math.hypot(wx - owner.x, wy - owner.y) < 12) continue;
            let open = 30; for (const o of opp) open = Math.min(open, Math.hypot(o.x - wx, o.y - wy));
            let sc = Math.min(open, 18) - Math.hypot(du, dv) * 0.2;
            sc += opp.some((o) => segDist(o.x, o.y, owner.x, owner.y, wx, wy) < 3) ? -8 : 5;
            if (!D && pu > RINK.BLUE_X) sc += clamp((cu - 55) * 0.15, 0, 4) - Math.abs(cv) * 0.08;
            if (sc > bs) { bs = sc; bd = [du, dv]; }
          }
          ai.sdu = bd[0]; ai.sdv = bd[1];
        }
        u += ai.sdu || 0; v += ai.sdv || 0; p.ai.offer = this.time + 0.2;
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
      // oslabení ve vlastním pásmu: těsný čtverec před brankou, který se posouvá za pukem
      if (!this.fb && pu < -28 && t.skaters.length < this.other(t).skaters.length) { u = (D ? -77 : -62) + (pu + 60) * 0.12; v = (S[1] >= 0 ? 9 : -9) + pv * 0.3; }
      // počítač se učí, odkud na něj člověk střílí: obrana se k té straně posune
      else if (t.cpu && pu < -25) v += clamp(this.shotSide(this.other(t)), -4, 4) * s;
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
    p.turbo = td > (p.trait === 'R' ? 7 : 13) && p.stamina > 0.4 && u < (p.trait === 'R' ? 80 : 65);   // rychlík jede do brejku
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
    sp *= ({ gun: 1.25, pass: 0.8, trap: 0.9 }[t.style] || 1) * (p.trait === 'S' ? 1.35 : p.trait === 'P' ? 0.75 : 1);   // styl týmu a typ hráče
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
    const pm = (t.style === 'pass' ? 1.3 : 1) * (p.trait === 'P' ? 1.3 : p.trait === 'S' ? 0.8 : 1);
    if (best && ((pressure && bs > my - (back ? -6 : 4) && Math.random() < (back ? 0.3 : 0.55) * pm) || (bs > my + (back ? 18 : 10) && Math.random() < 0.4 * pm))) {
      if (this.laneBlocked(p, best) && Math.abs(p.x) < 65 && Math.random() < 0.35) this.bankPass(p, best); else this.pass(p, best, false);
      return;
    }
    if (pressure && p.spdN > 10 && Math.random() < 0.02 && this.dropPass(p)) return;
    const offRisk = this.cfg.offside !== false && t.skaters.some((q) => q !== p && s * q.x > RINK.BLUE_X + 0.5);
    const iceRisk = this.cfg.icing !== false && u < 1 && !(t.skaters.length < opp.skaters.length);
    // nahození jen z nouze: pod tlakem, bez volného spoluhráče a s obráncem v cestě (šance se losuje každý snímek, proto malá čísla);
    // spoluhráči lidského hráče puk drží a hledají přihrávku
    const stuck = pressure && (!best || bs < my + 2) && opp.skaters.some((o) => o.downT <= 0 && s * (o.x - p.x) > 2 && s * (o.x - p.x) < 22 && Math.abs(o.y - p.y) < 9);
    if (stuck && u > 0 && u < 28 && !offRisk && !iceRisk && Math.random() < (t.style === 'heavy' ? 0.04 : t.style === 'pass' ? 0.006 : 0.015) * (t.humans.length ? 0.3 : 1)) { this.dump(p); return; }
    if (t.change && u > 2 && u < 40 && !offRisk && !iceRisk && (pressure || !t.humans.length) && Math.random() < 0.05) { this.dump(p); return; } // nahoď a střídej
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
});
