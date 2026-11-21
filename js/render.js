'use strict';
// ---------- Vykreslování: perspektivní kamera (seshora = výchozí, z boku = volitelná) ----------
const FONT = '"Arial Black","Archivo Black","DejaVu Sans","Liberation Sans",Verdana,sans-serif';
const font = (sz, st = 'italic 900') => `${st} ${sz}px ${FONT}`;
const ADS = [
  ['ŽENISTA', '#c8102e', '#fff'], ['LEDOVÁ LIGA', '#0a2a6b', '#ffd21f'], ['PUK MART', '#ffd21f', '#111'],
  ['ICE COLA', '#b00020', '#fff'], ['BRUSLE+', '#111', '#2ee6ff'], ["HOKEJ '98", '#1f3f7a', '#fff'],
  ['PIZZA', '#0b6e3a', '#fff'], ['LEDŇÁK', '#e6e6e6', '#0a2a6b'], ['ZIMÁK FM', '#5b2c83', '#fff'],
];
// off = poloha kamery vůči sledovanému bodu na ledě
const CAMS = {
  top: { off: [-36, 0, 80], F: 930, cyf: 0.5, lean: 0.55 },
  side: { off: [0, -100, 55], F: 1390, cyf: 0.42, lean: 1 },
};

const R = {
  W: 1280, H: 800, F: 1010, cx: 640, cy: 400, preset: 'top',
  cam: { tx: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0 },
  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.outline = rinkOutline(12);
    this.buildWalls();
    this.buildCrowd();
    this.trail = [];
    this.setPreset(Settings.data.cam || 'top');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  setPreset(name) {
    this.preset = CAMS[name] ? name : 'top';
    const pr = CAMS[this.preset], o = pr.off, ol = Math.hypot(o[0], o[1], o[2]);
    const f = [-o[0] / ol, -o[1] / ol, -o[2] / ol];
    const rl = Math.hypot(f[1], f[0]), r = [f[1] / rl, -f[0] / rl, 0];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    Object.assign(this.cam, { f, r, u, off: o });
    const fh = Math.hypot(f[0], f[1]);
    VIEW.fx = f[0] / fh; VIEW.fy = f[1] / fh; VIEW.rx = r[0]; VIEW.ry = r[1];
    this.F = pr.F; this.leanK = pr.lean; this.zs = clamp(0.85 / u[2], 1, 2.2);
    this.cy = this.H * pr.cyf;
    this.computeLims();
  },
  resize() {
    if (!this.cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(window.innerWidth * dpr)), h = Math.max(200, Math.floor(window.innerHeight * dpr));
    this.cv.width = w; this.cv.height = h;
    let s = h / 800, W = w / s;
    if (W < 1280) { s = w / 1280; W = 1280; }
    this.s = s; this.W = W; this.ox = 0; this.oy = (h - 800 * s) / 2; this.cx = W / 2;
    this.computeLims();
  },
  place(tx) { const c = this.cam; c.tx = tx; c.x = tx + c.off[0]; c.y = c.off[1]; c.z = c.off[2]; },
  computeLims() {
    if (!this.cam.f) return;
    const save = this.cam.tx || 0;
    const solve = (fn, target) => { let lo = -40, hi = 110; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fn(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
    if (this.preset === 'top') {
      this.limHi = solve((tx) => { this.place(tx); return this.P(RINK.HL + 10, 0, 0)[1]; }, 6);
      this.limLo = -solve((m) => { this.place(-m); return -this.P(-RINK.HL - 6, 0, 0)[1]; }, -(this.H - 6));
    } else {
      this.limHi = solve((tx) => { this.place(tx); return -this.P(RINK.HL + 12, 0, 0)[0]; }, -(this.W - 6));
      this.limLo = -this.limHi;
    }
    if (this.limLo > this.limHi) this.limLo = this.limHi = (this.limLo + this.limHi) / 2;
    this.place(save);
  },
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.s, 0, 0, this.s, this.ox, this.oy);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.W, this.H); ctx.clip();
  },
  end() { this.ctx.restore(); },
  P(x, y, z) {
    const c = this.cam, dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const depth = dx * c.f[0] + dy * c.f[1] + dz * c.f[2], k = this.F / Math.max(depth, 0.5);
    return [this.cx + (dx * c.r[0] + dy * c.r[1]) * k + c.sx, this.cy - (dx * c.u[0] + dy * c.u[1] + dz * c.u[2]) * k + c.sy, k, depth];
  },
  depth(x, y, z) { const c = this.cam; return (x - c.x) * c.f[0] + (y - c.y) * c.f[1] + (z - c.z) * c.f[2]; },
  updateCam(tx, dt, snap, shake) {
    const c = this.cam;
    tx = clamp(tx, this.limLo, this.limHi);
    this.place(snap ? tx : c.tx + (tx - c.tx) * Math.min(1, dt * 3.2));
    c.sx = (Math.random() - 0.5) * shake * 16; c.sy = (Math.random() - 0.5) * shake * 12;
  },
  // lokální lineární báze kolem bodu na ledě (px na stopu)
  basis(x, y) {
    const s = this.P(x, y, 0), a = this.P(x + 1, y, 0), b = this.P(x, y + 1, 0), c = this.P(x, y, 1), zs = this.zs;
    const ez = [(c[0] - s[0]) * zs, (c[1] - s[1]) * zs];
    return { sx: s[0], sy: s[1], k: s[2], d: s[3], ex: [a[0] - s[0], a[1] - s[1]], ey: [b[0] - s[0], b[1] - s[1]], ez, hz: Math.hypot(ez[0], ez[1]) };
  },
  gEll(x, y, z, r) {
    const s = this.P(x, y, z), a = this.P(x + VIEW.rx * r, y + VIEW.ry * r, z), b = this.P(x + VIEW.fx * r, y + VIEW.fy * r, z);
    return [s[0], s[1], Math.hypot(a[0] - s[0], a[1] - s[1]) + 0.01, Math.hypot(b[0] - s[0], b[1] - s[1]) + 0.01, s[2]];
  },
  ell(e, fill, stroke, lw) {
    const ctx = this.ctx; ctx.beginPath(); ctx.ellipse(e[0], e[1], e[2], e[3], 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  },
  poly(pts, fill, stroke, lw) {
    const ctx = this.ctx; ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  },
  quad(w, fill, stroke, lw) {
    const ps = w.map((p) => this.P(p[0], p[1], p[2]));
    if (ps.some((p) => p[3] < 2)) return;
    this.poly(ps, fill, stroke, lw);
  },
  line(a, b, col, lw) { const ctx = this.ctx; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); },
  // afinní transformace lokální plochy (jednotky = 1/10 stopy) — text na ledu / mantinelech
  affine(o, ux, uy) {
    const s = this.s, k = 0.1;
    this.ctx.setTransform(s * (ux[0] - o[0]) * k, s * (ux[1] - o[1]) * k, s * (uy[0] - o[0]) * k, s * (uy[1] - o[1]) * k, s * o[0] + this.ox, s * o[1] + this.oy);
  },
  resetT() { this.ctx.setTransform(this.s, 0, 0, this.s, this.ox, this.oy); },

  // ---------- publikum ----------
  buildCrowd() {
    this.pal = ['#c8102e', '#1f3f7a', '#f4c542', '#e6e6e6', '#2b2b2b', '#0b6e3a', '#5b2c83', '#ff7a1a', '#1e9bd7', '#8a8a8a', '#6b3e26', '#d94f8a'];
    this.crowd = this.pal.map(() => []);
    const add = (x, y, z) => { if (Math.random() < 0.07) return; this.crowd[Math.floor(Math.random() * this.pal.length)].push([x, y, z, Math.random() * TAU]); };
    for (const s of [-1, 1]) for (let r = 0; r < 13; r++) {
      const y = s * (RINK.HW + 9 + r * 2.7), z = 7 + r * 2.1;
      for (let x = -128; x <= 128; x += 2.4) add(x + rand(-0.5, 0.5), y, z);
    }
    for (const s of [-1, 1]) for (let r = 0; r < 13; r++) {
      const x = s * (RINK.HL + 9 + r * 2.7), z = 7 + r * 2.1;
      for (let y = -72; y <= 72; y += 2.4) add(x, y + rand(-0.5, 0.5), z);
    }
  },
  drawArena(t, ex) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#04060c'); g.addColorStop(0.5, '#0d1220'); g.addColorStop(1, '#1a2036');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
    const HW = RINK.HW, HL = RINK.HL;
    for (const s of [-1, 1]) {
      this.quad([[-140, s * (HW + 6), 3], [140, s * (HW + 6), 3], [140, s * (HW + 46), 38], [-140, s * (HW + 46), 38]], '#171b29');
      this.quad([[s * (HL + 6), -85, 3], [s * (HL + 6), 85, 3], [s * (HL + 46), 85, 38], [s * (HL + 46), -85, 38]], '#141826');
    }
    const bounce = ex > 0.25, W = this.W, H = this.H;
    const heads = [];
    for (let c = 0; c < this.pal.length; c++) {
      ctx.fillStyle = this.pal[c]; ctx.beginPath();
      for (const [x, y, z, ph] of this.crowd[c]) {
        const b = bounce ? Math.max(0, Math.sin(t * 11 + ph)) * ex * 0.9 : 0;
        const p = this.P(x, y, z + b);
        if (p[3] < 6 || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 30) continue;
        const k = p[2];
        ctx.rect(p[0] - 0.6 * k, p[1] - 1.7 * k, 1.2 * k, 1.7 * k);
        heads.push(p[0] - 0.36 * k, p[1] - 2.45 * k, 0.72 * k);
      }
      ctx.fill();
    }
    ctx.fillStyle = '#d8a582'; ctx.beginPath();
    for (let i = 0; i < heads.length; i += 3) ctx.rect(heads[i], heads[i + 1], heads[i + 2], heads[i + 2]);
    ctx.fill();
  },

  // ---------- led ----------
  drawIce(t) {
    const ctx = this.ctx, pts = this.outline.map(([x, y]) => this.P(x, y, 0));
    ctx.save();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    let top = 1e9, bot = -1e9; for (const p of pts) { top = Math.min(top, p[1]); bot = Math.max(bot, p[1]); }
    top = Math.max(top, -200); bot = Math.min(bot, this.H + 200);
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#c9d8e6'); g.addColorStop(0.5, '#e4eef6'); g.addColorStop(1, '#f4f9fc');
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    // odlesky světel
    for (const x of [-70, -25, 25, 70]) {
      const e = this.gEll(x, 0, 0, 16);
      if (e[1] < -300 || e[1] > this.H + 300) continue;
      ctx.save(); ctx.translate(e[0], e[1]); ctx.scale(1, e[3] / e[2] * 0.5);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, e[2]);
      rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, e[2], 0, TAU); ctx.fill(); ctx.restore();
    }
    const HW = RINK.HW + 1;
    const band = (x0, x1, col) => this.quad([[x0, -HW, 0], [x1, -HW, 0], [x1, HW, 0], [x0, HW, 0]], col);
    band(-0.5, 0.5, '#c8202e');
    for (const x of [-RINK.BLUE_X, RINK.BLUE_X]) band(x - 0.5, x + 0.5, '#1d4fb8');
    for (const x of [-RINK.GOAL_X, RINK.GOAL_X]) band(x - 0.12, x + 0.12, '#c8202e');
    // centrální logo (čitelné zleva doprava na obrazovce)
    {
      const o = this.P(0, 0, 0), ux = this.P(VIEW.rx, VIEW.ry, 0), uy = this.P(-VIEW.fx, -VIEW.fy, 0);
      this.affine(o, ux, uy);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.fill();
      ctx.lineWidth = 9; ctx.strokeStyle = '#0a2a6b'; ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#c8202e'; ctx.beginPath(); ctx.arc(0, 0, 86, 0, TAU); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0a2a6b'; ctx.font = font(44); ctx.fillText('HOKEJ', 0, -12);
      ctx.fillStyle = '#c8202e'; ctx.font = font(34); ctx.fillText("'98", 0, 30);
      this.resetT();
    }
    const circ = (cx, cy, r, col, lw, fill) => {
      const ps = []; for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; ps.push(this.P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0)); }
      this.poly(ps, fill ? col : null, fill ? null : col, lw);
    };
    circ(0, 0, 15, '#1d4fb8', 2.2);
    circ(0, 0, 0.6, '#1d4fb8', 0, true);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        circ(sx * 20, sy * 22, 1, '#c8202e', 0, true);
        circ(sx * 69, sy * 22, 15, '#c8202e', 2.2);
        circ(sx * 69, sy * 22, 1, '#c8202e', 0, true);
        for (const hy of [-1, 1]) for (const hx of [-1, 1])
          this.line(this.P(sx * 69 + hx * 2.9, sy * 22 + hy * 14.7, 0), this.P(sx * 69 + hx * 2.9, sy * 22 + hy * 17.5, 0), '#c8202e', 2);
      }
      const cr = [];
      for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + (i / 20) * Math.PI; cr.push(this.P(sx * (RINK.GOAL_X - 6 * Math.cos(a)), 6 * Math.sin(a), 0)); }
      this.poly(cr, 'rgba(70,150,235,0.55)', '#c8202e', 2);
    }
    ctx.restore();
  },

  // ---------- mantinely (po kouscích, řazené spolu s hráči podle hloubky) ----------
  buildWalls() {
    const pts = this.outline, n = pts.length;
    this.walls = [];
    let adI = 0;
    for (let i = 0; i < n; i++) {
      const A = pts[i], B = pts[(i + 1) % n], ex = B[0] - A[0], ey = B[1] - A[1], len = Math.hypot(ex, ey);
      if (len < 0.01) continue;
      const nx = ey / len, ny = -ex / len, m = Math.ceil(len / 6), side = Math.abs(ny) > 0.99 && len > 20;
      for (let j = 0; j < m; j++) {
        const a = [A[0] + (ex * j) / m, A[1] + (ey * j) / m], b = [A[0] + (ex * (j + 1)) / m, A[1] + (ey * (j + 1)) / m];
        this.walls.push({ A: a, B: b, nx, ny, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, ad: side && j % 2 === 0 ? adI++ : -1, post: side });
      }
    }
  },
  drawWall(w) {
    const ctx = this.ctx, A = w.A, B = w.B;
    const a0 = this.P(A[0], A[1], 0), b0 = this.P(B[0], B[1], 0);
    if (a0[3] < 3 || b0[3] < 3) return;
    if (Math.max(a0[0], b0[0]) < -80 || Math.min(a0[0], b0[0]) > this.W + 80) return;
    if (Math.min(a0[1], b0[1]) > this.H + 260 || Math.max(a0[1], b0[1]) < -160) return;
    const q = (z0, z1) => [[A[0], A[1], z0], [B[0], B[1], z0], [B[0], B[1], z1], [A[0], A[1], z1]];
    const front = -(w.nx * VIEW.fx + w.ny * VIEW.fy) > 0.35;
    if (front) {
      this.quad(q(0, 3.2), 'rgba(240,244,248,0.16)');
      this.line(this.P(A[0], A[1], 3.4), this.P(B[0], B[1], 3.4), 'rgba(29,58,138,0.85)', 4);
      this.line(this.P(A[0], A[1], RINK.GLASS_H), this.P(B[0], B[1], RINK.GLASS_H), 'rgba(225,240,255,0.18)', 2);
      return;
    }
    this.quad(q(0, 0.7), '#e2b417');
    this.quad(q(0.7, 3.2), '#f2f3f5');
    if (w.ad >= 0) {
      const [txt, bg, fg] = ADS[w.ad % ADS.length];
      let s0 = A, s1 = B;
      const pa = this.P(A[0], A[1], 2), pb = this.P(B[0], B[1], 2);
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      if (Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0) { s0 = B; s1 = A; }
      const L = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]), ux = (s1[0] - s0[0]) / L, uy = (s1[1] - s0[1]) / L;
      this.affine(this.P(s0[0], s0[1], 3.0), this.P(s0[0] + ux, s0[1] + uy, 3.0), this.P(s0[0], s0[1], 2.9));
      ctx.fillStyle = bg; ctx.fillRect(0, 2, L * 10, 20);
      ctx.fillStyle = fg; ctx.font = font(13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(txt).width, sc = Math.min(1, (L * 10 - 6) / tw);
      ctx.save(); ctx.translate(L * 5, 12.5); ctx.scale(sc, 1); ctx.fillText(txt, 0, 0); ctx.restore();
      this.resetT();
    }
    this.quad(q(3.2, 3.5), '#1d3a8a');
    this.quad(q(3.5, RINK.GLASS_H), 'rgba(190,220,255,0.10)');
    this.line(this.P(A[0], A[1], RINK.GLASS_H), this.P(B[0], B[1], RINK.GLASS_H), 'rgba(225,240,255,0.45)', 1.5);
    if (w.post) this.line(this.P(A[0], A[1], 3.5), this.P(A[0], A[1], RINK.GLASS_H), 'rgba(220,235,255,0.25)', 1);
  },

  // ---------- branka ----------
  drawNet(sN) {
    const ctx = this.ctx, gl = RINK.GOAL_X;
    const W = (u, v, z) => this.P(sN * (gl + u), v, z);
    const FL0 = W(0, -3, 0), FR0 = W(0, 3, 0), FL1 = W(0, -3, 4), FR1 = W(0, 3, 4);
    const BL0 = W(3.4, -2.2, 0), BR0 = W(3.4, 2.2, 0), BL1 = W(1.3, -3, 3.8), BR1 = W(1.3, 3, 3.8);
    if (FL0[3] < 3 || FL0[0] < -200 || FL0[0] > this.W + 200 || FL0[1] < -200 || FL0[1] > this.H + 200) return;
    const mesh = 'rgba(255,255,255,0.28)';
    this.poly([BL1, BR1, BR0, BL0], mesh);
    this.poly([FL0, FL1, BL1, BL0], mesh); this.poly([FR0, FR1, BR1, BR0], mesh);
    this.poly([FL1, FR1, BR1, BL1], 'rgba(255,255,255,0.2)');
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const a = W(3.4 - 2.1 * t, -2.2 - 0.8 * t, 3.8 * t), b = W(3.4 - 2.1 * t, 2.2 + 0.8 * t, 3.8 * t);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      const v = -3 + 6 * t, c1 = W(1.3, v, 3.8), c2 = W(3.4, v * 0.73, 0);
      ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]);
    }
    ctx.stroke();
    const k = FL0[2];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = Math.max(1.5, 0.18 * k);
    ctx.beginPath(); ctx.moveTo(FL0[0], FL0[1]); ctx.lineTo(BL0[0], BL0[1]); ctx.lineTo(BR0[0], BR0[1]); ctx.lineTo(FR0[0], FR0[1]); ctx.stroke();
    ctx.strokeStyle = '#d4141c'; ctx.lineWidth = Math.max(2, 0.28 * k);
    ctx.beginPath(); ctx.moveTo(FL0[0], FL0[1]); ctx.lineTo(FL1[0], FL1[1]); ctx.lineTo(FR1[0], FR1[1]); ctx.lineTo(FR0[0], FR0[1]); ctx.stroke();
    ctx.lineCap = 'butt';
  },
  drawGoalLights(g, t) {
    const ctx = this.ctx;
    for (const sN of [-1, 1]) {
      const [px, py, k, d] = this.P(sN * (RINK.HL + 3), 0, RINK.GLASS_H + 2.5);
      if (d < 3 || px < -50 || px > this.W + 50 || py < -50 || py > this.H + 50) continue;
      const on = g && g.goalLight === sN && g.goalLightT > 0 && Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = '#222'; ctx.fillRect(px - 0.8 * k, py - 1.0 * k, 1.6 * k, 1.4 * k);
      ctx.fillStyle = on ? '#ff2a1a' : '#5a1410';
      ctx.beginPath(); ctx.arc(px, py - 0.3 * k, 0.6 * k, 0, TAU); ctx.fill();
      if (on) {
        const rg = ctx.createRadialGradient(px, py, 0, px, py, 9 * k);
        rg.addColorStop(0, 'rgba(255,60,30,0.7)'); rg.addColorStop(1, 'rgba(255,60,30,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, 9 * k, 0, TAU); ctx.fill();
      }
    }
  },

  // ---------- hráči ----------
  visible(B) { return B.d > 3 && B.sx > -120 && B.sx < this.W + 120 && B.sy > -60 && B.sy < this.H + 160; },
  drawSkater(p, t) {
    const ctx = this.ctx, B = this.basis(p.x, p.y);
    if (!this.visible(B)) return;
    const { sx, sy, k } = B, T = p.team;
    const fx = Math.cos(p.dir), fy = Math.sin(p.dir), lx = -fy, ly = fx;
    const L = (dx, dy, z) => [sx + dx * B.ex[0] + dy * B.ey[0] + z * B.ez[0], sy + dx * B.ex[1] + dy * B.ey[1] + z * B.ez[1]];
    this.ell(this.gEll(p.x, p.y, 0, 1.2), 'rgba(20,40,70,0.22)');
    if (p.downT > 0) return this.drawDown(p, L, k);
    const away = fx * VIEW.fx + fy * VIEW.fy, af = Math.abs(away);
    const sf = [(fx * B.ex[0] + fy * B.ey[0]) / k, (fx * B.ex[1] + fy * B.ey[1]) / k]; // směr vpřed na obrazovce
    const spd = Math.min(1, (p.spdN || 0) / 26), ph = p.stride, st = Math.sin(ph) * 0.95 * spd;
    const wind = p.windT || 0, crouch = 0.25 * spd + wind * 0.25;
    const hipZ = 2.75 - crouch, shZ = 4.65 - crouch * 1.3, headZ = 5.35 - crouch * 1.3, lean = (0.35 + 0.9 * spd + wind * 0.3) * this.leanK;
    const fLw = [lx * 0.48 + fx * st, ly * 0.48 + fy * st], fRw = [-lx * 0.48 - fx * st, -ly * 0.48 - fy * st];
    const fL = L(fLw[0], fLw[1], Math.max(0, Math.cos(ph)) * 0.35 * spd), fR = L(fRw[0], fRw[1], Math.max(0, -Math.cos(ph)) * 0.35 * spd);
    const hip = L(0, 0, hipZ), sh = L(fx * lean, fy * lean, shZ), head = L(fx * (lean + 0.15), fy * (lean + 0.15), headZ);
    const hwH = k * (0.42 + 0.3 * af), hwS = k * (0.5 + 0.42 * af);
    const blade = bladeOffset(p.dir, p.hand, p.carry, t, wind, p.pokeA || 0);
    const bP = L(blade[0], blade[1], blade[2]);
    const tP = L(fx * 0.4 - lx * p.hand * 0.5, fy * 0.4 - ly * p.hand * 0.5, 3.6 - crouch + wind * 0.9);
    const stick = () => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2b2118'; ctx.lineWidth = Math.max(1.5, 0.17 * k);
      ctx.beginPath(); ctx.moveTo(tP[0] + (tP[0] - bP[0]) * 0.1, tP[1] + (tP[1] - bP[1]) * 0.1); ctx.lineTo(bP[0], bP[1]); ctx.stroke();
      const ba = p.dir + p.hand * 0.7, bx = Math.cos(ba), by = Math.sin(ba);
      const vx = (bx * B.ex[0] + by * B.ey[0]), vy = (bx * B.ex[1] + by * B.ey[1]);
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, 0.26 * k);
      ctx.beginPath(); ctx.moveTo(bP[0], bP[1]); ctx.lineTo(bP[0] + vx * 0.9, bP[1] + vy * 0.9); ctx.stroke();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = Math.max(1, 0.12 * k);
      ctx.beginPath(); ctx.moveTo(bP[0] + vx * 0.2, bP[1] + vy * 0.2); ctx.lineTo(bP[0] + vx * 0.6, bP[1] + vy * 0.6); ctx.stroke();
    };
    const leg = (f) => {
      const hp = [hip[0] + (f[0] - sx) * 0.45, hip[1]];
      const kn = [(hp[0] + f[0]) / 2 + sf[0] * 0.3 * k, (hp[1] + f[1]) / 2 + sf[1] * 0.3 * k];
      ctx.lineCap = 'round';
      ctx.strokeStyle = T.jersey; ctx.lineWidth = 0.38 * k;
      ctx.beginPath(); ctx.moveTo(kn[0], kn[1]); ctx.lineTo(f[0], f[1] - 0.3 * k); ctx.stroke();
      ctx.strokeStyle = T.stripe; ctx.lineWidth = 0.39 * k;
      ctx.beginPath(); ctx.moveTo(lerp(kn[0], f[0], 0.35), lerp(kn[1], f[1], 0.35)); ctx.lineTo(lerp(kn[0], f[0], 0.5), lerp(kn[1], f[1], 0.5)); ctx.stroke();
      ctx.strokeStyle = T.pants; ctx.lineWidth = 0.55 * k;
      ctx.beginPath(); ctx.moveTo(hp[0], hp[1]); ctx.lineTo(kn[0], kn[1]); ctx.stroke();
      ctx.strokeStyle = '#151515'; ctx.lineWidth = 0.36 * k;
      ctx.beginPath(); ctx.moveTo(f[0] - sf[0] * 0.35 * k, f[1] - 0.15 * k - sf[1] * 0.35 * k); ctx.lineTo(f[0] + sf[0] * 0.5 * k, f[1] - 0.15 * k + sf[1] * 0.5 * k); ctx.stroke();
      ctx.strokeStyle = '#cfd6dd'; ctx.lineWidth = Math.max(1, 0.09 * k);
      ctx.beginPath(); ctx.moveTo(f[0] - sf[0] * 0.55 * k, f[1] + 0.05 * k - sf[1] * 0.55 * k); ctx.lineTo(f[0] + sf[0] * 0.7 * k, f[1] + 0.05 * k + sf[1] * 0.7 * k); ctx.stroke();
    };
    const behind = blade[0] * VIEW.fx + blade[1] * VIEW.fy > 0.3;
    if (behind) stick();
    if (fLw[0] * VIEW.fx + fLw[1] * VIEW.fy > fRw[0] * VIEW.fx + fRw[1] * VIEW.fy) { leg(fL); leg(fR); } else { leg(fR); leg(fL); }
    ctx.fillStyle = T.pants;
    ctx.beginPath(); ctx.ellipse(hip[0], hip[1] + 0.1 * k, hwH * 1.08, 0.5 * k, 0, 0, TAU); ctx.fill();
    const torso = (t0, t1) => {
      const a = [lerp(hip[0] - hwH, sh[0] - hwS, t0), lerp(hip[1], sh[1], t0)], b = [lerp(hip[0] + hwH, sh[0] + hwS, t0), lerp(hip[1], sh[1], t0)];
      const c = [lerp(hip[0] + hwH, sh[0] + hwS, t1), lerp(hip[1], sh[1], t1)], d = [lerp(hip[0] - hwH, sh[0] - hwS, t1), lerp(hip[1], sh[1], t1)];
      return [a, b, c, d];
    };
    ctx.fillStyle = T.jersey;
    ctx.beginPath(); const tt = torso(-0.08, 1);
    ctx.moveTo(tt[0][0], tt[0][1]); ctx.lineTo(tt[1][0], tt[1][1]); ctx.lineTo(tt[2][0], tt[2][1]);
    ctx.quadraticCurveTo(sh[0], sh[1] - 0.45 * k, tt[3][0], tt[3][1]); ctx.closePath(); ctx.fill();
    this.poly(torso(0.1, 0.24), T.stripe);
    this.poly(torso(0.27, 0.32), T.helmet === T.jersey ? '#ffffff' : T.helmet);
    if (away > 0.2) {
      ctx.globalAlpha = clamp((away - 0.2) * 3, 0, 1);
      ctx.font = font(Math.max(6, 0.95 * k), 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = T.numCol; ctx.fillText(String(p.num), lerp(hip[0], sh[0], 0.6), lerp(hip[1], sh[1], 0.62));
      ctx.globalAlpha = 1;
    } else if (away < -0.25) {
      ctx.fillStyle = T.stripe; ctx.beginPath(); ctx.arc(lerp(hip[0], sh[0], 0.62), lerp(hip[1], sh[1], 0.62), 0.32 * k, 0, TAU); ctx.fill();
    }
    const hand2 = [lerp(tP[0], bP[0], 0.3), lerp(tP[1], bP[1], 0.3)];
    const sL = [sh[0] - hwS * 0.85, sh[1] + 0.25 * k], sR = [sh[0] + hwS * 0.85, sh[1] + 0.25 * k];
    const hs = tP[0] < hand2[0] ? [[sL, tP], [sR, hand2]] : [[sL, hand2], [sR, tP]];
    ctx.lineCap = 'round';
    for (const [s0, h0] of hs) {
      ctx.strokeStyle = T.jersey; ctx.lineWidth = 0.36 * k;
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(h0[0], h0[1]); ctx.stroke();
      ctx.fillStyle = T.helmet === T.jersey ? T.pants : T.helmet;
      ctx.beginPath(); ctx.arc(h0[0], h0[1], 0.24 * k, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = T.helmet; ctx.beginPath(); ctx.arc(head[0], head[1], 0.43 * k, 0, TAU); ctx.fill();
    if (away < 0.4) {
      const fxo = head[0] + sf[0] * 0.17 * k, fyo = head[1] + 0.1 * k + sf[1] * 0.17 * k;
      ctx.fillStyle = '#e3ad86'; ctx.beginPath(); ctx.ellipse(fxo, fyo, (0.18 + 0.12 * af) * k, 0.27 * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(20,30,40,0.8)'; ctx.lineWidth = Math.max(1, 0.1 * k);
      ctx.beginPath(); ctx.moveTo(fxo - (0.18 + 0.1 * af) * k, fyo - 0.1 * k); ctx.lineTo(fxo + (0.18 + 0.1 * af) * k, fyo - 0.1 * k); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(head[0] - 0.13 * k, head[1] - 0.16 * k, 0.12 * k, 0, TAU); ctx.fill();
    if (!behind) stick();
    ctx.lineCap = 'butt';
  },
  drawDown(p, L, k) {
    const ctx = this.ctx, T = p.team, a = p.lie, cx = Math.cos(a), cy = Math.sin(a);
    const head = L(cx * 2.3, cy * 2.3, 0.45), tA = L(cx * 1.5, cy * 1.5, 0.5), tB = L(-cx * 0.3, -cy * 0.3, 0.5), ft = L(-cx * 2.4 - cy * 0.5, -cy * 2.4 + cx * 0.5, 0.3);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2118'; ctx.lineWidth = Math.max(1.5, 0.17 * k);
    const s0 = L(-cy * 1.6 + cx, cx * 1.6 + cy, 0.1), s1 = L(-cy * 1.9 - cx * 3, cx * 1.9 - cy * 3, 0.1);
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    ctx.strokeStyle = T.pants; ctx.lineWidth = 0.55 * k; ctx.beginPath(); ctx.moveTo(tB[0], tB[1]); ctx.lineTo(ft[0], ft[1]); ctx.stroke();
    ctx.strokeStyle = T.jersey; ctx.lineWidth = 1.05 * k; ctx.beginPath(); ctx.moveTo(tA[0], tA[1]); ctx.lineTo(tB[0], tB[1]); ctx.stroke();
    ctx.fillStyle = T.helmet; ctx.beginPath(); ctx.arc(head[0], head[1], 0.43 * k, 0, TAU); ctx.fill();
    ctx.lineCap = 'butt';
  },
  drawGoalie(p, t) {
    const ctx = this.ctx, B = this.basis(p.x, p.y);
    if (!this.visible(B)) return;
    const { sx, sy, k, hz } = B, T = p.team, fx = Math.cos(p.dir), fy = Math.sin(p.dir);
    const L = (dx, dy, z) => [sx + dx * B.ex[0] + dy * B.ey[0] + z * B.ez[0], sy + dx * B.ex[1] + dy * B.ey[1] + z * B.ez[1]];
    const away = fx * VIEW.fx + fy * VIEW.fy;
    const sf = [(fx * B.ex[0] + fy * B.ey[0]) / k, (fx * B.ex[1] + fy * B.ey[1]) / k];
    this.ell(this.gEll(p.x, p.y, 0, 1.6), 'rgba(20,40,70,0.24)');
    const saving = p.saveT > 0, bf = saving && p.saveKind === 1;
    const hipZ = bf ? 1.2 : 2.2, shZ = bf ? 3.3 : 4.2, headZ = bf ? 4.0 : 4.95;
    const hip = L(fx * 0.2, fy * 0.2, hipZ), sh = L(fx * 0.4, fy * 0.4, shZ), head = L(fx * 0.5, fy * 0.5, headZ);
    const padC = '#f4f4f4', teamC = T.jersey === '#f2f2f2' ? T.stripe : T.jersey;
    const pad = (x0, y0, w, h) => {
      ctx.fillStyle = padC; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 0.2 * k); else ctx.rect(x0, y0, w, h); ctx.fill();
      ctx.fillStyle = teamC;
      if (h > w) { ctx.fillRect(x0, y0 + h * 0.3, w, h * 0.12); ctx.fillRect(x0, y0 + h * 0.62, w, h * 0.12); }
      else { ctx.fillRect(x0 + w * 0.3, y0, w * 0.1, h); ctx.fillRect(x0 + w * 0.62, y0, w * 0.1, h); }
    };
    const sb = L(fx * 2.1 + fy * 0.6, fy * 2.1 - fx * 0.6, 0.05), sm = L(fx * 1.3, fy * 1.3, 1.6);
    const stickFirst = away > 0.2;
    const drawStick = () => {
      ctx.lineCap = 'round'; ctx.strokeStyle = '#2b2118'; ctx.lineWidth = Math.max(2, 0.2 * k);
      ctx.beginPath(); ctx.moveTo(sm[0], sm[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = Math.max(3, 0.32 * k);
      ctx.beginPath(); ctx.moveTo(sb[0] - 0.6 * k, sb[1]); ctx.lineTo(sb[0] + 0.6 * k, sb[1]); ctx.stroke();
      ctx.lineCap = 'butt';
    };
    if (stickFirst) drawStick();
    if (bf) { pad(sx - 2.3 * k, sy - 0.75 * hz, 2.0 * k, 0.75 * hz); pad(sx + 0.3 * k, sy - 0.75 * hz, 2.0 * k, 0.75 * hz); }
    else { pad(sx - 1.0 * k, sy - 2.4 * hz, 0.85 * k, 2.45 * hz); pad(sx + 0.15 * k, sy - 2.4 * hz, 0.85 * k, 2.45 * hz); }
    ctx.fillStyle = T.pants; ctx.beginPath(); ctx.ellipse(hip[0], hip[1] + 0.1 * k, 0.95 * k, 0.55 * k, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = T.jersey; ctx.beginPath();
    ctx.moveTo(hip[0] - 0.85 * k, hip[1] + 0.2 * k); ctx.lineTo(hip[0] + 0.85 * k, hip[1] + 0.2 * k);
    ctx.lineTo(sh[0] + 1.1 * k, sh[1]); ctx.quadraticCurveTo(sh[0], sh[1] - 0.6 * k, sh[0] - 1.1 * k, sh[1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = T.stripe; ctx.fillRect(lerp(hip[0], sh[0], 0.25) - 0.95 * k, lerp(hip[1], sh[1], 0.25), 1.9 * k, 0.28 * k);
    if (away > 0.2) {
      ctx.globalAlpha = clamp((away - 0.2) * 3, 0, 1);
      ctx.font = font(Math.max(6, 0.95 * k), 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = T.numCol; ctx.fillText(String(p.num), lerp(hip[0], sh[0], 0.62), lerp(hip[1], sh[1], 0.6));
      ctx.globalAlpha = 1;
    }
    const gSide = p.hand >= 0 ? -1 : 1;
    let gl = [sh[0] + gSide * 1.3 * k, sh[1] + 0.9 * k], bl = [sh[0] - gSide * 1.2 * k, sh[1] + 1.0 * k];
    if (saving && p.saveKind === 2) gl = [sh[0] + gSide * 1.7 * k, sh[1] - 0.6 * k];
    if (saving && p.saveKind === 3) bl = [sh[0] - gSide * 1.7 * k, sh[1] - 0.4 * k];
    ctx.strokeStyle = T.jersey; ctx.lineWidth = 0.45 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sh[0] + gSide * 0.9 * k, sh[1] + 0.2 * k); ctx.lineTo(gl[0], gl[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sh[0] - gSide * 0.9 * k, sh[1] + 0.2 * k); ctx.lineTo(bl[0], bl[1]); ctx.stroke();
    ctx.fillStyle = padC; ctx.beginPath(); ctx.arc(gl[0], gl[1], 0.5 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = teamC; ctx.beginPath(); ctx.arc(gl[0], gl[1], 0.22 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = padC; ctx.fillRect(bl[0] - 0.32 * k, bl[1] - 0.45 * k, 0.64 * k, 0.9 * k);
    ctx.lineCap = 'butt';
    if (!stickFirst) drawStick();
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.arc(head[0], head[1], 0.48 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = teamC;
    ctx.beginPath(); ctx.arc(head[0], head[1], 0.48 * k, Math.PI * 1.15, Math.PI * 1.85); ctx.fill();
    if (away < 0.4) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(1, 0.07 * k);
      const cx = head[0] + sf[0] * 0.15 * k;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(cx - 0.25 * k, head[1] + i * 0.13 * k + 0.08 * k); ctx.lineTo(cx + 0.25 * k, head[1] + i * 0.13 * k + 0.08 * k); }
      ctx.stroke();
    }
  },
  drawRing(p, col) {
    const e = this.gEll(p.x, p.y, 0, 2.0);
    this.ell(e, null, col, 3);
    this.ctx.globalAlpha = 0.25; this.ctx.fillStyle = col; this.ctx.fill(); this.ctx.globalAlpha = 1;
  },
  drawMarker(p, col, label) {
    const ctx = this.ctx, B = this.basis(p.x, p.y);
    const sx = B.sx + B.ez[0] * 6.9, sy = B.sy + B.ez[1] * 6.9;
    ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx - 7, sy - 10); ctx.lineTo(sx + 7, sy - 10); ctx.lineTo(sx, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = font(13); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.strokeText(label, sx, sy - 12); ctx.fillText(label, sx, sy - 12);
  },
  drawPuck(pk, t) {
    const ctx = this.ctx;
    this.ell(this.gEll(pk.x, pk.y, 0, 0.55), 'rgba(10,20,40,0.35)');
    if (this.trail.length > 2) {
      ctx.lineCap = 'round';
      const k = this.P(pk.x, pk.y, 0)[2];
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.P(...this.trail[i - 1]), b = this.P(...this.trail[i]);
        ctx.strokeStyle = `rgba(255,60,40,${(i / this.trail.length) * 0.6})`; ctx.lineWidth = (i / this.trail.length) * 0.5 * k;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    const e = this.gEll(pk.x, pk.y, pk.z, 0.5);
    this.ell(e, '#0a0a0a');
    this.ell([e[0], e[1] - e[3] * 0.3, e[2] * 0.8, e[3] * 0.6], '#3c3c3c');
  },

  // ---------- celá scéna ----------
  drawWorld(g, players, pk, t, dt, opts = {}) {
    const ctx = this.ctx;
    const sp = opts.puckSpeed || 0;
    if (sp > 50) { this.trail.push([pk.x, pk.y, pk.z]); if (this.trail.length > 9) this.trail.shift(); }
    else if (this.trail.length) this.trail.shift();
    this.drawArena(t, clamp(Sfx.excite * 0.8 + Sfx.roar, 0, 1.2));
    this.drawGoalLights(g, t);
    this.drawIce(t);
    if (opts.rings) for (const p of players) if (p.ctrl >= 0) this.drawRing(p, HUMAN_COLORS[p.ctrl % 4]);
    const ents = [];
    for (const p of players) ents.push([this.depth(p.x, p.y, 0), 0, p]);
    for (const sN of [-1, 1]) ents.push([this.depth(sN * (RINK.GOAL_X + 1.7), 0, 0) + 0.3, 1, sN]);
    ents.push([this.depth(pk.x, pk.y, 0) - 0.05, 2, pk]);
    for (const w of this.walls) ents.push([this.depth(w.mx, w.my, 0), 3, w]);
    ents.sort((a, b) => b[0] - a[0]);
    for (const [, type, o] of ents) {
      if (type === 0) (o.isGoalie ? this.drawGoalie(o, t) : this.drawSkater(o, t));
      else if (type === 1) this.drawNet(o);
      else if (type === 2) this.drawPuck(o, t);
      else this.drawWall(o);
    }
    if (opts.rings) for (const p of players) if (p.ctrl >= 0) this.drawMarker(p, HUMAN_COLORS[p.ctrl % 4], (p.ctrl + 1) + 'P');
    if (g) for (const pp of g.pops) {
      const [px, py] = this.P(pp.x, pp.y, 8 + pp.t * 4);
      ctx.globalAlpha = clamp(1.6 - pp.t, 0, 1);
      ctx.font = font(22); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(pp.text, px, py);
      ctx.fillStyle = pp.color; ctx.fillText(pp.text, px, py);
      ctx.globalAlpha = 1;
    }
  },
  drawGame(g, t, dt) {
    let players = g.all, pk = g.puck, sp = Math.hypot(pk.vx, pk.vy);
    if (g.state === 'replay' && g.replay) {
      const fr = g.replay.frames[Math.min(g.replay.frames.length - 1, Math.floor(g.replay.f))];
      players = fr.pl; pk = { x: fr.px, y: fr.py, z: fr.pz };
      const nx = g.replay.frames[Math.min(g.replay.frames.length - 1, Math.floor(g.replay.f) + 1)];
      sp = Math.hypot(nx.px - fr.px, nx.py - fr.py) * 60;
    }
    const lead = g.state === 'play' ? clamp(pk.vx || 0, -30, 30) * 0.3 : 0;
    this.updateCam(pk.x + lead, dt, g.camSnap, g.shake);
    g.camSnap = false;
    this.drawWorld(g, players, pk, g.time, dt, { rings: g.state !== 'replay', puckSpeed: sp });
    this.drawHUD(g, t);
  },

  // ---------- HUD ----------
  clockStr(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  panel(x, y, w, h, a = 0.78) {
    const ctx = this.ctx, g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(30,45,90,${a})`); g.addColorStop(1, `rgba(5,10,30,${a})`);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(180,200,255,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },
  chromeText(txt, x, y, size, col1 = '#ffffff', col2 = '#9fb4d8', align = 'center') {
    const ctx = this.ctx;
    ctx.font = font(size); ctx.textAlign = align; ctx.textBaseline = 'middle';
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, col1); g.addColorStop(0.5, col2); g.addColorStop(0.55, '#4a5a7a'); g.addColorStop(1, col1);
    ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y); ctx.fillStyle = g; ctx.fillText(txt, x, y);
  },
  drawHUD(g, t) {
    const ctx = this.ctx, [A, B] = g.teams;
    if (g.state === 'replay') return this.drawReplayHUD(g, t);
    // skóre
    const x = 18, y = 14;
    this.panel(x, y, 392, 44, 0.85);
    const team = (T, xx) => {
      ctx.fillStyle = T.jersey; ctx.fillRect(xx, y + 7, 10, 30);
      ctx.fillStyle = T.stripe; ctx.fillRect(xx + 10, y + 7, 4, 30);
      ctx.font = font(20); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(T.def.abbr, xx + 20, y + 23);
      ctx.fillStyle = '#ffd21f'; ctx.textAlign = 'right'; ctx.fillText(String(T.score), xx + 108, y + 23);
    };
    team(A, x + 8); team(B, x + 128);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 248, y + 6, 2, 32);
    ctx.font = font(18); ctx.fillStyle = '#9fe3ff'; ctx.textAlign = 'center';
    ctx.fillText(g.period > 3 ? 'PP' : g.period + '.', x + 278, y + 23);
    ctx.fillStyle = g.clock < 30 && g.state === 'play' ? '#ff6b5a' : '#fff'; ctx.font = font(20);
    ctx.fillText(this.clockStr(g.clock), x + 345, y + 23);
    ctx.font = font(11, 'bold'); ctx.fillStyle = 'rgba(220,230,255,0.8)'; ctx.textAlign = 'left';
    ctx.fillText(`STŘELY ${A.shots} – ${B.shots}`, x + 6, y + 56);
    // lidští hráči
    g.humans.forEach((h, i) => {
      const p = h.player; if (!p) return;
      const w = 250, hx = i % 2 === 0 ? 18 : this.W - 18 - w, hy = this.H - 58 - Math.floor(i / 2) * 50;
      this.panel(hx, hy, w, 42, 0.75);
      ctx.fillStyle = h.color; ctx.fillRect(hx, hy, 6, 42);
      ctx.font = font(15); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = h.color;
      ctx.fillText((i + 1) + 'P', hx + 14, hy + 15);
      ctx.fillStyle = '#fff'; ctx.font = font(14, 'bold');
      ctx.fillText('#' + p.num + ' ' + p.name.toUpperCase(), hx + 48, hy + 15);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(hx + 14, hy + 29, w - 28, 7);
      ctx.fillStyle = p.stamina > 0.3 ? '#4cff7a' : '#ff6b3a'; ctx.fillRect(hx + 14, hy + 29, (w - 28) * p.stamina, 7);
    });
    // držitel puku
    const o = g.puck.owner;
    if (o && g.state === 'play') {
      const txt = '#' + o.num + ' ' + o.name.toUpperCase();
      ctx.font = font(16); const w = ctx.measureText(txt).width + 36, bx = this.W / 2 - w / 2, by = this.H - 44;
      this.panel(bx, by, w, 30, 0.7);
      ctx.fillStyle = o.team.jersey; ctx.fillRect(bx + 6, by + 6, 10, 18); ctx.fillStyle = o.team.stripe; ctx.fillRect(bx + 16, by + 6, 3, 18);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 26, by + 16);
    }
    // banner
    if (g.banner) {
      const b = g.banner, k = b.t < 0.3 ? 0.5 + (b.t / 0.3) * 0.5 + Math.sin((b.t / 0.3) * Math.PI) * 0.25 : 1;
      ctx.save(); ctx.globalAlpha = clamp((b.dur - b.t) / 0.4, 0, 1);
      ctx.translate(this.W / 2, 250); ctx.scale(k, k);
      const big = b.text.length < 10 ? 92 : 64;
      if (b.color) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-this.W, -60, this.W * 2, 150);
        ctx.fillStyle = b.color; ctx.fillRect(-this.W, -64, this.W * 2, 6); ctx.fillRect(-this.W, 84, this.W * 2, 6);
      }
      this.chromeText(b.text, 0, 0, big, '#fff8d0', '#ffcc33');
      if (b.sub) { ctx.font = font(26); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(b.sub, 0, 62); ctx.fillText(b.sub, 0, 62); }
      ctx.restore();
    }
    if (g.lower) {
      const L = g.lower, slide = clamp(L.t / 0.3, 0, 1) * clamp((L.dur - L.t) / 0.3, 0, 1);
      const lx = -520 + 560 * slide, ly = this.H - 170;
      ctx.fillStyle = L.team.jersey; ctx.fillRect(lx, ly, 520, 70);
      ctx.fillStyle = L.team.stripe; ctx.fillRect(lx, ly + 62, 520, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(lx + 10, ly + 6, 500, 54);
      ctx.font = font(26); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(L.title, lx + 24, ly + 22);
      ctx.font = font(15, 'bold'); ctx.fillStyle = '#ffd21f'; ctx.fillText(L.sub, lx + 24, ly + 47);
    }
    if (g.state === 'periodEnd') this.drawPeriodEnd(g);
    if (g.state === 'final') this.drawFinal(g, t);
    if (Settings.data.fps) { ctx.font = font(12, 'bold'); ctx.fillStyle = '#0f0'; ctx.textAlign = 'right'; ctx.fillText(Math.round(App.fps) + ' FPS', this.W - 10, 14); }
  },
  drawReplayHUD(g, t) {
    const ctx = this.ctx;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, 46); ctx.fillRect(0, this.H - 46, this.W, 46);
      if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#ff2a1a'; ctx.beginPath(); ctx.arc(this.W - 190, 23, 9, 0, TAU); ctx.fill(); }
      this.chromeText('ZÁZNAM', this.W - 110, 24, 28);
      ctx.font = font(14, 'bold'); ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.fillText('A = přeskočit', this.W / 2, this.H - 22);
  },
  statsTable(g, x, y) {
    const ctx = this.ctx, [A, B] = g.teams;
    const rows = [['GÓLY', A.score, B.score], ['STŘELY', A.shots, B.shots], ['HITY', A.hits, B.hits]];
    ctx.font = font(22); ctx.textBaseline = 'middle';
    ctx.textAlign = 'right'; ctx.fillStyle = A.jersey === '#f2f2f2' ? '#fff' : '#fff'; ctx.fillText(A.def.abbr, x - 90, y);
    ctx.textAlign = 'left'; ctx.fillText(B.def.abbr, x + 90, y);
    rows.forEach((r, i) => {
      const yy = y + 40 + i * 34;
      ctx.font = font(16, 'bold'); ctx.fillStyle = '#9fb4d8'; ctx.textAlign = 'center'; ctx.fillText(r[0], x, yy);
      ctx.font = font(22); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(String(r[1]), x - 90, yy);
      ctx.textAlign = 'left'; ctx.fillText(String(r[2]), x + 90, yy);
    });
  },
  drawPeriodEnd(g) {
    const ctx = this.ctx, w = 560, h = 300, x = this.W / 2 - w / 2, y = 190;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, this.W, this.H);
    this.panel(x, y, w, h, 0.92);
    this.chromeText('KONEC ' + (g.period > 3 ? 'PRODLOUŽENÍ' : g.period + '. TŘETINY'), this.W / 2, y + 42, 34);
    this.statsTable(g, this.W / 2, y + 100);
    ctx.font = font(16, 'bold'); ctx.fillStyle = '#ffd21f'; ctx.textAlign = 'center'; ctx.fillText('A — pokračovat', this.W / 2, y + h - 26);
  },
  drawFinal(g, t) {
    const ctx = this.ctx, w = 640, h = 470, x = this.W / 2 - w / 2, y = 120;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, this.W, this.H);
    this.panel(x, y, w, h, 0.94);
    this.chromeText('KONEC ZÁPASU', this.W / 2, y + 40, 40);
    const [A, B] = g.teams;
    ctx.font = font(22); ctx.textAlign = 'center'; ctx.fillStyle = '#ffd21f';
    ctx.fillText(g.winner ? 'VÍTĚZ: ' + g.winner.def.city.toUpperCase() + ' ' + g.winner.def.name.toUpperCase() : 'REMÍZA', this.W / 2, y + 84);
    this.statsTable(g, this.W / 2, y + 130);
    this.chromeText('HVĚZDY ZÁPASU', this.W / 2, y + 290, 24);
    (g.stars || []).forEach((p, i) => {
      const yy = y + 330 + i * 32;
      ctx.fillStyle = '#ffd21f'; ctx.font = font(18); ctx.textAlign = 'left';
      ctx.fillText('★'.repeat(3 - i), x + 60, yy);
      ctx.fillStyle = p.team.jersey; ctx.fillRect(x + 150, yy - 10, 12, 20);
      ctx.fillStyle = '#fff'; ctx.fillText(`#${p.num} ${p.first} ${p.name}  (${p.team.def.abbr})`, x + 172, yy);
      ctx.textAlign = 'right'; ctx.fillStyle = '#9fe3ff'; ctx.font = font(15, 'bold');
      ctx.fillText(p.isGoalie ? `${p.stats.sv}/${p.stats.sa} zákroků` : `${p.stats.g} G  ${p.stats.a} A`, x + w - 40, yy);
    });
    ctx.font = font(16, 'bold'); ctx.fillStyle = '#ffd21f'; ctx.textAlign = 'center'; ctx.fillText('A — zpět do menu', this.W / 2, y + h - 22);
  },
};
