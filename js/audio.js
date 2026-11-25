'use strict';
// ---------- Syntetizovaný zvuk (WebAudio) + komentář ----------
const Sfx = {
  ctx: null, master: null, noise: null, crowdG: null, crowdF: null, excite: 0, target: 0, roar: 0,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.setVol(Settings.data.vol);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.startCrowd();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
  setVol(v) { if (this.master) this.master.gain.value = (v / 10) * 0.9; },
  ok() { return this.ctx && this.ctx.state === 'running'; },
  src() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; return s; },
  startCrowd() {
    const c = this.ctx;
    const s1 = this.src(), f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 0.5;
    const s2 = this.src(), f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 350;
    this.crowdG = c.createGain(); this.crowdG.gain.value = 0.0;
    const g2 = c.createGain(); g2.gain.value = 0.6;
    s1.connect(f1); f1.connect(this.crowdG);
    s2.connect(f2); f2.connect(g2); g2.connect(this.crowdG);
    this.crowdG.connect(this.master);
    this.crowdF = f1;
    s1.start(); s2.start(0, 1.0);
    // skutečné nahrávky (CC0 z Freesound, viz README): brusle, brzdění, mantinel, tyčka, hůl, píšťalka, klakson.
    // Když se soubor nenačte, zůstane syntetický zvuk.
    this.fx = {};
    for (const n of ['skate', 'stop', 'board', 'post', 'whistle', 'horn', 'stick', 'organ', 'buzzer', 'ooh', 'boo', 'glass']) {
      fetch('sounds/fx/' + n + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => c.decodeAudioData(b)).then((buf) => {
        this.fx[n] = buf;
        if (n === 'skate') { this.skG = c.createGain(); this.skG.gain.value = 0; this.skG.connect(this.master); const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(this.skG); s.start(); }
      }).catch(() => {});
    }
    // skutečné nahrávky publika (CC0, viz README): hluk davu a potlesk ve smyčce pod syntetickým šumem
    this.ambG = c.createGain(); this.appG = c.createGain(); this.ambG.gain.value = 0; this.appG.gain.value = 0;
    this.ambG.connect(this.master); this.appG.connect(this.master);
    for (const [f, g] of [['ambience', this.ambG], ['applause', this.appG]]) {
      fetch('sounds/crowd/' + f + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => c.decodeAudioData(b)).then((buf) => {
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g); src.start(); this.realCrowd = true;
      }).catch(() => {});
    }
  },
  // přehrání nahrávky; vrací false, když není načtená (volající pak použije syntézu)
  play(n, vol = 1, rate = 1) {
    const b = this.fx && this.fx[n]; if (!b || !this.ok()) return false;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate * rand(0.94, 1.06); g.gain.value = vol; s.connect(g); g.connect(this.master); s.start();
    return true;
  },
  tick(dt, base, skate = 0) {
    this.roar = Math.max(0, this.roar - dt * 0.18);
    this.excite = lerp(this.excite, this.target, Math.min(1, dt * 2));
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastTick || 0) < 0.08) return;
    this.lastTick = now;
    const v = base * (0.05 + this.excite * 0.07 + this.roar * 0.45);
    this.crowdG.gain.setTargetAtTime(v * (this.realCrowd ? 0.45 : 1), this.ctx.currentTime, 0.1);
    if (this.skG) this.skG.gain.setTargetAtTime(base * clamp(skate, 0, 1) * 0.5, now, 0.25);   // brusle: hlasitost podle toho, jak rychle se na ledě jezdí
    if (this.ambG) { this.ambG.gain.setTargetAtTime(base * (0.22 + this.excite * 0.5), now, 0.3); this.appG.gain.setTargetAtTime(base * Math.min(1, this.roar * 1.6), now, this.roar > 0.3 ? 0.08 : 0.5); }
    this.crowdF.frequency.setTargetAtTime(800 + this.excite * 500 + this.roar * 900, this.ctx.currentTime, 0.2);
  },
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  },
  burst(freq, type, vol, dec, q) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime, s = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    s.connect(f); f.connect(g); g.connect(this.master);
    this.env(g, t, 0.003, Math.max(0.0002, vol), dec);
    s.start(t, Math.random()); s.stop(t + dec + 0.05);
  },
  tone(freq, type, vol, a, dec, when = 0, slide = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + a + dec);
    o.connect(g); g.connect(this.master);
    this.env(g, t, a, vol, dec);
    o.start(t); o.stop(t + a + dec + 0.05);
  },
  stick(v = 0.5) { if (this.play('stick', 0.55 * v, 1.25)) return; this.burst(2500, 'highpass', 0.35 * v, 0.04); this.tone(900, 'triangle', 0.08 * v, 0.002, 0.03); },
  slap(v = 1) { this.play('stick', 0.9 * v, 0.8); this.burst(1800, 'highpass', 0.7 * v, 0.06); this.burst(200, 'lowpass', 0.6 * v, 0.12); },
  board(v = 0.6) { if (this.play('board', 0.8 * v, 1.15)) return; this.burst(160, 'lowpass', 0.9 * v, 0.22); this.burst(600, 'bandpass', 0.25 * v, 0.15, 2); },
  post() { this.play('post', 0.55, 1.5); this.tone(1760, 'sine', 0.35, 0.002, 0.7); this.tone(2637, 'sine', 0.18, 0.002, 0.5); this.tone(3520, 'sine', 0.08, 0.002, 0.3); },
  hit(v = 1) { this.play('board', 0.9 * v, 0.85); this.burst(120, 'lowpass', 1.0 * v, 0.3); this.burst(400, 'bandpass', 0.5 * v, 0.2, 1); this.ooh(v); },
  glass(v = 0.5) { this.play('glass', v, 1.3); },   // puk o plexisklo
  ooh(v = 1) { this.play('ooh', 0.3 * v); this.target = Math.max(this.target, 0.5); this.roar = Math.max(this.roar, 0.25 * v); },
  cheer(v = 1) { this.roar = Math.max(this.roar, v); },
  whistle() {
    if (!this.ok()) return;
    if (this.play('whistle', 0.5)) return;
    const c = this.ctx, t = c.currentTime;
    for (const [f, vv] of [[2900, 0.12], [3150, 0.06]]) {
      const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.frequency.value = f; lfo.frequency.value = 38; lg.gain.value = 160;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(this.master);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vv, t + 0.02);
      g.gain.setValueAtTime(vv, t + 0.42); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
    }
  },
  horn(dur = 2.6) {
    if (!this.ok()) return;
    this.play('horn', 0.3, 0.8);
    const c = this.ctx, t = c.currentTime, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 1300; f.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
    g.gain.setValueAtTime(0.22, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const fr of [146.8, 185, 220, 293.7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = rand(-8, 8);
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  buzzer() {
    if (!this.ok()) return;
    if (this.play('buzzer', 0.4)) return;
    this.tone(220, 'square', 0.12, 0.01, 1.4); this.tone(223, 'square', 0.1, 0.01, 1.4);
  },
  organNote(freq, when, dur, vol = 0.07) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + when, g = c.createGain();
    g.connect(this.master);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [m, a] of [[1, 1], [2, 0.5], [4, 0.25], [3, 0.15]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = freq * m; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  organ(n) {
    if (n === 3 && this.play('organ', 0.38, 1)) return;   // jedna ze znělek je nahrávka skutečných varhan
    const N = (s) => 440 * Math.pow(2, (s - 69) / 12);
    const tunes = [
      // „Charge!" fanfára
      [[67, 0, 0.16], [72, 0.17, 0.16], [76, 0.34, 0.16], [79, 0.51, 0.3], [76, 0.85, 0.16], [79, 1.02, 0.6]],
      // stoupající chromatika
      [[60, 0, 0.12], [61, 0.13, 0.12], [62, 0.26, 0.12], [63, 0.39, 0.12], [64, 0.52, 0.12], [65, 0.65, 0.12], [66, 0.78, 0.12], [67, 0.91, 0.4], [72, 1.35, 0.5]],
      // „Let's go" rytmus
      [[72, 0, 0.14], [72, 0.2, 0.14], [72, 0.55, 0.12], [72, 0.7, 0.12], [72, 0.85, 0.2], [67, 1.3, 0.14], [72, 1.5, 0.4]],
      // houpavý motiv
      [[64, 0, 0.2], [67, 0.22, 0.2], [72, 0.44, 0.2], [71, 0.66, 0.2], [69, 0.88, 0.2], [67, 1.1, 0.5]],
    ];
    const tune = tunes[n % tunes.length];
    for (const [s, w, d] of tune) this.organNote(N(s), w, d);
  },
  // puk sjíždí po mantinelu: krátké šoupnutí s drnčením desek
  scrape(v = 0.4) { this.play('stop', v); },
  rim(v = 0.3) { this.burst(1100, 'bandpass', 0.22 * v, 0.1, 1.5); this.burst(240, 'lowpass', 0.3 * v, 0.07); },
  // dav: bučení (nízké „úúú" se zvolna nabíhající hlasitostí)
  boo(v = 1) {
    if (!this.ok()) return;
    if (this.play('boo', 0.45 * v, 1)) return;
    const c = this.ctx, t = c.currentTime;
    for (const [f, q] of [[260, 3], [520, 4]]) {
      const s = this.src(), fl = c.createBiquadFilter(), g = c.createGain();
      fl.type = 'bandpass'; fl.frequency.setValueAtTime(f, t); fl.frequency.linearRampToValueAtTime(f * 0.85, t + 1.8); fl.Q.value = q;
      s.connect(fl); fl.connect(g); g.connect(this.master);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      s.start(t, Math.random()); s.stop(t + 2.1);
    }
  },
  // dav skanduje: „DO-TO-HO!" (tři údery hlasů + tleskání), dvakrát
  chant() {
    if (!this.ok()) return;
    const c = this.ctx;
    for (const rep of [0, 1.5]) for (const [w, f] of [[0, 520], [0.28, 470], [0.56, 620]]) {
      const t = c.currentTime + rep + w, s = this.src(), fl = c.createBiquadFilter(), g = c.createGain();
      fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = 2.5;
      s.connect(fl); fl.connect(g); g.connect(this.master);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      s.start(t, Math.random()); s.stop(t + 0.3);
      const t2 = t + 0.02, s2 = this.src(), f2 = c.createBiquadFilter(), g2 = c.createGain();
      f2.type = 'bandpass'; f2.frequency.value = 1500; f2.Q.value = 0.7; s2.connect(f2); f2.connect(g2); g2.connect(this.master);
      this.env(g2, t2, 0.003, 0.18, 0.08); s2.start(t2, Math.random()); s2.stop(t2 + 0.12);
    }
  },
  claps() { if (!this.ok()) return; for (const w of [0, 0.3, 0.8, 1.05, 1.3]) setTimeout(() => this.burst(1500, 'bandpass', 0.25, 0.08, 0.7), w * 1000); },
};

// komentátor: předem namluvené hlášky (sounds/voice, hlas Piper „jirka“, CC0); text se skládá z částí
// (např. ['Vyloučení!', 'Novák', 'hákování']); když nahrávka chybí, zkusí se systémová hlasová syntéza
const Voice = {
  last: 0, manifest: null, bufs: new Map(), srcs: [], busyUntil: 0, gain: null,
  // složka s hláškami podle jazyka komentáře (výchozí angličtina – živější hlas)
  dir() { return Settings.data.commLang === 'cs' ? 'sounds/voice/' : 'sounds/voice-en/'; },
  load() {
    const d = this.dir();
    if (this.manifest && this.lang === d) return;
    this.lang = d; this.manifest = {}; this.bufs = new Map();
    fetch(d + 'manifest.json').then((r) => r.json()).then((m) => { this.manifest = m; }).catch(() => {});
  },
  buf(t) {
    if (this.bufs.has(t)) return this.bufs.get(t);
    const p = fetch(this.lang + this.manifest[t]).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => Sfx.ctx.decodeAudioData(ab, res, rej))).catch(() => null);
    this.bufs.set(t, p);
    return p;
  },
  // spolukomentátor (druhý hlas, jen k anglickému komentáři): počká, až hlavní hlas domluví, a přidá postřeh
  color(text, delay = 1.2, tries = 8) {
    if (!Settings.data.comm || Settings.data.commLang === 'cs' || !Sfx.ctx) return;
    if (!this.man2) { this.man2 = {}; this.buf2 = new Map(); fetch('sounds/voice-en2/manifest.json').then((r) => r.json()).then((m) => { this.man2 = m; }).catch(() => {}); }
    clearTimeout(this.colT);
    this.colT = setTimeout(() => {
      const ctx = Sfx.ctx, f = this.man2[text]; if (!f || !this.gain) return;
      if (ctx.currentTime < this.busyUntil + 0.25) { if (tries > 0) this.color(text, 0.4, tries - 1); return; }
      if (!this.buf2.has(text)) this.buf2.set(text, fetch('sounds/voice-en2/' + f).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej))).catch(() => null));
      this.buf2.get(text).then((b) => { if (!b || ctx.currentTime < this.busyUntil) return; const s = ctx.createBufferSource(); s.buffer = b; s.connect(this.gain); s.start(); this.srcs.push(s); s.onended = () => { this.srcs = this.srcs.filter((q) => q !== s); }; this.busyUntil = ctx.currentTime + b.duration; this.last = performance.now(); });
    }, delay * 1000);
  },
  stop() { clearTimeout(this.colT); for (const s of this.srcs) { try { s.stop(); } catch (e) {} } this.srcs = []; this.busyUntil = 0; try { speechSynthesis.cancel(); } catch (e) {} },
  say(parts, prio = false, chance = 1) {
    if (!Settings.data.comm) return;
    this.load();
    if (!Array.isArray(parts)) parts = [parts];
    const now = performance.now();
    if (Math.random() > chance) return;
    const ctx = Sfx.ctx;
    const busy = ctx ? ctx.currentTime < this.busyUntil : false;
    if (!prio && (now - this.last < 3500 || busy)) return;
    const known = parts.filter((t) => t && this.manifest[t]);
    if (!ctx || !known.length) return this.speak(parts.filter(Boolean).join(' '), prio);
    if (prio) this.stop();
    this.last = now;
    if (!this.gain) { this.gain = ctx.createGain(); this.gain.gain.value = 1.15; this.gain.connect(Sfx.master || ctx.destination); }
    const at = ctx.currentTime;
    this.busyUntil = at + 2;
    Promise.all(known.map((t) => this.buf(t))).then((bs) => {
      let tt = Math.max(ctx.currentTime + 0.02, at);
      for (const b of bs) {
        if (!b) continue;
        const s = ctx.createBufferSource(); s.buffer = b; s.connect(this.gain); s.start(tt);
        this.srcs.push(s); s.onended = () => { this.srcs = this.srcs.filter((q) => q !== s); };
        tt += b.duration + 0.06;
      }
      this.busyUntil = tt;
    });
  },
  // záloha: systémová syntéza (na SteamOS obvykle chybí)
  speak(text, prio) {
    if (!window.speechSynthesis || !text) return;
    try {
      if (prio) speechSynthesis.cancel(); else if (speechSynthesis.speaking) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'cs-CZ'; const v = speechSynthesis.getVoices().find((q) => /^cs/i.test(q.lang)); if (v) u.voice = v;
      u.rate = 1.12; u.volume = Settings.data.vol / 10;
      speechSynthesis.speak(u); this.last = performance.now();
    } catch (e) {}
  },
};
