'use strict';
// ---------- Hra: fyzika bruslení, brankáři, puk ----------
// Metody třídy Game (viz game.js); soubor se načítá až po game.js.
gameMixin(class {
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
      if (p.noStick > 0) { p.noStick -= h; if (p.noStick <= 0) this.pop('NOVÁ HŮL', p.x, p.y, '#cfd8ea'); }
      if (p.cutT > 0) p.cutT -= h; if (p.stagT > 0) p.stagT -= h;
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
      let maxV = PH.MAXV * (1 + 0.02 * p.team.mom) * p.spd * p.team.spdMod * ft * Math.pow(1 / p.mass, 0.04) * (1 - 0.04 * snow),
        acc = PH.ACC * (0.8 + 0.2 * p.spd) * (0.8 + 0.2 * ft) * mf * (1 - 0.06 * snow);
      if (p.carry) maxV *= 0.94;
      if (p.stance != null) maxV *= 0.8;   // v obranném postoji (couvání) pomaleji
      // sprint je zásoba: vydrží asi 2,5 s, dobíjí se 5 s; po vyčerpání se musí dobít na třetinu
      if (p.turbo && m > 0.3 && p.boost > 0 && !p.boostLock && p.stamina > 0.08 && !p.winding) {
        maxV *= PH.TURBO; acc *= 1.3; p.sprint = true;
        p.boost = Math.max(0, p.boost - h / 2.5); p.stamina = Math.max(0, p.stamina - h * 0.014 * p.staMul);
        if (p.boost <= 0) p.boostLock = true;
      } else { p.sprint = false; p.boost = Math.min(1, p.boost + h / 5); if (p.boost > 0.33) p.boostLock = false; }
      if (p.recoverT > 0) acc *= 0.35;
      if (p.winding || p.swingT > 0) { const f = 1 - 1.3 * h; p.vx *= f; p.vy *= f; }
      else if (m > 0.12) {
        // bruslení se setrvačností: v rychlosti se zatáčí po oblouku (boční přilnavost brusle),
        // proti směru jízdy se brzdí smykem, rozjezd z místa je přímý; vše podle obratnosti hráče
        const sp0 = Math.hypot(p.vx, p.vy), tx = ix / m, ty = iy / m, want = maxV * m, ag = p.agil * (1 - 0.1 * snow);
        p.braking = false;
        if (sp0 < 5) {
          let dvx = tx * want - p.vx, dvy = ty * want - p.vy;
          const dl = Math.hypot(dvx, dvy), lim = acc * (p.cutT > 0 ? 1.7 : 1.1) * ag * h;   // po ostrém zastavení rychlý výpad novým směrem
          if (dl > lim) { dvx *= lim / dl; dvy *= lim / dl; }
          p.vx += dvx; p.vy += dvy;
        } else {
          const ux = p.vx / sp0, uy = p.vy / sp0, cosA = ux * tx + uy * ty, cr = ux * ty - uy * tx;
          let sp = sp0, dir = Math.atan2(uy, ux);
          if (cosA < -0.3) {
            // páčka proti směru jízdy = hokejové zastavení: čím přímější protipohyb, tím ostřejší
            const hard = cosA < -0.75 && sp0 > 9;
            sp = Math.max(0, sp - PH.BRAKE * ag * (hard ? 1.5 : 1) * h); p.braking = true; if (hard) p.cutT = 0.45;
          }
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
      else if (p.stance != null && !p.carry) fd = p.stance;
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
          if (car) { const o = car === a ? b : a; if (Math.random() < clamp(0.18 * o.mass / car.mass * (rel / 15) * (1 + 0.7 * this.takeEdge(o)), 0, 0.6)) { this.loosePuck(car, car.vx * 0.4 + rand(-5, 5), car.vy * 0.4 + rand(-5, 5)); this.pop('ZTRÁTA!', car.x, car.y, '#cfd8ea'); } }
        }
        if (rel > 9) a.stagT = b.stagT = 0.4;   // zapotácení po srážce
        if (rel > 6 && this.state === 'play') { this.feel(a, rel / 40, 90); this.feel(b, rel / 40, 90); if (a.ctrl >= 0 || b.ctrl >= 0) this.shake = Math.max(this.shake, clamp(rel / 60, 0, 0.35)); }
      }
    }
  }

  // ---------- brankáři ----------
  goalieMoveAll(h) { for (const t of this.teams) if (!t.pulled) this.goalieMove(t.goalie, h); }
  goalieMove(g, h) {
    const sN = -g.team.dir, gl = RINK.GOAL_X, gx = sN * gl, pk = this.puck;
    g.saveT = Math.max(0, g.saveT - h); g.carry = false;
    // sledování puku: kam se dívá a naklání (trk −1…1 = vpravo…vlevo) a jak blízko je nebezpečí (near 0…1 = hlubší postoj)
    { const dx = pk.x - g.x, dy = pk.y - g.y, d = Math.hypot(dx, dy) || 1; g.trk = clamp((dx * -Math.sin(g.dir) + dy * Math.cos(g.dir)) / Math.max(8, d), -1, 1); g.near = clamp((60 - d) / 45, 0, 1); }
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
        if (!this.fb && (near < 13 || g.holdT > (human ? 3 : 2.2))) this.whistle('ZAKRYTÝ PUK', [sN * 69, (pk.y >= 0 ? 1 : -1) * 22]);
        else if (!human || g.holdT > (this.fb ? 2.5 : 1.6)) {   // fotbalový brankář vždy rozehraje
          let best = null, bs = -1e9;
          for (const q of g.team.skaters) { if (q.downT > 0) continue; const sc = this.openScore(q, g); if (sc > bs) { bs = sc; best = q; } }
          if (best) this.passTo(g, best.x, best.y, false, best);
        }
      }
    }
    let tx, ty;
    if (sN * pk.x > gl) { tx = sN * (gl - 1.3); ty = (pk.y >= 0 ? 1 : -1) * 2.3; }
    else {
      const dx = pk.x - gx, dy = pk.y, d = Math.hypot(dx, dy) || 1, r = clamp(1.6 + d * 0.045, 1.6, this.fb ? 6 : 4.2);
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
      if (pk.vx * sN <= 0 || pk.z > RINK.NET_H + 2) continue;
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
      const reach = (this.fb ? 5.2 : 3.2) + 0.6 * g.gk;   // fotbalová branka je širší
      if ((!onNet && lat > 1.2) || lat > reach) { pk.ignore.set(g, this.time + 0.5); continue; }
      let sv = (this.sport === 'polo' ? 0.925 : this.fb ? 0.965 : 0.974) + (g.gk - 1) * 0.6;
      if (this.vsHuman) sv += t.cpu ? this.diff.cpuGk : this.diff.myGk;
      sv += [0.025, 0, -0.02][this.tacOf(t)];   // obranná taktika = horší šance soupeře, útočná = víc protiútoků
      sv -= clamp((sp - 60) / 200, 0, 0.22);
      sv -= clamp((lat - 1.4) * (this.fb ? 0.055 : 0.11), -0.05, 0.3);
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
      sv += (g.conf || 0) * 0.012 + (t.mom - this.other(t).mom) * 0.008;   // jistota brankáře a momentum (mírně)
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
    if (onNet && sp > 70) this.impact(0.05, 0.45);
    if (onNet) { g.conf = Math.min(1, (g.conf || 0) + 0.1); this.addMom(g.team, 0.05); if (sp > 70 || pk.oneTimer) this.hl = { t: this.time, what: 'ZÁKROK' }; }
    // druh zákroku podle toho, kam puk letí vůči brankáři: nízko uprostřed rozklek, nízko stranou vykopnutý beton,
    // výš lapačka (levá ruka) nebo vyrážečka; ruka i beton jdou přesně za pukem (saveL = stranou, saveZ = výška)
    const sl = (pk.x - g.x) * -Math.sin(g.dir) + (pk.y - g.y) * Math.cos(g.dir);
    g.saveT = 0.5; g.saveL = clamp(sl, -3.2, 3.2); g.saveZ = clamp(pk.z, 0, 4.2);
    g.saveKind = pk.z < 1.0 ? (!this.fb && Math.abs(sl) > 1.3 ? 4 : 1) : this.fb ? ((pk.y - g.y) * sN > 0 ? 2 : 3) : sl > 0 ? 2 : 3;
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
      // po sebrání puk plynule doklouže na čepel (neskáče)
      if (pk.snapT > 0) { pk.snapT -= h; const k = Math.max(0, pk.snapT / 0.16); off[0] += (pk.sx - off[0]) * k; off[1] += (pk.sy - off[1]) * k; }
      pk.x = o.x + off[0]; pk.y = o.y + off[1]; pk.z = 0; pk.vx = o.vx; pk.vy = o.vy; pk.vz = 0;
      o.pkOff = [off[0], off[1]];   // kde je puk vůči hráči: hůl se kreslí přesně k němu
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
      if (pk.z <= 0) { pk.z = 0; if (pk.vz < -5) pk.vz = -pk.vz * PH.BZ; else pk.vz = 0; }
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
            this.impact(0.06, 0.5); this.hl = { t: this.time, what: 'TYČKA' }; this.feel(pk.lastTouch || pk, 0.5, 150); this.sfx('post'); this.pop('TYČKA!', pk.x, pk.y, '#ffe066'); this.say(pick(['Tyčka!', 'Zvoní tyčka!']), true, 0.8); this.sfx('ooh', 1);
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
      if (p.isGoalie || (p.downT > 0 && !(p.blockT > 0)) || p.pickCD > 0 || p.noStick > 0) continue;
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
    pk.sx = pk.x - p.x; pk.sy = pk.y - p.y; pk.snapT = Math.hypot(pk.sx, pk.sy) < 7 ? 0.16 : 0;
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
    // načasování: stisk těsně před dopadem puku na hůl = přesnější a tvrdší střela / přihrávka
    const perfect = p.ctrl >= 0 && this.time - (p.otAt || -9) < 0.22;
    if (p.oneTimerQ) { p.oneTimerQ = false; this.shoot(p, 0.85, true, p.ctrl >= 0 && Math.abs(p.inY) > 0.2 ? clamp(p.inY * 1.25, -1, 1) : null, true, { perfect }); return; }
    if (p.oneTouchQ) {
      // přihrávka z první: puk hned dál ve směru páčky (o kousek méně přesně)
      p.oneTouchQ = false; const m = this.choosePassTarget(p, p.inX, p.inY);
      if (m) { const pas = p.pas; p.pas += perfect ? 0.03 : -0.04; this.pass(p, m, false); p.pas = pas; this.pop(perfect ? 'PŘESNĚ!' : 'Z PRVNÍ', p.x, p.y, perfect ? '#7dff8a' : '#cfd8ea'); return; }
    }
    if (p.ctrl < 0 && reb && this.state === 'play') {
      const s = p.team.dir, dn = Math.hypot(s * RINK.GOAL_X - p.x, p.y);
      if (dn < 18 && Math.random() < 0.3) { this.shoot(p, 0, false, null, false); return; }   // dorážka
    }
    if (p.ctrl < 0 && wasPass) {
      const s = p.team.dir, u = s * p.x, dn = Math.hypot(s * RINK.GOAL_X - p.x, p.y);
      if (u > 55 && u < 86 && dn < 38 && Math.abs(p.y) < 24 && Math.random() < (p.trait === 'S' ? 0.6 : 0.35)) this.shoot(p, 0.75, true, null, true);   // ostrostřelec pálí z první
    }
  }
});
