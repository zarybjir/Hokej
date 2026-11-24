'use strict';
// ---------- Hra: akce hráčů – přihrávky, střely, hůl, bodyčeky ----------
// Metody třídy Game (viz game.js); soubor se načítá až po game.js.
gameMixin(class {
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
    // tvrdý příklep může zlomit hůl: puk jen odskočí a hráč je pár vteřin bez hole
    if (slap && this.state === 'play' && Math.random() < (0.008 + 0.03 * power * power) * (this.cfg.sticks === false ? 0 : 1)) return this.breakStick(p, ang, speed);
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
  breakStick(p, ang, speed) {
    const pk = this.puck, a = ang + rand(-0.5, 0.5), v = speed * rand(0.15, 0.3);
    pk.owner = null; pk.vx = Math.cos(a) * v; pk.vy = Math.sin(a) * v; pk.vz = 0; pk.z = 0; pk.shot = null; pk.passTarget = null; pk.lastTouch = p;
    p.noStick = 6; p.winding = false; p.windT = 0; p.swingT = 0; p.pickCD = 0.5; p.relT = this.time; p.shotFT = 0.5; p.shotSlap = true; p.actDir = ang;
    this.pop('ZLOMENÁ HŮL!', p.x, p.y, '#ff9a5a'); this.sfx('post'); this.sfx('stick', 1); this.sfx('ooh', 0.7); this.feel(p, 0.8, 200);
    this.say('To nevypadá dobře.', false, 0.6);
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
    if (p.pokeCD > 0 || p.downT > 0 || p.noStick > 0) return;
    p.pokeCD = lift ? 0.7 : 0.55; p.pokeA = 1; p.pokeHit = false; p.pokeLift = !!lift;
    const pk = this.puck, a = Math.atan2(pk.y - p.y, pk.x - p.x), d = Math.hypot(pk.x - p.x, pk.y - p.y);
    const cone = p.ctrl < 0 ? 1.3 : this.assistOf(p) >= 2 ? 1.6 : 1.1;   // hůl dosáhne jen před hráče
    p.pokeDir = d < 9 && Math.abs(angDiff(p.dir, a)) < cone ? a : p.dir;
  }
  // čepel je vysunutá: co hůl (úsečka hráč → čepel) opravdu zasáhla?
  pokeResolve(p) {
    const pk = this.puck, o = pk.owner, R = p.reach, b = pokeBlade(p.pokeDir, 0.5, R), bx = p.x + b[0], by = p.y + b[1];
    // zásah puku: čepelí (do 2 stop), nebo dolní polovinou hole těsně u puku
    const sdx = bx - p.x, sdy = by - p.y, along = ((pk.x - p.x) * sdx + (pk.y - p.y) * sdy) / (sdx * sdx + sdy * sdy);
    const onPuck = pk.z < 1.5 && (Math.hypot(pk.x - bx, pk.y - by) < 2.0 || (along > 0.5 && segDist(pk.x, pk.y, p.x, p.y, bx, by) < 1.1));
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
        if (p.stance != null) ch += 0.1;   // obranný postoj: jistější hůl
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
});
