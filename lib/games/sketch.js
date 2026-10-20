'use strict';
// Sketch It: one player draws a word, everybody else types guesses.
const data = require('../data');
const { pick, int } = require('../util');

const FAST = process.env.BOOMBOX_TEST_FAST === '1';
const TURN_MS = FAST ? 6000 : 75000;
const BETWEEN_MS = FAST ? 300 : 5000;

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9À-￿]/g, '');

function maskHint(word, reveal) {
  const idx = [];
  for (let i = 0; i < word.length; i++) if (/\S/.test(word[i])) idx.push(i);
  const shown = new Set();
  const order = idx.slice().sort((a, b) => ((a * 7 + word.length) % 11) - ((b * 7 + word.length) % 11));
  for (let k = 0; k < reveal && k < order.length - 1; k++) shown.add(order[k]);
  return word.split('').map((ch, i) => (ch === ' ' ? ' ' : shown.has(i) ? ch : '_')).join('');
}

function beginTurn(room, g) {
  room.clearTimers();
  if (g.turn >= g.total) { g.phase = 'end'; room.broadcast(); return; }
  // the drawer rotates through the roster, skipping players who are offline
  let drawer = null;
  for (let k = 0; k < g.players.length; k++) {
    const cand = g.players[(g.turn + k) % g.players.length];
    if (room.player(cand) && room.player(cand).res) { drawer = cand; break; }
  }
  if (!drawer) { g.phase = 'end'; room.broadcast(); return; }
  const pool = data.allWords(data.get(room.lang));
  let left = pool.filter((w) => g.used.indexOf(w) === -1);
  if (!left.length) { g.used = []; left = pool; }
  g.word = pick(left); g.used.push(g.word);
  g.drawer = drawer; g.guessed = {}; g.strokes = []; g.phase = 'draw';
  g.endsAt = Date.now() + TURN_MS; g.reveal = 0;
  const token = ++g.token;
  g.hint = maskHint(g.word, 0);
  room.later(() => { if (g.token === token && g.phase === 'draw') { g.reveal = 1; g.hint = maskHint(g.word, 1); room.broadcast(); } }, TURN_MS * 0.5);
  room.later(() => { if (g.token === token && g.phase === 'draw') { g.reveal = 2; g.hint = maskHint(g.word, 2); room.broadcast(); } }, TURN_MS * 0.75);
  room.later(() => { if (g.token === token) endTurn(room, g); }, TURN_MS);
  room.broadcast();
}
function endTurn(room, g) {
  if (g.phase !== 'draw') return;
  g.phase = 'between';
  room.clearTimers();
  const token = ++g.token;
  room.later(() => { if (g.token === token) { g.turn++; beginTurn(room, g); } }, BETWEEN_MS);
  room.broadcast();
}
function guessers(room, g) { return g.players.filter((id) => id !== g.drawer && room.player(id) && room.player(id).res); }

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

module.exports = {
  start(room, opts) {
    const ids = room.connectedIds();
    const rounds = int(opts.rounds, 1, 4, 2);
    const g = {
      type: 'sketch', phase: 'draw', players: ids, total: ids.length * rounds, turn: 0, scores: {}, used: [],
      drawer: null, word: '', hint: '', endsAt: 0, guessed: {}, strokes: [], token: 0, reveal: 0
    };
    ids.forEach((id) => { g.scores[id] = 0; });
    room.game = g;
    beginTurn(room, g);
  },
  act(room, g, pid, m) {
    if (g.phase === 'draw' && pid === g.drawer) {
      if (m.a === 'stroke') {
        const s = validStroke(m.s); if (!s) return;
        if (g.strokes.length < 4000) g.strokes.push(s);
        room.sendOthers(pid, { t: 'stroke', s });
        return;
      }
      if (m.a === 'clear') { g.strokes = []; room.sendOthers(pid, { t: 'clear' }); return; }
    }
    if (m.a === 'guess' && g.phase === 'draw' && pid !== g.drawer && g.players.indexOf(pid) !== -1 && !g.guessed[pid]) {
      const text = String(m.text || '').slice(0, 40).trim(); if (!text) return;
      if (norm(text) === norm(g.word)) {
        const left = Math.max(0, g.endsAt - Date.now());
        const pts = Math.round(100 + 400 * left / TURN_MS);
        g.guessed[pid] = pts; g.scores[pid] = (g.scores[pid] || 0) + pts; g.scores[g.drawer] = (g.scores[g.drawer] || 0) + 60;
        room.sendAll({ t: 'chat', who: pid, ok: true });
        if (guessers(room, g).every((id) => g.guessed[id])) endTurn(room, g); else room.broadcast();
      } else {
        room.sendAll({ t: 'chat', who: pid, text });
      }
      return;
    }
    if (m.a === 'skip' && room.hostId === pid && g.phase === 'draw') { endTurn(room, g); return; }
    if (m.a === 'again' && room.hostId === pid && g.phase === 'end') {
      const rounds = Math.max(1, Math.round(g.total / g.players.length));
      this.start(room, { rounds });
      room.broadcast();
    }
  },
  onConnect(room, g, pid) {
    if (g.phase === 'draw' && g.strokes.length) room.send(pid, { t: 'strokes', list: g.strokes });
  },
  onChange(room, g) {
    if (g.phase === 'draw') {
      const dr = room.player(g.drawer);
      if (!dr || !dr.res) { endTurn(room, g); return; }
      const gs = guessers(room, g);
      if (gs.length && gs.every((id) => g.guessed[id])) endTurn(room, g);
    }
  },
  view(room, g, pid) {
    const revealWord = pid === g.drawer || g.phase === 'between' || g.phase === 'end';
    return {
      type: 'sketch', phase: g.phase, turn: g.turn + 1, total: g.total, drawer: g.drawer, players: g.players,
      word: revealWord ? g.word : null, hint: g.hint, endsAt: g.endsAt, guessed: Object.keys(g.guessed), scores: g.scores
    };
  }
};
