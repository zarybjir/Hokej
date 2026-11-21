'use strict';
// ---------- 3D engine (Three.js / WebGL) ----------
// Souřadnice: hra (x podél kluziště, y napříč, z nahoru, stopy) → three.js (x, z, -y)
const ZOOMS = [0.72, 0.86, 1.0, 1.2, 1.45];
const ZOOM_NAMES = ['VELMI BLÍZKO', 'BLÍZKO', 'STŘEDNÍ', 'DALEKO', 'VELMI DALEKO'];
const GFX = {
  low: { name: 'NÍZKÁ', pr: 0.7, shadow: 0, refl: false, ice: 2048 },
  mid: { name: 'STŘEDNÍ', pr: 1, shadow: 1024, refl: false, ice: 2048 },
  high: { name: 'VYSOKÁ', pr: 1, shadow: 2048, refl: true, ice: 4096 },
};
const GFX_ORDER = ['low', 'mid', 'high'];

function rrPts(hl, hw, r, n) {
  const pts = [], cx = hl - r, cy = hw - r;
  for (const [ox, oy, a0] of [[cx, cy, 0], [-cx, cy, 90], [-cx, -cy, 180], [cx, -cy, 270]])
    for (let i = 0; i <= n; i++) { const a = ((a0 + (90 * i) / n) * Math.PI) / 180; pts.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]); }
  return pts;
}
function loopInfo(pts) {
  const n = pts.length, s = [0], nrm = [];
  for (let i = 1; i <= n; i++) { const a = pts[i - 1], b = pts[i % n]; s.push(s[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty);
    nrm.push([ty / l, -tx / l]); // ven z kluziště
  }
  return { n, s, P: s[n], nrm };
}
// pás (stěna) kolem smyčky: posFn(i, strana) -> [x,y,z] herní souřadnice
function stripGeo(N, posFn, uvFn, filter) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) for (let k = 0; k < 2; k++) {
    const [x, y, z] = posFn(i, k); pos.push(x, z, -y);
    const t = uvFn(i, k); uv.push(t[0], t[1]);
  }
  for (let i = 0; i < N; i++) { if (filter && !filter(i)) continue; const a = 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function canvasTex(c, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

const _Y = new THREE.Vector3(0, 1, 0), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _m4 = new THREE.Matrix4();
// válec/box s jednotkovou výškou podél Y natáhnout mezi body a,b; fwd určuje natočení (přední strana = +Z)
function seg(mesh, a, b, fwd) {
  _va.subVectors(b, a); const L = _va.length() || 1e-3; _va.divideScalar(L);
  _vb.copy(fwd).addScaledVector(_va, -fwd.dot(_va));
  if (_vb.lengthSq() < 1e-6) _vb.set(1, 0, 0).addScaledVector(_va, -_va.x);
  _vb.normalize(); _vc.crossVectors(_va, _vb);
  _m4.makeBasis(_vc, _va, _vb); mesh.quaternion.setFromRotationMatrix(_m4);
  mesh.position.addVectors(a, b).multiplyScalar(0.5); mesh.scale.set(1, L, 1);
}
function put(mesh, p, fwd, up = _Y) {
  _vb.copy(fwd).addScaledVector(up, -fwd.dot(up)).normalize();
  _vc.crossVectors(up, _vb);
  _m4.makeBasis(_vc, up, _vb); mesh.quaternion.setFromRotationMatrix(_m4);
  mesh.position.copy(p); mesh.scale.set(1, 1, 1);
}

// ---------- model hráče z polygonů ----------
class PModel {
  constructor(G, p) {
    this.G = G; this.goalie = p.isGoalie; this.root = new THREE.Group();
    const T = p.team, m = G.teamMats(T), geo = G.geo;
    this.jTex = G.jerseyTexture(T, p);
    this.jMat = new THREE.MeshStandardMaterial({ map: this.jTex, roughness: 0.78 });
    const M = (g, mat, shadow = true) => { const o = new THREE.Mesh(g, mat); o.castShadow = shadow; this.root.add(o); return o; };
    const P = this.parts = {};
    if (!p.isGoalie) {
      P.torso = M(geo.torso, this.jMat);
      P.pants = M(geo.pants, m.pants);
      for (const s of ['L', 'R']) {
        P['sh' + s] = M(geo.shoulder, m.sleeve);
        P['ua' + s] = M(geo.upperArm, m.sleeve);
        P['fa' + s] = M(geo.foreArm, m.sleeve);
        P['gl' + s] = M(geo.glove, m.glove);
        P['th' + s] = M(geo.thigh, m.pants);
        P['sn' + s] = M(geo.shin, m.socks);
        P['sk' + s] = M(geo.boot, G.mat.boot);
        P['bl' + s] = M(geo.skBlade, G.mat.steel, false);
      }
      P.head = M(geo.head, G.mat.skin);
      P.helmet = M(geo.helmet, m.helmet);
      P.visor = M(geo.visor, G.mat.visor, false);
      P.shaft = M(geo.shaft, G.mat.shaft);
      P.blade = M(geo.blade, G.mat.blade);
    } else {
      P.torso = M(geo.gTorso, this.jMat);
      P.pants = M(geo.pants, m.pants);
      for (const s of ['L', 'R']) {
        P['sh' + s] = M(geo.gShoulder, m.sleeve);
        P['ua' + s] = M(geo.upperArm, m.sleeve);
        P['fa' + s] = M(geo.foreArm, m.sleeve);
        P['th' + s] = M(geo.thigh, m.pants);
        P['pad' + s] = M(geo.pad, m.pad);
        P['sk' + s] = M(geo.boot, G.mat.boot);
      }
      P.glove = M(geo.catcher, m.gGear);
      P.blocker = M(geo.blocker, m.gGear);
      P.mask = M(geo.mask, m.mask);
      P.cage = M(geo.cage, G.mat.cage, false);
      P.shaft = M(geo.shaft, G.mat.shaft);
      P.paddle = M(geo.paddle, G.mat.shaft);
      P.blade = M(geo.gBlade, G.mat.blade);
    }
    G.scene.add(this.root);
  }
  dispose() { this.G.scene.remove(this.root); this.jTex.dispose(); this.jMat.dispose(); }
  pose(p, t) {
    const P = this.parts, d = p.dir, c = Math.cos(d), s = Math.sin(d);
    const O = new THREE.Vector3(p.x, 0, -p.y), F = new THREE.Vector3(c, 0, -s), Lv = new THREE.Vector3(-s, 0, -c);
    const J = (a, b, z) => new THREE.Vector3(O.x + F.x * a + Lv.x * b, z, O.z + F.z * a + Lv.z * b);
    const mid = (a, b) => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const add = (a, v, k) => a.clone().addScaledVector(v, k);
    if (this.goalie) this.poseGoalie(p, t, P, O, F, Lv, J, mid, add);
    else this.poseSkater(p, t, P, O, F, Lv, J, mid, add);
    // ležící hráč po bodyčeku
    const down = p.downT > 0;
    if (down || this.wasDown) {
      if (down) {
        const dl = [Math.cos(p.lie), Math.sin(p.lie)], k3 = new THREE.Vector3(-dl[1], 0, -dl[0]);
        const q = new THREE.Quaternion().setFromAxisAngle(k3, 1.42);
        for (const m of this.root.children) {
          m.position.sub(O).applyQuaternion(q).add(O); m.position.y += 0.45;
          m.quaternion.premultiply(q);
        }
      }
      this.wasDown = down;
    }
  }
  poseSkater(p, t, P, O, F, Lv, J, mid, add) {
    const spd = Math.min(1, (p.spdN || 0) / 26), ph = p.stride || 0, wind = p.windT || 0;
    const crouch = 0.45 * spd + 0.3 * wind, hipZ = 2.95 - crouch * 0.75;
    const sw = Math.sin(ph) * spd, cw = Math.cos(ph);
    const fL = J(-0.85 * sw + 0.1, 0.5 + 0.38 * Math.max(0, -sw), Math.max(0, cw) * 0.35 * spd);
    const fR = J(0.85 * sw + 0.1, -0.5 - 0.38 * Math.max(0, sw), Math.max(0, -cw) * 0.35 * spd);
    const hipC = J(0, 0, hipZ), hL = J(0, 0.36, hipZ - 0.1), hR = J(0, -0.36, hipZ - 0.1);
    const kL = add(mid(hL, fL), F, 0.5 + 0.35 * spd), kR = add(mid(hR, fR), F, 0.5 + 0.35 * spd);
    kL.y += 0.1; kR.y += 0.1;
    const aL = add(fL, _Y, 0.55), aR = add(fR, _Y, 0.55);
    seg(P.thL, hL, kL, F); seg(P.thR, hR, kR, F);
    seg(P.snL, kL, aL, F); seg(P.snR, kR, aR, F);
    put(P.skL, add(add(fL, _Y, 0.32), F, 0.12), F); put(P.skR, add(add(fR, _Y, 0.32), F, 0.12), F);
    put(P.blL, add(add(fL, _Y, 0.07), F, 0.12), F); put(P.blR, add(add(fR, _Y, 0.07), F, 0.12), F);
    const lean = 0.2 + 0.55 * spd + 0.3 * wind;
    const up = new THREE.Vector3().addScaledVector(F, Math.sin(lean)).addScaledVector(_Y, Math.cos(lean));
    const shC = add(hipC, up, 1.95);
    seg(P.pants, add(hipC, _Y, -0.6), add(hipC, up, 0.4), F);
    seg(P.torso, add(hipC, up, 0.2), add(shC, up, 0.22), F);
    const hu = new THREE.Vector3().addScaledVector(F, Math.sin(lean * 0.45)).addScaledVector(_Y, Math.cos(lean * 0.45));
    const head = add(shC, hu, 0.72);
    put(P.head, head, F, hu); put(P.helmet, add(head, hu, 0.06), F, hu); put(P.visor, add(head, hu, 0.06), F, hu);
    const sL = add(add(shC, Lv, 0.72), up, -0.05), sR = add(add(shC, Lv, -0.72), up, -0.05);
    put(P.shL, sL, F, up); put(P.shR, sR, F, up);
    // hůl
    const bo = bladeOffset(p.dir, p.hand, p.carry, t, wind, p.pokeA || 0);
    const heel = new THREE.Vector3(O.x + bo[0], bo[2] + 0.12, O.z - bo[1]);
    const top = J(0.55, -p.hand * 0.42, 3.55 - crouch * 0.6 + wind * 1.1);
    const dirShaft = new THREE.Vector3().subVectors(top, heel).normalize();
    seg(P.shaft, heel, add(top, dirShaft, 0.35), F);
    const ta = p.dir + p.hand * 0.7, toe = new THREE.Vector3(Math.cos(ta), 0, -Math.sin(ta));
    put(P.blade, add(add(heel, toe, 0.45), _Y, 0.02), toe);
    const hTop = top, hBot = top.clone().lerp(heel, 0.32);
    const [sTop, sBot, sideTop] = p.hand > 0 ? [sR, sL, -1] : [sL, sR, 1];
    const arm = (sh, hd, side, ua, fa, gl) => {
      const el = mid(sh, hd).addScaledVector(Lv, side * 0.3).addScaledVector(_Y, -0.25);
      seg(ua, sh, el, F); seg(fa, el, hd, F); put(gl, hd, F);
    };
    arm(sTop, hTop, sideTop, sTop === sL ? P.uaL : P.uaR, sTop === sL ? P.faL : P.faR, sTop === sL ? P.glL : P.glR);
    arm(sBot, hBot, -sideTop, sBot === sL ? P.uaL : P.uaR, sBot === sL ? P.faL : P.faR, sBot === sL ? P.glL : P.glR);
  }
  poseGoalie(p, t, P, O, F, Lv, J, mid, add) {
    const sv = p.saveT > 0 ? p.saveKind : 0, bf = sv === 1;
    const sway = Math.sin((p.stride || 0) * 0.8) * 0.08;
    const hipZ = bf ? 1.5 : 2.35;
    const hipC = J(-0.25, sway, hipZ), hL = J(-0.2, 0.42, hipZ - 0.1), hR = J(-0.2, -0.42, hipZ - 0.1);
    let fL, fR, kL, kR;
    if (bf) { kL = J(0.55, 0.55, 0.38); kR = J(0.55, -0.55, 0.38); fL = J(-0.7, 2.0, 0.25); fR = J(-0.7, -2.0, 0.25); }
    else { fL = J(0.05, 1.05, 0); fR = J(0.05, -1.05, 0); kL = J(0.65, 0.82, 1.3); kR = J(0.65, -0.82, 1.3); }
    seg(P.thL, hL, kL, F); seg(P.thR, hR, kR, F);
    if (bf) { seg(P.padL, kL, fL, _Y); seg(P.padR, kR, fR, _Y); }
    else { seg(P.padL, add(fL, _Y, 0.05), add(kL, _Y, 0.55), F); seg(P.padR, add(fR, _Y, 0.05), add(kR, _Y, 0.55), F); }
    put(P.skL, add(fL, _Y, 0.25), F); put(P.skR, add(fR, _Y, 0.25), F);
    const shC = J(0.1, sway, bf ? 3.35 : 4.15);
    seg(P.pants, add(hipC, _Y, -0.5), add(hipC, _Y, 0.35), F);
    seg(P.torso, add(hipC, _Y, 0.15), add(shC, _Y, 0.3), F);
    const head = add(add(shC, _Y, 0.72), F, 0.12);
    put(P.mask, head, F); put(P.cage, head, F);
    const sL = add(shC, Lv, 0.85), sR = add(shC, Lv, -0.85);
    put(P.shL, sL, F); put(P.shR, sR, F);
    const gS = p.hand >= 0 ? -1 : 1; // strana lapačky (Lv)
    const zB = bf ? -0.8 : 0;
    let glove = J(0.75, gS * 1.3, 2.95 + zB), block = J(0.75, -gS * 1.2, 2.7 + zB);
    if (sv === 2) glove = J(0.55, gS * 1.7, 4.7);
    if (sv === 3) block = J(0.55, -gS * 1.7, 4.3);
    const arm = (sh, hd, ua, fa, side) => { const el = mid(sh, hd).addScaledVector(Lv, side * 0.35).addScaledVector(_Y, -0.2); seg(ua, sh, el, F); seg(fa, el, hd, F); };
    const [sG, sB] = gS > 0 ? [sL, sR] : [sR, sL];
    arm(sG, glove, gS > 0 ? P.uaL : P.uaR, gS > 0 ? P.faL : P.faR, gS);
    arm(sB, block, gS > 0 ? P.uaR : P.uaL, gS > 0 ? P.faR : P.faL, -gS);
    put(P.glove, glove, F, Lv.clone().multiplyScalar(gS));
    put(P.blocker, block, F);
    // hůl: z vyrážečky dolů na led před brankáře
    const bladeC = J(1.9, -gS * 0.35, 0.18), paddleTop = J(1.45, -gS * 0.6, 1.5);
    seg(P.shaft, paddleTop, add(block, _Y, 0.4), F);
    seg(P.paddle, add(bladeC, _Y, 0.05), paddleTop, F);
    put(P.blade, bladeC, Lv);
  }
}

const G3 = {
  init(canvas) {
    this.cv = canvas;
    try {
      this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { this.fail = true; return false; }
    const r = this.r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    this.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080d);
    this.cam = new THREE.PerspectiveCamera(36, 1.6, 2, 1500);
    this.camT = { x: 0, y: 0 };
    this.clipNear = new THREE.Plane(new THREE.Vector3(0, 0, -1), RINK.HW + 5);
    this.models = []; this.modelGame = null; this.teamCache = new Map();
    this.buildShared(); this.buildEnv(); this.buildLights(); this.buildIce(); this.buildBoards(); this.buildStands();
    this.buildNets(); this.buildPuck(); this.buildRings(); this.buildGoalLights();
    this.quality = null;
    this.setView();
    this.applyQuality(Settings.data.gfx || 'high');
    return true;
  },

  // ---------- sdílené geometrie a materiály ----------
  buildShared() {
    const cyl = (a, b, seg = 12) => new THREE.CylinderGeometry(a, b, 1, seg);
    const g = this.geo = {
      torso: cyl(0.95, 0.68, 20).scale(1, 1, 0.62),
      gTorso: cyl(1.2, 0.95, 20).scale(1, 1, 0.72),
      pants: cyl(0.74, 0.66, 16).scale(1, 1, 0.78),
      shoulder: new THREE.SphereGeometry(0.42, 14, 10).scale(1, 0.85, 1),
      gShoulder: new THREE.SphereGeometry(0.55, 14, 10).scale(1, 0.8, 1),
      upperArm: cyl(0.21, 0.18), foreArm: cyl(0.18, 0.15),
      glove: new THREE.BoxGeometry(0.36, 0.34, 0.52),
      thigh: cyl(0.34, 0.27), shin: cyl(0.25, 0.19),
      boot: new THREE.BoxGeometry(0.36, 0.5, 1.05), skBlade: new THREE.BoxGeometry(0.05, 0.14, 1.3),
      head: new THREE.SphereGeometry(0.36, 16, 12),
      helmet: new THREE.SphereGeometry(0.44, 20, 12, 0, TAU, 0, Math.PI * 0.56).scale(1, 1, 1.12),
      visor: new THREE.SphereGeometry(0.47, 16, 6, Math.PI / 2 - 0.75, 1.5, Math.PI * 0.4, Math.PI * 0.17).scale(1, 1, 1.1),
      shaft: new THREE.BoxGeometry(0.11, 1, 0.15),
      blade: new THREE.BoxGeometry(0.07, 0.3, 1.0),
      pad: new THREE.BoxGeometry(0.78, 1, 0.62),
      catcher: new THREE.CylinderGeometry(0.55, 0.55, 0.22, 20).rotateZ(Math.PI / 2),
      blocker: new THREE.BoxGeometry(0.2, 0.95, 0.68),
      mask: new THREE.SphereGeometry(0.47, 18, 14).scale(1, 1.1, 1.05),
      cage: new THREE.SphereGeometry(0.5, 10, 6, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.35, Math.PI * 0.4),
      paddle: new THREE.BoxGeometry(0.1, 1, 0.3), gBlade: new THREE.BoxGeometry(0.09, 0.3, 1.4),
    };
    this.mat = {
      skin: new THREE.MeshStandardMaterial({ color: 0xd9a585, roughness: 0.6 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.35, metalness: 0.1 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.15, metalness: 1.0 }),
      visor: new THREE.MeshPhysicalMaterial({ color: 0x8ea4c4, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false }),
      shaft: new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.4, metalness: 0.2 }),
      blade: new THREE.MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.85 }),
      cage: new THREE.MeshStandardMaterial({ color: 0x222222, wireframe: true, metalness: 0.8, roughness: 0.3 }),
    };
    void g;
  },
  teamMats(T) {
    if (this.teamCache.has(T)) return this.teamCache.get(T);
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
    const [sc, sg] = mkCanvas(64, 128);
    sg.fillStyle = T.jersey; sg.fillRect(0, 0, 64, 128);
    sg.fillStyle = T.stripe; sg.fillRect(0, 40, 64, 22);
    sg.fillStyle = lightness(T.jersey) > 0.7 ? T.def.c3 : '#ffffff'; sg.fillRect(0, 36, 64, 4); sg.fillRect(0, 62, 64, 4);
    const [pc, pg] = mkCanvas(64, 256);
    pg.fillStyle = '#f3f3f3'; pg.fillRect(0, 0, 64, 256);
    const gc = lightness(T.jersey) > 0.7 ? T.stripe : T.jersey;
    pg.fillStyle = gc; pg.fillRect(0, 50, 64, 26); pg.fillRect(0, 150, 64, 26); pg.fillRect(0, 230, 64, 26);
    const m = {
      pants: std(T.pants), sleeve: std(T.jersey, { roughness: 0.78 }),
      glove: std(T.helmet === T.jersey ? T.pants : T.helmet, { roughness: 0.6 }),
      helmet: new THREE.MeshPhysicalMaterial({ color: T.helmet, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
      socks: new THREE.MeshStandardMaterial({ map: canvasTex(sc), roughness: 0.85 }),
      pad: new THREE.MeshStandardMaterial({ map: canvasTex(pc), roughness: 0.55 }),
      gGear: std('#f2f2f2', { roughness: 0.5 }),
      mask: new THREE.MeshPhysicalMaterial({ color: gc, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
    };
    this.teamCache.set(T, m);
    return m;
  },
  jerseyTexture(T, p) {
    const [c, g] = mkCanvas(512, 256);
    g.fillStyle = T.jersey; g.fillRect(0, 0, 512, 256);
    const trim = lightness(T.jersey) > 0.7 ? T.def.c3 : '#ffffff';
    g.fillStyle = T.stripe; g.fillRect(0, 0, 512, 30); g.fillRect(0, 168, 512, 34);
    g.fillStyle = trim; g.fillRect(0, 30, 512, 5); g.fillRect(0, 162, 512, 6); g.fillRect(0, 202, 512, 6);
    // záda (u = 0.5)
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = T.numCol; g.font = 'bold 26px "DejaVu Sans", Arial, sans-serif';
    g.fillText(p.name.toUpperCase(), 256, 58);
    g.font = 'bold 104px "DejaVu Sans", Arial, sans-serif';
    g.lineWidth = 7; g.strokeStyle = T.stripe; g.strokeText(String(p.num), 256, 122); g.fillText(String(p.num), 256, 122);
    // hruď (u = 0 / 1): znak týmu
    for (const x of [0, 512]) {
      g.fillStyle = T.stripe; g.beginPath(); g.arc(x, 105, 40, 0, TAU); g.fill();
      g.fillStyle = trim; g.beginPath(); g.arc(x, 105, 33, 0, TAU); g.fill();
      g.fillStyle = T.def.c1 === T.jersey ? T.stripe : T.def.c1; g.font = 'bold italic 22px "DejaVu Sans", Arial, sans-serif';
      g.fillText(T.def.abbr, x, 106);
    }
    // čísla na rukávech (u = 0.25 a 0.75)
    g.font = 'bold 40px "DejaVu Sans", Arial, sans-serif'; g.fillStyle = T.numCol;
    g.fillText(String(p.num), 128, 80); g.fillText(String(p.num), 384, 80);
    return canvasTex(c, true, this.aniso);
  },

  // ---------- prostředí (odlesky) a světla ----------
  buildEnv() {
    const pm = new THREE.PMREMGenerator(this.r), es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.BoxGeometry(500, 160, 340), new THREE.MeshBasicMaterial({ color: 0x15181f, side: THREE.BackSide })));
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 14, 13) });
    for (let x = -160; x <= 160; x += 40) for (let z = -75; z <= 75; z += 50) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(18, 5), lm); m.position.set(x, 75, z); m.rotation.x = Math.PI / 2; es.add(m);
    }
    for (const [s, col] of [[-1, new THREE.Color(3, 0.5, 0.35)], [1, new THREE.Color(0.5, 1, 3)]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(300, 5), new THREE.MeshBasicMaterial({ color: col }));
      m.position.set(0, 22, s * 120); m.rotation.y = s > 0 ? Math.PI : 0; es.add(m);
    }
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(220, 100), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.4, 1.5) }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = -12; es.add(fl);
    this.env = pm.fromScene(es, 0.02).texture;
    this.scene.environment = this.env;
    pm.dispose();
  },
  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xeef3ff, 0x3a404c, 1.25));
    const k = this.key = new THREE.DirectionalLight(0xfff8f0, 2.6);
    const sc = k.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 20; sc.far = 300;
    k.shadow.bias = -0.0004; k.shadow.normalBias = 0.04;
    this.scene.add(k, k.target);
    const f = new THREE.DirectionalLight(0xc8d8ff, 0.45); f.position.set(-80, 90, 60); this.scene.add(f);
  },

  // ---------- led ----------
  buildIce() {
    const shape = new THREE.Shape(rrPts(RINK.HL, RINK.HW, RINK.R, 20).map(([x, y]) => new THREE.Vector2(x, y)));
    const flat = new THREE.ShapeGeometry(shape, 20);
    const uv = flat.attributes.uv, pos = flat.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + RINK.HL) / (2 * RINK.HL), (pos.getY(i) + RINK.HW) / (2 * RINK.HW));
    this.iceFlat = flat;
    const geo = flat.clone().rotateX(-Math.PI / 2);
    this.iceMat = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, clearcoat: 0.65, clearcoatRoughness: 0.05, envMapIntensity: 0.85 });
    this.ice = new THREE.Mesh(geo, this.iceMat);
    this.ice.receiveShadow = true; this.ice.renderOrder = 1;
    this.scene.add(this.ice);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 500), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.4; this.scene.add(floor);
  },
  paintIce() {
    const W = GFX[this.quality].ice, ppf = W / 200, H = Math.round(85 * ppf);
    const [c, g] = mkCanvas(W, H), [rc, gr] = mkCanvas(W / 2, Math.round(H / 2));
    const X = (x) => (x + 100) * ppf, Y = (y) => (42.5 - y) * ppf;
    const rnd = mulberry32(1998);
    g.fillStyle = 'rgb(242,247,251)'; g.fillRect(0, 0, W, H);
    gr.fillStyle = 'rgb(40,40,40)'; gr.fillRect(0, 0, rc.width, rc.height);
    for (let i = 0; i < 110; i++) {
      const x = rnd() * W, y = rnd() * H, r = (4 + rnd() * 24) * ppf, col = rnd() < 0.55 ? [200, 214, 230] : [255, 255, 255];
      const gg = g.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, `rgba(${col},${0.12 + rnd() * 0.12})`); gg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // čáry pod ledem (lehce rozmazané)
    g.save(); g.filter = `blur(${Math.max(0.7, ppf * 0.06)}px)`;
    const RED = 'rgba(196,28,40,0.95)', BLUE = 'rgba(22,66,180,0.95)';
    g.fillStyle = RED; g.fillRect(X(-0.5), 0, ppf, H);
    g.fillStyle = BLUE; for (const s of [-1, 1]) g.fillRect(X(s * RINK.BLUE_X - 0.5), 0, ppf, H);
    g.fillStyle = RED; for (const s of [-1, 1]) g.fillRect(X(s * RINK.GOAL_X) - 0.09 * ppf, 0, 0.18 * ppf, H);
    const circ = (cx, cy, r, col, fill) => {
      g.beginPath(); g.arc(X(cx), Y(cy), r * ppf, 0, TAU);
      if (fill) { g.fillStyle = col; g.fill(); } else { g.strokeStyle = col; g.lineWidth = Math.max(2, 0.18 * ppf); g.stroke(); }
    };
    circ(0, 0, 15, BLUE); circ(0, 0, 0.5, BLUE, true);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        circ(sx * 20, sy * 22, 1, RED, true);
        circ(sx * 69, sy * 22, 15, RED); circ(sx * 69, sy * 22, 1, RED, true);
        g.fillStyle = RED;
        for (const hx of [-1, 1]) for (const hy of [-1, 1]) g.fillRect(X(sx * 69 + hx * 2.9) - 0.09 * ppf, Y(sy * 22 + hy * (hy > 0 ? 17.5 : 14.7)), 0.18 * ppf, 2.8 * ppf);
        for (const hx of [-1, 1]) for (const hy of [-1, 1]) {
          const bx = X(sx * 69 + hx * 2), by = Y(sy * 22 + hy * 0.75);
          g.fillRect(bx - (hx > 0 ? 0 : 4 * ppf), by - 0.09 * ppf, 4 * ppf, 0.18 * ppf);
          g.fillRect(bx - 0.09 * ppf, by - (hy > 0 ? 3 * ppf : 0), 0.18 * ppf, 3 * ppf);
        }
      }
      // brankoviště
      const cx = X(sx * RINK.GOAL_X), cy = Y(0), a0 = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 6 * ppf, a0, a0 + Math.PI); g.closePath();
      g.fillStyle = 'rgba(70,150,230,0.8)'; g.fill(); g.strokeStyle = RED; g.lineWidth = Math.max(2, 0.18 * ppf); g.stroke();
    }
    // centrální logo (čitelné z aktuální kamery)
    g.save(); g.translate(X(0), Y(0)); g.rotate(this.view === 'side' ? 0 : Math.PI / 2);
    g.fillStyle = 'rgba(255,255,255,0.96)'; g.beginPath(); g.arc(0, 0, 10.5 * ppf, 0, TAU); g.fill();
    g.lineWidth = 0.9 * ppf; g.strokeStyle = '#0a2a6b'; g.stroke();
    g.lineWidth = 0.35 * ppf; g.strokeStyle = '#c8202e'; g.beginPath(); g.arc(0, 0, 9.1 * ppf, 0, TAU); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#0a2a6b'; g.font = `italic 900 ${4.4 * ppf}px "Arial Black","DejaVu Sans",sans-serif`; g.fillText('HOKEJ', 0, -1.2 * ppf);
    g.fillStyle = '#c8202e'; g.font = `italic 900 ${3.4 * ppf}px "Arial Black","DejaVu Sans",sans-serif`; g.fillText("'98", 0, 3.2 * ppf);
    g.restore();
    g.restore();
    // škrábance od bruslí
    const N = W > 3000 ? 9000 : 4500;
    for (let i = 0; i < N; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * TAU, len = (0.6 + rnd() * rnd() * 7) * ppf, bend = (rnd() - 0.5) * 0.9;
      const dark = rnd() < 0.18;
      g.strokeStyle = dark ? `rgba(150,165,180,${0.03 + rnd() * 0.05})` : `rgba(255,255,255,${0.05 + rnd() * 0.1})`;
      g.lineWidth = 0.5 + rnd() * 0.9;
      const mx = x + Math.cos(a + bend) * len * 0.5, my = y + Math.sin(a + bend) * len * 0.5, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      gr.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.25})`; gr.lineWidth = 0.6;
      gr.beginPath(); gr.moveTo(x / 2, y / 2); gr.quadraticCurveTo(mx / 2, my / 2, ex / 2, ey / 2); gr.stroke();
    }
    // sníh u mantinelů a v brankovištích
    const edge = (ctx, k, lw, col, blur) => {
      ctx.save(); ctx.filter = `blur(${blur}px)`; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      rrPts(RINK.HL, RINK.HW, RINK.R, 20).forEach(([x, y], i) => (i ? ctx.lineTo(X(x) * k, Y(y) * k) : ctx.moveTo(X(x) * k, Y(y) * k)));
      ctx.closePath(); ctx.stroke(); ctx.restore();
    };
    edge(g, 1, 5 * ppf, 'rgba(255,255,255,0.75)', 1.6 * ppf);
    edge(gr, 0.5, 2.5 * ppf, 'rgba(200,200,200,0.9)', 0.8 * ppf);
    for (const sx of [-1, 1]) for (let i = 0; i < 40; i++) {
      const x = X(sx * (RINK.GOAL_X - 2 - rnd() * 10)), y = Y((rnd() - 0.5) * 14), r = (0.6 + rnd() * 1.8) * ppf;
      const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(255,255,255,0.35)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (this.iceMat.map) { this.iceMat.map.dispose(); this.iceMat.roughnessMap.dispose(); }
    this.iceMat.map = canvasTex(c, true, this.aniso);
    this.iceMat.roughnessMap = canvasTex(rc, false, this.aniso);
    this.iceMat.needsUpdate = true;
  },
  setReflector(on) {
    if (on && !this.refl) {
      const self = this;
      this.refl = new Reflector(this.iceFlat, { clipBias: 0.003, textureWidth: 1024, textureHeight: 640, color: 0xb4bec8 });
      this.refl.rotation.x = -Math.PI / 2; this.refl.position.y = -0.05; this.refl.renderOrder = 0;
      const orig = this.refl.onBeforeRender;
      this.refl.onBeforeRender = function (r, s, c) {
        self.ice.visible = false; self.glassGroups.forEach((g) => (g.refl.visible = false)); self.rings.forEach((m) => (m.userData.v = m.visible, m.visible = false));
        orig.call(this, r, s, c);
        self.ice.visible = true; self.glassGroups.forEach((g) => (g.refl.visible = true)); self.rings.forEach((m) => (m.visible = m.userData.v));
      };
      this.scene.add(this.refl);
      this.sizeReflector();
    }
    if (this.refl) this.refl.visible = on;
    this.iceMat.transparent = on; this.iceMat.opacity = on ? 0.9 : 1; this.iceMat.needsUpdate = true;
  },
  sizeReflector() {
    if (!this.refl) return;
    const s = new THREE.Vector2(); this.r.getDrawingBufferSize(s);
    this.refl.getRenderTarget().setSize(Math.max(256, Math.floor(s.x / 2)), Math.max(256, Math.floor(s.y / 2)));
  },

  // ---------- mantinely, plexisklo ----------
  buildBoards() {
    const pts = rrPts(RINK.HL, RINK.HW, RINK.R, 24), L = loopInfo(pts), N = L.n;
    const at = (i) => pts[i % N], nr = (i) => L.nrm[i % N];
    const P = L.P;
    // reklamní mantinel
    const [ac, ag] = mkCanvas(8192, 128), ppf = 8192 / P;
    ag.fillStyle = '#f4f5f6'; ag.fillRect(0, 0, 8192, 128);
    const rnd = mulberry32(7);
    let k = 0;
    for (let s = 3; s < P - 12; s += 15, k++) {
      if (k % 3 === 2) continue;
      const [txt, bg, fg] = [['ŽENISTA', '#c8102e', '#fff'], ['LEDOVÁ LIGA', '#0a2a6b', '#ffd21f'], ['PUK MART', '#ffd21f', '#111'],
        ['ICE COLA', '#b00020', '#fff'], ['BRUSLE+', '#111', '#2ee6ff'], ["HOKEJ '98", '#1f3f7a', '#fff'],
        ['PIZZA RÁJ', '#0b6e3a', '#fff'], ['LEDŇÁK', '#e6e6e6', '#0a2a6b'], ['ZIMÁK FM', '#5b2c83', '#fff']][k % 9];
      const x0 = s * ppf, w = 12 * ppf;
      ag.fillStyle = bg; ag.fillRect(x0, 14, w, 100);
      ag.fillStyle = fg; ag.font = 'italic 900 70px "Arial Black","DejaVu Sans",sans-serif'; ag.textAlign = 'center'; ag.textBaseline = 'middle';
      const tw = ag.measureText(txt).width; ag.save(); ag.translate(x0 + w / 2, 66); ag.scale(Math.min(1, (w - 20) / tw), 1); ag.fillText(txt, 0, 0); ag.restore();
    }
    for (let i = 0; i < 900; i++) { ag.fillStyle = `rgba(20,20,20,${0.1 + rnd() * 0.35})`; ag.beginPath(); ag.arc(rnd() * 8192, 70 + rnd() * 55, 1 + rnd() * 3, 0, TAU); ag.fill(); }
    const adTex = canvasTex(ac, true, this.aniso);
    const u = (i) => (P - L.s[i]) / P; // zevnitř čteno zleva doprava
    const wall = (z0, z1, off, mat, uvf) => {
      const g = stripGeo(N, (i, kk) => { const p = at(i), n = nr(i); return [p[0] + n[0] * off, p[1] + n[1] * off, kk ? z1 : z0]; }, uvf || ((i, kk) => [u(i), kk]));
      const m = new THREE.Mesh(g, mat); this.scene.add(m); return m;
    };
    const ds = THREE.DoubleSide;
    wall(0, 0.75, 0, new THREE.MeshStandardMaterial({ color: 0xe0b21a, roughness: 0.45, side: ds })).receiveShadow = true;
    wall(0.75, 3.25, 0, new THREE.MeshPhysicalMaterial({ map: adTex, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.15, side: ds })).receiveShadow = true;
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1b3c96, roughness: 0.35, side: ds });
    wall(3.25, 3.5, 0, capMat);
    this.scene.add(new THREE.Mesh(stripGeo(N, (i, kk) => { const p = at(i), n = nr(i), o = kk ? 0.75 : 0; return [p[0] + n[0] * o, p[1] + n[1] * o, 3.5]; }, () => [0, 0]), capMat));
    wall(0, 3.5, 0.75, new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.8, side: ds }));
    // plexisklo: panely 8 stop, za brankami vyšší
    const gh = (x) => 8.5 + 3.5 * clamp((Math.abs(x) - 62) / 22, 0, 1);
    const [gc, gg] = mkCanvas(256, 256);
    gg.fillStyle = 'rgba(215,232,255,0.07)'; gg.fillRect(0, 0, 256, 256);
    for (const [x, w, a] of [[40, 30, 0.13], [90, 10, 0.2], [150, 46, 0.09], [210, 8, 0.16]]) {
      gg.save(); gg.transform(1, 0, -0.55, 1, 0, 0);
      const grd = gg.createLinearGradient(x, 0, x + w, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = grd; gg.fillRect(x - 40, 0, w + 300, 256); gg.restore();
    }
    gg.fillStyle = 'rgba(255,255,255,0.45)'; gg.fillRect(0, 0, 3, 256); gg.fillRect(253, 0, 3, 256); gg.fillRect(0, 0, 256, 5);
    gg.fillStyle = 'rgba(200,215,230,0.10)'; gg.fillRect(0, 240, 256, 16);
    const glassTex = canvasTex(gc, true, this.aniso); glassTex.wrapS = THREE.RepeatWrapping;
    // skupiny skla: 0 = konec u kamery (seshora), 1 = bok u kamery (z boku), 2 = zbytek
    const grpOf = (x, y) => (x < -64 ? 0 : y < -24 ? 1 : 2);
    const segGrp = (i) => { const a = at(i), b = at(i + 1); return grpOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); };
    const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, transparent: true, roughness: 0.08, metalness: 0, side: ds, depthWrite: false, envMapIntensity: 1.2 });
    const reflMat = new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 1, roughness: 0.04, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, side: ds, envMapIntensity: 1.0 });
    const stG = new THREE.BoxGeometry(0.16, 1, 0.3), stM = new THREE.MeshStandardMaterial({ color: 0xd4dde6, transparent: true, opacity: 0.55, roughness: 0.2 });
    const posts = [[], [], []];
    for (let sp = 0; sp < P; sp += 8) {
      let i = 0; while (i < N - 1 && L.s[i + 1] < sp) i++;
      const a = at(i), b = at(i + 1), f = (sp - L.s[i]) / Math.max(1e-3, L.s[i + 1] - L.s[i]);
      const x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f);
      posts[grpOf(x, y)].push([x, y, nr(i)]);
    }
    this.glassGroups = [0, 1, 2].map((gi) => {
      const geo = stripGeo(N, (i, kk) => { const p = at(i), n = nr(i); return [p[0] + n[0] * 0.35, p[1] + n[1] * 0.35, kk ? gh(p[0]) : 3.5]; },
        (i, kk) => [L.s[i] / 8, kk], (i) => segGrp(i) === gi);
      const glass = new THREE.Mesh(geo, glassMat); glass.renderOrder = 5;
      const refl = new THREE.Mesh(geo, reflMat); refl.renderOrder = 6;
      const ps = posts[gi], st = new THREE.InstancedMesh(stG, stM, Math.max(1, ps.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      st.count = ps.length;
      ps.forEach(([x, y, n], j) => {
        const h = gh(x) - 3.5;
        q.setFromAxisAngle(_Y, Math.atan2(n[1], n[0]));
        m4.compose(new THREE.Vector3(x + n[0] * 0.35, 3.5 + h / 2, -(y + n[1] * 0.35)), q, new THREE.Vector3(1, h, 1));
        st.setMatrixAt(j, m4);
      });
      const grp = new THREE.Group(); grp.add(glass, refl, st); this.scene.add(grp);
      return { grp, refl };
    });
  },

  // ---------- tribuny a diváci ----------
  buildStands() {
    const rows = 14, pos = [], rnd = mulberry32(42);
    const ring = (d) => rrPts(RINK.HL + d, RINK.HW + d, RINK.R + d, 10);
    const tri = (a, b, c) => { for (const p of [a, b, c]) pos.push(p[0], p[2], -p[1]); };
    const quadStrip = (A, B) => { // A,B: smyčky stejné délky (x,y,z)
      const n = A.length;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(A[i], A[j], B[i]); tri(B[i], A[j], B[j]); }
    };
    const D = (r) => 9 + r * 2.8, Z = (r) => 4.5 + r * 2.1;
    for (let r = 0; r < rows; r++) {
      const inner = ring(D(r)), outer = ring(D(r + 1));
      if (r > 0) quadStrip(inner.map(([x, y]) => [x, y, Z(r - 1)]), inner.map(([x, y]) => [x, y, Z(r)]));
      quadStrip(inner.map(([x, y]) => [x, y, Z(r)]), outer.map(([x, y]) => [x, y, Z(r)]));
    }
    const ring0 = ring(D(rows));
    quadStrip(ring0.map(([x, y]) => [x, y, Z(rows - 1)]), ring0.map(([x, y]) => [x, y, Z(rows - 1) + 30]));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    this.standMat = new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: 0.85, side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(geo, this.standMat));
    // ochoz mezi mantinelem a tribunou + LED pás
    const r0 = ring(D(0)), L0 = loopInfo(r0);
    const [lc, lg] = mkCanvas(2048, 64);
    lg.fillStyle = '#050505'; lg.fillRect(0, 0, 2048, 64);
    lg.font = 'italic 900 40px "Arial Black","DejaVu Sans",sans-serif'; lg.textBaseline = 'middle';
    const txts = [["HOKEJ '98", '#ffd21f'], ['LEDOVÁ LIGA', '#2ee6ff'], ['★', '#ff3b30'], ['DO TOHO!', '#ffffff'], ['★', '#ff3b30']];
    let x = 10; while (x < 2048) for (const [t, c] of txts) { lg.fillStyle = c; lg.fillText(t, x, 34); x += lg.measureText(t).width + 40; }
    this.ledTex = canvasTex(lc, true, this.aniso); this.ledTex.wrapS = THREE.RepeatWrapping;
    const ledGeo = stripGeo(L0.n, (i, k) => { const p = r0[i % L0.n]; return [p[0], p[1], k ? 4.4 : 2.6]; }, (i, k) => [-L0.s[i] / 60, k]);
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.ledTex, emissiveIntensity: 1.3, side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(ledGeo, this.ledMat));
    const walk = stripGeo(L0.n, (i, k) => { const p = r0[i % L0.n], n = L0.nrm[i % L0.n], o = k ? -8.2 : 0; return [p[0] + n[0] * o, p[1] + n[1] * o, 0.05]; }, () => [0, 0]);
    this.scene.add(new THREE.Mesh(walk, new THREE.MeshStandardMaterial({ color: 0x30343d, roughness: 0.9 })));
    // diváci (instancované)
    const seats = [];
    for (let r = 0; r < rows; r++) {
      const rp = ring(D(r) + 1.4), Lr = loopInfo(rp);
      for (let s = rnd() * 2; s < Lr.P; s += 2.35) {
        if (rnd() < 0.08) continue;
        let i = 0; while (i < Lr.n - 1 && Lr.s[i + 1] < s) i++;
        const a = rp[i], b = rp[(i + 1) % Lr.n], f = (s - Lr.s[i]) / Math.max(1e-3, Lr.s[i + 1] - Lr.s[i]);
        seats.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f), Z(r), rnd() * TAU, 0.9 + rnd() * 0.25]);
      }
    }
    this.seats = seats;
    const pal = ['#c8102e', '#1f3f7a', '#f4c542', '#e6e6e6', '#2b2b2b', '#0b6e3a', '#5b2c83', '#ff7a1a', '#1e9bd7', '#8a8a8a', '#6b3e26', '#d94f8a', '#111111', '#f2f2f2'];
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xd8a582, roughness: 0.7 });
    this.bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.48, 0.6, 1.7, 6), this.bodyMat, seats.length);
    this.heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.37, 0), this.headMat, seats.length);
    const col = new THREE.Color();
    seats.forEach((_, i) => { col.set(pal[Math.floor(rnd() * pal.length)]); this.bodies.setColorAt(i, col); });
    this.placeCrowd(0, 0);
    this.scene.add(this.bodies, this.heads);
  },
  placeCrowd(t, ex) {
    const m4 = this.m4 || (this.m4 = new THREE.Matrix4()), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    this.seats.forEach(([x, y, z, ph, s], i) => {
      const b = ex > 0.25 ? Math.max(0, Math.sin(t * 11 + ph)) * ex * 1.1 : 0;
      sc.set(s, s, s);
      p.set(x, z + 0.85 * s + b, -y); m4.compose(p, q, sc); this.bodies.setMatrixAt(i, m4);
      p.y += 1.2 * s; m4.compose(p, q, sc); this.heads.setMatrixAt(i, m4);
    });
    this.bodies.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true;
  },

  // ---------- branky ----------
  buildNets() {
    const [nc, ng] = mkCanvas(64, 64);
    ng.strokeStyle = 'rgba(255,255,255,0.95)'; ng.lineWidth = 4; ng.strokeRect(0, 0, 64, 64);
    const netTex = canvasTex(nc, true, this.aniso); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd0101a, metalness: 0.55, roughness: 0.28 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.2 });
    this.nets = [-1, 1].map((sN) => {
      const grp = new THREE.Group();
      const Pn = (u, v, z) => new THREE.Vector3(sN * (RINK.GOAL_X + u), z, -v);
      const tube = (pts, r, mat) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 10, false), mat); m.castShadow = true; grp.add(m); };
      const cylM = (a, b) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 14), red); seg(m, a, b, new THREE.Vector3(1, 0, 0)); m.castShadow = true; grp.add(m); };
      cylM(Pn(0, -3, 0), Pn(0, -3, 4.1)); cylM(Pn(0, 3, 0), Pn(0, 3, 4.1)); cylM(Pn(0, -3.1, 4), Pn(0, 3.1, 4));
      tube([Pn(0, -3, 0.05), Pn(1.8, -3.1, 0.05), Pn(3.2, -2.1, 0.05), Pn(3.45, 0, 0.05), Pn(3.2, 2.1, 0.05), Pn(1.8, 3.1, 0.05), Pn(0, 3, 0.05)], 0.07, white);
      tube([Pn(0, -3, 3.95), Pn(1.1, -3, 3.88), Pn(1.4, 0, 3.85), Pn(1.1, 3, 3.88), Pn(0, 3, 3.95)], 0.045, white);
      const pos = [], uv = [];
      const quad = (a, b, c, d) => {
        const la = a.distanceTo(b) / 0.38, lb = a.distanceTo(d) / 0.38;
        for (const [p, t] of [[a, [0, 0]], [b, [la, 0]], [c, [la, lb]], [a, [0, 0]], [c, [la, lb]], [d, [0, lb]]]) { pos.push(p.x, p.y, p.z); uv.push(t[0], t[1]); }
      };
      quad(Pn(0, -3, 4), Pn(0, 3, 4), Pn(1.3, 3, 3.85), Pn(1.3, -3, 3.85));
      quad(Pn(1.3, -3, 3.85), Pn(1.3, 3, 3.85), Pn(3.4, 2.2, 0), Pn(3.4, -2.2, 0));
      for (const v of [-1, 1]) quad(Pn(0, v * 3, 0), Pn(0, v * 3, 4), Pn(1.3, v * 3, 3.85), Pn(3.4, v * 2.2, 0));
      const ngeo = new THREE.BufferGeometry();
      ngeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ngeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ngeo.computeVertexNormals();
      const net = new THREE.Mesh(ngeo, netMat); net.renderOrder = 3; grp.add(net);
      // bílá zástěra uvnitř
      const sk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 4.2), white); sk.position.copy(Pn(3.3, 0, 0.35)); grp.add(sk);
      this.scene.add(grp);
      return grp;
    });
  },
  buildPuck() {
    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.13, 24), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.45 }));
    this.puck.castShadow = true; this.scene.add(this.puck);
  },
  buildRings() {
    this.rings = HUMAN_COLORS.map((c) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.2, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
      m.renderOrder = 2; m.visible = false; this.scene.add(m); return m;
    });
  },
  buildGoalLights() {
    this.gLights = [-1, 1].map((sN) => {
      const grp = new THREE.Group(); grp.position.set(sN * (RINK.HL + 0.8), 12.3, 0);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0x222222 })); grp.add(box);
      const mat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a0a, emissiveIntensity: 0, roughness: 0.3 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, TAU, 0, Math.PI / 2), mat); dome.position.y = 0.25; grp.add(dome);
      const pl = new THREE.PointLight(0xff2010, 0, 70, 1.5); pl.position.y = 1; grp.add(pl);
      this.scene.add(grp);
      return { sN, mat, pl };
    });
  },

  // ---------- kvalita, kamera ----------
  applyQuality(name) {
    if (!GFX[name]) name = 'high';
    const first = !this.quality, changedIce = first || GFX[name].ice !== GFX[this.quality].ice;
    this.quality = name;
    const q = GFX[name];
    this.key.castShadow = q.shadow > 0;
    if (q.shadow) { this.key.shadow.mapSize.set(q.shadow, q.shadow); if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; } }
    this.resize();
    this.setReflector(q.refl);
    if (changedIce) this.paintIce();
  },
  setView() {
    const S = Settings.data, view = S.cam === 'side' ? 'side' : 'top';
    const repaint = this.view && this.view !== view;
    this.view = view;
    this.zoomI = clamp(S.zoom == null ? 1 : S.zoom, 0, ZOOMS.length - 1);
    const z = ZOOMS[this.zoomI];
    this.off = view === 'top' ? [-48 * z, 0, 47 * z] : [0, -78 * z, 40 * z];
    if (view === 'top') { VIEW.fx = 1; VIEW.fy = 0; VIEW.rx = 0; VIEW.ry = -1; } else { VIEW.fx = 0; VIEW.fy = 1; VIEW.rx = 1; VIEW.ry = 0; }
    this.glassGroups.forEach((g, i) => { g.grp.visible = !((view === 'top' && i === 0) || (view === 'side' && i === 1)); });
    const clip = view === 'side' ? [this.clipNear] : [];
    for (const m of [this.standMat, this.bodyMat, this.headMat, this.ledMat]) { m.clippingPlanes = clip; m.needsUpdate = true; }
    const sc = this.key.shadow.camera, e = view === 'side' ? 85 : 60 * Math.max(1, z);
    sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.updateProjectionMatrix();
    this.computeLims();
    if (repaint) this.paintIce();
  },
  zoomStep(d) {
    const S = Settings.data;
    S.zoom = clamp((S.zoom == null ? 1 : S.zoom) + d, 0, ZOOMS.length - 1);
    Settings.save(); this.setView();
    this.toast = { text: 'ZOOM: ' + ZOOM_NAMES[S.zoom], t: 1.6 };
  },
  computeLims() {
    if (!this.off) return;
    const [ox, oy, oz] = this.off, d = Math.hypot(ox, oy, oz), hv = d * Math.tan((this.cam.fov * Math.PI) / 360), hh = hv * this.cam.aspect;
    if (this.view === 'top') {
      const pitch = Math.atan2(oz, Math.abs(ox));
      this.limX = Math.max(0, RINK.HL + 4 - hv / Math.sin(pitch) * 0.8); this.limY = Math.max(0, RINK.HW + 5 - hh);
    } else {
      const pitch = Math.atan2(oz, Math.abs(oy));
      this.limX = Math.max(0, RINK.HL + 6 - hh); this.limY = Math.max(0, RINK.HW + 2 - hv / Math.sin(pitch) * 0.8);
    }
  },
  follow(tx, ty, dt, snap, shake) {
    if (this.fail) return;
    tx = clamp(tx, -this.limX, this.limX); ty = clamp(ty * 0.85, -this.limY, this.limY);
    const k = snap ? 1 : Math.min(1, dt * 3.2);
    this.camT.x += (tx - this.camT.x) * k; this.camT.y += (ty - this.camT.y) * k * 0.85;
    const sx = (Math.random() - 0.5) * shake * 1.2, sy = (Math.random() - 0.5) * shake * 1.0;
    const [ox, oy, oz] = this.off;
    this.cam.position.set(this.camT.x + ox + sx, oz + sy, -(this.camT.y + oy));
    this.cam.lookAt(this.camT.x + sx * 0.5, 0, -this.camT.y);
  },
  resize() {
    if (!this.r) return;
    const q = GFX[this.quality || 'high'];
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * q.pr);
    this.r.setSize(window.innerWidth, window.innerHeight, false);
    this.cam.aspect = window.innerWidth / Math.max(1, window.innerHeight); this.cam.updateProjectionMatrix();
    this.computeLims(); this.sizeReflector();
  },
  toScreen(x, y, z) {
    if (this.fail) return null;
    const v = new THREE.Vector3(x, z, -y).project(this.cam);
    if (v.z > 1 || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) return null;
    return R.fromNdc(v.x, v.y);
  },

  // ---------- snímek ----------
  buildModels(g) {
    for (const m of this.models) m.dispose();
    this.models = g.all.map((p) => new PModel(this, p));
    this.modelGame = g;
  },
  render(g, players, pk, t, dt) {
    if (this.fail) return;
    if (g && this.modelGame !== g) this.buildModels(g);
    for (let i = 0; i < this.models.length; i++) if (players[i]) this.models[i].pose(players[i], t);
    this.puck.position.set(pk.x, (pk.z || 0) + 0.07, -pk.y);
    this.puck.visible = !(g && g.puck.held && g.state !== 'replay');
    const used = new Set();
    for (const p of players) if (p.ctrl >= 0 && p.ctrl < 4) { const m = this.rings[p.ctrl]; m.position.set(p.x, 0.04, -p.y); m.visible = true; used.add(p.ctrl); }
    this.rings.forEach((m, i) => { if (!used.has(i)) m.visible = false; });
    for (const L of this.gLights) {
      const on = g && g.goalLight === L.sN && g.goalLightT > 0 && Math.floor(t * 6) % 2 === 0;
      L.mat.emissiveIntensity = on ? 6 : 0.15; L.pl.intensity = on ? 300 : 0;
    }
    const ex = clamp(Sfx.excite * 0.8 + Sfx.roar, 0, 1.2);
    if (ex > 0.25 || this.lastEx > 0.25) this.placeCrowd(t, ex);
    this.lastEx = ex;
    this.ledTex.offset.x = (this.ledTex.offset.x + dt * 0.08) % 1;
    const k = this.key;
    k.target.position.set(this.camT.x, 0, -this.camT.y);
    k.position.set(this.camT.x + 25, 120, -this.camT.y + 30);
    this.r.render(this.scene, this.cam);
  },
};
