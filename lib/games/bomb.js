'use strict';
const data = require('../data');
const { pick } = require('../util');

function nextHolder(room, from) {
  const ids = room.players.map((p) => p.id);
  const on = room.connectedIds();
  if (!on.length) return from;
  let i = ids.indexOf(from);
  for (let k = 0; k < ids.length; k++) {
    i = (i + 1) % ids.length;
    if (on.indexOf(ids[i]) !== -1) return ids[i];
  }
  return from;
}
function newPrompt(room, g) {
  const all = data.get(room.lang).bomb;
  let left = all.filter((p) => g.used.indexOf(p) === -1);
  if (!left.length) { g.used = []; left = all; }
  g.prompt = pick(left); g.used.push(g.prompt);
  const on = room.connectedIds();
  g.holder = pick(on); g.phase = 'ready';
}
function run(room, g) {
  g.phase = 'run';
  const total = (process.env.BOOMBOX_TEST_FAST === '1' ? 1.2 : 12 + Math.random() * 24) * 1000, start = Date.now(), token = ++g.token;
  const tick = () => {
    if (!room.game || room.game !== g || g.token !== token || g.phase !== 'run') return;
    const el = Date.now() - start;
    if (el >= total) {
      g.phase = 'boom'; g.loser = g.holder; g.scores[g.loser] = (g.scores[g.loser] || 0) + 1;
      room.broadcast(); return;
    }
    const r = el / total;
    room.sendAll({ t: 'tick', r });
    room.later(tick, Math.max(130, 900 - 760 * r));
  };
  room.later(tick, 700);
  room.broadcast();
}

module.exports = {
  start(room) {
    const g = { type: 'bomb', phase: 'ready', prompt: '', used: [], holder: null, scores: {}, loser: null, token: 0 };
    room.game = g; newPrompt(room, g);
  },
  act(room, g, pid, m) {
    if (m.a === 'arm' && room.hostId === pid && g.phase === 'ready') { run(room, g); return; }
    if (m.a === 'pass' && g.phase === 'run' && g.holder === pid) { g.holder = nextHolder(room, pid); room.broadcast(); return; }
    if (m.a === 'next' && room.hostId === pid && g.phase === 'boom') { newPrompt(room, g); room.broadcast(); }
  },
  onChange(room, g) {
    if (g.phase === 'run' && !(room.player(g.holder) && room.player(g.holder).res)) g.holder = nextHolder(room, g.holder);
  },
  view(room, g) {
    return { type: 'bomb', phase: g.phase, prompt: g.prompt, holder: g.holder, scores: g.scores, loser: g.loser };
  }
};
