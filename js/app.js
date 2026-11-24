'use strict';
// ---------- Obrazovky, menu, hlavní smyčka ----------
const PERIOD_OPTS = [1, 2, 3, 5, 10, 20];
const ASSIST_NAMES = ['VYPNUTÁ', 'ČÁSTEČNÁ', 'PLNÁ (DĚTI)'];
const ASSIST_HINT = 'ČÁSTEČNÁ: přepíná na hráče u puku, přesnější střely. PLNÁ: hráč sám napadá, střely míří samy.';
const SPEEDS = [0.7, 0.8, 0.9, 1, 1.1, 1.25];
const PRACTICE = [['shoot', 'STŘELBA A PŘIHRÁVKY', 'Celá formace proti brankáři, bez soupeřů a bez času. Po gólu nebo zákroku dostaneš puk znovu.'],
  ['pp', 'PŘESILOVKA 5 NA 4', 'Útočíš v pásmu proti čtyřem bránícím. Když puk vyjede z pásma, začíná se znovu.'],
  ['so', 'NÁJEZDY – STŘÍLÍŠ', 'Nekonečné nájezdy na brankáře soupeře.'],
  ['sog', 'NÁJEZDY – CHYTÁŠ', 'Řídíš brankáře: páčka = postavení, X = vypíchnout puk.']];
const BIND_ACTIONS = [['a', 'PŘIHRÁVKA / PŘEPNUTÍ HRÁČE'], ['x', 'STŘELA / BODYČEK'], ['b', 'KLIČKA / ŠŤOUCHNUTÍ'], ['y', 'LOB / NAHOZENÍ'],
  ['lt', 'LT: O MANTINEL / ŠVIHOVKA / BLOK / HŮL'], ['rt', 'SPRINT'], ['lb', 'STŘÍDÁNÍ FORMACE'], ['start', 'PAUZA'], ['back', 'ZOOM']];
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
    if (this.screen === 'press') {   // ukázkový zápas běží jen pod úvodní obrazovkou (zahřeje 3D scénu)
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
        const items = 7;
        this.menuMove(0, items, dt);
        if (M.pressed('a') || M.pressed('start')) {
          if (this.sel === 0) this.go('setup');
          else if (this.sel === 1) { this.go('career'); Career.enter(); }
          else if (this.sel === 2) this.go('practice');
          else if (this.sel === 3) this.go('ach');
          else if (this.sel === 4) { this.setCat = 0; this.go('settings'); }
          else if (this.sel === 5) { this.go('settings'); this.setCat = this.settingsCats().findIndex((c) => c.name === 'OVLÁDÁNÍ'); }   // mapování tlačítek + přehled
          else if (this.sel === 6) { try { window.close(); } catch (e) {} this.quitMsg = 3; }
        }
        if (this.quitMsg) this.quitMsg = Math.max(0, this.quitMsg - dt);
        break;
      }
      case 'setup': {
        this.menuMove(0, 8, dt);
        const d = this.lr(dt);
        if (d) {
          const nx = (v, o) => { v = (v + d + TEAMS.length) % TEAMS.length; return v === o ? (v + d + TEAMS.length) % TEAMS.length : v; };
          if (this.sel === 0) S.home = nx(S.home, S.away);
          if (this.sel === 1) S.away = nx(S.away, S.home);
          if (this.sel === 2) { const i = PERIOD_OPTS.indexOf(S.periodLen); S.periodLen = PERIOD_OPTS[clamp((i < 0 ? 2 : i) + d, 0, PERIOD_OPTS.length - 1)]; }
          if (this.sel === 3) { S.diff = clamp(S.diff + d, 0, DIFF.length - 1); this.kidsAssist(); }
          if (this.sel === 4) S.autoChange = !S.autoChange;
          if (this.sel === 5) S.penalties = S.penalties === false;
          if (this.sel === 6) S.three = !S.three;
          Sfx.stick(0.4); Settings.save();
        }
        if (M.pressed('y')) { this.rosterTeam = this.sel === 1 ? S.away : S.home; this.rosterFrom = this.sel; this.go('roster'); break; }
        if (M.pressed('a') || M.pressed('start')) {
          if (this.sel === 7 || M.pressed('start')) { this.initSlots(); this.go('ctrl'); }
          else if (this.sel === 4) { S.autoChange = !S.autoChange; Settings.save(); }
          else if (this.sel === 5) { S.penalties = S.penalties === false; Settings.save(); }
          else if (this.sel === 6) { S.three = !S.three; Settings.save(); }
          else this.sel = Math.min(7, this.sel + 1);
        }
        if (M.pressed('b')) this.go('title');
        break;
      }
      case 'career': Career.update(dt); break;
      case 'practice': {
        this.menuMove(0, PRACTICE.length + 1, dt);
        if (M.pressed('a') || M.pressed('start')) { if (this.sel < PRACTICE.length) this.startPractice(PRACTICE[this.sel][0]); else this.go('title', 2); }
        if (M.pressed('b')) this.go('title', 2);
        break;
      }
      case 'ach': if (M.pressed('a') || M.pressed('b')) this.go('title', 3); break;
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
          if (dv.pressed('y')) { const i = Input.activeDevices().indexOf(dv), v = (this.assistFor(dv, i) + 1) % ASSIST_NAMES.length; this.assistDev[dv.id] = v; if (i < 2) Settings.data['assist' + (i + 1)] = v; Settings.save(); Sfx.stick(0.6); }
        }
        if (M.pressed('a') || M.pressed('start')) this.startGame();
        else if (M.pressed('b')) this.go('setup', 4);
        break;
      }
      case 'settings': {
        // karty nahoře (LB / RB), položky karty pod nimi
        const cats = this.settingsCats();
        if (this.setCat == null) this.setCat = 0;
        if (this.capture) {
          // čekáme na nové tlačítko / klávesu pro akci this.capture (jen z vybraného zařízení)
          const B = this.bindDev, pad = B.kind === 'pad' ? this.padSlot(B.i) : null, c = Input.capture(pad);
          this.capT = (this.capT || 0) + dt;
          if (this.capT > 10 || (B.kind === 'pad' && !pad)) { this.capture = null; break; }
          if (c) {
            const S = Settings.data, act = this.capture;
            if (c.key === 'Escape') { this.capture = null; break; }
            if (c.foreign) { this.capMsg = 'Ovladač posílá klávesu ' + c.key + ' – ve Steamu (tlačítko Steam → Ovladač) zvol šablonu Gamepad.'; break; }
            if (c.key) { S.kbMaps = S.kbMaps || [{}, {}]; S.kbMaps[B.i] = S.kbMaps[B.i] || {}; S.kbMaps[B.i][act] = [c.key]; Input.applyKb(); }
            else { S.padMaps = S.padMaps || {}; S.padMaps[c.dev.gp.id] = Object.assign(S.padMaps[c.dev.gp.id] || {}, { [act]: c.spec }); }
            Settings.save(); this.capture = null; this.capMsg = ''; this.capWait = 0.3; Sfx.stick(0.8);
          }
          break;
        }
        if (this.capWait > 0) { this.capWait -= dt; break; }
        if (this.bindDev) {
          // podmenu přemapování jednoho zařízení: akce, výchozí, zpět
          const B = this.bindDev, acts = this.bindActs(), n = acts.length + 2;
          this.menuMove(0, n, dt);
          if (M.pressed('a')) {
            if (this.sel < acts.length) { this.capture = acts[this.sel][0]; this.capT = 0; this.capMsg = ''; Input.capStart(); }
            else if (this.sel === acts.length) { const S = Settings.data, pad = this.padSlot(B.i); if (B.kind === 'pad') { if (pad && S.padMaps) delete S.padMaps[pad.gp.id]; } else { S.kbMaps = S.kbMaps || [{}, {}]; S.kbMaps[B.i] = {}; Input.applyKb(); } Settings.save(); Sfx.stick(0.8); }
            else { this.bindDev = null; this.sel = 0; }
          }
          if (M.pressed('b')) { this.bindDev = null; this.sel = 0; }
          break;
        }
        if (this.padTest) { if (Input.keys.has('Escape') || M.pressed('b') || M.pressed('start')) this.padTest = false; break; }
        const tab = (M.pressed('rb') ? 1 : 0) - (M.pressed('lb') ? 1 : 0);
        if (tab) { this.setCat = (this.setCat + tab + cats.length) % cats.length; this.sel = 0; Sfx.stick(0.6); Settings.save(); break; }
        const cat = cats[this.setCat], n = cat.items.length + 1;
        this.menuMove(0, n, dt);
        const d = this.lr(dt), a = M.pressed('a');
        if (this.sel === cat.items.length) { if (a) { Settings.save(); this.go('title', 4); break; } }
        else if (d || a) { const it = cat.items[this.sel]; if (it.set) { it.set(d, a); Settings.save(); } }
        if (M.pressed('b')) { Settings.save(); this.go('title', 4); }
        break;
      }
      case 'teamedit': break; // ovládá se formulářem (myš / dotyk / klávesnice)
      case 'help':
        if (M.pressed('a') || M.pressed('b') || M.pressed('start')) {
          if (this.helpFrom === 'pause') { this.screen = 'game'; } else { this.go('settings', 4); this.setCat = this.settingsCats().findIndex((c) => c.name === 'OVLÁDÁNÍ'); }
        }
        break;
      case 'game': {
        const g = this.game;
        if (this.statView) {
          if (M.pressed('lb') || M.pressed('rb') || this.lr(dt)) { this.statTeam = 1 - (this.statTeam || 0); Sfx.stick(0.5); }
          if (M.pressed('b') || M.pressed('a') || M.pressed('start') || M.pressed('y')) this.statView = false;
          break;
        }
        if (g.paused && this.tacView) {
          // taktika formací pro lidské týmy (platí hned)
          const rows = this.tacRows(g);
          this.menuMove(0, rows.length + 1, dt);
          const d = this.lr(dt);
          if (this.sel < rows.length && (d || M.pressed('a'))) {
            const r = rows[this.sel]; r.t.tactics[r.L] = (r.t.tactics[r.L] + (d || 1) + 3) % 3;
            Settings.data.tactics = r.t.tactics.slice(); Settings.save(); Sfx.stick(0.6);
          }
          if (M.pressed('b') || (this.sel === rows.length && M.pressed('a'))) { this.tacView = false; this.sel = 1; }
          break;
        }
        if (g.paused) {
          const pit = this.pauseItems(g);
          this.menuMove(0, pit.length, dt);
          if (M.pressed('start') || M.pressed('b')) g.paused = false;
          else if (M.pressed('a')) {
            const k = pit[this.sel][0];
            if (k === 'go') g.paused = false;
            else if (k === 'tac') { this.tacView = true; this.sel = 0; }
            else if (k === 'help') { this.helpFrom = 'pause'; this.screen = 'help'; }
            else if (k === 'stats') { this.statView = true; this.statTeam = g.teams[1].humans.length && !g.teams[0].humans.length ? 1 : 0; }
            else if (k.t) { k.t.wantPull = !k.t.wantPull; g.paused = false; }
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
        else if (M.pressed('start') && !['final', 'periodEnd'].includes(g.state)) { g.paused = true; this.sel = 0; this.tacView = false; Sfx.whistle(); break; }
        else if (g.state === 'final' && M.pressed('y')) { this.statView = true; this.statTeam = 0; }
        else if (M.pressed('a') || M.pressed('start')) g.confirm();
        if (M.pressed('back')) G3.zoomStep(Settings.data.zoom >= ZOOMS.length - 1 ? -(ZOOMS.length - 1) : 1);
        for (let i = 0; i < this.speed; i++) g.update(dt * (g.state === 'zamboni' ? 1 : Settings.data.gameSpeed || 1));
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
  // asistence: pro každý ovladač zvlášť (výchozí z Nastavení: 1. a 2. hráč)
  assistFor(d, i) { if (!this.assistDev) this.assistDev = {}; const v = this.assistDev[d.id]; return v != null ? v : i < 2 ? Settings.data['assist' + (i + 1)] || 0 : 0; },
  kidsAssist() { const S = Settings.data; if (DIFF[S.diff] && DIFF[S.diff].kids) { S.assist1 = Math.max(S.assist1 || 0, 2); S.assist2 = Math.max(S.assist2 || 0, 2); this.assistDev = {}; } },
  startGame() {
    const S = Settings.data, humans = [];
    Input.activeDevices().forEach((d, i) => {
      const s = this.slots[d.id], assist = this.assistFor(d, i);
      if (s === -1 && humans.length < 4) humans.push({ dev: d, team: 0, assist });
      if (s === 1 && humans.length < 4) humans.push({ dev: d, team: 1, assist });
    });
    Sfx.init(); Sfx.resume();
    this.game = new Game({ home: S.home, away: S.away, humans, ...this.ruleCfg(), three: !!S.three });
    this.screen = 'game'; this.sel = 0;
  },
  // trénink: všechny ovladače hrají za domácí (tým z Exhibice), soupeř podle druhu cvičení
  startPractice(kind) {
    const S = Settings.data; let devs = Input.activeDevices(); if (!devs.length) devs = [Input.merged];
    const humans = devs.slice(0, 4).map((d, i) => ({ dev: d, team: 0, assist: this.assistFor(d, i) }));
    Sfx.init(); Sfx.resume();
    this.game = new Game({ home: S.home, away: S.away, humans, ...this.ruleCfg(), practice: kind, penalties: false, injuries: false, offside: false, icing: false, zamboni: 'off', shootout: true });
    this.screen = 'game'; this.sel = 0;
  },
  // pravidla a volby zápasu z Nastavení (exhibice i kariéra)
  ruleCfg() {
    const S = Settings.data;
    return { periodLen: S.periodLen * 60, diff: clamp(S.diff, 0, DIFF.length - 1), autoChange: S.autoChange !== false, penalties: S.penalties !== false,
      injuries: S.injuries !== false, zamboni: S.zamboni || 'auto', offside: S.offside !== false, icing: S.icing !== false, icingMode: S.icingMode || 'touch',
      ot: S.ot || '3v3', shootout: S.shootout !== false, cpuAggr: S.cpuAggr == null ? 1 : S.cpuAggr, tactics: [S.tactics, S.tactics] };
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
      if (this.statView && this.screen === 'game') { this.drawMatchStats(this.game); return; }
      if (this.game.paused && this.screen === 'game') this.drawPause();
      if (this.screen === 'help') { this.dim(0.75); this.drawHelp(); }
      return;
    }
    // pozadí menu; pod úvodní obrazovkou se jednou vykreslí i 3D scéna, aby zápas pak začal bez zaseknutí
    if (this.screen === 'press') { const d = this.demo; R.updateCam(d.puck.x, dt, d.camSnap, 0, d.puck.y); d.camSnap = false; R.drawWorld(d, d.all, d.puck, d.time, dt, { puckSpeed: 0 }); }
    R.menuBg(this.t);
    if (this.screen === 'press') {
      this.drawLogo(R.W / 2, 300, 150, true);
      if (Math.floor(this.t * 1.6) % 2 === 0) R.chromeText('STISKNI  A  /  START', R.W / 2, 560, 34, '#fff', ACC);
      ctx.font = font(14, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
      ctx.fillText('1–2 hráči  •  gamepad nebo klávesnice', R.W / 2, 620);
    }
    if (this.screen === 'title') {
      // úvodní menu: logo a nabídka vlevo, znak vybraného týmu vpravo
      this.drawLogo(96, 150, 104, false);
      this.drawList(['EXHIBICE', 'KARIÉRA', 'TRÉNINK', 'VÝZVY  ' + Ach.done() + '/' + ACH.length, 'NASTAVENÍ', 'OVLÁDÁNÍ', 'UKONČIT'], 300, this.sel, 96);
      const T = TEAMS[Settings.data.home] || TEAMS[0], ex = 920, ey = 400;
      ctx.save(); ctx.globalAlpha = 0.9; const q = ctx.createRadialGradient(ex, ey, 60, ex, ey, 330); q.addColorStop(0, 'rgba(47,212,255,0.20)'); q.addColorStop(1, 'rgba(47,212,255,0)'); ctx.fillStyle = q; ctx.fillRect(ex - 330, ey - 330, 660, 660); ctx.restore();
      this.teamLogo(T, ex, ey + Math.sin(this.t * 1.2) * 5, 1.7);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(13, '600'); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('T V Ů J   T Ý M', ex, ey + 190);
      R.chromeText(T.city.toUpperCase() + ' ' + T.name.toUpperCase(), ex, ey + 222, 28);
      ctx.textAlign = 'right'; ctx.font = font(12, '600'); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText('verze ' + (Upd.local ? Upd.local.version : ''), R.W - 28, R.H - 24);
    }
    if ((this.screen === 'title' || this.screen === 'press') && (Upd.newer() || Upd.flash > 0 || Upd.busy && Upd.server && Upd.newer())) {
      const ctx = R.ctx, txt = Upd.flash > 0 || Upd.busy ? Upd.msg : 'K dispozici je nová verze ' + Upd.remote.version + ' – Nastavení → Aktualizace';
      ctx.font = font(15, 'bold'); ctx.textAlign = 'center'; ctx.fillStyle = '#7dff8a'; ctx.fillText(txt, R.W / 2, 772);
      if (Upd.flash > 0) Upd.flash -= 1 / 60;
    }
    if (this.screen === 'title' && this.quitMsg) {
      ctx.font = font(15, 'bold'); ctx.fillStyle = ACC; ctx.textAlign = 'center';
      ctx.fillText('Ukonči přes tlačítko Steam → Ukončit hru (nebo Alt+F4)', R.W / 2, 772);
    }
    if (this.screen === 'setup') this.drawSetup();
    if (this.screen === 'roster') this.drawRoster();
    if (this.screen === 'career') Career.draw();
    if (this.screen === 'ctrl') this.drawCtrl();
    if (this.screen === 'settings') this.drawSettings();
    if (this.screen === 'help') this.drawHelp();
    if (this.screen === 'practice') this.drawPractice();
    if (this.screen === 'ach') this.drawAch();
  },
  drawPractice() {
    const ctx = R.ctx, S = Settings.data;
    R.chromeText('TRÉNINK', R.W / 2, 90, 54);
    ctx.font = font(15, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.textAlign = 'center';
    ctx.fillText('Trénuješ s týmem ' + TEAMS[S.home].city + ' ' + TEAMS[S.home].name + ' (tým vybereš v Exhibici). Všechny ovladače hrají spolu.', R.W / 2, 150);
    PRACTICE.forEach(([, name, desc], i) => {
      const y = 220 + i * 92, on = this.sel === i;
      R.panel(R.W / 2 - 380, y - 34, 760, 76, on ? 0.95 : 0.6);
      if (on) { R.sel(R.W / 2 - 379, y - 33, 758, 74); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = font(22); ctx.fillStyle = on ? ACC : '#fff'; ctx.fillText(name, R.W / 2 - 355, y - 10);
      ctx.font = font(14, 'bold'); ctx.fillStyle = '#cfd8ea'; ctx.fillText(desc, R.W / 2 - 355, y + 18);
    });
    const yb = 220 + PRACTICE.length * 92, on = this.sel === PRACTICE.length;
    R.chromeText('ZPĚT', R.W / 2, yb, on ? 34 : 28, on ? '#fff8d0' : '#fff', on ? ACC : '#8fa4c8');
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'center';
    ctx.fillText('↑↓ výběr   A začít   B zpět   •   Trénink skončíš v pauze (START) → UKONČIT', R.W / 2, 770);
  },
  drawAch() {
    const ctx = R.ctx;
    R.chromeText('VÝZVY', R.W / 2, 50, 46);
    ctx.font = font(15, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.textAlign = 'center';
    ctx.fillText('Splněno ' + Ach.done() + ' z ' + ACH.length + ' (platí exhibice, kariéra i trénink, pokud hraješ ty)', R.W / 2, 92);
    ACH.forEach(([id, name, desc], i) => {
      const col = i % 2, row = Math.floor(i / 2), x = R.W / 2 - 600 + col * 610, y = 120 + row * 52, got = !!Ach.got[id];
      R.panel(x, y, 590, 46, got ? 0.92 : 0.5);
      if (got) { ctx.fillStyle = ACC; ctx.fillRect(x, y, 5, 46); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = font(17); ctx.fillStyle = got ? ACC : '#8a93a6'; ctx.fillText((got ? '★ ' : '☆ ') + name, x + 16, y + 15);
      ctx.font = font(12, 'bold'); ctx.fillStyle = got ? '#fff' : '#8a93a6'; ctx.fillText(desc, x + 16, y + 34);
    });
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'center'; ctx.fillText('A / B zpět', R.W / 2, 786);
  },
  dim(a) { if (this.screen !== 'game') return; R.ctx.fillStyle = `rgba(6,9,18,${Math.min(0.9, a + 0.08)})`; R.ctx.fillRect(0, 0, R.W, R.H); },   // v menu už je tmavé pozadí
  // logo: x = levý okraj (nebo střed, když center), y = střed nápisu
  drawLogo(x, y, size, center) {
    const ctx = R.ctx;
    ctx.font = font(size); const w1 = ctx.measureText('HOKEJ ').width, w2 = ctx.measureText("'98").width, x0 = center ? x - (w1 + w2) / 2 : x;
    R.chromeText('HOKEJ', x0, y, size, '#ffffff', '#9fb4d8', 'left');
    R.chromeText("'98", x0 + w1, y, size, '#fff', ACC, 'left');
    ctx.fillStyle = ACC; ctx.fillRect(x0 + 4, y + size * 0.56, 90, 5);
    ctx.fillStyle = '#ff3c5a'; ctx.fillRect(x0 + 100, y + size * 0.56, 30, 5);
    ctx.font = font(15, '600'); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('L E D O V Á   L I G A', x0 + 150, y + size * 0.56 + 3);
  },
  // nabídka: na střed, nebo zarovnaná vlevo od x
  drawList(items, y0, sel = this.sel, x) {
    const ctx = R.ctx;
    items.forEach((it, i) => {
      const y = y0 + i * 56, on = i === sel;
      if (on) R.sel(x != null ? x - 6 : R.W / 2 - 230, y - 24, 460, 48);
      R.chromeText(it, x != null ? x + 22 + (on ? 8 : 0) : R.W / 2, y, 30, on ? '#ffffff' : 'rgba(255,255,255,0.6)', '#9fb4d8', x != null ? 'left' : 'center');
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
    if (on) { R.sel(x - w / 2 + 1.5, y + 1.5, w - 3, h - 3); }
    ctx.font = font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#8fa6c8'; ctx.fillText(label, x, y + 22);
    this.teamLogo(T, x, y + 110, 0.8);
    if (on) {
      ctx.fillStyle = ACC; ctx.font = font(36);
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
      ctx.fillStyle = v >= 80 ? '#4cff7a' : v >= 74 ? ACC : '#ff9a3a'; ctx.fillRect(x - 60, yy - 5, 200 * clamp((v - 50) / 45, 0, 1), 10);
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
      ['STŘÍDÁNÍ FORMACÍ', S.autoChange !== false ? 'AUTOMATICKY' : 'RUČNĚ (LB)'], ['FAULY A VYLOUČENÍ', S.penalties !== false ? 'ZAP' : 'VYP'], ['FORMÁT', S.three ? '3 NA 3 (ARKÁDA)' : '5 NA 5']];
    rows.forEach(([n, v], i) => {
      const y = 452 + i * 42, on = this.sel === i + 2;
      R.panel(R.W / 2 - 300, y - 19, 600, 38, on ? 0.95 : 0.6);
      if (on) { R.sel(R.W / 2 - 299, y - 18, 598, 36); }
      ctx.font = font(18); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfd8ea'; ctx.fillText(n, R.W / 2 - 280, y);
      ctx.textAlign = 'right'; ctx.fillStyle = on ? ACC : '#fff'; ctx.fillText((on ? '◄  ' : '') + v + (on ? '  ►' : ''), R.W / 2 + 280, y);
    });
    const on = this.sel === 7;
    R.chromeText('POKRAČOVAT  ►', R.W / 2, 686, on ? 38 : 30, on ? '#fff8d0' : '#fff', on ? ACC : '#8fa4c8');
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
    head.forEach((h, i) => { ctx.font = font(13, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.textAlign = i >= 3 ? 'center' : 'left'; ctx.fillText(h, x0 + cols[i] + (i >= 3 ? 30 : 0), 88); });
    const col = (v) => (v >= 85 ? '#4cff7a' : v >= 75 ? '#ffffff' : v >= 65 ? ACC : '#ff9a3a');
    let y = 112;
    const row = (p, vals) => {
      ctx.font = font(14, 'bold'); ctx.textAlign = 'left'; ctx.fillStyle = '#cfd8ea'; ctx.fillText(p.role === 'G' ? 'G' : p.role, x0 + cols[0], y);
      ctx.fillStyle = ACC; ctx.fillText(String(p.num), x0 + cols[1], y);
      drawFlag(ctx, natOf(p), x0 + cols[2], y - 7, 20, 13); ctx.fillStyle = '#fff'; ctx.fillText(p.first + ' ' + p.name, x0 + cols[2] + 26, y); if (p.kg) { const w = ctx.measureText(p.first + ' ' + p.name).width; ctx.save(); ctx.font = font(12, 'bold'); ctx.fillStyle = '#8a93a6'; ctx.fillText(p.cm + ' cm · ' + p.kg + ' kg', x0 + cols[2] + 26 + w + 12, y); const tr = traitOf(p); if (tr) { ctx.fillStyle = ACC; ctx.fillText('★ ' + TRAITS[tr], x0 + cols[2] + 26 + w + 110, y); } ctx.restore(); }
      vals.forEach((v, i) => {
        if (v == null) return;
        ctx.textAlign = 'center'; ctx.fillStyle = col(v); ctx.font = font(15, 'bold'); ctx.fillText(String(v), x0 + cols[3 + i] + 30, y);
      });
      y += 25;
    };
    Rr.lines.forEach((line, L) => {
      ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillStyle = ACC; ctx.fillText((L + 1) + '. FORMACE', x0, y); y += 24;
      for (const p of line) { const a = p.at; row(p, [a.SIL, a.RYC, a.PRE, a.STA, Math.round((a.SIL + a.RYC + a.PRE + a.STA * 0.6) / 3.6)]); }
      y += 6;
    });
    ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillStyle = ACC; ctx.fillText('BRANKÁŘI  (REFLEXY / POHYB / STAMINA)', x0, y); y += 24;
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
      if (T) { this.teamLogo(T, cols[i], 160, 0.6); R.chromeText(T.city.toUpperCase(), cols[i], 240, 24); ctx.font = font(14, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.textAlign = 'center'; ctx.fillText(i === 0 ? 'DOMÁCÍ' : 'HOSTÉ', cols[i], 266); }
      else { ctx.font = font(18); ctx.fillStyle = '#8fa4c8'; ctx.textAlign = 'center'; ctx.fillText('POČÍTAČ', cols[1], 160); ctx.font = font(13, 'bold'); ctx.fillText('(nehraje)', cols[1], 186); }
    });
    const devs = Input.activeDevices();
    if (!devs.length) {
      ctx.font = font(18, 'bold'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('Stiskni tlačítko na ovladači, aby se objevil.', R.W / 2, 380);
    }
    devs.forEach((d, i) => {
      const s = this.slots[d.id] || 0, x = cols[s + 1], y = 300 + i * 86;
      const col = d.kind === 'pad' ? '#2ee6ff' : ACC;
      R.panel(x - 130, y, 260, 76, 0.9);
      ctx.strokeStyle = s ? col : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(x - 129, y + 1, 258, 74);
      const as = this.assistFor(d, i);
      ctx.font = font(12, 'bold'); ctx.fillStyle = as ? '#7dff8a' : '#8a93a6'; ctx.textAlign = 'center'; ctx.fillText('Y: ASISTENCE ' + ASSIST_NAMES[as], x, y + 64);
      ctx.font = font(18); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.name.toUpperCase(), x, y + 22);
      ctx.font = font(11, 'bold'); ctx.fillStyle = '#aab';
      ctx.fillText(s === 0 ? '◄  posuň k týmu  ►' : s < 0 ? 'hraje za domácí  ►' : '◄  hraje za hosty', x, y + 44);
    });
    const hum = devs.filter((d) => this.slots[d.id]).length;
    R.chromeText(hum ? 'A  =  ZAČÍT ZÁPAS' : 'A  =  SLEDOVAT (CPU vs CPU)', R.W / 2, 690, 30, '#fff8d0', ACC);
    ctx.font = font(14, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'center';
    ctx.fillText('Každý hráč posune svůj ovladač páčkou doleva/doprava, Y mění jeho asistenci.  Dva na jedné straně = spolupráce.   B zpět', R.W / 2, 750);
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
    const close = () => { el.remove(); this.go('settings', 0); this.setCat = this.settingsCats().findIndex((c) => c.name === 'TÝMY'); };
    el.addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'save') {
        el.querySelectorAll('input').forEach((x) => { const v = x.value.trim(); if (v) TEAMS[+x.dataset.i][x.dataset.k] = x.dataset.k === 'abbr' ? v.toUpperCase().slice(0, 3) : v; });
        TeamNames.save(); if (typeof G3 !== 'undefined' && G3.refreshTeams) G3.refreshTeams(); close();
      } else if (a === 'reset') {
        try { localStorage.removeItem(TeamNames.KEY); } catch (err) {}
        TeamNames.load(); if (typeof G3 !== 'undefined' && G3.refreshTeams) G3.refreshTeams(); close();
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
        { label: 'OTŘESY OBRAZU PŘI SRÁŽKÁCH', val: () => onoff(S.camShake !== false), set: () => { S.camShake = S.camShake === false; } },
      ] },
      { name: 'ZVUK', desc: 'Hlasitost, komentář a vibrace ovladače', items: [
        { label: 'VIBRACE OVLADAČE', val: () => onoff(S.rumble !== false), set: () => { S.rumble = S.rumble === false; if (S.rumble) for (const d of Input.activeDevices()) Input.rumble(d, 0.6, 200); },
          hint: 'Ovladač zavibruje při bodyčeku, srážce a tyčce (pokud to prohlížeč a ovladač umí).' },
        { label: 'HLASITOST', val: () => '▮'.repeat(S.vol) + '▯'.repeat(10 - S.vol), set: (d) => { if (d) { S.vol = clamp(S.vol + d, 0, 10); Sfx.setVol(S.vol); Sfx.stick(0.8); } } },
        { label: 'KOMENTÁŘ (HLAS)', val: () => onoff(S.comm), set: () => { S.comm = !S.comm; if (S.comm) Voice.say('Komentář zapnut.', true); },
          hint: 'Krátké hlášky ke gólům, zákrokům a vyloučením.' },
        { label: 'JAZYK KOMENTÁŘE', val: () => '◄ ' + (S.commLang === 'cs' ? 'ČESKY' : 'ANGLICKY') + ' ►', set: () => { S.commLang = S.commLang === 'cs' ? 'en' : 'cs'; Voice.load(); setTimeout(() => Voice.say('Komentář zapnut.', true), 400); },
          hint: 'Anglický hlas je výrazně živější; český je monotónnější.' },
      ] },
      { name: 'HRA', desc: 'Obtížnost, střídání, fauly, zranění, rolba', items: [
        { label: 'OBTÍŽNOST', val: () => '◄ ' + DIFF[clamp(S.diff, 0, DIFF.length - 1)].name.toUpperCase() + ' ►', set: (d) => { S.diff = (S.diff + (d || 1) + DIFF.length) % DIFF.length; this.kidsAssist(); },
          hint: 'DĚTSKÁ: soupeř je pomalý a mírný, vlastní brankář chytá víc; asistence se nastaví na PLNÁ.' },
        { label: 'RYCHLOST HRY', val: () => '◄ ' + Math.round((S.gameSpeed || 1) * 100) + ' % ►', set: (d) => { S.gameSpeed = cyc(SPEEDS, S.gameSpeed || 1, d); }, hint: 'Nižší rychlost = víc času na rozhodnutí (vhodné pro začátečníky a děti).' },
        { label: 'ASISTENCE 1. HRÁČE', val: () => '◄ ' + ASSIST_NAMES[S.assist1 || 0] + ' ►', set: (d) => { S.assist1 = ((S.assist1 || 0) + (d || 1) + 3) % 3; this.assistDev = {}; }, hint: ASSIST_HINT },
        { label: 'ASISTENCE 2. HRÁČE', val: () => '◄ ' + ASSIST_NAMES[S.assist2 || 0] + ' ►', set: (d) => { S.assist2 = ((S.assist2 || 0) + (d || 1) + 3) % 3; this.assistDev = {}; }, hint: ASSIST_HINT },
        { label: 'STŘÍDÁNÍ FORMACÍ', val: () => (S.autoChange !== false ? 'AUTOMATICKY' : 'RUČNĚ (LB)'), set: () => { S.autoChange = S.autoChange === false; } },
        { label: 'AGRESIVITA SOUPEŘE', val: () => '◄ ' + ['NÍZKÁ', 'NORMÁLNÍ', 'VYSOKÁ'][S.cpuAggr == null ? 1 : S.cpuAggr] + ' ►', set: (d) => { S.cpuAggr = ((S.cpuAggr == null ? 1 : S.cpuAggr) + (d || 1) + 3) % 3; },
          hint: 'Jak často počítač napadá, šťouchá holí a hraje bodyčeky (a tím i fauluje).' },
        { label: 'FAULY A VYLOUČENÍ', val: () => onoff(S.penalties !== false), set: () => { S.penalties = S.penalties === false; } },
        { label: 'OFSAJD', val: () => onoff(S.offside !== false), set: () => { S.offside = S.offside === false; },
          hint: 'Puk musí do útočného pásma před hráči; počítač pravidlo dodržuje.' },
        { label: 'ZAKÁZANÉ UVOLNĚNÍ (ICING)', val: () => '◄ ' + (S.icing === false ? 'VYP' : S.icingMode === 'instant' ? 'OKAMŽITÝ' : 'ODLOŽENÝ') + ' ►',
          set: (d) => { const o = ['off', 'touch', 'instant'], c = S.icing === false ? 'off' : S.icingMode || 'touch', n = cyc(o, c, d); S.icing = n !== 'off'; if (n !== 'off') S.icingMode = n; },
          hint: 'ODLOŽENÝ: píská se, až se puku dotkne bránící hráč. OKAMŽITÝ: hned po přejetí brankové čáry. V oslabení je vyhození povolené.' },
        { label: 'PRODLOUŽENÍ', val: () => '◄ ' + { '3v3': '3 NA 3', '5v5': '5 NA 5', off: 'BEZ PRODLOUŽENÍ' }[S.ot || '3v3'] + ' ►', set: (d) => { S.ot = cyc(['3v3', '5v5', 'off'], S.ot || '3v3', d); },
          hint: 'Při remíze po 3. třetině: prodloužení na první gól (třetina délky třetiny, 1–5 min).' },
        { label: 'NÁJEZDY', val: () => onoff(S.shootout !== false), set: () => { S.shootout = S.shootout === false; },
          hint: 'Když nerozhodne ani prodloužení: 3 série nájezdů, pak náhlá smrt. Bráníš-li, řídíš brankáře (páčka, X = vypíchnout).' },
        { label: 'ZRANĚNÍ', val: () => onoff(S.injuries !== false), set: () => { S.injuries = S.injuries === false; } },
        { label: 'ROLBA O PŘESTÁVCE', val: () => '◄ ' + { auto: 'AUTOMATICKY', manual: 'ŘÍDÍM SÁM', off: 'VYPNUTÁ' }[S.zamboni || 'auto'] + ' ►', set: (d) => { S.zamboni = cyc(['auto', 'manual', 'off'], S.zamboni || 'auto', d); },
          hint: 'ŘÍDÍM SÁM: o přestávce řídíš rolbu páčkou a uklízíš stopy bruslí (B = hotovo).' },
      ] },
      { name: 'OVLÁDÁNÍ', desc: 'Vyber zařízení (A) a nastav si vlastní tlačítka', items: [
        ...[0, 1].map((i) => ({ label: 'ZMĚNIT TLAČÍTKA: HRÁČ ' + (i + 1) + ' – OVLADAČ', val: () => { const d = this.padSlot(i); return d ? d.gp.id.replace(/\s*\(.*$/, '').slice(0, 22).toUpperCase() + ' ►' : 'NEPŘIPOJEN'; },
          set: (d, a) => { if (a && this.padSlot(i)) { this.bindDev = { kind: 'pad', i }; this.sel = 0; } },
          hint: 'Hráč ' + (i + 1) + ' = ' + (i + 1) + '. připojený ovladač (vestavěný bývá první). NEPŘIPOJEN: stiskni na něm tlačítko; když nic, Steam ho nejspíš posílá jako klávesnici – zvol šablonu Gamepad.' })),
        ...[0, 1].map((i) => ({ label: 'ZMĚNIT TLAČÍTKA: HRÁČ ' + (i + 1) + ' – KLÁVESNICE', val: () => (i ? 'ŠIPKY + NUMERICKÁ' : 'WASD + JKLI') + ' ►', set: (d, a) => { if (a) { this.bindDev = { kind: 'kb', i }; this.sel = 0; } } })),
        { label: 'PŘEHLED OVLÁDÁNÍ (CO KTERÉ TLAČÍTKO DĚLÁ)', val: () => '►', set: (d, a) => { if (a) { this.helpFrom = 'settings'; this.go('help'); } } },
        { label: 'TEST OVLADAČŮ', val: () => '►', set: (d, a) => { if (a) this.padTest = true; }, hint: 'Ukáže, které ovladače hra vidí a co hlásí – pomůže, když ovladač nefunguje.' },
        { label: 'OBNOVIT VÝCHOZÍ TLAČÍTKA', val: () => '►', set: (d, a) => { if (a) { S.padMaps = {}; S.kbMaps = [{}, {}]; Input.applyKb(); } } },
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
  // i-tý připojený ovladač (podle pořadí připojení)
  padSlot(i) { return Object.values(Input.pads).filter((d) => d.connected && d.gp).sort((a, b) => a.gp.index - b.gp.index)[i] || null; },
  bindActs() { return BIND_ACTIONS.concat([['up', 'NAHORU'], ['down', 'DOLŮ'], ['left', 'DOLEVA'], ['right', 'DOPRAVA']]); },
  // přiřazení akce na zařízení vybraném v podmenu
  bindLabel(k) {
    const B = this.bindDev;
    if (B.kind === 'pad') { const d = this.padSlot(B.i); return d ? padSpecName(Input.padMap(d.gp)[k], d.std) : '–'; }
    const m = Input.kb[B.i] && Input.kb[B.i].map[k];
    return m ? m.map((q) => q.replace(/^Key|^Digit/, '').replace('Space', 'MEZERNÍK').replace('Escape', 'ESC').replace(/Shift(Left|Right)/, 'SHIFT').replace('Arrow', 'ŠIPKA ').replace('Numpad', 'NUM ')).join(', ').toUpperCase() : '–';
  },
  drawBind() {
    const ctx = R.ctx, B = this.bindDev, acts = this.bindActs(), pad = B.kind === 'pad' ? this.padSlot(B.i) : null, dev = pad || Input.kb[B.i];
    R.chromeText('HRÁČ ' + (B.i + 1) + ' – ' + (B.kind === 'pad' ? 'OVLADAČ' : 'KLÁVESNICE'), R.W / 2, 40, 36);
    ctx.font = font(13, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pad ? pad.gp.id.slice(0, 90) + (pad.std ? '' : '   (nestandardní rozložení)') : B.kind === 'pad' ? 'Ovladač není připojený.' : 'Klávesnice ' + (B.i + 1), R.W / 2, 74);
    const row = (y, label, val, on) => {
      R.panel(R.W / 2 - 330, y - 15, 660, 30, on ? 0.95 : 0.6);
      if (on) { R.sel(R.W / 2 - 329, y - 14, 658, 28); }
      ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillStyle = on ? '#fff' : '#cfd8ea'; ctx.fillText(label, R.W / 2 - 310, y);
      ctx.textAlign = 'right'; ctx.fillStyle = on ? ACC : '#fff'; ctx.fillText(val, R.W / 2 + 310, y);
    };
    acts.forEach(([k, label], i) => row(110 + i * 34, label, this.bindLabel(k), this.sel === i));
    const yb = 110 + acts.length * 34;
    row(yb, 'VÝCHOZÍ TLAČÍTKA PRO TOTO ZAŘÍZENÍ', '►', this.sel === acts.length);
    row(yb + 34, 'ZPĚT', '', this.sel === acts.length + 1);
    // živý náhled: co hra právě čte
    const on = dev ? BTN.filter((b) => dev.st[b]).map((b) => b.toUpperCase()).join(' ') : '';
    ctx.font = font(14, 'bold'); ctx.textAlign = 'center'; ctx.fillStyle = '#7dff8a';
    ctx.fillText('Právě stisknuto: ' + (on || '–') + (pad ? '   •   tlačítka ' + pad.raw.b.map((q, i) => (q ? i : null)).filter((q) => q != null).join(',') : ''), R.W / 2, yb + 76);
    if (this.capture) {
      R.panel(R.W / 2 - 360, 300, 720, 130, 0.97);
      ctx.font = font(20); ctx.fillStyle = ACC;
      ctx.fillText(B.kind === 'pad' ? 'STISKNI TLAČÍTKO NA TOMTO OVLADAČI' : 'STISKNI KLÁVESU', R.W / 2, 340);
      ctx.font = font(14, 'bold'); ctx.fillStyle = '#fff'; ctx.fillText('pro: ' + (acts.find((q) => q[0] === this.capture) || [0, ''])[1] + '     (ESC nebo 10 s = zrušit)', R.W / 2, 372);
      if (this.capMsg) { ctx.fillStyle = '#ff9a7a'; ctx.fillText(this.capMsg, R.W / 2, 404); }
    }
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillText('↑↓ výběr   A změnit   B zpět', R.W / 2, 784);
  },
  drawPadTest() {
    const ctx = R.ctx; R.chromeText('TEST OVLADAČŮ', R.W / 2, 60, 40);
    let gps = []; try { gps = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean); } catch (e) {}
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (!gps.length) { ctx.font = font(18, 'bold'); ctx.fillStyle = '#ff9a7a'; ctx.fillText('Prohlížeč nehlásí žádný ovladač. Stiskni na něm tlačítko; pokud se nic neobjeví, prohlížeč ho nevidí.', 80, 140); }
    gps.forEach((gp, i) => {
      const y = 120 + i * 150, d = Input.pads[gp.index];
      R.panel(60, y - 20, R.W - 120, 136, 0.9);
      ctx.font = font(16, 'bold'); ctx.fillStyle = ACC; ctx.fillText('#' + gp.index + '  ' + gp.id.slice(0, 80), 80, y);
      ctx.font = font(14, 'bold'); ctx.fillStyle = gp.mapping === 'standard' ? '#7dff8a' : '#ffb04a';
      ctx.fillText('rozložení: ' + (gp.mapping || 'NESTANDARDNÍ (výchozí přiřazení podle Linuxu, případně přemapuj)') + '   •   tlačítek ' + gp.buttons.length + ', os ' + gp.axes.length, 80, y + 26);
      ctx.fillStyle = '#fff';
      const pressed = gp.buttons.map((b, k) => (b.pressed || b.value > 0.5 ? k : null)).filter((k) => k != null);
      ctx.fillText('stisknutá tlačítka: ' + (pressed.join(', ') || '–'), 80, y + 50);
      ctx.fillText('osy: ' + Array.from(gp.axes).map((a) => a.toFixed(2)).join('  '), 80, y + 74);
      const logical = d ? BTN.filter((b) => d.st[b]).map((b) => b.toUpperCase()).join(' ') : '';
      ctx.fillStyle = '#8fa6c8'; ctx.fillText('hra to čte jako: ' + (logical || '–') + (d ? `   páčka ${d.st.lx.toFixed(2)} ${d.st.ly.toFixed(2)}` : ''), 80, y + 98);
    });
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'center';
    ctx.fillText('Ovladač ve hře hraje, až ho na obrazovce Výběr ovladačů posuneš páčkou k týmu.   ESC / B zpět', R.W / 2, 780);
  },
  drawSettings() {
    if (this.padTest) return this.drawPadTest();
    if (this.bindDev) return this.drawBind();
    const ctx = R.ctx, cats = this.settingsCats(), ci = this.setCat || 0, cat = cats[ci];
    R.chromeText('NASTAVENÍ', R.W / 2, 46, 40);
    // karty
    const tw = 168, gap = 8, total = cats.length * tw + (cats.length - 1) * gap, x0 = R.W / 2 - total / 2, ty = 84;
    ctx.font = font(13, 'bold'); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = '#8fa6c8'; ctx.fillText('LB ◄', x0 - 34, ty + 22); ctx.fillText('► RB', x0 + total + 34, ty + 22);
    cats.forEach((c, i) => {
      const x = x0 + i * (tw + gap), on = i === ci;
      R.panel(x, ty + (on ? 0 : 4), tw, on ? 46 : 40, on ? 0.98 : 0.55);
      if (on) { ctx.fillStyle = ACC; ctx.fillRect(x, ty + 42, tw, 4); }
      ctx.font = font(on ? 18 : 16); ctx.fillStyle = on ? '#fff' : '#9aa6bd'; ctx.fillText(c.name, x + tw / 2, ty + 22);
      if (c.name === 'AKTUALIZACE' && Upd.newer()) { ctx.fillStyle = '#7dff8a'; ctx.beginPath(); ctx.arc(x + tw - 12, ty + 12, 5, 0, TAU); ctx.fill(); }
    });
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(cat.desc.toUpperCase(), R.W / 2, ty + 66);
    const row = (y, label, val, on) => {
      R.panel(R.W / 2 - 330, y - 18, 660, 36, on ? 0.95 : 0.6);
      if (on) { R.sel(R.W / 2 - 329, y - 17, 658, 34); }
      ctx.font = font(17); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = on ? '#fff' : '#cfd8ea'; ctx.fillText(label, R.W / 2 - 305, y);
      ctx.textAlign = 'right'; ctx.fillStyle = on ? ACC : '#fff'; ctx.fillText(val, R.W / 2 + 305, y);
    };
    const foot = (t, y) => { ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'center'; ctx.fillText(t, R.W / 2, y); };
    const y0 = 196, st = cat.items.length > 11 ? 41 : 48;   // dlouhá karta: hustší řádky
    cat.items.forEach((it, i) => row(y0 + i * st, it.label, it.val(), this.sel === i));
    const yb = y0 + cat.items.length * st;
    row(yb, 'ZPĚT DO MENU', '', this.sel === cat.items.length);
    const it = cat.items[this.sel];
    if (it && it.hint) foot(it.hint, yb + (st < 48 ? 34 : 52));
    if (cat.name === 'AKTUALIZACE') {
      if (Upd.msg) { ctx.font = font(16, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.textAlign = 'center'; ctx.fillText(Upd.msg, R.W / 2, yb + 86); }
      const notes = (Upd.newer() ? Upd.remote : Upd.local || {}).notes || [];
      if (notes.length) {
        ctx.font = font(14, 'bold'); ctx.fillStyle = ACC; ctx.fillText(Upd.newer() ? 'CO PŘINÁŠÍ NOVÁ VERZE:' : 'CO JE NOVÉHO:', R.W / 2, yb + 120);
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
      ['A / LT + A', 'přihrávka (ve směru páčky) / o mantinel'], ['A s páčkou dozadu', 'nechat puk spoluhráči za sebou'],
      ['X / LT + X', 'střela (ťuk = zápěstí, drž = příklep) / švihovka nahoru'],
      ['X nebo A během přihrávky k tobě', 'golfák z první / přihrávka z první'], ['B', 'klička'], ['Y', 'lobovaná přihrávka / nahození'],
      ['páčka do strany / od branky', 'mířit k tyči / placka k ledu'],
      ['PRAVÁ PÁČKA', 'vést puk do strany, před sebe nebo k tělu (krytí puku)'],
      ['BEZ PUKU', ''],
      ['A', 'přepnout na hráče nejblíž puku'], ['X / LT + X', 'bodyček (vestoje bokem) / lehnout do střely'], ['B / LT + B', 'šťouchnutí holí / zvednout hokejku'],
      ['BULY', 'A/X přesně při dopadu, páčkou k soupeři = vyhrát dopředu'],
      ['LB', 'střídání formace (při ručním střídání)'], ['VIEW (BACK)', 'zoom kamery'], ['MENU / START', 'pauza'],
    ];
    L.forEach(([a, b], i) => {
      const y = 112 + i * 28;
      if (!a && !b) return;
      if (!b) { ctx.font = font(18); ctx.fillStyle = ACC; ctx.textAlign = 'center'; ctx.fillText(a, R.W / 2, y); return; }
      ctx.font = font(16); ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = '#8fa6c8'; ctx.fillText(a, R.W / 2 - 20, y);
      ctx.font = font(16, 'bold'); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(b, R.W / 2 + 20, y);
    });
    ctx.font = font(12, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
    ctx.fillText('Fauly: šťouchnutí zezadu, hůl do nohou, bodyček zezadu, na mantinel nebo do hráče bez puku → vyloučení (hra 5 na 4).', R.W / 2, 668);
    ctx.fillText('Klávesnice 1: WASD, J=A, K=X, L=B, I=Y, U=LT, Mezerník=sprint, Esc=pauza   •   Klávesnice 2: šipky, Num1=A, Num2=X, Num3=B, Num5=Y, Num7=LT, Num0=sprint, Enter=pauza', R.W / 2, 690);
    ctx.font = font(14, 'bold'); ctx.fillStyle = ACC; ctx.fillText('A / B — zpět', R.W / 2, 740);
  },
  drawPause() {
    this.dim(this.tacView ? 0.75 : 0.6);
    if (this.tacView) return this.drawTactics(this.game);
    const it = this.pauseItems(this.game);
    R.chromeText('PAUZA', R.W / 2, 340 - it.length * 28, 64);
    this.drawList(it.map((q) => q[1]), 460 - it.length * 28);
  },
  // statistiky zápasu: mapa střel obou týmů + hráči vybraného týmu
  drawMatchStats(g) {
    const ctx = R.ctx; this.dim(0.82);
    R.chromeText('STATISTIKY ZÁPASU', R.W / 2, 40, 36);
    // mapa: domácí útočí doprava, hosté doleva
    const mx = 40, my = 92, mw = 600, mh = mw * 85 / 200, X = (u) => mx + (u + 100) / 200 * mw, Y = (v) => my + (42.5 - v) / 85 * mh;
    ctx.fillStyle = '#e9eef6'; ctx.strokeStyle = '#3a4d7a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 28 / 200 * mw); ctx.fill(); ctx.stroke();
    const vline = (u, col, w) => { ctx.fillStyle = col; ctx.fillRect(X(u) - w / 2, my + 2, w, mh - 4); };
    vline(0, '#c8102e', 3); vline(-25, '#1d4fb8', 4); vline(25, '#1d4fb8', 4); vline(-89, '#c8102e', 1.5); vline(89, '#c8102e', 1.5);
    ctx.fillStyle = '#555'; ctx.fillRect(X(89), Y(3), 6, Y(-3) - Y(3)); ctx.fillRect(X(-89) - 6, Y(3), 6, Y(-3) - Y(3));
    const [A, B] = g.teams;
    for (const L of g.shotLog || []) {
      const home = L.team === A, u = home ? L.u : -L.u, v = home ? L.v : -L.v, x = X(u), y = Y(v), col = L.team.jersey === '#f2f2f2' ? '#9aa4b8' : L.team.jersey;
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.fillStyle = col;
      if (L.res === 'goal') { ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = ACC; ctx.lineWidth = 3; ctx.stroke(); }
      else if (L.res === 'save') { ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); }
      else if (L.res === 'block') { ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.stroke(); }
    }
    ctx.font = font(13, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#cfd8ea';
    ctx.fillText('◄ ' + B.def.abbr + ' útočí        ' + A.def.abbr + ' útočí ►', mx + mw / 2, my + mh + 18);
    ctx.fillText('● gól (žlutý okraj)   ● na branku   ○ mimo   ✕ zblokováno', mx + mw / 2, my + mh + 40);
    // týmy
    const fo = (T) => { const w = T.roster.reduce((a, p) => a + p.stats.fw, 0), l = T.roster.reduce((a, p) => a + p.stats.fl, 0); return w + l ? Math.round(w / (w + l) * 100) + ' %' : '–'; };
    const sc = (T) => g.shotLog.filter((L) => L.team === T), rows = [['STŘELY NA BRANKU', A.shots, B.shots], ['POKUSY CELKEM', sc(A).length, sc(B).length],
      ['ZBLOKOVANÉ', sc(B).filter((L) => L.res === 'block').length, sc(A).filter((L) => L.res === 'block').length], ['HITY', A.hits, B.hits], ['BULY', fo(A), fo(B)],
      ['PŘESILOVKY', A.ppg + '/' + A.ppOpp, B.ppg + '/' + B.ppOpp], ['TRESTNÉ MINUTY', A.pim * 2, B.pim * 2]];
    R.panel(mx, my + mh + 60, mw, 34 + rows.length * 30, 0.9);
    const ty = my + mh + 80;
    ctx.font = font(16); ctx.fillStyle = ACC; ctx.textAlign = 'right'; ctx.fillText(A.def.abbr, mx + 160, ty); ctx.textAlign = 'left'; ctx.fillText(B.def.abbr, mx + mw - 160, ty);
    rows.forEach(([n, a, b], i) => { const y = ty + 28 + i * 30; ctx.font = font(15, 'bold'); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(String(a), mx + 160, y); ctx.textAlign = 'left'; ctx.fillText(String(b), mx + mw - 160, y); ctx.textAlign = 'center'; ctx.fillStyle = '#8fa6c8'; ctx.font = font(13, 'bold'); ctx.fillText(n, mx + mw / 2, y); });
    // hráči
    const T = g.teams[this.statTeam || 0], tx = 670, tw = 570;
    R.panel(tx, 92, tw, 680, 0.9);
    ctx.font = font(18); ctx.fillStyle = ACC; ctx.textAlign = 'center'; ctx.fillText('◄  ' + T.def.city.toUpperCase() + ' ' + T.def.name.toUpperCase() + '  ►', tx + tw / 2, 114);
    const cols = [[22, '#', 'left'], [58, 'HRÁČ', 'left'], [262, 'G', 'center'], [298, 'A', 'center'], [334, 'B', 'center'], [378, '+/−', 'center'], [422, 'S', 'center'], [478, 'ČAS', 'center'], [536, 'BULY', 'center']];
    cols.forEach(([x, h, al]) => { ctx.font = font(12, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.textAlign = al; ctx.fillText(h, tx + x, 144); });
    const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    let y = 170;
    T.lines.forEach((line, Li) => {
      for (const p of line) {
        const st = p.stats, f = st.fw + st.fl;
        const v = ['#' + p.num, p.name + (p.cap ? ' (C)' : '') + (p.trait ? ' ★' : ''), st.g, st.a, st.g + st.a, (st.pm > 0 ? '+' : '') + st.pm, st.s, mmss(st.toi), f ? Math.round(st.fw / f * 100) + '%' : '–'];
        cols.forEach(([x, , al], k) => { ctx.font = font(14, 'bold'); ctx.textAlign = al; ctx.fillStyle = k === 1 && p.trait ? ACC : k === 5 ? (st.pm > 0 ? '#7dff8a' : st.pm < 0 ? '#ff8a6a' : '#fff') : '#fff'; ctx.fillText(String(v[k]), tx + x, y); });
        y += 25;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(tx + 14, y - 13, tw - 28, 1); y += 6;
    });
    for (const gk of T.goalies) {
      if (!gk.stats.sa && gk !== T.goalie) continue;
      ctx.font = font(14, 'bold'); ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
      ctx.fillText('#' + gk.num + '  ' + gk.name + (gk.trait ? ' ★' : '') + '   brankář: ' + gk.stats.sv + ' / ' + gk.stats.sa + ' zákroků' + (gk.stats.sa ? ' (' + (gk.stats.sv / gk.stats.sa * 100).toFixed(1) + ' %)' : ''), tx + 22, y); y += 25;
    }
    const tr = T.roster.filter((p) => p.trait);
    ctx.font = font(12, 'bold'); ctx.fillStyle = '#cfd8ea'; ctx.textAlign = 'left';
    if (tr.length) ctx.fillText('★ X-faktor: ' + tr.slice(0, 4).map((p) => p.name + ' – ' + TRAITS[p.trait].toLowerCase()).join(', '), tx + 22, Math.min(y + 4, 760));
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'center';
    ctx.fillText('◄► / LB RB druhý tým   B zpět   •   +/− se nepočítá u gólů v přesilovce', R.W / 2, 786);
  },
  pauseItems(g) {
    const it = [['go', 'POKRAČOVAT'], ['tac', 'TAKTIKA FORMACÍ']];
    const hum = g.teams.filter((t) => t.humans.length);
    if (!g.shootout && !g.practice) for (const t of hum) it.push([{ t }, (t.wantPull ? 'VRÁTIT BRANKÁŘE' : 'ODVOLAT BRANKÁŘE') + (hum.length > 1 ? ' ' + t.def.abbr : '')]);
    it.push(['stats', 'STATISTIKY ZÁPASU'], ['help', 'OVLÁDÁNÍ'], ['quit', 'UKONČIT ZÁPAS']);
    return it;
  },
  tacRows(g) {
    const rows = [];
    for (const t of g.teams) if (t.humans.length) for (const L of [0, 1, 2]) rows.push({ t, L });
    return rows;
  },
  drawTactics(g) {
    const ctx = R.ctx, rows = this.tacRows(g), N = ['OBRANNÁ', 'VYVÁŽENÁ', 'ÚTOČNÁ'];
    R.chromeText('TAKTIKA FORMACÍ', R.W / 2, 120, 44);
    if (!rows.length) { ctx.font = font(18, 'bold'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('Taktiku nastavuje tým, za který hraješ.', R.W / 2, 240); }
    rows.forEach((r, i) => {
      const y = 200 + i * 48 + (rows.length > 3 && i >= 3 ? 20 : 0), on = this.sel === i, cur = r.t.line === r.L;
      R.panel(R.W / 2 - 330, y - 20, 660, 40, on ? 0.95 : 0.6);
      if (on) { R.sel(R.W / 2 - 329, y - 19, 658, 38); }
      ctx.font = font(18); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = on ? '#fff' : '#cfd8ea';
      ctx.fillText((g.teams[0].humans.length && g.teams[1].humans.length ? r.t.def.abbr + '  ' : '') + (r.L + 1) + '. FORMACE' + (cur ? '  (na ledě)' : ''), R.W / 2 - 305, y);
      ctx.textAlign = 'right'; ctx.fillStyle = on ? ACC : '#fff'; ctx.fillText('◄ ' + N[r.t.tactics[r.L]] + ' ►', R.W / 2 + 305, y);
    });
    const yb = 200 + rows.length * 48 + (rows.length > 3 ? 20 : 0);
    R.panel(R.W / 2 - 330, yb - 20, 660, 40, this.sel === rows.length ? 0.95 : 0.6);
    ctx.font = font(18); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText('ZPĚT', R.W / 2 - 305, yb);
    ctx.font = font(13, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'center';
    ctx.fillText('OBRANNÁ: méně gólů na obou stranách, šetří síly.   ÚTOČNÁ: napadání ve dvou, obránci u modré – víc gólů, ale víc protiútoků.', R.W / 2, yb + 60);
    ctx.fillText('↑↓ formace   ◄► taktika   B zpět', R.W / 2, yb + 86);
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
  Input.applyKb();
  App.init();
  Upd.init();
  Voice.load();
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
    try { App.draw(dt); if (Touch.visible) Touch.draw(); Ach.draw(dt); } catch (e) { console.error(e); }
    R.end();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__app = App;
})();
