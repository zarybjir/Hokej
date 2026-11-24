'use strict';
// ---------- 2D vrstva: HUD, menu a popisky nad 3D scénou ----------
const FONT = '"Barlow Condensed","Inter","Segoe UI","Noto Sans","DejaVu Sans",system-ui,sans-serif';
const ACC = '#2fd4ff';   // zvýrazňující barva menu (ledová modrá)
// zúžené sportovní písmo je užší, proto o něco větší; načte se předem (plátno si o písmo samo neřekne)
const font = (sz, st = '800') => `${st} ${Math.round(sz * 1.16)}px ${FONT}`;
try { for (const w of [600, 700, 800]) document.fonts.load(w + ' 20px "Barlow Condensed"', 'Ač'); } catch (e) {}

const R = {
  W: 1280, H: 800, cx: 640,
  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    if (!this.cv) return;
    // telefon na výšku: hru vykreslíme otočenou o 90°, stačí otočit telefon (i když se prohlížeč neotočí)
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    this.rot = mobile && window.innerHeight > window.innerWidth;
    this.vw = this.rot ? window.innerHeight : window.innerWidth; this.vh = this.rot ? window.innerWidth : window.innerHeight;
    for (const c of document.querySelectorAll('canvas')) {
      if (this.rot) Object.assign(c.style, { width: this.vw + 'px', height: this.vh + 'px', transformOrigin: '0 0', transform: `translateY(${this.vw}px) rotate(-90deg)` });
      else Object.assign(c.style, { width: '', height: '', transformOrigin: '', transform: '' });
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(this.vw * dpr)), h = Math.max(200, Math.floor(this.vh * dpr));
    this.cv.width = w; this.cv.height = h;
    let s = h / 800, W = w / s;
    if (W < 1280) { s = w / 1280; W = 1280; }
    this.s = s; this.W = W; this.ox = 0; this.oy = (h - 800 * s) / 2; this.cx = W / 2;
    if (typeof G3 !== 'undefined' && G3.r) G3.resize();
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
  updateCam(tx, dt, snap, shake, ty = 0) { G3.follow(tx, ty, dt, snap, Settings.data.camShake === false ? 0 : shake); },
  drawWorld(g, players, pk, t, dt, opts = {}) {
    G3.render(g, players, pk, t, dt, opts.refs);
    const ctx = this.ctx;
    // jmenovka nad hráčem s pukem
    const o = g && opts.rings && g.puck.owner;
    if (o && Settings.data.tags !== false) {
      const sp = G3.toScreen(o.x, o.y, 7.8);
      if (sp) {
        const txt = '#' + o.num + ' ' + o.name, w = LED.width(txt, 2) + 30;
        LED.panel(ctx, sp[0] - w / 2, sp[1] - 26, w, 24, 2, 0.8);
        this.chip(o.team, sp[0] - w / 2 + 6, sp[1] - 21, 14);
        LED.text(ctx, txt, sp[0] - w / 2 + 22, sp[1] - 14, 2);
      }
    }
    if (g) for (const pp of g.pops) {
      const s = G3.toScreen(pp.x, pp.y, 8 + pp.t * 4);
      if (!s) continue;
      ctx.globalAlpha = clamp(1.6 - pp.t, 0, 1);
      const w = LED.width(pp.text, 3) + 20;
      LED.panel(ctx, s[0] - w / 2, s[1] - 17, w, 34, 3, 0.75);
      LED.text(ctx, pp.text, s[0], s[1] + 1, 3, { align: 'center', color: pp.color === '#fff' ? LED.WHITE : pp.color });
      ctx.globalAlpha = 1;
    }
    if (G3.toast && G3.toast.t > 0) {
      ctx.globalAlpha = clamp(G3.toast.t, 0, 1);
      const w = LED.width(G3.toast.text, 3) + 36;
      LED.panel(ctx, this.W / 2 - w / 2, 86, w, 42, 3);
      LED.text(ctx, G3.toast.text, this.W / 2, 108, 3, { align: 'center' });
      ctx.globalAlpha = 1;
      G3.toast.t -= dt;
    }
  },
  drawGame(g, t, dt) {
    let players = g.penalties.length ? g.all.concat(g.boxPlayers()) : g.all, pk = g.puck, refs = g.refs;
    if (g.state === 'replay' && g.replay) {
      const fr = g.replay.frames[Math.min(g.replay.frames.length - 1, Math.floor(g.replay.f))];
      players = fr.pl; pk = { x: fr.px, y: fr.py, z: fr.pz, vx: 0, vy: 0 };
      refs = fr.refs || [];
    }
    const lead = g.state === 'play' ? clamp(pk.vx || 0, -30, 30) * 0.3 : 0;
    if (g.state === 'zamboni' && g.zam) { players = []; refs = []; this.updateCam(g.zam.x + Math.cos(g.zam.dir) * 6, dt, false, 0, g.zam.y); }
    else this.updateCam(pk.x + lead, dt, g.camSnap, g.shake, pk.y);
    g.camSnap = false;
    this.drawWorld(g, players, pk, g.time, dt, { rings: g.state !== 'replay', refs });
    this.drawHUD(g, t);
  },

  // ---------- menu prvky (chrom) ----------
  clockStr(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  panel(x, y, w, h, a = 0.78) {
    // plochá zaoblená karta s jemným okrajem
    // skleněná karta: tmavý základ, světlejší horní hrana
    const ctx = this.ctx, r = Math.min(12, h / 4), g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(34,48,84,${a * 0.78})`); g.addColorStop(1, `rgba(12,18,36,${a * 0.82})`);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,255,0.16)'; ctx.lineWidth = 1; ctx.stroke();
  },
  // pozadí menu: tmavá aréna s reflektory, obrysem kluziště a poletujícími krystalky ledu
  menuBg(t) {
    const ctx = this.ctx, W = this.W, H = this.H;
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1730'); g.addColorStop(0.55, '#081022'); g.addColorStop(1, '#04070f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const glow = (x, y, r, col) => { const q = ctx.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, col); q.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = q; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    glow(W * 0.78 + Math.sin(t * 0.13) * 60, H * 0.42 + Math.cos(t * 0.11) * 30, 620, 'rgba(40,120,255,0.30)');
    glow(W * 0.12 + Math.cos(t * 0.09) * 50, H * 0.05, 520, 'rgba(47,212,255,0.16)');
    glow(W * 0.55, H * 1.1, 560, 'rgba(255,60,90,0.10)');
    // obrys kluziště v perspektivě (jen náznak)
    ctx.save(); ctx.translate(W * 0.74, H * 0.62); ctx.transform(1, 0, -0.35, 0.42, 0, 0); ctx.rotate(-0.12 + Math.sin(t * 0.05) * 0.02);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(140,190,255,0.10)';
    ctx.beginPath(); ctx.roundRect(-620, -300, 1240, 600, 170); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 105, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,70,90,0.13)'; ctx.beginPath(); ctx.moveTo(0, -300); ctx.lineTo(0, 300); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,140,255,0.16)'; for (const x of [-170, 170]) { ctx.beginPath(); ctx.moveTo(x, -300); ctx.lineTo(x, 300); ctx.stroke(); }
    ctx.restore();
    // kužely reflektorů
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = W * (0.18 + i * 0.24), sw = Math.sin(t * 0.21 + i * 1.7) * 0.16, q = ctx.createLinearGradient(x, -40, x + sw * 600, H * 0.9);
      q.addColorStop(0, 'rgba(150,200,255,0.11)'); q.addColorStop(1, 'rgba(150,200,255,0)');
      ctx.fillStyle = q; ctx.beginPath(); ctx.moveTo(x - 14, -40); ctx.lineTo(x + 14, -40); ctx.lineTo(x + sw * 700 + 170, H); ctx.lineTo(x + sw * 700 - 170, H); ctx.fill();
    }
    // krystalky ledu
    for (let i = 0; i < 46; i++) {
      const a = i * 127.1, sp = 6 + (i % 7) * 3, x = ((a * 7.3 + t * sp) % (W + 40)) - 20, y = H - ((a * 3.7 + t * sp * 0.6) % (H + 40)) + 20;
      const tw = 0.25 + 0.75 * Math.abs(Math.sin(t * (0.6 + (i % 5) * 0.2) + i));
      ctx.fillStyle = `rgba(190,225,255,${0.10 + 0.30 * tw})`; ctx.beginPath(); ctx.arc(x, y, 0.8 + (i % 3) * 0.7, 0, TAU); ctx.fill();
    }
    ctx.restore();
    g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },
  // zvýraznění vybrané položky: světlejší výplň a barevný proužek vlevo
  sel(x, y, w, h) {
    const ctx = this.ctx, r = Math.min(12, h / 4);
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(47,212,255,0.34)'); g.addColorStop(1, 'rgba(47,212,255,0.04)');
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(47,212,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(x + 5, y + 6, 4, h - 12, 2); ctx.fillStyle = ACC; ctx.fill();
  },
  chromeText(txt, x, y, size, col1 = '#ffffff', col2 = '#9fb4d8', align = 'center') {
    const ctx = this.ctx;
    // plochý nadpis: bílá, nebo zvýrazňující barva (col2, když není výchozí šedomodrá), měkký stín
    ctx.save(); ctx.font = font(size); ctx.textAlign = align; ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = size >= 28 ? (size * 0.03).toFixed(1) + 'px' : '0px'; } catch (e) {}
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = size / 3; ctx.shadowOffsetY = 2;
    ctx.fillStyle = ['#9fb4d8', '#8fa4c8', '#9fc4ff'].includes(col2) ? col1 : col2;
    if (size >= 30) { ctx.translate(x, y); ctx.transform(1, 0, -0.1, 1, 0, 0); ctx.fillText(txt, 0, 0); }   // nadpisy lehce skloněné
    else ctx.fillText(txt, x, y);
    ctx.restore();
  },

  // ---------- HUD: bílý LED displej ----------
  chip(T, x, y, h) {
    const ctx = this.ctx;
    ctx.fillStyle = T.jersey; ctx.fillRect(x, y, 7, h);
    ctx.fillStyle = T.stripe; ctx.fillRect(x + 7, y, 3, h);
  },
  drawHUD(g, t) {
    const ctx = this.ctx, [A, B] = g.teams, p = 3;
    if (g.state === 'replay') return this.drawReplayHUD(g, t);
    // výsledková tabule (rozměry podle LED textu)
    const P = 3.5, x = 16, y = 12, H = 50, cy = y + H / 2, W2 = LED.width('00', P);
    const pos = []; let cx = x + 12;
    for (const T of [A, B]) { pos.push([T, cx]); cx += 16 + LED.width(T.def.abbr, P) + 14 + W2 + 34; }
    const sep = cx - 8, perX = cx + 6, clockR = perX + LED.width('PP', P) + 22 + LED.width('00:00', P);
    LED.panel(ctx, x, y, clockR + 14 - x, H, P);
    for (const [T, px] of pos) {
      this.chip(T, px, y + 11, H - 22);
      const ax = px + 16; LED.text(ctx, T.def.abbr, ax, cy, P);
      LED.text(ctx, T.score, ax + LED.width(T.def.abbr, P) + 14 + W2, cy, P, { align: 'right', color: '#ffd21f' });
    }
    ctx.fillStyle = 'rgba(150,155,170,0.4)'; ctx.fillRect(sep, y + 9, 2, H - 18);
    LED.text(ctx, g.period > 3 ? 'PP' : g.period + '.', perX, cy, P);
    const low = g.clock < 30 && g.state === 'play';
    LED.text(ctx, this.clockStr(g.clock), clockR, cy, P, { align: 'right', color: low ? '#ff5a46' : LED.WHITE });
    const st = `STŘELY ${A.shots}-${B.shots}`;
    LED.panel(ctx, x, y + H + 5, LED.width(st, 2.5) + 24, 30, 2.5);
    LED.text(ctx, st, x + 12, y + H + 20, 2.5);
    // vyloučení a přesilovka
    let py = y + H + 40;
    const nA = g.penalties.filter((pn) => pn.team === A).length, nB = g.penalties.filter((pn) => pn.team === B).length;
    if (nA !== nB) {
      const pp = nA > nB ? B : A, txt = `PŘESILOVKA ${pp.def.abbr} ${5 - Math.min(nA, nB) === 5 ? 5 : 5 - Math.min(nA, nB)} NA ${5 - Math.max(nA, nB)}`;
      LED.panel(ctx, x, py, LED.width(txt, 2.5) + 24, 30, 2.5); LED.text(ctx, txt, x + 12, py + 15, 2.5, { color: '#ffd21f' }); py += 34;
    }
    for (const pn of g.penalties) {
      const txt = `${pn.team.def.abbr} #${pn.player.num} ${pn.player.name}  ${this.clockStr(pn.left)}`;
      LED.panel(ctx, x, py, LED.width(txt, 2.5) + 40, 30, 2.5);
      this.chip(pn.team, x + 8, py + 7, 16);
      LED.text(ctx, txt, x + 26, py + 15, 2.5, { color: '#ff7a5a' }); py += 34;
    }
    if (!g.shootout) for (const T of g.teams) if (T.pulled || T.goalie.leaving) {
      const txt = 'PRÁZDNÁ BRANKA ' + T.def.abbr;
      LED.panel(ctx, x, py, LED.width(txt, 2.5) + 40, 30, 2.5); this.chip(T, x + 8, py + 7, 16);
      LED.text(ctx, txt, x + 26, py + 15, 2.5, { color: '#ffe066' }); py += 34;
    }
    if (g.pending && Math.floor(t * 3) % 2 === 0) {
      const txt = 'ODLOŽENÉ VYLOUČENÍ ' + g.pending.team.def.abbr;
      LED.panel(ctx, x, py, LED.width(txt, 2.5) + 24, 30, 2.5); LED.text(ctx, txt, x + 12, py + 15, 2.5, { color: '#ff5a46' });
    }
    if (g.practice) {
      const P = g.practice, sh = P.kind === 'so' || P.kind === 'sog' ? P.shots : A.shots;
      const txt = 'TRÉNINK  ' + (P.kind === 'sog' ? 'ZÁKROKY ' + (P.shots - P.goals) + ' / ' + P.shots : 'GÓLY ' + P.goals + ' / STŘELY ' + sh);
      const w = LED.width(txt, 3) + 30; LED.panel(ctx, this.W / 2 - w / 2, this.H - 100, w, 38, 3); LED.text(ctx, txt, this.W / 2, this.H - 81, 3, { align: 'center', color: '#7dff8a' });
    }
    if (g.shootout && !g.practice) this.drawShootoutHUD(g, t);
    // lidští hráči: energie + formace
    if (!g.shootout) g.humans.forEach((h, i) => {
      const pl = h.player; if (!pl) return;
      const T = h.team, w = 320, hx = i % 2 === 0 ? 16 : this.W - 16 - w, hy = this.H - 92 - Math.floor(i / 2) * 96;
      LED.panel(ctx, hx, hy, w, 82, 3);
      LED.text(ctx, (i + 1) + 'P', hx + 12, hy + 18, 3, { color: h.color });
      LED.text(ctx, '#' + pl.num + ' ' + pl.name, hx + 56, hy + 18, 3);
      LED.bar(ctx, hx + 12, hy + 34, Math.floor((w - 24) / 4), 4, pl.stamina, pl.stamina > 0.35 ? LED.WHITE : '#ff5a46', 2);
      for (let L = 0; L < 3; L++) {
        const x0 = hx + 12 + L * 102, e = g.lineEnergy(T, L), cur = T.line === L, next = T.change && T.change.to === L;
        LED.text(ctx, 'F' + (L + 1), x0, hy + 63, 2.5, { color: cur ? '#ffd21f' : next ? '#7dff8a' : '#8a93a6' });
        LED.bar(ctx, x0 + 26, hy + 59, 15, 4, e, e > 0.6 ? '#7dff8a' : e > 0.35 ? '#ffd21f' : '#ff5a46', 2);
      }
    });
    if (g.toast) {
      const w = LED.width(g.toast.text, 3) + 36;
      LED.panel(ctx, this.W / 2 - w / 2, 132, w, 42, 3);
      LED.text(ctx, g.toast.text, this.W / 2, 154, 3, { align: 'center', color: '#7dff8a' });
    }
    // držitel puku
    const o = g.puck.owner;
    if (o && g.state === 'play') {
      const txt = '#' + o.num + ' ' + o.name, w = LED.width(txt, 3) + 46, bx = this.W / 2 - w / 2, by = this.H - 50;
      LED.panel(ctx, bx, by, w, 40, 3);
      this.chip(o.team, bx + 10, by + 9, 22);
      LED.text(ctx, txt, bx + 30, by + 20, 3);
    }
    // velký nápis (GÓL, třetina…) — LED pás přes celou šířku
    if (g.banner) {
      const b = g.banner, cols = LED.cols(String(b.text).toUpperCase());
      const bp = clamp(Math.floor(860 / Math.max(1, cols)), 4, 10), bh = 9 * bp + (b.sub ? 64 : 34), by = 250 - 4.5 * bp - 18;
      ctx.save(); ctx.globalAlpha = clamp((b.dur - b.t) / 0.4, 0, 1);
      LED.panel(ctx, 0, by, this.W, bh, bp, 0.82);
      if (b.color) { ctx.fillStyle = b.color; ctx.fillRect(0, by, this.W, 5); ctx.fillRect(0, by + bh - 5, this.W, 5); }
      // odkrývání po sloupcích + blikání u gólu
      const reveal = clamp(b.t / 0.35, 0, 1), tw = cols * bp;
      const blink = b.color && b.t < 1.4 && Math.floor(b.t * 6) % 2 === 1;
      if (!blink) {
        ctx.save(); ctx.beginPath(); ctx.rect(this.W / 2 - tw / 2 - 20, by, (tw + 40) * reveal, bh); ctx.clip();
        LED.text(ctx, b.text, this.W / 2, by + 18 + 4.5 * bp, bp, { align: 'center' });
        ctx.restore();
      }
      if (b.sub && reveal >= 1) LED.text(ctx, b.sub, this.W / 2, by + bh - 26, 3, { align: 'center' });
      ctx.restore();
    }
    if (g.lower) {
      const L = g.lower, slide = clamp(L.t / 0.3, 0, 1) * clamp((L.dur - L.t) / 0.3, 0, 1);
      const w = Math.max(LED.width(L.title, 4), LED.width(L.sub, 2.5)) + 60;
      const lx = -w - 10 + (w + 30) * slide, ly = this.H - 180;
      LED.panel(ctx, lx, ly, w, 78, 4);
      this.chip(L.team, lx + 12, ly + 12, 54);
      LED.text(ctx, L.title, lx + 36, ly + 28, 4);
      LED.text(ctx, L.sub, lx + 36, ly + 58, 2.5, { color: '#cfd6e6' });
    }
    if (g.state === 'periodEnd') this.drawPeriodEnd(g, t);
    if (g.state === 'zamboni') this.drawZamboniHUD(g, t);
    if (g.state === 'final') this.drawFinal(g, t);
    if (Settings.data.fps) LED.text(ctx, Math.round(App.fps) + ' FPS', this.W - 12, 18, 2, { align: 'right', color: '#7dff8a' });
  },
  // nájezdy: kolečka za každý pokus (zelené = gól, červené = neproměnil)
  drawShootoutHUD(g, t) {
    const ctx = this.ctx, so = g.shootout, n = Math.max(3, so.att[0].length, so.att[1].length), w = 150 + n * 34, x = this.W / 2 - w / 2, y = 12;
    LED.panel(ctx, x, y, w, 92, 3);
    LED.text(ctx, 'NÁJEZDY', this.W / 2, y + 14, 2, { align: 'center', color: '#9fe3ff' });
    g.teams.forEach((T, i) => {
      const yy = y + 42 + i * 30;
      this.chip(T, x + 12, yy - 10, 20); LED.text(ctx, T.def.abbr, x + 30, yy, 3);
      for (let k = 0; k < n; k++) {
        const r = so.att[i][k], cx = x + 120 + k * 34;
        ctx.beginPath(); ctx.arc(cx, yy, 10, 0, TAU);
        if (r == null) { ctx.strokeStyle = 'rgba(200,210,230,0.6)'; ctx.lineWidth = 2; ctx.stroke(); }
        else { ctx.fillStyle = r ? '#4cff7a' : '#ff4a3a'; ctx.fill(); }
        if (so.phase === 'run' && so.shootTeam === T && k === so.att[i].length && Math.floor(t * 3) % 2 === 0) { ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 3; ctx.stroke(); }
      }
    });
    if (so.phase === 'run' && so.def.humans.length && so.t < 3) LED.text(ctx, 'BRÁNÍŠ: PÁČKA = POSTAVENÍ BRANKÁŘE   X = VYPÍCHNOUT PUK', this.W / 2, this.H - 30, 2.5, { align: 'center', color: '#ffd21f' });
    if (so.phase === 'run' && so.shootTeam.humans.length && so.t < 3) LED.text(ctx, 'NÁJEZD: X = STŘELA   B = KLIČKA', this.W / 2, this.H - 30, 2.5, { align: 'center', color: '#ffd21f' });
  },
  drawReplayHUD(g, t) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, 46); ctx.fillRect(0, this.H - 46, this.W, 46);
    LED.panel(ctx, this.W - 236, 6, 222, 36, 3);
    if (Math.floor(t * 2) % 2 === 0) LED.text(ctx, '●', this.W - 222, 24, 3, { color: '#ff3a28' });
    LED.text(ctx, 'ZÁZNAM', this.W - 24, 24, 3, { align: 'right' });
    LED.text(ctx, 'A = PŘESKOČIT', this.W / 2, this.H - 22, 2, { align: 'center', color: '#bfc6d6' });
  },
  statsTable(g, x, y) {
    const ctx = this.ctx, [A, B] = g.teams;
    const rows = [['GÓLY', A.score, B.score], ['STŘELY', A.shots, B.shots], ['HITY', A.hits, B.hits], ['VYLOUČENÍ', A.pim, B.pim], ['PŘESILOVKY', A.ppg + '/' + A.ppOpp, B.ppg + '/' + B.ppOpp]];
    this.chip(A, x - 160, y - 12, 24); LED.text(ctx, A.def.abbr, x - 90, y, 3, { align: 'right' });
    this.chip(B, x + 150, y - 12, 24); LED.text(ctx, B.def.abbr, x + 90, y, 3);
    rows.forEach((r, i) => {
      const yy = y + 42 + i * 34;
      LED.text(ctx, r[0], x, yy, 2.5, { align: 'center', color: '#aeb6c8' });
      LED.text(ctx, r[1], x - 90, yy, 3, { align: 'right' });
      LED.text(ctx, r[2], x + 90, yy, 3);
    });
  },
  drawPeriodEnd(g, t) {
    const ctx = this.ctx, w = 600, h = 390, x = this.W / 2 - w / 2, y = 160;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, this.W, this.H);
    LED.panel(ctx, x, y, w, h, 4, 0.94);
    LED.text(ctx, 'KONEC ' + (g.period > 3 ? 'PRODLOUŽENÍ' : g.period + '. TŘETINY'), this.W / 2, y + 44, 4, { align: 'center' });
    this.statsTable(g, this.W / 2, y + 110);
    { const q = Math.round(g.iceQuality()); LED.text(ctx, 'STAV LEDU ' + q + ' %', this.W / 2, y + h - 62, 2.5, { align: 'center', color: q > 70 ? '#7dff8a' : q > 45 ? '#ffd21f' : '#ff8a6a' }); }
    if (Math.floor(t * 1.5) % 2 === 0) LED.text(ctx, 'A - POKRAČOVAT', this.W / 2, y + h - 28, 2.5, { align: 'center', color: '#ffd21f' });
    if (g.humans.length && g.cfg.zamboni !== 'off') LED.panel(ctx, this.W / 2 - 190, y + h + 8, 380, 36, 3, 0.9);
    if (g.humans.length && g.cfg.zamboni !== 'off') LED.text(ctx, g.cfg.zamboni === 'manual' ? 'ROLBA VYJÍŽDÍ...' : 'Y - ŘÍDIT ROLBU', this.W / 2, y + h + 26, 2.5, { align: 'center', color: '#9fe3ff' });
  },
  drawZamboniHUD(g, t) {
    const ctx = this.ctx, w = 430, x = this.W / 2 - w / 2, y = this.H - 104;
    LED.panel(ctx, x, y, w, 86, 4, 0.92);
    const pc = Math.round(g.zamPct());
    LED.text(ctx, 'ROLBA', x + 20, y + 24, 3, { color: '#9fe3ff' });
    LED.text(ctx, 'UKLIZENO ' + pc + ' %', x + w - 20, y + 24, 3, { align: 'right', color: pc >= 90 ? '#7dff8a' : '#ffd21f' });
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 20, y + 44, w - 40, 8);
    ctx.fillStyle = pc >= 90 ? '#7dff8a' : '#ffd21f'; ctx.fillRect(x + 20, y + 44, (w - 40) * pc / 100, 8);
    LED.text(ctx, 'PÁČKA = ŘÍZENÍ   B = HOTOVO', this.W / 2, y + 70, 2, { align: 'center', color: '#bfc6d6' });
  },
  drawFinal(g, t) {
    const ctx = this.ctx, w = 680, h = 520, x = this.W / 2 - w / 2, y = 96;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, this.W, this.H);
    LED.panel(ctx, x, y, w, h, 4, 0.95);
    LED.text(ctx, 'KONEC ZÁPASU', this.W / 2, y + 42, 5, { align: 'center' });
    const win = g.winner ? 'VÍTĚZ: ' + g.winner.def.city + ' ' + g.winner.def.name + (g.soWinner ? ' (NÁJEZDY)' : g.period > 3 ? ' (PRODL.)' : '') : 'REMÍZA';
    LED.text(ctx, win, this.W / 2, y + 88, 3, { align: 'center', color: '#ffd21f' });
    this.statsTable(g, this.W / 2, y + 136);
    LED.text(ctx, 'HVĚZDY ZÁPASU', this.W / 2, y + 338, 3, { align: 'center' });
    (g.stars || []).forEach((p, i) => {
      const yy = y + 372 + i * 30;
      LED.text(ctx, '★'.repeat(3 - i), x + 40, yy, 2.5, { color: '#ffd21f' });
      this.chip(p.team, x + 120, yy - 10, 20);
      LED.text(ctx, `#${p.num} ${p.first} ${p.name} (${p.team.def.abbr})`, x + 140, yy, 2.5);
      LED.text(ctx, p.isGoalie ? `${p.stats.sv}/${p.stats.sa} ZÁKR.` : `${p.stats.g} G ${p.stats.a} A`, x + w - 30, yy, 2.5, { align: 'right', color: '#aeb6c8' });
    });
    if (g.injuries && g.injuries.length) LED.text(ctx, 'ZRANĚNÍ: ' + g.injuries.map((q) => `#${q.player.num} ${q.player.name} (${q.team.def.abbr})`).join(', ').toUpperCase(), this.W / 2, y + 466, 2, { align: 'center', color: '#ff8a6a' });
    if (Math.floor(t * 1.5) % 2 === 0) LED.text(ctx, 'A - ZPĚT DO MENU   Y - STATISTIKY', this.W / 2, y + h - 24, 2.5, { align: 'center', color: '#ffd21f' });
  },
};
