'use strict';
// ---------- 3D engine (Three.js / WebGL) ----------
// Souřadnice: hra (x podél kluziště, y napříč, z nahoru, stopy) → three.js (x, z, -y)
const ZOOMS = [0.72, 0.86, 1.0, 1.2, 1.45];
const ZOOM_NAMES = ['VELMI BLÍZKO', 'BLÍZKO', 'STŘEDNÍ', 'DALEKO', 'VELMI DALEKO'];
const GFX = {
  low: { name: 'NÍZKÁ', pr: 0.7, shadow: 0, refl: false, ice: 2048, post: false, wear: false, grass: 0 },
  mid: { name: 'STŘEDNÍ', pr: 1, shadow: 1024, refl: false, ice: 2048, post: false, wear: true, grass: 14 },
  high: { name: 'VYSOKÁ', pr: 1, shadow: 2048, refl: true, ice: 4096, post: true, wear: true, grass: 26 },
};
const GFX_ORDER = ['low', 'mid', 'high'];
// barevné ladění „TV přenos“: kontrast, sytost, vinětace (v lineárním HDR před tone mappingem)
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 1.12);                       // sytost
      c.rgb *= mix(vec3(0.96, 0.99, 1.05), vec3(0.99, 1.0, 1.02), smoothstep(0.05, 0.9, l)); // chladný nádech ledu
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = c;
    }`,
};

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
  setVisible(v) { this.root.visible = v; }
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

// hokejová přilba: hranatější půdorys, plošší temeno, protažená dozadu, týl níž než čelo, lem nad štítem
function hockeyHelmetGeo() {
  const g = new THREE.SphereGeometry(0.135, 40, 22, 0, TAU, 0, Math.PI * 0.64), P = g.attributes.position, r0 = 0.135;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const rh = Math.hypot(x, z);
    if (rh > 1e-6) {
      // superelipsa v půdorysu (n = 3): hranatější boky
      const a = Math.atan2(z, x), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const k = 1 / Math.pow(Math.pow(c, 3) + Math.pow(s, 3), 1 / 3);
      const f = 1 + (k - 1) * 0.55;
      x *= f; z *= f;
    }
    const top = clamp(y / r0, 0, 1);
    y = y * (1 - 0.14 * top * top);                         // plošší temeno
    const back = clamp(-z / r0, 0, 1), low = clamp(-y / r0, 0, 1);
    y -= low * back * 0.05;                                 // týl sahá níž
    z *= 1.1; x *= 1.04;
    if (z > 0 && y > -0.02 && y < 0.03) z += 0.006 * (1 - Math.abs(y - 0.005) / 0.025) * clamp(z / r0, 0, 1); // lem nad štítem
    P.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// klip z motion capture připravený pro ruční vzorkování (kosti podle jména, interpolanty)
function prepClip(a) {
  const tracks = [];
  for (const t of a.tracks) {
    const [bone, path] = t.name.split('.');
    if (path !== 'quaternion') continue;
    tracks.push({ bone, interp: t.createInterpolant() });
  }
  return { duration: a.duration, tracks };
}

const G3 = {
  init(canvas) {
    this.cv = canvas;
    try {
      this.r = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, powerPreference: 'high-performance' });
    } catch (e) { this.fail = true; return false; }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showError('Grafika telefonu to nezvládla (WebGL context lost). Zkus Nastavení → Grafika: NÍZKÁ a načti stránku znovu.'); });
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
    this.modelMap = new Map(); this.modelGame = null; this.teamCache = new Map();
    this.buildShared(); this.buildEnv(); this.buildLights(); this.buildIce(); this.buildBoards(); this.buildStands();
    this.buildNets(); this.buildPuck(); this.buildRings(); this.buildGoalLights(); this.buildWear(); this.buildZamboni();
    this.quality = null;
    this.loadBase();
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
      broom: new THREE.BoxGeometry(0.34, 0.16, 0.95),   // hlavice curlingového koštěte
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
      blade: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }),
      broom: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.85 }),
      cage: new THREE.MeshStandardMaterial({ color: 0x222222, wireframe: true, metalness: 0.8, roughness: 0.3 }),
      whitePlastic: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.35 }),
      tape: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9 }),
      goalieGear: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
    };
    // výstroj pro model s kostrou (metry, bind póza)
    this.hgeo = {
      boot: new THREE.CapsuleGeometry(0.045, 0.16, 4, 12).rotateX(Math.PI / 2).scale(1, 1.35, 1), toeCap: new THREE.SphereGeometry(0.048, 12, 8).scale(0.95, 0.7, 1.1),
      tendon: new THREE.BoxGeometry(0.05, 0.06, 0.03), holder: new THREE.BoxGeometry(0.03, 0.045, 0.29),
      runner: new THREE.BoxGeometry(0.007, 0.035, 0.31),
      helmet: hockeyHelmetGeo(),
      visor: new THREE.SphereGeometry(0.143, 24, 6, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.47, Math.PI * 0.13).scale(1.02, 1, 1.1),
      earGuard: new THREE.BoxGeometry(0.03, 0.07, 0.08),
      glove: new THREE.CapsuleGeometry(0.062, 0.1, 4, 12).rotateZ(Math.PI / 2).scale(1, 1, 1.12), cuff: new THREE.CylinderGeometry(0.078, 0.07, 0.085, 14).rotateZ(Math.PI / 2),
      mask: new THREE.SphereGeometry(0.14, 28, 18).scale(1, 1.1, 1.12),
      cage: new THREE.SphereGeometry(0.147, 14, 8, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.42, Math.PI * 0.34),
      pad: new THREE.BoxGeometry(0.27, 0.64, 0.17), thighPad: new THREE.BoxGeometry(0.25, 0.22, 0.15),
      catcher: new THREE.CylinderGeometry(0.145, 0.13, 0.1, 24).rotateX(Math.PI / 2), catcherCuff: new THREE.BoxGeometry(0.09, 0.17, 0.17),
      blocker: new THREE.BoxGeometry(0.2, 0.3, 0.05), tape: new THREE.BoxGeometry(0.075, 0.24, 0.5),
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
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.55); rim.position.set(90, 40, -70); this.scene.add(rim);
    // rampy světel nad kluzištěm (odrážejí se v ledu, v bloomu září)
    const fix = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.6) }), frame = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.6, metalness: 0.5 });
    const fg = new THREE.BoxGeometry(5.2, 0.5, 2.2), lg = new THREE.PlaneGeometry(4.6, 1.7).rotateX(Math.PI / 2), tg = new THREE.BoxGeometry(150, 0.8, 0.8);
    const fixtures = [];
    for (const z of [-34, -12, 12, 34]) {
      const truss = new THREE.Mesh(tg, frame); truss.position.set(0, 66.5, z); this.scene.add(truss);
      for (let x = -70; x <= 70; x += 14) fixtures.push([x, z]);
    }
    const fi = new THREE.InstancedMesh(fg, frame, fixtures.length), li = new THREE.InstancedMesh(lg, fix, fixtures.length), mm = new THREE.Matrix4();
    fixtures.forEach(([x, z], i) => { mm.makeTranslation(x, 66, z); fi.setMatrixAt(i, mm); mm.makeTranslation(x, 65.7, z); li.setMatrixAt(i, mm); });
    this.scene.add(fi, li);
  },
  // ---------- postprocessing (vysoká kvalita): bloom + ladění + tone mapping ----------
  setPost(on) {
    if (!on || !window.PP) { this.comp = null; return; }
    if (this.comp) return;
    try {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: IS_MOBILE ? 0 : 4 });
      const c = this.comp = new PP.EffectComposer(this.r, rt);
      c.addPass(new PP.RenderPass(this.scene, this.cam));
      this.bloom = new PP.UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 1.6);
      // záře se nepřičítá, ale násobí obrazem: světlé plochy (led, světla) září, hráče a tmavé objekty nepřekrývá závojem
      const bm = this.bloom.blendMaterial;
      if (bm) { bm.blending = THREE.CustomBlending; bm.blendEquation = THREE.AddEquation; bm.blendSrc = THREE.DstColorFactor; bm.blendDst = THREE.OneFactor; bm.blendSrcAlpha = THREE.ZeroFactor; bm.blendDstAlpha = THREE.OneFactor; }
      c.addPass(this.bloom);
      c.addPass(new PP.ShaderPass(GRADE_SHADER));
      c.addPass(new PP.OutputPass());
    } catch (e) { console.warn('postprocessing nejde', e); this.comp = null; }
  },
  // ---------- stopy bruslí a sníh ----------
  buildWear() {
    const W = 2048, H = Math.round(W * 85 / 200);
    const [c, g] = mkCanvas(W, H);
    this.wear = { c, g, ppf: W / 200, dirty: 0, last: new Map(), tex: null, grid: new Uint8Array(100 * 43), dirt0: 0 };
    this.wear.tex = canvasTex(c, true, 4);
    const m = new THREE.MeshStandardMaterial({ map: this.wear.tex, transparent: true, depthWrite: false, roughness: 0.95, color: 0xffffff,
      polygonOffset: true, polygonOffsetFactor: -2 });
    this.wearMesh = new THREE.Mesh(this.iceFlat.clone().rotateX(-Math.PI / 2), m);
    this.wearMesh.position.y = 0.01; this.wearMesh.renderOrder = 2; this.wearMesh.receiveShadow = true;
    this.scene.add(this.wearMesh);
    // částice sněhu
    const N = this.snowN = 500;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('alpha', new THREE.Float32BufferAttribute(new Float32Array(N), 1));
    this.snowP = Array.from({ length: N }, () => ({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 }));
    this.snowI = 0;
    const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: 'attribute float alpha; varying float vA; uniform float uScale; void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uScale * 0.55 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.6), a * 0.85); }' });
    this.snow = new THREE.Points(geo, sm); this.snow.frustumCulled = false; this.snow.renderOrder = 5;
    this.scene.add(this.snow);
  },
  clearWear() { if (!this.wear) return; this.wear.g.clearRect(0, 0, this.wear.c.width, this.wear.c.height); this.wear.tex.needsUpdate = true; this.wear.last.clear(); this.wear.grid.fill(0); },
  // mřížka 2×2 stopy: kde je led ušlapaný (pro procenta úklidu)
  markDirty(x, y) { const i = Math.floor(clamp(x + 100, 0, 199.9) / 2), j = Math.floor(clamp(y + 42.5, 0, 84.9) / 2); this.wear.grid[j * 100 + i] = 1; },
  dirtyCount() { let n = 0; for (const v of this.wear.grid) n += v; return n; },
  cleanPct() { const W = this.wear; if (!W || !W.dirt0) return 100; return clamp(100 * (1 - this.dirtyCount() / W.dirt0), 0, 100); },
  // ---------- rolba ----------
  buildZamboni() {
    const grp = new THREE.Group(), std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.1, ...o });
    const white = std(0xf2f4f7), blue = std(0x1d4fa0), dark = std(0x1b1d22, { roughness: 0.8 }), steel = std(0x9aa3ad, { metalness: 0.8, roughness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb8d0, transparent: true, opacity: 0.35, roughness: 0.05 });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; grp.add(o); return o; };
    // podvozek, zásobník sněhu, pruh, kabina, kondicionér vzadu
    box(15, 2.2, 7, white, 0, 2.2, 0);
    box(15.1, 0.7, 7.1, blue, 0, 2.6, 0);
    box(8.5, 3.6, 6.8, white, -2.6, 5.1, 0);
    box(8.6, 0.5, 6.9, blue, -2.6, 6.9, 0);
    box(2.2, 1.6, 7.6, steel, -8.4, 1.3, 0);
    box(0.6, 0.5, 7.4, dark, -9.6, 0.4, 0);
    box(3.2, 0.4, 3.4, dark, 4.6, 3.5, 1.4);                     // podlaha kabiny
    box(1.2, 1.4, 1.2, dark, 3.8, 4.3, 1.6);                     // sedadlo
    const pillar = (x, z) => box(0.18, 4, 0.18, dark, x, 5.4, z);
    pillar(6.8, 3.3); pillar(6.8, -0.1); pillar(2.0, 3.3); pillar(2.0, -0.1);
    box(5.2, 0.25, 3.8, white, 4.4, 7.45, 1.6);                  // střecha
    const ws = box(0.08, 2.4, 3.3, glass, 6.85, 5.6, 1.6); ws.castShadow = false;
    // řidič
    const drv = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 4, 10), std(0x2a4f8a)); drv.position.set(4.0, 5.4, 1.6); grp.add(drv);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), std(0xd6a184)); head.position.set(4.1, 6.65, 1.6); grp.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 8, 0, TAU, 0, Math.PI / 2), blue); cap.position.set(4.1, 6.75, 1.6); grp.add(cap);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 20), dark); wheel.position.set(5.2, 5.0, 1.6); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.6; grp.add(wheel);
    // kola
    for (const [x, z] of [[5, 3.4], [5, -3.4], [-5, 3.4], [-5, -3.4]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 18).rotateX(Math.PI / 2), dark); w.position.set(x, 1.1, z); grp.add(w);
    }
    // majáček
    this.zamBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, 0.2) }));
    this.zamBeacon.position.set(4.4, 7.8, 1.6); grp.add(this.zamBeacon);
    grp.visible = false; this.scene.add(grp);
    this.zamGrp = grp;
  },
  // kondicionér rolby smaže stopy pod sebou (pás 7,5 stopy za zadní nápravou)
  zamClean(z, dt) {
    const W = this.wear; if (!W) return;
    const rx = z.x - Math.cos(z.dir) * 8.6, ry = z.y - Math.sin(z.dir) * 8.6;
    const prev = this.zamPrev || [rx, ry]; this.zamPrev = [rx, ry];
    const ppf = W.ppf, X = (x) => (x + 100) * ppf, Y = (y) => (42.5 - y) * ppf;
    const steps = Math.max(1, Math.ceil(Math.hypot(rx - prev[0], ry - prev[1]) / 0.5));
    const g = W.g;
    for (let s = 1; s <= steps; s++) {
      const px = prev[0] + (rx - prev[0]) * s / steps, py = prev[1] + (ry - prev[1]) * s / steps;
      g.save(); g.translate(X(px), Y(py)); g.rotate(-z.dir);
      g.clearRect(-0.6 * ppf, -3.8 * ppf, 1.2 * ppf, 7.6 * ppf);
      g.restore();
      // mřížka: buňky pod pásem jsou čisté
      const lx = -Math.sin(z.dir), ly = Math.cos(z.dir);
      for (let k = -3.6; k <= 3.6; k += 0.9) {
        const qx = px + lx * k, qy = py + ly * k, i = Math.floor(clamp(qx + 100, 0, 199.9) / 2), j = Math.floor(clamp(qy + 42.5, 0, 84.9) / 2);
        W.grid[j * 100 + i] = 0;
      }
    }
    this.zamT = (this.zamT || 0) + dt; if (this.zamT > 0.1) { this.zamT = 0; W.tex.needsUpdate = true; }
  },
  spray(x, y, dir, power) {
    for (let i = 0; i < 4 + power * 10; i++) {
      const s = this.snowP[this.snowI]; this.snowI = (this.snowI + 1) % this.snowN;
      const a = dir + (Math.random() - 0.5) * 1.4, v = 6 + Math.random() * 12 * power;
      Object.assign(s, { x: x + (Math.random() - 0.5), y: y + (Math.random() - 0.5), z: 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 2 + Math.random() * 5 * power, life: 0, max: 0.35 + Math.random() * 0.4 });
    }
  },
  updateWear(players, dt, play) {
    const W = this.wear; if (!W || !this.wearMesh.visible) return;
    const g = W.g, ppf = W.ppf, X = (x) => (x + 100) * ppf, Y = (y) => (42.5 - y) * ppf;
    const seen = new Set();
    for (const p of players) {
      const ref = p.ref || p; seen.add(ref);
      if (p.isRef || p.isGoalie && !play) continue;
      const prev = W.last.get(ref), sp = p.spdN || 0;
      W.last.set(ref, { x: p.x, y: p.y, sp, dir: p.dir });
      if (!prev || !play) continue;
      const jump = Math.hypot(p.x - prev.x, p.y - prev.y); if (jump > 6 || jump < 0.05) continue;
      // dvě stopy bruslí, šířka podle rychlosti a fáze kroku
      const lx = -Math.sin(p.dir), ly = Math.cos(p.dir), off = 0.55 + 0.35 * Math.abs(Math.sin(p.stride || 0)) * clamp(sp / 20, 0, 1);
      g.strokeStyle = 'rgba(196,207,220,0.2)'; g.lineWidth = Math.max(1, 0.22 * ppf); g.lineCap = 'round';
      this.markDirty(p.x, p.y);
      for (const sd of [1, -1]) {
        g.beginPath(); g.moveTo(X(prev.x + lx * off * sd), Y(prev.y + ly * off * sd)); g.lineTo(X(p.x + lx * off * sd), Y(p.y + ly * off * sd)); g.stroke();
      }
      // prudké brzdění / ostrá zatáčka: sníh
      const decel = (prev.sp - sp) / Math.max(dt, 1e-3), turn = Math.abs(angDiff(prev.dir, p.dir)) / Math.max(dt, 1e-3);
      if ((decel > 55 && prev.sp > 12) || (turn > 4.5 && sp > 14)) {
        const pw = clamp(Math.max(decel / 120, turn * sp / 120), 0.3, 1);
        this.spray(p.x + Math.cos(p.dir) * 1.2, p.y + Math.sin(p.dir) * 1.2, p.dir + (Math.random() < 0.5 ? 1 : -1) * 1.2, pw);
        const gx = X(p.x + Math.cos(p.dir)), gy = Y(p.y + Math.sin(p.dir)), r = (1.2 + pw * 1.5) * ppf;
        const gg = g.createRadialGradient(gx, gy, 0, gx, gy, r); gg.addColorStop(0, 'rgba(240,244,248,0.35)'); gg.addColorStop(1, 'rgba(240,244,248,0)');
        g.fillStyle = gg; g.fillRect(gx - r, gy - r, 2 * r, 2 * r);
      }
    }
    for (const k of W.last.keys()) if (!seen.has(k)) W.last.delete(k);
    W.dirty += dt; if (W.dirty > 0.25) { W.dirty = 0; W.tex.needsUpdate = true; }
  },
  updateSnow(dt) {
    if (!this.snow) return;
    const pos = this.snow.geometry.attributes.position, al = this.snow.geometry.attributes.alpha;
    for (let i = 0; i < this.snowN; i++) {
      const s = this.snowP[i];
      if (s.life < s.max) {
        s.life += dt; s.vz -= 30 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z = Math.max(0.05, s.z + s.vz * dt);
        s.vx *= 1 - 3 * dt; s.vy *= 1 - 3 * dt;
      }
      pos.setXYZ(i, s.x, s.z, -s.y); al.setX(i, s.life < s.max ? 1 - s.life / s.max : 0);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
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
  // obrázek do textur povrchu (gfx/…): vrátí ho, až je načtený; po načtení se povrch jednou přemaluje
  gimg(src) {
    const c = this.gim || (this.gim = {});
    if (!c[src]) { const im = c[src] = new Image(); im.onload = () => { clearTimeout(this.gimT); this.gimT = setTimeout(() => { if (this.fail || !this.iceMat) return; if (this.fbOn) this.paintPitch(); else this.paintIce(); }, 60); }; im.src = src; }
    return c[src].complete && c[src].naturalWidth ? c[src] : null;
  },
  // opakovaná textura přes celé plátno (násobením), dlaždice široká `feet` stop
  gtile(g, src, feet, ppf, W, H, alpha) {
    const im = this.gimg(src); if (!im) return;
    const s = feet * ppf / im.naturalWidth; g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = alpha; g.scale(s, s); g.fillStyle = g.createPattern(im, 'repeat'); g.fillRect(0, 0, W / s, H / s); g.restore();
  },
  paintIce() {
    if (this.fbOn) this.paintPitch();   // při změně kvality grafiky se přemaluje i trávník
    if (this.sportOn === 'curling') return this.paintCurl();
    this.iceMat.clearcoat = 0.65;
    const W = GFX[this.quality].ice, ppf = W / 200, H = Math.round(85 * ppf);
    const [c, g] = mkCanvas(W, H), [rc, gr] = mkCanvas(W / 2, Math.round(H / 2));
    const X = (x) => (x + 100) * ppf, Y = (y) => (42.5 - y) * ppf;
    const rnd = mulberry32(1998);
    g.fillStyle = 'rgb(242,247,251)'; g.fillRect(0, 0, W, H);
    // jemná struktura ledu z fotografické textury (gfx/ice-detail.jpg, dlaždice 32 stop): rýhy po bruslích a sněhový poprašek
    if (!this.iceDet) { this.iceDet = new Image(); this.iceDet.onload = () => { if (this.iceMat && !this.fail) this.paintIce(); }; this.iceDet.src = 'gfx/ice-detail.jpg'; }
    if (this.iceDet.complete && this.iceDet.naturalWidth) { const s = 32 * ppf / this.iceDet.naturalWidth; g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.9; g.scale(s, s); g.fillStyle = g.createPattern(this.iceDet, 'repeat'); g.fillRect(0, 0, W / s, H / s); g.restore(); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, 0, W, H); }
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
    const hl = typeof LOGOS !== 'undefined' && LOGOS[this.homeAbbr];
    if (hl) g.drawImage(hl, -8.2 * ppf, -8.2 * ppf, 16.4 * ppf, 16.4 * ppf);   // logo domácího týmu
    else { g.fillStyle = '#0a2a6b'; g.font = `italic 900 ${4.4 * ppf}px "Arial Black","DejaVu Sans",sans-serif`; g.fillText('HOKEJ', 0, -1.2 * ppf);
      g.fillStyle = '#c8202e'; g.font = `italic 900 ${3.4 * ppf}px "Arial Black","DejaVu Sans",sans-serif`; g.fillText("'98", 0, 3.2 * ppf); }
    g.restore();
    // reklamy namalované v ledu (gfx/ice1–6.jpg): čtyři ve středním pásmu, po jedné v každém obranném
    [[-15, 30], [15, 30], [-15, -30], [15, -30], [-47, 0], [47, 0]].forEach(([ax, ay], i) => {
      const im = this.gimg('gfx/ice' + (i + 1) + '.jpg'); if (!im) return;
      const w = 13 * ppf, h = w * im.naturalHeight / im.naturalWidth;
      g.save(); g.translate(X(ax), Y(ay)); g.rotate(this.view === 'side' ? 0 : Math.PI / 2); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.8; g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
    });
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
    const AW = IS_MOBILE ? 4096 : 8192;
    const [ac, ag] = mkCanvas(AW, 128), ppf = AW / P;
    ag.fillStyle = "#f4f5f6"; ag.fillRect(0, 0, AW, 128);
    const rnd = mulberry32(7);
    let k = 0; const adSlots = [];
    for (let s = 3; s < P - 12; s += 15, k++) {
      if (k % 3 === 2) { adSlots.push(s * ppf); continue; }
      const [txt, bg, fg] = [['ŽENISTA', '#c8102e', '#fff'], ['LEDOVÁ LIGA', '#0a2a6b', '#ffd21f'], ['PUK MART', '#ffd21f', '#111'],
        ['ICE COLA', '#b00020', '#fff'], ['BRUSLE+', '#111', '#2ee6ff'], ["HOKEJ '98", '#1f3f7a', '#fff'],
        ['PIZZA RÁJ', '#0b6e3a', '#fff'], ['LEDŇÁK', '#e6e6e6', '#0a2a6b'], ['ZIMÁK FM', '#5b2c83', '#fff']][k % 9];
      const x0 = s * ppf, w = 12 * ppf;
      ag.fillStyle = bg; ag.fillRect(x0, 14, w, 100);
      ag.fillStyle = fg; ag.font = 'italic 900 70px "Arial Black","DejaVu Sans",sans-serif'; ag.textAlign = 'center'; ag.textBaseline = 'middle';
      const tw = ag.measureText(txt).width; ag.save(); ag.translate(x0 + w / 2, 66); ag.scale(Math.min(1, (w - 20) / tw), 1); ag.fillText(txt, 0, 0); ag.restore();
    }
    for (let i = 0; i < 900; i++) { ag.fillStyle = `rgba(20,20,20,${0.1 + rnd() * 0.35})`; ag.beginPath(); ag.arc(rnd() * AW, 70 + rnd() * 55, 1 + rnd() * 3, 0, TAU); ag.fill(); }
    const adTex = canvasTex(ac, true, this.aniso);
    // do volných polí mantinelu obrázkové reklamy smyšlených značek (gfx/ad1–4.jpg)
    const adI = { h: [1, 2, 3, 4].map((i) => 'gfx/ad' + i + '.jpg'), f: [1, 2, 3, 4, 5, 6, 7].map((i) => 'gfx/fb' + i + '.jpg') }, adC = {};
    this.adPaint = () => { const L = adI[this.sportOn === 'football' ? 'f' : 'h']; adSlots.forEach((x0, j) => { const im = adC[L[j % L.length]]; if (im && im.complete && im.naturalWidth) ag.drawImage(im, x0, 14, 12 * ppf, 100); }); adTex.needsUpdate = true; };   // fotbal má vlastní sadu
    for (const s of adI.h.concat(adI.f)) { const im = adC[s] = new Image(); im.onload = this.adPaint; im.src = s; }
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
    // diváci při gólu vyskakují ze sedadel (každý jinak, podle svého místa)
    this.cheerU = { uCheer: { value: 0 }, uCT: { value: 0 } };
    for (const m of [this.bodyMat, this.headMat]) m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.cheerU);
      sh.vertexShader = 'uniform float uCheer; uniform float uCT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  float ch = fract(instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61); transformed.y += uCheer * (0.45 + 0.75 * abs(sin(uCT * (7.0 + ch * 5.0) + ch * 40.0))) * step(0.25, ch);');
    };
    // diváci jako ploché postavy z atlasu gfx/fans.png (8×2), natočené do hlediště; šedé oblečení se barví barvou sedadla (dresy fanoušků)
    const fanTex = new THREE.TextureLoader().load('gfx/fans.png'); fanTex.colorSpace = THREE.SRGBColorSpace; fanTex.anisotropy = this.aniso;
    Object.assign(this.bodyMat, { map: fanTex, alphaTest: 0.5, side: THREE.DoubleSide });
    const ob = this.bodyMat.onBeforeCompile;
    this.bodyMat.onBeforeCompile = (sh) => {
      ob(sh);
      sh.vertexShader = 'attribute float aCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vec2((mod(aCell, 8.0) + uv.x) / 8.0, (1.0 - floor(aCell / 8.0) + uv.y) / 2.0);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '{ float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));\n  float gk = step(mx - mn, 0.07) * smoothstep(0.28, 0.4, mx) * (1.0 - smoothstep(0.74, 0.86, mx)); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vColor.rgb * 2.1, gk); }');
    };
    const fg = new THREE.PlaneGeometry(1.8, 2.7); fg.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(seats.map(() => Math.floor(rnd() * 16))), 1));
    this.bodies = new THREE.InstancedMesh(fg, this.bodyMat, seats.length);
    this.heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.37, 0), this.headMat, seats.length);
    const col = new THREE.Color();
    this.seatCol = seats.map(() => pal[Math.floor(rnd() * pal.length)]); this.seatFan = seats.map(() => rnd());
    seats.forEach((_, i) => { col.set(this.seatCol[i]); this.bodies.setColorAt(i, col); });
    this.heads.visible = false;
    this.placeCrowd(0, 0);
    this.scene.add(this.bodies, this.heads);
  },
  placeCrowd(t, ex) {
    const m4 = this.m4 || (this.m4 = new THREE.Matrix4()), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    this.seats.forEach(([x, y, z, ph, s], i) => {
      const b = ex > 0.25 ? Math.max(0, Math.sin(t * 11 + ph)) * ex * 1.1 : 0;
      sc.set(s, s, s);
      q.setFromAxisAngle(_Y, Math.atan2(-x * 0.3, y));
      p.set(x, z + 1.3 * s + b, -y); m4.compose(p, q, sc); this.bodies.setMatrixAt(i, m4);
      p.y += 1.2 * s; m4.compose(p, q, sc); this.heads.setMatrixAt(i, m4);
    });
    this.bodies.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true;
  },

  // ---------- branky ----------
  buildNets() {
    const [nc, ng] = mkCanvas(64, 64);
    ng.strokeStyle = 'rgba(255,255,255,0.95)'; ng.lineWidth = 4; ng.strokeRect(0, 0, 64, 64);
    const netTex = canvasTex(nc, true, this.aniso); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = this.netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
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
  // ---------- fotbal: branky, míč, trávník ----------
  buildFootNets() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35, metalness: 0.1 }), W = 5, Hh = 6.5, Dp = 3.4;
    this.fnets = [-1, 1].map((sN) => {
      const grp = new THREE.Group(), Pn = (u, v, z) => new THREE.Vector3(sN * (RINK.GOAL_X + u), z, -v);
      const bar = (a, b) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 14), white); seg(m, a, b, new THREE.Vector3(1, 0, 0)); m.castShadow = true; grp.add(m); };
      bar(Pn(0, -W, 0), Pn(0, -W, Hh)); bar(Pn(0, W, 0), Pn(0, W, Hh)); bar(Pn(0, -W - 0.2, Hh), Pn(0, W + 0.2, Hh));
      const pos = [], uv = [];
      const quad = (a, b, c, d) => { const la = a.distanceTo(b) / 0.5, lb = a.distanceTo(d) / 0.5; for (const [p, t] of [[a, [0, 0]], [b, [la, 0]], [c, [la, lb]], [a, [0, 0]], [c, [la, lb]], [d, [0, lb]]]) { pos.push(p.x, p.y, p.z); uv.push(t[0], t[1]); } };
      quad(Pn(0, -W, Hh), Pn(0, W, Hh), Pn(Dp * 0.5, W, Hh), Pn(Dp * 0.5, -W, Hh));
      quad(Pn(Dp * 0.5, -W, Hh), Pn(Dp * 0.5, W, Hh), Pn(Dp, W, 0), Pn(Dp, -W, 0));
      for (const v of [-1, 1]) { quad(Pn(0, v * W, 0), Pn(0, v * W, Hh), Pn(Dp * 0.5, v * W, Hh), Pn(Dp, v * W, 0)); }
      const ngeo = new THREE.BufferGeometry();
      ngeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ngeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ngeo.computeVertexNormals();
      const net = new THREE.Mesh(ngeo, this.netMat); net.renderOrder = 3; grp.add(net);
      this.scene.add(grp); return grp;
    });
    // míč: bílý s tmavými poli
    const [bc, bg] = mkCanvas(128, 64); bg.fillStyle = '#f6f6f6'; bg.fillRect(0, 0, 128, 64); bg.fillStyle = '#1b1b1f';
    for (const [x, y] of [[16, 16], [48, 44], [80, 14], [112, 46], [64, 30], [0, 44], [128, 44]]) { bg.beginPath(); bg.arc(x, y, 9, 0, TAU); bg.fill(); }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), new THREE.MeshStandardMaterial({ map: canvasTex(bc, true, 4), roughness: 0.5 }));
    this.ball.castShadow = true; this.ball.visible = false; this.scene.add(this.ball);
  },
  // ---------- curling: kameny a dráha s terčem ----------
  buildStones() {
    const gran = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.3, metalness: 0.15 }), dark = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.5 });
    const body = new THREE.CylinderGeometry(0.48, 0.42, 0.3, 28), band = new THREE.CylinderGeometry(0.485, 0.485, 0.09, 28), cap = new THREE.CylinderGeometry(0.36, 0.38, 0.07, 24), grip = new THREE.BoxGeometry(0.46, 0.09, 0.12), post = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8);
    this.stoneM = [];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group(), col = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 });
      const add = (geo, mat, y, x = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); };
      add(body, gran, 0.17); add(band, dark, 0.17); add(cap, col, 0.355); add(post, col, 0.45, -0.14); add(grip, col, 0.55, 0.02);
      g.userData.col = col; g.visible = false; this.scene.add(g); this.stoneM.push(g);
    }
  },
  paintCurl() {
    const W = GFX[this.quality].ice, ppf = W / 200, H = Math.round(85 * ppf);
    const [c, g] = mkCanvas(W, H), [rc, gr] = mkCanvas(W / 2, Math.round(H / 2));
    const X = (x) => (x + 100) * ppf, Y = (y) => (42.5 - y) * ppf, C = CURL, rnd = mulberry32(7);
    g.fillStyle = '#9fb0c4'; g.fillRect(0, 0, W, H);                                         // led mimo dráhu
    g.fillStyle = '#e8eef5'; g.fillRect(X(C.HACK - 8), Y(C.HW), (C.BACK + 8 - C.HACK + 2) * ppf, 2 * C.HW * ppf);   // dráha
    this.gtile(g, 'gfx/curl-ice.jpg', 16, ppf, W, H, 1);   // kropený led
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.25})`; g.beginPath(); g.arc(X(C.HACK - 8 + rnd() * (C.BACK - C.HACK + 16)), Y((rnd() * 2 - 1) * C.HW), 0.12 * ppf, 0, TAU); g.fill(); }   // kapičky („pebble")
    const ring = (x, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Y(0), r * ppf, 0, TAU); g.fill(); };
    for (const x of [C.TEE, -C.TEE]) { ring(x, 6, '#1d5fc4'); ring(x, 4, '#e8eef5'); ring(x, 2, '#d12a2a'); ring(x, 0.5, '#e8eef5'); }
    const vline = (x, w, col) => { g.fillStyle = col; g.fillRect(X(x) - w * ppf / 2, Y(C.HW), w * ppf, 2 * C.HW * ppf); };
    vline(C.HOG1, 0.33, '#d12a2a'); vline(C.HOG2, 0.33, '#d12a2a');
    for (const x of [C.TEE, -C.TEE, C.BACK, -C.BACK]) vline(x, 0.08, '#20242c');
    g.fillStyle = '#20242c'; g.fillRect(X(-C.BACK - 6), Y(0) - 0.04 * ppf, (2 * C.BACK + 12) * ppf, 0.08 * ppf);       // středová čára
    g.strokeStyle = '#20242c'; g.lineWidth = Math.max(1.5, 0.12 * ppf); g.strokeRect(X(C.HACK - 8), Y(C.HW), (C.BACK + 8 - C.HACK + 2) * ppf, 2 * C.HW * ppf);
    g.fillStyle = '#20242c'; for (const v of [-0.6, 0.6]) g.fillRect(X(C.HACK) - 0.4 * ppf, Y(v) - 0.25 * ppf, 0.8 * ppf, 0.5 * ppf);   // odrazové bloky
    gr.fillStyle = 'rgb(170,170,170)'; gr.fillRect(0, 0, rc.width, rc.height);   // kropený led je matný: žádné odlesky světel (dělaly nad dráhou „mlhu“)
    this.iceMat.clearcoat = 0;
    if (this.iceMat.map) { this.iceMat.map.dispose(); this.iceMat.roughnessMap.dispose(); }
    this.iceMat.map = canvasTex(c, true, this.aniso); this.iceMat.roughnessMap = canvasTex(rc, false, this.aniso); this.iceMat.needsUpdate = true;
  },
  // přepnutí sportu: povrch, branky, míč; hala a tribuny zůstávají
  setSport(sport) {
    if (this.sportOn === sport) return;
    this.sportOn = sport;
    const fb = this.fbOn = sport === 'football' || sport === 'polo';   // hraje se na vlastní ploše (trávník / voda), ne na ledě
    if (fb && !this.fnets) this.buildFootNets();
    this.nets.forEach((n) => (n.visible = sport === 'hockey'));
    if (this.fnets) this.fnets.forEach((n) => { n.visible = fb; n.scale.y = sport === 'polo' ? 3 / 6.5 : 1; });
    if (this.ball) this.ball.material.color.set(sport === 'polo' ? 0xffd640 : 0xffffff);
    const q = GFX[this.quality || 'high'];
    if (fb) this.paintPitch(); else this.paintIce();
    this.setReflector(q.refl && sport === 'hockey'); this.wearMesh.visible = q.wear && sport === 'hockey'; this.clearWear();
    this.ice.visible = !fb; this.pitch && (this.pitch.visible = fb);
    if (this.adPaint) this.adPaint();
    this.zoomMul = sport === 'football' ? 0.74 : 1; if (this.off) this.setView();   // fotbalisté jsou menší (větší hřiště), kamera o to blíž
    if (this.ball) this.ball.scale.setScalar(sport === 'football' ? 0.68 : 1);
  },
  // trávník: vlastní plocha s texturou (pruhy po sekání, ošlapaná místa, čáry) a jemnou strukturou stébel
  buildPitch() {
    // dlaždicová textura stébel (dlaždice asi 6 stop): tmavé kořeny, přes ně tisíce stébel od tmavých po světlé nažloutlé špičky;
    // průměr je šedá, takže barvu trávníku jen násobí; slouží i jako reliéf
    const DS = 512, [dc, dg] = mkCanvas(DS, DS), rnd = mulberry32(77);
    dg.fillStyle = 'rgb(84,92,74)'; dg.fillRect(0, 0, DS, DS); dg.lineCap = 'round';
    for (let i = 0; i < 15000; i++) {
      const x = rnd() * DS, y = rnd() * DS, l = 10 + rnd() * 26, a = (rnd() - 0.5) * 2.6, k = i / 15000, v = 0.55 + k * 0.5 + rnd() * 0.45;   // pozdější stébla jsou výš = světlejší
      const yel = rnd() < 0.12 ? 1.18 : 1, col = `rgb(${Math.min(255, Math.round(118 * v * yel))},${Math.min(255, Math.round(128 * v))},${Math.round(96 * v / yel)})`;
      for (const [ox, oy] of [[0, 0], [DS, 0], [-DS, 0], [0, DS], [0, -DS]]) {
        const x0 = x + ox, y0 = y + oy, mx = x0 + Math.sin(a) * l * 0.6 + (rnd() - 0.5) * 3, my = y0 - Math.cos(a) * l * 0.6, x1 = x0 + Math.sin(a * 1.3) * l, y1 = y0 - Math.cos(a * 1.3) * l;
        if (Math.max(x0, x1) < -4 || Math.min(x0, x1) > DS + 4 || Math.max(y0, y1) < -4 || Math.min(y0, y1) > DS + 4) continue;
        dg.strokeStyle = col; dg.lineWidth = 2.6; dg.beginPath(); dg.moveTo(x0, y0); dg.lineTo(mx, my); dg.stroke();
        dg.lineWidth = 1.4; dg.beginPath(); dg.moveTo(mx, my); dg.lineTo(x1, y1); dg.stroke();
      }
    }
    const det = this.pitchDet = canvasTex(dc, false, this.aniso); det.wrapS = det.wrapT = THREE.RepeatWrapping;
    const bump = canvasTex(dc, false, this.aniso); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(200 / 6, 85 / 6);
    const m = this.pitchMat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, bumpMap: bump, bumpScale: 1.6, envMapIntensity: 0.12 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uDet = { value: det }; sh.uniforms.uDetK = m.userData.detK = { value: 1 }; sh.uniforms.uDetO = m.userData.detO = { value: new THREE.Vector2() };
      sh.uniforms.uPud = m.userData.pud; sh.uniforms.uMole = m.userData.mole;
      sh.uniforms.uWet = m.userData.wet; sh.uniforms.uHalf = { value: new THREE.Vector3(RINK.GOAL_X, FB.HW, 2 * RINK.GOAL_X / 12) };
      sh.uniforms.uT = m.userData.wT; sh.uniforms.uWat = m.userData.wOn; sh.uniforms.uRip = m.userData.rip;
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      // stébla: jemná struktura zblízka a hrubší skvrny z dálky (ať tráva není jednolitá plocha)
      // voda: vlny jako součet postupných vln (sklon hladiny wS), lom dna, kaustiky, kruhy a pěna kolem plavců
      sh.fragmentShader = `uniform sampler2D uDet; uniform float uDetK; uniform vec2 uDetO; uniform float uT; uniform float uWat; uniform vec3 uRip[14]; varying vec3 vWp; uniform float uWet; uniform vec3 uHalf; uniform vec4 uPud[8]; uniform vec3 uMole[4];
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }
float wH(vec2 p) {
  p += 0.7 * vec2(sin(p.y * 0.31 + uT * 0.4), cos(p.x * 0.27 - uT * 0.35));
  return sin(dot(p, vec2(0.9, 0.35)) * 0.55 + uT * 1.3) * 0.5 + sin(dot(p, vec2(-0.4, 0.8)) * 0.9 + uT * 1.7) * 0.3 + sin(dot(p, vec2(0.6, -0.75)) * 1.7 + uT * 2.3) * 0.16
    + sin(dot(p, vec2(-0.85, -0.3)) * 3.1 + uT * 3.1) * 0.08 + sin(dot(p, vec2(0.2, 1.0)) * 5.3 - uT * 3.9) * 0.045;
}
` + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (uWat > 0.5) normal = normalize((viewMatrix * vec4(normalize(vec3(-wS.x * 0.26, 1.0, -wS.y * 0.26)), 0.0)).xyz);
  if (pMask > 0.0) {
    // hladina kaluže: rovná, s kruhy od dopadajících kapek
    vec2 rp = vWp.xz, rc = floor(rp * 0.7), cc = (rc + 0.5 + (vec2(gh(rc), gh(rc + 7.3)) - 0.5) * 0.6) / 0.7, dv = rp - cc;
    float rph = fract(uT * 0.9 + gh(rc + 3.1)), dl = length(dv) + 0.001, rr = sin((dl - rph * 1.2) * 14.0) * smoothstep(0.25, 0.0, abs(dl - rph * 1.2)) * (1.0 - rph);
    normal = normalize(mix(normal, normalize((viewMatrix * vec4(normalize(vec3(-dv.x / dl * rr * 0.1, 1.0, -dv.y / dl * rr * 0.1)), 0.0)).xyz), pMask));
  }`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(roughnessFactor, 0.45, pWet * 0.6), 0.04, smoothstep(0.5, 1.0, pMask));').replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular * (1.0 + 6.0 * smoothstep(0.5, 1.0, pMask)), vec3(0.3 - 0.17 * pMask)); reflectedLight.directSpecular *= 1.0 - 0.75 * pMask;').replace('#include <map_fragment>',
        `#include <map_fragment>
  vec2 wS = vec2(0.0); float pMask = 0.0, pWet = 0.0, pDeep = 0.0;
  if (uWat > 0.5) {
    vec2 wp = vWp.xz; float we = 0.2, foam = 0.0;
    wS = vec2(wH(wp + vec2(we, 0.0)) - wH(wp - vec2(we, 0.0)), wH(wp + vec2(0.0, we)) - wH(wp - vec2(0.0, we))) / (2.0 * we);
    for (int i = 0; i < 14; i++) {
      vec2 v = wp - uRip[i].xy; float d = length(v) + 0.001, s = uRip[i].z;
      wS += v / d * cos(d * 3.4 - uT * 7.0) * exp(-d * 0.42) * s * 0.9;
      foam += s * smoothstep(1.7, 0.5, d);
    }
    vec3 bot = texture2D(map, vMapUv + wS * 0.0035).rgb;
    float ca = pow(clamp(1.0 - abs(wH(wp * 2.1 + 11.0)) * 1.5, 0.0, 1.0), 5.0) + pow(clamp(1.0 - abs(wH(wp.yx * 1.6 - 5.0)) * 1.5, 0.0, 1.0), 6.0);
    bot *= 0.9 + 0.1 * wH(wp);
    bot += ca * 0.065 * vec3(0.7, 0.95, 1.0);
    float crest = smoothstep(1.15, 1.75, length(wS));
    diffuseColor.rgb = mix(bot, vec3(0.93, 0.98, 1.0), clamp(foam * 0.5 * (0.6 + 0.4 * sin(wp.x * 9.0 + wp.y * 7.0 + uT * 5.0)) + crest * 0.25, 0.0, 0.8));
  }

  if (uWat < 0.5 && uDetK > 0.5) {
    // živý trávník: nestejně hustá a zelená místa, sušší skvrny, trsy; pruhy po sekání se lesknou podle směru pohledu
    vec2 gp = vWp.xz; float m1 = gn(gp * 0.09) * 0.5 + gn(gp * 0.23) * 0.3 + gn(gp * 0.7) * 0.2;
    diffuseColor.rgb *= mix(vec3(0.7, 0.8, 0.62), vec3(1.2, 1.14, 1.0), smoothstep(0.25, 0.75, m1));
    // stébla: dlaždice 6 stop, v každém druhém pruhu po sekání položená opačně; druhá, větší a pootočená vrstva ruší opakování
    float gpar = mod(floor((gp.x + uHalf.x) / uHalf.z), 2.0) * 2.0 - 1.0;
    vec3 dA = texture2D(uDet, vMapUv * vec2(200.0 / 6.0, 85.0 / 6.0 * gpar)).rgb, dB = texture2D(uDet, mat2(0.8, -0.6, 0.6, 0.8) * gp / 17.0 + 0.37).rgb;
    diffuseColor.rgb *= dA * 2.0 * (0.55 + 0.9 * dB.g);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.28, 1.12, 0.66), smoothstep(0.6, 0.85, gn(gp * 0.05 + 9.0)) * 0.3);
    diffuseColor.rgb *= 0.82 + 0.36 * gn(gp * 2.3) * gn(gp * 5.9 + 4.0) * 2.0;
    if (abs(gp.x) < uHalf.x && abs(gp.y) < uHalf.y) {
      float par = mod(floor((gp.x + uHalf.x) / uHalf.z), 2.0) * 2.0 - 1.0; vec2 vd = normalize(cameraPosition.xz - gp);
      diffuseColor.rgb *= 1.0 + 0.075 * par * (0.35 + 0.65 * vd.x);
    }
    diffuseColor.rgb *= 1.0 - 0.2 * uWet;
    // kaluže: nepravidelný obrys, nasáklá tráva kolem, uvnitř tmavé bláto pod hladinou (lesk a odrazy níže)
    for (int i = 0; i < 8; i++) {
      if (uPud[i].z <= 0.0) continue;
      vec2 pv = gp - uPud[i].xy; float pa = atan(pv.y, pv.x), pd = length(pv) / uPud[i].z;
      pd *= 1.0 + 0.2 * sin(pa * 3.0 + uPud[i].w) + 0.11 * sin(pa * 5.0 - uPud[i].w * 1.7);
      pd += (gn(gp * 0.9 + uPud[i].w) - 0.5) * 0.35;
      pWet = max(pWet, smoothstep(1.6, 0.9, pd));
      float pm = smoothstep(1.0, 0.78, pd), pdp = smoothstep(0.95, 0.35, pd);
      pm *= 1.0 - smoothstep(0.35, 0.9, gn(gp * 3.0)) * (1.0 - pdp) * 0.8;   // u břehu z vody vyčnívají trsy
      pMask = max(pMask, pm); pDeep = max(pDeep, pdp * pm);
    }
    // voda stojící v trávě: u okraje tráva prosvítá, ke středu tmavne; žádné bláto, ať kaluž ladí s trávníkem
    vec3 gcol = diffuseColor.rgb;
    diffuseColor.rgb = mix(gcol, gcol * vec3(0.62, 0.68, 0.56), pWet * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(gcol * 0.6, gcol * 0.3 + vec3(0.025, 0.04, 0.045), pDeep), pMask);
    // rozházená hlína kolem krtinců
    for (int i = 0; i < 4; i++) {
      if (uMole[i].z <= 0.0) continue;
      float md = length(gp - uMole[i].xy), ms = smoothstep(2.4, 0.8, md) * uMole[i].z * step(0.5, gn(gp * 5.0 + 3.0) * gn(gp * 11.0) * 2.2 + smoothstep(1.5, 0.7, md) * 0.7);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.135, 0.085) * (0.7 + 0.6 * gn(gp * 9.0)), ms);
    }
  }`);
    };
    m.userData.wet = { value: 0 }; m.userData.pud = { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }; m.userData.mole = { value: Array.from({ length: 4 }, () => new THREE.Vector3()) };
    m.userData.wT = { value: 0 }; m.userData.wOn = { value: 0 }; m.userData.rip = { value: Array.from({ length: 14 }, () => new THREE.Vector3()) };
    this.pitch = new THREE.Mesh(this.ice.geometry, m); this.pitch.receiveShadow = true; this.pitch.renderOrder = 1; this.pitch.visible = false;
    this.scene.add(this.pitch);
  },
  // bazén pro vodní pólo: voda s dlaždicemi na dně, vyznačené hřiště (branková čára, 2 m, 5 m, půlka)
  paintPool() {
    const W = GFX[this.quality].ice, ppf = W / 200, H = Math.round(85 * ppf);
    const [c, g] = mkCanvas(W, H), X = (x) => (x + 100) * ppf, Y = (y) => (42.5 - y) * ppf, GX = RINK.GOAL_X, HW = FB.HW, rnd = mulberry32(31);
    const bgd = g.createLinearGradient(0, 0, 0, H); bgd.addColorStop(0, '#1f7fb6'); bgd.addColorStop(0.5, '#2a96cc'); bgd.addColorStop(1, '#1f7fb6');
    g.fillStyle = bgd; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;                                   // dlaždice na dně
    for (let x = -100; x <= 100; x += 4) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (let y = -42; y <= 42; y += 4) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); }
    for (let i = 0; i < 420; i++) {                                                               // odlesky světla ve vodě
      const x = rnd() * W, y = rnd() * H, r = (2 + rnd() * 7) * ppf, q = g.createRadialGradient(x, y, 0, x, y, r);
      q.addColorStop(0, `rgba(190,235,255,${0.05 + rnd() * 0.09})`); q.addColorStop(1, 'rgba(190,235,255,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    this.gtile(g, 'gfx/pool.jpg', 44, ppf, W, H, 0.55);   // dlaždice na dně
    g.fillStyle = 'rgba(8,40,80,0.35)';                                                           // hloubka mimo hřiště
    g.fillRect(0, 0, X(-GX), H); g.fillRect(X(GX), 0, W, H); g.fillRect(0, 0, W, Y(HW)); g.fillRect(0, Y(-HW), W, H);
    // plovoucí lana kolem hřiště: bílá, u branek červená (2 m) a žlutá (5 m)
    const rope = (x0, y0, x1, y1, col) => { g.strokeStyle = col; g.lineWidth = Math.max(2, 0.55 * ppf); g.setLineDash([1.4 * ppf, 0.6 * ppf]); g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); g.setLineDash([]); };
    for (const v of [-HW, HW]) { rope(-GX, v, GX, v, '#f1f4f6'); for (const s of [-1, 1]) { rope(s * GX, v, s * (GX - 6.5), v, '#e2362f'); rope(s * (GX - 6.5), v, s * (GX - 16), v, '#f5cf2e'); } }
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1.5, 0.3 * ppf);
    for (const x of [0, -GX, GX]) { g.beginPath(); g.moveTo(X(x), Y(HW)); g.lineTo(X(x), Y(-HW)); g.stroke(); }
    g.strokeStyle = 'rgba(245,207,46,0.4)'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(s * (GX - 16)), Y(HW)); g.lineTo(X(s * (GX - 16)), Y(-HW)); g.stroke(); }
    if (this.pitchMat.map) this.pitchMat.map.dispose();
    this.pitchMat.map = canvasTex(c, true, this.aniso); this.pitchMat.needsUpdate = true;
  },
  paintPitch() {
    if (!this.pitch) this.buildPitch();
    // povrch podle sportu: voda je hladká a lesklá, tráva matná
    const water = this.sportOn === 'polo', pm = this.pitchMat;
    pm.roughness = water ? 0.07 : 0.93; pm.envMapIntensity = water ? 1.1 : 0.12; pm.bumpScale = water ? 0 : 1.6;
    if (pm.userData.detK) pm.userData.detK.value = water ? 0 : 1;
    pm.userData.wOn.value = water ? 1 : 0;
    this.pitchWater = water;
    if (water) return this.paintPool();
    const W = GFX[this.quality].ice, ppf = W / 200, H = Math.round(85 * ppf);
    const [c, g] = mkCanvas(W, H);
    const X = (x) => (x + 100) * ppf, Y = (y) => (42.5 - y) * ppf, GX = RINK.GOAL_X, HW = FB.HW, rnd = mulberry32(2024);
    // výběh kolem hřiště: tmavší umělý povrch
    g.fillStyle = '#243c22'; g.fillRect(0, 0, W, H);
    // pruhy po sekání: podélné pásy a slabší příčné (šachovnice jako na stadionech)
    const nx = 12, bw = 2 * GX / nx, ny = 5, bh = 2 * HW / ny;
    for (let i = 0; i < nx; i++) for (let k = 0; k < ny; k++) {
      const a = i % 2, b = k % 2, l = 0.5 + (a ? 0.025 : -0.025) + (b ? 0.03 : -0.03);
      g.fillStyle = `rgb(${Math.round(80 * l * 1.55)},${Math.round(122 * l * 1.55)},${Math.round(56 * l * 1.55)})`;
      g.fillRect(X(-GX + i * bw), Y(HW - k * bh), bw * ppf + 1, bh * ppf + 1);
    }
    // nepravidelnosti: světlejší a tmavší mapy, sušší místa
    for (let i = 0; i < 260; i++) {
      const x = X((rnd() * 2 - 1) * GX), y = Y((rnd() * 2 - 1) * HW), r = (3 + rnd() * 14) * ppf, dark = rnd() < 0.55;
      const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, dark ? `rgba(18,40,14,${0.05 + rnd() * 0.1})` : `rgba(150,170,70,${0.04 + rnd() * 0.07})`); q.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // ošlapaná místa: před brankami a ve středu
    const worn = (x, y, rx, ry, a) => { g.save(); g.translate(X(x), Y(y)); g.scale(rx * ppf, ry * ppf); const q = g.createRadialGradient(0, 0, 0, 0, 0, 1); q.addColorStop(0, `rgba(96,88,48,${a})`); q.addColorStop(0.6, `rgba(86,96,46,${a * 0.5})`); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(-1, -1, 2, 2); g.restore(); };
    for (const s of [-1, 1]) { worn(s * (GX - 5), 0, 9, 8, 0.5); worn(s * (GX - FB.SPOT), 0, 4, 4, 0.3); }
    worn(0, 0, 7, 7, 0.28);
    // čáry: matná bílá, lehce nerovná (stébla ji prosvítají díky struktuře)
    g.strokeStyle = 'rgba(226,230,220,0.9)'; g.fillStyle = 'rgba(226,230,220,0.9)'; g.lineWidth = Math.max(1.5, 0.4 * ppf); g.lineJoin = 'miter';
    const rect = (x0, y0, x1, y1) => g.strokeRect(X(x0), Y(y1), (x1 - x0) * ppf, (y1 - y0) * ppf), dot = (x, y) => { g.beginPath(); g.arc(X(x), Y(y), 0.45 * ppf, 0, TAU); g.fill(); };
    g.save(); g.beginPath(); g.rect(X(-GX) - g.lineWidth, Y(HW) - g.lineWidth, 2 * GX * ppf + 2 * g.lineWidth, 2 * HW * ppf + 2 * g.lineWidth); g.clip();   // oblouky rohů jen uvnitř hřiště
    rect(-GX, -HW, GX, HW);
    g.beginPath(); g.moveTo(X(0), Y(HW)); g.lineTo(X(0), Y(-HW)); g.stroke();
    g.beginPath(); g.arc(X(0), Y(0), 12 * ppf, 0, TAU); g.stroke(); dot(0, 0);
    for (const s of [-1, 1]) {
      rect(Math.min(s * GX, s * (GX - FB.BOXD)), -FB.BOXW, Math.max(s * GX, s * (GX - FB.BOXD)), FB.BOXW);     // pokutové území
      rect(Math.min(s * GX, s * (GX - 8)), -11, Math.max(s * GX, s * (GX - 8)), 11);                              // brankové území
      dot(s * (GX - FB.SPOT), 0);
      g.beginPath(); g.arc(X(s * (GX - FB.SPOT)), Y(0), 10 * ppf, s > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, s > 0 ? Math.PI * 1.38 : Math.PI * 0.38); g.stroke();
      for (const v of [-1, 1]) { g.beginPath(); g.arc(X(s * GX), Y(v * HW), 3 * ppf, 0, TAU); g.stroke(); }
    }
    g.restore();
    // ztmavení k okrajům haly
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (this.pitchMat.map) this.pitchMat.map.dispose();
    this.pitchMat.map = canvasTex(c, true, this.aniso); this.pitchMat.needsUpdate = true;
  },
  // ---------- 3D tráva: jemná stébla rovnoměrně po celém hřišti ----------
  // Jedna instancovaná síť: dlaždice 1×1 stopa s n×n stébly v rozhozené mřížce, dlaždice na sebe přesně navazují.
  buildGrass(n) {
    // řada stébel jako průhledná textura: dole skoro souvislá, nahoře jednotlivé špičky; n takových řad v každé dlaždici
    const rnd = mulberry32(99), BH = 0.14, v = [], uv = [], [bc, bg] = mkCanvas(256, 64);
    for (let i = 0; i < 150; i++) {
      const x = rnd() * 256, h = 26 + rnd() * 36, w = 3.5 + rnd() * 3.5, ln = (rnd() - 0.5) * 14, sh = Math.round(195 + rnd() * 60);
      bg.fillStyle = `rgb(${sh},${sh},${sh})`;
      for (const ox of [0, 256, -256]) { bg.beginPath(); bg.moveTo(x + ox - w, 64); bg.lineTo(x + ox + w, 64); bg.lineTo(x + ox + ln, 64 - h); bg.closePath(); bg.fill(); }
    }
    const btex = canvasTex(bc, false, this.aniso); btex.wrapS = THREE.RepeatWrapping;
    for (let i = 0; i < n; i++) {
      const cx = rnd() - 0.5, cz = rnd() - 0.5, a = rnd() * Math.PI, dx = Math.cos(a) * 0.36, dz = Math.sin(a) * 0.36, u0 = rnd(), h = BH * (0.75 + rnd() * 0.25);
      const A = [cx - dx, 0, cz - dz], B = [cx + dx, 0, cz + dz], C = [cx + dx, h, cz + dz], D = [cx - dx, h, cz - dz];
      v.push(...A, ...B, ...C, ...A, ...C, ...D); uv.push(u0, 0, u0 + 0.72, 0, u0 + 0.72, 1, u0, 0, u0 + 0.72, 1, u0, 1);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(v.length / 3).fill([0, 1, 0]).flat(), 3));
    const U = this.grassU = { uGH: { value: null }, uGM: { value: null }, uGT: { value: 0 }, uGW: { value: 0 }, uGPud: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) } };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: btex, alphaTest: 0.3 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'uniform sampler2D uGH; uniform sampler2D uGM; uniform float uGT; uniform float uGW; uniform vec4 uGPud[8]; varying vec3 vGc; varying float vTip; varying float vCut;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 io = (instanceMatrix * vec4(position.x, 0.0, position.z, 1.0)).xyz; vec2 guv = vec2((io.x + 100.0) / 200.0, (42.5 - io.z) / 85.0);
  float gh0 = texture2D(uGH, guv).r, hk = 0.3 + 0.7 * gh0; vTip = position.y / ${BH.toFixed(2)}; vCut = gh0; vGc = texture2D(uGM, guv).rgb;
  if (uGW > 0.5) for (int i = 0; i < 8; i++) if (uGPud[i].z > 0.0 && length(io.xz - uGPud[i].xy) < uGPud[i].z * 0.8) hk *= 0.3;   // v kaluži kouká jen špička
  transformed.y *= hk; transformed.x += sin(uGT * 1.7 + io.x * 0.9 + io.z * 0.6) * 0.014 * vTip * hk;`);
      sh.fragmentShader = 'uniform float uGW; varying vec3 vGc; varying float vTip; varying float vCut;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = vGc * diffuseColor.g * mix(0.9, 1.5, vTip) * mix(vec3(1.42, 1.3, 0.78), vec3(0.9, 0.94, 0.9), smoothstep(0.2, 0.9, vCut)) * (1.0 - 0.2 * uGW);')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
    };
    const GX = Math.ceil(RINK.GOAL_X) + 1, HW = Math.ceil(FB.HW) + 1, N = (2 * GX) * (2 * HW);
    const m = this.grassM = new THREE.InstancedMesh(geo, mat, N), o = new THREE.Object3D(); let k = 0;
    for (let x = -GX; x < GX; x++) for (let y = -HW; y < HW; y++) { o.position.set(x + 0.5, 0.02, y + 0.5); o.rotation.y = Math.floor(rnd() * 4) * Math.PI / 2; o.scale.set(1, 0.8 + rnd() * 0.4, 1); o.updateMatrix(); m.setMatrixAt(k++, o.matrix); }
    m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 2; this.grassN = n; this.scene.add(m);
    this.grassTex = new THREE.DataTexture(new Uint8Array(100 * 43).fill(255), 100, 43, THREE.RedFormat); this.grassTex.magFilter = THREE.LinearFilter; this.grassTex.minFilter = THREE.LinearFilter; this.grassTex.needsUpdate = true;
    U.uGH.value = this.grassTex;
  },
  syncGrass(g, players, t) {
    const N = this.sportOn === 'football' && g && g.grass && this.pitchMat && this.pitchMat.map ? Math.max(0, GFX[this.quality].grass >> (IS_MOBILE ? 1 : 0)) : 0;
    if (this.grassM && this.grassN !== N && N) { this.scene.remove(this.grassM); this.grassM.geometry.dispose(); this.grassM.material.dispose(); this.grassM.dispose(); this.grassTex.dispose(); this.grassM = null; }
    if (!N) { if (this.grassM) this.grassM.visible = false; return; }
    if (!this.grassM) this.buildGrass(N);
    const U = this.grassU, tex = this.grassTex; this.grassM.visible = true;
    if (tex.image.data !== g.grass || this.grassV !== g.grassV) { tex.image.data = g.grass; this.grassV = g.grassV; tex.needsUpdate = true; }
    U.uGM.value = this.pitchMat.map; U.uGT.value = t; U.uGW.value = g.rain ? 1 : 0;
    U.uGPud.value.forEach((v, i) => { const q = g.rain && g.puddles[i]; if (q) v.set(q.x, -q.y, q.r, 0); else v.z = 0; });
  },
  // traktůrek se sekačkou (o poločase místo rolby)
  buildMower() {
    const grp = new THREE.Group(), std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.1, ...o });
    const red = std(0xc8281e), dark = std(0x1b1d22, { roughness: 0.85 }), yel = std(0xe8b820), steel = std(0x9aa3ad, { metalness: 0.7, roughness: 0.35 }), skin = std(0xe0b090), blue = std(0x2a4a8a);
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; grp.add(o); return o; }, box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
    box(4.4, 0.5, 2.4, dark, 0.6, 1.3, 0); box(2.6, 1.3, 2.0, red, 2.0, 2.1, 0); box(0.3, 1.0, 1.6, dark, 3.35, 2.0, 0);                 // rám, kapota, maska
    box(1.5, 0.35, 1.7, dark, -0.9, 1.75, 0); box(0.3, 1.2, 1.7, dark, -1.6, 2.4, 0);                                                     // sedačka
    box(1.6, 0.25, 0.9, red, -1.0, 2.75, 1.55); box(1.6, 0.25, 0.9, red, -1.0, 2.75, -1.55);                                             // blatníky
    add(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), steel, 0.75, 2.9, 0).rotation.z = -0.5; add(new THREE.TorusGeometry(0.42, 0.06, 6, 16), dark, 0.45, 3.4, 0).rotation.y = Math.PI / 2;   // volant
    add(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 8), steel, 2.9, 3.3, 0.7);                                                              // výfuk
    this.mowWheels = [];
    const wheel = (r, w, x, z) => { const o = add(new THREE.CylinderGeometry(r, r, w, 18).rotateX(Math.PI / 2), dark, x, r, z); o.userData.r = r; this.mowWheels.push(o); add(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.06, 12).rotateX(Math.PI / 2), yel, x, r, z); };
    wheel(1.45, 0.95, -1.0, 1.6); wheel(1.45, 0.95, -1.0, -1.6); wheel(0.85, 0.6, 2.7, 1.3); wheel(0.85, 0.6, 2.7, -1.3);
    box(2.6, 0.45, 8.4, yel, -3.6, 0.42, 0); box(1.4, 0.2, 0.25, steel, -2.4, 0.9, 0.9); box(1.4, 0.2, 0.25, steel, -2.4, 0.9, -0.9);     // žací lišta za traktorem
    add(new THREE.CapsuleGeometry(0.42, 0.8, 4, 10), blue, -0.9, 2.85, 0); add(new THREE.SphereGeometry(0.36, 12, 10), skin, -0.85, 3.9, 0); add(new THREE.CylinderGeometry(0.4, 0.42, 0.2, 12), yel, -0.85, 4.15, 0);   // řidič se slamákem
    this.mowBeacon = add(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, 0.2) }), -1.6, 3.2, 0);
    grp.scale.setScalar(0.85); grp.visible = false; this.scene.add(grp); this.mowGrp = grp;
  },
  // ---------- počasí ve fotbale: kaluže, krtince, déšť ----------
  buildWeather() {
    // krtinec: kuželovitá hromádka sypké hlíny (hranaté hroudy, nestejně tmavá)
    const rnd = mulberry32(5), mg = new THREE.SphereGeometry(1, 22, 9, 0, TAU, 0, Math.PI / 2).toNonIndexed(), pos = mg.attributes.position, col = new Float32Array(pos.count * 3), hs = (x, z) => { const q = Math.sin(x * 37.1 + z * 91.7) * 43758.5; return q - Math.floor(q); };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), rr = Math.min(1, Math.hypot(x, z)), k = 0.82 + hs(x, z) * 0.36;
      pos.setXYZ(i, x * k, Math.pow(1 - rr, 0.75) * (0.85 + hs(z, x) * 0.3) + (rr < 0.97 ? hs(x + 1, z) * 0.07 : 0), z * k);
    }
    mg.computeVertexNormals();
    for (let i = 0; i < pos.count; i += 3) { const v = 0.75 + rnd() * 0.5, c3 = [0.2 * v, 0.135 * v, 0.085 * v]; for (let q = 0; q < 3; q++) col.set(c3, (i + q) * 3); }
    mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    this.moleM = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(mg, mm); m.castShadow = true; m.receiveShadow = true; m.visible = false; this.scene.add(m); return m; });
    // krtek: válcovité tělo zapuštěné do krtince (ven kouká jen hlava a hruď), čumák, oči, tlapky s drápy opřené o hlínu
    const std = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r }), fur = std(0x4b4039, 0.85), belly = std(0x6a5c52, 0.9), pink = std(0xf0a3a8, 0.55), eyeM = std(0x0a0a0a, 0.15), claw = std(0xf3ead8, 0.5);
    const bg = new THREE.CapsuleGeometry(0.38, 1.5, 6, 16), hg = new THREE.SphereGeometry(0.4, 16, 12).scale(1, 0.95, 1.05), sg = new THREE.ConeGeometry(0.2, 0.5, 12).rotateX(Math.PI / 2), ng = new THREE.SphereGeometry(0.1, 10, 8);
    const eg = new THREE.SphereGeometry(0.05, 8, 6), pwg = new THREE.SphereGeometry(0.2, 10, 8).scale(1.15, 0.4, 1.5), cg = new THREE.ConeGeometry(0.035, 0.2, 6).rotateX(Math.PI / 2), blg = new THREE.SphereGeometry(0.3, 12, 8).scale(1, 1.3, 0.5);
    this.moleA = Array.from({ length: 4 }, () => {
      const grp = new THREE.Group(), add = (geo, mat, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; grp.add(o); return o; };
      add(bg, fur, 0, -0.95, 0); add(hg, fur, 0, 0, 0.04); add(blg, belly, 0, -0.5, 0.26);
      add(sg, fur, 0, -0.04, 0.5, -0.12); add(ng, pink, 0, 0, 0.76);
      for (const sd of [-1, 1]) {
        add(eg, eyeM, sd * 0.17, 0.14, 0.34);
        add(pwg, pink, sd * 0.5, -0.5, 0.42, 0.25);
        for (const k of [-1, 0, 1]) add(cg, claw, sd * 0.5 + k * 0.11, -0.53, 0.76, 0.25);
      }
      grp.visible = false; this.scene.add(grp); return grp;
    });
    const N = 700, rp = new Float32Array(N * 6); this.rainP = Array.from({ length: N }, () => [rand(-70, 70), rand(0, 50), rand(-50, 50), rand(46, 62)]);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainM = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc4d6e8, transparent: true, opacity: 0.32, depthWrite: false })); this.rainM.frustumCulled = false; this.rainM.visible = false; this.rainM.renderOrder = 6;
    this.scene.add(this.rainM);
  },
  syncWeather(g, t, dt) {
    const rain = !!(g && g.rain), mo = g && g.moles && g.moles.length ? g.moles : null;
    if (!rain && !mo && !this.moleM) return;
    if (!this.moleM) this.buildWeather();
    if (!this.pitchMat) return;
    const ud = this.pitchMat.userData; ud.wT.value = t;
    ud.pud.value.forEach((v, i) => { const q = rain && g.puddles[i]; if (q) v.set(q.x, -q.y, q.r, q.rot); else v.z = 0; });   // kaluže kreslí shader trávníku
    ud.mole.value.forEach((v, i) => { const q = mo && mo[i]; if (q) v.set(q.x, -q.y, Math.min(1, (g.time - q.born) * 1.5 + 0.05)); else v.z = 0; });
    this.moleM.forEach((m, i) => { const q = mo && mo[i]; m.visible = !!q; if (q) { const k = Math.min(1, (g.time - q.born) * 1.5 + 0.05); m.position.set(q.x, -0.02, -q.y); m.scale.set(1.15, 0.8 * k, 1.15); m.rotation.y = q.x * 3.1; } });
    this.moleA.forEach((a, i) => { const q = mo && mo[i], u = q ? q.up || 0 : 0; a.visible = u > 0.03; if (a.visible) { a.position.set(q.x, -0.25 + u * 1.3, -q.y); a.scale.setScalar(1.15); a.rotation.y = Math.atan2(this.cam.position.x - q.x, this.cam.position.z + q.y) + Math.sin(t * 2.2 + i) * 0.5; } });   // krtek je čelem ke kameře a rozhlíží se
    this.rainM.visible = rain;
    { const w = ud.wet; if (w && w.value !== (rain ? 1 : 0)) { w.value = rain ? 1 : 0; this.pitchMat.roughness = rain ? 0.62 : 0.93; this.pitchMat.envMapIntensity = rain ? 0.4 : 0.12; } }
    if (!rain) return;
    const a = this.rainM.geometry.attributes.position, cx = this.camT.x, cz = -this.camT.y;
    this.rainP.forEach((p, i) => {
      p[1] -= p[3] * dt; if (p[1] < 0) { p[1] += 50; p[0] = rand(-70, 70); p[2] = rand(-50, 50); }
      a.setXYZ(i * 2, cx + p[0], p[1], cz + p[2]); a.setXYZ(i * 2 + 1, cx + p[0] + 0.25, p[1] + 1.6, cz + p[2]);
    });
    a.needsUpdate = true;
  },
  buildPuck() {
    // puk: menší (blíž skutečnému poměru k čepeli), vroubkovaný bok, na horní ploše světlejší hrana a znak, ať je čitelný i na tmavém podkladu
    const [tc, tg] = mkCanvas(128, 128), [sc, sg] = mkCanvas(256, 16);
    tg.fillStyle = '#3b3d44'; tg.fillRect(0, 0, 128, 128); tg.fillStyle = '#0d0d10'; tg.beginPath(); tg.arc(64, 64, 57, 0, TAU); tg.fill();
    tg.strokeStyle = '#2b2d34'; tg.lineWidth = 3; tg.beginPath(); tg.arc(64, 64, 44, 0, TAU); tg.stroke();
    tg.fillStyle = '#c9ced8'; tg.font = 'italic 900 34px "Arial Black","DejaVu Sans",sans-serif'; tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.fillText("'98", 64, 66);
    sg.fillStyle = '#0c0c0e'; sg.fillRect(0, 0, 256, 16); sg.fillStyle = '#26272c'; for (let i = 0; i < 256; i += 4) sg.fillRect(i, 3, 2, 10);
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o }), top = std({ map: canvasTex(tc, true, 4) });
    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.11, 28), [std({ map: canvasTex(sc, true, 4) }), top, top]);
    this.puck.castShadow = true; this.scene.add(this.puck);
  },
  buildRings() {
    // kruh pod ovládaným hráčem a oblouk výdrže kreslí shader na jedné plošce: hladké hrany a zaoblené konce v každém přiblížení.
    // Kruh je dole (směrem ke kameře) přerušený, v mezeře je ukazatel výdrže.
    const geo = new THREE.PlaneGeometry(6.6, 6.6).rotateX(-Math.PI / 2);
    this.rings = HUMAN_COLORS.map((c) => {
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uCol: { value: new THREE.Color(c) }, uSt: { value: 1 }, uFill: { value: new THREE.Color(0x3ddc5a) } },
        vertexShader: 'varying vec2 vP; void main() { vP = (uv - 0.5) * 6.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uCol, uFill; uniform float uSt; varying vec2 vP;
          // vzdálenost od oblouku o poloměru R se středem v úhlu c (0 = dole) a polovičním rozpětím h, se zaoblenými konci
          float arc(vec2 p, float R, float c, float h) { float a = atan(p.x, -p.y) - c; a = atan(sin(a), cos(a)); if (abs(a) < h) return abs(length(p) - R); float e = c + sign(a) * h; return length(p - R * vec2(sin(e), -cos(e))); }
          // totéž s rovnými konci (w = poloviční tloušťka)
          float arcF(vec2 p, float R, float c, float h, float w) { float a = atan(p.x, -p.y) - c; a = atan(sin(a), cos(a)); return max(abs(length(p) - R), (abs(a) - h) * R + w); }
          void main() {
            float G = 0.78, A = 0.64, aa = fwidth(vP.x) * 1.2, ang = atan(vP.x, -vP.y);
            // kruh: čtyři tenké šedé segmenty s přechodem (světlejší vzadu), kolem měkký stín
            float seg = (6.28318 - 2.0 * G) / 4.0, dr = 9.0;
            for (int i = 0; i < 4; i++) dr = min(dr, arc(vP, 2.08, G + (float(i) + 0.5) * seg, seg * 0.5 - 0.075));
            float ring = 1.0 - smoothstep(0.06 - aa, 0.06 + aa, dr), shadow = (1.0 - smoothstep(0.02, 0.62, dr)) * 0.55;
            vec3 grey = mix(vec3(0.24, 0.25, 0.27), vec3(0.74, 0.75, 0.77), 0.5 - 0.5 * cos(ang)) * (0.9 + 0.1 * smoothstep(0.05, 0.0, dr));
            vec3 col = mix(vec3(0.02, 0.03, 0.05), grey, ring); float al = max(ring, shadow);
            // výdrž: dvanáct krátkých hranatých barevných dílků na souvislém tmavém podkladu, poslední se plní plynule
            float n = 12.0, sl = 2.0 * A / n, hs = sl * 0.5 - 0.016, dt = arcF(vP, 2.66, 0.0, A + 0.03, 0.17), df = 9.0;   // podklad je jeden souvislý oblouk, dílky má jen barevná výplň
            for (int i = 0; i < 12; i++) { float c0 = -A + (float(i) + 0.5) * sl, f = clamp(uSt * n - float(i), 0.0, 1.0); if (f > 0.02) df = min(df, arcF(vP, 2.66, c0 - hs + hs * f, hs * f, 0.115)); }
            float track = 1.0 - smoothstep(0.17 - aa, 0.17 + aa, dt), tsh = (1.0 - smoothstep(0.15, 0.5, dt)) * 0.3, fill = 1.0 - smoothstep(0.115 - aa, 0.115 + aa, df);
            col = mix(col, vec3(0.03, 0.04, 0.06), max(track, step(al, tsh))); al = max(al, max(track * 0.88, tsh));
            col = mix(col, uFill * (0.8 + 0.35 * smoothstep(0.115, 0.0, df)), fill); al = max(al, fill);
            if (al < 0.01) discard; gl_FragColor = vec4(col, al);
          }` });
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; m.visible = false; this.scene.add(m);
      return m;
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
    this.setReflector(q.refl && !this.fbOn);
    if (this.bodies) { const n = this.seats.length; this.bodies.count = this.heads.count = name === 'low' ? Math.floor(n * 0.55) : n; }
    if (changedIce) this.paintIce();
    this.setPost(q.post); this.wearMesh.visible = q.wear && !this.fbOn; this.resize();
  },
  setView() {
    const S = Settings.data, cu = this.sportOn === 'curling', view = S.cam === 'side' && !cu ? 'side' : 'top';   // curling se hraje vždy shora za kamenem
    const repaint = this.view && this.view !== view;
    this.view = view;
    this.zoomI = clamp(S.zoom == null ? 1 : S.zoom, 0, ZOOMS.length - 1);
    const z = ZOOMS[this.zoomI];
    this.off = cu ? [-17 * z, 0, 50 * z] : view === 'top' ? [-48 * z, 0, 47 * z] : [0, -78 * z, 40 * z];
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
    const [ox, oy, oz] = this.off.map((q) => q * (this.zoomMul || 1)), d = Math.hypot(ox, oy, oz), hv = d * Math.tan((this.cam.fov * Math.PI) / 360), hh = hv * this.cam.aspect;
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
    const rtx = tx, rty = ty;
    tx = clamp(tx, -this.limX, this.limX); ty = clamp(ty * 0.85, -this.limY, this.limY);
    const k = snap ? 1 : Math.min(1, dt * 3.2);
    // dynamický zoom: při rychlé akci (brejk) kamera mírně odjede, v klidné hře v pásmu se přiblíží
    const v = dt > 0 && !snap && this.lastTx != null ? Math.hypot(tx - this.lastTx, ty - this.lastTy) / dt : 0;
    this.lastTx = tx; this.lastTy = ty;
    this.vEst = (this.vEst || 0) + (Math.min(v, 80) - (this.vEst || 0)) * Math.min(1, dt * 1.5);
    const zt = (0.95 + clamp((this.vEst - 8) / 30, 0, 1) * 0.1) * (1 - 0.05 * (this.punch || 0));   // při zásahu kamera krátce přiskočí
    this.zf = snap || this.zf == null ? zt : this.zf + (zt - this.zf) * Math.min(1, dt * (this.punch > 0.05 ? 9 : 0.8));
    this.camT.x += (tx - this.camT.x) * k; this.camT.y += (ty - this.camT.y) * k * 0.85;
    const sx = (Math.random() - 0.5) * shake * 1.2, sy = (Math.random() - 0.5) * shake * 1.0;
    const [ox, oy, oz] = this.off.map((q) => q * this.zf * (this.zoomMul || 1));
    this.cam.position.set(this.camT.x + ox + sx, oz + sy, -(this.camT.y + oy));
    this.cam.lookAt(this.camT.x + sx * 0.5, 0, -this.camT.y);
    // záznam z druhé kamery: za brankou, nebo nízko od mantinelu; teleobjektiv
    const rc = this.rcam, fov = rc ? 24 : 36;
    if (rc) {
      if (rc.kind === 'net') this.cam.position.set(rc.s * (RINK.GOAL_X + 20), 9, -rty * 0.35);
      else this.cam.position.set(clamp(rtx - rc.s * 34, -70, 70), 5.5, (this.view === 'side' ? 1 : -1) * (RINK.HW - 2.5));
      this.rcT = this.rcT && this.rcK === rc.kind ? this.rcT.lerp(_va.set(rtx, 2.2, -rty), Math.min(1, dt * 6)) : new THREE.Vector3(rtx, 2.2, -rty); this.rcK = rc.kind;
      this.cam.lookAt(this.rcT);
    } else this.rcK = null;
    if (this.cam.fov !== fov) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  },
  resize() {
    if (!this.r) return;
    const q = GFX[this.quality || 'high'];
    this.r.setPixelRatio(Math.min(IS_MOBILE ? 1.5 : 2, window.devicePixelRatio || 1) * q.pr);
    const vw = R.vw || window.innerWidth, vh = R.vh || window.innerHeight;
    this.r.setSize(vw, vh, false);
    this.cam.aspect = vw / Math.max(1, vh); this.cam.updateProjectionMatrix();
    if (this.comp) { this.comp.setPixelRatio(this.r.getPixelRatio()); this.comp.setSize(vw, vh); }
    if (this.snow) this.snow.material.uniforms.uScale.value = vh * this.r.getPixelRatio() * 0.9;
    this.computeLims(); this.sizeReflector();
  },
  toScreen(x, y, z) {
    if (this.fail) return null;
    const v = new THREE.Vector3(x, z, -y).project(this.cam);
    if (v.z > 1 || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) return null;
    return R.fromNdc(v.x, v.y);
  },

  // ---------- snímek ----------
  loadBase() {
    if (!window.GLTFLoader) return;
    // hráč: postava Quaternius Universal Base Character (CC0) + pohyby z motion capture CMU (mocap.cs.cmu.edu)
    const done = (gl) => {
      this.clips = {};
      for (const a of gl.animations) this.clips[a.name] = prepClip(a);
      if (this.xclips) Object.assign(this.clips, this.xclips);
      gl.animations = [];
      this.base = gl; this.modelGame = null; // přestavět hráče na nový model
    };
    const fail = (e) => console.warn('Model hráče se nenačetl, používám náhradní', e);
    // další nasnímané oslavy (models/clips.json): rotace kostí vzorkované po 1/20 s, stejné rozhraní jako klipy z modelu
    fetch('models/clips.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
      if (!m) return; this.xclips = {};
      for (const [name, c] of Object.entries(m)) this.xclips[name] = { duration: c.dur, tracks: Object.entries(c.bones).map(([bone, a]) => ({ bone, interp: { evaluate: (t) => { const n = a.length / 4 - 1, x = clamp(t * c.fps, 0, n), i = Math.min(n - 1, Math.floor(x)), f = x - i, o = [0, 0, 0, 0]; for (let q = 0; q < 4; q++) o[q] = a[i * 4 + q] + (a[i * 4 + 4 + q] - a[i * 4 + q]) * f; const l = Math.hypot(...o) || 1; return o.map((v) => v / l); } } })) };
      if (this.clips) Object.assign(this.clips, this.xclips);
    }).catch(() => {});
    // nasnímané dráhy chodidel a rukou pro běh, klus a kop (tools/bake_moves.js); bez nich se běh dopočítá
    fetch('models/moves.json').then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) { for (const c of Object.values(m)) c.pz0 = c.pz.reduce((a, b) => a + b, 0) / c.pz.length; this.moves = m; } }).catch(() => {});
    const parse = (buf) => { const L = new GLTFLoader(); if (window.MeshoptDecoder) L.setMeshoptDecoder(MeshoptDecoder); L.parse(buf, 'models/', done, fail); };
    // .glb, nebo záložně base64 text (kde server .glb neposílá)
    fetch('models/player.glb').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then(parse)
      .catch(() => fetch('models/player.glb.b64.txt').then((r) => (r.ok ? r.text() : Promise.reject(r.status))).then((t) => {
        const bin = atob(t.trim()), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        parse(u.buffer);
      }).catch(fail));
  },
  // hlediště v barvách zápasu: necelá polovina diváků má dres domácích, pár hostů, zbytek civil
  crowdColors(g) {
    if (!this.bodies || !this.seatCol || !g.teams || !g.teams[0].jersey) return;
    const col = new THREE.Color(), [A, B] = g.teams;
    this.seatCol.forEach((c, i) => { const f = this.seatFan[i]; col.set(f < 0.42 ? A.jersey : f < 0.5 ? B.jersey : c); if (f < 0.5) col.multiplyScalar(0.8 + (f * 37 % 1) * 0.35); this.bodies.setColorAt(i, col); });
    this.bodies.instanceColor.needsUpdate = true;
  },
  buildModels(g) {
    this.crowdColors(g);
    const ha = g.teams && g.teams[0].def ? g.teams[0].def.abbr : null;
    if (ha !== this.homeAbbr) { this.homeAbbr = ha; if (this.sportOn === 'hockey' && this.iceMat) this.paintIce(); }   // logo domácích ve středovém kruhu
    for (const m of this.modelMap.values()) m.dispose();
    this.modelMap = new Map(); this.modelGame = g;
  },
  // modely se tvoří až když hráč poprvé vyjede na led (střídání)
  modelFor(key) {
    let m = this.modelMap.get(key);
    if (m) return m;
    if (this.base) { try { m = new HModel(this, key); } catch (e) { console.error(e); m = null; } }
    if (!m && !key.isRef) m = new PModel(this, key);
    if (m) this.modelMap.set(key, m);
    return m;
  },
  render(g, players, pk, t, dt, refs) {
    if (this.fail) return;
    if (g) this.setSport(g.sport || 'hockey');
    if (g && this.modelGame !== g) this.buildModels(g);
    const vis = new Set();
    for (const p of refs ? players.concat(refs) : players) {
      const m = this.modelFor(p.ref || p); if (!m) continue;
      m.setVisible(true); m.pose(p, t); vis.add(m);
    }
    for (const m of this.modelMap.values()) if (!vis.has(m)) m.setVisible(false);
    this.puck.position.set(pk.x, (pk.z || 0) + 0.07, -pk.y);
    this.puck.visible = this.sportOn === 'hockey' && !(g && g.puck.held && g.state !== 'replay');
    if (g && g.stones) {
      if (!this.stoneM) this.buildStones();
      this.stoneM.forEach((m, i) => { const s = g.stones[i]; m.visible = !!s && !s.out; if (!m.visible) return; m.position.set(s.x, 0, -s.y); m.userData.col.color.set(s.team.jersey); if (s.moving) m.rotation.y -= (s.spin || 0) * dt * 1.6; });
    } else if (this.stoneM) for (const m of this.stoneM) m.visible = false;
    this.syncWeather(g, t, dt);
    // atmosféra: po gólu diváci skáčou a hala pohasne do rytmu, při nástupu se světla rozsvěcují
    const goal = g && g.state === 'goal' ? 1 : 0; this.cheer = (this.cheer || 0) + (goal - (this.cheer || 0)) * Math.min(1, dt * (goal ? 6 : 1.2));
    if (this.cheerU) { this.cheerU.uCheer.value = this.cheer; this.cheerU.uCT.value = t; }
    this.r.toneMappingExposure = (g && g.state === 'intro' ? 0.4 + 0.6 * clamp(g.stateT / 2.2, 0, 1) : 1) * (1 - 0.3 * this.cheer * (0.55 + 0.45 * Math.sin(t * 13)));
    this.syncGrass(g, players, t);
    if (this.ball) {
      // míč se kutálí podle uražené dráhy
      const b = this.ball, nx = pk.x, nz = -pk.y, dx = nx - b.position.x, dz = nz - b.position.z, d = Math.hypot(dx, dz);
      if (d > 0.001 && d < 8) b.rotateOnWorldAxis(_va.set(dz / d, 0, -dx / d), d / 0.36);
      b.position.set(nx, (pk.z || 0) + (this.pitchWater ? 0.2 : 0.36 * b.scale.x), nz); b.visible = this.fbOn;
      if (this.pitchWater) {
        // čas vln a kruhy na hladině kolem plavců a míče (síla podle rychlosti)
        const ud = this.pitchMat.userData, rp = ud.rip.value; ud.wT.value = t;
        for (let i = 0; i < 14; i++) {
          const p = i < 13 ? players[i] : pk;
          if (!p || (i < 13 && p.inBox)) { rp[i].z = 0; continue; }
          rp[i].set(p.x, -p.y, i < 13 ? 0.22 + Math.min(1, Math.hypot(p.vx, p.vy) / 14) * 0.6 : (pk.z || 0) < 0.6 ? 0.12 + Math.min(1, Math.hypot(pk.vx, pk.vy) / 40) * 0.35 : 0);
        }
      }
    }
    const used = new Set();
    for (const p of players) if (p.ctrl >= 0 && p.ctrl < 4) { const m = this.rings[p.ctrl], k = this.sportOn === 'football' ? 0.66 : 1, st = p.stamina == null ? 1 : p.stamina, U = m.material.uniforms; m.position.set(p.x, 0.04, -p.y); m.rotation.y = Math.atan2(-VIEW.fx, VIEW.fy); m.scale.set(k, 1, k); m.visible = true; used.add(p.ctrl);
      U.uSt.value = st; U.uFill.value.set(st > 0.5 ? 0x3ddc5a : st > 0.25 ? 0xffc21f : 0xff4a3a); }   // výdrž: zelená → žlutá → červená
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
    if (g && g !== this.wearGame) { this.wearGame = g; this.clearWear(); }
    // rolba mezi třetinami: automaticky smaže vše, při ručním řízení zůstane, co se neuklidilo, vypnutá nic
    if (g && this.wearPeriod !== g.period) { this.wearPeriod = g.period; if (g.iceManual) g.iceManual = false; else if (g.cfg.zamboni !== 'off') this.clearWear(); }
    const zam = g && g.state === 'zamboni' && g.zam;
    if (this.fbOn && zam && !this.mowGrp) this.buildMower();
    this.zamGrp.visible = !!zam && !this.fbOn; if (this.mowGrp) this.mowGrp.visible = !!zam && this.fbOn;
    if (zam && this.fbOn) { this.mowGrp.position.set(zam.x, 0, -zam.y); this.mowGrp.rotation.y = zam.dir; this.mowBeacon.visible = Math.floor(t * 3) % 2 === 0; for (const w of this.mowWheels) w.rotation.z -= zam.v * dt / w.userData.r; }
    if (zam) {
      if (!this.zamOn) { this.zamOn = true; this.zamPrev = null; this.wear.dirt0 = Math.max(1, this.dirtyCount()); }
      this.zamGrp.position.set(zam.x, 0, -zam.y); this.zamGrp.rotation.y = zam.dir;
      this.zamBeacon.visible = Math.floor(t * 3) % 2 === 0;
      this.zamClean(zam, dt);
    } else this.zamOn = false;
    if (!this.fbOn) this.updateWear(players, dt, !!g && (g.state === 'play' || g.state === 'stop' || g.state === 'goal'));
    this.updateSnow(dt);
    if (this.comp) this.comp.render(dt); else this.r.render(this.scene, this.cam);
  },
};
