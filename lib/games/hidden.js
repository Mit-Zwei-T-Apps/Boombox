'use strict';
// Impostor (secret word) and Spy (secret place): one or more players do not know the secret.
const data = require('../data');
const { pick, shuffle, int } = require('../util');

function bad() { const e = new Error('bad_options'); e.status = 400; e.code = 'bad_options'; return e; }

module.exports = function (kind) {
  function tally(g) {
    const t = {};
    Object.keys(g.votes).forEach((v) => { const target = g.votes[v]; t[target] = (t[target] || 0) + 1; });
    return t;
  }
  function allVoted(room, g) {
    const on = g.players.filter((id) => room.player(id) && room.player(id).res);
    return on.length > 0 && on.every((id) => g.votes[id]);
  }
  function toResult(room, g) {
    g.phase = 'result';
    const t = tally(g);
    const max = Math.max(0, ...Object.values(t));
    const top = Object.keys(t).filter((k) => t[k] === max && max > 0);
    g.caught = top.length === 1 && g.imps.indexOf(top[0]) !== -1;
    room.broadcast();
  }

  return {
    start(room, opts) {
      const d = data.get(room.lang);
      const ids = room.connectedIds();
      let secret, catKey = null, realCat = null;
      if (kind === 'impostor') {
        catKey = opts.cat && d.words[opts.cat] ? opts.cat : null;
        const pool = catKey ? d.words[catKey].list : data.allWords(d);
        secret = pick(pool);
        const rk = Object.keys(d.words).find((k) => d.words[k].list.indexOf(secret) !== -1);
        realCat = rk ? d.words[rk].label : null;
      } else {
        secret = pick(d.places);
      }
      if (!secret) throw bad();
      const maxI = Math.max(1, Math.floor((ids.length - 1) / 2));
      const n = kind === 'spy' ? 1 : int(opts.n, 1, maxI, 1);
      const minutes = kind === 'spy' ? int(opts.minutes, 2, 20, 8) : 0;
      const prev = room.game && room.game.type === kind ? room.game.round : 0;
      room.game = {
        type: kind, phase: 'play', secret, catLabel: catKey ? d.words[catKey].label : null, realCat,
        imps: shuffle(ids).slice(0, n), starter: pick(ids), players: ids, votes: {},
        opts: { cat: catKey, n, minutes, tip: opts.tip !== false }, endsAt: minutes ? Date.now() + minutes * 60000 : 0, round: prev + 1, caught: false
      };
    },
    act(room, g, pid, m) {
      const host = room.hostId === pid, inGame = g.players.indexOf(pid) !== -1;
      if (m.a === 'startVote' && host && g.phase === 'play') { g.phase = 'vote'; room.broadcast(); return; }
      if (m.a === 'vote' && inGame && g.phase === 'vote') {
        if (g.players.indexOf(m.target) === -1 || m.target === pid) return;
        g.votes[pid] = m.target;
        if (allVoted(room, g)) toResult(room, g); else room.broadcast();
        return;
      }
      if (m.a === 'reveal' && host && g.phase !== 'result') { toResult(room, g); return; }
      if (m.a === 'again' && host && g.phase === 'result') { this.start(room, g.opts); room.broadcast(); }
    },
    onChange(room, g) { if (g.phase === 'vote' && allVoted(room, g)) toResult(room, g); },
    view(room, g, pid) {
      const inGame = g.players.indexOf(pid) !== -1, isImp = g.imps.indexOf(pid) !== -1;
      const v = {
        type: kind, phase: g.phase, round: g.round, inGame, players: g.players, starter: g.starter,
        endsAt: g.endsAt, myVote: g.votes[pid] || null,
        voted: Object.keys(g.votes).length, total: g.players.filter((id) => room.player(id) && room.player(id).res).length
      };
      if (inGame) {
        v.role = isImp ? 'imp' : 'crew';
        if (!isImp) v.secret = g.secret;
        if (isImp && kind === 'impostor' && g.opts.tip) { v.cat = g.realCat || g.catLabel; v.letter = String(g.secret).charAt(0).toUpperCase(); }
        else if (isImp && g.catLabel) v.cat = g.catLabel;
        if (kind === 'impostor' && !isImp) v.cat = g.catLabel;
      }
      if (g.phase === 'result') {
        v.res = { tally: tally(g), imps: g.imps, secret: g.secret, caught: g.caught, votes: g.votes };
      }
      return v;
    }
  };
};
