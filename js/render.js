'use strict';
// ---------- 2D vrstva: HUD, menu a popisky nad 3D scénou ----------
const FONT = '"Arial Black","Archivo Black","DejaVu Sans","Liberation Sans",Verdana,sans-serif';
const font = (sz, st = 'italic 900') => `${st} ${sz}px ${FONT}`;

const R = {
  W: 1280, H: 800, cx: 640,
  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    if (!this.cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(window.innerWidth * dpr)), h = Math.max(200, Math.floor(window.innerHeight * dpr));
    this.cv.width = w; this.cv.height = h;
    let s = h / 800, W = w / s;
    if (W < 1280) { s = w / 1280; W = 1280; }
    this.s = s; this.W = W; this.ox = 0; this.oy = (h - 800 * s) / 2; this.cx = W / 2;
    if (window.G3 && G3.r) G3.resize();
  },
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.s, 0, 0, this.s, this.ox, this.oy);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.W, this.H); ctx.clip();
  },
  end() { this.ctx.restore(); },
  // převod z pixelů WebGL plátna (0..1) do logických souřadnic HUD
  fromNdc(nx, ny) { return [((nx + 1) / 2 * this.cv.width - this.ox) / this.s, ((1 - ny) / 2 * this.cv.height - this.oy) / this.s]; },
  setPreset() { G3.setView(); },
  updateCam(tx, dt, snap, shake, ty = 0) { G3.follow(tx, ty, dt, snap, shake); },
  drawWorld(g, players, pk, t, dt, opts = {}) {
    G3.render(g, players, pk, t, dt, opts);
    const ctx = this.ctx;
    if (opts.rings) for (const p of players) if (p.ctrl >= 0) this.drawMarker(p, HUMAN_COLORS[p.ctrl % 4], (p.ctrl + 1) + 'P');
    if (g) for (const pp of g.pops) {
      const s = G3.toScreen(pp.x, pp.y, 8 + pp.t * 4);
      if (!s) continue;
      ctx.globalAlpha = clamp(1.6 - pp.t, 0, 1);
      ctx.font = font(24); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(pp.text, s[0], s[1]);
      ctx.fillStyle = pp.color; ctx.fillText(pp.text, s[0], s[1]);
      ctx.globalAlpha = 1;
    }
    if (G3.toast && G3.toast.t > 0) {
      ctx.globalAlpha = clamp(G3.toast.t, 0, 1);
      this.panel(this.W / 2 - 150, 90, 300, 40, 0.85);
      ctx.font = font(18); ctx.fillStyle = '#ffd21f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(G3.toast.text, this.W / 2, 110);
      ctx.globalAlpha = 1;
      G3.toast.t -= dt;
    }
  },
  drawMarker(p, col, label) {
    const s = G3.toScreen(p.x, p.y, 7.3);
    if (!s) return;
    const ctx = this.ctx, [sx, sy] = s;
    ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx - 8, sy - 11); ctx.lineTo(sx + 8, sy - 11); ctx.lineTo(sx, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = font(14); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.strokeText(label, sx, sy - 13); ctx.fillText(label, sx, sy - 13);
  },
  drawGame(g, t, dt) {
    let players = g.all, pk = g.puck;
    if (g.state === 'replay' && g.replay) {
      const fr = g.replay.frames[Math.min(g.replay.frames.length - 1, Math.floor(g.replay.f))];
      players = fr.pl; pk = { x: fr.px, y: fr.py, z: fr.pz, vx: 0, vy: 0 };
    }
    const lead = g.state === 'play' ? clamp(pk.vx || 0, -30, 30) * 0.3 : 0;
    this.updateCam(pk.x + lead, dt, g.camSnap, g.shake, pk.y);
    g.camSnap = false;
    this.drawWorld(g, players, pk, g.time, dt, { rings: g.state !== 'replay' });
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
