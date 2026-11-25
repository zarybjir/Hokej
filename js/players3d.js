'use strict';
// ---------- Hráči: model člověka s kostrou (Mixamo) + hokejová výstroj + procedurální animace ----------
const FT = 3.28084; // metry → stopy (model je v metrech, hra ve stopách)

const _hq1 = new THREE.Quaternion(), _hq2 = new THREE.Quaternion(), _hq3 = new THREE.Quaternion();
const UPPER = new Set(['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r']);
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
uniform float uInfl, uFoot;
attribute float aArm;
varying vec3 vPos;
varying float vArm;
// trup pod dresem: místo úzkého pasu modelu souvislý tvar přes chrániče (elipsa v průřezu)
float torsoM0(vec3 p);
float torsoM(vec3 p) { return (1.0 - uFoot) * torsoM0(p); }   // fotbalista nemá chrániče
float torsoM0(vec3 p) {
  float armM = aArm;
  return (1.0 - armM) * smoothstep(0.9, 0.99, p.y) * (1.0 - smoothstep(1.43, 1.5, p.y));
}
vec2 torsoR(float y) { return vec2(mix(0.2, 0.215, smoothstep(1.05, 1.38, y)), mix(0.13, 0.15, smoothstep(1.05, 1.32, y))); }
`;
const LEG_FN = `
// nohy: hokejové kalhoty ke kolenům, chránič kolene a holeně pod štulpnou (válec kolem osy nohy)
float legM(vec3 p) { return (1.0 - uFoot) * (1.0 - aArm) * smoothstep(0.1, 0.16, p.y) * (1.0 - smoothstep(0.93, 0.99, p.y)); }
vec2 legC(vec3 p) { return vec2(sign(p.x + 1e-5) * 0.105, mix(-0.045, -0.02, smoothstep(0.1, 0.9, p.y))); }
float legR(float y) {
  float r = mix(0.066, 0.08, smoothstep(0.44, 0.53, y));             // holeň → koleno
  r = mix(r, 0.122 + 0.02 * smoothstep(0.65, 0.92, y), smoothstep(0.56, 0.64, y)); // kalhoty
  return r * (1.0 + 0.25 * (uInfl - 1.0));
}
`;
const BODY_NORMAL = `
vec3 objectNormal = vec3( normal );
{
  float tm = torsoM(position);
  if (tm > 0.0) {
    vec2 h = vec2(position.x, position.z - 0.01), R = torsoR(position.y);
    vec3 rad = normalize(vec3(h.x / (R.x * R.x), 0.0, h.y / (R.y * R.y)) + vec3(0.0, 0.0001, 0.0));
    objectNormal = normalize(mix(objectNormal, rad, tm * 0.85));
  }
  float lm = legM(position);
  if (lm > 0.0) {
    vec2 h = vec2(position.x, position.z) - legC(position);
    float r = length(h);
    if (r > 1e-4 && r < legR(position.y)) objectNormal = normalize(mix(objectNormal, vec3(h.x / r, 0.0, h.y / r), lm * 0.8));
  }
}
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`;
const BODY_VERT = `
vec3 transformed = vec3( position );
vPos = position; vArm = aArm;
{
  float lm = legM(position);
  if (lm > 0.0) {
    vec2 c = legC(position), h = vec2(position.x, position.z) - c;
    float r = length(h), R = legR(position.y);
    if (r > 1e-4) { float nr = mix(r, max(r, R), lm); transformed.x = c.x + h.x / r * nr; transformed.z = c.y + h.y / r * nr; }
  }
}
{
  float tm = torsoM(position);
  if (tm > 0.0) {
    vec2 h = vec2(position.x, position.z - 0.01), R = torsoR(position.y);
    float r = length(h);
    if (r > 1e-4) {
      vec2 d = h / r;
      float Re = 1.0 / sqrt(d.x * d.x / (R.x * R.x) + d.y * d.y / (R.y * R.y));
      float nr = mix(r, max(r, Re), tm);
      transformed.x = d.x * nr; transformed.z = 0.01 + d.y * nr;
    }
  }
}
{
  float ax = abs(position.x), y = position.y;
  float armM = aArm;
  float bodyM = 1.0 - armM;
  float inf = 0.0;
  float back = smoothstep(0.02, -0.06, position.z);
  inf += bodyM * smoothstep(0.56, 0.62, y) * (1.0 - smoothstep(0.9, 0.97, y)) * 0.0; // kalhoty: tvar řeší válec kolem osy nohy
  inf += bodyM * smoothstep(0.97, 1.04, y) * (1.0 - smoothstep(1.46, 1.5, y)) * (0.012 + 0.02 * smoothstep(1.25, 1.42, y)); // dres
  // chrániče holení: tvar řeší válec kolem osy nohy
  inf += armM * (1.0 - smoothstep(0.64, 0.68, ax)) * (0.03 + 0.03 * (1.0 - smoothstep(0.2, 0.34, ax)));   // rukávy, ramenní chrániče
  inf += armM * exp(-pow((ax - 0.45) / 0.035, 2.0)) * 0.018;                                         // loketní chránič
  inf += armM * smoothstep(0.64, 0.68, ax) * 0.02;                                                   // rukavice
  transformed += normal * inf * uInfl;
}
`;
const BODY_FRAG_HEAD = `
uniform vec3 uJersey, uStripe, uTrim, uPants, uGlove, uSkin, uSock;
uniform sampler2D uNum;
uniform sampler2D uFab;
uniform float uRef, uStyle, uYoke, uHasMap, uKit, uHem;
varying vec3 vPos;
varying float vArm;
// pruhy (lem dresu, rukávy, štulpny): t = vzdálenost od okraje v metrech
vec3 band(vec3 base, float t) {
  vec3 c = base;
  if (uStyle < 0.5) {            // klasika: široký pruh lemovaný linkami
    if (t > 0.035 && t < 0.085) c = uStripe;
    if ((t > 0.026 && t < 0.035) || (t > 0.085 && t < 0.094)) c = uTrim;
  } else if (uStyle < 1.5) {     // dva pruhy
    if ((t > 0.03 && t < 0.052) || (t > 0.066 && t < 0.088)) c = uStripe;
    if (t > 0.052 && t < 0.066) c = uTrim;
  } else if (uStyle < 2.5) {     // široký pás s linkou uprostřed
    if (t > 0.02 && t < 0.1) c = uStripe;
    if (t > 0.055 && t < 0.065) c = uTrim;
  } else {                       // tři tenké pruhy
    if ((t > 0.03 && t < 0.045) || (t > 0.06 && t < 0.075) || (t > 0.09 && t < 0.105)) c = uStripe;
  }
  return c;
}
`;
const BODY_FRAG = `
{
  float ax = abs(vPos.x), y = vPos.y;
  vec3 c;
  float fab = 1.0;
  if (vArm > 0.5 && uRef > 0.5) {
    // rozhodčí: pruhované rukávy, hlavní má oranžové pásky
    c = fract(atan(y - 1.438, vPos.z) / 6.2832 * 8.0) < 0.5 ? uJersey : uStripe;
    if (ax > 0.66) c = uGlove;
    else if (ax > 0.6) c = uStripe;
    else if (uRef > 1.5 && ax > 0.27 && ax < 0.33) c = vec3(1.0, 0.35, 0.0);
  } else if (vArm > 0.5) {
    // rukáv: barva dresu, pruhy u lokte, manžeta, sedlo přes rameno
    c = uJersey;
    if (ax > 0.66) c = uGlove;
    else {
      c = band(c, 0.615 - ax + 0.06);
      if (ax > 0.6) c = uStripe;
      if (uYoke > 0.5 && ax < 0.3 && y > 1.44) c = uStripe;
      if (uYoke > 0.5 && ax > 0.3 && ax < 0.308 && y > 1.44) c = uTrim;
      fab = 0.97 + 0.03 * sin(ax * 140.0);
    }
    // číslo na horní straně ramen / rukávů (čitelné z kamery shora)
    if (ax > 0.19 && ax < 0.35 && y > 1.445) {
      vec2 st = vec2((ax - 0.19) / 0.16, 0.5 - sign(vPos.x) * vPos.z / 0.17);
      vec4 t = texture2D(uNum, vec2(st.x * 0.5, 0.11 + clamp(st.y, 0.0, 1.0) * 0.6));
      c = mix(c, t.rgb, t.a * step(0.0, st.y) * step(st.y, 1.0));
    }
  } else if (y > 1.535 && ax < 0.15) c = uHasMap > 0.5 ? diffuseColor.rgb : uSkin;
  else if (y > 1.5 && ax < 0.08) c = vec3(0.06);     // chránič krku
  else if (y > 0.99 && uRef > 0.5) {
    c = fract(atan(vPos.x, vPos.z) / 6.2832 * 14.0) < 0.5 ? uJersey : uStripe;
    if (y > 1.44) c = uStripe;
  } else if (y > 0.99) {
    // dres: lem s pruhy, sedlo s lemovkou, límec do V se šněrováním, znak, záda se jménem a číslem
    c = band(uJersey, y - 0.99);
    if (uHem > 0.5 && y < 1.012) c = uTrim;                                 // spodní lem v barvě lemovky
    if (uYoke > 0.5) {
      float yk = 1.425 + (vPos.z > 0.0 ? 0.02 : 0.0) - ax * 0.12;
      if (y > yk) c = uStripe; else if (y > yk - 0.009) c = uTrim;
    } else if (y > 1.485) c = uStripe;
    if (y > 1.47 && ax < 0.11) c = uTrim;                                   // límec
    if (vPos.z > 0.02 && y > 1.42 && ax < (y - 1.42) * 0.5 + 0.004) {      // výstřih do V
      c = uTrim;
      if (ax < (y - 1.42) * 0.5 - 0.008) c = uStripe * 0.6;
      if (ax < 0.004 && fract(y * 60.0) < 0.5) c = uTrim;                   // šněrování
    }
    if (vPos.z < -0.03 && ax < 0.15 && y > 1.1 && y < 1.44) {
      vec4 t = texture2D(uNum, vec2((0.15 - vPos.x) / 0.6, (y - 1.1) / 0.34));
      c = mix(c, t.rgb, t.a);
    } else if (vPos.z > 0.03 && ax < 0.1 && y > 1.2 && y < 1.4) {
      vec4 t = texture2D(uNum, vec2(0.5 + (vPos.x + 0.1) / 0.4, (y - 1.2) / 0.2));
      c = mix(c, t.rgb, t.a);
    }
    // látka: jemné záhyby
    fab = 0.95 + 0.05 * sin(y * 95.0 + sin(vPos.x * 30.0) * 2.0);
  } else if (y > 0.585) {
    // kalhoty: pas, boční pruh s linkami
    c = uPants;
    if (y > 0.955) c = uPants * 0.55;
    if (y < 0.66 && y > 0.625) c = uStripe;                                  // lem nohavic
    if ((y < 0.672 && y > 0.66) || (y < 0.625 && y > 0.613)) c = uTrim;
    fab = 0.93 + 0.07 * smoothstep(0.62, 0.7, y) * (1.0 - smoothstep(0.88, 0.95, y)) * sin(y * 70.0);
  } else if (y > 0.115) {
    // štulpny: stejné pruhy jako dres
    c = band(uSock, y - 0.29);
  } else c = vec3(0.03);
  if (uKit > 1.5 && uRef < 0.5) {
    // vodní pólo: plavky, jinak holá kůže
    if (vArm > 0.5 || y > 0.99 || y <= 0.6) { c = uSkin; fab = 1.0; } else c = uPants;
  } else if (uKit > 0.5 && uRef < 0.5) {
    // fotbalový dres: krátký rukáv, trenýrky nad kolena, podkolenky
    if (vArm > 0.5) { if (ax > 0.66) c = uGlove; else if (ax > 0.42) c = uSkin; }
    else if (y > 1.5 && y <= 1.535 && ax < 0.08) c = uSkin;
    else if (y <= 0.72 && y > 0.5) { c = uSkin; fab = 1.0; }
    else if (y <= 0.5 && y > 0.115) c = uSock;
  }
  // struktura látky (gfx/fabric.jpg): síťovina dresu promítnutá zepředu a z boku; kůže ji nemá
  if (distance(c, uSkin) > 0.02) fab *= 0.72 + 0.56 * mix(texture2D(uFab, vPos.xy * 0.9).r, texture2D(uFab, vPos.zy * 0.9).r, smoothstep(0.12, 0.2, abs(vPos.z)));
  diffuseColor.rgb = c * fab;
}
`;

// sdílená textura látky; dokud se nenačte, je jednobarevně šedá (vzhled se nemění)
let _fabTex = null;
function fabricTex() {
  if (_fabTex) return _fabTex;
  const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, 2, 2);
  _fabTex = new THREE.Texture(c); _fabTex.wrapS = _fabTex.wrapT = THREE.RepeatWrapping; _fabTex.needsUpdate = true;
  const im = new Image(); im.onload = () => { _fabTex.dispose(); _fabTex.image = im; _fabTex.needsUpdate = true; }; im.src = 'gfx/fabric.jpg';   // dispose: jiná velikost než zástupná textura
  return _fabTex;
}
function bodyMaterial(T, p) {
  const [c, g] = mkCanvas(1024, 640);
  if (p.isRef) return bodyMaterialFinish(T, p, c, true);
  const trim = T.trim || '#ffffff';
  const outer = lightness(T.stripe) > 0.85 && lightness(T.jersey) > 0.7 ? T.def.c1 : T.stripe;
  // levá polovina: záda (jméno + číslo s dvojitým obrysem)
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = 'bold 78px "DejaVu Sans", Arial, sans-serif';
  const nm = p.name.toUpperCase(); const nw = g.measureText(nm).width;
  g.save(); g.translate(256, 72); g.scale(Math.min(1, 440 / nw), 1);
  g.lineWidth = 8; g.strokeStyle = outer; g.strokeText(nm, 0, 0); g.fillStyle = T.numCol; g.fillText(nm, 0, 0); g.restore();
  g.font = 'bold 400px "DejaVu Sans", Arial, sans-serif';
  const num = String(p.num), w = g.measureText(num).width;
  g.save(); g.translate(256, 384); g.scale(Math.min(1, 470 / w), 1);
  g.lineWidth = 46; g.strokeStyle = outer; g.strokeText(num, 0, 0);
  g.lineWidth = 22; g.strokeStyle = trim === T.numCol ? T.def.c3 : trim; g.strokeText(num, 0, 0);
  g.fillStyle = T.numCol; g.fillText(num, 0, 0); g.restore();
  // pravá polovina: znak týmu na hrudi (textura je v poměru 1 : 1.25, proto protažení)
  g.save(); g.translate(768, 320); g.scale(1, 1.25);
  drawEmblem(g, T.def, 440);
  g.restore();
  return bodyMaterialFinish(T, p, c, false);
}
function bodyMaterialFinish(T, p, c, ref) {
  const tex = canvasTex(c, true, 4);
  const trim = T.trim || '#ffffff';
  const col = (h) => new THREE.Color(h);
  const idx = TEAMS.indexOf(T.def), kit = SPORT === 'hockey' && T.def ? KITS[T.def.abbr] : null;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  m.userData.uniforms = {
    uInfl: { value: p.isGoalie && SPORT === 'hockey' ? 1.55 : 1 }, uFoot: { value: SPORT !== 'hockey' ? 1 : 0 }, uKit: { value: SPORT === 'football' ? 1 : SPORT === 'polo' ? 2 : 0 },
    uJersey: { value: col(T.jersey) }, uStripe: { value: col(T.stripe) }, uTrim: { value: col(trim) },
    uPants: { value: col(T.pants) }, uGlove: { value: col(ref ? '#d6a184' : SPORT === 'polo' || SPORT === 'curling' ? '#d6a184' : p.isGoalie ? '#f2f2f2' : SPORT === 'football' ? '#d6a184' : (T.helmet === T.jersey ? T.pants : T.helmet)) },
    uSkin: { value: col('#d6a184') }, uSock: { value: col(ref ? '#111111' : T.jersey) }, uNum: { value: tex }, uFab: { value: fabricTex() },
    uRef: { value: ref ? (p.kind === 'R' ? 2 : 1) : 0 },
    uHasMap: { value: 0 },
    uStyle: { value: ref ? 0 : kit ? kit.style : (idx < 0 ? 0 : idx % 4) }, uYoke: { value: ref ? 0 : kit ? kit.yoke : (idx < 0 ? 1 : (idx * 7 % 3 ? 1 : 0)) }, uHem: { value: !ref && kit && kit.hem ? 1 : 0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = BODY_VERT_HEAD + LEG_FN + sh.vertexShader.replace('#include <beginnormal_vertex>', BODY_NORMAL).replace('#include <begin_vertex>', BODY_VERT);
    sh.fragmentShader = BODY_FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + BODY_FRAG);
  };
  m.customProgramCacheKey = () => 'hokej-body7';
  m.userData.tex = tex;
  return m;
}

// helma s číslem vzadu a po stranách
function helmetMaterial(T, p) {
  const [c, g] = mkCanvas(512, 128);
  g.fillStyle = T.helmet; g.fillRect(0, 0, 512, 128);
  // větrací otvory na temeni a hrana skořepiny
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (const [u, w] of [[128, 14], [104, 10], [152, 10], [384, 16], [356, 10], [412, 10]]) g.fillRect(u - w / 2, 34, w, 22);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 120, 512, 8);
  if (!p.isRef) {
    const nc = lightness(T.helmet) > 0.55 ? '#111111' : '#ffffff';
    g.fillStyle = nc; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 54px "DejaVu Sans", Arial, sans-serif';
    g.fillText(String(p.num), 384, 88);
    // znak na bocích helmy
    for (const x of [0, 256, 512]) { g.save(); g.translate(x, 74); g.scale(1.25, 1); drawEmblem(g, T.def, 56); g.restore(); }
  }
  const m = new THREE.MeshPhysicalMaterial({ map: canvasTex(c, true, 4), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
  return m;
}

// ---------- model hráče ----------
// kosti postavy (Quaternius/UE) → jména, se kterými pracuje animační kód (Mixamo)
const BONE_ALIAS = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head' };
for (const [s, S] of [['l', 'Left'], ['r', 'Right']]) Object.assign(BONE_ALIAS, {
  ['clavicle_' + s]: S + 'Shoulder', ['upperarm_' + s]: S + 'Arm', ['lowerarm_' + s]: S + 'ForeArm', ['hand_' + s]: S + 'Hand',
  ['middle_01_' + s]: S + 'HandMiddle1', ['thigh_' + s]: S + 'UpLeg', ['calf_' + s]: S + 'Leg', ['foot_' + s]: S + 'Foot', ['ball_' + s]: S + 'ToeBase' });
// polohy kloubů původní figuríny (výstroj je laděná vůči nim, na nové postavě se posune s klouby)
const XB = { Head: [0, 1.596, -0.01], LeftFoot: [0.082, 0.084, -0.022], LeftHand: [0.713, 1.438, -0.05], LeftLeg: [0.082, 0.529, 0.008], LeftUpLeg: [0.082, 0.972, 0.005] };
// jednorázová příprava sdílené postavy: dekvantizace geometrie (shader barví podle polohy v metrech)
function prepBase(scene) {
  if (scene.userData.prepped) return; scene.userData.prepped = true;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry;
    for (const k of ['position', 'normal']) {
      const a = g.attributes[k]; if (!a || a.array instanceof Float32Array && !a.normalized) continue;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      g.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
    g.applyMatrix4(o.matrix); o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
    o.updateMatrixWorld(true);
    // u kvantizovaných skinovaných sítí je převod na metry schovaný v inverzních maticích kostí:
    // D = kost(svět) × inverze → přenést do geometrie a z inverzí odebrat
    const sk = o.skeleton;
    sk.bones.forEach((b) => b.updateMatrixWorld(true));
    const D = new THREE.Matrix4().multiplyMatrices(o.matrixWorld.clone().invert(), new THREE.Matrix4().multiplyMatrices(sk.bones[0].matrixWorld, sk.boneInverses[0]));
    const isId = D.elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-5);
    if (!isId) {
      g.applyMatrix4(D);
      const Di = D.clone().invert();
      sk.boneInverses.forEach((m) => m.multiply(Di));
    }
    // podíl vah kostí paže → rukáv (barvení nezávislé na tvaru postavy)
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, armB = new Set();
    o.skeleton.bones.forEach((b, i) => { if (/upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|Arm|Hand/.test(b.name) && !/clavicle|Shoulder/.test(b.name)) armB.add(i); });
    const arm = new Float32Array(g.attributes.position.count);
    if (si && sw) for (let i = 0; i < arm.length; i++) {
      let a = 0; for (let k = 0; k < 4; k++) if (armB.has(si.getComponent(i, k))) a += sw.getComponent(i, k);
      arm[i] = a;
    }
    g.setAttribute('aArm', new THREE.BufferAttribute(arm, 1));
    o.updateMatrixWorld(true); o.bind(o.skeleton, o.matrixWorld);
    g.computeBoundingSphere();
  });
}

class HModel {
  constructor(G, p) {
    this.G = G; this.goalie = p.isGoalie; this.turn = 0; this.phase = Math.random() * 6.28;
    const T = p.team, tm = G.teamMats(T);
    this.isRef = !!p.isRef;
    this.helmetMat = helmetMaterial(T, p);
    this.root = new THREE.Group();
    prepBase(G.base.scene);
    const sc = SkeletonUtils.clone(G.base.scene);
    this.root.add(sc);
    this.mat = bodyMaterial(T, p);
    const B = this.b = {}, U = this.ue = {}, bodyMesh = [];
    sc.traverse((o) => {
      if (o.isBone) { U[o.name] = o; B[BONE_ALIAS[o.name] || o.name.replace('mixamorig', '')] = o; }
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        // oči a obočí si nechají vlastní materiál, tělo dostane dres a výstroj
        if (/eye/i.test(o.name)) { o.castShadow = false; return; }
        if (o.material && o.material.map && !this.mat.map) { this.mat.map = o.material.map; this.mat.userData.uniforms.uHasMap.value = 1; }
        o.material = this.mat; o.castShadow = true; bodyMesh.push(o);
      }
    });
    this.root.updateMatrixWorld(true);
    this.bones = Object.values(U).length ? Object.values(U) : Object.values(B);
    this.bind = this.bones.map((b) => [b.quaternion.clone(), b.position.clone()]);
    // výstroj (v metrech, v bind póze) připnutá ke kostem
    const bname = new Map(Object.entries(B).map(([k, v]) => [v, k]));
    const add = (bone, geo, mat, x, y, z, shadow = true) => {
      // posun o rozdíl polohy kloubu oproti původní figuríně
      const k = bname.get(bone), right = /^Right/.test(k), ref = XB[right ? k.replace('Right', 'Left') : k];
      if (ref) { const w = wpos(bone); x += w.x - (right ? -ref[0] : ref[0]); y += w.y - ref[1]; z += w.z - ref[2]; }
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow;
      this.root.add(m); m.updateMatrixWorld(true); bone.attach(m); return m;
    };
    const blk = G.mat.boot, steel = G.mat.steel, white = G.mat.whitePlastic;
    const foot = this.foot = SPORT !== 'hockey';   // ostatní sporty: žádné brusle s noži, helma, rukavice (hůl jen jako koště v curlingu)
    this.kit = SPORT;
    for (const s of [1, -1]) {
      const F = s > 0 ? B.LeftFoot : B.RightFoot, x = s * 0.082;
      add(F, G.hgeo.boot, blk, x, 0.06, 0.04);
      add(F, G.hgeo.toeCap, blk, x, 0.035, 0.15);
      if (foot) continue;
      add(F, G.hgeo.tendon, blk, x, 0.12, -0.07);
      add(F, G.hgeo.holder, white, x, -0.005, 0.045);
      add(F, G.hgeo.runner, steel, x, -0.032, 0.045, false);
    }
    if (foot) {
      // vlasy: přiléhavá čepička v přirozené barvě (podle jména, ať je hráč pořád stejný)
      let hh = 5; for (const ch of String(p.name) + p.num) hh = (hh * 31 + ch.charCodeAt(0)) >>> 0;
      const hair = add(B.Head, G.hgeo.helmet, new THREE.MeshStandardMaterial({ color: SPORT === 'polo' ? new THREE.Color(p.isGoalie ? '#d0101a' : T.jersey) : [0x2a1d14, 0x4a3320, 0x7a5a32, 0xc9a45a, 0x1a1a1c, 0x8a4a22][hh % 6], roughness: SPORT === 'polo' ? 0.5 : 0.95 }), 0, 1.675, -0.012);   // vlasy / čepička
      hair.scale.multiplyScalar(0.9);
    } else if (p.isRef) {
      add(B.Head, G.hgeo.helmet, this.helmetMat, 0, 1.69, -0.006);
    } else if (!p.isGoalie) {
      add(B.Head, G.hgeo.helmet, this.helmetMat, 0, 1.69, -0.006);
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
    // výška hráče (mírně): vyšší hráč je větší model
    this.fsc = SPORT === 'football' ? 0.62 : 1;   // fotbal: menší postavy, ať hřiště působí větší
    this.root.scale.setScalar(this.fsc * FT * (p.cm && !p.isRef ? 1 + (p.cm / 184 - 1) * 0.8 : 1));
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
    else { const cu = SPORT === 'curling'; this.blade = sm(cu ? G.geo.broom : G.geo.blade, cu ? G.mat.broom : G.mat.blade); this.tape = sm(G.hgeo.tape, G.mat.tape); this.tape.visible = !cu; }
    G.scene.add(this.root, this.stick);
  }
  setVisible(v) { this.root.visible = v; this.stick.visible = v && !this.isRef && (!this.foot || this.kit === 'curling'); }
  dispose() {
    this.helmetMat.map.dispose(); this.helmetMat.dispose();
    this.G.scene.remove(this.root, this.stick);
    this.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    this.mat.userData.tex.dispose(); this.mat.dispose();
  }
  // vrstva motion capture: vzorek klipu na horní polovinu těla (váha w)
  applyClip(name, frac, w) {
    const C = this.G.clips && this.G.clips[name]; if (!C || w <= 0) return false;
    const tt = clamp(frac, 0, 1) * C.duration;
    for (const tr of C.tracks) {
      const b = this.ue[tr.bone]; if (!b || !UPPER.has(tr.bone)) continue;
      _hq3.fromArray(tr.interp.evaluate(tt)); b.quaternion.slerp(_hq3, w);
    }
    this.root.updateMatrixWorld(true);
    return true;
  }
  // co právě hraje: střela (golfový švih z mocapu), oslava gólu (plácnutí)
  clipState(p) {
    if (this.isRef || this.goalie || !this.G.clips || p.downT > 0) return null;
    if (p.celebT > 0) {
      // oslava gólu: každý hráč má svou (plácnutí, radost, mávání do hlediště)
      const k = Math.min(1, p.celebT), kind = ['highfive', 'joy', 'wave'][(p.num || 0) % 3], C = this.G.clips[kind];
      if (kind === 'highfive' || !C) return { clip: 'highfive', frac: 0.42 + 0.22 * (0.5 + 0.5 * Math.sin(p.celebT * 5)), w: k, yaw: 0 };
      return { clip: kind, frac: (Math.max(0, 3 - p.celebT) / C.duration) % 1, w: k, yaw: 0 };
    }
    return null;
  }
  reset() { this.bones.forEach((b, i) => { b.quaternion.copy(this.bind[i][0]); b.position.copy(this.bind[i][1]); }); }
  pose(p, t) {
    // rychlost otáčení (pro náklon v zatáčce a překládání)
    const dtp = clamp(t - (this.lastT == null ? t : this.lastT), 0, 0.1); this.lastT = t; this.dtp = dtp;
    if (this.prevDir != null && dtp > 0) { const tr = angDiff(this.prevDir, p.dir) / dtp; this.turn += (clamp(tr, -6, 6) - this.turn) * Math.min(1, dtp * 8); }
    this.prevDir = p.dir;
    // střela: postoj bokem k cíli (jako při golfovém švihu z mocapu); plynulý přechod
    const cs = this.clipState(p);
    this.cs = cs;
    this.yawK = (this.yawK || 0) + ((cs ? cs.yaw * cs.w : 0) - (this.yawK || 0)) * Math.min(1, dtp * 14);
    const d = p.dir - Math.PI / 2 * this.yawK, c = Math.cos(d), s = Math.sin(d);
    const O = new THREE.Vector3(p.x, 0, -p.y), F = new THREE.Vector3(c, 0, -s), Lv = new THREE.Vector3(-s, 0, -c);
    const fs = this.fsc, J = (a, b, z) => new THREE.Vector3(O.x + (F.x * a + Lv.x * b) * fs, z * fs, O.z + (F.z * a + Lv.z * b) * fs);   // menší postava: míry pózy ve stejném poměru
    this.reset();
    this.root.quaternion.setFromAxisAngle(UPV, Math.atan2(F.x, F.z));
    this.stick.position.set(0, 0, 0); this.stick.quaternion.identity();
    const down = p.downT > 0;
    if (this.isRef) return this.poseRef(p, t, O, F, Lv, J);
    if (this.kit === 'polo') this.posePolo(p, t, O, F, Lv, J);
    else if (this.foot) this.poseFoot(down ? { ...p, spdN: 0, windT: 0, stride: 0 } : p, t, O, F, Lv, J);
    else if (this.goalie) this.poseGoalie(p, t, O, F, Lv, J);
    else this.poseSkater(down ? { ...p, spdN: 0, windT: 0, pokeA: 0, carry: false, stride: 0 } : p, t, O, F, Lv, J, down);
    if (down && !(this.foot && p.slideT > 0) && this.kit !== 'polo') {
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
    const chk = !down && p.checkT > 0 ? Math.sin(clamp(p.checkT / 0.4, 0, 1) * Math.PI) : 0;   // bodyček: rameno dopředu
    // směr akce (přihrávka, střela) omezený na to, kam hůl před tělem dosáhne
    const aimA = (a) => (a == null ? p.dir : p.dir + clamp(angDiff(p.dir, a), -1.9, 1.9));
    // postoj na buly: vhazující hluboko v předklonu s holí na ledě, ostatní v připraveném podřepu
    const take = !down && p.foTake ? 1 : 0, ready = !down && (p.foReady || take) ? 1 : 0, swipe = p.foSwipe > 0 ? p.foSwipe / 0.35 : 0;
    const breathe = Math.sin(t * 2.6 + this.phase) * 0.03 * (1 - spd);
    // plynulé bruslení: z pohybu modelu se odhadne zrychlení, brzdění a jízda vzad a póza mezi nimi plynule přechází
    const dts = this.dtp || 0, K = (r) => Math.min(1, dts * r);
    if (this.so && dts > 0 && !down) {
      const vx = (O.x - this.so.x) / dts, vz = (O.z - this.so.z) / dts, v = Math.hypot(vx, vz);
      if (v < 90) {
        const a0 = (v - (this.sv || 0)) / dts; this.sv = v;
        this.sAcc = (this.sAcc || 0) + (clamp(a0, -90, 90) - (this.sAcc || 0)) * K(7);
        const fwd = v > 2 ? (vx * F.x + vz * F.z) / v : 1, side = v > 2 ? (vx * Lv.x + vz * Lv.z) / v : 0;
        this.sBack = (this.sBack || 0) + ((fwd < -0.25 ? 1 : 0) - (this.sBack || 0)) * K(6);
        this.sSide = (this.sSide || 0) + (side - (this.sSide || 0)) * K(6);
      }
    }
    this.so = this.so || new THREE.Vector3(); this.so.copy(O);
    const acc = down ? 0 : this.sAcc || 0, back = down ? 0 : this.sBack || 0;
    const push = clamp(0.35 + acc / 22 + (p.turbo ? 0.4 : 0), 0.22, 1.15) * (1 - back * 0.4);   // síla odrazu: při rozjezdu dlouhé kroky, při dojezdu klouže
    const brake = spd > 0.2 ? clamp((-acc - 24) / 34, 0, 1) : 0, bs = (this.sSide || 0) >= 0 ? 1 : -1;   // prudké brzdění: zastavení hranami bokem
    this.sPush = (this.sPush == null ? push : this.sPush + (push - this.sPush) * K(5)); this.sBrake = (this.sBrake || 0) + (brake - (this.sBrake || 0)) * K(brake > (this.sBrake || 0) ? 14 : 5);
    const pw = this.sPush, br = this.sBrake;
    const drop = down ? 0.05 : 0.32 + 0.5 * spd * (0.75 + 0.3 * pw) + 0.4 * wind + 0.25 * ready + 0.25 * take + breathe + 0.3 * br + 0.12 * back;
    this.root.position.set(O.x, 0.15 - drop, O.z);
    this.root.updateMatrixWorld(true);
    // trup: předklon, kolébání do stran při odrazu
    const cs = this.cs, cw0 = cs ? cs.w : 0;
    rotAxis(B.Hips, Lv, (down ? 0.05 : (0.38 + 0.32 * spd * (0.6 + 0.5 * pw) + 0.15 * wind + 0.18 * ready + 0.22 * take) * (1 - 0.75 * br) * (1 - 0.45 * back) - 0.12 * br) * (1 - 0.55 * cw0));
    rotAxis(B.Hips, UPV, Math.sin(ph) * 0.14 * spd * pw + bs * br * 0.55);   // při brzdění se boky stočí napříč jízdě
    if (br > 0) rotAxis(B.Hips, F, -bs * br * 0.3);
    const turn = down ? 0 : this.turn, cross = clamp(Math.abs(turn) * spd / 2.2, 0, 1), ts = Math.sign(turn);
    rotAxis(B.Hips, F, Math.sin(ph) * 0.06 * spd - clamp(turn * 0.09 * spd, -0.32, 0.32)); // náklon do zatáčky
    const tired = p.stamina != null ? 1 - clamp(p.stamina / 0.45, 0, 1) : 0;   // unavený hráč se hrbí
    const lean = down ? 0.1 : (0.3 + 0.35 * spd * (0.55 + 0.55 * pw)) * (1 - 0.6 * br) * (1 - 0.4 * back) + 0.15 * wind + 0.2 * ready + 0.3 * take - 0.25 * swipe + 0.35 * chk + 0.16 * tired;
    if (p.stagT > 0 && !down) rotAxis(B.Hips, F, Math.sin(p.stagT * 22) * 0.16 * (p.stagT / 0.4));   // zapotácení po srážce
    if (p.battleT > 0 && !down && p.battleDir != null) { const rel = angDiff(p.dir, p.battleDir), k = Math.min(1, p.battleT / 0.1); rotAxis(B.Hips, UPV, clamp(rel, -1.1, 1.1) * 0.7 * k); rotAxis(B.Hips, Lv, (0.3 + Math.sin(t * 13 + this.phase) * 0.07) * k); }   // souboj: rameno do soupeře, tlačí se a cuká
    if (chk > 0) rotAxis(B.Spine1, UPV, (p.hip ? 0.9 : 0.5) * p.hand * chk);
    if (cs) this.applyClip(cs.clip, cs.frac, cs.w);
    for (const b of [B.Spine, B.Spine1, B.Spine2]) rotAxis(b, Lv, lean / 3 * (1 - cw0));
    rotAxis(B.Spine1, UPV, -Math.sin(ph) * 0.12 * spd + p.hand * wind * 0.35 + p.hand * swipe * 0.5);
    const headUp = -(0.38 + 0.32 * spd + 0.15 * wind + lean) * 0.8;
    rotAxis(B.Neck, Lv, headUp * 0.55); rotAxis(B.Head, Lv, headUp * 0.45);
    // nohy: střídavé odrazy do stran
    const sw = Math.sin(ph) * spd * clamp(pw, 0.2, 1.1), cw = Math.cos(ph);
    // odraz do strany a dozadu, návrat pod tělo; v zatáčce vnější brusle překračuje vnitřní
    let latL = 0.48 + 0.75 * Math.max(0, -sw) + 0.22 * ready + 0.15 * take, latR = -0.48 - 0.75 * Math.max(0, sw) - 0.22 * ready - 0.15 * take;
    if (cross > 0) {
      const outerUp = Math.max(0, ts > 0 ? sw : -sw), innerPush = Math.max(0, ts > 0 ? -sw : sw);
      if (ts > 0) { latR = lerp(latR, 0.55 * outerUp - 0.3, cross); latL = lerp(latL, 0.35 - 0.9 * innerPush, cross); }
      else { latL = lerp(latL, -0.55 * outerUp + 0.3, cross); latR = lerp(latR, -0.35 + 0.9 * innerPush, cross); }
    }
    // jízda vzad: brusle kreslí střídavé obloučky do stran bez zvedání; brzdění: obě brusle napříč před tělem
    const fw = 1 - 0.85 * back, lift = 0.45 * spd * clamp(pw, 0.2, 1) * (1 - back) * (1 - br);
    if (back > 0) { latL += 0.35 * back * Math.max(0, cw) * spd; latR -= 0.35 * back * Math.max(0, -cw) * spd; }
    const fL = J(0.15 - 1.0 * sw * fw, latL, Math.max(0, cw) * lift), fR = J(0.15 + 1.0 * sw * fw, latR, Math.max(0, -cw) * lift);
    if (br > 0) { fL.lerp(J(0.75 + 0.25 * bs, 0.5 + 0.1 * bs, 0), br); fR.lerp(J(0.75 - 0.25 * bs, -0.5 + 0.1 * bs, 0), br); }
    const poleL = F.clone().addScaledVector(Lv, 0.25), poleR = F.clone().addScaledVector(Lv, -0.25);
    this.legs(fL, fR, poleL, poleR, 0.15 + 0.5 * Math.max(0, -sw), -0.15 - 0.5 * Math.max(0, sw), F);
    // hůl a ruce
    const bo = bladeOffset(p.dir, p.hand, p.carry && !wind, t, wind, poke, p.reach || (p.ref && p.ref.reach) || 1, p.stk);
    if (p.carry && p.pkOff && !wind) { bo[0] = p.pkOff[0]; bo[1] = p.pkOff[1]; }   // čepel přesně u puku
    {
      const fx = Math.cos(p.dir), fy = Math.sin(p.dir), lx = -fy, ly = fx;
      // buly: čepel na ledě u bodu vhazování, hůl se mírně chvěje, po vhození rychlé švihnutí dozadu
      if (take) { const jig = Math.sin(t * 9 + this.phase) * 0.12; bo[0] = fx * 3.1 + lx * (p.hand * 0.2 + jig); bo[1] = fy * 3.1 + ly * (p.hand * 0.2 + jig); bo[2] = 0; }
      else if (ready && !p.carry) { bo[0] = fx * 3.4 + lx * p.hand * 0.9; bo[1] = fy * 3.4 + ly * p.hand * 0.9; bo[2] = 0; }
      if (swipe > 0) { const k = Math.sin(swipe * Math.PI); bo[0] += (-fx * 1.6 + lx * p.hand * 1.4) * k; bo[1] += (-fy * 1.6 + ly * p.hand * 1.4) * k; }
      // přihrávka: krátký švih čepele dopředu po ledě
      const pf = p.passFT > 0 ? Math.sin(clamp(p.passFT / 0.22, 0, 1) * Math.PI) : 0;
      if (pf > 0) { const a = aimA(p.actDir), ax = Math.cos(a), ay = Math.sin(a); bo[0] = lerp(bo[0], ax * 4.0, pf); bo[1] = lerp(bo[1], ay * 4.0, pf); bo[2] = lerp(bo[2], 0.35, pf); rotAxis(B.Spine1, UPV, -p.hand * pf * 0.25); }
      // šťouchnutí / zvednutí hole: čepel jede přesně tam, kde hra počítá zásah
      if (poke > 0 && p.pokeDir != null) { const pb = pokeBlade(p.pokeDir, poke, p.reach || 1); bo[0] = pb[0]; bo[1] = pb[1]; bo[2] = p.pokeLift && poke < 0.5 ? 2.2 * Math.sin((1 - 2 * poke) * Math.PI) : 0; }
      // bodyček: hůl k tělu
      if (chk > 0) { bo[0] = lerp(bo[0], fx * 1.8 + lx * p.hand * 1.2, chk); bo[1] = lerp(bo[1], fy * 1.8 + ly * p.hand * 1.2, chk); bo[2] = lerp(bo[2], 1.6, chk); }
      // v klidu občas ťukne holí o led
      if (!p.carry && !ready && spd < 0.15 && !wind && !poke) bo[2] += Math.pow(Math.max(0, Math.sin(t * 3.1 + this.phase * 3)), 16) * 0.55;
    }
    // dokončení střely: hůl jde vysoko dopředu přes tělo
    const ftk = p.shotFT > 0 ? clamp(p.shotFT / (p.shotSlap ? 0.5 : 0.32), 0, 1) : 0;
    if (ftk > 0) {
      // protažení střely ve směru, kam puk letí: čepel od ledu rychle vpřed a nahoru, pak zpět (bekhend níž)
      const u = 1 - ftk, k = Math.sin(clamp(u / 0.3, 0, 1) * Math.PI * 0.5) * clamp((1 - u) / 0.45, 0, 1) * (p.shotSlap ? 1 : 0.75);
      const a = aimA(p.actDir), fx = Math.cos(a), fy = Math.sin(a), hi = (p.shotSlap ? 3.4 : 2.2) * (p.shotBh ? 0.5 : 1) * clamp(u / 0.3, 0, 1);
      bo[0] = lerp(bo[0], fx * 4.6 + fy * p.hand * 0.5, k); bo[1] = lerp(bo[1], fy * 4.6 - fx * p.hand * 0.5, k); bo[2] = lerp(bo[2], hi, k);
      rotAxis(B.Spine1, UPV, -p.hand * k * 0.45);
    }
    this.stick.visible = this.root.visible && !(p.noStick > 0);   // zlomená hůl: hráč je chvíli bez ní
    const heel = new THREE.Vector3(O.x + bo[0], bo[2] + 0.1, O.z - bo[1]);
    const H = wpos(B.Hips);
    const topSide = -p.hand; // horní ruka je na opačné straně než čepel
    // horní ruka drží konec hole u boku těsně před tělem (hůl tak vychází dlouhá a položená, ne krátká a strmá)
    const topT = H.clone().addScaledVector(F, 0.42 + poke * 0.9 - wind * 0.3 + ftk * 0.9).addScaledVector(Lv, topSide * (0.62 - ftk * 0.5)).add(new THREE.Vector3(0, 0.22 + wind * 1.8 + ftk * 1.3, 0));
    const [tA, tF, tH, tM] = topSide > 0 ? [B.LeftArm, B.LeftForeArm, B.LeftHand, B.LeftHandMiddle1] : [B.RightArm, B.RightForeArm, B.RightHand, B.RightHandMiddle1];
    const [bA, bF, bH, bM] = topSide > 0 ? [B.RightArm, B.RightForeArm, B.RightHand, B.RightHandMiddle1] : [B.LeftArm, B.LeftForeArm, B.LeftHand, B.LeftHandMiddle1];
    const dn = new THREE.Vector3(0, -1, 0);
    if (cs && cs.w > 0.5) { this.placeStick(J(0.5, p.hand * 1.1, 0.1), wpos(bH), F.clone(), F); return; }   // oslava: ruce podle klipu, hůl opřená o led u ruky (jinak by zůstala ležet tam, kde byla naposled)
    ik2(tA, tF, tH, topT, dn.clone().addScaledVector(Lv, topSide * 0.9).addScaledVector(F, -0.3), this.L.upper, this.L.fore);
    const top = wpos(tH);
    const sdir = new THREE.Vector3().subVectors(heel, top), slen = sdir.length(); sdir.divideScalar(slen);
    const freeArm = !p.carry && spd > 0.85 && pw > 0.6 && br < 0.1 && wind === 0 && poke === 0 && ftk === 0;   // jednou rukou jen v plném sprintu
    const sh = wpos(bA);
    if (freeArm) {
      const sw2 = Math.sin(ph + Math.PI) * spd;
      const tgt = sh.clone().addScaledVector(Lv, -topSide * 0.45).addScaledVector(F, sw2 * 1.1).add(new THREE.Vector3(0, -1.6 + Math.abs(sw2) * 0.5, 0));
      ik2(bA, bF, bH, tgt, dn.clone().addScaledVector(F, -0.5).addScaledVector(Lv, -topSide * 0.6), this.L.upper, this.L.fore);
    } else {
      // dolní ruka: bod na holi nejblíž rameni (dosažitelný)
      const tt = clamp(new THREE.Vector3().subVectors(sh, top).dot(sdir) / slen, 0.3, 0.46);   // spodní ruka zhruba ve třetině až polovině hole
      const tgt = top.clone().addScaledVector(sdir, slen * tt);
      ik2(bA, bF, bH, tgt, dn.clone().addScaledVector(Lv, -topSide * 0.8).addScaledVector(F, -0.2), this.L.upper, this.L.fore);
    }
    aimBone(tH, tM, top.clone().addScaledVector(sdir, 0.5));
    aimBone(bH, bM, wpos(bH).addScaledVector(sdir, 0.5));
    const ta = p.dir + p.hand * 0.7, toe = new THREE.Vector3(Math.cos(ta), 0, -Math.sin(ta));
    this.placeStick(heel, top, toe, F);
  }
  // ---------- vodní pólo: tělo pod hladinou, kraul, šlapání vody, hod ----------
  posePolo(p, t, O, F, Lv, J) {
    const B = this.b, G = this.goalie, spd = Math.min(1, (p.spdN || 0) / 9), ph = (p.stride || 0) * 2.2, wind = Math.min(1, p.windT || 0);
    const thr = Math.max(wind, p.shotFT > 0 ? p.shotFT / 0.5 : 0, p.passFT > 0 ? p.passFT / 0.3 : 0), sv = G && p.saveT > 0 ? 1 : 0;
    // při plavání leží tělo na vodě, jinak je venku jen hlava a ramena (při hodu a zákroku se vynoří)
    const up = Math.max(thr, sv) * 1.5 + (p.carry ? 0.25 : 0) + Math.sin(t * 2.4 + this.phase) * 0.12;
    this.root.position.set(O.x, -4.25 + up + 0.7 * spd, O.z); this.root.updateMatrixWorld(true);
    const lie = 1.15 * spd * (1 - Math.max(thr, sv));
    rotAxis(B.Hips, Lv, lie); rotAxis(B.Neck, Lv, -lie * 0.8);
    rotAxis(B.Hips, F, Math.sin(ph) * 0.25 * spd);
    const dn = new THREE.Vector3(0, -1, 0);
    for (const sd of [1, -1]) {
      const [A, Fa, Hd] = sd > 0 ? [B.LeftArm, B.LeftForeArm, B.LeftHand] : [B.RightArm, B.RightForeArm, B.RightHand];
      const sh = wpos(A), a = ph + (sd > 0 ? 0 : Math.PI), thrower = (p.hand >= 0) === (sd > 0);
      // kraul: paže krouží přes hladinu; v klidu hrabou pod vodou do stran
      let tgt = sh.clone().addScaledVector(F, Math.cos(a) * 2.0 * spd + 0.4).addScaledVector(Lv, sd * (0.5 + 0.9 * (1 - spd))).add(new THREE.Vector3(0, Math.max(-0.2, Math.sin(a)) * 1.3 * spd - 0.5 * (1 - spd) + Math.sin(t * 3 + sd) * 0.15, 0));
      if (thr > 0 && thrower) tgt = sh.clone().addScaledVector(F, wind > 0 ? -1.1 * wind : 1.6).addScaledVector(Lv, sd * 0.6).add(new THREE.Vector3(0, wind > 0 ? 1.9 : 0.9, 0));   // nápřah nad hlavu, pak švih
      if (sv) tgt = sh.clone().addScaledVector(Lv, sd * 1.5).addScaledVector(F, 0.4).add(new THREE.Vector3(0, 2.1, 0));
      else if (G && spd < 0.3 && !thr) tgt = sh.clone().addScaledVector(Lv, sd * 1.4).addScaledVector(F, 0.6).add(new THREE.Vector3(0, 0.5, 0));
      ik2(A, Fa, Hd, tgt, dn.clone().addScaledVector(F, -0.5).addScaledVector(Lv, sd * 0.6), this.L.upper, this.L.fore);
    }
  }
  // ---------- fotbal: běh, kop, skluz, brankář ----------
  // vzorek nasnímaného pohybu: dráha `key` v čase u (0–1), `loop` = cyklus; vrací [dopředu, do strany, nahoru] v délkách nohy
  mv(c, key, u, loop) {
    const a = c[key], n = c.n, k = key === 'pz' || key === 'ln' ? 1 : 3, x = loop ? ((u % 1) + 1) % 1 * n : clamp(u, 0, 1) * (n - 1), i = Math.floor(x), j = loop ? (i + 1) % n : Math.min(n - 1, i + 1), f = x - i, o = [];
    for (let q = 0; q < k; q++) o.push(a[i * k + q] + (a[j * k + q] - a[i * k + q]) * f);
    return o;
  }
  poseFoot(p, t, O, F, Lv, J) {
    const B = this.b, G = this.goalie, spd = Math.min(1, (p.spdN || 0) / 24), ph = (p.stride || 0) * 1.6 / this.fsc, wind = Math.min(1, p.windT || 0);
    const slide = p.slideT > 0, sv = G && p.saveT > 0 ? p.saveKind : 0, ready = G ? 1 - spd : 0;
    const kick = Math.max(p.shotFT > 0 ? p.shotFT / (p.shotSlap ? 0.5 : 0.32) : 0, p.passFT > 0 ? p.passFT / 0.3 : 0), kk = Math.sin(clamp(kick, 0, 1) * Math.PI);
    const tired = p.stamina != null ? 1 - clamp(p.stamina / 0.45, 0, 1) : 0;
    const lunge = p.lunge || 0;   // curling: výpad při odhodu kamene
    // nasnímaný běh a kop: chodidla, ruce a pánev jdou po drahách z motion capture, klouby dopočítá IK
    const MV = this.G.moves, Lg = this.L.thigh + this.L.shin, mvOn = MV && !G && !slide && lunge < 0.3;
    let mF = null, mH = null, mZ = 0; const fs = this.fsc, Lg1 = Lg / fs;
    if (mvOn) {
      const u = ph / TAU, kr = clamp((spd - 0.45) / 0.3, 0, 1), w = clamp((spd - 0.04) / 0.3, 0, 1), amp = 0.6 + 0.4 * spd;
      const S = (key, c3) => { const a = this.mv(MV.jog, key, u, true), b = this.mv(MV.run, key, u, true); return a.map((v, i) => v + (b[i] - v) * kr); };
      const foot = (q, sd) => { const r = lerp(sd * 0.42 / Lg, q[1], w); return [(q[0] - 0.13) * amp * w + 0.02, r, Math.max(0, q[2] - 0.045) * w]; };
      mF = [foot(S('fl'), 1), foot(S('fr'), -1)]; mH = [S('hl'), S('hr')]; mZ = (lerp(S('pz')[0], this.mv(MV.run, 'pz', u, true)[0], 0) - lerp(MV.jog.pz0, MV.run.pz0, kr)) * w;
      const wk = Math.max(wind, Math.min(1, kick * 4));
      if (wk > 0) {
        // kop: napřažení při držení, švih po uvolnění; klip je kopnutý pravou nohou, pro leváka se zrcadlí
        const K = MV.kick, uk = kick > 0 ? 0.32 + 0.68 * Math.pow(1 - clamp(kick, 0, 1), 0.6) : 0.08 + 0.2 * wind, mir = p.hand >= 0 ? (K.foot < 0) : (K.foot > 0);
        const g = (key) => { const q = this.mv(K, mir ? key[0] + (key[1] === 'l' ? 'r' : 'l') : key, uk); if (mir) q[1] = -q[1]; return q; };
        const kf = [g('fl'), g('fr')].map((q) => [q[0] - 0.13, q[1], Math.max(0, q[2] - 0.03)]), kh = [g('hl'), g('hr')];
        for (let i = 0; i < 2; i++) for (let c = 0; c < 3; c++) { mF[i][c] = lerp(mF[i][c], kf[i][c], wk); mH[i][c] = lerp(mH[i][c], kh[i][c], w > 0 ? wk : 1); }
        mZ = lerp(mZ, this.mv(K, 'pz', uk)[0] - K.pz[0], wk);
        mH.kick = wk;
      }
      mH.w = Math.max(w, mH.kick || 0);
    }
    this.root.position.set(O.x, mZ * Lg + fs * 0.15 - fs * (slide ? 2.0 : sv === 1 ? 1.0 : 0.1 + 0.2 * spd * (1 - lunge) + 0.32 * ready + 0.15 * wind + 1.75 * lunge), O.z);
    this.root.updateMatrixWorld(true);
    const lean = slide ? -0.95 : 0.06 + 0.32 * spd + 0.14 * ready + 0.1 * tired - 0.25 * kk;
    rotAxis(B.Hips, Lv, lean * 0.55);
    rotAxis(B.Hips, UPV, Math.sin(ph) * 0.14 * spd);
    if (sv === 2 || sv === 3) rotAxis(B.Hips, F, (sv === 2 ? -1 : 1) * 0.75);   // skok po míči do strany
    if (p.stagT > 0) rotAxis(B.Hips, F, Math.sin(p.stagT * 22) * 0.16 * (p.stagT / 0.4));
    const cs = this.cs; if (cs) this.applyClip(cs.clip, cs.frac, cs.w);
    for (const b of [B.Spine, B.Spine1, B.Spine2]) rotAxis(b, Lv, lean * 0.45 / 3 * (cs ? 1 - cs.w : 1));
    rotAxis(B.Neck, Lv, -lean * 0.4);
    // nohy: běžecký krok, stojná šířka podle postoje
    const sw = Math.sin(ph) * spd, cw = Math.cos(ph), st = 0.42 + 0.5 * ready;
    let fL = J(0.05 - 1.5 * sw, st, Math.max(0, cw) * 1.0 * spd), fR = J(0.05 + 1.5 * sw, -st, Math.max(0, -cw) * 1.0 * spd);
    // kop: noha u míče se napřáhne dozadu a švihne dopředu
    const kf = wind > 0 ? J(-1.7 * wind, p.hand * 0.5, 1.3 * wind) : kk > 0 ? J(0.5 + 2.2 * kk, p.hand * 0.5, 1.5 * kk) : null;
    if (kf) { if (p.hand >= 0) fL = kf; else fR = kf; }
    if (mF) { fL = J(mF[0][0] * Lg1, mF[0][1] * Lg1, mF[0][2] * Lg1); fR = J(mF[1][0] * Lg1, mF[1][1] * Lg1, mF[1][2] * Lg1); }
    if (slide) { fL = J(2.7, 0.4, 0.3); fR = J(1.3, -0.55, 0.1); }
    if (lunge > 0.3) { fL = J(1.5, 0.4, 0); fR = J(-2.5, -0.35, 0.05); }
    if (sv === 1) { fL = J(-0.2, 1.7, 0); fR = J(-0.2, -1.7, 0); }
    this.legs(fL, fR, F.clone().addScaledVector(Lv, 0.2), F.clone().addScaledVector(Lv, -0.2), 0.12, -0.12, F);
    if (cs && cs.w > 0.5) return;   // oslava gólu
    // ruce: při běhu proti nohám, brankář je má připravené od těla
    const dn = new THREE.Vector3(0, -1, 0);
    for (const sd of [1, -1]) {
      const [A, Fa, Hd] = sd > 0 ? [B.LeftArm, B.LeftForeArm, B.LeftHand] : [B.RightArm, B.RightForeArm, B.RightHand];
      const sh = wpos(A), a = sd > 0 ? sw : -sw;
      let tgt = sh.clone().addScaledVector(Lv, sd * 0.3).addScaledVector(F, 0.3 + 1.0 * a).add(new THREE.Vector3(0, -1.35 + 0.55 * Math.abs(a), 0));
      if (mH && mH.w > 0) { const h = mH[sd > 0 ? 0 : 1]; tgt.lerp(J(h[0] * Lg1, h[1] * Lg1, h[2] * Lg1 - (0.1 + 0.2 * spd)), mH.w); }
      if (G) tgt = sh.clone().addScaledVector(Lv, sd * (0.9 + 0.3 * ready)).addScaledVector(F, 0.9).add(new THREE.Vector3(0, -0.7 + ((sv === 2 && sd > 0) || (sv === 3 && sd < 0) ? 1.9 : sv === 1 ? -0.9 : 0), 0));
      if (slide) tgt = sh.clone().addScaledVector(Lv, sd * 0.9).addScaledVector(F, -0.8).add(new THREE.Vector3(0, -0.9, 0));
      if (lunge > 0.3) tgt = sd < 0 ? J(2.5, 0, 0.7) : sh.clone().addScaledVector(Lv, 1.2).add(new THREE.Vector3(0, -0.6, 0));   // pravá ruka drží kámen
      if (this.kit === 'curling' && !p.noBroom && !lunge) continue;   // ruce na koštěti (níže)
      if (fs !== 1 && !(mH && mH.w > 0)) tgt = sh.clone().add(tgt.sub(sh).multiplyScalar(fs));
      ik2(A, Fa, Hd, tgt, dn.clone().addScaledVector(F, -0.6).addScaledVector(Lv, sd * 0.5), this.L.upper, this.L.fore);
    }
    if (this.kit === 'curling') {
      // koště: hlavice na ledě (před hráčem, nebo tam, kam ukazuje / kde zametá), obě ruce na násadě
      const show = !p.noBroom && !lunge; this.stick.visible = this.root.visible && show;
      if (show) {
        const heel = p.broomAt ? new THREE.Vector3(p.broomAt[0], 0.08, -p.broomAt[1]) : J(2.3, -0.5, 0.08);
        const top = wpos(B.Spine2).addScaledVector(F, 1.0).add(new THREE.Vector3(0, -0.2, 0)), mid = top.clone().lerp(heel, 0.35);
        ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, top, dn.clone().addScaledVector(Lv, 0.7), this.L.upper, this.L.fore);
        ik2(B.RightArm, B.RightForeArm, B.RightHand, mid, dn.clone().addScaledVector(Lv, -0.7), this.L.upper, this.L.fore);
        this.placeStick(heel, top, F.clone(), F, true); put(this.blade, heel, Lv);   // koště: násada + hlavice napříč
      }
    }
  }
  poseRef(p, t, O, F, Lv, J) {
    const B = this.b, spd = Math.min(1, (p.spdN || 0) / 24), ph = p.stride || 0;
    this.root.position.set(O.x, 0.15 - (0.2 + 0.35 * spd), O.z);
    this.root.updateMatrixWorld(true);
    rotAxis(B.Hips, Lv, 0.15 + 0.25 * spd);
    rotAxis(B.Hips, UPV, Math.sin(ph) * 0.12 * spd);
    for (const b of [B.Spine, B.Spine1, B.Spine2]) rotAxis(b, Lv, (0.05 + 0.2 * spd) / 3);
    rotAxis(B.Neck, Lv, -0.25 * spd);
    const sw = Math.sin(ph) * spd, cw = Math.cos(ph);
    const fL = J(0.1 - 0.75 * sw, 0.48 + 0.45 * Math.max(0, -sw), Math.max(0, cw) * 0.35 * spd);
    const fR = J(0.1 + 0.75 * sw, -0.48 - 0.45 * Math.max(0, sw), Math.max(0, -cw) * 0.35 * spd);
    this.legs(fL, fR, F.clone().addScaledVector(Lv, 0.2), F.clone().addScaledVector(Lv, -0.2), 0.12, -0.12, F);
    const H = wpos(B.Hips), dn = new THREE.Vector3(0, -1, 0), back = F.clone().negate();
    for (const side of [1, -1]) {
      const [A, Fa, Hd] = side > 0 ? [B.LeftArm, B.LeftForeArm, B.LeftHand] : [B.RightArm, B.RightForeArm, B.RightHand];
      const sh = wpos(A);
      let tgt = H.clone().addScaledVector(Lv, side * 0.85).addScaledVector(F, 0.35 + Math.sin(ph + (side > 0 ? Math.PI : 0)) * 0.5 * spd).add(new THREE.Vector3(0, -0.35, 0));
      if (side < 0 && p.arm === 1) tgt = sh.clone().add(new THREE.Vector3(0, 2.3, 0)).addScaledVector(Lv, -0.3);
      if (side < 0 && p.arm === 2) { const a = p.armDir || 0; tgt = sh.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, 0.4, -Math.sin(a) * 2.2)); }
      if (side < 0 && p.arm === 3) tgt = sh.clone().addScaledVector(F, 1.9).add(new THREE.Vector3(0, -0.4, 0));
      ik2(A, Fa, Hd, tgt, p.arm && side < 0 ? back.clone() : dn.clone().addScaledVector(Lv, side * 0.5).addScaledVector(F, -0.4), this.L.upper, this.L.fore);
    }
  }
  poseGoalie(p, t, O, F, Lv, J) {
    // zákrok nabíhá a doznívá plynule (k), postoj se prohlubuje podle blízkosti puku, tělo i hlava puk sledují
    const B = this.b, sv = p.saveT > 0 ? p.saveKind : 0, k = sv ? clamp((0.5 - p.saveT) / 0.07, 0, 1) * clamp(p.saveT / 0.16, 0, 1) : 0;
    const bf = sv === 1 ? k : sv === 4 ? k * 0.75 : 0, kick = sv === 4 ? k : 0, sL = p.saveL || 0, sZ = p.saveZ || 0, ks = sL >= 0 ? 1 : -1;
    const near = p.near == null ? 0.6 : p.near, trk = p.trk || 0, dts = this.dtp || 0;
    this.gT = (this.gT || 0) + (trk - (this.gT || 0)) * Math.min(1, dts * 6); this.gN = (this.gN == null ? near : this.gN + (near - this.gN) * Math.min(1, dts * 3));
    const tr = this.gT, nr = this.gN, sway = Math.sin((p.stride || 0) * 0.8) * 0.05 + Math.sin(t * 2.2 + this.phase) * 0.012;
    const drop = lerp(0.8 + 0.3 * nr, 1.7, bf);
    this.root.position.set(O.x, 0.15 - drop, O.z);
    this.root.updateMatrixWorld(true);
    rotAxis(B.Hips, Lv, lerp(0.32 + 0.16 * nr, 0.15, bf));
    rotAxis(B.Hips, F, sway - tr * 0.1 * (1 - bf) - ks * kick * 0.22);
    rotAxis(B.Hips, UPV, tr * 0.28 * (1 - bf));                       // natočení ramen za pukem
    for (const b of [B.Spine, B.Spine1, B.Spine2]) rotAxis(b, Lv, lerp(0.05, -0.02, bf));
    if (sv === 2 || sv === 3) rotAxis(B.Spine1, F, -ks * k * 0.2);  // úklon za rukou
    rotAxis(B.Neck, Lv, lerp(-0.3, -0.1, bf)); rotAxis(B.Head, Lv, -0.15); rotAxis(B.Neck, UPV, tr * 0.45);
    // nohy: základní postoj → rozklek (betony do stran na ledě); vykopnutý beton míří tam, kam jde puk
    const st = 1.2 + 0.25 * nr, fL = J(0.1, st, 0).lerp(J(-0.9, 2.15, 0), bf), fR = J(0.1, -st, 0).lerp(J(-0.9, -2.15, 0), bf);
    if (kick > 0) (ks > 0 ? fL : fR).lerp(J(0.2, ks * clamp(Math.abs(sL) + 0.6, 2.2, 3.3), 0.05), kick);
    const poleL = F.clone().addScaledVector(Lv, -0.35).lerp(F.clone().addScaledVector(UPV, -0.8), bf).normalize(), poleR = F.clone().addScaledVector(Lv, 0.35).lerp(F.clone().addScaledVector(UPV, -0.8), bf).normalize();
    this.legs(fL, fR, poleL, poleR, lerp(0.35, 1.2, bf), lerp(-0.35, -1.2, bf), F);
    const H = wpos(B.Hips), down = new THREE.Vector3(0, -1, 0), up3 = (y) => new THREE.Vector3(0, y, 0);
    // ruce: lapačka vlevo, vyrážečka vpravo; při zákroku ruka vyjede přesně do dráhy puku
    const glove = H.clone().addScaledVector(F, 1.25).addScaledVector(Lv, 1.35 + 0.15 * nr).add(up3(0.55 + 0.15 * nr));
    const block = H.clone().addScaledVector(F, 1.3).addScaledVector(Lv, -1.15).add(up3(0.15));
    const hit = (side) => J(0.9, clamp(sL, side > 0 ? 0.3 : -2.6, side > 0 ? 2.6 : -0.3), clamp(sZ, 1.2, 4.6) + 0.25);
    if (sv === 2) glove.lerp(hit(1), k);
    if (sv === 3) block.lerp(hit(-1), k);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, glove, down.clone().addScaledVector(Lv, 0.8), this.L.upper, this.L.fore);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, block, down.clone().addScaledVector(Lv, -0.8), this.L.upper, this.L.fore);
    const bh = wpos(B.RightHand);
    const heel = J(1.95, -0.25 + (kick > 0 && ks < 0 ? -0.9 * kick : 0), 0.16);   // hokejka kryje mezeru u vykopnutého betonu
    aimBone(B.RightHand, B.RightHandMiddle1, bh.clone().add(new THREE.Vector3().subVectors(heel, bh).normalize()));
    const pTop = bh.clone().lerp(heel, 0.55);
    seg(this.shaft, pTop, bh.clone().add(new THREE.Vector3(0, 0.3, 0)), F);
    seg(this.paddle, heel.clone().add(new THREE.Vector3(0, 0.1, 0)), pTop, F);
    put(this.blade, heel, Lv);
  }
}
