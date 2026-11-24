'use strict';
// ---------- Výzvy a úspěchy (ukládají se v prohlížeči) ----------
const ACH_KEY = 'hokej98-ach';
const ACH = [
  ['goal', 'PRVNÍ GÓL', 'Vstřel gól hráčem, kterého řídíš.'],
  ['hat', 'HATTRICK', 'Jeden tvůj hráč dá v zápase 3 góly.'],
  ['win', 'PRVNÍ VÝHRA', 'Vyhraj zápas proti počítači.'],
  ['wins10', 'DESET VÝHER', 'Vyhraj 10 zápasů proti počítači.'],
  ['shut', 'ČISTÉ KONTO', 'Vyhraj zápas bez obdrženého gólu.'],
  ['hard', 'TĚŽKÝ SOUPEŘ', 'Vyhraj na obtížnost Těžká.'],
  ['legend', 'LEGENDA', 'Vyhraj na obtížnost Legenda.'],
  ['comeback', 'OBRAT', 'Vyhraj zápas, ve kterém jsi prohrával o 2 góly.'],
  ['pp', 'PŘESILOVKA', 'Dej gól v přesilovce.'],
  ['sh', 'V OSLABENÍ', 'Dej gól v oslabení.'],
  ['en', 'PRÁZDNÁ BRANKA', 'Dej gól do prázdné branky.'],
  ['sixer', 'ŠESTÝ HRÁČ', 'Dej gól s odvolaným brankářem.'],
  ['ot', 'NÁHLÁ SMRT', 'Rozhodni prodloužení svým gólem.'],
  ['ot1', 'Z PRVNÍ', 'Dej gól golfákem z první.'],
  ['tip', 'TEČ', 'Dej gól tečí před brankou.'],
  ['hit', 'TVRDÝ HIT', 'Rozdej tvrdý bodyček.'],
  ['so', 'NERVY ZE ŽELEZA', 'Vyhraj zápas v nájezdech.'],
  ['soGoal', 'PROMĚNĚNÝ NÁJEZD', 'Dej gól z nájezdu.'],
  ['soSave', 'BRANKÁŘ NA NÁJEZDY', 'Jako brankář zastav nájezd.'],
  ['three', '3 NA 3', 'Vyhraj zápas ve formátu 3 na 3.'],
  ['practice', 'TRÉNINK DĚLÁ MISTRA', 'Dej 10 gólů v tréninku střelby.'],
  ['zam', 'ROLBAŘ', 'Ukliď rolbou aspoň 95 % ledu.'],
  ['champ', 'MISTR LIGY', 'Vyhraj ligu v kariéře.'],
  ['cup', 'POHÁR', 'Vyhraj pohár v kariéře.'],
];
const Ach = {
  got: {}, cnt: {}, queue: [],
  load() { try { const d = JSON.parse(localStorage.getItem(ACH_KEY)) || {}; this.got = d.got || {}; this.cnt = d.cnt || {}; } catch (e) {} },
  save() { try { localStorage.setItem(ACH_KEY, JSON.stringify({ got: this.got, cnt: this.cnt })); } catch (e) {} },
  done() { return ACH.filter((a) => this.got[a[0]]).length; },
  unlock(id) {
    if (this.got[id]) return;
    const a = ACH.find((q) => q[0] === id); if (!a) return;
    this.got[id] = Date.now(); this.save();
    this.queue.push({ a, t: 0 });
    try { Sfx.tone(1318, 'triangle', 0.18, 0.005, 0.25); Sfx.tone(1760, 'triangle', 0.18, 0.005, 0.4, 0.12); } catch (e) {}
  },
  count(k, n = 1) { this.cnt[k] = (this.cnt[k] || 0) + n; this.save(); return this.cnt[k]; },
  // oznámení „VÝZVA SPLNĚNA" v pravém horním rohu
  draw(dt) {
    const q = this.queue[0]; if (!q) return;
    q.t += dt;
    const ctx = R.ctx, w = 430, h = 70, slide = clamp(q.t / 0.3, 0, 1) * clamp((3.6 - q.t) / 0.3, 0, 1), x = R.W - (w + 16) * slide, y = 70;
    R.panel(x, y, w, h, 0.95);
    ctx.fillStyle = ACC; ctx.fillRect(x, y, 6, h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(13, 'bold'); ctx.fillStyle = '#8fa6c8'; ctx.fillText('★ VÝZVA SPLNĚNA', x + 20, y + 18);
    ctx.font = font(20); ctx.fillStyle = '#fff'; ctx.fillText(q.a[1], x + 20, y + 40);
    ctx.font = font(12, 'bold'); ctx.fillStyle = '#cfd8ea'; ctx.fillText(q.a[2], x + 20, y + 60);
    if (q.t > 3.6) this.queue.shift();
  },
};
Ach.load();
