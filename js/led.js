'use strict';
// ---------- LED bodový displej (5×7 font s českou diakritikou) ----------
const LED_FONT = (() => {
  const F = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
    J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ' ': ['..', '..', '..', '..', '..', '..', '..'],
    '.': ['..', '..', '..', '..', '..', '##', '##'],
    ',': ['..', '..', '..', '..', '##', '.#', '#.'],
    ':': ['..', '##', '##', '..', '##', '##', '..'],
    '-': ['....', '....', '....', '####', '....', '....', '....'],
    "'": ['##', '.#', '#.', '..', '..', '..', '..'],
    '!': ['##', '##', '##', '##', '##', '..', '##'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
    '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
    '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
    ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    '★': ['..#..', '..#..', '#####', '.###.', '.###.', '#...#', '.....'],
    '●': ['.....', '.###.', '#####', '#####', '#####', '.###.', '.....'],
    '◄': ['...#', '..##', '.###', '####', '.###', '..##', '...#'],
    '►': ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  };
  const ACC = { acute: ['...#.', '..#..'], caron: ['.#.#.', '..#..'], ring: ['.###.', '.#.#.'] };
  const DIA = { Á: ['A', 'acute'], É: ['E', 'acute'], Í: ['I', 'acute'], Ó: ['O', 'acute'], Ú: ['U', 'acute'], Ý: ['Y', 'acute'],
    Č: ['C', 'caron'], Ď: ['D', 'caron'], Ě: ['E', 'caron'], Ň: ['N', 'caron'], Ř: ['R', 'caron'], Š: ['S', 'caron'],
    Ť: ['T', 'caron'], Ž: ['Z', 'caron'], Ů: ['U', 'ring'], Ä: ['A', 'caron'], Ö: ['O', 'caron'], Ü: ['U', 'caron'] };
  const out = {};
  for (const k in F) out[k] = ['', ''].map((_, i) => '.'.repeat(F[k][0].length)).concat(F[k]);
  for (const k in DIA) {
    const [b, a] = DIA[k], base = F[b], w = base[0].length, off = Math.floor((5 - w) / 2);
    out[k] = ACC[a].map((r) => r.substr(off, w)).concat(base);
  }
  out['–'] = out['-']; out['—'] = out['-'];
  return out;
})();

const LED = {
  WHITE: '#f2f5ff', cache: new Map(), pcache: new Map(),
  glyph(ch) { return LED_FONT[ch] || LED_FONT['?']; },
  cols(str) { let c = 0; for (const ch of str) c += this.glyph(ch)[0].length + 1; return Math.max(0, c - 1); },
  width(str, p) { return this.cols(String(str).toUpperCase()) * p; },
  // vykreslí text do cache (v rozlišení obrazovky) a vrátí plátno
  render(str, p, color) {
    const sc = R.s, key = str + '|' + p + '|' + color + '|' + sc;
    let c = this.cache.get(key);
    if (c) return c;
    const cols = this.cols(str), pad = Math.ceil(p * 1.2);
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((cols * p + 2 * pad) * sc)); c.height = Math.ceil((9 * p + 2 * pad) * sc);
    const g = c.getContext('2d');
    g.scale(sc, sc);
    g.fillStyle = color; g.shadowColor = color; g.shadowBlur = p * 0.55 * sc;
    const r = p * 0.34;
    let x0 = pad;
    for (const ch of str) {
      const gl = this.glyph(ch);
      for (let y = 0; y < 9; y++) for (let x = 0; x < gl[y].length; x++) if (gl[y][x] === '#') {
        g.beginPath(); g.arc(x0 + x * p + p / 2, pad + y * p + p / 2, r, 0, TAU); g.fill();
      }
      x0 += (gl[0].length + 1) * p;
    }
    c.pad = pad; c.lw = cols * p; c.lh = 9 * p;
    if (this.cache.size > 600) this.cache.clear();
    this.cache.set(key, c);
    return c;
  },
  // text: y = svislý střed velkých písmen; align left/center/right
  text(ctx, str, x, y, p, opt = {}) {
    str = String(str).toUpperCase();
    const c = this.render(str, p, opt.color || this.WHITE);
    let lx = x;
    if (opt.align === 'center') lx -= c.lw / 2; else if (opt.align === 'right') lx -= c.lw;
    const ly = y - 5.5 * p; // střed řádků 2..8
    ctx.drawImage(c, lx - c.pad, ly - c.pad, c.width / R.s, c.height / R.s);
    return c.lw;
  },
  // tmavý panel s mřížkou nesvítících bodů
  panel(ctx, x, y, w, h, p = 3, alpha = 0.9) {
    const sc = R.s, key = Math.round(w) + 'x' + Math.round(h) + '|' + p + '|' + alpha + '|' + sc;
    let c = this.pcache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = Math.ceil(w * sc); c.height = Math.ceil(h * sc);
      const g = c.getContext('2d'); g.scale(sc, sc);
      g.fillStyle = `rgba(6,7,10,${alpha})`; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.055)';
      for (let yy = p / 2 + 2; yy < h - 2; yy += p) for (let xx = p / 2 + 2; xx < w - 2; xx += p) { g.beginPath(); g.arc(xx, yy, p * 0.32, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(150,155,170,0.55)'; g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
      g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 1; g.strokeRect(2.5, 2.5, w - 5, h - 5);
      if (this.pcache.size > 120) this.pcache.clear();
      this.pcache.set(key, c);
    }
    ctx.drawImage(c, x, y, w, h);
  },
  // vodorovný LED sloupec (např. síla) — n bodů, část svítí
  bar(ctx, x, y, n, p, frac, color = this.WHITE, rows = 2) {
    const lit = Math.round(n * clamp(frac, 0, 1));
    ctx.save();
    for (let i = 0; i < n; i++) for (let r = 0; r < rows; r++) {
      const on = i < lit;
      ctx.fillStyle = on ? color : 'rgba(255,255,255,0.08)';
      if (on) { ctx.shadowColor = color; ctx.shadowBlur = p * 0.5 * R.s; } else ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(x + i * p + p / 2, y + r * p + p / 2, p * 0.34, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
};
