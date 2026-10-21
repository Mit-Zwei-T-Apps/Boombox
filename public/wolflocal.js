/* Local Werewolf bookkeeping: the phone is the moderator's notebook, so nobody has to remember who was chosen. */
window.TPWolf = (function () {
  'use strict';
  var NIGHT = ['cupid', 'guardian', 'wolves', 'seer', 'witch'];

  function create(assign, cfg) {
    var W = {
      players: assign.map(function (a) { return { name: a.name, role: a.role, alive: true, idiotOut: false }; }),
      cfg: cfg, night: 1, phase: 'night', step: null, lovers: null, potions: { heal: true, poison: true }, lastGuard: null,
      elderHit: false, powersOff: false, idiotShown: {}, hunterQ: [], log: [], act: {}, announce: [], winner: null, seer: null, after: null, last: null
    };
    startNight(W);
    return W;
  }
  function alive(W) { var o = []; W.players.forEach(function (p, i) { if (p.alive) o.push(i); }); return o; }
  function actors(W, step) {
    var role = { cupid: 'cupid', guardian: 'guardian', wolves: 'werewolf', seer: 'seer', witch: 'witch' }[step];
    if (W.powersOff && step !== 'wolves') return [];
    return alive(W).filter(function (i) { return W.players[i].role === role; });
  }
  function configured(W, s) {
    if (s === 'wolves') return true;
    if (s === 'cupid') return !!W.cfg.on.cupid && W.night === 1;
    return !!W.cfg.on[s];
  }
  function nextStep(W, cur) {
    var i = cur ? NIGHT.indexOf(cur) + 1 : 0;
    for (; i < NIGHT.length; i++) if (configured(W, NIGHT[i])) return NIGHT[i];
    return null;
  }
  function startNight(W) {
    W.phase = 'night'; W.act = { protect: null, victim: null, healed: false, poison: null }; W.seer = null; W.announce = [];
    W.step = nextStep(W, null);
    if (!W.step) resolveNight(W);
  }
  // data: { targets:[idx], heal:bool } for the current step
  function submit(W, data) {
    var s = W.step; data = data || {};
    var t = data.targets || [];
    if (s === 'cupid' && t.length === 2) W.lovers = [t[0], t[1]];
    if (s === 'guardian' && t.length === 1) { W.act.protect = t[0]; W.lastGuard = t[0]; }
    if (s === 'wolves' && t.length === 1) W.act.victim = t[0];
    if (s === 'seer' && t.length === 1) W.seer = { id: t[0], wolf: W.players[t[0]].role === 'werewolf' };
    if (s === 'witch') {
      if (data.heal && W.potions.heal && W.act.victim !== null) { W.act.healed = true; W.potions.heal = false; }
      if (t.length === 1 && W.potions.poison) { W.act.poison = t[0]; W.potions.poison = false; }
    }
    var nxt = nextStep(W, s);
    if (nxt) { W.step = nxt; W.seer = null; } else resolveNight(W);
  }
  function kill(W, i, cause, out) {
    var p = W.players[i]; if (!p.alive) return;
    p.alive = false; out.push(i);
    W.log.push({ k: cause === 'vote' ? 'elim' : 'died', n: W.night, id: i });
    if (p.role === 'hunter' && !W.powersOff) W.hunterQ.push(i);
    if (W.lovers && W.lovers.indexOf(i) !== -1) kill(W, W.lovers[0] === i ? W.lovers[1] : W.lovers[0], 'lover', out);
  }
  function win(W) {
    var al = alive(W), w = al.filter(function (i) { return W.players[i].role === 'werewolf'; }).length, o = al.length - w;
    if (w === 0) { W.winner = 'village'; return true; }
    if (w >= o) { W.winner = 'wolves'; return true; }
    return false;
  }
  function resolveNight(W) {
    var out = [], a = W.act;
    if (a.victim !== null && !a.healed && a.victim !== a.protect) {
      if (W.players[a.victim].role === 'elder' && !W.elderHit) W.elderHit = true; else kill(W, a.victim, 'night', out);
    }
    if (a.poison !== null) kill(W, a.poison, 'night', out);
    W.announce = out; W.step = null; W.phase = 'dawn';
  }
  function leaveDawn(W) {
    if (win(W)) { W.phase = 'end'; return; }
    if (W.hunterQ.length) { W.phase = 'hunter'; W.after = 'vote'; } else W.phase = 'vote';
  }
  function shoot(W, i) {
    var out = [];
    W.hunterQ.shift();
    if (i !== null && W.players[i].alive) kill(W, i, 'hunter', out);
    W.announce = out;
    if (win(W)) { W.phase = 'end'; return; }
    if (W.hunterQ.length) return;
    if (W.after === 'vote') W.phase = 'vote'; else nextNight(W);
  }
  // i = index of the voted-out player or null for a tie
  function vote(W, i) {
    W.last = { kind: 'tie', id: null };
    if (i !== null) {
      var p = W.players[i];
      if (p.role === 'idiot' && !W.idiotShown[i]) { W.idiotShown[i] = true; p.idiotOut = true; W.last = { kind: 'idiot', id: i }; }
      else { var out = []; kill(W, i, 'vote', out); if (p.role === 'elder') W.powersOff = true; W.last = { kind: 'elim', id: i }; }
    }
    W.phase = 'voteResult';
  }
  function leaveVote(W) {
    if (win(W)) { W.phase = 'end'; return; }
    if (W.hunterQ.length) { W.phase = 'hunter'; W.after = 'night'; } else nextNight(W);
  }
  function nextNight(W) { W.night++; startNight(W); }
  return { create: create, alive: alive, actors: actors, submit: submit, leaveDawn: leaveDawn, shoot: shoot, vote: vote, leaveVote: leaveVote };
}());
