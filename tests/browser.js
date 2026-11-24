#!/usr/bin/env node
'use strict';
// ---------- Test v prohlížeči: node tests/browser.js ----------
// Potřebuje Playwright s Chromiem (není součástí repa; když chybí, test se přeskočí).
// Spustí server.py, načte hru, projde obrazovky menu a odehraje zápas s náhodným ovládáním.
const { spawn } = require('child_process');
const { ROOT } = require('./lib');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright není nainstalovaný – test v prohlížeči přeskočen.'); process.exit(0); }

(async () => {
  const port = 47100 + Math.floor(Math.random() * 400);
  const srv = spawn('python3', ['server.py', String(port)], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; let fail = 0;
  const step = (name, good, info = '') => { console.log((good ? '  OK    ' : '  CHYBA ') + name + (info ? '  ' + info : '')); if (!good) fail++; };
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    await p.addInitScript(() => {
      localStorage.setItem('hokej98', JSON.stringify({ gfx: 'low' }));
      const pad = { index: 0, id: 'Testovací ovladač', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      window.__pad = pad; navigator.getGamepads = () => [pad];
    });
    await p.goto('http://127.0.0.1:' + port + '/index.html?mute=1');
    await p.waitForFunction(() => window.__app && G3.base, null, { timeout: 120000 });
    step('hra se načetla', true);
    // obrazovky menu se vykreslí bez chyby
    for (const scr of ['title', 'setup', 'roster', 'ctrl', 'settings', 'help', 'practice', 'ach']) {
      await p.evaluate((s) => { __app.rosterTeam = 0; __app.helpFrom = 'title'; __app.go(s); }, scr); await p.waitForTimeout(350);
    }
    const tabs = await p.evaluate(() => __app.settingsCats().length);
    for (let i = 0; i < tabs; i++) { await p.evaluate((k) => { __app.go('settings'); __app.setCat = k; }, i); await p.waitForTimeout(250); }
    await p.evaluate(() => { __app.go('career'); Career.newCareer(4); });
    for (const v of ['hub', 'table', 'cup', 'roster', 'contracts', 'market', 'stats', 'news']) { await p.evaluate((q) => { Career.role = 0; Career.go(q); }, v); await p.waitForTimeout(250); }
    step('menu a kariéra se vykreslí', errs.length === 0, errs[0] || '');
    // zápas s náhodným ovládáním (zrychleně, mimo vykreslování)
    const res = await p.evaluate(() => {
      Input.poll(1 / 60); const d = Input.pads[0];
      __app.game = new Game({ home: 3, away: 8, humans: [{ dev: d, team: 0, assist: 0 }], ...__app.ruleCfg(), periodLen: 60 }); __app.screen = 'game';
      const g = __app.game;
      for (let i = 0; i < 60 * 400 && g.state !== 'final'; i++) {
        if (i % 30 === 0) { for (const a of [0, 1, 2, 3]) __pad.axes[a] = Math.random() * 2 - 1; for (const k of [0, 1, 2, 3, 6]) { const on = Math.random() < 0.2; __pad.buttons[k].pressed = on; __pad.buttons[k].value = on ? 1 : 0; } }
        Input.poll(1 / 60); g.update(1 / 60); if (g.state === 'periodEnd') g.nextPeriod(); if (g.state === 'replay') g.endReplay();
      }
      return g.state + ' ' + g.teams.map((t) => t.score).join(':');
    });
    await p.waitForTimeout(800);
    step('zápas s náhodným ovládáním doběhl', res.startsWith('final') && errs.length === 0, res + (errs[0] ? '  ' + errs[0] : ''));
    // fotbal: zápas s náhodným ovládáním
    const fb = await p.evaluate(() => {
      const d = Input.pads[0];
      __app.sport = 'football'; __app.game = new Football({ home: 3, away: 8, humans: [{ dev: d, team: 0, assist: 0 }], ...__app.ruleCfg(), periodLen: 60 }); __app.screen = 'game';
      const g = __app.game;
      for (let i = 0; i < 60 * 400 && g.state !== 'final'; i++) {
        if (i % 30 === 0) { for (const a of [0, 1, 2, 3]) __pad.axes[a] = Math.random() * 2 - 1; for (const k of [0, 1, 2, 3, 6]) { const on = Math.random() < 0.2; __pad.buttons[k].pressed = on; __pad.buttons[k].value = on ? 1 : 0; } }
        Input.poll(1 / 60); g.update(1 / 60); if (g.state === 'periodEnd') g.nextPeriod(); if (g.state === 'replay') g.endReplay();
      }
      return g.state + ' ' + g.teams.map((t) => t.score).join(':');
    });
    await p.waitForTimeout(1200);
    step('fotbalový zápas doběhl a vykreslil se', fb.startsWith('final') && errs.length === 0, fb + (errs[0] ? '  ' + errs[0] : ''));
    await p.evaluate(() => { __app.helpFrom = 'pause'; __app.screen = 'help'; }); await p.waitForTimeout(400); await p.evaluate(() => { __app.screen = 'game'; });
    await p.evaluate(() => { __app.statView = true; __app.statTeam = 0; }); await p.waitForTimeout(500);
    step('statistiky zápasu se vykreslí', errs.length === 0, errs[0] || '');
  } catch (e) { step('test v prohlížeči', false, e.message.split('\n')[0]); }
  await b.close(); srv.kill();
  console.log(fail ? fail + ' kroků selhalo' : 'Test v prohlížeči prošel');
  process.exit(fail ? 1 : 0);
})();
