#!/usr/bin/env node
'use strict';
// ---------- Testy herní logiky: node tests/run.js [filtr] ----------
// Běží bez prohlížeče a bez npm. Každý test dostane čerstvě načtenou hru (G) se stejnou náhodou.
const { load, playGame, idleDev } = require('./lib');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const between = (v, lo, hi, what) => ok(v >= lo && v <= hi, `${what}: ${typeof v === 'number' ? v.toFixed(2) : v} není v rozmezí ${lo}–${hi}`);

test('moduly: metody ze všech souborů game-*.js jsou na třídě Game', (G) => {
  for (const m of ['update', 'handleHumans', 'lineup', 'startPull', 'foul', 'setupFaceoff', 'checkIcing', 'checkOffside', 'passTo', 'shoot', 'pokeResolve', 'movePlayers', 'goalieSaves', 'updatePuck', 'teamThink', 'aiCarrier', 'goal', 'startShootout', 'finish'])
    ok(typeof G.Game.prototype[m] === 'function', 'chybí metoda ' + m);
});

test('zápasy počítač × počítač: doběhnou a čísla dávají smysl', (G) => {
  const N = 8; let goals = 0, shots = 0, pens = 0, offFo = 0, refFar = 0, fo = 0, bad = '';
  const w = G.Game.prototype.whistle; G.Game.prototype.whistle = function (r, s) { if (r === 'OFSAJD' && this.stateT < 1.5) offFo++; return w.call(this, r, s); };
  const rf = G.Game.prototype.resolveFaceoff; G.Game.prototype.resolveFaceoff = function () { fo++; const r = this.dropRef; if (Math.hypot(r.x - this.foSpot[0], r.y - this.foSpot[1]) > 5) refFar++; return rf.call(this); };
  for (let n = 0; n < N; n++) {
    const g = playGame(G, { home: n * 3, away: n * 3 + 1 }, (g) => {
      for (const t of g.teams) { if (t.skaters.length > 6) bad = 'víc než 6 hráčů v poli'; if (g.state === 'play' && t.pulled && t.players.includes(t.goalie)) bad = 'odvolaný brankář je na ledě'; }
      const pk = g.puck; if (!isFinite(pk.x + pk.y + pk.z)) bad = 'puk má neplatnou polohu';
      for (const p of g.all) if (!isFinite(p.x + p.y)) bad = 'hráč má neplatnou polohu';
    });
    ok(g.state === 'final', 'zápas ' + n + ' nedoběhl (stav ' + g.state + ')');
    ok(g.winner, 'zápas ' + n + ' nemá vítěze (prodloužení a nájezdy mají rozhodnout)');
    goals += g.teams[0].score + g.teams[1].score; shots += g.teams[0].shots + g.teams[1].shots; pens += g.teams[0].pim + g.teams[1].pim;
  }
  ok(!bad, bad);
  between(goals / N, 2.5, 11, 'góly na zápas');
  between(shots / N, 15, 60, 'střely na zápas');
  between(pens / N, 0, 7, 'vyloučení na zápas');
  ok(offFo === 0, 'ofsajd těsně po vhazování: ' + offFo + '×');
  ok(refFar === 0, 'rozhodčí daleko od vhazování: ' + refFar + '× z ' + fo);
});

test('prodloužení 3 na 3: nejvýš 4 hráči v poli', (G) => {
  const ep = G.Game.prototype.endPeriod; G.Game.prototype.endPeriod = function () { if (this.period === 3) this.teams[1].score = this.teams[0].score; return ep.call(this); };
  let max = 0, ot = 0;
  for (let n = 0; n < 3; n++) { const g = playGame(G, { home: n, away: n + 5, periodLen: 60 }, (g) => { if (g.period === 4 && g.state === 'play') { ot++; max = Math.max(max, g.teams[0].skaters.length, g.teams[1].skaters.length); } }); ok(g.state === 'final', 'nedoběhl'); }
  ok(ot > 0, 'prodloužení se nehrálo'); ok(max <= 4, 'v prodloužení bylo ' + max + ' hráčů v poli');
});

test('nájezdy: doběhnou, úspěšnost 10–50 %', (G) => {
  let att = 0, gl = 0;
  for (let n = 0; n < 15; n++) {
    const g = new G.Game({ home: n, away: n + 3, periodLen: 60, humans: [], silent: true });
    g.state = 'play'; g.period = 3; g.teams[0].score = g.teams[1].score = 2; g.startShootout();
    for (let t = 0; g.state !== 'final' && t < 300; t += 1 / 60) g.update(1 / 60);
    ok(g.state === 'final' && g.soWinner, 'nájezdy ' + n + ' neskončily');
    for (const a of g.shootout.att) { att += a.length; gl += a.filter(Boolean).length; }
  }
  between(gl / att, 0.1, 0.5, 'úspěšnost nájezdů');
});

test('odvolání brankáře: šest hráčů v poli a brankář mimo led', (G) => {
  const g = new G.Game({ home: 0, away: 1, humans: [{ dev: idleDev(), team: 0, assist: 0 }], silent: true, periodLen: 120 });
  const T = g.teams[0]; let six = false;
  for (let t = 0; t < 40; t += 1 / 60) { g.update(1 / 60); if (g.state === 'replay') g.endReplay(); if (t > 4) T.wantPull = true; if (T.pulled && T.skaters.length === 6 && !T.players.includes(T.goalie)) six = true; }
  ok(six, 'tým nehrál v šesti bez brankáře');
  T.wantPull = false; for (let t = 0; t < 12; t += 1 / 60) { g.update(1 / 60); if (g.state === 'replay') g.endReplay(); }
  ok(!T.pulled && T.players.includes(T.goalie), 'brankář se nevrátil');
});

test('trestné střílení: faul zezadu v úniku', (G) => {
  const g = new G.Game({ home: 0, away: 1, humans: [], silent: true });
  while (g.state !== 'play') g.update(1 / 60);
  const T = g.teams[0], v = T.skaters[0], o = g.teams[1].skaters[0];
  g.puck.owner = v; v.x = T.dir * 60; v.y = 0; for (const q of g.teams[1].skaters) q.x = T.dir * 10;
  g.foul(o, v, 'back');
  ok(g.psPending, 'trestné střílení nebylo nařízeno');
  let was = false; for (let t = 0; t < 30; t += 1 / 60) { g.update(1 / 60); if (g.state === 'shootout') was = true; if (g.state === 'replay') g.endReplay(); }
  ok(was, 'nájezd neproběhl'); ok(!g.shootout && g.state !== 'shootout', 'hra se po trestném střílení nevrátila');
});

test('trénink: všechny druhy běží bez chyby', (G) => {
  for (const kind of ['shoot', 'pp', 'so', 'sog']) {
    const g = new G.Game({ home: 2, away: 5, humans: [{ dev: idleDev(), team: 0, assist: 0 }], silent: true, practice: kind, penalties: false, offside: false, icing: false });
    for (let t = 0; t < 60; t += 1 / 60) { g.update(1 / 60); if (g.state === 'replay') g.endReplay(); }
    ok(g.state !== 'final', kind + ': trénink skončil sám');
  }
});

test('icing: odložený čeká na dotyk, okamžitý píská hned', (G) => {
  for (const mode of ['touch', 'instant']) {
    const g = new G.Game({ home: 0, away: 1, humans: [], silent: true, icingMode: mode });
    while (g.state !== 'play') g.update(1 / 60);
    const T = g.teams[0], s = T.dir, p = T.skaters[0], pk = g.puck;
    for (const q of g.all) if (!q.isGoalie) { q.x = -s * 40; q.y = 30; }
    Object.assign(pk, { owner: null, held: null, x: s * 87, y: 20, z: 0, vx: s * 60, vy: 0, vz: 0, lastTouch: p, touchTeam: T, touchX: -s * 30, shot: null, passTarget: null });
    g.icePrev = pk.x; g.thinkAll = () => {};
    for (let i = 0; i < 20 && g.state === 'play' && !g.icing; i++) g.update(1 / 60);
    if (mode === 'touch') ok(g.icing && g.state === 'play', 'odložený icing nezačal čekat na dotyk');
    else ok(g.state === 'stop', 'okamžitý icing nepřerušil hru');
  }
});

test('vhazování v útočném pásmu není ofsajd', (G) => {
  const g = new G.Game({ home: 0, away: 1, humans: [], silent: true });
  while (g.state !== 'play') g.update(1 / 60);
  g.puck.x = 0; g.offPrev = 0; g.setupFaceoff(69, 22);
  for (let t = 0; t < 2.5; t += 1 / 60) g.update(1 / 60);
  ok(!g.offsides, 'po vhazování se pískal ofsajd');
});

test('šťouchnutí: zasáhne puk před hráčem, ne za zády', (G) => {
  const mk = (ahead) => {
    const g = new G.Game({ home: 0, away: 1, humans: [], silent: true });
    while (g.state !== 'play') g.update(1 / 60);
    const p = g.teams[0].skaters[0], pk = g.puck; g.thinkAll = () => {}; g.pickups = () => {};
    for (const q of g.all) if (q !== p && !q.isGoalie) { q.x = 60; q.y = 30; }
    Object.assign(p, { x: 0, y: 0, dir: 0, vx: 0, vy: 0, pokeCD: 0 });
    Object.assign(pk, { owner: null, held: null, x: ahead ? 5 : -5, y: 0, z: 0, vx: 0, vy: 0 });
    g.poke(p); for (let i = 0; i < 30; i++) g.update(1 / 60);
    return Math.hypot(pk.vx, pk.vy) > 1 || Math.abs(pk.x - (ahead ? 5 : -5)) > 1;
  };
  ok(mk(true), 'puk před hráčem zůstal ležet'); ok(!mk(false), 'hůl zasáhla puk za zády');
});

test('ovladač: vlastní mapování tlačítek se opravdu použije', (G) => {
  const pad = { index: 0, id: 'Testovací ovladač', connected: true, mapping: '', axes: [0, 0, -1, 0, 0, -1, 0, 0], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })) };
  global.navigator.getGamepads = () => [pad];
  G.Input.init(); G.Input.poll(1 / 60);
  const d = G.Input.pads[0];
  pad.buttons[5].pressed = true; G.Input.poll(1 / 60);
  ok(!d.st.a && d.st.rb, 'výchozí rozložení: tlačítko 5 má být RB');
  G.Settings.data.padMaps = { [pad.id]: { a: 5, up: 'h7:-1.00' } }; G.Input.poll(1 / 60);
  ok(d.st.a, 'přemapované tlačítko 5 se nečte jako A');
  pad.axes[7] = -1; G.Input.poll(1 / 60); ok(d.st.up, 'kříž jako osa se nečte');
  ok(!d.st.lt && !d.st.rt, 'spouště v klidu na −1 se čtou jako stisknuté');
  // obecný ovladač se spouštěmi na osách 3/4 (v klidu −1): nesmí se číst jako trvale vychýlená pravá páčka
  const p2 = { index: 1, id: 'Obecný ovladač', connected: true, mapping: '', axes: [0.9, 0, 0, -1, -1, 0], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })) };
  global.navigator.getGamepads = () => [pad, p2]; G.Input.poll(1 / 60); G.Input.poll(1 / 60);
  const d2 = G.Input.pads[1]; ok(d2.st.lx > 0.5, 'levá páčka obecného ovladače se nečte');
  ok(!d2.st.rx && !d2.st.ry, 'spouště v klidu se čtou jako pravá páčka: ' + d2.st.rx + ' ' + d2.st.ry);
  p2.axes[4] = 0.2; p2.axes[2] = 0.8; G.Input.poll(1 / 60); ok(d2.st.rx > 0.5 && Math.abs(d2.st.ry) < 0.1, 'pravá páčka na osách 2/5 se nečte');
  pad.axes[3] = 0.7; G.Input.poll(1 / 60); ok(d.st.rx > 0.5, 'pravá páčka linuxového rozložení (osy 3/4) se nečte'); pad.axes[3] = 0;
  global.navigator.getGamepads = () => [pad];
  G.Settings.data.kbMaps = [{}, { a: ['KeyP'] }]; G.Input.applyKb();
  ok(G.Input.kb[1].map.a[0] === 'KeyP', 'vlastní klávesa hráče 2 se nepoužila');
});

test('curling: síla rotace a vlastnosti kamene (váha, vyvážení, tření) mění dráhu, nárazy a přesnost', (G) => {
  const C = G.CURL, [kl, tezky, lehky, presny, drsny] = G.STONES, run = (spin, st, pts) => G.curlPath(C.HOG1, 0, G.curlV0(G.curlW(C.TEE - C.HOG1, st.m), st.m), 0, spin, false, null, pts, st.grip);
  ok(run(1.5, kl).y > run(1, kl).y + 1 && run(1, kl).y > run(0.5, kl).y + 1, 'víc rotace nedává ostřejší oblouk');
  ok(Math.abs(run(1, kl).x - C.TEE) < 1.5 && Math.abs(run(1, tezky).x - C.TEE) < 1.5 && Math.abs(run(1, lehky).x - C.TEE) < 1.5, 'síla „do domu“ nesedí pro různě těžké kameny');
  // tření: drsný kámen zatočí víc a dřív, přesný (hladký) méně
  const half = (st) => { const pts = []; const r = run(1, st, pts); return pts[Math.floor(pts.length / 2)][1] / r.y; };
  ok(run(1, drsny).y > run(1, presny).y + 0.5 && half(drsny) > half(presny) + 0.04, 'tření nemění tvar dráhy');
  // váha: těžší kámen má nižší nejvyšší rychlost a při nárazu odhodí stojící kámen dál
  ok(G.curlV0(1, tezky.m) < G.curlV0(1, kl.m) - 1 && G.curlV0(1, lehky.m) > G.curlV0(1, kl.m) + 1, 'váha nemění nejvyšší rychlost');
  const hit = (m) => { const g = new G.Curling({ home: 0, away: 1, humans: [], silent: true }), A = g.teams[0], B = g.teams[1];
    g.stones = [{ team: A, x: 40, y: 0, vx: 10, vy: 0, spin: 0, m, grip: 1, moving: true, out: false }, { team: B, x: 42, y: 0, vx: 0, vy: 0, spin: 0, m: 1, grip: 1, moving: false, out: false }]; g.cur = g.stones[0];
    for (let i = 0; i < 600; i++) g.stepStones(1 / 120); return g.stones.map((s) => s.x); };
  const hh = hit(tezky.m), hl = hit(lehky.m);
  ok(hh[1] > hl[1] + 2 && hh[0] > hl[0] + 1, 'těžký kámen neodhodil stojící dál než lehký: ' + hh.map((v) => v.toFixed(1)) + ' × ' + hl.map((v) => v.toFixed(1)));
  // vyvážení: přesný kámen má menší rozptyl odhodu
  const scat = (i) => { const g = new G.Curling({ home: 0, away: 1, humans: [{ dev: idleDev(), team: 0 }, { dev: idleDev(), team: 1 }], silent: true, stone: i }); let s = 0; const T = g.teams[0];
    for (let k = 0; k < 60; k++) { g.T = T; g.aim = { y: 0, spin: 1, w: g.wDraw }; g.stones = []; g.release(); const a0 = (() => { let lo = -0.35, hi = 0.35; for (let q = 0; q < 22; q++) { const a = (lo + hi) / 2; if (G.curlPath(C.HOG1, 0, Math.cos(a) * g.v0, Math.sin(a) * g.v0, 1, false, C.TEE, null, T.stone.grip).yAt < 0) lo = a; else hi = a; } return (lo + hi) / 2; })(); s += (g.ang - a0) ** 2; }
    return Math.sqrt(s / 60); };
  const sp = scat(3), sd = scat(4); ok(sp < sd * 0.6, 'přesný kámen není přesnější: ' + sp.toFixed(4) + ' × ' + sd.toFixed(4));
  // ovládání: RB přidává rotaci jen do stropu podle tření, Y otáčí směr, počítač hraje klasickým kamenem
  const keys = new Set(), dev = { st: { lx: 0, ly: 0 }, pressed: (b) => keys.has(b) };
  const g = new G.Curling({ home: 0, away: 1, humans: [{ dev, team: 0 }], silent: true, stone: 3 }); g.update(3);
  ok(g.T === g.teams[0] && g.T.stone === presny && g.teams[1].stone === kl, 'kámen se nepřiřadil hráči (nebo ho dostal i počítač)');
  const press = (b) => { keys.add(b); g.update(1 / 60); keys.clear(); };
  for (let i = 0; i < 6; i++) press('rb'); ok(g.aim.spin === 1, 'hladký kámen dostal víc rotace, než dovolí tření: ' + g.aim.spin);
  press('lb'); ok(g.aim.spin === 0.5, 'LB neubralo rotaci'); press('lb'); ok(g.aim.spin === 0.5, 'rotace klesla pod nejnižší stupeň'); press('y'); ok(g.aim.spin === -0.5, 'Y neotočilo směr rotace');
});

test('přenos: záznam má druhý pomalejší průchod z jiné kamery, při přerušení se ukáže srovnání týmů', (G) => {
  const g = new G.Game({ home: 0, away: 1, humans: [], silent: true });
  for (let i = 0; i < 400; i++) g.update(1 / 60);
  while (g.rec.length < 200) g.update(1 / 60);
  g.startReplay(); ok(g.state === 'replay' && g.replay.pass === 0 && ['net', 'low'].includes(g.replay.cam), 'záznam nezačal');
  let passes = 0, f1 = 0, n = 0; for (; g.state === 'replay' && n < 5000; n++) { const p0 = g.replay.pass; g.update(1 / 60); if (g.replay && g.replay.pass && !p0) { passes++; f1 = g.replay.f; } }
  ok(passes === 1 && f1 > 50 && g.state !== 'replay', 'druhý průchod záznamu: ' + passes + ', stav ' + g.state);
  const h = new G.Game({ home: 0, away: 1, humans: [], silent: true }); while (h.state !== 'play') h.update(1 / 60);
  const r = Math.random; Math.random = () => 0.1; h.time = 100; h.whistle('test', [0, 0]); Math.random = r;
  ok(h.tv && ['shots', 'hits', 'fo'].includes(h.tv.k), 'srovnání týmů se neukázalo'); h.tv.t = 0; h.whistle('test', [0, 0]); ok(h.tvT === 100, 'srovnání se opakuje hned znovu');
});

test('počítač: v přesilovce hraje 1-3-1, v oslabení čtverec, obranu posouvá podle střel člověka', (G) => {
  const g = new G.Game({ home: 0, away: 1, humans: [], silent: true }); while (g.state !== 'play') g.update(1 / 60);
  const A = g.teams[0], B = g.teams[1], s = A.dir, by = (r) => A.skaters.find((p) => p.role === r);
  B.skaters.pop();   // soupeř hraje ve čtyřech
  const c = by('C'); g.puck.owner = c; c.x = s * 60; c.y = 0; g.puck.x = c.x; g.puck.y = 0;
  const sp = (p) => { p.ai.spotT = 0; const q = g.spotFor(p); return [s * q[0], s * q[1]]; };
  const ld = sp(by('LD')), rw = sp(by('RW')), lw = sp(by('LW')), rd = sp(by('RD'));
  ok(ld[0] < 45 && Math.abs(ld[1]) < 9, 'obránce v přesilovce není uprostřed na modré: ' + ld.map((v) => v.toFixed(0)));
  ok(rw[0] > 74 && Math.abs(rw[1]) < 9, 'nikdo necloní před brankou: ' + rw.map((v) => v.toFixed(0)));
  ok(lw[1] > 14 && rd[1] < -14, 'hráči nejsou na hrazení: ' + lw[1].toFixed(0) + ' ' + rd[1].toFixed(0));
  const box = B.skaters.map((p) => { const q = g.spotFor(p); return [B.dir * q[0], B.dir * q[1]]; });
  ok(box.every((q) => q[0] < -52 && Math.abs(q[1]) < 22), 'oslabení nebrání ve čtverci před brankou: ' + JSON.stringify(box.map((q) => q.map(Math.round))));
  // učení: člověk střílí pořád z jedné strany
  const h = new G.Game({ home: 0, away: 1, humans: [{ dev: idleDev(), team: 0, assist: 0 }], silent: true });
  ok(h.shotSide(h.teams[0]) === 0, 'bez střel není co se učit');
  for (let i = 0; i < 6; i++) h.shotLog.push({ team: h.teams[0], u: 60, v: 15, res: 'save' });
  ok(h.shotSide(h.teams[0]) * h.teams[0].dir > 3 && h.shotSide(h.teams[1]) === 0, 'počítač se nenaučil stranu střel (nebo se „učí“ i proti počítači)');
});

test('dresy: tým se střihem podle předlohy hraje doma v druhé barvě, soupeř zůstává rozlišitelný', (G) => {
  const fla = G.TEAMS.findIndex((t) => t.abbr === 'FLA'), g = new G.Game({ home: fla, away: 0, humans: [], silent: true }), [h, a] = g.teams;
  ok(h.jersey === h.def.c2 && h.stripe === h.def.c1, 'Florida nehraje doma v námořnické modré');
  ok(a.jersey !== h.jersey && h.numCol && h.trim && h.helmet, 'barvy dresů nejsou úplné nebo se shodují');
  const g2 = new G.Game({ home: 0, away: fla, humans: [], silent: true }); ok(g2.teams[0].jersey === g2.teams[0].def.c1, 'tým bez výměny barev změnil dres');
});

test('brankář: druh zákroku odpovídá střele (rozklek, beton, lapačka, vyrážečka) a sleduje puk', (G) => {
  const g = new G.Game({ home: 0, away: 1, humans: [], silent: true }); while (g.state !== 'play') g.update(1 / 60);
  const gk = g.teams[0].goalie, pk = g.puck, lx = -Math.sin(gk.dir), ly = Math.cos(gk.dir);
  const sv = (side, z) => { pk.owner = null; pk.held = null; pk.x = gk.x + lx * side; pk.y = gk.y + ly * side; pk.z = z; pk.vx = 0; pk.vy = 0; pk.shot = null; g.save(gk, 30, false); return gk.saveKind; };
  ok(sv(0.3, 0.2) === 1, 'nízká střela doprostřed není rozklek'); ok(sv(2.2, 0.2) === 4 && gk.saveL > 1.5, 'nízká střela stranou není vykopnutý beton');
  ok(sv(1.5, 2.5) === 2 && Math.abs(gk.saveZ - 2.5) < 0.01, 'vysoká střela vlevo není lapačka'); ok(sv(-1.5, 2.5) === 3 && gk.saveL < 0, 'vysoká střela vpravo není vyrážečka');
  pk.x = gk.x + lx * 30 - Math.cos(gk.dir) * -20; pk.y = gk.y + ly * 30; g.state = 'play'; g.goalieMove(gk, 1 / 60);
  ok(gk.trk > 0.3 && gk.near > 0 && gk.near <= 1, 'brankář nesleduje puk: ' + gk.trk + ' ' + gk.near);
});

test('nástup a hvězdy zápasu: hráči dojedou na svá místa, po zápase tři hvězdy a pak tabulka', (G) => {
  const sf = G.Game.prototype.sfx, sy = G.Game.prototype.say; G.Game.prototype.sfx = () => {}; G.Game.prototype.say = () => {};
  try {
    const g = new G.Game({ home: 0, away: 1, humans: [], periodLen: 20 }); const sk = g.all.filter((p) => !p.isGoalie), tgt = sk.map((p) => [p.x, p.y]);
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    ok(g.state === 'intro' && g.lineupShow && sk.some((p, i) => Math.hypot(p.x - tgt[i][0], p.y - tgt[i][1]) > 10), 'hráči při nástupu nevyjíždějí');
    for (let i = 0; i < 60 * 6 && g.state === 'intro'; i++) g.update(1 / 60);
    ok(g.state === 'faceoff' && !g.lineupShow && sk.every((p, i) => Math.hypot(p.x - tgt[i][0], p.y - tgt[i][1]) < 0.01), 'po nástupu nejsou hráči na buly');
    const h = new G.Game({ home: 0, away: 1, humans: [], periodLen: 20 }); for (let i = 0; i < 45; i++) h.update(1 / 60); h.confirm(); for (let i = 0; i < 60 && h.state === 'intro'; i++) h.update(1 / 60); ok(h.state === 'faceoff', 'nástup nejde přeskočit');
    g.teams[0].score = 2; const n = g.all.length; g.finish();
    ok(g.state === 'final' && g.starShow && g.all.length === 3 && g.all.every((p) => p.celebT > 0), 'tři hvězdy nevyjely');
    g.confirm(); ok(g.starShow, 'hvězdy jdou odkliknout hned'); for (let i = 0; i < 70; i++) g.update(1 / 60); g.confirm();
    ok(!g.starShow && g.all.length === n && !g.over, 'po hvězdách není závěrečná tabulka'); for (let i = 0; i < 100; i++) g.update(1 / 60); g.confirm(); ok(g.over, 'zápas nejde ukončit');
  } finally { G.Game.prototype.sfx = sf; G.Game.prototype.say = sy; }
});

test('souboj u mantinelu: přetlačování trvá, silnější a mačkající hráč vyhrává častěji, vždy skončí', (G) => {
  const run = (pa) => { const g = new G.Game({ home: 0, away: 1, humans: [], silent: true }); while (g.state !== 'play') g.update(1 / 60); g.thinkAll = () => {};
    const a = g.teams[0].skaters[0], b = g.teams[1].skaters[0], pk = g.puck; for (const q of g.all) if (q !== a && q !== b && !q.isGoalie) { q.x = 0; q.y = 0; }
    a.x = 60; a.y = 40; b.x = 61; b.y = 40.5; pk.owner = null; pk.x = 60.5; pk.y = 41; pk.vx = pk.vy = 0; a.chk = b.chk = 1; a.mass = b.mass = 1;
    g.battle = { a, b, t: 0, pa, pb: 0 }; let n = 0, lean = false; for (; g.battle && n < 400; n++) { g.updateBattle(1 / 60); if (a.battleT > 0 && b.battleT > 0) lean = true; }
    return { n, lean, win: g.puck.owner === a }; };
  let wa = 0, wp = 0, tmin = 999, tmax = 0; for (let i = 0; i < 60; i++) { const r = run(0), q = run(4); ok(r.lean, 'hráči se v souboji neopírají'); ok(r.n < 400 && q.n < 400, 'souboj neskončil'); tmin = Math.min(tmin, r.n); tmax = Math.max(tmax, r.n); if (r.win) wa++; if (q.win) wp++; }
  ok(tmin >= 30 && tmax <= 100, 'délka souboje mimo rozsah: ' + tmin + '–' + tmax + ' snímků');
  between(wa, 18, 42, 'vyrovnaný souboj není vyrovnaný'); ok(wp > wa + 6, 'mačkání tlačítka nepomáhá: ' + wp + ' × ' + wa);
});

test('spolukomentátor: po gólu a na konci třetiny vybere postřeh, který existuje v nahrávkách', (G) => {
  const fs = require('fs'), man = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'sounds', 'voice-en2', 'manifest.json'), 'utf8'));
  ok(Object.keys(man).length >= 20 && Object.values(man).every((f) => fs.existsSync(require('path').join(__dirname, '..', 'sounds', 'voice-en2', f))), 'chybí nahrávky druhého hlasu');
  const g = new G.Game({ home: 0, away: 1, humans: [], silent: true }); while (g.state !== 'play') g.update(1 / 60);
  const seen = new Set(); for (let i = 0; i < 6; i++) { g.state = 'play'; g.puck.lastTouch = g.teams[i % 2].skaters[0]; g.goal(i % 2 ? -1 : 1); seen.add(g.lastColor); g.state = 'play'; }
  g.teams[0].shots = 12; g.teams[1].shots = 2; g.period = 1; g.endPeriod(); seen.add(g.lastColor);
  ok(seen.size >= 3 && [...seen].every((t) => man[t]), 'postřeh bez nahrávky: ' + [...seen].filter((t) => !man[t]).join(' | '));
});

test('útok: počítač nenahazuje bez důvodu, spoluhráči člověka najíždějí dopředu a sprintují', (G) => {
  // nahození v zápasech počítač × počítač je vzácné
  let dumps = 0; const d0 = G.Game.prototype.dump; G.Game.prototype.dump = function (p) { dumps++; return d0.call(this, p); };
  try { for (let n = 0; n < 3; n++) { const g = new G.Game({ home: n * 3, away: n * 3 + 1, humans: [], silent: true, periodLen: 120 }); for (let t = 0; g.state !== 'final' && t < 3000; t += 1 / 60) { g.update(1 / 60); if (g.state === 'periodEnd') g.nextPeriod(); if (g.state === 'replay') g.endReplay(); } } } finally { G.Game.prototype.dump = d0; }
  ok(dumps / 3 < 14, 'počítač nahazuje moc často: ' + (dumps / 3).toFixed(1) + ' za zápas');
  // člověk veze puk středním pásmem: křídla jsou před ním a jedou naplno
  const g = new G.Game({ home: 0, away: 1, humans: [{ dev: idleDev(), team: 0, assist: 0 }], silent: true, offside: false }); while (g.state !== 'play') g.update(1 / 60);
  const A = g.teams[0], s = A.dir, me = g.humans[0].player, lw = A.skaters.find((p) => p.role === 'LW' && p !== me) || A.skaters.find((p) => p.role === 'RW');
  for (const q of g.teams[1].skaters) { q.x = -s * 60; q.y = 0; } me.x = 0; me.y = 0; g.puck.owner = me; g.puck.x = 0; g.puck.y = 0; lw.x = -s * 10; lw.y = 15; lw.stamina = 1; lw.ai.spotT = 0;
  const sp = g.spotFor(lw); ok(s * sp[0] > 28, 'křídlo nenajíždí před hráče s pukem: ' + (s * sp[0]).toFixed(0));
  g.aiSkater(lw, 1 / 60); ok(lw.turbo && Math.hypot(lw.inX, lw.inY) > 0.9, 'křídlo se do útoku neloudá: turbo ' + lw.turbo);
});

test('vyloučený hráč nezmizí: z místa faulu odjede na trestnou lavici', (G) => {
  const sf = G.Game.prototype.sfx, sy = G.Game.prototype.say, sc = G.Game.prototype.color; G.Game.prototype.sfx = () => {}; G.Game.prototype.say = () => {}; G.Game.prototype.color = () => {};
  try {
    const g = new G.Game({ home: 0, away: 1, humans: [], periodLen: 300 }); for (let i = 0; i < 60 * 8 && g.state !== 'play'; i++) g.update(1 / 60);
    const p = g.teams[1].skaters[0]; p.x = 30; p.y = 0; g.assess({ team: p.team, player: p, type: 'hook' });
    const pn = g.penalties[0]; ok(Math.hypot(p.x - 30, p.y) < 0.1 && g.boxPlayers().includes(p), 'vyloučený hráč se přenesl na lavici naráz');
    g.update(1 / 60); for (let i = 0; i < 80; i++) g.update(1 / 60); const mid = Math.hypot(p.x - pn.bx, p.y - pn.by);
    ok(mid > 2 && mid < Math.hypot(30 - pn.bx, pn.by) - 2 && p.spdN > 1, 'hráč na lavici neodjíždí');
    for (let i = 0; i < 120; i++) g.update(1 / 60); ok(Math.hypot(p.x - pn.bx, p.y - pn.by) < 0.01, 'hráč na trestnou lavici nedojel');
  } finally { G.Game.prototype.sfx = sf; G.Game.prototype.say = sy; G.Game.prototype.color = sc; }
});

test('arkádový režim: rozdíly mezi hráči jsou zhruba trojnásobné, běžný režim se nemění', (G) => {
  const mk = (arcade) => new G.Game({ home: 0, away: 1, humans: [], silent: true, arcade }), a = mk(false), b = mk(true);
  const sp = (g, k) => { const v = g.teams[0].roster.filter((p) => !p.isGoalie).map((p) => p[k]); return Math.max(...v) - Math.min(...v); };
  for (const k of ['spd', 'pow', 'acc']) between(sp(b, k) / sp(a, k), 2.7, 3.3, 'rozpětí ' + k);
  between(sp(b, 'chk') / sp(a, 'chk'), 2, 3.3, 'rozpětí chk');   // sílu v soubojích dál upravují povahy hráčů
  ok(a.teams[0].roster.every((p) => p.spd > 0.9 && p.spd < 1.09), 'běžný režim má jiné rozpětí rychlosti');
  ok(b.teams[0].roster.concat(b.teams[1].roster).every((p) => p.spd > 0.7 && p.spd < 1.25 && p.gk == null || (p.gk > 0.92 && p.gk <= 1.036)), 'arkádové hodnoty mimo rozumné meze');
  const g = b; for (let t = 0; g.state !== 'final' && t < 3000; t += 1 / 60) { g.update(1 / 60); if (g.state === 'periodEnd') g.nextPeriod(); if (g.state === 'replay') g.endReplay(); }
  ok(g.state === 'final' && g.all.every((p) => isFinite(p.x + p.y)), 'arkádový zápas nedoběhl');
});

test('couvání: držené LT nebo LB dá obranný postoj, pravá páčka ne; ťuknutí LB střídá', (G) => {
  ok(G.Input.padMap({ id: 'x', mapping: 'standard' }).bk === 4, 'couvání není ve výchozím mapování na LB');
  const st = { lx: 0, ly: 0, rx: 0, ry: 0 }, dev = { st, pressed: () => false };
  const g = new G.Game({ home: 0, away: 1, humans: [{ dev, team: 0, assist: 0 }], silent: true, autoChange: false }); while (g.state !== 'play') g.update(1 / 60);
  const p = g.humans[0].player; g.puck.owner = g.teams[1].skaters[0]; let n = 0; g.requestChange = () => { n++; };
  st.rx = 1; g.handleHumans(1 / 60); ok(p.stance == null, 'pravá páčka pořád zapíná obranný postoj'); st.rx = 0;
  st.lt = true; g.handleHumans(1 / 60); ok(p.stance != null, 'LT nedává obranný postoj'); st.lt = false;
  st.bk = st.lb = true; for (let i = 0; i < 40; i++) g.handleHumans(1 / 60); ok(p.stance != null, 'držené LB nedává couvání'); st.bk = st.lb = false; g.handleHumans(1 / 60);
  ok(n === 0 && p.stance == null, 'držení LB vystřídalo formaci'); st.lb = true; for (let i = 0; i < 5; i++) g.handleHumans(1 / 60); st.lb = false; g.handleHumans(1 / 60); ok(n === 1, 'ťuknutí LB nestřídá');
});

test('tempo akcí: zpomalí zatáčení, švih a reakce, nejvyšší rychlost bruslení nechá; fotbalu se netýká', (G) => {
  const fast = new G.Game({ home: 0, away: 1, humans: [], silent: true, tempo: 0 }), f = { grip: G.PH.GRIP, maxv: G.PH.MAXV, sw: fast.swT };
  const calm = new G.Game({ home: 0, away: 1, humans: [], silent: true, tempo: 2 });
  ok(G.PH.GRIP < f.grip * 0.75 && calm.swT > f.sw * 1.3 && calm.ak < 0.7, 'klidné tempo nezpomalilo zatáčení a švih');
  ok(G.PH.MAXV === f.maxv, 'tempo změnilo nejvyšší rychlost bruslení');
  const def = new G.Game({ home: 0, away: 1, humans: [], silent: true }); ok(def.ak === 0.8, 'výchozí tempo není střední');
  const fb = new G.Football({ home: 0, away: 1, humans: [], silent: true, tempo: 2 }); ok(fb.ak === 1, 'tempo ovlivnilo fotbal');
});

test('kariéra: dvě sezóny s draftem a smlouvami', (G) => {
  const C = G.Career; C.newCareer(4); const c = C.c;
  for (let s = 0; s < 2; s++) {
    C.simToEnd(); ok(c.phase === 'offseason', 'sezóna neskončila');
    C.draftSetup(); C.draftFinish(c.draft.pool[0]);
    for (const p of c.teams[c.user].players) if (p.yrs <= 1) C.extend(p, 2);
    C.nextSeason();
    const t = c.teams[c.user];
    for (const r of G.ROLES) ok(t.players.filter((p) => p.role === r).length >= 3, 'na postu ' + r + ' chybí hráči');
    ok(t.players.filter((p) => p.role === 'G').length >= 2, 'chybí brankáři');
    ok(t.players.some((p) => p.id === t.cap), 'tým nemá kapitána');
    ok(isFinite(C.payroll(c.user)), 'výplaty nejsou číslo');
  }
  const R = C.rosterFor(c.user);
  ok(R.lines.length === 3 && R.lines.every((l) => l.length === 5) && R.goalies.length === 2, 'sestava pro zápas není 3×5 + 2');
  const g = new G.Game({ home: c.user, away: (c.user + 1) % 32, humans: [], silent: true, periodLen: 30, rosters: [R, C.rosterFor((c.user + 1) % 32)] });
  for (let t = 0; t < 20; t += 1 / 60) g.update(1 / 60);
});

test('uložená kariéra ze starší verze se doplní (smlouvy, potenciál, kapitán)', (G) => {
  const C = G.Career; C.newCareer(7);
  for (const t of C.c.teams) { delete t.cap; for (const p of t.players) { delete p.sal; delete p.yrs; delete p.pot; } }
  C.save(); C.c = null; ok(C.load(), 'kariéra se nenačetla');
  const t = C.c.teams[7];
  ok(t.cap != null && t.players.every((p) => p.sal > 0 && p.yrs >= 1 && p.pot > 0), 'chybějící údaje se nedoplnily');
});

// hráč řízený „člověkem“ s nastavitelným ovladačem
function humanGame(G, cfg = {}) {
  const dev = { st: { lx: 0, ly: 0, rx: 0, ry: 0 }, down: new Set(), pressed(b) { return this.down.has(b); } };
  const g = new G.Game({ home: 0, away: 1, humans: [{ dev, team: 0, assist: 0 }], silent: true, ...cfg });
  while (g.state !== 'play') g.update(1 / 60);
  return { g, dev, h: g.humans[0] };
}

test('po střele se X nepočítá jako bodyček (žádný faul z mačkání)', (G) => {
  const { g, dev, h } = humanGame(G), p = h.player;
  g.puck.owner = p; g.shoot(p, 0, false, null, false);
  dev.down.add('x'); g.handleHumans(1 / 60); dev.down.clear();
  ok(!(p.checkT > 0), 'hned po střele začal bodyček');
  for (let i = 0; i < 50; i++) g.update(1 / 60);
  p.checkCD = 0; dev.down.add('x'); g.handleHumans(1 / 60);
  ok(p.checkT > 0 || g.puck.owner === h.player, 'bodyček nefunguje ani později');
});

test('zlomená hůl: hráč je chvíli bez hole a nesebere puk', (G) => {
  const { g, h } = humanGame(G), p = h.player, pk = g.puck;
  pk.owner = p; g.breakStick(p, 0, 100);
  ok(p.noStick > 0 && pk.owner === null, 'hůl se nezlomila');
  g.thinkAll = () => {}; for (const q of g.all) if (q !== p && !q.isGoalie) { q.x = -60; q.y = 30; }
  Object.assign(p, { x: 0, y: 0, vx: 0, vy: 0 }); Object.assign(pk, { x: 1, y: 0, vx: 0, vy: 0, z: 0 });
  for (let i = 0; i < 60; i++) { p.pickCD = 0; g.update(1 / 60); }
  ok(pk.owner !== p, 'hráč bez hole sebral puk');
  for (let i = 0; i < 60 * 7; i++) g.update(1 / 60);
  ok(!(p.noStick > 0), 'hráč nedostal novou hůl');
});

test('střídání: hráč s pukem zůstává řízený, dokud nepřihraje', (G) => {
  const { g, h } = humanGame(G, { autoChange: false }), T = g.teams[0], p = h.player, pk = g.puck;
  pk.owner = p; g.requestChange(T, true);
  for (let i = 0; i < 60 * 12 && g.state === 'play'; i++) { pk.owner = p; for (const q of g.teams[1].skaters) { q.x = -T.dir * 70; q.y = -30; } g.update(1 / 60); }   // spoluhráči mezitím vystřídají, soupeř je daleko
  ok(h.player === p && p.onIce, 'řízení přeskočilo na jiného hráče, i když měl puk');
  pk.owner = null; pk.x = 80; pk.y = 0; pk.passTarget = null;
  for (let i = 0; i < 60 && g.state === 'play'; i++) g.update(1 / 60);
  ok(h.player !== p, 'po ztrátě puku se řízení nepřepnulo na čerstvého hráče');
});

test('obranný postoj: LT otočí hráče čelem k puku a zpomalí ho', (G) => {
  const { g, dev, h } = humanGame(G), p = h.player, pk = g.puck, o = g.teams[1].skaters[0];
  g.thinkAll = () => {}; pk.owner = o; Object.assign(o, { x: 20, y: 0, vx: 0, vy: 0 }); Object.assign(p, { x: 0, y: 0, vx: 0, vy: 0, dir: Math.PI });
  dev.st.lt = true; dev.st.lx = 0; dev.st.ly = 1;   // jede pryč od puku (couvá)
  for (let i = 0; i < 90; i++) { pk.owner = o; o.x = 20; o.y = 0; g.update(1 / 60); }
  const face = Math.atan2(o.y - p.y, o.x - p.x), d = Math.abs(((p.dir - face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  ok(p.stance != null && d < 0.5, 'hráč není čelem k puku (odchylka ' + d.toFixed(2) + ')');
  ok(Math.hypot(p.vx, p.vy) > 3, 'hráč při couvání stojí');
});

test('odebírání puku: člověk má proti počítači větší dosah hole, na Legendu ne', (G) => {
  const hit = (diff) => {
    let n = 0;
    for (let k = 0; k < 40; k++) {
      const { g, h } = humanGame(G, { diff }), p = h.player, o = g.teams[1].skaters[0], pk = g.puck;
      g.thinkAll = () => {}; for (const q of g.all) if (q !== p && q !== o && !q.isGoalie) { q.x = -70; q.y = 30; }
      const far = 2.4, px = 5.7 * p.reach + far;   // puk 2,4 stopy za čepelí: mimo základní dosah (2,0), v dosahu s pomocí
      Object.assign(p, { x: 0, y: 0, dir: 0, vx: 0, vy: 0, pokeCD: 0 }); Object.assign(o, { x: px + 2, y: 3.2, dir: Math.PI / 2, vx: 0, vy: 0, dekeT: 0 });
      pk.owner = o; pk.x = px; pk.y = 0; pk.z = 0;
      g.poke(p); p.pokeHit = true; g.pokeResolve(p);
      if (pk.owner !== o) n++;
    }
    return n;
  };
  ok(hit(2) >= 12, 'na Normální člověk puk na okraji dosahu nezíská'); ok(hit(4) === 0, 'na Legendu má dosah zůstat základní');
});

test('sprint je zásoba: vyčerpá se, zamkne a zase dobije', (G) => {
  const { g, dev, h } = humanGame(G), p = h.player; g.thinkAll = () => {};
  for (const q of g.all) if (q !== p && !q.isGoalie) { q.x = -70; q.y = 30; }
  dev.st.rt = true; let ang = 0;
  for (let i = 0; i < 60 * 4; i++) { ang += 0.02; dev.st.lx = Math.cos(ang); dev.st.ly = Math.sin(ang); g.update(1 / 60); }
  ok(p.boostLock && p.boost < 0.4 && !p.sprint, 'sprint se po 4 s nevyčerpal');
  dev.st.rt = false; for (let i = 0; i < 60 * 6; i++) g.update(1 / 60);
  ok(p.boost > 0.95 && !p.boostLock, 'sprint se nedobil');
});

test('načasování: stisk těsně před puknem dá přesnou střelu z první', (G) => {
  const { g, h } = humanGame(G), p = h.player, pk = g.puck; let perfect = null;
  const sh = g.shoot.bind(g); g.shoot = (q, pw, slap, aim, ot, opt) => { perfect = !!(opt && opt.perfect); return sh(q, pw, slap, aim, ot, opt); };
  pk.owner = null; pk.wasPass = true; p.oneTimerQ = true; p.otAt = g.time - 0.1; g.gain(p);
  ok(perfect === true, 'včasný stisk nebyl vyhodnocen jako přesný');
  pk.owner = null; p.oneTimerQ = true; p.otAt = g.time - 0.6; g.gain(p);
  ok(perfect === false, 'pozdní stisk byl vyhodnocen jako přesný');
});

test('nálada zápasu: gól dá momentum, počítač při prohře v závěru riskuje', (G) => {
  const g = new G.Game({ home: 0, away: 1, humans: [], silent: true, periodLen: 120 });
  while (g.state !== 'play') g.update(1 / 60);
  const [A, B] = g.teams;
  g.addMom(A, 0.6); ok(A.mom > 0.5 && B.mom === 0, 'momentum se nepřičetlo');
  g.period = 3; g.clock = 20; B.score = 1; g.updateMood(1 / 120);
  ok(g.tacOf(A) === 2, 'prohrávající tým v závěru nepřešel do útoku'); ok(g.tacOf(B) === 0, 'vedoucí tým v závěru nebrání');
  for (let i = 0; i < 60 * 70; i++) g.updateMood(1 / 60);
  ok(A.mom === 0, 'momentum nevyprchalo');
  ok(['heavy', 'pass', 'trap', 'gun'].includes(A.style), 'tým nemá herní styl');
});

// ---------- fotbal ----------
function fbPlay(G, cfg, each) {
  const g = new G.Football({ humans: [], silent: true, periodLen: 120, ...cfg });
  for (let t = 0; g.state !== 'final' && t < 4000; t += 1 / 60) { g.update(1 / 60); if (g.state === 'periodEnd') g.nextPeriod(); if (g.state === 'replay') g.endReplay(); if (each) each(g); }
  return g;
}

test('fotbal: zápasy počítač × počítač doběhnou, rozehrání a čísla dávají smysl', (G) => {
  const N = 6; let goals = 0, shots = 0, outs = 0, corners = 0, fouls = 0, bad = '', outT = 0;
  const kinds = {}; const rf = G.Football.prototype.resolveFaceoff; G.Football.prototype.resolveFaceoff = function () { kinds[this.cur.kind] = (kinds[this.cur.kind] || 0) + 1; return rf.call(this); };
  for (let n = 0; n < N; n++) {
    const g = fbPlay(G, { home: n * 4, away: n * 4 + 2 }, (g) => {
      const pk = g.puck; if (!isFinite(pk.x + pk.y + pk.z)) bad = 'míč má neplatnou polohu';
      for (const p of g.all) if (!isFinite(p.x + p.y)) bad = 'hráč má neplatnou polohu';
      for (const t of g.teams) if (t.skaters.length > 5) bad = 'víc než 5 hráčů v poli';
      if (g.state === 'play' && (Math.abs(pk.y) > G.FB.HW + 2 || Math.abs(pk.x) > G.RINK.GOAL_X + 4.5) && !pk.inNet) outT++;
    });
    ok(g.state === 'final' && g.winner, 'zápas ' + n + ' neskončil vítězem (stav ' + g.state + ')');
    ok(g.period !== 3, 'fotbal nemá třetí třetinu');
    goals += g.teams[0].score + g.teams[1].score; shots += g.teams[0].shots + g.teams[1].shots; outs += g.outs || 0; corners += g.corners || 0; fouls += g.fouls || 0;
  }
  ok(!bad, bad); ok(outT < 30, 'míč zůstával ve hře mimo hřiště (' + outT + ' snímků)');
  between(goals / N, 1, 8, 'góly na zápas'); between(shots / N, 5, 30, 'střely na zápas');
  ok(outs > 0 && corners > 0 && kinds.goalkick > 0 && kinds.kickoff >= N * 2, 'chybí některý druh rozehrání: ' + JSON.stringify(kinds));
  between(fouls / N, 0.5, 9, 'fauly na zápas');
});

test('fotbal: aut, roh a kop od branky podle toho, kdo se míče dotkl naposled', (G) => {
  const mk = () => { const g = new G.Football({ home: 0, away: 1, humans: [], silent: true }); while (g.state !== 'play') g.update(1 / 60); g.thinkAll = () => {}; return g; };
  let g = mk(), A = g.teams[0], B = g.teams[1], pk = g.puck;
  Object.assign(pk, { owner: null, held: null, x: 10, y: G.FB.HW - 0.5, vx: 0, vy: 30, z: 0, lastTouch: A.skaters[0] });
  for (let i = 0; i < 10 && g.state === 'play'; i++) g.update(1 / 60);
  ok(g.state === 'stop' && g.rs.kind === 'kickin' && g.rs.team === B, 'aut nepřipadl soupeři');
  g = mk(); A = g.teams[0]; B = g.teams[1]; pk = g.puck;
  const end = A.dir * (G.RINK.GOAL_X - 0.5);   // branková čára, na kterou útočí A (brání ji B)
  Object.assign(pk, { owner: null, held: null, x: end, y: 20, vx: A.dir * 30, vy: 0, z: 0, lastTouch: B.skaters[0] });
  for (let i = 0; i < 10 && g.state === 'play'; i++) g.update(1 / 60);
  ok(g.state === 'stop' && g.rs.kind === 'corner' && g.rs.team === A, 'po teči obránce nebyl roh');
  g = mk(); A = g.teams[0]; B = g.teams[1]; pk = g.puck;
  Object.assign(pk, { owner: null, held: null, x: A.dir * (G.RINK.GOAL_X - 0.5), y: 20, vx: A.dir * 30, vy: 0, z: 0, lastTouch: A.skaters[0] });
  for (let i = 0; i < 10 && g.state === 'play'; i++) g.update(1 / 60);
  ok(g.state === 'stop' && g.rs.kind === 'goalkick' && g.rs.team === B, 'po střele vedle nebyl kop od branky');
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  ok(g.state === 'play', 'hra po kopu od branky nepokračuje');
});

test('fotbal: faul ve vápně je penalta, mimo vápno volný kop, červená karta oslabí tým', (G) => {
  const mk = () => { const g = new G.Football({ home: 0, away: 1, humans: [], silent: true }); while (g.state !== 'play') g.update(1 / 60); return g; };
  let g = mk(), A = g.teams[0], B = g.teams[1], v = A.skaters[0], o = B.skaters[0];
  v.x = A.dir * (G.RINK.GOAL_X - 10); v.y = 0; g.puck.owner = v; g.foul(o, v, 'trip');
  ok(g.psPending, 'faul ve vápně nebyl penalta');
  let was = false; for (let i = 0; i < 60 * 12; i++) { g.update(1 / 60); if (g.state === 'shootout') was = true; if (g.state === 'replay') g.endReplay(); }
  ok(was && g.state !== 'shootout' && !g.shootout, 'penalta neproběhla nebo hra nepokračuje');
  g = mk(); A = g.teams[0]; B = g.teams[1]; v = A.skaters[0]; o = B.skaters[0];
  v.x = 0; v.y = 10; g.puck.owner = v; g.foul(o, v, 'trip');
  ok(g.state === 'stop' && g.rs.kind === 'freekick' && g.rs.team === A, 'faul mimo vápno nebyl volný kop');
  g = mk(); A = g.teams[0]; B = g.teams[1]; v = A.skaters[0]; o = B.skaters[1]; o.yc = 1;
  for (let k = 0; k < 40 && !g.reds; k++) { if (g.state !== 'play') { for (let i = 0; i < 300 && g.state !== 'play'; i++) g.update(1 / 60); } v = A.skaters[0]; v.x = 0; v.y = 0; v.downT = 0; if (!o.inBox) g.foul(o, v, 'back'); }
  ok(g.reds === 1 && o.inBox, 'druhá žlutá neznamenala vyloučení');
  for (let i = 0; i < 60 * 6; i++) { g.update(1 / 60); if (g.state === 'replay') g.endReplay(); }
  ok(B.skaters.length === 4, 'tým po červené kartě nehraje ve čtyřech (hraje v ' + B.skaters.length + ')');
});

test('fotbal: za deště kaluž zbrzdí míč, krtinec ho vychýlí; za jasna není nic', (G) => {
  const mk = (weather) => { const g = new G.Football({ home: 0, away: 1, humans: [], silent: true, weather }); while (g.state !== 'play') g.update(1 / 60); g.thinkAll = () => {}; for (const p of g.all) { p.x = -80; p.y = 30; } return g; };
  const roll = (g, n) => { const pk = g.puck; pk.owner = null; pk.x = -20; pk.y = 0; pk.z = 0; pk.vx = 40; pk.vy = 0; pk.vz = 0; for (let i = 0; i < n; i++) g.updatePuck(1 / 120); return pk; };
  const dry = mk('off'); ok(!dry.rain && !dry.puddles.length && !dry.moles.length, 'za jasna jsou na hřišti kaluže');
  const x0 = roll(dry, 180).x;
  let wet = mk('rain'); ok(wet.rain && wet.puddles.length >= 2, 'za deště nejsou kaluže');
  wet.puddles = [{ x: -8, y: 0, r: 6, R: 6, rot: 0 }]; wet.moles = [];
  const x1 = roll(wet, 180).x;
  ok(x1 < x0 - 3, 'kaluž míč nezbrzdila: ' + x0.toFixed(1) + ' → ' + x1.toFixed(1)); ok(x1 > -14, 'kaluž míč zastavila úplně');
  ok(!wet.molesOn, 'déšť sám zapnul krtince');
  const mo = mk('off'); ok(!mo.rain, 'krtince zapnuly déšť'); mo.moles = [{ x: -10, y: 0, born: 0 }]; wet = mo;
  const pk = roll(wet, 40); ok(wet.moleHits === 1 && (pk.z > 0 || pk.vz !== 0), 'krtinec míč nenadhodil');
  ok(Math.hypot(pk.vx, pk.vy) < 40 * 0.9, 'krtinec míč nezpomalil');
  // krtek: kdo ho trefí míčem, dostane žlutou a soupeř kope; schovaného krtka trefit nejde
  const mg = mk('off'), sh = mg.teams[0].skaters[0], hitMole = () => { mg.state = 'play'; mg.rs = null; mg.moles = [{ x: -10, y: 0, born: 0, peek: true, up: 1, pt: 9 }]; const b = roll(mg, 0); b.lastTouch = sh; for (let i = 0; i < 60 && mg.state === 'play'; i++) mg.updatePuck(1 / 120); };
  hitMole(); ok(sh.yc === 1 && mg.state !== 'play' && mg.rs && mg.rs.team === mg.teams[1] && mg.moleCards === 1, 'trefený krtek: žluté ' + sh.yc + ', stav ' + mg.state);
  hitMole(); ok(sh.yc === 2 && mg.penalties.some((q) => q.player === sh && q.left > 1e6), 'druhá žlutá za krtka není červená');
  const mh = mk('off'); mh.moles = [{ x: -10, y: 0, born: 0, peek: false, up: 0, pt: 99 }]; roll(mh, 0).lastTouch = mh.teams[0].skaters[0]; for (let i = 0; i < 60; i++) mh.updatePuck(1 / 120);
  ok(mh.state === 'play' && !mh.moleCards && mh.moleHits === 1, 'schovaný krtek dal kartu');
  // hráč, který přes vykukujícího krtka přeběhne, upadne a ztratí míč; přes schovaného proběhne
  const trip = (up) => { const t = mk('off'), q = t.teams[0].skaters[0]; t.moles = [{ x: 0, y: 0, born: 0, peek: up, up: up ? 1 : 0, pt: 99 }]; q.x = 0.5; q.y = 0; q.vx = 20; q.vy = 0; t.puck.owner = q; q.downT = 0; t.updatePuck(1 / 120); return [t, q]; };
  let [tg, tq] = trip(true); ok(tq.downT > 0.5 && tg.puck.owner !== tq && tg.trips === 1, 'hráč o krtka nezakopl');
  [tg, tq] = trip(false); ok(!(tq.downT > 0) && !tg.trips, 'hráč zakopl o schovaného krtka');
  // kaluže přibývají a rostou, zápas za deště doběhne
  const g = fbPlay(G, { home: 2, away: 5, weather: 'rain', moles: true });
  const g2 = fbPlay(G, { home: 2, away: 5, moles: true }); ok(!g2.puddles.length && g2.molesOn && g2.moles.length <= 3, 'krtince za jasna: kaluže ' + g2.puddles.length);
  ok(g.state === 'final' && g.puddles.length >= 3 && g.puddles.length <= 7 && g.moles.length <= 3, 'kaluže: ' + g.puddles.length + ', krtince: ' + g.moles.length);
  ok(g.puddles.every((q) => q.r <= q.R + 1e-6 && Math.abs(q.x) < G.RINK.GOAL_X && Math.abs(q.y) < G.FB.HW), 'kaluž mimo hřiště nebo přerostlá');
});

test('fotbal: o poločase jde posekat trávník, pruh za traktůrkem zůstane krátký', (G) => {
  const g = new G.Football({ home: 0, away: 1, humans: [{ dev: idleDev(), team: 0, assist: 0 }], silent: true, periodLen: 20, zamboni: 'auto' });
  ok(g.grass.every((v) => v === 255) && g.zamPct() === 0, 'trávník není na začátku neposekaný');
  for (let t = 0; g.state !== 'periodEnd' && t < 200; t += 1 / 60) { g.update(1 / 60); if (g.state === 'replay') g.endReplay(); }
  ok(g.state === 'periodEnd' && g.period === 1, 'nenastal poločas (stav ' + g.state + ')');
  g.startZamboni(); ok(g.state === 'zamboni' && g.zam, 'sekačka nevyjela');
  g.zam.ix = 1; g.zam.iy = 0; for (let i = 0; i < 60 * 8; i++) g.update(1 / 60);
  const pc = g.zamPct(); ok(pc > 1 && pc < 40, 'posekáno ' + pc.toFixed(1) + ' %');
  ok(g.grass.some((v) => v === 40) && g.grass.some((v) => v === 255) && g.grassV > 0, 'za sekačkou nezůstal posekaný pruh');
  g.endZamboni(); ok(g.period === 2 && g.state !== 'zamboni' && g.grass.some((v) => v === 40), 'po sekání nezačal druhý poločas nebo tráva dorostla');
  const wp = new G.WaterPolo({ home: 0, away: 1, humans: [], silent: true, zamboni: 'auto' }); ok(wp.cfg.zamboni === 'off', 'v bazénu se nabízí sekačka');
});

test('fotbalový pohár: osm týmů, tři kola, postup podle výsledku, po vyřazení se turnaj dohraje', (G) => {
  const C = G.Cup; C.c = null; const c = C.start(5);
  ok(c.alive.length === 8 && new Set(c.alive).size === 8 && c.alive.includes(5) && C.next() != null && C.next() !== 5, 'pavouk není z osmi různých týmů');
  let opp = C.next(); C.advance({ sf: 2, sa: 1, won: true });
  ok(C.c.rounds.length === 1 && C.c.rounds[0].length === 4 && C.c.alive.length === 4 && C.c.alive.includes(5) && !C.c.alive.includes(opp), 'po výhře jsem nepostoupil');
  ok(C.c.rounds[0].some((m) => (m.a === 5 ? m.sa === 2 && m.sb === 1 : m.b === 5 && m.sb === 2 && m.sa === 1) && m.w === 5), 'výsledek mého zápasu se nezapsal');
  ok(C.c.rounds[0].every((m) => m.sa !== m.sb && m.w === (m.sa > m.sb ? m.a : m.b)), 'simulovaný zápas nemá vítěze podle skóre');
  C.advance({ sf: 0, sa: 1, won: false });
  ok(C.c.champ != null && C.c.champ !== 5 && C.c.rounds.length === 3 && C.next() == null, 'po vyřazení se pohár nedohrál');
  C.start(5); for (let i = 0; i < 3; i++) C.advance({ sf: 1, sa: 0, won: true }); ok(C.c.champ === 5, 'tři výhry nestačí na pohár');
  C.c = null; ok(C.load() && C.load().champ === 5, 'pohár se neuložil');
});

// ---------- vodní pólo ----------
test('vodní pólo: čtyři čtvrtiny, útočný čas, vyloučení na 20 s', (G) => {
  const N = 4; let goals = 0, bad = '', scMin = 99; const qs = new Set();
  for (let n = 0; n < N; n++) {
    const g = new G.WaterPolo({ humans: [], silent: true, periodLen: 120, home: n * 5, away: n * 5 + 3 });
    for (let t = 0; g.state !== 'final' && t < 5000; t += 1 / 60) {
      g.update(1 / 60); if (g.state === 'periodEnd') g.nextPeriod(); if (g.state === 'replay') g.endReplay();
      qs.add(g.q); scMin = Math.min(scMin, g.sc);
      if (!isFinite(g.puck.x + g.puck.y + g.puck.z)) bad = 'míč má neplatnou polohu';
      if (g.sc > 30.01 || g.sc < -0.1) bad = 'útočný čas mimo rozsah: ' + g.sc;
    }
    ok(g.state === 'final' && g.winner, 'zápas ' + n + ' neskončil vítězem (stav ' + g.state + ')');
    goals += g.teams[0].score + g.teams[1].score;
  }
  ok(!bad, bad); ok([1, 2, 3, 4].every((q) => qs.has(q)), 'neodehrály se čtyři čtvrtiny: ' + [...qs]);
  between(goals / N, 1, 12, 'góly na zápas'); ok(scMin < 25, 'útočný čas neběží');
  ok(G.RINK.NET_W === 5 && G.RINK.NET_H === 3, 'branka nemá rozměr pro pólo');
  // útočný čas: po vypršení dostane míč soupeř
  const g = new G.WaterPolo({ humans: [], silent: true, home: 0, away: 1 }); while (g.state !== 'play') g.update(1 / 60);
  const A = g.teams[0], B = g.teams[1], p = A.skaters[0]; g.thinkAll = () => {}; g.puck.owner = p; p.x = 0; p.y = 0; g.scTeam = A; g.sc = 0.05;
  for (let i = 0; i < 30 && g.state === 'play'; i++) g.update(1 / 60);
  ok(g.state !== 'play' && g.rs && g.rs.team === B, 'po vypršení útočného času nehraje soupeř');
  // faul zezadu mimo pětku = vyloučení na 20 s
  const h = new G.WaterPolo({ humans: [], silent: true, home: 0, away: 1 }); while (h.state !== 'play') h.update(1 / 60);
  const off = h.teams[1].skaters[0], v = h.teams[0].skaters[0]; v.x = 0; v.y = 0; h.foul(off, v, 'back');
  const pn = h.penalties.find((q) => q.player === off);
  ok(pn && Math.abs(pn.left - 20) < 0.5, 'vyloučení netrvá 20 s: ' + (pn && pn.left));
});

// ---------- curling ----------
test('curling: zápas doběhne, bodování endu, síla „do domu“ dojede do kruhů', (G) => {
  const C = G.CURL;
  const g = new G.Curling({ home: 0, away: 1, humans: [], silent: true, ends: 2 }); let bad = '', maxSt = 0, t = 0;
  for (; g.state !== 'final' && t < 3000; t += 1 / 60) {
    g.update(1 / 60); if (g.state === 'endScore' && g.stateT > 0.5) g.confirm();
    maxSt = Math.max(maxSt, g.stones.length);
    for (const s of g.stones) if (!isFinite(s.x + s.y)) bad = 'kámen má neplatnou polohu';
  }
  ok(g.state === 'final' && g.winner, 'zápas neskončil vítězem (stav ' + g.state + ', čas ' + Math.round(t) + ')'); ok(!bad, bad);
  ok(maxSt === 16, 'v endu nebylo 16 kamenů: ' + maxSt);
  for (const T of g.teams) ok(T.byEnd.length >= 2 && T.byEnd.reduce((a, b) => a + b, 0) === T.score, 'skóre nesedí se součtem endů');
  ok(g.teams[0].score !== g.teams[1].score, 'curling skončil remízou');
  // bodování: dva kameny blíž než nejlepší soupeřův = 2 body, kámen mimo kruhy se nepočítá
  const c = new G.Curling({ home: 0, away: 1, humans: [], silent: true, ends: 1 }), A = c.teams[0], B = c.teams[1];
  const st = (team, d) => ({ team, x: C.TEE + d, y: 0, vx: 0, vy: 0, moving: false, out: false });
  c.stones = [st(A, 0.5), st(A, -2), st(B, 3), st(A, 4), st(B, C.HOUSE + 2)];
  let r = c.countEnd(); ok(r.team === A && r.pts === 2, 'bodování endu: ' + (r.team && r.team.def.abbr) + ' ' + r.pts);
  c.stones = [st(B, C.HOUSE + 2)]; r = c.countEnd(); ok(!r.team && r.pts === 0, 'kámen mimo kruhy boduje');
  // odhod se silou „do domu“ bez zametání skončí v kruzích
  const d = new G.Curling({ home: 0, away: 1, humans: [], silent: true, ends: 1 }); d.stones = [];
  d.aim = { y: 0, spin: 1, w: d.wDraw }; d.teams.forEach((T) => { T.cpu = false; }); d.release(); d.state = 'slide'; d.stateT = 0;
  const s = d.cur; s.x = C.HOG1; s.vx = d.v0 * Math.cos(d.ang); s.vy = d.v0 * Math.sin(d.ang); s.moving = true;
  for (let i = 0; i < 4000 && s.moving; i++) d.stepStones(1 / 60);
  ok(!s.out && d.inHouse(s), 'kámen se silou do domu skončil mimo kruhy: x ' + s.x.toFixed(1) + ' y ' + s.y.toFixed(1));
});

// ---------- spuštění ----------
const filter = process.argv[2];
let fail = 0; const t0 = Date.now();
for (const t of tests) {
  if (filter && !t.name.includes(filter)) continue;
  const s = Date.now();
  try { t.fn(load()); console.log('  OK    ' + t.name + '  (' + ((Date.now() - s) / 1000).toFixed(1) + ' s)'); }
  catch (e) { fail++; console.log('  CHYBA ' + t.name + '\n        ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n        ')); }
}
console.log((fail ? fail + ' testů selhalo' : 'Všechny testy prošly') + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
process.exit(fail ? 1 : 0);
