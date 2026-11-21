'use strict';
// ---------- Hráči: model člověka s kostrou (Mixamo) + hokejová výstroj + procedurální animace ----------
const FT = 3.28084; // metry → stopy (model je v metrech, hra ve stopách)

const _hq1 = new THREE.Quaternion(), _hq2 = new THREE.Quaternion(), _hq3 = new THREE.Quaternion();
const _hp1 = new THREE.Vector3(), _hp2 = new THREE.Vector3(), _hd1 = new THREE.Vector3(), _hd2 = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
function wpos(o, v = new THREE.Vector3()) { return v.setFromMatrixPosition(o.matrixWorld); }
// otočení kosti o rotaci zadanou ve světových souřadnicích
function rotWorld(bone, qWorld) {
  bone.parent.getWorldQuaternion(_hq1);
  _hq2.copy(_hq1).invert().multiply(qWorld).multiply(_hq1);
  bone.quaternion.premultiply(_hq2);
  bone.updateMatrixWorld(true);
}
function rotAxis(bone, axis, ang) { if (ang) rotWorld(bone, _hq3.setFromAxisAngle(axis, ang)); }
// natočí kost tak, aby její potomek mířil na cíl
function aimBone(bone, child, target) {
  wpos(bone, _hp1); wpos(child, _hp2);
  _hd1.subVectors(_hp2, _hp1); _hd2.subVectors(target, _hp1);
  if (_hd1.lengthSq() < 1e-9 || _hd2.lengthSq() < 1e-9) return;
  _hd1.normalize(); _hd2.normalize();
  rotWorld(bone, _hq3.setFromUnitVectors(_hd1, _hd2));
}
// analytická IK pro dvě kosti (stehno–holeň, paže–předloktí)
function ik2(a, b, c, target, pole, la, lb) {
  const A = wpos(a), dir = new THREE.Vector3().subVectors(target, A);
  let dist = dir.length(); dir.divideScalar(dist || 1);
  dist = clamp(dist, Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  const x = (la * la - lb * lb + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, la * la - x * x));
  const pd = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (pd.lengthSq() < 1e-6) pd.set(0, 1, 0);
  pd.normalize();
  const K = A.clone().addScaledVector(dir, x).addScaledVector(pd, h);
  aimBone(a, b, K);
  aimBone(b, c, A.clone().addScaledVector(dir, dist));
}

// ---------- materiál těla: barvy podle oblastí + objem výstroje ----------
const BODY_VERT_HEAD = `
uniform float uInfl;
varying vec3 vPos;
`;
const BODY_VERT = `
vec3 transformed = vec3( position );
vPos = position;
{
  float ax = abs(position.x), y = position.y;
  float armM = smoothstep(0.15, 0.21, ax) * smoothstep(1.27, 1.33, y);
  float bodyM = 1.0 - armM;
  float inf = 0.0;
  inf += bodyM * smoothstep(0.56, 0.62, y) * (1.0 - smoothstep(0.98, 1.04, y)) * 0.042;           // kalhoty
  inf += bodyM * smoothstep(0.98, 1.04, y) * (1.0 - smoothstep(1.46, 1.5, y)) * (0.03 + 0.035 * smoothstep(1.22, 1.42, y)); // hruď + ramena
  inf += bodyM * smoothstep(0.12, 0.17, y) * (1.0 - smoothstep(0.56, 0.62, y)) * 0.03;            // chrániče holení
  inf += armM * (1.0 - smoothstep(0.64, 0.68, ax)) * (0.025 + 0.02 * (1.0 - smoothstep(0.2, 0.32, ax)));   // rukávy, ramena
  inf += armM * smoothstep(0.64, 0.68, ax) * 0.02;                                                   // rukavice
  transformed += normal * inf * uInfl;
}
`;
const BODY_FRAG_HEAD = `
uniform vec3 uJersey, uStripe, uTrim, uPants, uGlove, uSkin, uSock;
uniform sampler2D uNum;
varying vec3 vPos;
`;
const BODY_FRAG = `
{
  float ax = abs(vPos.x), y = vPos.y;
  vec3 c;
  if (ax > 0.17 && y > 1.29) {
    if (ax > 0.66) c = uGlove;
    else if (ax > 0.47 && ax < 0.515) c = uStripe;
    else if ((ax > 0.455 && ax < 0.47) || (ax > 0.515 && ax < 0.53)) c = uTrim;
    else if (ax > 0.6) c = uStripe;
    else c = uJersey;
  } else if (y > 1.535 && ax < 0.15) c = uSkin;
  else if (y > 1.5 && ax < 0.08) c = vec3(0.06);     // chránič krku
  else if (y > 0.99) {
    c = uJersey;
    if (y > 1.03 && y < 1.08) c = uStripe;
    if ((y > 1.015 && y < 1.03) || (y > 1.08 && y < 1.095)) c = uTrim;
    if (y > 1.43 && (ax > 0.1 || vPos.z < 0.0)) c = uStripe;
    if (vPos.z < -0.03 && ax < 0.15 && y > 1.1 && y < 1.44) {
      vec4 t = texture2D(uNum, vec2((0.15 - vPos.x) / 0.6, (y - 1.1) / 0.34));
      c = mix(c, t.rgb, t.a);
    } else if (vPos.z > 0.03 && ax < 0.085 && y > 1.24 && y < 1.4) {
      vec4 t = texture2D(uNum, vec2(0.5 + (vPos.x + 0.085) / 0.34, (y - 1.24) / 0.16));
      c = mix(c, t.rgb, t.a);
    }
  } else if (y > 0.585) {
    c = uPants;
    if (y > 0.955) c = uPants * 0.55;
    if (ax > 0.178 && y < 0.95 && y > 0.66) c = mix(c, uStripe, 0.85);
  } else if (y > 0.115) {
    c = uSock;
    if (y > 0.34 && y < 0.41) c = uStripe;
    if ((y > 0.325 && y < 0.34) || (y > 0.41 && y < 0.425)) c = uTrim;
  } else c = vec3(0.03);
  diffuseColor.rgb = c;
}
`;

function bodyMaterial(T, p) {
  const [c, g] = mkCanvas(512, 320);
  // levá polovina: záda (jméno + číslo), pravá: znak na hrudi
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = T.numCol;
  g.font = 'bold 40px "DejaVu Sans", Arial, sans-serif';
  const nm = p.name.toUpperCase(); const nw = g.measureText(nm).width;
  g.save(); g.translate(128, 36); g.scale(Math.min(1, 230 / nw), 1); g.fillText(nm, 0, 0); g.restore();
  g.font = 'bold 200px "DejaVu Sans", Arial, sans-serif';
  const num = String(p.num), w = g.measureText(num).width;
  g.save(); g.translate(128, 190); g.scale(Math.min(1, 236 / w), 1);
  g.lineWidth = 14; g.strokeStyle = T.stripe; g.strokeText(num, 0, 0); g.fillText(num, 0, 0); g.restore();
  const trim = lightness(T.jersey) > 0.7 ? T.def.c3 : '#ffffff';
  g.fillStyle = T.stripe; g.beginPath(); g.arc(384, 160, 120, 0, TAU); g.fill();
  g.fillStyle = trim; g.beginPath(); g.arc(384, 160, 98, 0, TAU); g.fill();
  g.fillStyle = T.def.c1 === T.jersey ? T.stripe : T.def.c1;
  g.font = 'italic 900 78px "Arial Black", "DejaVu Sans", sans-serif'; g.fillText(T.def.abbr, 384, 166);
  const tex = canvasTex(c, true, 4);
  const col = (h) => new THREE.Color(h);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  m.userData.uniforms = {
    uInfl: { value: p.isGoalie ? 1.55 : 1 },
    uJersey: { value: col(T.jersey) }, uStripe: { value: col(T.stripe) }, uTrim: { value: col(trim) },
    uPants: { value: col(T.pants) }, uGlove: { value: col(p.isGoalie ? '#f2f2f2' : (T.helmet === T.jersey ? T.pants : T.helmet)) },
    uSkin: { value: col('#d6a184') }, uSock: { value: col(T.jersey) }, uNum: { value: tex },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = BODY_VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', BODY_VERT);
    sh.fragmentShader = BODY_FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + BODY_FRAG);
  };
  m.customProgramCacheKey = () => 'hokej-body';
  m.userData.tex = tex;
  return m;
}

// ---------- model hráče ----------
class HModel {
  constructor(G, p) {
    this.G = G; this.goalie = p.isGoalie;
    const T = p.team, tm = G.teamMats(T);
    this.root = new THREE.Group();
    const sc = SkeletonUtils.clone(G.base.scene);
    this.root.add(sc);
    this.mat = bodyMaterial(T, p);
    const B = this.b = {};
    sc.traverse((o) => {
      if (o.isBone) B[o.name.replace('mixamorig', '')] = o;
      if (o.isSkinnedMesh) { o.material = this.mat; o.castShadow = true; o.frustumCulled = false; }
    });
    this.root.updateMatrixWorld(true);
    this.bones = Object.values(B);
    this.bind = this.bones.map((b) => [b.quaternion.clone(), b.position.clone()]);
    // výstroj (v metrech, v bind póze) připnutá ke kostem
    const add = (bone, geo, mat, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow;
      this.root.add(m); m.updateMatrixWorld(true); bone.attach(m); return m;
    };
    const blk = G.mat.boot, steel = G.mat.steel, white = G.mat.whitePlastic;
    for (const s of [1, -1]) {
      const F = s > 0 ? B.LeftFoot : B.RightFoot, x = s * 0.082;
      add(F, G.hgeo.boot, blk, x, 0.06, 0.04);
      add(F, G.hgeo.toeCap, blk, x, 0.035, 0.15);
      add(F, G.hgeo.tendon, blk, x, 0.12, -0.07);
      add(F, G.hgeo.holder, white, x, -0.005, 0.045);
      add(F, G.hgeo.runner, steel, x, -0.032, 0.045, false);
    }
    if (!p.isGoalie) {
      add(B.Head, G.hgeo.helmet, tm.helmet, 0, 1.69, -0.006);
      add(B.Head, G.hgeo.visor, G.mat.visor, 0, 1.685, -0.006, false);
      for (const s of [1, -1]) add(B.Head, G.hgeo.earGuard, tm.helmet, s * 0.112, 1.63, 0.0);
      for (const s of [1, -1]) {
        const H = s > 0 ? B.LeftHand : B.RightHand;
        add(H, G.hgeo.glove, tm.glove, s * 0.8, 1.438, -0.045);
        add(H, G.hgeo.cuff, tm.glove, s * 0.695, 1.438, -0.05);
      }
    } else {
      add(B.Head, G.hgeo.mask, tm.mask, 0, 1.685, 0.0);
      add(B.Head, G.hgeo.cage, G.mat.cage, 0, 1.655, 0.02, false);
      for (const s of [1, -1]) {
        const Lg = s > 0 ? B.LeftLeg : B.RightLeg, UL = s > 0 ? B.LeftUpLeg : B.RightUpLeg;
        add(Lg, G.hgeo.pad, tm.pad, s * 0.085, 0.33, 0.08);
        add(UL, G.hgeo.thighPad, tm.pad, s * 0.09, 0.66, 0.08);
      }
      add(B.LeftHand, G.hgeo.catcher, G.mat.goalieGear, 0.79, 1.43, 0.02);
      add(B.LeftHand, G.hgeo.catcherCuff, tm.pad, 0.69, 1.438, -0.04);
      add(B.RightHand, G.hgeo.blocker, tm.pad, -0.78, 1.44, -0.12);
      add(B.RightHand, G.hgeo.cuff, G.mat.goalieGear, -0.695, 1.438, -0.05);
    }
    this.root.scale.setScalar(FT);
    this.root.updateMatrixWorld(true);
    const len = (a, b) => wpos(a).distanceTo(wpos(b));
    this.L = {
      thigh: len(B.LeftUpLeg, B.LeftLeg), shin: len(B.LeftLeg, B.LeftFoot),
      upper: len(B.LeftArm, B.LeftForeArm), fore: len(B.LeftForeArm, B.LeftHand),
      toe: wpos(B.LeftToeBase).sub(wpos(B.LeftFoot)),
    };
    // hokejka (umístěná ve světě)
    this.stick = new THREE.Group();
    const sm = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; this.stick.add(m); return m; };
    this.shaft = sm(G.geo.shaft, G.mat.shaft);
    if (p.isGoalie) { this.paddle = sm(G.geo.paddle, G.mat.shaft); this.blade = sm(G.geo.gBlade, G.mat.blade); }
    else { this.blade = sm(G.geo.blade, G.mat.blade); this.tape = sm(G.hgeo.tape, G.mat.tape); }
    G.scene.add(this.root, this.stick);
  }
  dispose() {
    this.G.scene.remove(this.root, this.stick);
    this.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    this.mat.userData.tex.dispose(); this.mat.dispose();
  }
  reset() { this.bones.forEach((b, i) => { b.quaternion.copy(this.bind[i][0]); b.position.copy(this.bind[i][1]); }); }
  pose(p, t) {
    const d = p.dir, c = Math.cos(d), s = Math.sin(d);
    const O = new THREE.Vector3(p.x, 0, -p.y), F = new THREE.Vector3(c, 0, -s), Lv = new THREE.Vector3(-s, 0, -c);
    const J = (a, b, z) => new THREE.Vector3(O.x + F.x * a + Lv.x * b, z, O.z + F.z * a + Lv.z * b);
    this.reset();
    this.root.quaternion.setFromAxisAngle(UPV, Math.atan2(F.x, F.z));
    this.stick.position.set(0, 0, 0); this.stick.quaternion.identity();
    const down = p.downT > 0;
    if (this.goalie) this.poseGoalie(p, t, O, F, Lv, J);
    else this.poseSkater(down ? { ...p, spdN: 0, windT: 0, pokeA: 0, carry: false, stride: 0 } : p, t, O, F, Lv, J, down);
    if (down) {
      // pád: tělo se překlopí kolem bodu na ledě, hůl leží vedle
      const dl = [Math.cos(p.lie), Math.sin(p.lie)], k3 = new THREE.Vector3(-dl[1], 0, -dl[0]);
      const q = new THREE.Quaternion().setFromAxisAngle(k3, 1.5), pivot = O.clone();
      this.root.position.sub(pivot).applyQuaternion(q).add(pivot); this.root.position.y += 0.55;
      this.root.quaternion.premultiply(q);
      this.root.updateMatrixWorld(true);
      const side = new THREE.Vector3(-dl[1], 0, -dl[0]), along = new THREE.Vector3(dl[0], 0, -dl[1]);
      const heel = O.clone().addScaledVector(side, 1.6).addScaledVector(along, -1.5).setY(0.1);
      const top = heel.clone().addScaledVector(along, 4.6).addScaledVector(side, 0.6).setY(0.12);
      if (this.tape) this.placeStick(heel, top, side.clone().negate(), along);
      else seg(this.shaft, heel, top, along);
    }
  }
  legs(fL, fR, poleL, poleR, splayL, splayR, F, lift) {
    const B = this.b, ah = 0.42;
    for (const [up, lo, ft, toe, tgt, pole, spl] of [[B.LeftUpLeg, B.LeftLeg, B.LeftFoot, B.LeftToeBase, fL, poleL, splayL], [B.RightUpLeg, B.RightLeg, B.RightFoot, B.RightToeBase, fR, poleR, splayR]]) {
      const target = tgt.clone(); target.y += ah;
      ik2(up, lo, ft, target, pole, this.L.thigh, this.L.shin);
      const fd = F.clone().applyAxisAngle(UPV, spl);
      const tp = wpos(ft).addScaledVector(fd, Math.hypot(this.L.toe.x, this.L.toe.z)).add(new THREE.Vector3(0, this.L.toe.y, 0));
      aimBone(ft, toe, tp);
    }
  }
  placeStick(heel, top, toeDir, F, wide) {
    const dir = new THREE.Vector3().subVectors(top, heel).normalize();
    seg(this.shaft, heel, top.clone().addScaledVector(dir, 0.15), F);
    if (wide) return;
    put(this.blade, heel.clone().addScaledVector(toeDir, 0.45).add(new THREE.Vector3(0, 0.02, 0)), toeDir);
    put(this.tape, heel.clone().addScaledVector(toeDir, 0.45).add(new THREE.Vector3(0, 0.02, 0)), toeDir);
  }
  poseSkater(p, t, O, F, Lv, J, down) {
    const B = this.b, spd = Math.min(1, (p.spdN || 0) / 26), ph = p.stride || 0, wind = p.windT || 0, poke = p.pokeA || 0;
    const drop = down ? 0.05 : 0.32 + 0.5 * spd + 0.4 * wind;
    this.root.position.set(O.x, 0.15 - drop, O.z);
    this.root.updateMatrixWorld(true);
    // trup: předklon, kolébání do stran při odrazu
    rotAxis(B.Hips, Lv, down ? 0.05 : 0.38 + 0.32 * spd + 0.15 * wind);
    rotAxis(B.Hips, UPV, Math.sin(ph) * 0.14 * spd);
    rotAxis(B.Hips, F, Math.sin(ph) * 0.06 * spd);
    const lean = down ? 0.1 : 0.3 + 0.35 * spd + 0.15 * wind;
    for (const b of [B.Spine, B.Spine1, B.Spine2]) rotAxis(b, Lv, lean / 3);
    rotAxis(B.Spine1, UPV, -Math.sin(ph) * 0.12 * spd + p.hand * wind * 0.35);
    const headUp = -(0.38 + 0.32 * spd + 0.15 * wind + lean) * 0.8;
    rotAxis(B.Neck, Lv, headUp * 0.55); rotAxis(B.Head, Lv, headUp * 0.45);
    // nohy: střídavé odrazy do stran
    const sw = Math.sin(ph) * spd, cw = Math.cos(ph);
    const fL = J(0.15 - 0.85 * sw, 0.52 + 0.55 * Math.max(0, -sw), Math.max(0, cw) * 0.4 * spd);
    const fR = J(0.15 + 0.85 * sw, -0.52 - 0.55 * Math.max(0, sw), Math.max(0, -cw) * 0.4 * spd);
    const poleL = F.clone().addScaledVector(Lv, 0.25), poleR = F.clone().addScaledVector(Lv, -0.25);
    this.legs(fL, fR, poleL, poleR, 0.15 + 0.5 * Math.max(0, -sw), -0.15 - 0.5 * Math.max(0, sw), F);
    // hůl a ruce
    const bo = bladeOffset(p.dir, p.hand, p.carry, t, wind, poke);
    const heel = new THREE.Vector3(O.x + bo[0], bo[2] + 0.1, O.z - bo[1]);
    const H = wpos(B.Hips);
    const topSide = -p.hand; // horní ruka je na opačné straně než čepel
    const topT = H.clone().addScaledVector(F, 0.85 + poke * 0.6 - wind * 0.5).addScaledVector(Lv, topSide * 0.5).add(new THREE.Vector3(0, -0.15 + wind * 2.1, 0));
    const [tA, tF, tH, tM] = topSide > 0 ? [B.LeftArm, B.LeftForeArm, B.LeftHand, B.LeftHandMiddle1] : [B.RightArm, B.RightForeArm, B.RightHand, B.RightHandMiddle1];
    const [bA, bF, bH, bM] = topSide > 0 ? [B.RightArm, B.RightForeArm, B.RightHand, B.RightHandMiddle1] : [B.LeftArm, B.LeftForeArm, B.LeftHand, B.LeftHandMiddle1];
    const dn = new THREE.Vector3(0, -1, 0);
    ik2(tA, tF, tH, topT, dn.clone().addScaledVector(Lv, topSide * 0.9).addScaledVector(F, -0.3), this.L.upper, this.L.fore);
    const top = wpos(tH);
    const sdir = new THREE.Vector3().subVectors(heel, top), slen = sdir.length(); sdir.divideScalar(slen);
    const freeArm = !p.carry && spd > 0.55 && wind === 0 && poke === 0;
    const sh = wpos(bA);
    if (freeArm) {
      const sw2 = Math.sin(ph + Math.PI) * spd;
      const tgt = sh.clone().addScaledVector(Lv, -topSide * 0.45).addScaledVector(F, sw2 * 1.1).add(new THREE.Vector3(0, -1.6 + Math.abs(sw2) * 0.5, 0));
      ik2(bA, bF, bH, tgt, dn.clone().addScaledVector(F, -0.5).addScaledVector(Lv, -topSide * 0.6), this.L.upper, this.L.fore);
    } else {
      // dolní ruka: bod na holi nejblíž rameni (dosažitelný)
      const tt = clamp(new THREE.Vector3().subVectors(sh, top).dot(sdir) / slen, 0.16, 0.42);
      const tgt = top.clone().addScaledVector(sdir, slen * tt);
      ik2(bA, bF, bH, tgt, dn.clone().addScaledVector(Lv, -topSide * 0.8).addScaledVector(F, -0.2), this.L.upper, this.L.fore);
    }
    aimBone(tH, tM, top.clone().addScaledVector(sdir, 0.5));
    aimBone(bH, bM, wpos(bH).addScaledVector(sdir, 0.5));
    const ta = p.dir + p.hand * 0.7, toe = new THREE.Vector3(Math.cos(ta), 0, -Math.sin(ta));
    this.placeStick(heel, top, toe, F);
  }
  poseGoalie(p, t, O, F, Lv, J) {
    const B = this.b, sv = p.saveT > 0 ? p.saveKind : 0, bf = sv === 1;
    const sway = Math.sin((p.stride || 0) * 0.8) * 0.05;
    const drop = bf ? 1.7 : 1.05;
    this.root.position.set(O.x, 0.15 - drop, O.z);
    this.root.updateMatrixWorld(true);
    rotAxis(B.Hips, Lv, bf ? 0.15 : 0.45);
    rotAxis(B.Hips, F, sway);
    for (const b of [B.Spine, B.Spine1, B.Spine2]) rotAxis(b, Lv, bf ? -0.02 : 0.05);
    rotAxis(B.Neck, Lv, bf ? -0.1 : -0.3); rotAxis(B.Head, Lv, -0.15);
    let fL, fR, poleL, poleR;
    if (bf) {
      fL = J(-0.9, 2.15, 0); fR = J(-0.9, -2.15, 0);
      poleL = F.clone().addScaledVector(UPV, -0.8); poleR = poleL.clone();
    } else {
      fL = J(0.1, 1.2, 0); fR = J(0.1, -1.2, 0);
      poleL = F.clone().addScaledVector(Lv, -0.35); poleR = F.clone().addScaledVector(Lv, 0.35);
    }
    this.legs(fL, fR, poleL, poleR, bf ? 1.2 : 0.35, bf ? -1.2 : -0.35, F);
    const H = wpos(B.Hips), down = new THREE.Vector3(0, -1, 0);
    let glove = H.clone().addScaledVector(F, 1.25).addScaledVector(Lv, 1.35).add(new THREE.Vector3(0, 0.55, 0));
    let block = H.clone().addScaledVector(F, 1.3).addScaledVector(Lv, -1.15).add(new THREE.Vector3(0, 0.15, 0));
    if (sv === 2) glove = H.clone().addScaledVector(F, 0.9).addScaledVector(Lv, 1.6).add(new THREE.Vector3(0, 2.0, 0));
    if (sv === 3) block = H.clone().addScaledVector(F, 0.9).addScaledVector(Lv, -1.6).add(new THREE.Vector3(0, 1.6, 0));
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, glove, down.clone().addScaledVector(Lv, 0.8), this.L.upper, this.L.fore);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, block, down.clone().addScaledVector(Lv, -0.8), this.L.upper, this.L.fore);
    const bh = wpos(B.RightHand);
    const heel = J(1.95, -0.25, 0.16);
    aimBone(B.RightHand, B.RightHandMiddle1, bh.clone().add(new THREE.Vector3().subVectors(heel, bh).normalize()));
    const pTop = bh.clone().lerp(heel, 0.55);
    seg(this.shaft, pTop, bh.clone().add(new THREE.Vector3(0, 0.3, 0)), F);
    seg(this.paddle, heel.clone().add(new THREE.Vector3(0, 0.1, 0)), pTop, F);
    put(this.blade, heel, Lv);
  }
}
