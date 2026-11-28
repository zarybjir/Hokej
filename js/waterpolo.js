'use strict';
// ---------- Vodní pólo ----------
// Staví na fotbalu (rozehrání, míč mimo hřiště, penalty), liší se: plavání a hody vzduchem,
// útočný čas 30 s, vyloučení na 20 s místo karet, čtyři čtvrtiny, při remíze rovnou penalty.
// Zjednodušení: 5 hráčů v poli a brankář (stejné sestavy jako ostatní sporty).
class WaterPolo extends Football {
  constructor(cfg) {
    super({ ...cfg, sport: 'polo', ot: 'off' });
    this.q = 1; this.perLabel = '1.'; this.sc = 30; this.penLen = 20;
    this.showBanner('1. ČTVRTINA', this.teams[0].def.city + ' vs ' + this.teams[1].def.city, 2.2);
  }
  showBanner(text, sub, dur, color) {
    const M = { 'ROHOVÝ KOP': 'ROH', 'KOP OD BRANKY': 'HOD OD BRANKY', 'VOLNÝ KOP': 'VOLNÝ HOD', 'PENALTA': 'PĚTIMETROVÝ HOD' };
    super.showBanner(M[text] || String(text).replace(/\d\. (TŘETINA|POLOČAS)/, (this.q || 1) + '. ČTVRTINA'), sub, dur, color);
  }
  say(text, prio, chance) {
    const skip = (t) => (typeof t === 'string' && /třetin|poločas|Rohový kop|karta/.test(t) ? null : t);
    super.say(Array.isArray(text) ? text.map(skip) : skip(text), prio, chance);
  }
  // přihrávky letí vzduchem; souboj o míč je jen výpad rukou (žádný skluz)
  passTo(p, tx, ty, saucer, m) { super.passTo(p, tx, ty, true, m); }
  slide(p) { Game.prototype.poke.call(this, p); }
  save(g, sp, onNet) { Game.prototype.save.call(this, g, sp, onNet); }
  // ---------- útočný čas ----------
  updatePuck(h) {
    super.updatePuck(h);
    const pk = this.puck;
    if (this.state !== 'play') return;
    const own = pk.owner || pk.held, T = own ? own.team : null;
    if (T && T !== this.scTeam) { this.scTeam = T; this.sc = 30; }   // nové držení míče
    if (pk.shot) this.sc = 30;                                       // po střele běží čas znovu
    else if (this.scTeam) this.sc -= h;
    if (this.sc <= 0) {
      const O = this.other(this.scTeam);
      this.rs = { kind: 'freekick', team: O, spot: [clamp(pk.x, -RINK.GOAL_X + 4, RINK.GOAL_X - 4), clamp(pk.y, -FB.HW + 3, FB.HW - 3)] };
      this.scTeam = O; this.sc = 30; this.stopBall(); this.whistle('ÚTOČNÝ ČAS VYPRŠEL');
    }
  }
  resolveFaceoff() { super.resolveFaceoff(); this.scTeam = this.cur.team; this.sc = 30; }
  // ---------- fauly: volný hod, vyloučení na 20 s, pětimetrový hod ----------
  foul(off, victim, type) {
    if (this.state !== 'play' || off.isGoalie || off.inBox || !this.penOn) return;
    if (off.ctrl < 0 && off.team.humans.length && Math.random() < 0.6) return;
    const T = victim.team, s = T.dir, had = this.puck.owner === victim;
    this.fouls = (this.fouls || 0) + 1; off.team.pim++;
    const in5 = s * victim.x > RINK.GOAL_X - 16 && s * victim.x < RINK.GOAL_X && Math.abs(victim.y) < 20;
    this.stopBall();
    if (in5 && had && Math.random() < 0.5) {
      this.pens = (this.pens || 0) + 1; this.startPenaltyShot(T, victim, off, 'trip');
      this.lower = { title: '#' + off.num + ' ' + off.name.toUpperCase() + ' (' + off.team.def.abbr + ')', sub: 'FAUL — PĚTIMETROVÝ HOD', team: off.team, t: 0, dur: 3.2 };
      return;
    }
    const excl = (type === 'back' || Math.random() < 0.3) && this.outRoles(off.team).length < 2;
    if (excl) { this.assess({ team: off.team, player: off, type: 'rough' }); this.excl = (this.excl || 0) + 1; }
    this.lower = { title: '#' + off.num + ' ' + off.name.toUpperCase() + ' (' + off.team.def.abbr + ')', sub: excl ? 'VYLOUČENÍ NA 20 SEKUND' : 'FAUL — VOLNÝ HOD', team: off.team, t: 0, dur: 3.2 };
    this.rs = { kind: 'freekick', team: T, spot: [clamp(victim.x, -RINK.GOAL_X + 4, RINK.GOAL_X - 4), clamp(victim.y, -FB.HW + 3, FB.HW - 3)] };
    this.whistle(excl ? 'VYLOUČENÍ' : 'VOLNÝ HOD');
  }
  // ---------- čtvrtiny ----------
  endPeriod() {
    this.pending = null;
    const [a, b] = this.teams;
    if (this.q < 4) { this.state = 'periodEnd'; this.stateT = 0; return; }
    if (a.score !== b.score) return this.finish();
    return this.cfg.shootout !== false && !this.demo ? this.startShootout() : this.finish();
  }
  nextPeriod() {
    this.q++;
    if (this.q === 4) this.period = 2;   // jádro zná jen tři řádné části; čtvrtá čtvrtina se počítá jako třetí
    super.nextPeriod();
    this.perLabel = this.q + '.'; this.sc = 30;
  }
}
