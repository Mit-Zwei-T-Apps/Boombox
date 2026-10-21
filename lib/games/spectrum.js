'use strict';
// Spectrum: the psychic knows a hidden point between two opposites and gives a hint; the others place it.
const data = require('../data');
const { shuffle, int } = require('../util');

function guessers(room, g) { return g.players.filter((id) => id !== g.psychic && room.player(id) && room.player(id).res); }
function points(d) { return d <= 4 ? 4 : d <= 10 ? 3 : d <= 18 ? 2 : 0; }

function begin(room, g) {
  if (g.turn >= g.total) { g.phase = 'end'; room.broadcast(); return; }
  let psychic = null;
  for (let k = 0; k < g.players.length; k++) {
    const c = g.players[(g.turn + k) % g.players.length];
    if (room.player(c) && room.player(c).res) { psychic = c; break; }
  }
  if (!psychic) { g.phase = 'end'; room.broadcast(); return; }
  g.psychic = psychic; g.pair = g.order[g.turn % g.order.length];
  g.target = 5 + require('../util').rand(91); g.guesses = {}; g.gained = {}; g.phase = 'guess';
  room.broadcast();
}
function toResult(room, g) {
  if (g.phase !== 'guess') return;
  const gs = Object.keys(g.guesses);
  let sum = 0;
  gs.forEach((id) => { const p = points(Math.abs(g.guesses[id] - g.target)); g.gained[id] = p; g.scores[id] = (g.scores[id] || 0) + p; sum += p; });
  if (gs.length) { const pp = Math.round(sum / gs.length); g.gained[g.psychic] = pp; g.scores[g.psychic] = (g.scores[g.psychic] || 0) + pp; }
  g.phase = 'result';
  room.broadcast();
}
function check(room, g) {
  if (g.phase !== 'guess') return false;
  const gs = guessers(room, g);
  if (gs.length && gs.every((id) => g.guesses[id] !== undefined)) { toResult(room, g); return true; }
  return false;
}

module.exports = {
  start(room, opts) {
    const ids = room.connectedIds();
    const rounds = int(opts.rounds, 1, 4, 1);
    const order = shuffle(data.get(room.lang).spectrum);
    if (!order.length) { const e = new Error('bad_options'); e.status = 400; e.code = 'bad_options'; throw e; }
    const g = { type: 'spectrum', players: ids, order, total: ids.length * rounds, turn: 0, scores: {}, phase: 'guess', psychic: null, pair: null, target: 0, guesses: {}, gained: {} };
    ids.forEach((id) => { g.scores[id] = 0; });
    room.game = g;
    begin(room, g);
  },
  act(room, g, pid, m) {
    const host = room.hostId === pid;
    if (m.a === 'guess' && g.phase === 'guess' && pid !== g.psychic && g.players.indexOf(pid) !== -1) {
      const v = Number(m.value);
      if (!(v >= 0 && v <= 100)) return;
      g.guesses[pid] = Math.round(v);
      if (!check(room, g)) room.broadcast();
      return;
    }
    if (m.a === 'reveal' && host && g.phase === 'guess') { toResult(room, g); return; }
    if (m.a === 'next' && host && g.phase === 'result') { g.turn++; begin(room, g); return; }
    if (m.a === 'again' && host && g.phase === 'end') {
      this.start(room, { rounds: Math.max(1, Math.round(g.total / g.players.length)) });
      room.broadcast();
    }
  },
  onChange(room, g) {
    if (g.phase === 'guess') {
      const p = room.player(g.psychic);
      if (!p || !p.res) { g.turn++; begin(room, g); return; }
      check(room, g);
    }
  },
  view(room, g, pid) {
    const show = g.phase === 'result' || pid === g.psychic;
    return {
      type: 'spectrum', phase: g.phase, turn: g.turn + 1, total: g.total, players: g.players, psychic: g.psychic, pair: g.pair,
      target: show ? g.target : null, myGuess: g.guesses[pid] === undefined ? null : g.guesses[pid],
      submitted: Object.keys(g.guesses).length, need: guessers(room, g).length,
      guesses: g.phase === 'result' ? g.guesses : null, gained: g.phase === 'result' ? g.gained : null, scores: g.scores
    };
  }
};
