// Převod nasnímaných pohybů (CMU mocap, sada codepawl/cmu-mocap-glb na stejné kostře) na models/moves.json.
// Ukládají se dráhy chodidel, rukou a výška pánve vůči tělu (v délkách nohy); klouby si hra dopočítá IK.
// Použití: node tools/bake_moves.js <složka s .glb>   (běžící server.py na portu 47098, Playwright)
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const dir = process.argv[2];
const SRC = { run: '09_01-run', jog: '16_35-run-jog', kick: '10_01-soccer-kick-ball' };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://127.0.0.1:47098/index.html?mute=1');
  await p.waitForFunction(() => window.GLTFLoader && window.THREE);
  const out = {};
  for (const [name, id] of Object.entries(SRC)) {
    const b64 = fs.readFileSync(path.join(dir, id + '.glb')).toString('base64');
    const raw = await p.evaluate(async (b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const L = new GLTFLoader(); if (window.MeshoptDecoder) L.setMeshoptDecoder(MeshoptDecoder);
      const gl = await new Promise((ok, no) => L.parse(u.buffer, '', ok, no));
      const sc = gl.scene, clip = gl.animations[0], mix = new THREE.AnimationMixer(sc); mix.clipAction(clip).play();
      const bone = {}; sc.traverse((o) => { if (o.isBone) bone[o.name] = o; });
      const names = ['pelvis', 'foot_l', 'foot_r', 'ball_l', 'ball_r', 'hand_l', 'hand_r', 'Head', 'thigh_l', 'calf_l', 'neck_01'];
      const fr = [], v = new THREE.Vector3(), n = Math.floor(clip.duration * 60);
      for (let i = 0; i <= n; i++) { mix.setTime(i / 60); sc.updateMatrixWorld(true); const f = {}; for (const k of names) { v.setFromMatrixPosition(bone[k].matrixWorld); f[k] = [v.x, v.y, v.z]; } fr.push(f); }
      return { fr, dur: clip.duration, tracks: clip.tracks.length };
    }, b64);
    out[name] = raw; console.log(name, id, raw.fr.length, 'snímků');
  }
  await b.close();
  const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]], len = (a) => Math.hypot(a[0], a[1], a[2]), r3 = (x) => Math.round(x * 1000) / 1000;
  const res = {};
  for (const [name, { fr }] of Object.entries(out)) {
    const leg = len(sub(fr[0].thigh_l, fr[0].calf_l)) + len(sub(fr[0].calf_l, fr[0].foot_l));
    const N = fr.length, minY = Math.min(...fr.map((f) => Math.min(f.ball_l[1], f.ball_r[1])));
    // směr pohybu (vodorovně) a levá strana
    let dx = fr[N - 1].pelvis[0] - fr[0].pelvis[0], dz = fr[N - 1].pelvis[2] - fr[0].pelvis[2];
    if (name === 'kick') { const c = Math.floor(N / 2); dx = fr[c].ball_l[0] + fr[c].ball_r[0] - fr[c].foot_l[0] - fr[c].foot_r[0]; dz = fr[c].ball_l[2] + fr[c].ball_r[2] - fr[c].foot_l[2] - fr[c].foot_r[2]; }
    const d = Math.hypot(dx, dz), F = [dx / d, dz / d], Lf = [F[1], -F[0]];   // vlevo = nahoru × dopředu
    const side0 = (fr[0].foot_l[0] - fr[0].foot_r[0]) * Lf[0] + (fr[0].foot_l[2] - fr[0].foot_r[2]) * Lf[1]; if (side0 < 0) { Lf[0] *= -1; Lf[1] *= -1; }
    const rel = (f, k) => { const q = sub(f[k], f.pelvis); return [(q[0] * F[0] + q[2] * F[1]) / leg, (q[0] * Lf[0] + q[2] * Lf[1]) / leg, (f[k][1] - minY) / leg]; };
    const pose = (f) => ({ fl: rel(f, 'ball_l'), fr: rel(f, 'ball_r'), hl: rel(f, 'hand_l'), hr: rel(f, 'hand_r'), pz: [(f.pelvis[1] - minY) / leg], ln: [((f.neck_01[0] - f.pelvis[0]) * F[0] + (f.neck_01[2] - f.pelvis[2]) * F[1]) / leg] });
    const P = fr.map(pose), keys = ['fl', 'fr', 'hl', 'hr', 'pz', 'ln'];
    let a = 0, e = N - 1, extra = {};
    if (name === 'kick') {
      // okno kolem úderu: snímek s nejrychlejším chodidlem
      let best = 0, bi = 0, foot = 'fr';
      for (let i = 2; i < N - 2; i++) for (const k of ['fl', 'fr']) { const s = len(sub(P[i + 1][k], P[i - 1][k])); if (s > best) { best = s; bi = i; foot = k; } }
      a = Math.max(0, bi - 27); e = Math.min(N - 1, bi + 27); extra = { hit: r3((bi - a) / (e - a)), foot: foot === 'fl' ? 1 : -1 };
    } else {
      // jeden běžecký cyklus: dvojice snímků s nejpodobnějším postojem
      let best = 1e9; const dist = (i, j) => keys.slice(0, 4).reduce((s, k) => s + len(sub(P[i][k], P[j][k])), 0);
      for (let i = 0; i < N - 30; i++) for (let j = i + 30; j < Math.min(N, i + 66); j++) { const q = dist(i, j); if (q < best) { best = q; a = i; e = j; } }
      const pd = sub(fr[e].pelvis, fr[a].pelvis); extra = { stride: r3(Math.hypot(pd[0], pd[2]) / leg), secs: r3((e - a) / 60) };
    }
    const M = 32, S = {}; for (const k of keys) S[k] = [];
    for (let i = 0; i < M; i++) {
      const u = i / (name === 'kick' ? M - 1 : M), x = a + u * (e - a), i0 = Math.floor(x), i1 = Math.min(N - 1, i0 + 1), t = x - i0;
      for (const k of keys) S[k].push(P[i0][k].map((v0, c) => { let v = v0 + (P[i1][k][c] - v0) * t; if (name !== 'kick') v -= (P[e][k][c] - P[a][k][c]) * u; return v; }));   // uzavření smyčky
    }
    if (name !== 'kick') { let s0 = 0, m = -9; S.fl.forEach((q, i) => { if (q[0] > m) { m = q[0]; s0 = i; } }); for (const k of keys) S[k] = S[k].slice(s0).concat(S[k].slice(0, s0)); }   // cyklus začíná levou nohou vpředu
    res[name] = { n: M, ...extra }; for (const k of keys) res[name][k] = S[k].flat().map(r3);
    console.log(name, 'okno', a, e, JSON.stringify(extra));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'models', 'moves.json'), JSON.stringify(res));
  console.log('models/moves.json', fs.statSync(path.join(__dirname, '..', 'models', 'moves.json')).size, 'B');
})();
