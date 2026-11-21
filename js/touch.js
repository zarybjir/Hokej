'use strict';
// ---------- Dotykové ovládání (mobil / tablet): virtuální páčka + tlačítka ----------
// Objeví se po prvním dotyku, zmizí po stisku gamepadu nebo klávesy.
const Touch = {
  visible: false, touches: new Map(), stick: null, lx: 0, ly: 0, held: new Set(),
  // tlačítka v logických souřadnicích (W se mění podle šířky displeje)
  buttons() {
    const W = R.W, H = R.H;
    return [
      { id: 'a', x: W - 175, y: H - 92, r: 46, label: 'A', sub: 'PŘIHR.', col: '#2fbf4a' },
      { id: 'b', x: W - 85, y: H - 172, r: 46, label: 'B', sub: 'KLIČKA', col: '#e03a3a' },
      { id: 'x', x: W - 265, y: H - 172, r: 46, label: 'X', sub: 'STŘELA', col: '#2f7de0' },
      { id: 'y', x: W - 175, y: H - 252, r: 40, label: 'Y', sub: 'LOB', col: '#e0b52f' },
      { id: 'rt', x: W - 370, y: H - 80, r: 44, label: '»', sub: 'SPRINT', col: '#8a8f9c' },
      { id: 'lb', x: W - 70, y: H - 330, r: 34, label: '⇄', sub: 'STŘÍDÁNÍ', col: '#6a7080' },
      { id: 'start', x: W - 48, y: 150, r: 30, label: 'II', sub: '', col: '#6a7080' },
      { id: 'back', x: W - 118, y: 150, r: 30, label: '◎', sub: 'ZOOM', col: '#6a7080' },
    ];
  },
  init(el) {
    const opt = { passive: false };
    const toLogical = (t) => {
      const dpr = R.cv.width / R.vw;
      // v otočeném režimu: obsah je otočený o -90°, takže osy prohodíme
      const cx = R.rot ? window.innerHeight - t.clientY : t.clientX, cy = R.rot ? t.clientX : t.clientY;
      return [(cx * dpr - R.ox) / R.s, (cy * dpr - R.oy) / R.s];
    };
    const update = (e) => {
      e.preventDefault();
      this.visible = true;
      for (const t of e.changedTouches) this.touches.set(t.identifier, toLogical(t));
    };
    el.addEventListener('touchstart', (e) => {
      update(e);
      if (window.Sfx) { Sfx.init(); Sfx.resume(); }
      if (!this.fsTried) {
        this.fsTried = true;
        try {
          const d = document.documentElement;
          if (d.requestFullscreen && !document.fullscreenElement) d.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
        } catch (err) {}
      }
      for (const t of e.changedTouches) {
        const [x, y] = this.touches.get(t.identifier);
        if (!this.hitButton(x, y) && x < R.W * 0.5 && !this.stick) this.stick = { id: t.identifier, ox: x, oy: y };
      }
      this.refresh();
    }, opt);
    el.addEventListener('touchmove', (e) => { update(e); this.refresh(); }, opt);
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        this.touches.delete(t.identifier);
        if (this.stick && this.stick.id === t.identifier) this.stick = null;
      }
      this.refresh();
    };
    el.addEventListener('touchend', end, opt);
    el.addEventListener('touchcancel', end, opt);
  },
  hitButton(x, y) { return this.buttons().find((b) => Math.hypot(x - b.x, y - b.y) < b.r * 1.25) || null; },
  refresh() {
    this.held.clear();
    for (const [id, [x, y]] of this.touches) {
      if (this.stick && id === this.stick.id) continue;
      const b = this.hitButton(x, y);
      if (b) this.held.add(b.id);
    }
    this.lx = 0; this.ly = 0;
    if (this.stick && this.touches.has(this.stick.id)) {
      const [x, y] = this.touches.get(this.stick.id);
      let dx = x - this.stick.ox, dy = y - this.stick.oy;
      const d = Math.hypot(dx, dy), max = 70;
      if (d > max) { this.stick.ox = x - (dx / d) * max; this.stick.oy = y - (dy / d) * max; dx = (dx / d) * max; dy = (dy / d) * max; }
      const m = Math.hypot(dx, dy) / max;
      if (m > 0.15) { this.lx = (dx / max); this.ly = (dy / max); }
    }
  },
  read(s) {
    s.lx = this.lx; s.ly = this.ly;
    for (const id of this.held) s[id] = true;
    return s;
  },
  draw() {
    const ctx = R.ctx;

    ctx.save();
    // páčka
    const bx = this.stick ? this.stick.ox : 170, by = this.stick ? this.stick.oy : R.H - 190;
    ctx.globalAlpha = this.stick ? 0.55 : 0.28;
    ctx.fillStyle = '#0b1020'; ctx.strokeStyle = '#cfd8ea'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, by, 78, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = this.stick ? 0.85 : 0.4;
    ctx.fillStyle = '#e8eefc';
    ctx.beginPath(); ctx.arc(bx + this.lx * 70, by + this.ly * 70, 34, 0, TAU); ctx.fill();
    // tlačítka
    for (const b of this.buttons()) {
      const on = this.held.has(b.id);
      ctx.globalAlpha = on ? 0.95 : 0.55;
      ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (on ? 0.94 : 1), 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(b.r > 40 ? 28 : 20);
      ctx.fillText(b.label, b.x, b.y - (b.sub && b.r > 36 ? 7 : 0));
      if (b.sub) { ctx.font = font(b.r > 40 ? 11 : 10, 'bold'); ctx.fillText(b.sub, b.x, b.r > 36 ? b.y + 20 : b.y + b.r + 11); }
    }
    ctx.restore();
  },
};
