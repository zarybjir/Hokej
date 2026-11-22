'use strict';
// ---------- Aktualizace hry z GitHubu (přes lokální server.py spuštěný z hokej.sh) ----------
const REMOTE_VERSION = 'https://raw.githubusercontent.com/zarybjir/Hokej/main/version.json';
const Upd = {
  local: null, remote: null, server: false, mode: '', busy: false, msg: '', checked: false,
  newer() { return !!(this.remote && this.local && this.remote.build > this.local.build); },
  async init() {
    try { this.local = await (await fetch('version.json', { cache: 'no-store' })).json(); } catch (e) { this.local = { build: 0, version: '?' }; }
    try { const r = await fetch('api/version', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); this.server = true; this.mode = j.mode; } } catch (e) {}
    try { const done = sessionStorage.getItem('hokej98-updated'); if (done) { sessionStorage.removeItem('hokej98-updated'); this.msg = 'Hra byla aktualizována na verzi ' + done + '.'; this.flash = 6; } } catch (e) {}
    if (Settings.data.autoUpdate !== false) {
      await this.check();
      if (this.newer() && this.server) this.update(true);
    }
  },
  async check() {
    if (this.busy) return;
    this.busy = true; this.msg = 'Zjišťuji nejnovější verzi…';
    try {
      if (this.server) {
        const j = await (await fetch('api/check', { cache: 'no-store' })).json();
        if (!j.ok) throw new Error(j.error);
        this.remote = j.remote;
      } else this.remote = await (await fetch(REMOTE_VERSION, { cache: 'no-store' })).json();
      this.msg = this.newer() ? 'K dispozici je verze ' + this.remote.version + '.' : 'Máš nejnovější verzi.';
    } catch (e) {
      this.msg = 'Nepodařilo se spojit s GitHubem (offline?).';
    }
    this.checked = true; this.busy = false;
  },
  async update(auto) {
    if (this.busy) return;
    if (!this.server) { this.msg = 'Aktualizovat jde jen ve hře spuštěné přes hokej.sh (webová verze se aktualizuje sama).'; return; }
    this.busy = true; this.msg = 'Stahuji a instaluji aktualizaci…';
    try {
      const j = await (await fetch('api/update', { method: 'POST', cache: 'no-store' })).json();
      if (!j.ok) throw new Error(j.error);
      this.local = j.to;
      this.msg = 'Hotovo – verze ' + j.to.version + '. Hra se restartuje…';
      try { sessionStorage.setItem('hokej98-updated', j.to.version); } catch (e) {}
      // v menu restart hned, uprostřed zápasu počká na návrat do menu
      const go = () => { if (!App.game || App.screen !== 'game') location.reload(); else setTimeout(go, 1000); };
      setTimeout(go, auto ? 300 : 1500);
    } catch (e) {
      this.msg = 'Aktualizace selhala: ' + String(e.message || e).slice(0, 120);
      this.busy = false;
    }
  },
};
