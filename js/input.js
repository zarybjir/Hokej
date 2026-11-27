'use strict';
// ---------- Vstup: gamepady (Gamepad API) + 2 klávesnicová schémata ----------
const BTN = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'up', 'down', 'left', 'right', 'bk'];   // bk = couvání (výchozí na stejném tlačítku jako LB)
const KB_MAPS = [
  { name: 'Klávesnice 1', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    a: ['KeyJ'], x: ['KeyK'], b: ['KeyL'], y: ['KeyI'], rt: ['Space', 'ShiftLeft'], start: ['Escape'], back: ['Tab'], lb: ['KeyQ'], rb: ['KeyE'], lt: ['KeyU'], bk: ['KeyQ'] },
  { name: 'Klávesnice 2', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    a: ['Numpad1', 'Comma'], x: ['Numpad2', 'Period'], b: ['Numpad3', 'Slash'], y: ['Numpad5', 'Semicolon'],
    rt: ['Numpad0', 'ShiftRight'], start: ['Enter', 'NumpadEnter'], back: ['Backspace'], lb: ['Numpad4'], rb: ['Numpad6'], lt: ['Numpad7'], bk: ['Numpad4'] },
];

// rozložení tlačítek: logické tlačítko → fyzické (číslo tlačítka, nebo osa „a5+“/„a6-“)
const PAD_STD = { bk: 4, a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
// ovladač bez „standard“ rozložení (Linux xpad/evdev): spouště a D-pad jsou osy
const PAD_XPAD = { bk: 4, a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 'a2+', rt: 'a5+', back: 6, start: 7, up: 'a7-', down: 'a7+', left: 'a6-', right: 'a6+' };
const STD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'L3', 'R3', '↑', '↓', '←', '→', 'HOME'];
function padSpecName(spec, std) {
  if (typeof spec === 'number') return std ? (STD_NAMES[spec] || 'TL. ' + spec) : 'TL. ' + spec;
  if (typeof spec !== 'string') return '–';
  if (spec[0] === 'h') return 'KŘÍŽ ' + spec.slice(1);   // D-pad hlášený jako jedna osa („hat")
  return 'OSA ' + spec.slice(1);
}
function blankState() { const s = { lx: 0, ly: 0, rx: 0, ry: 0 }; for (const b of BTN) s[b] = false; return s; }

class Device {
  constructor(id, kind, name) {
    this.id = id; this.kind = kind; this.name = name;
    this.st = blankState(); this.prev = blankState();
    this.active = kind === 'pad'; this.connected = true;
    this.rep = {}; // autorepeat pro menu
  }
  pressed(b) { return this.st[b] && !this.prev[b]; }
  released(b) { return !this.st[b] && this.prev[b]; }
  // menu navigace s autorepeat (směr: stick + dpad)
  nav(b, dt) {
    const on = this.dirOn(b);
    if (!on) { this.rep[b] = 0; return false; }
    if (!this.rep[b]) { this.rep[b] = 0.0001; return true; }
    const before = this.rep[b];
    this.rep[b] += dt;
    if (before < 0.4 && this.rep[b] >= 0.4) return true;
    if (this.rep[b] > 0.4 && Math.floor((this.rep[b] - 0.4) / 0.12) > Math.floor((before - 0.4) / 0.12)) return true;
    return false;
  }
  dirOn(b) {
    const s = this.st;
    if (b === 'up') return s.up || s.ly < -0.6;
    if (b === 'down') return s.down || s.ly > 0.6;
    if (b === 'left') return s.left || s.lx < -0.6;
    if (b === 'right') return s.right || s.lx > 0.6;
    return false;
  }
  any() { for (const b of BTN) if (this.st[b] && !this.prev[b]) return true; return false; }
}

const Input = {
  keys: new Set(), devices: [], pads: {}, kb: [], merged: null, anyEvent: false, lastKey: null,
  // rozložení pro konkrétní ovladač (uložené v nastavení podle jeho jména), jinak výchozí podle typu
  padMap(gp) {
    const S = typeof Settings !== 'undefined' && Settings.data, own = S && S.padMaps && S.padMaps[gp.id];
    return Object.assign({}, gp.mapping === 'standard' ? PAD_STD : PAD_XPAD, own || {});
  },
  // klávesnice: vlastní klávesy z nastavení přes výchozí schéma
  applyKb() {
    const S = typeof Settings !== 'undefined' && Settings.data;
    this.kb.forEach((d, i) => { d.map = Object.assign({}, KB_MAPS[i], (S && S.kbMaps && S.kbMaps[i]) || {}); });
  },
  init() {
    this.kb = KB_MAPS.map((m, i) => { const d = new Device('kb' + i, 'kb', m.name); d.active = false; d.map = m; return d; });
    this.devices.push(...this.kb);
    this.merged = new Device('all', 'merged', 'Vše');
    this.touchDev = new Device('touch', 'touch', 'Dotyk'); this.touchDev.active = false; this.devices.push(this.touchDev);
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); this.anyEvent = true; if (!e.repeat) this.lastKey = e.code;
      if (typeof Touch !== 'undefined' && Touch.visible && !e.repeat) Touch.visible = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousedown', () => { this.anyEvent = true; });
    window.addEventListener('touchstart', () => { this.anyEvent = true; });
  },
  poll(dt) {
    // klávesnice
    for (const d of this.kb) {
      d.prev = d.st; const s = blankState();
      for (const b of BTN) if (d.map[b]) s[b] = d.map[b].some((k) => this.keys.has(k));
      s.lx = (s.right ? 1 : 0) - (s.left ? 1 : 0); s.ly = (s.down ? 1 : 0) - (s.up ? 1 : 0);
      if (s.lx && s.ly) { s.lx *= 0.7071; s.ly *= 0.7071; }
      d.st = s;
      if (!d.active && BTN.some((b) => s[b])) d.active = true;
    }
    // gamepady
    let gps = [];
    try { gps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { gps = []; }
    const seen = new Set();
    for (const gp of gps) {
      if (!gp || !gp.connected) continue;
      seen.add(gp.index);
      let d = this.pads[gp.index];
      if (!d) {
        d = new Device('pad' + gp.index, 'pad', 'Ovladač ' + (gp.index + 1));
        d.gpId = gp.id; this.pads[gp.index] = d; this.devices.push(d);
      }
      d.connected = true;
      d.prev = d.st; const s = blankState();
      const B = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const V = (spec) => {
        if (typeof spec === 'number') return B(spec);
        if (typeof spec !== 'string') return false;
        if (spec[0] === 'h') { const [i, v] = spec.slice(1).split(':'); const a = gp.axes[+i]; return a != null && Math.abs(a - +v) < 0.1; }
        const v = gp.axes[+spec.slice(1, -1)] || 0; return spec.endsWith('+') ? v > 0.5 : v < -0.5;
      };
      const map = this.padMap(gp);
      for (const b of BTN) s[b] = V(map[b]);
      // syrový stav pro test ovladačů a zachytávání nového tlačítka
      d.rawPrev = d.raw; d.raw = { b: gp.buttons.map((q) => !!(q && (q.pressed || q.value > 0.5))), a: Array.from(gp.axes) };
      d.std = gp.mapping === 'standard'; d.gp = gp;
      let lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
      const m = Math.hypot(lx, ly);
      if (m < 0.2) { lx = 0; ly = 0; } else { const k = Math.min(1, (m - 0.2) / 0.75) / m; lx *= k; ly *= k; }
      // dpad jako páčka (pokud páčka v klidu)
      if (!lx && !ly) {
        lx = (s.right ? 1 : 0) - (s.left ? 1 : 0); ly = (s.down ? 1 : 0) - (s.up ? 1 : 0);
        if (lx && ly) { lx *= 0.7071; ly *= 0.7071; }
      }
      s.lx = lx; s.ly = ly;
      // pravá páčka (vedení puku, obranný postoj): standard osy 2/3, linuxové rozložení (xpad) 3/4.
      // Obecné ovladače mají na osách 3/4 spouště, které v klidu drží −1: dvě osy naráz na −1 páčka být nemůže,
      // takové rozložení si zapamatujeme a pravou páčku čteme z os 2/5 (jinak by „páčka“ byla trvale vychýlená
      // a hráč ve hře jen couval v obranném postoji). Ovladač se čtyřmi osami má pravou páčku na 2/3.
      const A = gp.axes; let ra = 2, rb = 3;
      if (!d.std && A.length > 4) {
        if ((A[3] || 0) < -0.9 && (A[4] || 0) < -0.9) d.trig34 = true;
        if (d.trig34) { ra = 2; rb = A.length > 5 ? 5 : -1; } else { ra = 3; rb = 4; }
      }
      const rx = A[ra] || 0, ry = rb < 0 ? 0 : A[rb] || 0, rm = Math.hypot(rx, ry);
      if (rm > 0.3 && rm < 1.3 && Math.abs(rx) <= 1 && Math.abs(ry) <= 1) { s.rx = rx; s.ry = ry; }
      d.st = s;
      if (BTN.some((b) => s[b])) { this.anyEvent = true; if (typeof Touch !== 'undefined') Touch.visible = false; }
    }
    for (const k in this.pads) if (!seen.has(+k)) { const d = this.pads[k]; d.connected = false; d.prev = d.st; d.st = blankState(); }
    // dotykové ovládání jako další „ovladač"
    const td = this.touchDev; td.prev = td.st;
    td.st = typeof Touch !== 'undefined' && Touch.visible ? Touch.read(blankState()) : blankState();
    if (typeof Touch !== 'undefined' && Touch.visible) td.active = true;
    // sloučené ovládání pro menu
    const M = this.merged; M.prev = M.st; const s = blankState();
    for (const d of this.devices) {
      if (!d.connected) continue;
      for (const b of BTN) s[b] = s[b] || d.st[b];
      if (Math.abs(d.st.lx) > Math.abs(s.lx)) s.lx = d.st.lx;
      if (Math.abs(d.st.ly) > Math.abs(s.ly)) s.ly = d.st.ly;
    }
    // Enter / mezerník potvrzují i v menu
    if (this.keys.has('Enter') || this.keys.has('NumpadEnter')) s.a = true;
    if (this.keys.has('Escape') || this.keys.has('Backspace')) s.b = true;
    M.st = s;
  },
  // vibrace ovladače (Gamepad API); s = síla 0..1, ms = délka
  rumble(d, s, ms = 120) {
    if (!d || d.kind !== 'pad' || typeof Settings === 'undefined' || Settings.data.rumble === false) return;
    try {
      const gp = navigator.getGamepads()[+d.id.slice(3)], act = gp && (gp.vibrationActuator || (gp.hapticActuators && gp.hapticActuators[0]));
      if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(s, 0, 1), weakMagnitude: clamp(s * 0.7 + 0.15, 0, 1) });
      else if (act && act.pulse) act.pulse(clamp(s, 0, 1), ms);
    } catch (e) {}
  },
  // zachytávání nového tlačítka (přemapování): capStart() si zapamatuje klidové polohy os
  capStart() { this.lastKey = null; for (const d of Object.values(this.pads)) d.capBase = d.raw ? d.raw.a.slice() : null; },
  // dev = ovladač → jen jeho tlačítka/osy (klávesa = ovladač posílá klávesy, např. šablona Steamu); bez dev → jen klávesnice
  capture(dev) {
    if (dev) {
      const d = dev; if (!d.connected || !d.raw || !d.rawPrev) return null;
      for (let i = 0; i < d.raw.b.length; i++) if (d.raw.b[i] && !d.rawPrev.b[i]) return { dev: d, spec: i };
      const base = d.capBase || d.rawPrev.a;
      for (let i = 2; i < d.raw.a.length; i++) {
        const v = d.raw.a[i], b0 = base[i] || 0;
        if (Math.abs(b0) > 1.05) { if (Math.abs(v) <= 1.01 && Math.abs(v - b0) > 0.2) return { dev: d, spec: 'h' + i + ':' + v.toFixed(2) }; continue; }  // „hat" (klid ~1,29)
        if (Math.abs(v - b0) > 0.9 && Math.abs(v) > 0.6) return { dev: d, spec: 'a' + i + (v > 0 ? '+' : '-') };   // i spouště s klidem na −1
      }
      if (this.lastKey) { const k = this.lastKey; this.lastKey = null; return { key: k, foreign: true }; }
      return null;
    }
    if (this.lastKey) { const k = this.lastKey; this.lastKey = null; return { key: k }; }
    return null;
  },
  activeDevices() { return this.devices.filter((d) => d.connected && d.active); },
};
