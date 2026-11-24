'use strict';
// ---------- Režim kariéry: liga, pohár, play-off, přestupy, vývoj hráčů ----------
const CAREER_KEY = 'hokej98-career2';
const CUP_AFTER = { 9: 0, 19: 1, 29: 2 }; // po kterém kole ligy (0..29) se hraje kolo poháru
const ROUND_NAMES = ['ČTVRTFINÁLE', 'SEMIFINÁLE', 'FINÁLE'];
const POS_ORDER = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const LINE_W = [1, 0.75, 0.5];
const TRANSFER_LAST_ROUND = 22; // přestupy jen do 23. kola ligy
const r1 = (v) => Math.round(v * 10) / 10;
const money = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + ' mil. Kč';

function plOvr(p) {
  const a = p.at;
  return p.role === 'G' ? Math.round(a.REF * 0.8 + (a.RYC + a.STA) * 0.1) : Math.round((a.SIL + a.RYC + a.PRE + a.STA * 0.6) / 3.6);
}
function plValue(p) {
  const o = plOvr(p), af = p.age < 23 ? 1.35 : p.age < 29 ? 1 : p.age < 32 ? 0.7 : 0.4;
  return Math.max(0.2, r1(Math.pow(Math.max(0, o - 50), 2) * 0.006 * af));
}
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function wpick(arr, wf) { const w = arr.map(wf), s = w.reduce((a, b) => a + b, 0); let r = Math.random() * s; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; }
const blankSt = () => ({ gp: 0, g: 0, a: 0, pim: 0, sv: 0, sa: 0 });
const SAL_CAP = 55; // platový strop (mil. Kč za sezónu)
const salOf = (p) => r1(0.4 + plValue(p) * 0.5);
const potName = (v) => (v >= 86 ? 'A' : v >= 80 ? 'B' : v >= 74 ? 'C' : 'D');

const Career = {
  c: null, view: 'start', sel: 0, scroll: 0, pick: 0, msg: '', msgT: 0,

  // ---------- ukládání ----------
  exists() { try { return !!localStorage.getItem(CAREER_KEY); } catch (e) { return false; } },
  load() { try { this.c = JSON.parse(localStorage.getItem(CAREER_KEY)); } catch (e) { this.c = null; } if (this.c) this.migrate(); return !!this.c; },
  save() { try { localStorage.setItem(CAREER_KEY, JSON.stringify(this.c)); } catch (e) {} },

  // ---------- založení ----------
  genPlayer(role, age, base, rnd = Math.random) {
    const c = this.c, j = (a) => Math.round(clamp(base + (rnd() - 0.5) * a, 42, 95));
    const at = role === 'G' ? { REF: j(14), RYC: j(18), STA: j(18) } : { SIL: j(18), RYC: j(18), PRE: j(18), STA: j(22) };
    return { id: c.nextId++, role, line: 2, num: 2 + Math.floor(rnd() * 96), name: SURNAMES[Math.floor(rnd() * SURNAMES.length)],
      first: INITIALS[Math.floor(rnd() * INITIALS.length)] + '.', hand: rnd() < 0.6 ? 1 : -1, age, at, st: blankSt(), ...playerBody(role, at.SIL, rnd) };
  },
  // doplní smlouvy, potenciál a kapitány (i do starších uložených kariér)
  migrate() {
    const c = this.c;
    if (c.teams[c.user]) this.normLines(c.user);
    for (const t of c.teams) {
      for (const p of t.players) this.ensureContract(p);
      if (t.cap == null || !t.players.some((p) => p.id === t.cap)) {
        const v = t.players.filter((p) => p.role !== 'G').sort((a, b) => (b.age >= 26) - (a.age >= 26) || plOvr(b) - plOvr(a))[0];
        t.cap = v ? v.id : null;
      }
    }
    for (const p of c.fa) this.ensureContract(p);
  },
  ensureContract(p) {
    if (p.sal == null) { p.sal = salOf(p); p.yrs = 1 + Math.floor(Math.random() * 3); }
    if (p.pot == null) p.pot = Math.round(clamp(plOvr(p) + (p.age < 24 ? (24 - p.age) * rand(0.8, 2.2) : 0), 50, 95));
  },
  payroll(ti) { return r1(this.c.teams[ti].players.reduce((a, p) => a + (p.sal || 0), 0)); },
  // vývoj během sezóny: mladí se zlepšují (víc ti, kdo hrají v 1.–2. formaci), veteráni pomalu ztrácejí
  develop() {
    const c = this.c, up = [];
    for (const t of c.teams) for (const p of t.players) {
      this.ensureContract(p);
      const ks = Object.keys(p.at), k = pick(ks);
      if (p.age <= 23 && plOvr(p) < p.pot && Math.random() < (p.line <= 1 ? 0.65 : 0.45)) {
        const d = 1 + (Math.random() < 0.35 ? 1 : 0); p.at[k] = Math.min(99, p.at[k] + d);
        if (t.idx === c.user) up.push(`${p.first} ${p.name} (${{ SIL: 'síla', RYC: 'rychlost', PRE: 'přesnost', STA: 'stamina', REF: 'reflexy' }[k]} +${d})`);
      } else if (p.age >= 32 && Math.random() < 0.35) p.at[k] = Math.max(40, p.at[k] - 1);
    }
    if (up.length) this.news('Vývoj hráčů: ' + up.slice(0, 4).join(', ') + (up.length > 4 ? ` a další (${up.length - 4})` : '') + '.');
  },
  newCareer(user) {
    const c = this.c = { v: 2, season: 1, year: 1998, user, nextId: 1, teams: [], budget: [], fa: [], news: [], history: [], results: [], lastDay: null };
    // liga = konference tvého klubu (16 týmů); přestupy a pohár napříč celou soutěží
    c.league = TEAMS.map((t, i) => i).filter((i) => TEAMS[i].conf === TEAMS[user].conf);
    for (let i = 0; i < TEAMS.length; i++) {
      const R = buildRoster(i), rnd = mulberry32(i * 31 + 7), players = [];
      const add = (p) => players.push({ ...p, id: c.nextId++, age: 19 + Math.floor(rnd() * 15), st: blankSt() });
      R.lines.forEach((l) => l.forEach(add)); R.goalies.forEach(add);
      c.teams.push({ idx: i, players });
      c.budget.push(r1(4 + (teamRatings(i).OVR - 74) * 0.7));
    }
    this.refreshFA();
    this.migrate();
    this.newSeason();
    this.news(`Vítej v klubu ${TEAMS[user].city} ${TEAMS[user].name}! Rozpočet na přestupy: ${money(c.budget[user])}.`);
    this.save();
  },
  refreshFA() {
    const c = this.c; c.fa = [];
    for (const role of ['C', 'LW', 'RW', 'LD', 'RD', 'G', 'C', 'LW', 'RW', 'LD', 'RD', 'G']) { const p = this.genPlayer(role, 20 + Math.floor(Math.random() * 14), 58 + Math.random() * 16); this.ensureContract(p); c.fa.push(p); }
  },
  newSeason() {
    const c = this.c, n = c.league.length;
    c.phase = 'season';
    c.table = TEAMS.map(() => ({ gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
    // rozpis: každý s každým doma a venku (kruhová metoda)
    const arr = c.league.slice(), first = [];
    for (let r = 0; r < n - 1; r++) {
      const rd = [];
      for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; rd.push((r + i) % 2 ? [a, b] : [b, a]); }
      first.push(rd);
      arr.splice(1, 0, arr.pop());
    }
    c.schedule = first.concat(first.map((rd) => rd.map(([h, a]) => [a, h])));
    c.cal = [];
    c.schedule.forEach((_, r) => { c.cal.push({ k: 'L', r }); if (CUP_AFTER[r] != null) c.cal.push({ k: 'C', s: CUP_AFTER[r] }); });
    c.calPos = 0;
    const cupTeams = shuffle([c.user, ...shuffle([...TEAMS.keys()].filter((i) => i !== c.user)).slice(0, 7)]);
    c.cup = { rounds: [[0, 1, 2, 3].map((i) => ({ a: cupTeams[i * 2], b: cupTeams[i * 2 + 1], w: null, s: '' }))], winner: null };
    c.po = null; c.summary = null; c.results = [];
    for (const t of c.teams) for (const p of t.players) p.st = blankSt();
  },
  news(t) { this.c.news.unshift(`${this.c.year}/${String((this.c.year + 1) % 100).padStart(2, '0')}: ${t}`); if (this.c.news.length > 60) this.c.news.pop(); },
  teamName(i) { return TEAMS[i].city + ' ' + TEAMS[i].name; },

  // ---------- sestavy ----------
  sortLines(ti) {
    const ps = this.c.teams[ti].players;
    for (const role of POS_ORDER) {
      const g = ps.filter((p) => p.role === role).sort((a, b) => plOvr(b) - plOvr(a));
      g.forEach((p, i) => (p.line = i));
    }
  },
  // sestava pro zápas: zranění vynechaní, ostatní se posunou o formaci výš a díru zaplní junior z farmy
  // (kopie hráčů sdílí objekt statistik st s originálem, junioři mají vlastní)
  rosterFor(ti) {
    const ps = this.c.teams[ti].players, lines = [[], [], []], used = new Set(ps.map((p) => p.num));
    const fill = (role, n) => {
      const out = ps.filter((p) => p.role === role && !(p.inj > 0)).sort((a, b) => a.line - b.line).slice(0, n);
      for (let k = 0; out.length < n; k++) out.push(this.junior(ti, role, k, used));
      return out;
    };
    const cap = this.c.teams[ti].cap;
    for (const role of ROLES) fill(role, 3).forEach((p, i) => lines[i].push({ ...p, line: i, cap: p.id != null && p.id === cap }));
    const goalies = fill('G', 2).map((p, i) => ({ ...p, line: i }));
    return { lines, goalies };
  },
  junior(ti, role, k, used) {
    const rnd = mulberry32(ti * 1009 + POS_ORDER.indexOf(role) * 31 + k * 7 + this.c.season * 101), j = (a) => Math.round(clamp(57 + (rnd() - 0.5) * a, 42, 80));
    const at = role === 'G' ? { REF: j(10), RYC: j(12), STA: j(12) } : { SIL: j(12), RYC: j(12), PRE: j(12), STA: j(14) };
    let num = 50 + Math.floor(rnd() * 48); while (used.has(num)) num = 2 + ((num + 7) % 96); used.add(num);
    return { id: null, junior: true, role, line: 2, num, name: SURNAMES[Math.floor(rnd() * SURNAMES.length)], first: INITIALS[Math.floor(rnd() * INITIALS.length)] + '.',
      hand: rnd() < 0.6 ? 1 : -1, age: 18, at, st: blankSt(), ...playerBody(role, at.SIL, rnd) };
  },
  injured(ti) { return this.c.teams[ti].players.filter((p) => p.inj > 0); },
  // po zápase: zranění se o zápas zlepší, pak se zapíšou nová
  tickInj(ti) {
    for (const p of this.c.teams[ti].players) if (p.inj > 0 && --p.inj === 0) {
      delete p.injName;
      if (ti === this.c.user) this.news(`${p.first} ${p.name} se uzdravil a je zpět v sestavě.`);
    }
  },
  injure(ti, id, I) {
    const p = this.byId(ti, id); if (!p) return;
    p.inj = Math.max(p.inj || 0, I.games); p.injName = I.name;
    if (ti === this.c.user) {
      this.news(`ZRANĚNÍ: ${p.first} ${p.name} – ${I.name}, mimo ${I.games} ${gamesWord(I.games)}.`);
      if (this.day) this.dayInj.push({ name: p.first + ' ' + p.name, num: p.num, injName: I.name, games: I.games });
    }
  },
  // zranění v simulovaném zápase: častěji hráči s víc minutami a nižší staminou
  simInjuries(ti) {
    const R = this.rosterFor(ti), out = [];
    if (Math.random() < 0.15) {
      const sk = R.lines.flat().filter((p) => !p.junior);
      const p = wpick(sk, (q) => (LINE_W[q.line] || 0.5) * (1.7 - q.at.STA / 100));
      if (p) out.push({ ti, id: p.id, ...rollInjury(Math.random() < 0.65 ? 'foul' : 'tired') });
    }
    if (Math.random() < 0.012 && !R.goalies[0].junior) out.push({ ti, id: R.goalies[0].id, ...rollInjury('foul') });
    return out;
  },
  byId(ti, id) { return this.c.teams[ti].players.find((p) => p.id === id); },
  strength(ti) {
    const R = this.rosterFor(ti), sk = R.lines.flat();
    let att = 0, def = 0, wa = 0, wd = 0;
    for (const p of sk) {
      const w = LINE_W[p.line] || 0.5, a = p.at;
      if (p.role[1] === 'D') { def += w * (a.SIL * 0.45 + a.RYC * 0.3 + a.PRE * 0.25); wd += w; }
      else { att += w * (a.PRE * 0.5 + a.RYC * 0.3 + a.SIL * 0.2); wa += w; }
    }
    return { att: att / wa, def: def / wd, gk: R.goalies[0].at.REF };
  },

  // ---------- kalendář a zápasy ----------
  event() {
    const c = this.c;
    if (c.phase === 'season') return c.cal[c.calPos];
    if (c.phase === 'playoffs') return { k: 'P' };
    return { k: 'END' };
  },
  eventLabel(ev = this.event()) {
    const c = this.c;
    if (ev.k === 'L') return `LIGA – ${ev.r + 1}. KOLO`;
    if (ev.k === 'C') return `POHÁR – ${ROUND_NAMES[ev.s]}`;
    if (ev.k === 'P') return `PLAY-OFF – ${ROUND_NAMES[c.po.round]}`;
    return 'KONEC SEZÓNY';
  },
  fixtures(ev = this.event()) {
    const c = this.c;
    if (ev.k === 'L') return c.schedule[ev.r].map(([h, a]) => ({ h, a, comp: 'L' }));
    if (ev.k === 'C') return c.cup.rounds[ev.s].map((m, i) => ({ h: m.a, a: m.b, comp: 'C', ref: i }));
    if (ev.k === 'P') return c.po.rounds[c.po.round].map((s, i) => ({ s, i })).filter((o) => !o.s.done).map(({ s, i }) => {
      const gno = s.wa + s.wb; // vyšší nasazený doma v 1. a 3. zápase
      return gno % 2 === 0 ? { h: s.a, a: s.b, comp: 'P', ref: i } : { h: s.b, a: s.a, comp: 'P', ref: i };
    });
    return [];
  },
  userMatch(ev = this.event()) { const u = this.c.user; return this.fixtures(ev).find((m) => m.h === u || m.a === u) || null; },
  sim(m) {
    const H = this.strength(m.h), A = this.strength(m.a);
    // stejně mírný vliv síly jako v hraném zápase (silnější vyhraje zhruba 60 %)
    const lh = clamp(2.9 + (H.att - (A.def * 0.45 + A.gk * 0.55)) * 0.05 + 0.15, 1, 5.5);
    const la = clamp(2.9 + (A.att - (H.def * 0.45 + H.gk * 0.55)) * 0.05, 1, 5.5);
    let hg = poisson(lh), ag = poisson(la), ot = false, so = false;
    this.simStats(m.h, hg, ag); this.simStats(m.a, ag, hg);
    if (hg === ag) {
      if (Math.random() < 0.55) { ot = true; if (Math.random() < lh / (lh + la)) { hg++; this.simStats(m.h, 1, 0, true); } else { ag++; this.simStats(m.a, 1, 0, true); } }
      else { so = true; if (Math.random() < clamp(0.5 + (H.att - A.att) * 0.01 + (H.gk - A.gk) * 0.012, 0.2, 0.8)) hg++; else ag++; }
    }
    return { hg, ag, ot, so, inj: [...this.simInjuries(m.h), ...this.simInjuries(m.a)] };
  },
  // rozdělí góly a asistence mezi hráče, brankáři zákroky
  simStats(ti, goals, against, extraOnly) {
    const R = this.rosterFor(ti), sk = R.lines.flat(), g = R.goalies[0];
    if (!extraOnly) {
      for (const p of sk) p.st.gp++;
      g.st.gp++;
      const shots = against + poisson(25);
      g.st.sa += shots; g.st.sv += shots - against;
      for (let i = poisson(1.4); i > 0; i--) wpick(sk, (p) => 1 + p.at.SIL / 100).st.pim += 2;
    }
    for (let i = 0; i < goals; i++) {
      const sc = wpick(sk, (p) => (LINE_W[p.line] || 0.5) * (p.role[1] === 'D' ? 0.35 : 1) * (p.at.PRE + p.at.SIL * 0.4));
      sc.st.g++;
      const rest = sk.filter((p) => p !== sc);
      if (Math.random() < 0.88) { const a1 = wpick(rest, (p) => (LINE_W[p.line] || 0.5) * (p.role[1] === 'D' ? 0.8 : 1) * p.at.PRE); a1.st.a++;
        if (Math.random() < 0.62) wpick(rest.filter((p) => p !== a1), (p) => (LINE_W[p.line] || 0.5) * p.at.PRE).st.a++; }
    }
  },
  record(m, res) {
    const c = this.c, hw = res.hg > res.ag, W = hw ? m.h : m.a, Lz = hw ? m.a : m.h;
    const suf = res.so ? ' SN' : res.ot ? ' PP' : '';
    c.results.unshift({ comp: m.comp, h: m.h, a: m.a, hg: res.hg, ag: res.ag, suf });
    if (c.results.length > 40) c.results.pop();
    this.day.push({ comp: m.comp, h: m.h, a: m.a, hg: res.hg, ag: res.ag, suf });
    c.budget[m.h] = r1(c.budget[m.h] + 0.35 + (m.comp === 'L' ? 0 : 0.25));
    if (m.comp === 'L') {
      const T = c.table, th = T[m.h], ta = T[m.a];
      th.gp++; ta.gp++; th.gf += res.hg; th.ga += res.ag; ta.gf += res.ag; ta.ga += res.hg;
      const tw = T[W], tl = T[Lz];
      if (res.ot || res.so) { tw.otw++; tw.pts += 2; tl.otl++; tl.pts += 1; } else { tw.w++; tw.pts += 3; tl.l++; }
    } else if (m.comp === 'C') {
      const cm = c.cup.rounds[this.event().s][m.ref]; cm.w = W; cm.s = `${res.hg}:${res.ag}${suf}`;
    } else if (m.comp === 'P') {
      const s = c.po.rounds[c.po.round][m.ref];
      if (W === s.a) s.wa++; else s.wb++;
      s.games.push(`${res.hg}:${res.ag}${suf}`);
      if (s.wa === 2 || s.wb === 2) { s.done = true; s.w = s.wa === 2 ? s.a : s.b; }
    }
    if ((m.h === c.user || m.a === c.user)) {
      const my = m.h === c.user ? res.hg : res.ag, op = m.h === c.user ? res.ag : res.hg, o = m.h === c.user ? m.a : m.h;
      this.news(`${my > op ? 'Výhra' : 'Prohra'} ${my}:${op}${suf} s týmem ${this.teamName(o)} (${m.comp === 'L' ? 'liga' : m.comp === 'C' ? 'pohár' : 'play-off'}).`);
    }
  },
  standings() {
    const T = this.c.table;
    return this.c.league.slice().sort((a, b) => T[b].pts - T[a].pts || (T[b].gf - T[b].ga) - (T[a].gf - T[a].ga) || T[b].gf - T[a].gf);
  },
  // posune kalendář o jeden „den" (výsledek uživatelova zápasu, pokud ho odehrál)
  advance(userRes) {
    const c = this.c, ev = this.event();
    if (ev.k === 'END') return;
    this.day = []; this.dayInj = []; const label = this.eventLabel(ev);
    const um = this.userMatch(ev);
    for (const m of this.fixtures(ev)) {
      const mine = um && m.h === um.h && m.a === um.a, res = mine && userRes ? userRes : this.sim(m);
      this.record(m, res);
      this.tickInj(m.h); this.tickInj(m.a);
      for (const q of res.inj || []) this.injure(q.ti, q.id, q);
    }
    c.lastDay = { label, results: this.day, inj: this.dayInj };
    // forma hráčů tvého týmu: body v posledním zápase ji zvednou, bez bodů pomalu klesá
    for (const p of c.teams[c.user].players) {
      const pts = p.st.g + p.st.a, d = pts - (p.lastPts || 0); p.lastPts = pts;
      p.form = clamp((p.form || 0) * 0.6 + (d > 0 ? 0.008 * Math.min(d, 2) : -0.003) + gauss() * 0.006, -0.03, 0.03);
    }
    if (ev.k === 'C') {
      this.develop();
      const rd = c.cup.rounds[ev.s];
      if (ev.s < 2) c.cup.rounds.push([0, 1].slice(0, rd.length / 2).map((i) => ({ a: rd[i * 2].w, b: rd[i * 2 + 1].w, w: null, s: '' })));
      else { c.cup.winner = rd[0].w; c.budget[rd[0].w] = r1(c.budget[rd[0].w] + 3); this.news(`Pohár vyhrál tým ${this.teamName(rd[0].w)}!`); if (rd[0].w === c.user && typeof Ach !== 'undefined') Ach.unlock('cup'); }
    }
    if (c.phase === 'season') {
      c.calPos++;
      if (Math.random() < 0.2) this.aiTransfer();
      if (c.calPos >= c.cal.length) this.startPlayoffs();
    } else if (c.phase === 'playoffs') {
      if (c.po.rounds[c.po.round].every((s) => s.done)) {
        if (c.po.round < 2) {
          const st = this.standings(), seed = (i) => st.indexOf(i);
          const w = c.po.rounds[c.po.round].map((s) => s.w);
          c.po.round++;
          c.po.rounds[c.po.round] = [0, 1].slice(0, w.length / 2).map((i) => {
            let a = w[i * 2], b = w[i * 2 + 1]; if (seed(b) < seed(a)) [a, b] = [b, a];
            return { a, b, wa: 0, wb: 0, done: false, w: null, games: [] };
          });
        } else { c.po.champion = c.po.rounds[c.po.round][0].w; this.seasonEnd(); }
      }
    }
    this.save();
  },
  startPlayoffs() {
    const c = this.c, st = this.standings();
    c.phase = 'playoffs';
    const pairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
    c.po = { round: 0, rounds: [pairs.map(([x, y]) => ({ a: st[x], b: st[y], wa: 0, wb: 0, done: false, w: null, games: [] }))], champion: null };
    const rk = st.indexOf(c.user) + 1;
    this.news(rk <= 8 ? `Základní část končí na ${rk}. místě – postup do play-off!` : `Základní část končí na ${rk}. místě – play-off bez nás.`);
  },
  seasonEnd() {
    const c = this.c, st = this.standings(), champ = c.po.champion;
    const all = c.teams.flatMap((t) => t.players.map((p) => ({ p, t: t.idx })));
    const sk = all.filter((o) => o.p.role !== 'G').sort((a, b) => (b.p.st.g + b.p.st.a) - (a.p.st.g + a.p.st.a) || b.p.st.g - a.p.st.g);
    const gk = all.filter((o) => o.p.role === 'G' && o.p.st.sa > 60).sort((a, b) => b.p.st.sv / b.p.st.sa - a.p.st.sv / a.p.st.sa);
    st.forEach((ti, i) => { c.budget[ti] = r1(c.budget[ti] + (st.length - i) * 0.19); });
    c.budget[champ] = r1(c.budget[champ] + 5);
    const fin = c.po.rounds[c.po.round][0], runner = fin.a === champ ? fin.b : fin.a; c.budget[runner] = r1(c.budget[runner] + 2.5);
    const top = sk[0], bg = gk[0];
    c.summary = {
      champ, runner, cup: c.cup.winner, rank: st.indexOf(c.user) + 1,
      scorer: top && { name: top.p.first + ' ' + top.p.name, t: top.t, pts: top.p.st.g + top.p.st.a, g: top.p.st.g, a: top.p.st.a },
      goalie: bg && { name: bg.p.first + ' ' + bg.p.name, t: bg.t, pct: (bg.p.st.sv / bg.p.st.sa * 100).toFixed(1) },
    };
    c.history.push({ season: `${c.year}/${String((c.year + 1) % 100).padStart(2, '0')}`, champ, cup: c.cup.winner, rank: c.summary.rank });
    c.phase = 'offseason';
    if (champ === c.user && typeof Ach !== 'undefined') Ach.unlock('champ');
    this.news(`Mistrem ligy je ${this.teamName(champ)}!${champ === c.user ? ' TO JSME MY!' : ''}`);
  },
  // nová sezóna: stárnutí, vývoj, konec kariér, odchovanci
  nextSeason() {
    const c = this.c; let retired = 0; const left = [];
    for (const t of c.teams) {
      t.players = t.players.map((p) => {
        p.age++; p.inj = 0; delete p.injName; this.ensureContract(p);
        let d = p.age <= 22 ? [1, 5] : p.age <= 26 ? [0, 3] : p.age <= 30 ? [-1, 1] : p.age <= 33 ? [-3, 0] : [-5, -1];
        if (p.age <= 25) d = plOvr(p) < p.pot ? [d[0] + 1, d[1] + 1] : [d[0] - 1, Math.max(0, d[1] - 2)];   // růst k potenciálu
        for (const k in p.at) p.at[k] = Math.round(clamp(p.at[k] + d[0] + Math.random() * (d[1] - d[0] + 1), 40, 99));
        if (p.age >= 35 && Math.random() < 0.35 + (p.age - 35) * 0.2) {
          retired++;
          const y = this.genPlayer(p.role, 18 + Math.floor(Math.random() * 3), 56 + Math.random() * 12);
          if (t.idx === c.user) this.news(`${p.first} ${p.name} ukončil kariéru, místo něj přichází odchovanec ${y.first} ${y.name}.`);
          y.line = p.line; this.ensureContract(y); return y;
        }
        return p;
      });
      // smlouvy: počítač prodlužuje sám, tvoji hráči bez prodloužení odcházejí
      const keep = [];
      for (const p of t.players) {
        p.yrs = (p.yrs || 1) - 1;
        if (p.yrs > 0) { keep.push(p); continue; }
        if (t.idx !== c.user) { p.yrs = 1 + Math.floor(Math.random() * 3); p.sal = salOf(p); keep.push(p); continue; }
        this.news(`${p.first} ${p.name} neprodloužil smlouvu a odchází mezi volné hráče.`);
        left.push(p);
      }
      t.players = keep;
      if (t.idx !== c.user) this.sortLines(t.idx);
      this.fixNumbers(t.idx);
    }
    this.refreshFA();
    for (const p of left) { p.yrs = 1 + Math.floor(Math.random() * 2); c.fa.push(p); }
    this.fillRoster(c.user);
    const capWas = c.teams[c.user].cap; this.migrate();
    if (c.teams[c.user].cap !== capWas) { const k = this.byId(c.user, c.teams[c.user].cap); if (k) this.news(`Novým kapitánem je ${k.first} ${k.name} (změníš na soupisce tlačítkem X).`); }
    c.season++; c.year++; c.drafted = false;
    this.newSeason();
    this.news(`Začíná sezóna ${c.year}/${String((c.year + 1) % 100).padStart(2, '0')}. Kariéru ukončilo ${retired} hráčů ligy.`);
    this.save();
  },
  // formace bez děr: na každém postu pořadí 0, 1, 2, … (zachová tvé pořadí, nováčci na konec)
  normLines(ti) {
    const ps = this.c.teams[ti].players;
    for (const role of POS_ORDER) ps.filter((p) => p.role === role).sort((a, b) => (a.line ?? 9) - (b.line ?? 9) || plOvr(b) - plOvr(a)).forEach((p, i) => (p.line = i));
  },
  // chybí-li na postu hráči (odchody), doplní se odchovanci z farmy
  fillRoster(ti) {
    const t = this.c.teams[ti];
    for (const role of POS_ORDER) {
      const need = role === 'G' ? 2 : 3;
      while (t.players.filter((p) => p.role === role).length < need) {
        const y = this.genPlayer(role, 18 + Math.floor(Math.random() * 3), 55 + Math.random() * 8); this.ensureContract(y); y.sal = Math.min(y.sal, 0.8); y.yrs = 2;
        y.line = 2; t.players.push(y);
        if (ti === this.c.user) this.news(`Na post ${ROLE_NAMES[role]} nastupuje odchovanec ${y.first} ${y.name}.`);
      }
    }
    this.fixNumbers(ti); this.normLines(ti);
  },
  // ---------- draft (v létě, 1 kolo; slabší tým vybírá dřív) ----------
  draftSetup() {
    const c = this.c;
    if (c.draft) return;
    const pool = [];
    for (let i = 0; i < 40; i++) {
      const role = POS_ORDER[i % 6], p = this.genPlayer(role, 18 + Math.floor(Math.random() * 2), 52 + Math.random() * 12);
      p.pot = Math.round(clamp(plOvr(p) + rand(6, 26), 60, 95)); p.sal = 0.6; p.yrs = 3; p.line = 3;
      pool.push(p);
    }
    // pořadí: tým s nejméně body vybírá první (týmy mimo ligu náhodně mezi nimi)
    const T = c.table, order = [...Array(TEAMS.length).keys()].sort((a, b) => (T[a].gp ? T[a].pts / T[a].gp : 1 + Math.random()) - (T[b].gp ? T[b].pts / T[b].gp : 1 + Math.random()));
    c.draft = { pool, order, pos: 0, picks: [] };
    this.draftRun();
  },
  // počítač vybírá, dokud nepřijde na řadu tvůj tým
  draftRun() {
    const c = this.c, D = c.draft;
    while (D.pos < D.order.length && D.order[D.pos] !== c.user) {
      const ti = D.order[D.pos], best = D.pool.reduce((a, b) => (b.pot + plOvr(b) * 0.3 > a.pot + plOvr(a) * 0.3 ? b : a));
      this.draftTake(ti, best);
    }
  },
  draftTake(ti, p) {
    const c = this.c, D = c.draft, t = c.teams[ti];
    D.pool.splice(D.pool.indexOf(p), 1); D.picks.push({ ti, name: p.first + ' ' + p.name, role: p.role, pos: D.pos + 1 });
    p.line = 9; t.players.push(p); D.pos++;
    // víc než 5 hráčů na postu (2 brankáři + 1): nejslabší z farmy odchází
    const same = t.players.filter((q) => q.role === p.role), cap = p.role === 'G' ? 3 : 5;
    if (same.length > cap) {
      const out = same.filter((q) => q !== p).sort((a, b) => plValue(a) - plValue(b))[0];
      t.players.splice(t.players.indexOf(out), 1); c.fa.push(out);
      if (ti === c.user) this.news(`${out.first} ${out.name} uvolněn mezi volné hráče (plná soupiska).`);
    }
    if (ti === c.user) this.news(`DRAFT: s ${D.pos}. volbou vybíráme ${p.first} ${p.name} (${ROLE_NAMES[p.role]}, ${p.age} let, potenciál ${potName(p.pot)}).`);
    this.fixNumbers(ti); this.normLines(ti);
  },
  draftFinish(p) {
    const c = this.c, D = c.draft;
    if (D) { if (p) this.draftTake(c.user, p); else D.pos++; this.draftRunRest(); }
    c.draft = null; c.drafted = true; this.save();
  },
  draftRunRest() { const c = this.c, D = c.draft; while (D.pos < D.order.length && D.pool.length) { const ti = D.order[D.pos]; if (ti === c.user) { D.pos++; continue; } this.draftTake(ti, D.pool.reduce((a, b) => (b.pot > a.pot ? b : a))); } },
  // ---------- smlouvy ----------
  askSal(p) { return r1(salOf(p) * (1.05 + (p.age < 25 ? 0.15 : 0)) + 0.1); },
  extend(p, yrs) {
    const c = this.c, ask = this.askSal(p), pay = this.payroll(c.user) - (p.sal || 0) + ask;
    if (pay > SAL_CAP) return `Překročil bys platový strop (${money(SAL_CAP)}).`;
    p.sal = ask; p.yrs = (p.yrs || 0) + yrs;
    this.news(`SMLOUVA: ${p.first} ${p.name} prodloužil o ${yrs} ${yrs === 1 ? 'rok' : 'roky'} za ${money(ask)} ročně.`);
    this.save(); return null;
  },
  fixNumbers(ti) {
    const seen = new Set();
    for (const p of this.c.teams[ti].players) { while (seen.has(p.num)) p.num = 2 + Math.floor(Math.random() * 96); seen.add(p.num); }
  },

  // ---------- přestupy ----------
  windowOpen() {
    const c = this.c, ev = this.event();
    return c.phase === 'season' && (ev.k !== 'L' ? (c.cal.findIndex((e) => e.k === 'L' && e.r > TRANSFER_LAST_ROUND) > c.calPos) : ev.r <= TRANSFER_LAST_ROUND);
  },
  market(role) {
    const c = this.c, out = [];
    for (const t of c.teams) if (t.idx !== c.user) for (const p of t.players) if (p.role === role) out.push({ p, ti: t.idx });
    for (const p of c.fa) if (p.role === role) out.push({ p, ti: -1 });
    return out.sort((a, b) => plOvr(b.p) - plOvr(a.p));
  },
  // cena: kupuješ hráče a dáváš svého na stejném postu
  fee(target, ti, mine) {
    const prem = ti < 0 ? 0.5 : target.line === 0 ? 1.25 : 1;
    const d = plValue(target) * prem - plValue(mine) * (ti < 0 ? 0.3 : 0.85);
    return d >= 0 ? r1(d) : r1(d * 0.6);
  },
  doTransfer(target, ti, mine) {
    const c = this.c, fee = this.fee(target, ti, mine);
    if (fee > c.budget[c.user]) return 'Na tento přestup nemáš peníze.';
    this.ensureContract(target); this.ensureContract(mine);
    if (this.payroll(c.user) - mine.sal + target.sal > SAL_CAP) return `Přestup by překročil platový strop ${money(SAL_CAP)} (plat ${money(target.sal)}).`;
    const myT = c.teams[c.user], mi = myT.players.indexOf(mine);
    const ln = mine.line; mine.line = target.line; target.line = ln;
    myT.players[mi] = target;
    if (ti < 0) { c.fa[c.fa.indexOf(target)] = mine; }
    else { const ot = c.teams[ti], oi = ot.players.indexOf(target); ot.players[oi] = mine; c.budget[ti] = r1(c.budget[ti] + fee); this.sortLines(ti); this.fixNumbers(ti); }
    c.budget[c.user] = r1(c.budget[c.user] - fee);
    this.fixNumbers(c.user);
    this.news(`PŘESTUP: ${target.first} ${target.name} přichází ${ti < 0 ? 'jako volný hráč' : 'z ' + this.teamName(ti)}, ${mine.first} ${mine.name} odchází. ${fee >= 0 ? 'Zaplaceno ' + money(fee) : 'Získáno ' + money(-fee)}.`);
    this.save();
    return null;
  },
  aiTransfer() {
    const c = this.c, ids = [...Array(TEAMS.length).keys()].filter((i) => i !== c.user);
    const [x, y] = shuffle(ids), role = pick(POS_ORDER);
    const px = pick(c.teams[x].players.filter((p) => p.role === role)), py = pick(c.teams[y].players.filter((p) => p.role === role));
    if (!px || !py || px.inj > 0 || py.inj > 0 || Math.abs(plValue(px) - plValue(py)) > 1.5) return;
    const tx = c.teams[x].players, ty = c.teams[y].players;
    tx[tx.indexOf(px)] = py; ty[ty.indexOf(py)] = px;
    this.sortLines(x); this.sortLines(y); this.fixNumbers(x); this.fixNumbers(y);
    this.news(`Výměna: ${px.first} ${px.name} (${TEAMS[x].abbr} → ${TEAMS[y].abbr}) za ${py.first} ${py.name}.`);
  },

  // ---------- zápas ----------
  playMatch() {
    const c = this.c, m = this.userMatch(); if (!m) return;
    const S = Settings.data, side = m.h === c.user ? 0 : 1;
    let devs = Input.activeDevices(); if (!devs.length) devs = [Input.merged];
    const humans = devs.slice(0, 4).map((d, i) => ({ dev: d, team: side, assist: App.assistFor(d, i) }));
    Sfx.init(); Sfx.resume();
    // kariéra: zápas vždy končí vítězstvím (prodloužení, nájezdy)
    App.game = new Game({ home: m.h, away: m.a, humans, ...App.ruleCfg(), shootout: true, rosters: [this.rosterFor(m.h), this.rosterFor(m.a)], career: true });
    App.careerMatch = m; App.screen = 'game'; App.sel = 0;
  },
  finishPlayed(g) {
    const c = this.c, m = App.careerMatch;
    const res = { hg: g.teams[0].score, ag: g.teams[1].score, ot: g.period > 3 && !g.soWinner, so: !!g.soWinner, inj: [] };
    for (const q of g.injuries || []) if (q.player.id != null) res.inj.push({ ti: q.team === g.teams[0] ? m.h : m.a, id: q.player.id, name: q.name, games: q.games });
    if (res.hg === res.ag) {
      res.so = true; const H = this.strength(m.h), A = this.strength(m.a);
      if (Math.random() < clamp(0.5 + (H.gk - A.gk) * 0.012, 0.25, 0.75)) res.hg++; else res.ag++;
    }
    // statistiky hráčů z odehraného zápasu
    for (const [side, ti] of [[0, m.h], [1, m.a]]) {
      const T = g.teams[side];
      for (const p of T.roster) {
        const rec = this.byId(ti, p.id); if (!rec) continue;
        if (!p.isGoalie || p === T.goalie) rec.st.gp++;
        rec.st.g += p.stats.g; rec.st.a += p.stats.a; rec.st.pim += p.stats.pim || 0;
        if (p.isGoalie) { rec.st.sa += p.stats.sa; rec.st.sv += p.stats.sv; }
      }
    }
    this.simSkipUser = true;
    this.advance(res);
    App.careerMatch = null;
    this.view = 'result'; this.sel = 0;
  },
  simUser() { this.advance(null); this.view = 'result'; this.sel = 0; },
  simToEnd() {
    let guard = 0;
    while (this.c.phase !== 'offseason' && guard++ < 200) this.advance(null);
    this.view = 'summary'; this.sel = 0;
  },
};

// ---------- obrazovky kariéry ----------
Object.assign(Career, {
  enter() {
    this.sel = 0; this.pick = Settings.data.home || 0; this.msg = '';
    if (this.c || this.load()) this.view = 'start'; else this.view = 'pick';
  },
  go(v, sel = 0) { this.view = v; this.sel = sel; this.scroll = 0; this.mark = null; Sfx.stick(0.6); },
  flash(t) { this.msg = t; this.msgT = 3; },
  navN(n, dt) {
    const M = Input.merged;
    if (M.nav('up', dt)) { this.sel = (this.sel + n - 1) % n; Sfx.stick(0.4); }
    if (M.nav('down', dt)) { this.sel = (this.sel + 1) % n; Sfx.stick(0.4); }
  },
  hubItems() {
    const c = this.c, m = this.userMatch(), it = [];
    if (c.phase === 'offseason') it.push(['summary', 'SOUHRN SEZÓNY']);
    else if (m) it.push(['play', 'HRÁT ZÁPAS'], ['sim', 'SIMULOVAT ZÁPAS']);
    else it.push(['next', 'POKRAČOVAT (NEHRAJEME)']);
    it.push(['table', 'TABULKA'], ['cup', 'POHÁR']);
    if (c.po) it.push(['po', 'PLAY-OFF']);
    it.push(['roster', 'SOUPISKA A SESTAVA'], ['contracts', 'SMLOUVY A PLATY'], ['market', 'PŘESTUPY'], ['stats', 'STATISTIKY'], ['news', 'ZPRÁVY']);
    if (c.phase !== 'offseason') it.push(['simall', 'SIMULOVAT DO KONCE SEZÓNY']);
    it.push(['quit', 'ULOŽIT A ODEJÍT']);
    return it;
  },
  update(dt) {
    const M = Input.merged, c = this.c;
    if (this.msgT > 0) this.msgT -= dt;
    const back = M.pressed('b'), ok = M.pressed('a') || M.pressed('start');
    switch (this.view) {
      case 'start': {
        const it = [this.c && 'cont', 'new', 'back'].filter(Boolean);
        this.navN(it.length, dt);
        if (ok) { const k = it[this.sel]; if (k === 'cont') this.go('hub'); else if (k === 'new') this.go(this.c ? 'confirmNew' : 'pick'); else App.go('title', 2); }
        if (back) App.go('title', 2);
        break;
      }
      case 'confirmNew': if (ok) this.go('pick'); if (back) this.go('start'); break;
      case 'pick': {
        const d = App.lr(dt);
        if (d) { this.pick = (this.pick + d + TEAMS.length) % TEAMS.length; Sfx.stick(0.4); }
        if (ok) { this.newCareer(this.pick); this.go('hub'); }
        if (back) { if (this.exists()) this.go('start'); else App.go('title', 2); }
        break;
      }
      case 'hub': {
        const it = this.hubItems();
        this.navN(it.length, dt);
        if (ok) {
          const k = it[this.sel][0];
          if (k === 'play') this.playMatch();
          else if (k === 'sim' || k === 'next') this.simUser();
          else if (k === 'summary') this.go('summary');
          else if (k === 'simall') this.go('confirmSim');
          else if (k === 'quit') { this.save(); App.go('title', 2); }
          else this.go(k);
        }
        if (back) { this.save(); App.go('title', 2); }
        break;
      }
      case 'confirmSim': if (ok) this.simToEnd(); if (back) this.go('hub'); break;
      case 'result': if (ok || back) this.go(this.c.phase === 'offseason' ? 'summary' : 'hub'); break;
      case 'summary':
        if (ok) { if (!c.drafted) { this.draftSetup(); this.go('draft'); } else { this.nextSeason(); this.go('hub'); } }
        if (back) this.go('hub'); break;
      case 'draft': {
        const pool = c.draft ? c.draft.pool.slice().sort((a, b) => b.pot - a.pot) : [];
        this.navN(Math.max(1, Math.min(14, pool.length)), dt);
        if (ok && pool[this.sel]) { this.draftFinish(pool[this.sel]); this.nextSeason(); this.go('hub'); this.flash('Draft hotový, začíná nová sezóna!'); }
        if (M.pressed('y')) { this.draftFinish(null); this.nextSeason(); this.go('hub'); }
        if (back) this.go('summary');
        break;
      }
      case 'contracts': {
        const rows = this.contractRows();
        this.navN(rows.length, dt);
        if (M.pressed('x') || M.pressed('y')) { const p = rows[this.sel], yrs = M.pressed('x') ? 1 : 3; const err = this.extend(p, yrs); this.flash(err || `Smlouva prodloužena o ${yrs} ${yrs === 1 ? 'rok' : 'roky'}.`); }
        if (ok || back) this.go('hub', this.hubItems().findIndex((i) => i[0] === 'contracts'));
        break;
      }
      case 'table': case 'cup': case 'po': case 'stats': case 'news': if (ok || back) this.go('hub'); break;
      case 'roster': {
        const rows = this.rosterRows();
        this.navN(rows.length, dt);
        if (ok) {
          const p = rows[this.sel];
          if (!this.mark) this.mark = p;
          else if (this.mark === p) this.mark = null;
          else if (this.mark.role !== p.role) this.flash('Prohodit jde jen hráče na stejném postu.');
          else { const l = this.mark.line; this.mark.line = p.line; p.line = l; this.mark = null; this.save(); Sfx.stick(0.8); }
        }
        if (M.pressed('y')) { this.sortLines(c.user); this.save(); this.flash('Formace seřazeny podle síly.'); }
        if (M.pressed('x')) { const p = rows[this.sel]; if (p.role === 'G') this.flash('Kapitánem nemůže být brankář.'); else { c.teams[c.user].cap = p.id; this.save(); this.flash(`Kapitánem je ${p.first} ${p.name}.`); } }
        if (back) { if (this.mark) this.mark = null; else this.go('hub'); }
        break;
      }
      case 'market': {
        const d = App.lr(dt);
        if (d) { this.role = (this.role + d + POS_ORDER.length) % POS_ORDER.length; this.sel = 0; this.scroll = 0; }
        const list = this.market(POS_ORDER[this.role || 0]);
        this.navN(Math.max(1, list.length), dt);
        if (this.sel < this.scroll) this.scroll = this.sel;
        if (this.sel >= this.scroll + 15) this.scroll = this.sel - 14;
        if (ok && list[this.sel]) {
          if (!this.windowOpen()) this.flash('Přestupní okno je zavřené (otevře se v létě před novou sezónou).');
          else { this.target = list[this.sel]; this.go('swap'); }
        }
        if (back) this.go('hub', this.hubItems().findIndex((i) => i[0] === 'market'));
        break;
      }
      case 'swap': {
        const mine = this.mySameRole();
        this.navN(mine.length + 1, dt);
        if (ok) {
          if (this.sel === mine.length) this.go('market');
          else {
            const err = this.doTransfer(this.target.p, this.target.ti, mine[this.sel]);
            if (err) this.flash(err); else { this.flash('Přestup hotový!'); this.go('roster'); this.msgT = 3; }
          }
        }
        if (back) this.go('market');
        break;
      }
    }
  },
  mySameRole() { return this.c.teams[this.c.user].players.filter((p) => p.role === this.target.p.role).sort((a, b) => a.line - b.line); },
  rosterRows() {
    const ps = this.c.teams[this.c.user].players, out = [];
    for (const L of [0, 1, 2]) for (const role of ROLES) { const p = ps.find((q) => q.role === role && q.line === L); if (p) out.push(p); }
    const gs = ps.filter((p) => p.role === 'G').sort((a, b) => a.line - b.line);
    this.farmFrom = out.length + gs.length;
    // farma: hráči mimo tři formace (draft, náhradníci) – prohozením je dostaneš do sestavy
    return out.concat(gs, ps.filter((p) => p.role !== 'G' && !out.includes(p)).sort((a, b) => POS_ORDER.indexOf(a.role) - POS_ORDER.indexOf(b.role)));
  },
  contractRows() { return this.c.teams[this.c.user].players.slice().sort((a, b) => (a.yrs || 0) - (b.yrs || 0) || b.sal - a.sal); },

  // ---------- kreslení ----------
  T(s, x, y, size = 15, col = '#fff', align = 'left', st = 'bold') {
    const ctx = R.ctx; ctx.font = font(size, st); ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(String(s), x, y);
  },
  hl(x, y, w, h) { const ctx = R.ctx; R.sel(x, y, w, h); },
  footer(t) { this.T(t, R.W / 2, 776, 13, 'rgba(255,255,255,0.7)', 'center'); },
  draw() {
    const v = this.view;
    if (v === 'start') this.drawStart();
    else if (v === 'confirmNew') this.drawConfirm('NOVÁ KARIÉRA', 'Současná kariéra se přepíše. Pokračovat?');
    else if (v === 'confirmSim') this.drawConfirm('SIMULOVAT SEZÓNU', 'Všechny zbývající zápasy včetně tvých se nasimulují.');
    else if (v === 'pick') this.drawPick();
    else this[{ hub: 'drawHub', table: 'drawTable', cup: 'drawCup', po: 'drawPo', roster: 'drawRosterC', market: 'drawMarket', swap: 'drawSwap',
      stats: 'drawStats', news: 'drawNews', result: 'drawResult', summary: 'drawSummary', draft: 'drawDraft', contracts: 'drawContracts' }[v]]();
    if (this.msgT > 0 && this.msg) { const w = Math.max(420, R.ctx.measureText(this.msg).width + 60); R.panel(R.W / 2 - w / 2, 700, w, 44, 0.95); this.T(this.msg, R.W / 2, 722, 16, ACC, 'center'); }
  },
  drawStart() {
    R.chromeText('KARIÉRA', R.W / 2, 150, 72);
    const c = this.c;
    if (c) this.T(`Uložená kariéra: ${this.teamName(c.user)} • sezóna ${c.year}/${String((c.year + 1) % 100).padStart(2, '0')}`, R.W / 2, 230, 18, '#8fa6c8', 'center');
    App.drawList([c && 'POKRAČOVAT KARIÉRU', 'NOVÁ KARIÉRA', 'ZPĚT'].filter(Boolean), 330, this.sel);
    this.footer('Liga = konference 16 týmů (30 kol), Pohár napříč soutěží, Play-off, přestupy a vývoj hráčů. Kariéra se ukládá automaticky.');
  },
  drawConfirm(t, s) {
    R.panel(R.W / 2 - 360, 260, 720, 240, 0.95);
    R.chromeText(t, R.W / 2, 320, 40);
    this.T(s, R.W / 2, 390, 18, '#fff', 'center');
    this.T('A = ANO     B = NE', R.W / 2, 450, 20, ACC, 'center', '800');
  },
  drawPick() {
    R.chromeText('VYBER SVŮJ KLUB', R.W / 2, 60, 44);
    App.teamCard(TEAMS[this.pick], R.W / 2, 120, 'TVŮJ KLUB', true);
    const RT = teamRatings(this.pick);
    this.T(`Celkové hodnocení ${RT.OVR}  •  rozpočet na přestupy ${money(r1(4 + (RT.OVR - 74) * 0.7))}`, R.W / 2, 500, 17, '#8fa6c8', 'center');
    R.chromeText('A = ZAČÍT KARIÉRU', R.W / 2, 580, 34, '#fff8d0', ACC);
    this.footer('◄► jiný klub   A potvrdit   B zpět');
  },
  myPos() { return this.standings().indexOf(this.c.user) + 1; },
  seasonStr() { const c = this.c; return `${c.year}/${String((c.year + 1) % 100).padStart(2, '0')}`; },
  drawHub() {
    const c = this.c, u = c.user, x0 = R.W / 2 - 610, x1 = R.W / 2 + 20;
    R.chromeText(this.teamName(u).toUpperCase(), R.W / 2, 40, 36);
    this.T(`SEZÓNA ${this.seasonStr()}   •   ${this.myPos()}. MÍSTO V LIZE (${c.table[u].pts} b.)   •   ROZPOČET ${money(c.budget[u])}   •   VÝPLATY ${money(this.payroll(u))} / ${money(SAL_CAP)}`, R.W / 2, 80, 15, '#8fa6c8', 'center');
    // příští zápas
    R.panel(x0, 104, 600, 330, 0.9);
    const ev = this.event(), m = this.userMatch(ev);
    this.T(c.phase === 'offseason' ? 'SEZÓNA SKONČILA' : this.eventLabel(ev), x0 + 300, 132, 22, ACC, 'center', '800');
    if (m) {
      App.teamLogo(TEAMS[m.h], x0 + 150, 250, 0.75); App.teamLogo(TEAMS[m.a], x0 + 450, 250, 0.75);
      R.chromeText('VS', x0 + 300, 250, 44, '#fff', '#ff5a3c');
      this.T(this.teamName(m.h), x0 + 150, 340, 16, '#fff', 'center'); this.T(this.teamName(m.a), x0 + 450, 340, 16, '#fff', 'center');
      this.T(m.h === u ? 'DOMA' : 'VENKU', x0 + 300, 372, 16, '#8fa6c8', 'center');
      if (m.comp === 'P') { const s = c.po.rounds[c.po.round][m.ref]; this.T(`Série ${TEAMS[s.a].abbr} ${s.wa}:${s.wb} ${TEAMS[s.b].abbr}  (hraje se na 2 vítězství)`, x0 + 300, 404, 15, '#cfd8ea', 'center'); }
      else { const o = m.h === u ? m.a : m.h, k = this.standings().indexOf(o); this.T(k >= 0 ? `Soupeř: ${k + 1}. místo, ${c.table[o].pts} b.` : `Soupeř z ${TEAMS[o].conf ? 'Západní' : 'Východní'} konference`, x0 + 300, 400, 15, '#cfd8ea', 'center'); }
      const inj = this.injured(u);
      if (inj.length) this.T('Zranění: ' + inj.map((p) => `${p.first} ${p.name} (${p.inj})`).join(', '), x0 + 300, 422, 13, '#ff9a7a', 'center');
    } else if (c.phase === 'offseason') {
      const S = c.summary; this.T(`Mistr: ${this.teamName(S.champ)}`, x0 + 300, 230, 22, '#fff', 'center');
      this.T(`Tvůj tým: ${S.rank}. místo v základní části`, x0 + 300, 270, 17, '#cfd8ea', 'center');
    } else this.T('V tomto kole tvůj tým nehraje.', x0 + 300, 260, 18, '#cfd8ea', 'center');
    // poslední zápasy
    R.panel(x0, 448, 600, 312, 0.85);
    this.T('POSLEDNÍ ZÁPASY', x0 + 20, 474, 16, ACC);
    c.results.filter((r) => r.h === u || r.a === u).slice(0, 8).forEach((r, i) => {
      const my = r.h === u ? r.hg : r.ag, op = r.h === u ? r.ag : r.hg, col = my > op ? '#7dff8a' : '#ff7a5a', y = 506 + i * 31;
      this.T(r.comp === 'L' ? 'LIGA' : r.comp === 'C' ? 'POHÁR' : 'PLAY-OFF', x0 + 20, y, 13, '#8a93a6');
      this.T(`${TEAMS[r.h].abbr} – ${TEAMS[r.a].abbr}`, x0 + 130, y, 15);
      this.T(`${r.hg}:${r.ag}${r.suf}`, x0 + 330, y, 16, col);
      this.T(my > op ? 'VÝHRA' : 'PROHRA', x0 + 440, y, 13, col);
    });
    // menu
    const it = this.hubItems();
    R.panel(x1, 104, 590, 656, 0.85);
    it.forEach(([, label], i) => {
      const y = 140 + i * 48;
      if (i === this.sel) this.hl(x1 + 14, y - 21, 562, 42);
      this.T(label, x1 + 34, y, i === this.sel ? 20 : 18, i === this.sel ? ACC : '#fff', 'left', '800');
    });
    if (c.phase === 'season') this.T(this.windowOpen() ? 'Přestupní okno je otevřené' : 'Přestupní okno je zavřené', x1 + 295, 740, 13, this.windowOpen() ? '#7dff8a' : '#ff9a7a', 'center');
    this.footer('↑↓ výběr   A potvrdit   B uložit a odejít');
  },
  drawTable() {
    const c = this.c, st = this.standings(), x0 = R.W / 2 - 620;
    R.chromeText(CONF_NAMES[TEAMS[c.user].conf], R.W / 2, 40, 36);
    R.panel(x0, 74, 860, 676, 0.9);
    const cols = [['#', 30], ['TÝM', 70], ['Z', 420], ['V', 480], ['VP', 540], ['PP', 600], ['P', 660], ['SKÓRE', 730], ['B', 820]];
    cols.forEach(([h, x]) => this.T(h, x0 + x, 94, 13, '#8fa6c8', h === 'TÝM' ? 'left' : 'center'));
    st.forEach((ti, i) => {
      const t = c.table[ti], y = 122 + i * 39, me = ti === c.user;
      if (me) this.hl(x0 + 10, y - 17, 840, 34);
      if (i === 8) { R.ctx.fillStyle = 'rgba(255,255,255,0.35)'; R.ctx.fillRect(x0 + 10, y - 20, 840, 2); }
      App.teamLogo(TEAMS[ti], x0 + 55, y, 0.17);
      const vals = [i + 1, null, t.gp, t.w, t.otw, t.otl, t.l, `${t.gf}:${t.ga}`, t.pts];
      vals.forEach((v, k) => { if (v != null) this.T(v, x0 + cols[k][1], y, 15, me ? ACC : '#fff', 'center'); });
      this.T(this.teamName(ti), x0 + 72, y, 15, me ? ACC : '#fff');
    });
    this.drawResultsBox(x0 + 880, 74, 360, 400, true);
    R.panel(x0 + 880, 490, 360, 260, 0.85);
    ['Výhra 3 body, výhra po prodloužení', 'nebo nájezdech 2 b., prohra po', 'prodloužení či nájezdech 1 b.', '', 'Prvních 8 týmů konference', 'postupuje do play-off.']
      .forEach((l, i) => this.T(l, x0 + 900, 524 + i * 26, 14, '#cfd8ea'));
    this.footer('A / B zpět');
  },
  drawResultsBox(x, y, w, h, oneCol) {
    const c = this.c, ld = c.lastDay;
    R.panel(x, y, w, h, 0.85);
    this.T(ld ? 'POSLEDNÍ DEN: ' + ld.label : 'ZATÍM SE NEHRÁLO', x + 20, y + 22, 15, ACC);
    if (ld) ld.results.forEach((r, i) => {
      const col = oneCol ? 0 : i % 2, row = oneCol ? i : Math.floor(i / 2), xx = x + 20 + col * (w / 2), yy = y + 54 + row * (oneCol ? 38 : 28), me = r.h === c.user || r.a === c.user;
      this.T(`${TEAMS[r.h].abbr} – ${TEAMS[r.a].abbr}   ${r.hg}:${r.ag}${r.suf}`, xx, yy, 15, me ? ACC : '#fff');
    });
  },
  bracketBox(x, y, a, b, sc, w, wa, wb) {
    const c = this.c;
    R.panel(x, y, 230, 64, 0.9);
    [[a, 0, wa], [b, 1, wb]].forEach(([ti, k, n]) => {
      if (ti == null) { this.T('?', x + 16, y + 18 + k * 28, 15, '#8a93a6'); return; }
      const won = w === ti, me = ti === c.user;
      this.T(TEAMS[ti].city, x + 16, y + 18 + k * 28, 15, me ? ACC : won ? '#7dff8a' : '#fff');
      if (n != null) this.T(n, x + 214, y + 18 + k * 28, 16, won ? '#7dff8a' : '#fff', 'right');
    });
    if (sc) this.T(sc, x + 115, y + 76, 12, '#cfd8ea', 'center');
  },
  drawCup() {
    const c = this.c;
    R.chromeText('POHÁR', R.W / 2, 44, 44);
    const xs = [R.W / 2 - 520, R.W / 2 - 115, R.W / 2 + 290];
    ROUND_NAMES.forEach((n, k) => this.T(n, xs[k] + 115, 100, 16, '#8fa6c8', 'center', '800'));
    const rounds = c.cup.rounds;
    for (let k = 0; k < 3; k++) {
      const cnt = [4, 2, 1][k], gap = 640 / cnt;
      for (let i = 0; i < cnt; i++) {
        const m = rounds[k] && rounds[k][i], y = 130 + gap * i + gap / 2 - 40;
        this.bracketBox(xs[k], y, m ? m.a : null, m ? m.b : null, m && m.s, m && m.w);
      }
    }
    if (c.cup.winner != null) this.T(`VÍTĚZ POHÁRU: ${this.teamName(c.cup.winner)}`, R.W / 2, 740, 20, ACC, 'center', '800');
    else this.T('Čtvrtfinále po 10. kole ligy, semifinále po 20., finále po 30. kole. Jeden zápas, při remíze prodloužení a nájezdy.', R.W / 2, 740, 13, '#cfd8ea', 'center');
    this.footer('A / B zpět');
  },
  drawPo() {
    const c = this.c;
    R.chromeText('PLAY-OFF', R.W / 2, 44, 44);
    const xs = [R.W / 2 - 520, R.W / 2 - 115, R.W / 2 + 290];
    ROUND_NAMES.forEach((n, k) => this.T(n, xs[k] + 115, 100, 16, '#8fa6c8', 'center', '800'));
    for (let k = 0; k < 3; k++) {
      const cnt = [4, 2, 1][k], gap = 640 / cnt;
      for (let i = 0; i < cnt; i++) {
        const s = c.po.rounds[k] && c.po.rounds[k][i], y = 130 + gap * i + gap / 2 - 40;
        this.bracketBox(xs[k], y, s ? s.a : null, s ? s.b : null, s && s.games.join('  '), s && s.w, s ? s.wa : null, s ? s.wb : null);
      }
    }
    if (c.po.champion != null) this.T(`MISTR LIGY: ${this.teamName(c.po.champion)}`, R.W / 2, 740, 20, ACC, 'center', '800');
    else this.T('Série na 2 vítězství. Vyšší nasazený hraje doma 1. a 3. zápas.', R.W / 2, 740, 13, '#cfd8ea', 'center');
    this.footer('A / B zpět');
  },
  playerRow(p, y, x0, cols, me, extra) {
    const a = p.at, G = p.role === 'G';
    this.ensureBody(p);
    const vals = [p.role, p.num, p.first + ' ' + p.name, p.age, p.cm + ' / ' + p.kg, G ? a.REF : a.SIL, a.RYC, G ? '–' : a.PRE, a.STA, plOvr(p), money(plValue(p)).replace(' mil. Kč', ' M')];
    drawFlag(R.ctx, natOf(p), x0 + cols[2], y - 7, 20, 13);
    vals.forEach((v, k) => this.T(v, x0 + cols[k] + (k === 2 ? 26 : 0), y, k === 4 ? 13 : 14, k === 9 ? ACC : k === 4 ? '#cfd8ea' : p.inj > 0 && k === 2 ? '#ff9a7a' : me ? ACC : '#fff', k === 2 ? 'left' : 'center'));
    if (p.inj > 0) this.injTag(p, x0 + cols[2] + 152, y);
    const tr = traitOf(p), fm = p.form || 0;
    if (tr) this.T('★ ' + TRAITS[tr], x0 + cols[3] - 34, y, 10, ACC, 'right');
    if (Math.abs(fm) > 0.01) this.T(fm > 0 ? '▲' : '▼', x0 + cols[3] - 22, y, 12, fm > 0 ? '#7dff8a' : '#ff7a5a', 'center');
    if (extra) extra.forEach(([v, x]) => this.T(v, x0 + x, y, 14, '#cfd8ea', 'center'));
  },
  // starší uložené kariéry nemají výšku a váhu: dopočítat (stabilně podle jména a čísla)
  ensureBody(p) {
    if (p.kg && p.cm) return;
    let h = 7; for (const ch of String(p.name) + p.num) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    Object.assign(p, playerBody(p.role, p.at.SIL, mulberry32(h)));
  },
  injTag(p, x, y) {
    const t = `+ ZRANĚN (${p.inj})`, ctx = R.ctx;
    ctx.font = font(11, 'bold'); const w = ctx.measureText(t).width + 12;
    ctx.fillStyle = 'rgba(200,40,40,0.85)'; ctx.fillRect(x, y - 9, w, 18);
    this.T(t, x + 6, y + 1, 11, '#fff', 'left', 'bold');
  },
  drawRosterC() {
    const c = this.c, rows = this.rosterRows(), x0 = R.W / 2 - 600;
    R.chromeText('SOUPISKA A SESTAVA', R.W / 2, 34, 34);
    this.T(`Rozpočet ${money(c.budget[c.user])}`, R.W / 2, 64, 14, '#8fa6c8', 'center');
    R.panel(x0, 78, 1200, 682, 0.9);
    const cols = [40, 85, 120, 382, 448, 520, 580, 640, 700, 770, 855];
    ['POZ', '#', 'JMÉNO', 'VĚK', 'CM / KG', 'SÍL/REF', 'RYC', 'PŘE', 'STA', 'CELK', 'CENA'].forEach((h, k) => this.T(h, x0 + cols[k], 96, 12, '#8fa6c8', k === 2 ? 'left' : 'center'));
    ['Z', 'G', 'A', 'B'].forEach((h, k) => this.T(h, x0 + 950 + k * 58, 96, 12, '#8fa6c8', 'center'));
    let y = 118; const rh = rows.length > 17 ? 23 : 27, capId = c.teams[c.user].cap;
    rows.forEach((p, i) => {
      if (i % 5 === 0 && i < 15) { this.T(`${i / 5 + 1}. FORMACE`, x0 + 14, y + 2, 12, ACC); y += rh > 23 ? 20 : 16; }
      if (i === 15) { this.T('BRANKÁŘI', x0 + 14, y + 2, 12, ACC); y += rh > 23 ? 20 : 16; }
      if (i === this.farmFrom) { this.T('FARMA (draft, náhradníci) – prohoď s hráčem ve formaci', x0 + 14, y + 2, 12, '#8fa6c8'); y += 16; }
      if (i === this.sel) this.hl(x0 + 8, y - rh / 2, 1184, rh);
      if (this.mark === p) { R.ctx.strokeStyle = '#7dff8a'; R.ctx.lineWidth = 3; R.ctx.strokeRect(x0 + 8, y - rh / 2, 1184, rh); }
      const st = p.st, G = p.role === 'G';
      this.playerRow(p, y, x0, cols, false, G ? [[st.gp, 950], [st.sa ? (st.sv / st.sa * 100).toFixed(1) + '%' : '–', 1037]] : [[st.gp, 950], [st.g, 1008], [st.a, 1066], [st.g + st.a, 1124]]);
      if (p.id === capId) this.T('C', x0 + 106, y, 13, ACC, 'center', '800');
      y += rh;
    });
    const inj = this.injured(c.user);
    if (inj.length) this.T('Zraněné hráče v zápase nahradí hráč z nižší formace, chybějící místo zaplní junior z farmy.', R.W / 2, 754, 12, '#ff9a7a', 'center');
    this.footer(this.mark ? 'Vyber druhého hráče na stejném postu → prohodí se formace   B zrušit' : 'A vybrat hráče a prohodit formace   X kapitán   Y seřadit formace podle síly   B zpět');
  },
  drawMarket() {
    const c = this.c, role = POS_ORDER[this.role || 0], list = this.market(role), x0 = R.W / 2 - 600;
    R.chromeText('PŘESTUPY', R.W / 2, 34, 34);
    this.T(`◄  POST: ${ROLE_NAMES[role].toUpperCase()}  ►      Rozpočet ${money(c.budget[c.user])}      ${this.windowOpen() ? 'okno OTEVŘENÉ' : 'okno ZAVŘENÉ'}`, R.W / 2, 66, 15, '#8fa6c8', 'center');
    R.panel(x0, 82, 1200, 640, 0.9);
    const cols = [40, 85, 120, 382, 448, 520, 580, 640, 700, 770, 855];
    ['POZ', '#', 'JMÉNO', 'VĚK', 'CM / KG', 'SÍL/REF', 'RYC', 'PŘE', 'STA', 'CELK', 'CENA'].forEach((h, k) => this.T(h, x0 + cols[k], 100, 12, '#8fa6c8', k === 2 ? 'left' : 'center'));
    this.T('KLUB', x0 + 1000, 100, 12, '#8fa6c8', 'center');
    list.slice(this.scroll, this.scroll + 15).forEach((o, i) => {
      const y = 128 + i * 38, idx = this.scroll + i;
      if (idx === this.sel) this.hl(x0 + 8, y - 17, 1184, 34);
      this.playerRow(o.p, y, x0, cols, false, [[o.ti < 0 ? 'volný hráč' : TEAMS[o.ti].abbr + (o.p.line === 0 ? ' (1. f.)' : ''), 1000]]);
    });
    if (list.length > 15) this.T(`${this.sel + 1} / ${list.length}`, x0 + 1170, 706, 12, '#8a93a6', 'right');
    this.footer('◄► post   ↑↓ hráč   A koupit (dáš za něj svého hráče na stejném postu + doplatek)   B zpět');
  },
  drawSwap() {
    const c = this.c, t = this.target, mine = this.mySameRole(), x0 = R.W / 2 - 520;
    R.chromeText('PŘESTUP', R.W / 2, 44, 40);
    R.panel(x0, 80, 1040, 150, 0.9);
    this.ensureBody(t.p); this.T(`Chceš: #${t.p.num} ${t.p.first} ${t.p.name} (${ROLE_NAMES[t.p.role]}, ${t.p.age} let, ${t.p.cm} cm, ${t.p.kg} kg) – ${t.ti < 0 ? 'volný hráč' : this.teamName(t.ti)}`, x0 + 24, 116, 18, '#fff');
    this.T(`Celkem ${plOvr(t.p)}   •   hodnota ${money(plValue(t.p))}   •   tvůj rozpočet ${money(c.budget[c.user])}`, x0 + 24, 152, 15, '#8fa6c8');
    this.T('Vyber, kterého svého hráče na stejném postu dáš na výměnu:', x0 + 24, 194, 15, ACC);
    R.panel(x0, 244, 1040, 80 + mine.length * 52, 0.9);
    mine.forEach((p, i) => {
      const y = 280 + i * 52, fee = this.fee(t.p, t.ti, p), can = fee <= c.budget[c.user];
      if (i === this.sel) this.hl(x0 + 10, y - 22, 1020, 44);
      this.ensureBody(p); this.T(`${p.line + 1}. f.  #${p.num} ${p.first} ${p.name}  (${p.age} let, ${p.cm} cm / ${p.kg} kg, celkem ${plOvr(p)}, hodnota ${money(plValue(p))})`, x0 + 24, y, 16);
      this.T(fee >= 0 ? `doplatíš ${money(fee)}` : `dostaneš ${money(-fee)}`, x0 + 1016, y, 16, can ? '#7dff8a' : '#ff7a5a', 'right');
    });
    const y = 280 + mine.length * 52;
    if (this.sel === mine.length) this.hl(x0 + 10, y - 22, 1020, 44);
    this.T('ZPĚT NA TRH', x0 + 24, y, 16, '#cfd8ea');
    this.footer('A potvrdit přestup   B zpět');
  },
  drawStats() {
    const c = this.c, x0 = R.W / 2 - 600;
    R.chromeText('STATISTIKY SEZÓNY', R.W / 2, 34, 34);
    const all = c.teams.flatMap((t) => t.players.map((p) => ({ p, t: t.idx })));
    const sk = all.filter((o) => o.p.role !== 'G').sort((a, b) => (b.p.st.g + b.p.st.a) - (a.p.st.g + a.p.st.a) || b.p.st.g - a.p.st.g).slice(0, 18);
    const gk = all.filter((o) => o.p.role === 'G' && o.p.st.sa > 0).sort((a, b) => b.p.st.sv / b.p.st.sa - a.p.st.sv / a.p.st.sa).slice(0, 8);
    R.panel(x0, 64, 720, 696, 0.9); R.panel(x0 + 740, 64, 460, 400, 0.9);
    this.T('KANADSKÉ BODOVÁNÍ', x0 + 20, 88, 16, ACC);
    ['HRÁČ', 'TÝM', 'Z', 'G', 'A', 'B', 'TM'].forEach((h, k) => this.T(h, x0 + [20, 330, 420, 480, 540, 600, 670][k], 116, 12, '#8fa6c8', k ? 'center' : 'left'));
    sk.forEach((o, i) => {
      const y = 144 + i * 33, s = o.p.st, me = o.t === c.user;
      this.T(`${i + 1}. ${o.p.first} ${o.p.name}`, x0 + 20, y, 15, me ? ACC : '#fff');
      [TEAMS[o.t].abbr, s.gp, s.g, s.a, s.g + s.a, s.pim].forEach((v, k) => this.T(v, x0 + [330, 420, 480, 540, 600, 670][k], y, 15, me ? ACC : '#fff', 'center'));
    });
    this.T('BRANKÁŘI (ÚSPĚŠNOST)', x0 + 760, 88, 16, ACC);
    gk.forEach((o, i) => {
      const y = 124 + i * 36, s = o.p.st, me = o.t === c.user;
      this.T(`${i + 1}. ${o.p.first} ${o.p.name} (${TEAMS[o.t].abbr})`, x0 + 760, y, 15, me ? ACC : '#fff');
      this.T((s.sv / s.sa * 100).toFixed(1) + ' %', x0 + 1180, y, 15, me ? ACC : '#fff', 'right');
    });
    R.panel(x0 + 740, 480, 460, 280, 0.9);
    this.T('SÍŇ SLÁVY', x0 + 760, 504, 16, ACC);
    c.history.slice(-7).reverse().forEach((h, i) => this.T(`${h.season}: mistr ${TEAMS[h.champ].abbr}, pohár ${TEAMS[h.cup].abbr}, my ${h.rank}.`, x0 + 760, 540 + i * 30, 14));
    if (!c.history.length) this.T('Zatím žádná dokončená sezóna.', x0 + 760, 540, 14, '#8a93a6');
    this.footer('A / B zpět');
  },
  drawNews() {
    const c = this.c, x0 = R.W / 2 - 560;
    R.chromeText('ZPRÁVY', R.W / 2, 40, 40);
    R.panel(x0, 76, 1120, 680, 0.9);
    c.news.slice(0, 21).forEach((n, i) => this.T(n, x0 + 24, 104 + i * 31, 15, i === 0 ? ACC : '#fff'));
    this.footer('A / B zpět');
  },
  drawResult() {
    const c = this.c, ld = c.lastDay, u = c.user;
    R.chromeText(ld ? ld.label : 'VÝSLEDKY', R.W / 2, 50, 40);
    const mine = ld && ld.results.find((r) => r.h === u || r.a === u);
    if (mine) {
      const my = mine.h === u ? mine.hg : mine.ag, op = mine.h === u ? mine.ag : mine.hg;
      R.panel(R.W / 2 - 400, 90, 800, 220, 0.92);
      App.teamLogo(TEAMS[mine.h], R.W / 2 - 250, 190, 0.6); App.teamLogo(TEAMS[mine.a], R.W / 2 + 250, 190, 0.6);
      R.chromeText(`${mine.hg} : ${mine.ag}`, R.W / 2, 180, 72);
      this.T(mine.suf.trim() === 'SN' ? 'PO NÁJEZDECH' : mine.suf.trim() === 'PP' ? 'PO PRODLOUŽENÍ' : '', R.W / 2, 240, 16, '#cfd8ea', 'center');
      this.T(my > op ? 'VÝHRA!' : 'PROHRA', R.W / 2, 280, 26, my > op ? '#7dff8a' : '#ff7a5a', 'center', '800');
    }
    this.drawResultsBox(R.W / 2 - 400, 330, 800, 200);
    if (c.phase === 'season' || c.phase === 'playoffs') this.T(`Tvůj tým je ${this.myPos()}. v tabulce (${c.table[u].pts} b.)`, R.W / 2, 560, 18, '#8fa6c8', 'center');
    if (c.phase === 'playoffs' && c.po) this.T(`Play-off: ${ROUND_NAMES[c.po.round]}`, R.W / 2, 592, 16, '#cfd8ea', 'center');
    if (c.phase === 'offseason') this.T('Sezóna skončila!', R.W / 2, 600, 22, ACC, 'center', '800');
    (ld && ld.inj || []).forEach((q, i) => this.T(`ZRANĚNÍ: #${q.num} ${q.name} – ${q.injName}, mimo ${q.games} ${gamesWord(q.games)}`, R.W / 2, 640 + i * 28, 16, '#ff9a7a', 'center'));
    this.footer('A pokračovat');
  },
  drawDraft() {
    const c = this.c, D = c.draft, x0 = R.W / 2 - 600;
    R.chromeText('DRAFT ' + this.seasonStr(), R.W / 2, 36, 38);
    if (!D) return;
    this.T(`Vybíráš ${D.pos + 1}. volbou (slabší tým vybírá dřív). Vybraný hráč jde na farmu, do sestavy ho dostaneš prohozením na soupisce.`, R.W / 2, 72, 14, '#8fa6c8', 'center');
    R.panel(x0, 88, 820, 672, 0.9);
    const cols = [40, 85, 120, 382, 448, 520, 580, 640, 700, 770];
    ['POZ', '#', 'JMÉNO', 'VĚK', 'CM / KG', 'SÍL/REF', 'RYC', 'PŘE', 'STA', 'CELK'].forEach((h, k) => this.T(h, x0 + cols[k], 106, 12, '#8fa6c8', k === 2 ? 'left' : 'center'));
    this.T('POT.', x0 + 808, 106, 12, '#8fa6c8', 'right');
    const pool = D.pool.slice().sort((a, b) => b.pot - a.pot).slice(0, 14);
    pool.forEach((p, i) => {
      const y = 134 + i * 44;
      if (i === this.sel) this.hl(x0 + 8, y - 19, 804, 38);
      const a = p.at, G = p.role === 'G'; this.ensureBody(p);
      drawFlag(R.ctx, natOf(p), x0 + cols[2], y - 7, 20, 13);
      [p.role, p.num, p.first + ' ' + p.name, p.age, p.cm + ' / ' + p.kg, G ? a.REF : a.SIL, a.RYC, G ? '–' : a.PRE, a.STA, plOvr(p)].forEach((v, k) => this.T(v, x0 + cols[k] + (k === 2 ? 26 : 0), y, k === 4 ? 13 : 15, k === 9 ? ACC : '#fff', k === 2 ? 'left' : 'center'));
      this.T(potName(p.pot), x0 + 806, y, 20, { A: '#4cff7a', B: '#b6ff5a', C: ACC, D: '#ff9a3a' }[potName(p.pot)], 'right', '800');
    });
    R.panel(x0 + 840, 88, 360, 672, 0.85);
    this.T('JIŽ VYBRÁNO', x0 + 860, 112, 15, ACC);
    D.picks.slice(-18).forEach((q, i) => this.T(`${q.pos}. ${TEAMS[q.ti].abbr}  ${q.name} (${q.role})`, x0 + 860, 144 + i * 33, 14, q.ti === c.user ? ACC : '#fff'));
    this.footer('↑↓ hráč   A vybrat   Y nevybírat nikoho   B zpět   •   Potenciál A–D: kam až může hráč vyrůst');
  },
  drawContracts() {
    const c = this.c, rows = this.contractRows(), x0 = R.W / 2 - 560, pay = this.payroll(c.user);
    R.chromeText('SMLOUVY A PLATY', R.W / 2, 36, 36);
    this.T(`Výplaty ${money(pay)} z platového stropu ${money(SAL_CAP)}   •   volné místo ${money(r1(SAL_CAP - pay))}`, R.W / 2, 70, 15, pay > SAL_CAP ? '#ff7a5a' : '#8fa6c8', 'center');
    R.panel(x0, 86, 1120, 674, 0.9);
    ['POZ', 'JMÉNO', 'VĚK', 'CELK', 'POT.', 'PLAT / ROK', 'SMLOUVA', 'POŽADUJE'].forEach((h, k) => this.T(h, x0 + [30, 80, 420, 500, 570, 700, 840, 1000][k], 104, 12, '#8fa6c8', k === 1 ? 'left' : 'center'));
    const top = Math.max(0, Math.min(this.sel - 10, rows.length - 22));
    rows.slice(top, top + 22).forEach((p, j) => {
      const i = top + j, y = 128 + j * 28;
      if (i === this.sel) this.hl(x0 + 8, y - 13, 1104, 26);
      const last = (p.yrs || 0) <= 1;
      this.T(p.role, x0 + 30, y, 14, '#cfd8ea', 'center');
      this.T(`${p.first} ${p.name}${p.id === c.teams[c.user].cap ? '  (C)' : ''}`, x0 + 80, y, 14, '#fff');
      this.T(p.age, x0 + 420, y, 14, '#fff', 'center'); this.T(plOvr(p), x0 + 500, y, 14, ACC, 'center'); this.T(potName(p.pot || 0), x0 + 570, y, 14, '#cfd8ea', 'center');
      this.T(money(p.sal || 0), x0 + 700, y, 14, '#fff', 'center');
      this.T(last ? 'POSLEDNÍ ROK' : `${p.yrs} roky`, x0 + 840, y, 14, last ? '#ff9a7a' : '#fff', 'center');
      this.T(money(this.askSal(p)), x0 + 1000, y, 14, '#cfd8ea', 'center');
    });
    this.footer('↑↓ hráč   X prodloužit o 1 rok   Y prodloužit o 3 roky   A/B zpět   •   Hráč s posledním rokem bez prodloužení v létě odejde.');
  },
  drawSummary() {
    const c = this.c, S = c.summary;
    R.chromeText('KONEC SEZÓNY ' + this.seasonStr(), R.W / 2, 60, 42);
    R.panel(R.W / 2 - 480, 100, 960, 560, 0.92);
    App.teamLogo(TEAMS[S.champ], R.W / 2, 220, 0.85);
    this.T(`MISTR LIGY: ${this.teamName(S.champ).toUpperCase()}`, R.W / 2, 320, 26, ACC, 'center', '800');
    const lines = [
      `Finalista: ${this.teamName(S.runner)}`,
      `Vítěz poháru: ${this.teamName(S.cup)}`,
      `Tvůj tým: ${S.rank}. místo v základní části${S.champ === c.user ? ' a MISTROVSKÝ TITUL!' : ''}${S.cup === c.user ? ' • VÍTĚZ POHÁRU!' : ''}`,
      S.scorer ? `Nejproduktivnější hráč: ${S.scorer.name} (${TEAMS[S.scorer.t].abbr}) ${S.scorer.g}+${S.scorer.a} = ${S.scorer.pts} b.` : '',
      S.goalie ? `Nejlepší brankář: ${S.goalie.name} (${TEAMS[S.goalie.t].abbr}) ${S.goalie.pct.replace('.', ',')} %` : '',
      `Rozpočet na příští sezónu: ${money(c.budget[c.user])}`,
    ];
    lines.forEach((l, i) => this.T(l, R.W / 2, 376 + i * 40, 18, i === 2 ? '#7dff8a' : '#fff', 'center'));
    R.chromeText(c.drafted ? 'A = DALŠÍ SEZÓNA' : 'A = DRAFT A DALŠÍ SEZÓNA', R.W / 2, 700, 32, '#fff8d0', ACC);
    this.footer('Hráči zestárnou o rok: mladí se zlepší, starší zpomalí, nejstarší mohou ukončit kariéru.   B zpět');
  },
});
