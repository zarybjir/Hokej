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
  G.Settings.data.kbMaps = [{}, { a: ['KeyP'] }]; G.Input.applyKb();
  ok(G.Input.kb[1].map.a[0] === 'KeyP', 'vlastní klávesa hráče 2 se nepoužila');
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
