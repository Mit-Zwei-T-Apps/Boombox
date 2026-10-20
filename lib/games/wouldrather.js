'use strict';
const data = require('../data');
const { shuffle } = require('../util');

function counts(g) {
  const c = {};
  Object.keys(g.votes).forEach((k) => { c[g.votes[k]] = (c[g.votes[k]] || 0) + 1; });
  return c;
}
function check(room, g) {
  const on = room.connectedIds();
  if (g.phase === 'ask' && on.length && on.every((id) => g.votes[id])) { g.phase = 'result'; room.broadcast(); return true; }
  return false;
}

module.exports = {
  start(room) {
    const d = data.get(room.lang);
    room.game = { type: 'wouldrather', phase: 'ask', order: shuffle(d.questions), i: 0, votes: {} };
  },
  act(room, g, pid, m) {
    const host = room.hostId === pid;
    if (m.a === 'vote' && g.phase === 'ask') {
      if (!room.player(m.target)) return;
      g.votes[pid] = m.target;
      if (!check(room, g)) room.broadcast();
      return;
    }
    if (m.a === 'reveal' && host && g.phase === 'ask') { g.phase = 'result'; room.broadcast(); return; }
    if (m.a === 'next' && host && g.phase === 'result') {
      g.i++;
      if (g.i >= g.order.length) { g.order = shuffle(g.order); g.i = 0; }
      g.phase = 'ask'; g.votes = {}; room.broadcast();
    }
  },
  onChange(room, g) { check(room, g); },
  view(room, g, pid) {
    const v = {
      type: 'wouldrather', phase: g.phase, n: g.i + 1, q: g.order[g.i], myVote: g.votes[pid] || null,
      voted: Object.keys(g.votes).filter((k) => room.player(k)).length, total: room.connectedIds().length
    };
    if (g.phase === 'result') v.counts = counts(g);
    return v;
  }
};
