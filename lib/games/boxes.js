'use strict';
// Dots and boxes for 2 to 4 players. The rules live in public/boxes.js so the browser and the server agree.
const path = require('path');
const B = require(path.join(__dirname, '..', '..', 'public', 'boxes.js'));
const { int } = require('../util');

function advance(room, g) {
  // skip players who are offline
  for (let k = 0; k < g.players.length && !g.s.done; k++) {
    const p = room.player(g.players[g.s.turn]);
    if (p && p.res) return;
    g.s.turn = (g.s.turn + 1) % g.players.length;
  }
}
module.exports = {
  start(room, opts) {
    const ids = room.connectedIds().slice(0, 4);
    const g = { type: 'boxes', players: ids, opts: { n: int(opts.n, 3, 7, 5) }, s: null };
    g.s = B.create(g.opts.n, ids.length);
    room.game = g;
  },
  act(room, g, pid, m) {
    if (m.a === 'edge') {
      if (g.players[g.s.turn] !== pid || g.s.done) return;
      if (B.move(g.s, m.key) < 0) return;
      advance(room, g);
      room.broadcast();
      return;
    }
    if (m.a === 'again' && room.hostId === pid && g.s.done) { this.start(room, g.opts); room.broadcast(); }
  },
  onChange(room, g) {
    if (g.s.done) return;
    const before = g.s.turn; advance(room, g);
    if (before !== g.s.turn) room.broadcast();
  },
  view(room, g) {
    const s = g.s;
    return { type: 'boxes', phase: s.done ? 'end' : 'play', players: g.players, turn: g.players[s.turn], turnIdx: s.turn, board: s, winners: s.done ? B.winners(s).map((i) => g.players[i]) : [] };
  }
};
