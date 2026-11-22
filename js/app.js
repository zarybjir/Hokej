'use strict';
// ---------- Obrazovky, menu, hlavní smyčka ----------
const PERIOD_OPTS = [1, 2, 3, 5, 10, 20];
const App = {
  screen: 'press', sel: 0, game: null, demo: null, t: 0, fps: 60, slots: {}, pauseSel: 0, helpFrom: 'title', speed: 1,

  init() {
    Settings.load();
    const q = new URLSearchParams(location.search);
    this.speed = Math.max(1, Math.min(50, +q.get('speed') || 1));
    this.newDemo();
    if (q.get('auto')) { this.screen = 'game'; this.game = new Game({ home: 0, away: 1, periodLen: (+q.get('len') || 3) * 60, diff: 1, humans: [], silent: !!q.get('mute') }); }
    if (q.get('screen')) this.screen = q.get('screen');
  },
  newDemo() {
    const a = Math.floor(Math.random() * TEAMS.length);
    let b = Math.floor(Math.random() * (TEAMS.length - 1)); if (b >= a) b++;
    this.demo = new Game({ home: a, away: b, periodLen: 240, silent: true, demo: true, humans: [] });
    this.demo.banner = null;
  },
  go(screen, sel = 0) { this.screen = screen; this.sel = sel; Sfx.stick(0.6); },
  menuMove(n, count, dt) {
    const M = Input.merged;
    if (M.nav('up', dt)) { this.sel = (this.sel + count - 1) % count; Sfx.stick(0.4); }
    if (M.nav('down', dt)) { this.sel = (this.sel + 1) % count; Sfx.stick(0.4); }
  },
  lr(dt) { const M = Input.merged; return M.nav('left', dt) ? -1 : M.nav('right', dt) ? 1 : 0; },

  update(dt) {
    this.t += dt;
    if (Input.anyEvent) { Sfx.init(); Sfx.resume(); }
    const M = Input.merged, S = Settings.data;
    if (this.screen !== 'game') {
      this.demo.update(dt);
      if (this.demo.over || this.demo.state === 'final') this.newDemo();
      if (this.demo.state === 'periodEnd') this.demo.nextPeriod();
      this.demo.banner = null; this.demo.lower = null;
    }
    switch (this.screen) {
      case 'press':
        if (M.pressed('a') || M.pressed('start') || (Input.anyEvent && Input.keys.size) || (Touch.visible && Touch.touches.size)) { Sfx.init(); Sfx.resume(); this.go('title'); }
        break;
      case 'title': {
        const items = 5;
        this.menuMove(0, items, dt);
        if (M.pressed('a') || M.pressed('start')) {
          if (this.sel === 0) this.go('setup');
          else if (this.sel === 1) { this.go('career'); Career.enter(); }
          else if (this.sel === 2) { this.setCat = 0; this.go('settings'); }
          else if (this.sel === 3) { this.helpFrom = 'title'; this.go('help'); }
          else if (this.sel === 4) { try { window.close(); } catch (e) {} this.quitMsg = 3; }
        }
        if (this.quitMsg) this.quitMsg = Math.max(0, this.quitMsg - dt);
        break;
      }
      case 'setup': {
        this.menuMove(0, 7, dt);
        const d = this.lr(dt);
        if (d) {
          const nx = (v, o) => { v = (v + d + TEAMS.length) % TEAMS.length; return v === o ? (v + d + TEAMS.length) % TEAMS.length : v; };
          if (this.sel === 0) S.home = nx(S.home, S.away);
          if (this.sel === 1) S.away = nx(S.away, S.home);
          if (this.sel === 2) { const i = PERIOD_OPTS.indexOf(S.periodLen); S.periodLen = PERIOD_OPTS[clamp((i < 0 ? 2 : i) + d, 0, PERIOD_OPTS.length - 1)]; }
          if (this.sel === 3) S.diff = clamp(S.diff + d, 0, DIFF.length - 1);
          if (this.sel === 4) S.autoChange = !S.autoChange;
          if (this.sel === 5) S.penalties = S.penalties === false;
          Sfx.stick(0.4); Settings.save();
        }
        if (M.pressed('y')) { this.rosterTeam = this.sel === 1 ? S.away : S.home; this.rosterFrom = this.sel; this.go('roster'); break; }
        if (M.pressed('a') || M.pressed('start')) {
          if (this.sel === 6 || M.pressed('start')) { this.initSlots(); this.go('ctrl'); }
          else if (this.sel === 4) { S.autoChange = !S.autoChange; Settings.save(); }
          else if (this.sel === 5) { S.penalties = S.penalties === false; Settings.save(); }
          else this.sel = Math.min(6, this.sel + 1);
        }
        if (M.pressed('b')) this.go('title');
        break;
      }
      case 'career': Career.update(dt); break;
      case 'roster': {
        const d = this.lr(dt);
        if (d) { this.rosterTeam = (this.rosterTeam + d + TEAMS.length) % TEAMS.length; Sfx.stick(0.4); }
        if (M.pressed('a') || M.pressed('b') || M.pressed('y')) this.go('setup', this.rosterFrom || 0);
        break;
      }
      case 'ctrl': {
        for (const dv of Input.activeDevices()) {
          if (!(dv.id in this.slots)) this.slots[dv.id] = 0;
          if (dv.nav('left', dt)) { this.slots[dv.id] = Math.max(-1, this.slots[dv.id] - 1); Sfx.stick(0.5); }
          if (dv.nav('right', dt)) { this.slots[dv.id] = Math.min(1, this.slots[dv.id] + 1); Sfx.stick(0.5); }
        }
        if (M.pressed('a') || M.pressed('start')) this.startGame();
        else if (M.pressed('b')) this.go('setup', 4);
        break;
      }
      case 'settings': {
        // karty nahoře (LB / RB), položky karty pod nimi
        const cats = this.settingsCats();
        if (this.setCat == null) this.setCat = 0;
        const tab = (M.pressed('rb') ? 1 : 0) - (M.pressed('lb') ? 1 : 0);
        if (tab) { this.setCat = (this.setCat + tab + cats.length) % cats.length; this.sel = 0; Sfx.stick(0.6); Settings.save(); break; }
        const cat = cats[this.setCat], n = cat.items.length + 1;
        this.menuMove(0, n, dt);
        const d = this.lr(dt), a = M.pressed('a');
        if (this.sel === cat.items.length) { if (a) { Settings.save(); this.go('title', 2); break; } }
        else if (d || a) { const it = cat.items[this.sel]; if (it.set) { it.set(d, a); Settings.save(); } }
        if (M.pressed('b')) { Settings.save(); this.go('title', 2); }
        break;
      }
      case 'teamedit': break; // ovládá se formulářem (myš / dotyk / klávesnice)
      case 'help':
        if (M.pressed('a') || M.pressed('b') || M.pressed('start')) {
          if (this.helpFrom === 'pause') { this.screen = 'game'; } else this.go('title', 3);
        }
        break;
      case 'game': {
        const g = this.game;
        if (g.paused) {
          this.menuMove(0, 3, dt);
          if (M.pressed('start') || M.pressed('b')) g.paused = false;
          else if (M.pressed('a')) {
            if (this.sel === 0) g.paused = false;
            else if (this.sel === 1) { this.helpFrom = 'pause'; this.screen = 'help'; }
            else {
              this.game = null; this.newDemo(); try { speechSynthesis.cancel(); } catch (e) {}
              if (this.careerMatch) { this.careerMatch = null; this.screen = 'career'; Career.go('hub'); } else this.go('title');
            }
          }
          break;
        }
        if (g.state === 'zamboni') {
          // řízení rolby: páčka / D-pad, B nebo START = hotovo
          const st = M.st, lx = st.lx + (st.right ? 1 : 0) - (st.left ? 1 : 0), ly = st.ly + (st.down ? 1 : 0) - (st.up ? 1 : 0);
          const ax = clamp(lx, -1, 1), ay = -clamp(ly, -1, 1);
          g.zam.ix = ax * VIEW.rx + ay * VIEW.fx; g.zam.iy = ax * VIEW.ry + ay * VIEW.fy;
          if (M.pressed('b') || M.pressed('start')) g.endZamboni();
        } else if (g.state === 'periodEnd' && M.pressed('y') && g.humans.length && g.cfg.zamboni !== 'off') { g.startZamboni(); }
        else if (M.pressed('start') && !['final', 'periodEnd'].includes(g.state)) { g.paused = true; this.sel = 0; Sfx.whistle(); break; }
        else if (M.pressed('a') || M.pressed('start')) g.confirm();
        if (M.pressed('back')) G3.zoomStep(Settings.data.zoom >= ZOOMS.length - 1 ? -(ZOOMS.length - 1) : 1);
        for (let i = 0; i < this.speed; i++) g.update(dt);
        if (g.over) {
          if (this.careerMatch) { Career.finishPlayed(g); this.game = null; this.newDemo(); this.screen = 'career'; }
          else { this.game = null; this.newDemo(); this.go('title'); }
        }
        break;
      }
    }
  },
  initSlots() {
    // zachová předchozí rozložení; první ovladač default k domácím
    const act = Input.activeDevices();
    if (!act.some((d) => this.slots[d.id] && this.slots[d.id] !== 0) && act.length) {
      const first = act.find((d) => d.kind === 'pad') || act[0];
      this.slots[first.id] = -1;
    }
  },
  startGame() {
    const S = Settings.data, humans = [];
    for (const d of Input.activeDevices()) {
      const s = this.slots[d.id];
      if (s === -1 && humans.length < 4) humans.push({ dev: d, team: 0 });
      if (s === 1 && humans.length < 4) humans.push({ dev: d, team: 1 });
    }
    Sfx.init(); Sfx.resume();
    this.game = new Game({ home: S.home, away: S.away, periodLen: S.periodLen * 60, diff: clamp(S.diff, 0, DIFF.length - 1), humans, autoChange: S.autoChange !== false, penalties: S.penalties !== false, injuries: S.injuries !== false, zamboni: S.zamboni || 'auto' });
    this.screen = 'game'; this.sel = 0;
  },
  toggleFull() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) {}
  },

  // ---------- kreslení ----------
  draw(dt) {
    const ctx = R.ctx;
    if (this.screen === 'game' || (this.screen === 'help' && this.helpFrom === 'pause')) {
      R.drawGame(this.game, this.t, dt);
      if (this.game.paused && this.screen === 'game') this.drawPause();
      if (this.screen === 'help') { this.dim(0.75); this.drawHelp(); }
      return;
    }
    // pozadí: ukázkový zápas
    const d = this.demo;
    R.updateCam(d.puck.x, dt, d.camSnap, 0, d.puck.y); d.camSnap = false;
    R.drawWorld(d, d.all, d.puck, d.time, dt, { puckSpeed: Math.hypot(d.puck.vx, d.puck.vy) });
    this.dim(this.screen === 'press' ? 0.35 : this.screen === 'help' || this.screen === 'roster' || this.screen === 'career' ? 0.82 : 0.6);
    if (this.screen === 'press' || this.screen === 'title') this.drawLogo();
    if (this.screen === 'press') {
      if (Math.floor(this.t * 1.6) % 2 === 0) R.chromeText('STISKNI  A  /  START', R.W / 2, 560, 34, '#fff', '#ffd21f');
      ctx.font = font(14, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
      ctx.fillText('1–2 hráči  •  gamepad nebo klávesnice', R.W / 2, 620);
    }
    if (this.screen === 'title') this.drawList(['EXHIBICE', 'KARIÉRA', 'NASTAVENÍ', 'OVLÁDÁNÍ', 'UKONČIT'], 450);
    if ((this.screen === 'title' || this.screen === 'press') && (Upd.newer() || Upd.flash > 0 || Upd.busy && Upd.server && Upd.newer())) {
      const ctx = R.ctx, txt = Upd.flash > 0 || Upd.busy ? Upd.msg : 'K dispozici je nová verze ' + Upd.remote.version + ' – Nastavení → Aktualizace';
      ctx.font = font(15, 'bold'); ctx.textAlign = 'center'; ctx.fillStyle = '#7dff8a'; ctx.fillText(txt, R.W / 2, 742);
      if (Upd.flash > 0) Upd.flash -= 1 / 60;
    }
    if (this.screen === 'title' && this.quitMsg) {
      ctx.font = font(15, 'bold'); ctx.fillStyle = '#ffd21f'; ctx.textAlign = 'center';
      ctx.fillText('Ukonči přes tlačítko Steam → Ukončit hru (nebo Alt+F4)', R.W / 2, 740);
    }
    if (this.screen === 'setup') this.drawSetup();
    if (this.screen === 'roster') this.drawRoster();
    if (this.screen === 'career') Career.draw();
    if (this.screen === 'ctrl') this.drawCtrl();
    if (this.screen === 'settings') this.drawSettings();
    if (this.screen === 'help') this.drawHelp();
  },
  dim(a) { R.ctx.fillStyle = `rgba(2,6,20,${a})`; R.ctx.fillRect(0, 0, R.W, R.H); },
  drawLogo() {
    const ctx = R.ctx, cx = R.W / 2, y = 200 + Math.sin(this.t * 1.5) * 4;
    ctx.save(); ctx.translate(cx, y); ctx.transform(1, 0, -0.12, 1, 0, 0);
    ctx.fillStyle = '#c8102e'; ctx.fillRect(-330, 52, 660, 10);
    ctx.fillStyle = '#1d4fb8'; ctx.fillRect(-330, 66, 660, 6);
    ctx.restore();
    R.chromeText('HOKEJ', cx - 70, y - 10, 120, '#ffffff', '#9fc4ff');
    R.chromeText("'98", cx + 215, y - 10, 120, '#fff4c0', '#ffb300');
    ctx.font = font(22); ctx.fillStyle = '#e8eefc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('L E D O V Á   L I G A', cx, y + 100);
  },
  drawList(items, y0, sel = this.sel) {
    const ctx = R.ctx;
    items.forEach((it, i) => {
      const y = y0 + i * 56, on = i === sel;
      if (on) {
        const w = 420, g = ctx.createLinearGradient(R.W / 2 - w / 2, 0, R.W / 2 + w / 2, 0);
        g.addColorStop(0, 'rgba(255,210,31,0)'); g.addColorStop(0.5, 'rgba(255,210,31,0.35)'); g.addColorStop(1, 'rgba(255,210,31,0)');
        ctx.fillStyle = g; ctx.fillRect(R.W / 2 - w / 2, y - 24, w, 48);
        this.puckIcon(R.W / 2 - 190 + Math.sin(this.t * 6) * 4, y);
      }
      R.chromeText(it, R.W / 2, y, on ? 36 : 30, on ? '#fff8d0' : '#ffffff', on ? '#ffcc33' : '#8fa4c8');
    });
  },
  puckIcon(x, y) {
    const ctx = R.ctx;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y + 3, 14, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.ellipse(x, y, 14, 7, 0, 0, TAU); ctx.fill();
  },
  teamLogo(T, x, y, s) {
    const ctx = R.ctx;
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12 * s; ctx.shadowOffsetY = 4 * s;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, 80 * s, 0, TAU); ctx.fill();
    ctx.shadowColor = 'transparent';
    drawEmblem(ctx, T, 160 * s);
    ctx.restore();
  },
  teamCard(T, x, y, label, on) {
    const ctx = R.ctx, w = 380, h = 330;
    R.panel(x - w / 2, y, w, h, 0.85);
    if (on) { ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 3; ctx.strokeRect(x - w / 2 + 1.5, y + 1.5, w - 3, h - 3); }
    ctx.font = font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#9fe3ff'; ctx.fillText(label, x, y + 22);
    this.teamLogo(T, x, y + 110, 0.8);
    if (on) {
      ctx.fillStyle = '#ffd21f'; ctx.font = font(36);
      ctx.fillText('◄', x - 150 - Math.sin(this.t * 6) * 3, y + 110); ctx.fillText('►', x + 150 + Math.sin(this.t * 6) * 3, y + 110);
    }
    R.chromeText(T.city.toUpperCase(), x, y + 200, 28);
    ctx.font = font(18, 'bold'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(T.name.toUpperCase(), x, y + 226);
    ctx.font = font(10, 'bold'); ctx.fillStyle = '#8a93a6'; ctx.fillText((T.conf ? 'ZÁPAD' : 'VÝCHOD') + ' • ' + ({ ATLANTIC: 'ATLANTICKÁ', METRO: 'METROPOLITNÍ', CENTRAL: 'CENTRÁLNÍ', PACIFIC: 'PACIFICKÁ' }[T.div] || '') + ' DIVIZE', x, y + 240);
    const RT = teamRatings(TEAMS.indexOf(T));
    const bars = [['SÍLA', RT.SIL], ['RYCHLOST', RT.RYC], ['PŘESNOST', RT.PRE], ['STAMINA', RT.STA], ['BRANKÁŘ', RT.REF]];
    bars.forEach(([n, v], i) => {
      const yy = y + 254 + i * 15;
      ctx.font = font(11, 'bold'); ctx.textAlign = 'right'; ctx.fillStyle = '#cfd8ea'; ctx.fillText(n, x - 70, yy);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - 60, yy - 5, 200, 10);
      ctx.fillStyle = v >= 80 ? '#4cff7a' : v >= 74 ? '#ffd21f' : '#ff9a3a'; ctx.fillRect(x - 60, yy - 5, 200 * clamp((v - 50) / 45, 0, 1), 10);
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(String(v), x + 146, yy);
    });
  },
  drawSetup() {
    const ctx = R.ctx, S = Settings.data;
    R.chromeText('EXHIBICE', R.W / 2, 50, 46);
    this.teamCard(TEAMS[S.home], R.W / 2 - 230, 90, 'DOMÁCÍ', this.sel === 0);
    this.teamCard(TEAMS[S.away], R.W / 2 + 230, 90, 'HOSTÉ', this.sel === 1);
    R.chromeText('VS', R.W / 2, 250, 54, '#fff', '#ff5a3c');
    const rows = [['DÉLKA TŘETINY', S.periodLen + ' MIN'], ['OBTÍŽNOST', DIFF[clamp(S.diff, 0, DIFF.length - 1)].name.toUpperCase()],
      ['STŘÍDÁNÍ FORMACÍ', S.autoChange !== false ? 'AUTOMATICKY' : 'RUČNĚ (LB)'], ['FAULY A VYLOUČENÍ', S.penalties !== false ? 'ZAP' : 'VYP']];
    rows.forEach(([n, v], i) => {
      const y = 452 + i * 42, on = this.sel === i + 2;
      R.panel(R.W / 2 - 300, y - 19, 600, 38, on ? 0.95 : 0.6);
      if (on) { ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2; ctx.strokeRect(R.W / 2 - 299, y - 18, 598, 36); }
      ctx.font = font(18); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfd8ea'; ctx.fillText(n, R.W / 2 - 280, y);
      ctx.textAlign = 'right'; ctx.fillStyle = on ? '#ffd21f' : '#fff'; ctx.fillText((on ? '◄  ' : '') + v + (on ? '  ►' : ''), R.W / 2 + 280, y);
    });
    const on = this.sel === 6;
    R.chromeText('POKRAČOVAT  ►', R.W / 2, 640, on ? 38 : 30, on ? '#fff8d0' : '#fff', on ? '#ffcc33' : '#8fa4c8');
    ctx.font = font(14, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'center';
    ctx.fillText('↑↓ výběr   ◄► změna   A potvrdit   Y soupiska a statistiky hráčů   B zpět', R.W / 2, 760);
  },
  drawRoster() {
    const ctx = R.ctx, T = TEAMS[this.rosterTeam], Rr = buildRoster(this.rosterTeam), RT = teamRatings(this.rosterTeam);
    this.dim(0.35);
    R.chromeText('◄  ' + T.city.toUpperCase() + ' ' + T.name.toUpperCase() + '  ►', R.W / 2, 40, 34);
    const x0 = R.W / 2 - 470, cols = [0, 70, 120, 420, 520, 620, 720, 830];
    const head = ['POZ', '#', 'JMÉNO', 'SÍLA', 'RYCHL.', 'PŘESN.', 'STAMINA', 'CELKEM'];
    R.panel(x0 - 20, 68, 980, 686, 0.88);
    ctx.textBaseline = 'middle';
    head.forEach((h, i) => { ctx.font = font(13, 'bold'); ctx.fillStyle = '#9fe3ff'; ctx.textAlign = i >= 3 ? 'center' : 'left'; ctx.fillText(h, x0 + cols[i] + (i >= 3 ? 30 : 0), 88); });
    const col = (v) => (v >= 85 ? '#4cff7a' : v >= 75 ? '#ffffff' : v >= 65 ? '#ffd21f' : '#ff9a3a');
    let y = 112;
    const row = (p, vals) => {
      ctx.font = font(14, 'bold'); ctx.textAlign = 'left'; ctx.fillStyle = '#cfd8ea'; ctx.fillText(p.role === 'G' ? 'G' : p.role, x0 + cols[0], y);
      ctx.fillStyle = '#ffd21f'; ctx.fillText(String(p.num), x0 + cols[1], y);
      ctx.fillStyle = '#fff'; ctx.fillText(p.first + ' ' + p.name, x0 + cols[2], y); if (p.kg) { const w = ctx.measureText(p.first + ' ' + p.name).width; ctx.save(); ctx.font = font(12, 'bold'); ctx.fillStyle = '#8a93a6'; ctx.fillText(p.cm + ' cm · ' + p.kg + ' kg', x0 + cols[2] + w + 12, y); ctx.restore(); }
      vals.forEach((v, i) => {
        if (v == null) return;
        ctx.textAlign = 'center'; ctx.fillStyle = col(v); ctx.font = font(15, 'bold'); ctx.fillText(String(v), x0 + cols[3 + i] + 30, y);
      });
      y += 25;
    };
    Rr.lines.forEach((line, L) => {
      ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillStyle = '#ffd21f'; ctx.fillText((L + 1) + '. FORMACE', x0, y); y += 24;
      for (const p of line) { const a = p.at; row(p, [a.SIL, a.RYC, a.PRE, a.STA, Math.round((a.SIL + a.RYC + a.PRE + a.STA * 0.6) / 3.6)]); }
      y += 6;
    });
    ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillStyle = '#ffd21f'; ctx.fillText('BRANKÁŘI  (REFLEXY / POHYB / STAMINA)', x0, y); y += 24;
    Rr.goalies.forEach((p, k) => row(p, [p.at.REF, p.at.RYC, null, p.at.STA, k === 0 ? p.at.REF : null]));
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'center';
    ctx.fillText(`TÝM: SÍLA ${RT.SIL}  RYCHLOST ${RT.RYC}  PŘESNOST ${RT.PRE}  STAMINA ${RT.STA}  BRANKÁŘ ${RT.REF}   •   ◄► jiný tým   A/B zpět`, R.W / 2, 776);
  },
  drawCtrl() {
    const ctx = R.ctx, S = Settings.data;
    R.chromeText('VÝBĚR OVLADAČŮ', R.W / 2, 50, 44);
    const cols = [R.W / 2 - 360, R.W / 2, R.W / 2 + 360];
    const heads = [TEAMS[S.home], null, TEAMS[S.away]];
    heads.forEach((T, i) => {
      if (T) { this.teamLogo(T, cols[i], 160, 0.6); R.chromeText(T.city.toUpperCase(), cols[i], 240, 24); ctx.font = font(14, 'bold'); ctx.fillStyle = '#9fe3ff'; ctx.textAlign = 'center'; ctx.fillText(i === 0 ? 'DOMÁCÍ' : 'HOSTÉ', cols[i], 266); }
      else { ctx.font = font(18); ctx.fillStyle = '#8fa4c8'; ctx.textAlign = 'center'; ctx.fillText('POČÍTAČ', cols[1], 160); ctx.font = font(13, 'bold'); ctx.fillText('(nehraje)', cols[1], 186); }
    });
    const devs = Input.activeDevices();
    if (!devs.length) {
      ctx.font = font(18, 'bold'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('Stiskni tlačítko na ovladači, aby se objevil.', R.W / 2, 380);
    }
    devs.forEach((d, i) => {
      const s = this.slots[d.id] || 0, x = cols[s + 1], y = 320 + i * 74;
      const col = d.kind === 'pad' ? '#2ee6ff' : '#ffd21f';
      R.panel(x - 130, y, 260, 58, 0.9);
      ctx.strokeStyle = s ? col : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(x - 129, y + 1, 258, 56);
      ctx.font = font(18); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.name.toUpperCase(), x, y + 22);
      ctx.font = font(11, 'bold'); ctx.fillStyle = '#aab';
      ctx.fillText(s === 0 ? '◄  posuň k týmu  ►' : s < 0 ? 'hraje za domácí  ►' : '◄  hraje za hosty', x, y + 44);
    });
    const hum = devs.filter((d) => this.slots[d.id]).length;
    R.chromeText(hum ? 'A  =  ZAČÍT ZÁPAS' : 'A  =  SLEDOVAT (CPU vs CPU)', R.W / 2, 690, 30, '#fff8d0', '#ffcc33');
    ctx.font = font(14, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'center';
    ctx.fillText('Každý hráč posune svůj ovladač páčkou doleva/doprava.  Dva na jedné straně = spolupráce.   B zpět', R.W / 2, 750);
  },
  // editor vlastních názvů týmů (HTML formulář přes hru, kvůli psaní textu)
  openTeamEditor() {
    this.screen = 'teamedit';
    const el = document.createElement('div'); el.id = 'teamedit';
    el.style.cssText = 'cursor:auto;position:fixed;inset:0;z-index:50;background:rgba(6,10,22,.94);color:#fff;font:15px "DejaVu Sans",Arial,sans-serif;overflow:auto;padding:16px';
    const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const inp = 'background:#101a33;color:#fff;border:1px solid #3a4d7a;border-radius:4px;padding:5px 7px;font:inherit;width:100%;box-sizing:border-box';
    const btn = 'background:#ffd21f;color:#111;border:0;border-radius:6px;padding:10px 18px;font:bold 15px "DejaVu Sans",Arial,sans-serif;margin:0 6px;cursor:pointer';
    el.innerHTML = `<div style="max-width:900px;margin:0 auto">
      <h2 style="margin:4px 0 6px;font-style:italic">VLASTNÍ NÁZVY TÝMŮ</h2>
      <p style="margin:0 0 12px;color:#9fe3ff">Názvy se ukládají jen v tomto prohlížeči. Zkratka má nejvýš 3 znaky. Na Legion Go / Steam Decku otevřeš klávesnici přes Steam + X.</p>
      <table style="width:100%;border-collapse:collapse">
      <tr style="color:#9fe3ff;text-align:left"><th style="width:34%">Město</th><th style="width:44%">Přezdívka</th><th>Zkratka</th></tr>
      ${TEAMS.map((t, i) => `<tr>
        <td style="padding:3px 6px 3px 0"><input data-i="${i}" data-k="city" maxlength="16" value="${esc(t.city)}" style="${inp}"></td>
        <td style="padding:3px 6px 3px 0"><input data-i="${i}" data-k="name" maxlength="18" value="${esc(t.name)}" style="${inp}"></td>
        <td style="padding:3px 0"><input data-i="${i}" data-k="abbr" maxlength="3" value="${esc(t.abbr)}" style="${inp};text-transform:uppercase"></td></tr>`).join('')}
      </table>
      <div style="position:sticky;bottom:0;padding:14px 0;background:rgba(6,10,22,.96);text-align:center">
        <button data-a="save" style="${btn}">ULOŽIT</button>
        <button data-a="reset" style="${btn};background:#8a93a6">VÝCHOZÍ NÁZVY</button>
        <button data-a="close" style="${btn};background:#cfd8ea">ZAVŘÍT</button>
      </div></div>`;
    const close = () => { el.remove(); this.go('settings', 0); this.setCat = 3; };
    el.addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'save') {
        el.querySelectorAll('input').forEach((x) => { const v = x.value.trim(); if (v) TEAMS[+x.dataset.i][x.dataset.k] = x.dataset.k === 'abbr' ? v.toUpperCase().slice(0, 3) : v; });
        TeamNames.save(); if (window.G3 && G3.refreshTeams) G3.refreshTeams(); close();
      } else if (a === 'reset') {
        try { localStorage.removeItem(TeamNames.KEY); } catch (err) {}
        TeamNames.load(); if (window.G3 && G3.refreshTeams) G3.refreshTeams(); close();
      } else close();
    });
    // klávesy z formuláře nepouštět do hry
    for (const ev of ['keydown', 'keyup']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(el);
  },
  // ---------- nastavení po kategoriích ----------
  settingsCats() {
    const S = Settings.data, onoff = (v) => (v ? 'ZAP' : 'VYP'), cyc = (arr, cur, d) => arr[(arr.indexOf(cur) + (d || 1) + arr.length) % arr.length];
    return [
      { name: 'OBRAZ', desc: 'Kamera, zoom, kvalita grafiky, celá obrazovka', items: [
        { label: 'KAMERA', val: () => (S.cam === 'side' ? 'Z BOKU' : 'SESHORA'), set: () => { S.cam = S.cam === 'side' ? 'top' : 'side'; R.setPreset(S.cam); } },
        { label: 'ZOOM', val: () => '◄ ' + ZOOM_NAMES[S.zoom == null ? 1 : S.zoom] + ' ►', set: (d) => { G3.zoomStep(d || 1); G3.toast = null; } },
        { label: 'GRAFIKA', val: () => '◄ ' + GFX[S.gfx || 'high'].name + ' ►', set: (d) => { S.gfx = cyc(GFX_ORDER, S.gfx || 'high', d); G3.applyQuality(S.gfx); },
          hint: 'VYSOKÁ = bloom, zrcadlení ledu, ostré stíny. Při trhání zkus STŘEDNÍ.' },
        { label: 'CELÁ OBRAZOVKA', val: () => onoff(document.fullscreenElement), set: (d, a) => { if (a) this.toggleFull(); } },
        { label: 'JMENOVKA NAD HRÁČEM S PUKEM', val: () => onoff(S.tags !== false), set: () => { S.tags = S.tags === false; } },
        { label: 'ZÁZNAM PO GÓLU', val: () => onoff(S.replay), set: () => { S.replay = !S.replay; } },
        { label: 'ZOBRAZIT FPS', val: () => onoff(S.fps), set: () => { S.fps = !S.fps; } },
      ] },
      { name: 'ZVUK', desc: 'Hlasitost a komentář', items: [
        { label: 'HLASITOST', val: () => '▮'.repeat(S.vol) + '▯'.repeat(10 - S.vol), set: (d) => { if (d) { S.vol = clamp(S.vol + d, 0, 10); Sfx.setVol(S.vol); Sfx.stick(0.8); } } },
        { label: 'KOMENTÁŘ (HLAS)', val: () => onoff(S.comm), set: () => { S.comm = !S.comm; if (S.comm) Voice.say('Komentář zapnut.', true); },
          hint: 'Komentář používá hlasovou syntézu systému — na některých zařízeních nemusí být k dispozici.' },
      ] },
      { name: 'HRA', desc: 'Obtížnost, střídání, fauly, zranění, rolba', items: [
        { label: 'OBTÍŽNOST', val: () => '◄ ' + DIFF[clamp(S.diff, 0, DIFF.length - 1)].name.toUpperCase() + ' ►', set: (d) => { S.diff = (S.diff + (d || 1) + DIFF.length) % DIFF.length; } },
        { label: 'STŘÍDÁNÍ FORMACÍ', val: () => (S.autoChange !== false ? 'AUTOMATICKY' : 'RUČNĚ (LB)'), set: () => { S.autoChange = S.autoChange === false; } },
        { label: 'FAULY A VYLOUČENÍ', val: () => onoff(S.penalties !== false), set: () => { S.penalties = S.penalties === false; } },
        { label: 'ZRANĚNÍ', val: () => onoff(S.injuries !== false), set: () => { S.injuries = S.injuries === false; } },
        { label: 'ROLBA O PŘESTÁVCE', val: () => '◄ ' + { auto: 'AUTOMATICKY', manual: 'ŘÍDÍM SÁM', off: 'VYPNUTÁ' }[S.zamboni || 'auto'] + ' ►', set: (d) => { S.zamboni = cyc(['auto', 'manual', 'off'], S.zamboni || 'auto', d); },
          hint: 'ŘÍDÍM SÁM: o přestávce řídíš rolbu páčkou a uklízíš stopy bruslí (B = hotovo).' },
      ] },
      { name: 'TÝMY', desc: 'Vlastní názvy měst, přezdívek a zkratek', items: [
        { label: 'VLASTNÍ NÁZVY TÝMŮ', val: () => 'UPRAVIT ►', set: (d, a) => { if (a) { Settings.save(); this.openTeamEditor(); } }, hint: 'Názvy se ukládají jen v tomto zařízení.' },
      ] },
      { name: 'AKTUALIZACE', desc: 'Verze hry a stažení nové verze z GitHubu', items: [
        { label: 'NAINSTALOVANÁ VERZE', val: () => (Upd.local ? Upd.local.version : '?') },
        { label: 'NEJNOVĚJŠÍ VERZE', val: () => (Upd.busy && !Upd.remote ? '…' : Upd.remote ? Upd.remote.version + (Upd.newer() ? '  (NOVÁ!)' : '') : 'NEZJIŠTĚNO') },
        { label: 'ZKONTROLOVAT AKTUALIZACE', val: () => '►', set: (d, a) => { if (a) Upd.check(); } },
        { label: 'AKTUALIZOVAT TEĎ', val: () => (Upd.newer() ? 'NAINSTALOVAT ►' : '–'), set: (d, a) => { if (a) { if (Upd.newer()) Upd.update(); else Upd.msg = Upd.checked ? 'Máš nejnovější verzi.' : 'Nejdřív zkontroluj aktualizace.'; } } },
        { label: 'AUTOMATICKY PŘI SPUŠTĚNÍ', val: () => onoff(S.autoUpdate !== false), set: () => { S.autoUpdate = S.autoUpdate === false; },
          hint: 'Nová verze se stáhne z GitHubu při spuštění hry přes hokej.sh (potřebuje internet).' },
      ] },
    ];
  },
  drawSettings() {
    const ctx = R.ctx, cats = this.settingsCats(), ci = this.setCat || 0, cat = cats[ci];
    R.chromeText('NASTAVENÍ', R.W / 2, 46, 40);
    // karty
    const tw = 168, gap = 8, total = cats.length * tw + (cats.length - 1) * gap, x0 = R.W / 2 - total / 2, ty = 84;
    ctx.font = font(13, 'bold'); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe3ff'; ctx.fillText('LB ◄', x0 - 34, ty + 22); ctx.fillText('► RB', x0 + total + 34, ty + 22);
    cats.forEach((c, i) => {
      const x = x0 + i * (tw + gap), on = i === ci;
      R.panel(x, ty + (on ? 0 : 4), tw, on ? 46 : 40, on ? 0.98 : 0.55);
      if (on) { ctx.fillStyle = '#ffd21f'; ctx.fillRect(x, ty + 42, tw, 4); }
      ctx.font = font(on ? 18 : 16); ctx.fillStyle = on ? '#fff' : '#9aa6bd'; ctx.fillText(c.name, x + tw / 2, ty + 22);
      if (c.name === 'AKTUALIZACE' && Upd.newer()) { ctx.fillStyle = '#7dff8a'; ctx.beginPath(); ctx.arc(x + tw - 12, ty + 12, 5, 0, TAU); ctx.fill(); }
    });
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(cat.desc.toUpperCase(), R.W / 2, ty + 66);
    const row = (y, label, val, on) => {
      R.panel(R.W / 2 - 330, y - 20, 660, 40, on ? 0.95 : 0.6);
      if (on) { ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2; ctx.strokeRect(R.W / 2 - 329, y - 19, 658, 38); }
      ctx.font = font(18); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = on ? '#fff' : '#cfd8ea'; ctx.fillText(label, R.W / 2 - 305, y);
      ctx.textAlign = 'right'; ctx.fillStyle = on ? '#ffd21f' : '#fff'; ctx.fillText(val, R.W / 2 + 305, y);
    };
    const foot = (t, y) => { ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'center'; ctx.fillText(t, R.W / 2, y); };
    const y0 = 196;
    cat.items.forEach((it, i) => row(y0 + i * 48, it.label, it.val(), this.sel === i));
    const yb = y0 + cat.items.length * 48;
    row(yb, 'ZPĚT DO MENU', '', this.sel === cat.items.length);
    const it = cat.items[this.sel];
    if (it && it.hint) foot(it.hint, yb + 52);
    if (cat.name === 'AKTUALIZACE') {
      if (Upd.msg) { ctx.font = font(16, 'bold'); ctx.fillStyle = '#9fe3ff'; ctx.textAlign = 'center'; ctx.fillText(Upd.msg, R.W / 2, yb + 86); }
      const notes = (Upd.newer() ? Upd.remote : Upd.local || {}).notes || [];
      if (notes.length) {
        ctx.font = font(14, 'bold'); ctx.fillStyle = '#ffd21f'; ctx.fillText(Upd.newer() ? 'CO PŘINÁŠÍ NOVÁ VERZE:' : 'CO JE NOVÉHO:', R.W / 2, yb + 120);
        ctx.font = font(13, 'bold'); ctx.fillStyle = '#cfd8ea';
        notes.slice(0, 5).forEach((n, i) => ctx.fillText('• ' + n, R.W / 2, yb + 144 + i * 20));
      }
      if (!Upd.server) foot('Instalace aktualizací funguje ve hře spuštěné přes hokej.sh. Webová verze se aktualizuje sama.', 756);
    }
    foot('LB / RB karta   ↑↓ výběr   ◄► / A změna   B zpět', 784);
  },
  drawHelp() {
    const ctx = R.ctx;
    R.chromeText('OVLÁDÁNÍ', R.W / 2, 60, 46);
    const L = [
      ['LEVÁ PÁČKA', 'bruslení (i D-pad)'], ['RT / RB', 'sprint (spotřebovává sílu)'],
      ['', ''], ['S PUKEM', ''],
      ['A', 'přihrávka (ve směru páčky)'], ['X', 'střela — ťukni = zápěstí, drž = příklep'],
      ['X během přihrávky k tobě', 'golfák z první (one-timer)'], ['B', 'klička'], ['Y', 'lobovaná přihrávka / nahození'],
      ['páčka do strany při střele', 'mířit k levé / pravé tyči'],
      ['', ''], ['BEZ PUKU', ''],
      ['A', 'přepnout na hráče nejblíž puku'], ['X', 'bodyček'], ['B', 'šťouchnutí holí (poke)'],
      ['A když má puk spoluhráč', '„dej mi ho!" — přihraje ti'], ['BULY', 'stiskni A/X přesně, když puk dopadne'],
      ['LB', 'střídání formace (při ručním střídání)'], ['VIEW (BACK)', 'zoom kamery'], ['MENU / START', 'pauza'],
    ];
    L.forEach(([a, b], i) => {
      const y = 112 + i * 28;
      if (!a && !b) return;
      if (!b) { ctx.font = font(18); ctx.fillStyle = '#ffd21f'; ctx.textAlign = 'center'; ctx.fillText(a, R.W / 2, y); return; }
      ctx.font = font(16); ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = '#9fe3ff'; ctx.fillText(a, R.W / 2 - 20, y);
      ctx.font = font(16, 'bold'); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(b, R.W / 2 + 20, y);
    });
    ctx.font = font(12, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
    ctx.fillText('Fauly: šťouchnutí zezadu, hůl do nohou, bodyček zezadu, na mantinel nebo do hráče bez puku → vyloučení (hra 5 na 4).', R.W / 2, 668);
    ctx.fillText('Klávesnice 1: WASD, J=A, K=X, L=B, I=Y, Mezerník=sprint, Esc=pauza   •   Klávesnice 2: šipky, Num1=A, Num2=X, Num3=B, Num5=Y, Num0=sprint, Enter=pauza', R.W / 2, 690);
    ctx.font = font(14, 'bold'); ctx.fillStyle = '#ffd21f'; ctx.fillText('A / B — zpět', R.W / 2, 740);
  },
  drawPause() {
    this.dim(0.6);
    R.chromeText('PAUZA', R.W / 2, 220, 64);
    this.drawList(['POKRAČOVAT', 'OVLÁDÁNÍ', 'UKONČIT ZÁPAS'], 360);
  },
};

// ---------- start ----------
(function main() {
  const cv = document.getElementById('c');
  Settings.load(); // před 3D enginem, aby se hned použila správná kvalita grafiky
  R.init(cv);
  Touch.init(cv);
  if (!G3.init(document.getElementById('gl'))) {
    document.body.insertAdjacentHTML('beforeend', '<div id="msg">WebGL není k dispozici — zapni hardwarovou akceleraci v prohlížeči.</div>');
  }
  Input.init();
  App.init();
  Upd.init();
  try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => Voice.pickVoice(); } catch (e) {}
  // zvuk: s --autoplay-policy=no-user-gesture-required běží hned, jinak po první klávese
  Sfx.init();
  const unlock = () => { Sfx.init(); Sfx.resume(); };
  window.addEventListener('keydown', unlock); window.addEventListener('pointerdown', unlock);
  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)) || 1 / 60;
    last = ts;
    App.fps = lerp(App.fps, 1 / Math.max(dt, 0.001), 0.05);
    Input.poll(dt);
    try { App.update(dt); } catch (e) { console.error(e); if (!App.errShown) { App.errShown = true; showError('Chyba ve hře: ' + e.message); } }
    R.begin();
    try { App.draw(dt); if (Touch.visible) Touch.draw(); } catch (e) { console.error(e); }
    R.end();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__app = App;
})();
