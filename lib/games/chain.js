'use strict';
// Doodle Chain: everybody starts a chain with a sentence. Each chain then travels from player to
// player, alternating between drawing the previous sentence and describing the previous drawing.
// At the end the chains are shown step by step.
const data = require('../data');
const { pick, int } = require('../util');

const FAST = process.env.BOOMBOX_TEST_FAST === '1';
const T = FAST ? { write: 3000, draw: 4000, grace: 400 } : { write: 50000, draw: 80000, grace: 3500 };

function validStroke(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.p) || s.p.length < 1 || s.p.length > 400) return null;
  const p = [];
  for (const pt of s.p) {
    if (!Array.isArray(pt) || pt.length !== 2) return null;
    const x = Number(pt[0]), y = Number(pt[1]);
    if (!(x >= 0 && x <= 1000 && y >= 0 && y <= 1000)) return null;
    p.push([Math.round(x), Math.round(y)]);
  }
  const c = typeof s.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.c) ? s.c : '#111111';
  return { c, w: int(s.w, 1, 40, 6), p };
}
const kindOf = (step) => (step % 2 === 0 ? 'text' : 'draw');
// the chain player number `pi` works on in step `s`
const chainOf = (g, pi, s) => ((pi - s) % g.n + g.n) % g.n;
function cleanText(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80); }

function beginStep(room, g) {
  room.clearTimers();
  g.phase = 'step'; g.cur = {}; g.sub = {};
  const kind = kindOf(g.step), dur = kind === 'text' ? T.write : T.draw;
  g.endsAt = Date.now() + dur;
  const token = ++g.token;
  if (g.step === 0) {
    const pool = data.allWords(data.get(room.lang));
    g.idea = pool.length ? pick(pool) : '';
  }
  room.later(() => { if (g.token === token && g.phase === 'step') endStep(room, g); }, dur + T.grace);
  room.broadcast();
}
function endStep(room, g) {
  if (g.phase !== 'step') return;
  room.clearTimers(); ++g.token;
  const kind = kindOf(g.step);
  g.players.forEach((pid, pi) => {
    const entry = { by: pid, kind };
    if (kind === 'text') entry.text = g.cur[pid] || ''; else entry.strokes = (g.cur[pid] || []).slice(0, 1500);
    g.chains[chainOf(g, pi, g.step)][g.step] = entry;
  });
  g.step++;
  if (g.step >= g.n) { g.phase = 'reveal'; g.show = { chain: 0, idx: 0 }; room.broadcast(); return; }
  beginStep(room, g);
}
function allDone(room, g) {
  const on = g.players.filter((id) => room.player(id) && room.player(id).res);
  return on.length > 0 && on.every((id) => g.sub[id]);
}

module.exports = {
  start(room) {
    const ids = room.connectedIds();
    const g = { type: 'chain', players: ids, n: ids.length, step: 0, chains: ids.map(() => []), cur: {}, sub: {}, endsAt: 0, token: 0, phase: 'step', show: null, idea: '' };
    room.game = g;
    beginStep(room, g);
  },
  act(room, g, pid, m) {
    const host = room.hostId === pid, inGame = g.players.indexOf(pid) !== -1;
    if (g.phase === 'step' && inGame) {
      const kind = kindOf(g.step);
      if (kind === 'text' && m.a === 'text') {
        const text = cleanText(m.text); if (!text) return;
        g.cur[pid] = text; g.sub[pid] = true;
        if (allDone(room, g)) endStep(room, g); else room.broadcast();
        return;
      }
      if (kind === 'draw' && !g.sub[pid]) {
        if (m.a === 'stroke') {
          const s = validStroke(m.s); if (!s) return;
          const list = g.cur[pid] || (g.cur[pid] = []);
          if (list.length < 1500) list.push(s);
          return;
        }
        if (m.a === 'clear') { g.cur[pid] = []; return; }
        if (m.a === 'done') { g.sub[pid] = true; if (allDone(room, g)) endStep(room, g); else room.broadcast(); return; }
      }
      if (m.a === 'skip' && host) { endStep(room, g); return; }
    }
    if (g.phase === 'step' && host && m.a === 'skip') { endStep(room, g); return; }
    if (g.phase === 'reveal' && host && m.a === 'next') {
      const s = g.show;
      if (s.idx < g.n - 1) s.idx++;
      else if (s.chain < g.n - 1) { s.chain++; s.idx = 0; }
      else g.phase = 'end';
      room.broadcast(); return;
    }
    if (g.phase === 'end' && host && m.a === 'again') { this.start(room); room.broadcast(); }
  },
  onChange(room, g) { if (g.phase === 'step' && allDone(room, g)) endStep(room, g); },
  view(room, g, pid) {
    const v = { type: 'chain', phase: g.phase, n: g.n, players: g.players, inGame: g.players.indexOf(pid) !== -1 };
    if (g.phase === 'step') {
      const pi = g.players.indexOf(pid), kind = kindOf(g.step);
      v.step = g.step + 1; v.turn = g.step + 1; v.kind = kind; v.endsAt = g.endsAt;
      v.done = Object.keys(g.sub);
      if (pi !== -1) {
        v.mine = !!g.sub[pid];
        if (g.step > 0) {
          const prev = g.chains[chainOf(g, pi, g.step)][g.step - 1];
          if (prev) v.prev = prev.kind === 'text' ? { kind: 'text', text: prev.text } : { kind: 'draw', strokes: prev.strokes };
        } else v.idea = g.idea;
      }
      return v;
    }
    const s = g.show || { chain: g.n - 1, idx: g.n - 1 };
    v.chain = s.chain; v.idx = s.idx; v.owner = g.players[s.chain];
    v.entries = g.chains[s.chain].slice(0, s.idx + 1);
    v.last = s.chain === g.n - 1 && s.idx === g.n - 1;
    v.turn = 100 + s.chain * 100 + s.idx;
    return v;
  }
};
