'use strict';
/*
 * Werewolf with an automatic narrator. Night actions happen on each player's own phone, so the
 * server hides who acts: roles that are dead or missing are skipped after a random pause.
 */
const { pick, shuffle, int, rand } = require('../util');

const SPECIALS = ['seer', 'witch', 'hunter', 'cupid', 'guardian', 'girl', 'idiot', 'elder'];
const NIGHT_STEPS = ['cupid', 'guardian', 'wolves', 'seer', 'witch'];
const FAST = process.env.BOOMBOX_TEST_FAST === '1';
const T = FAST ? { step: 4000, announce: 300, hunter: 2000, vote: 4000, result: 300 } : { step: 90e3, announce: 9e3, hunter: 45e3, vote: 120e3, result: 8e3 };

function bad() { const e = new Error('bad_options'); e.status = 400; e.code = 'bad_options'; return e; }
const aliveIds = (g) => g.players.filter((id) => g.alive[id]);
const roleAlive = (g, role) => g.players.filter((id) => g.alive[id] && g.roles[id] === role);
const voters = (g) => aliveIds(g).filter((id) => !g.idiotOut[id]);

function configured(g, step) {
  if (step === 'wolves') return true;
  if (step === 'cupid') return !!g.cfg.on.cupid && g.night === 1;
  return !!g.cfg.on[step];
}
function actors(g, step) {
  if (g.powersOff && step !== 'wolves') return [];
  switch (step) {
    case 'cupid': return roleAlive(g, 'cupid');
    case 'guardian': return roleAlive(g, 'guardian');
    case 'wolves': return roleAlive(g, 'werewolf');
    case 'seer': return roleAlive(g, 'seer');
    case 'witch': return (g.potions.poison || (g.potions.heal && g.victim)) ? roleAlive(g, 'witch') : [];
    default: return [];
  }
}
function nextNightStep(g, cur) {
  let i = cur ? NIGHT_STEPS.indexOf(cur) + 1 : 0;
  for (; i < NIGHT_STEPS.length; i++) if (configured(g, NIGHT_STEPS[i])) return NIGHT_STEPS[i];
  return null;
}
function kill(g, id, cause, out) {
  if (!g.alive[id]) return;
  g.alive[id] = false;
  g.log.push({ k: cause === 'vote' ? 'elim' : 'died', n: g.night, id, role: g.roles[id] });
  out.push(id);
  if (g.roles[id] === 'hunter' && !g.powersOff) g.hunterQ.push(id);
  if (g.lovers && g.lovers.indexOf(id) !== -1) kill(g, g.lovers[0] === id ? g.lovers[1] : g.lovers[0], 'lover', out);
}
function checkWin(g) {
  const al = aliveIds(g), w = al.filter((id) => g.roles[id] === 'werewolf').length, o = al.length - w;
  if (w === 0) { g.winner = 'village'; return true; }
  if (w >= o) { g.winner = 'wolves'; return true; }
  return false;
}
function finish(room, g) { room.clearTimers(); g.phase = 'end'; g.step = null; room.broadcast(); }

/* ----- phase machine ----- */
function enterStep(room, g, step) {
  room.clearTimers();
  g.phase = 'night'; g.step = step; g.acts = {};
  const who = actors(g, step);
  if (!who.length) room.later(() => advanceNight(room, g), FAST ? 80 : 3000 + rand(4000));
  else room.later(() => resolveStep(room, g), T.step);
  room.broadcast();
}
function startNight(room, g) {
  g.protect = null; g.victim = null; g.healed = false; g.poisonT = null;
  const first = nextNightStep(g, null);
  if (first) enterStep(room, g, first); else resolveNight(room, g);
}
function advanceNight(room, g) {
  const nxt = nextNightStep(g, g.step);
  if (nxt) enterStep(room, g, nxt); else resolveNight(room, g);
}
function resolveStep(room, g) {
  const who = actors(g, g.step);
  const acts = who.map((id) => g.acts[id]).filter(Boolean);
  if (g.step === 'cupid' && acts[0]) g.lovers = acts[0].t;
  if (g.step === 'guardian' && acts[0]) { g.protect = acts[0].target; g.lastGuard = acts[0].target; }
  if (g.step === 'wolves' && acts.length) {
    const c = {};
    acts.forEach((a) => { c[a.target] = (c[a.target] || 0) + 1; });
    const max = Math.max(...Object.values(c));
    g.victim = pick(Object.keys(c).filter((k) => c[k] === max));
  }
  if (g.step === 'seer' && acts[0]) {
    const seerId = who[0];
    (g.seerLog[seerId] = g.seerLog[seerId] || []).push({ n: g.night, id: acts[0].target, wolf: g.roles[acts[0].target] === 'werewolf' });
  }
  if (g.step === 'witch' && acts[0]) {
    if (acts[0].heal && g.potions.heal && g.victim) { g.healed = true; g.potions.heal = false; }
    if (acts[0].poison && g.potions.poison) { g.poisonT = acts[0].poison; g.potions.poison = false; }
  }
  advanceNight(room, g);
}
function resolveNight(room, g) {
  const out = [];
  if (g.victim && !g.healed && g.victim !== g.protect) {
    if (g.roles[g.victim] === 'elder' && !g.elderHit) g.elderHit = true; else kill(g, g.victim, 'night', out);
  }
  if (g.poisonT) kill(g, g.poisonT, 'night', out);
  g.announce = out;
  g.step = null; g.phase = 'announce'; g.after = 'vote';
  room.clearTimers();
  if (checkWin(g)) { room.later(() => finish(room, g), T.announce); room.broadcast(); return; }
  room.later(() => leaveAnnounce(room, g), T.announce);
  room.broadcast();
}
function leaveAnnounce(room, g) {
  if (checkWin(g)) { finish(room, g); return; }
  if (g.hunterQ.length) enterHunter(room, g, 'vote'); else enterVote(room, g);
}
function enterHunter(room, g, after) {
  room.clearTimers();
  g.phase = 'hunter'; g.after = after;
  room.later(() => shoot(room, g, pick(aliveIds(g))), T.hunter);
  room.broadcast();
}
function shoot(room, g, target) {
  const hunter = g.hunterQ.shift();
  const out = [];
  if (target && g.alive[target]) kill(g, target, 'hunter', out);
  g.announce = out; void hunter;
  if (checkWin(g)) { finish(room, g); return; }
  if (g.hunterQ.length) { enterHunter(room, g, g.after); return; }
  if (g.after === 'vote') enterVote(room, g); else startNextNight(room, g);
}
function enterVote(room, g) {
  room.clearTimers();
  g.phase = 'vote'; g.votes = {};
  room.later(() => resolveVote(room, g), T.vote);
  room.broadcast();
}
function resolveVote(room, g) {
  room.clearTimers();
  const c = {};
  Object.keys(g.votes).forEach((v) => { c[g.votes[v]] = (c[g.votes[v]] || 0) + 1; });
  const max = Math.max(0, ...Object.values(c));
  const top = Object.keys(c).filter((k) => c[k] === max && max > 0);
  g.lastResult = { kind: 'tie', id: null, tally: c };
  if (top.length === 1) {
    const id = top[0];
    if (g.roles[id] === 'idiot' && !g.idiotShown[id]) {
      g.idiotShown[id] = true; g.idiotOut[id] = true;
      g.lastResult = { kind: 'idiot', id, tally: c };
      g.log.push({ k: 'idiot', n: g.night, id });
    } else {
      const out = [];
      kill(g, id, 'vote', out);
      if (g.roles[id] === 'elder') g.powersOff = true;
      g.lastResult = { kind: 'elim', id, tally: c };
    }
  } else {
    g.log.push({ k: 'tie', n: g.night });
  }
  g.phase = 'voteResult'; g.after = 'night';
  room.later(() => leaveVoteResult(room, g), T.result);
  room.broadcast();
}
function leaveVoteResult(room, g) {
  if (checkWin(g)) { finish(room, g); return; }
  if (g.hunterQ.length) enterHunter(room, g, 'night'); else startNextNight(room, g);
}
function startNextNight(room, g) { g.night++; startNight(room, g); }

/* ----- module interface ----- */
module.exports = {
  start(room, opts) {
    const ids = room.connectedIds(), n = ids.length;
    const on = {};
    SPECIALS.forEach((r) => { on[r] = !!(opts.on && opts.on[r] === true); });
    const sp = SPECIALS.filter((r) => on[r]).length;
    const w = opts.wolves ? int(opts.wolves, 1, n, 1) : Math.max(1, Math.round(n / 4));
    if (n < 5 || w + sp > n - 1) throw bad();
    let list = [];
    for (let i = 0; i < w; i++) list.push('werewolf');
    SPECIALS.forEach((r) => { if (on[r]) list.push(r); });
    while (list.length < n) list.push('villager');
    list = shuffle(list);
    const roles = {}, alive = {};
    ids.forEach((id, i) => { roles[id] = list[i]; alive[id] = true; });
    const g = {
      type: 'wolf', phase: 'night', step: null, night: 1, players: ids, roles, alive, cfg: { on, wolves: w },
      lovers: null, powersOff: false, idiotOut: {}, idiotShown: {}, elderHit: false, potions: { heal: true, poison: true },
      lastGuard: null, protect: null, victim: null, healed: false, poisonT: null, acts: {}, votes: {}, log: [],
      announce: [], hunterQ: [], after: null, winner: null, seerLog: {}, lastResult: null
    };
    room.game = g;
    startNight(room, g);
  },

  act(room, g, pid, m) {
    const host = room.hostId === pid;
    if (host && m.a === 'skip') {
      if (g.phase === 'night') resolveStep(room, g);
      else if (g.phase === 'announce') leaveAnnounce(room, g);
      else if (g.phase === 'hunter') shoot(room, g, pick(aliveIds(g)));
      else if (g.phase === 'vote') resolveVote(room, g);
      else if (g.phase === 'voteResult') leaveVoteResult(room, g);
      return;
    }
    if (host && m.a === 'again' && g.phase === 'end') { this.start(room, { on: g.cfg.on, wolves: g.cfg.wolves }); room.broadcast(); return; }

    if (g.phase === 'night' && g.step && m.a === 'pick') {
      if (actors(g, g.step).indexOf(pid) === -1 || g.acts[pid]) return;
      const al = (id) => typeof id === 'string' && g.alive[id];
      let act = null;
      if (g.step === 'cupid') {
        if (Array.isArray(m.targets) && m.targets.length === 2 && m.targets[0] !== m.targets[1] && m.targets.every(al)) act = { t: [m.targets[0], m.targets[1]] };
      } else if (g.step === 'guardian') {
        if (al(m.target) && m.target !== g.lastGuard) act = { target: m.target };
      } else if (g.step === 'wolves') {
        if (al(m.target) && g.roles[m.target] !== 'werewolf') act = { target: m.target };
      } else if (g.step === 'seer') {
        if (al(m.target) && m.target !== pid) act = { target: m.target };
      }
      if (!act) return;
      g.acts[pid] = act;
      if (actors(g, g.step).every((id) => g.acts[id])) resolveStep(room, g); else room.broadcast();
      return;
    }
    if (g.phase === 'night' && g.step === 'witch' && m.a === 'witch') {
      if (actors(g, 'witch').indexOf(pid) === -1 || g.acts[pid]) return;
      const act = { heal: m.heal === true, poison: null };
      if (typeof m.poison === 'string' && g.alive[m.poison]) act.poison = m.poison;
      g.acts[pid] = act;
      resolveStep(room, g);
      return;
    }
    if (g.phase === 'hunter' && m.a === 'pick' && pid === g.hunterQ[0]) {
      if (typeof m.target === 'string' && g.alive[m.target]) shoot(room, g, m.target);
      return;
    }
    if (g.phase === 'vote' && m.a === 'vote') {
      if (voters(g).indexOf(pid) === -1 || !g.alive[m.target] || m.target === pid) return;
      g.votes[pid] = m.target;
      if (voters(g).every((id) => g.votes[id])) resolveVote(room, g); else room.broadcast();
    }
  },

  view(room, g, pid) {
    const inGame = g.players.indexOf(pid) !== -1, role = g.roles[pid], alive = !!g.alive[pid];
    const v = {
      type: 'wolf', phase: g.phase, night: g.night, players: g.players, alive: g.alive, idiotOut: g.idiotOut,
      inGame, role: inGame ? role : null, amAlive: alive, log: g.log.slice(-40), announce: g.announce,
      winner: g.winner, lastResult: g.phase === 'voteResult' ? g.lastResult : null, powersOff: g.powersOff,
      seer: g.seerLog[pid] || [], cfgOn: g.cfg.on, wolves: g.cfg.wolves
    };
    if (role === 'werewolf') v.pack = g.players.filter((id) => g.roles[id] === 'werewolf');
    if (g.lovers && g.lovers.indexOf(pid) !== -1) v.lover = g.lovers[0] === pid ? g.lovers[1] : g.lovers[0];
    if (g.phase === 'end') v.roles = g.roles;
    if (g.phase === 'night' && g.step && inGame) {
      const who = actors(g, g.step);
      if (who.indexOf(pid) !== -1) {
        v.step = g.step; v.acted = !!g.acts[pid];
        if (!v.acted) {
          const al = aliveIds(g);
          if (g.step === 'cupid') v.act = { kind: 'cupid', targets: al };
          else if (g.step === 'guardian') v.act = { kind: 'guardian', targets: al.filter((id) => id !== g.lastGuard) };
          else if (g.step === 'wolves') v.act = { kind: 'wolves', targets: al.filter((id) => g.roles[id] !== 'werewolf') };
          else if (g.step === 'seer') v.act = { kind: 'seer', targets: al.filter((id) => id !== pid) };
          else if (g.step === 'witch') v.act = { kind: 'witch', victim: g.victim, canHeal: !!(g.potions.heal && g.victim), canPoison: !!g.potions.poison, targets: al.filter((id) => id !== pid) };
        }
        if (g.step === 'wolves') {
          v.wolfVotes = {};
          who.forEach((id) => { if (g.acts[id]) v.wolfVotes[id] = g.acts[id].target; });
        }
      }
    }
    if (g.phase === 'hunter') v.hunter = g.hunterQ[0];
    if (g.phase === 'hunter' && pid === g.hunterQ[0]) v.act = { kind: 'hunter', targets: aliveIds(g) };
    if (g.phase === 'vote') {
      const vt = voters(g);
      v.voted = Object.keys(g.votes).length; v.total = vt.length; v.myVote = g.votes[pid] || null;
      if (vt.indexOf(pid) !== -1 && !g.votes[pid]) v.act = { kind: 'vote', targets: aliveIds(g).filter((id) => id !== pid) };
      v.mayNotVote = alive && !!g.idiotOut[pid];
    }
    return v;
  }
};
