/* Online rooms: every player uses their own phone. Loaded before app.js, which calls TPOnline(TP). */
window.TPOnline = function (TP) {
'use strict';
var S = TP.S, V = TP.V, A = TP.A, F = TP.F, t = TP.t, T = TP.T, esc = TP.esc;
var KEY_ROOM = 'boombox.room', KEY_NAME = 'boombox.name';
var O = S.on;
O.chat = []; O.sel = []; O.off = 0; O.tool = { c: '#111111', w: 6 }; O.R = null;
var COLORS = ['#111111', '#e63946', '#f4a300', '#2a9d4a', '#1d6fe0', '#8e44ad', '#ffffff'];
var ONLINE_GAMES = ['impostor', 'spy', 'wolf', 'wouldrather', 'bomb', 'spectrum', 'boxes', 'sketch', 'chain'];
var SERVER_GAME = { impostor: 'impostor', spy: 'spy', wolf: 'wolf', wouldrather: 'wouldrather', bomb: 'bomb', spectrum: 'spectrum', boxes: 'boxes', sketch: 'sketch', chain: 'chain' };

function store(v) { try { if (v) localStorage.setItem(KEY_ROOM, JSON.stringify(v)); else localStorage.removeItem(KEY_ROOM); } catch (e) { /* ignore */ } }
function saved() { try { return JSON.parse(localStorage.getItem(KEY_ROOM) || 'null'); } catch (e) { return null; } }
function savedName() { try { return localStorage.getItem(KEY_NAME) || ''; } catch (e) { return ''; } }
function pn(id) { var p = O.R && O.R.players.filter(function (x) { return x.id === id; })[0]; return p ? p.name : '?'; }
function isHost() { return O.R && O.R.host === O.pid; }
function now() { return Date.now() + O.off; }
function errMsg(e) {
  var k = 'on.err.' + (e && e.code);
  if (TP.has(k)) return t(k);
  k = 'err.' + (e && e.code);
  return TP.has(k) ? t(k) : t('err.generic');
}
function post(a, extra) {
  return TP.api('POST', 'api/room/act', Object.assign({ code: O.code, pid: O.pid, token: O.token, a: a }, extra || {}))
    .then(function () {}, function (e) { TP.toast(errMsg(e)); });
}

/* ---------- connection ---------- */
function connect() {
  if (O.es) { try { O.es.close(); } catch (e) { /* ignore */ } }
  O.reconnecting = false;
  var url = 'api/room/stream?code=' + encodeURIComponent(O.code) + '&pid=' + encodeURIComponent(O.pid) + '&token=' + encodeURIComponent(O.token);
  var es = new EventSource(url);
  O.es = es;
  es.onopen = function () { if (O.reconnecting) { O.reconnecting = false; if (S.screen === 'room') TP.render(); } };
  es.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } onMessage(m); };
  es.onerror = function () {
    if (es.readyState === 2) { drop(); TP.toast(t('on.err.closed')); TP.go('home'); }
    else { O.reconnecting = true; if (S.screen === 'room') TP.render(); }
  };
}
function drop() {
  if (O.es) { try { O.es.close(); } catch (e) { /* ignore */ } }
  clearInterval(O.clk); O.es = null; O.R = null; O.code = null; O.chat = []; O.sel = []; store(null);
}
var NARR = { cupid: 'nar.cupid', guardian: 'nar.guardian', wolves: 'nar.wolves', seer: 'nar.seer', witch: 'nar.witch' };
/* the host's phone reads the moderator lines aloud so the room hears one voice */
function narrate(g) {
  if (!g || g.type !== 'wolf' || !isHost()) { if (!g || g.type !== 'wolf') O.nk = null; return; }
  var k = g.phase + ':' + g.night + ':' + (g.narr || '') + ':' + (g.announce || []).length + ':' + (g.lastResult ? g.lastResult.kind + g.lastResult.id : '');
  if (k === O.nk) return;
  var first = !O.nk || O.nk.split(':')[1] !== String(g.night);
  O.nk = k;
  var txt = '', nm = function (id) { return pn(id); };
  if (g.phase === 'night' && g.narr) txt = (first || g.narr === 'cupid' ? t('nar.night') + ' ' : '') + t(NARR[g.narr]);
  else if (g.phase === 'announce') txt = t('nar.dawn') + ' ' + (g.announce.length ? t('nar.died', { names: g.announce.map(function (id) { var e = g.log.filter(function (x) { return x.k === 'died' && x.id === id; }).pop(); return nm(id) + (e ? ' (' + t('role.' + e.role) + ')' : ''); }).join(', ') }) : t('nar.noDeaths'));
  else if (g.phase === 'hunter') txt = t('nar.hunter');
  else if (g.phase === 'vote') txt = t('nar.vote');
  else if (g.phase === 'voteResult' && g.lastResult) {
    var r = g.lastResult;
    txt = r.kind === 'elim' ? t('nar.elim', { name: nm(r.id), role: t('role.' + (g.log.filter(function (x) { return x.k === 'elim' && x.id === r.id; }).pop() || {}).role) }) : r.kind === 'idiot' ? t('nar.idiot', { name: nm(r.id) }) : t('nar.tie');
  } else if (g.phase === 'end') txt = t(g.winner === 'village' ? 'ww.winVillage' : 'ww.winWolves');
  if (txt) TP.speak(txt);
}
function onMessage(m) {
  if (m.t === 'state') {
    O.off = m.now - Date.now();
    var g = m.game, key = g ? g.type + ':' + (g.turn || g.round || g.n || '') + ':' + (g.night || '') : '';
    if (key !== O.lastKey) { O.sel = []; if (g && g.type === 'sketch') clearCanvas(); if (!g || g.type !== 'sketch') O.chat = []; }
    if (g && g.type === 'sketch' && O.lastPhase !== 'draw' && g.phase === 'draw') { clearCanvas(); O.chat = []; }
    if (g && g.type === 'chain') { var ck = g.phase + ':' + (g.step || ''); if (O.chainKey !== ck) { O.chainKey = ck; clearCanvas(); } } else O.chainKey = null;
    O.lastKey = key; O.lastPhase = g ? g.phase : null;
    var prevAct = O.R && O.R.game && O.R.game.act ? O.R.game.act.kind : null, nextAct = g && g.act ? g.act.kind : null;
    if (prevAct !== nextAct) O.sel = [];
    var wasGame = !!(O.R && O.R.game);
    O.R = m;
    narrate(g);
    if (!!g !== wasGame) window.scrollTo(0, 0);
    if (S.screen !== 'room') TP.go('room'); else TP.render();
    return;
  }
  if (m.t === 'tick') {
    TP.beep(700 + m.r * 500, 0.07, 0.07);
    var b = document.getElementById('bomb');
    if (b && b.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) b.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (1.08 + m.r * 0.12) + ')' }, { transform: 'scale(1)' }], { duration: 160 });
    return;
  }
  if (m.t === 'stroke') { drawStroke(m.s); return; }
  if (m.t === 'strokes') { m.list.forEach(drawStroke); return; }
  if (m.t === 'clear') { clearCanvas(); return; }
  if (m.t === 'chat') { O.chat.push(m); if (O.chat.length > 40) O.chat.shift(); paintChat(); return; }
  if (m.t === 'closed') { drop(); TP.toast(t(m.why === 'left' ? 'on.err.closed' : 'on.err.closed')); TP.go('home'); }
}
function leave() {
  if (O.code) { TP.api('POST', 'api/room/act', { code: O.code, pid: O.pid, token: O.token, a: 'leave' }).then(function () {}, function () {}); }
  drop(); TP.go('home');
}

/* ---------- canvas ---------- */
function canvas() {
  if (!O.cv) {
    var cv = document.createElement('canvas'); cv.width = 1000; cv.height = 750; cv.className = 'cv';
    O.cv = cv; clearCanvas(); bindCanvas(cv);
  }
  return O.cv;
}
function clearCanvas() {
  if (!O.cv) return;
  var c = O.cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1000, 750);
}
function drawStroke(s) { drawStrokeOn(O.cv, s); }
function paintStrokes(cv, list) {
  var c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1000, 750);
  (list || []).forEach(function (s) { drawStrokeOn(cv, s); });
}
function drawStrokeOn(cv, s) {
  if (!s || !cv) return;
  var c = cv.getContext('2d'); c.strokeStyle = s.c; c.fillStyle = s.c; c.lineWidth = s.w; c.lineCap = 'round'; c.lineJoin = 'round';
  var p = s.p;
  if (p.length === 1) { c.beginPath(); c.arc(p[0][0], p[0][1], s.w / 2, 0, Math.PI * 2); c.fill(); return; }
  c.beginPath(); c.moveTo(p[0][0], p[0][1]);
  for (var i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
  c.stroke();
}
function bindCanvas(cv) {
  function pos(e) { var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1000, (e.clientX - r.left) / r.width * 1000)), Math.max(0, Math.min(750, (e.clientY - r.top) / r.height * 750))]; }
  function flush(final) {
    var cur = O.cur; if (!cur) return;
    if (cur.p.length > cur.sent - 1 || final) {
      var chunk = cur.p.slice(Math.max(0, cur.sent - 1));
      if (chunk.length) post('stroke', { s: { c: cur.c, w: cur.w, p: chunk.map(function (q) { return [Math.round(q[0]), Math.round(q[1])]; }) } });
      cur.sent = cur.p.length;
    }
  }
  cv.addEventListener('pointerdown', function (e) {
    if (!O.canDraw) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    var p = pos(e);
    O.cur = { c: O.tool.c, w: O.tool.w, p: [p], sent: 1 };
    drawStroke({ c: O.tool.c, w: O.tool.w, p: [p] });
    post('stroke', { s: { c: O.tool.c, w: O.tool.w, p: [[Math.round(p[0]), Math.round(p[1])]] } });
    clearInterval(O.flushT); O.flushT = setInterval(function () { flush(false); }, 70);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!O.cur) return;
    e.preventDefault();
    var p = pos(e), last = O.cur.p[O.cur.p.length - 1];
    O.cur.p.push(p);
    drawStroke({ c: O.cur.c, w: O.cur.w, p: [last, p] });
  });
  function end() { if (!O.cur) return; clearInterval(O.flushT); flush(true); O.cur = null; }
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('lostpointercapture', end);
}

/* ---------- small renderers ---------- */
function roster() {
  return O.R.players.map(function (p) {
    return '<li><span>' + esc(p.name) + (p.id === O.pid ? ' (' + T('on.you') + ')' : '') + '</span><span>' + (p.id === O.R.host ? T('on.host') + ' ' : '') + (p.on ? '' : T('on.offline')) + '</span></li>';
  }).join('');
}
function targets(list, sel, act) {
  return '<div class="chips">' + list.map(function (id) {
    return '<button class="chip' + (sel.indexOf(id) !== -1 ? ' on' : '') + '" data-act="' + act + '" data-a="' + esc(id) + '">' + esc(pn(id)) + '</button>';
  }).join('') + '</div>';
}
function hostBtns(again) {
  if (!isHost()) return '<p class="hint">' + T('on.waitHost') + '</p>';
  return '<div class="row">' + (again ? '<button class="btn alt" data-act="oact" data-a="' + again + '">' + T('on.again') + '</button>' : '') +
    '<button class="btn" data-act="oact" data-a="lobby">' + T('on.toLobby') + '</button></div>';
}
function scoreList(scores, ids) {
  var rows = ids.map(function (id) { return { id: id, v: scores[id] || 0 }; }).sort(function (a, b) { return b.v - a.v; });
  return '<ul class="list">' + rows.map(function (r) { return '<li><span>' + esc(pn(r.id)) + '</span><span>' + r.v + '</span></li>'; }).join('') + '</ul>';
}
function progress(n, m) { return '<p class="hint">' + T('on.voted', { n: n, m: m }) + '</p>'; }
function roleCard(v) {
  if (v.role === 'imp') {
    return '<div class="role r-' + (v.type === 'spy' ? 'lemon' : 'coral') + '"><p class="kicker">' + T('imp.youAre') + '</p><h2>' + T(v.type === 'spy' ? 'spy.role' : 'imp.role') + '</h2><p>' + T(v.type === 'spy' ? 'spy.roleText' : 'imp.roleText') + (v.cat ? T('imp.topicIs', { cat: v.cat }) : '') + '</p>' + (v.letter ? '<p class="hint">' + T('imp.tip', { l: esc(v.letter) }) + '</p>' : '') + '</div>';
  }
  return '<div class="role r-aqua"><p class="kicker">' + T(v.type === 'spy' ? 'spy.placeIs' : 'imp.wordIs') + '</p><h2>' + esc(v.secret) + '</h2><p>' + T(v.type === 'spy' ? 'spy.placeText' : 'imp.wordText') + '</p></div>';
}

/* ---------- entry screen ---------- */
V.online = function () {
  var nm = savedName() || (TP.me() ? TP.me().name : '');
  var sv = saved();
  return TP.top(t('on.title')) + TP.msgBox() +
    (sv ? '<button class="btn aqua" data-act="orejoin">' + T('on.rejoin', { code: sv.code }) + '</button>' : '') +
    '<div class="panel"><div class="field"><label for="oname">' + T('on.name') + '</label><input id="oname" type="text" maxlength="16" autocomplete="nickname" value="' + esc(nm) + '" placeholder="' + T('on.namePh') + '"></div>' +
    '<button class="btn" data-act="ocreate">' + T('on.create') + '</button></div>' +
    '<div class="panel"><form class="stack" data-form="ojoin"><div class="field"><label for="ocode">' + T('on.code') + '</label><input id="ocode" type="text" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" value="' + esc(O.prefill || '') + '" placeholder="' + T('on.codePh') + '" style="text-transform:uppercase;letter-spacing:.3em;text-align:center;font-size:28px"></div>' +
    '<button class="btn aqua" type="submit">' + T('on.join') + '</button></form></div>';
};
function nameValue() {
  var el = document.getElementById('oname'), v = el ? el.value.trim() : '';
  if (v) { try { localStorage.setItem(KEY_NAME, v); } catch (e) { /* ignore */ } }
  return v;
}
function begin(r) {
  O.code = r.code; O.pid = r.pid; O.token = r.token; O.chat = []; O.sel = []; O.lastKey = '';
  store({ code: r.code, pid: r.pid, token: r.token });
  S.screen = 'room'; connect(); TP.render();
}
A.ocreate = function () {
  var v = nameValue(); if (!v) { TP.setMsg('err', t('on.err.bad_name')); TP.render(); return; }
  TP.api('POST', 'api/room/create', { name: v, lang: TP.lang() }).then(begin, function (e) { TP.setMsg('err', errMsg(e)); TP.render(); });
};
F.ojoin = function (f) {
  var v = nameValue(); if (!v) { TP.setMsg('err', t('on.err.bad_name')); TP.render(); return; }
  TP.api('POST', 'api/room/join', { name: v, code: f.elements.ocode.value.trim().toUpperCase() }).then(begin, function (e) { TP.setMsg('err', errMsg(e)); TP.render(); });
};
A.orejoin = function () { var sv = saved(); if (!sv) return; O.code = sv.code; O.pid = sv.pid; O.token = sv.token; S.screen = 'room'; connect(); TP.render(); };
A.oleave = leave;
A.oact = function (a) { post(a); };
A.ocopy = function () {
  try { navigator.clipboard.writeText(O.code).then(function () { TP.toast(t('on.copied')); }, function () { TP.toast(O.code); }); } catch (e) { TP.toast(O.code); }
};
A.olink = function () {
  var url = location.origin + location.pathname + '?room=' + O.code;
  try { if (navigator.share) { navigator.share({ url: url }).catch(function () {}); return; } } catch (e) { /* ignore */ }
  try { navigator.clipboard.writeText(url).then(function () { TP.toast(t('on.copied')); }, function () { TP.toast(url); }); } catch (e) { TP.toast(url); }
};
A.osel = function (id) {
  var i = O.sel.indexOf(id), max = O.max || 1;
  if (i !== -1) O.sel.splice(i, 1); else { if (O.sel.length >= max) O.sel.shift(); O.sel.push(id); }
  TP.render();
};
A.opoint = function (id) { post('vote', { target: id }); };
A.oconfirm = function (kind) {
  var v = O.R.game;
  if (kind === 'cupid') { if (O.sel.length === 2) post('pick', { targets: O.sel.slice() }); }
  else if (kind === 'witch') { post('witch', { heal: !!O.heal, poison: O.sel[0] || null }); O.heal = false; }
  else if (kind === 'vote') { if (O.sel[0]) post('vote', { target: O.sel[0] }); }
  else if (O.sel[0]) post('pick', { target: O.sel[0] });
  void v;
};
A.oheal = function () { O.heal = !O.heal; TP.render(); };
A.owitchskip = function () { post('witch', { heal: false, poison: null }); };
A.otool = function (c, w) { if (c) O.tool.c = c; if (w) O.tool.w = +w; TP.render(); };
A.oclear = function () { clearCanvas(); post('clear'); };
A.ogame = function (id) { O.pick = id; TP.render(); };
A.ostart = function () {
  var id = O.pick || 'impostor', opts = {};
  if (id === 'impostor') opts = { cat: S.cfg.imp.cat === 'all' ? null : S.cfg.imp.cat, n: S.cfg.imp.n, tip: S.cfg.imp.tip !== false };
  if (id === 'spy') opts = { minutes: S.cfg.spy.min };
  if (id === 'wolf') { var k = TP.wolfCounts(); opts = { on: S.cfg.wolf.on, wolves: k.w }; }
  if (id === 'sketch') opts = { rounds: S.cfg.sketch.rounds };
  if (id === 'boxes') opts = { n: S.cfg.boxes.n };
  if (id === 'spectrum') opts = { rounds: S.cfg.sketch.rounds };
  post('start', { game: SERVER_GAME[id], opts: opts });
};
F.oguess = function (f) {
  var el = f.elements.guess, v = el.value.trim(); if (!v) return;
  el.value = ''; post('guess', { text: v });
};

/* ---------- lobby ---------- */
function lobby() {
  var R = O.R, host = isHost(), pick = O.pick && ONLINE_GAMES.indexOf(O.pick) !== -1 ? O.pick : 'impostor';
  O.pick = pick;
  var mins = { impostor: 3, spy: 3, wolf: 5, wouldrather: 2, bomb: 2, spectrum: 3, boxes: 2, sketch: 2, chain: 3 };
  var html = '<header><p class="kicker">' + T('on.lobby', { code: '' }).trim() + '</p><h1 class="wordmark" style="font-size:clamp(56px,20vw,96px);letter-spacing:.08em">' + esc(R.code) + '</h1></header>' +
    '<p class="hint">' + T('on.share') + '</p>' +
    '<div class="row"><button class="btn alt small" data-act="ocopy">' + T('on.copy') + '</button><button class="btn alt small" data-act="olink">' + T('on.shareLink') + '</button></div>' +
    '<div class="panel"><div class="label">' + T('on.count', { n: R.players.length }) + '</div><ul class="list">' + roster() + '</ul></div>';
  if (!host) return html + '<div class="panel"><p class="hint">' + T('on.waitHost') + '</p></div>' + leaveBtn();
  var chips = ONLINE_GAMES.map(function (id) {
    return '<button class="chip' + (pick === id ? ' on' : '') + '" data-act="ogame" data-a="' + id + '">' + T('g.' + id) + '</button>';
  }).join('');
  var settings = '';
  var n = R.players.length;
  if (pick === 'impostor') {
    var words = TP.D('words'), c = S.cfg.imp, maxI = Math.max(1, Math.floor((n - 1) / 2));
    if (c.n > maxI) c.n = maxI;
    var cats = ['all'].concat(Object.keys(words)).map(function (k) { return '<button class="chip' + (c.cat === k ? ' on' : '') + '" data-act="impcat" data-a="' + k + '">' + (k === 'all' ? T('imp.all') : esc(words[k].label)) + '</button>'; }).join('');
    settings = '<div class="panel"><div class="label">' + T('imp.topic') + '</div><div class="chips">' + cats + '</div></div>' + TP.stepper(t('imp.count'), c.n, 'imp', t('imp.hint', { n: n, max: maxI })) + '<div class="panel">' + TP.toggle(t('imp.tipOpt'), t('imp.tipOpt.d'), c.tip !== false, 'imptip') + '</div>';
  } else if (pick === 'spy') {
    settings = TP.stepper(t('spy.len'), S.cfg.spy.min, 'spy', '');
  } else if (pick === 'wolf') {
    var wc = S.cfg.wolf, k = TP.wolfCounts(true);
    settings = '<div class="panel"><div class="label">' + T('wolf.special') + '</div>' + TP.SPECIALS.map(function (r) { return TP.toggle(t('role.' + r), t('role.' + r + '.t'), !!wc.on[r], 'role:' + r); }).join('') + '</div>' +
      TP.stepper(t('wolf.count'), k.w, 'wolves', '') +
      (k.ok ? '' : '<p class="hint">' + T('wolf.more') + '</p>');
  } else if (pick === 'boxes') {
    settings = TP.stepper(t('bx.size'), S.cfg.boxes.n, 'boxes', t('bx.limit'));
  } else if (pick === 'sketch' || pick === 'spectrum') {
    settings = TP.stepper(t('sk.rounds'), S.cfg.sketch.rounds, 'sketch', '');
  }
  var enough = n >= mins[pick] && (pick !== 'wolf' || TP.wolfCounts(true).ok);
  return html + '<div class="panel"><div class="label">' + T('on.pickGame') + '</div><div class="chips">' + chips + '</div><p class="hint">' + T('g.' + pick + '.d') + '</p></div>' + settings +
    '<button class="btn coral" data-act="ostart"' + (enough ? '' : ' disabled') + '>' + T('on.start') + '</button>' +
    (enough ? '' : '<p class="hint">' + T('on.minPlayers', { min: mins[pick] }) + '</p>') +
    '<p class="hint">' + T('on.langNote', { lang: R.lang.toUpperCase() }) + '</p>' + leaveBtn();
}
function leaveBtn() { return '<button class="btn alt small" data-act="oleave">' + T('on.leave') + '</button>'; }

/* ---------- game screens ---------- */
function hidden(v) {
  if (!v.inGame) return '<div class="panel"><p class="hint">' + T('on.spectator') + '</p></div>';
  var kindSpy = v.type === 'spy';
  if (v.phase === 'play') {
    return '<div class="stage">' + roleCard(v) + '<p class="kicker">' + T('starts') + '</p><h2 class="big">' + esc(pn(v.starter)) + '</h2><p class="hint">' + T(kindSpy ? 'spy.rules' : 'imp.rules') + '</p>' +
      (kindSpy ? '<div class="panel"><div class="label">' + T('timeLeft') + '</div><div class="clock" id="clock" data-end="' + v.endsAt + '">--</div></div>' : '') +
      (isHost() ? '<button class="btn coral" data-act="oact" data-a="startVote">' + T('on.voteNow') + '</button>' : '<p class="hint">' + T('on.waitHost') + '</p>') + '</div>';
  }
  if (v.phase === 'vote') {
    var others = v.players.filter(function (id) { return id !== O.pid; });
    return '<div class="stage">' + roleCard(v) + '<h2 class="q">' + T('on.vote') + '</h2>' +
      '<div class="chips" style="justify-content:center">' + others.map(function (id) { return '<button class="chip' + (v.myVote === id ? ' on' : '') + '" data-act="opoint" data-a="' + esc(id) + '">' + esc(pn(id)) + '</button>'; }).join('') + '</div>' +
      progress(v.voted, v.total) + (isHost() ? '<button class="btn alt" data-act="oact" data-a="reveal">' + T('on.revealNow') + '</button>' : '') + '</div>';
  }
  var r = v.res, impNames = r.imps.map(pn).join(T('imp.and'));
  var outcome = kindSpy ? (r.caught ? 'on.res.spyCaught' : 'on.res.spyFree') : (r.caught ? 'on.res.impCaught' : 'on.res.impFree');
  var tally = Object.keys(r.tally).sort(function (a, b) { return r.tally[b] - r.tally[a]; }).map(function (id) { return '<li><span>' + esc(pn(id)) + '</span><span>' + T('on.votes', { n: r.tally[id] }) + '</span></li>'; }).join('');
  return '<div class="stage"><div class="role r-' + (r.caught ? 'aqua' : 'coral') + '"><p class="kicker">' + T('revealed') + '</p><h2>' + T(outcome) + '</h2><p>' + esc(impNames) + ' ' + T(r.imps.length > 1 ? 'imp.wasN' : 'imp.was1') + '</p></div>' +
    '<div class="role r-lemon"><p class="kicker">' + T(kindSpy ? 'spy.placeIs' : 'imp.theWord') + '</p><h2>' + esc(r.secret) + '</h2></div>' +
    (tally ? '<div class="panel"><ul class="list">' + tally + '</ul></div>' : '') + hostBtns('again') + '</div>';
}
function wouldRather(v) {
  var ids = O.R.players.filter(function (p) { return p.on; }).map(function (p) { return p.id; });
  if (v.phase === 'ask') {
    return '<div class="stage"><p class="kicker">' + T('wouldrather', { n: v.n }) + '</p><p class="q">' + esc(v.q) + '</p><p class="hint">' + T('on.pointAt') + '</p>' +
      '<div class="chips" style="justify-content:center">' + ids.map(function (id) { return '<button class="chip' + (v.myVote === id ? ' on' : '') + '" data-act="opoint" data-a="' + esc(id) + '">' + esc(pn(id)) + '</button>'; }).join('') + '</div>' +
      '<p class="hint">' + T('on.pointed', { n: v.voted, m: v.total }) + '</p>' + (isHost() ? '<button class="btn alt" data-act="oact" data-a="reveal">' + T('on.revealNow') + '</button>' : '') + '</div>';
  }
  var rows = Object.keys(v.counts).sort(function (a, b) { return v.counts[b] - v.counts[a]; });
  var top = rows.length ? v.counts[rows[0]] : 0;
  return '<div class="stage"><p class="kicker">' + T('on.most') + '</p><p class="q">' + esc(v.q) + '</p><div class="panel"><ul class="list">' +
    (rows.map(function (id) { return '<li><span>' + esc(pn(id)) + '</span><span>' + (v.counts[id] === top ? '★ ' : '') + v.counts[id] + '</span></li>'; }).join('') || '<li><span>-</span></li>') + '</ul></div>' +
    (isHost() ? '<div class="row"><button class="btn aqua" data-act="oact" data-a="next">' + T('wq.next') + '</button><button class="btn alt" data-act="oact" data-a="lobby">' + T('on.toLobby') + '</button></div>' : '<p class="hint">' + T('on.waitHost') + '</p>') + '</div>';
}
function bomb(v) {
  var scores = '<div class="panel"><div class="label">' + T('on.score') + '</div>' + (Object.keys(v.scores).length ? '<ul class="list">' + Object.keys(v.scores).map(function (id) { return '<li><span>' + esc(pn(id)) + '</span><span>' + T('bomb.times', { n: v.scores[id] }) + '</span></li>'; }).join('') + '</ul>' : '<p class="hint">-</p>') + '</div>';
  if (v.phase === 'ready') {
    return '<div class="stage">' + TP.bombSvg() + '<p class="kicker">' + T('bomb.topic') + '</p><p class="q">' + esc(v.prompt) + '</p><p class="hint">' + T('bomb.rules') + '</p><p class="kicker">' + T('bomb.startsAt', { name: pn(v.holder) }) + '</p>' +
      (isHost() ? '<button class="btn pink" data-act="oact" data-a="arm">' + T('bomb.arm') + '</button>' : '<p class="hint">' + T('on.bombReady') + '</p>') + '</div>';
  }
  if (v.phase === 'run') {
    var mine = v.holder === O.pid;
    return '<div class="stage">' + TP.bombSvg() + '<p class="kicker">' + esc(v.prompt) + '</p><h2 class="big">' + esc(pn(v.holder)) + '</h2>' +
      (mine ? '<p class="hint">' + T('bomb.say') + '</p><button class="btn pink" data-act="oact" data-a="pass">' + T('on.bombPass') + '</button>' : '<p class="hint">' + T('on.bombWait') + '</p>') + '</div>';
  }
  return '<div class="stage"><div class="boom"><p class="kicker" style="color:#fff">' + T('bomb.boomAt') + '</p><h1>' + T('bomb.boom') + '</h1><h2 class="big" style="color:#fff">' + esc(pn(v.loser)) + '</h2></div>' + scores +
    (isHost() ? '<div class="row"><button class="btn pink" data-act="oact" data-a="next">' + T('bomb.next') + '</button><button class="btn alt" data-act="oact" data-a="lobby">' + T('on.toLobby') + '</button></div>' : '<p class="hint">' + T('on.waitHost') + '</p>') + '</div>';
}
function sketch(v) {
  var me = v.drawer === O.pid;
  if (v.phase === 'end') {
    return '<div class="stage"><h2 class="q">' + T('sk.final') + '</h2><div class="panel">' + scoreList(v.scores, v.players) + '</div>' + hostBtns('again') + '</div>';
  }
  O.canDraw = me && v.phase === 'draw';
  var head = '<div class="panel"><div class="label">' + T('sk.round', { n: v.turn, m: v.total }) + '</div>' +
    '<h2 class="q">' + (v.phase === 'between' ? T('sk.wordWas', { word: v.word }) : me ? T('sk.draw', { word: v.word }) : T('sk.drawer', { name: pn(v.drawer) })) + '</h2>' +
    (v.phase === 'draw' ? '<div class="row"><div class="clock" id="clock" data-end="' + v.endsAt + '" style="font-size:36px">--</div>' + (me ? '' : '<p class="script" style="letter-spacing:.2em">' + esc(v.hint) + '</p>') + '</div>' : '') + '</div>';
  var tools = '';
  if (me && v.phase === 'draw') {
    tools = '<div class="panel"><div class="chips">' + COLORS.map(function (c) {
      return '<button class="chip' + (O.tool.c === c ? ' on' : '') + '" data-act="otool" data-a="' + c + '" aria-label="' + c + '" style="background:' + c + ';border:3px solid ' + (O.tool.c === c ? '#FFD84A' : '#04141C') + ';width:44px;height:44px;padding:0"></button>';
    }).join('') + '</div><div class="chips">' + [4, 10, 22].map(function (w) { return '<button class="chip' + (O.tool.w === w ? ' on' : '') + '" data-act="otool" data-b="' + w + '">' + w + '</button>'; }).join('') +
      '<button class="chip" data-act="oclear">' + T('sk.clear') + '</button></div></div>';
  }
  var guess = '';
  if (!me && v.phase === 'draw') {
    var done = v.guessed.indexOf(O.pid) !== -1;
    guess = done ? '<div class="ok">' + T('sk.you') + '</div>' : '<form class="add" data-form="oguess" autocomplete="off"><input id="guess" name="guess" type="text" maxlength="40" placeholder="' + T('sk.guess') + '" aria-label="' + T('sk.guess') + '"><button class="btn" type="submit">' + T('sk.send') + '</button></form>';
  }
  return '<div class="stage" style="text-align:left">' + head + '<div id="cvhost" class="cvhost"></div>' + tools + guess +
    '<div id="chat" class="chat"></div><div class="panel"><div class="label">' + T('sk.scores') + '</div>' + scoreList(v.scores, v.players) + '</div>' +
    (isHost() && v.phase === 'draw' ? '<button class="btn alt small" data-act="oact" data-a="skip">' + T('ww.skipPhase') + '</button>' : '') + '</div>';
}
function toolsHtml() {
  return '<div class="panel"><div class="chips">' + COLORS.map(function (c) {
    return '<button class="chip' + (O.tool.c === c ? ' on' : '') + '" data-act="otool" data-a="' + c + '" aria-label="' + c + '" style="background:' + c + ';border:3px solid ' + (O.tool.c === c ? '#FFD84A' : '#04141C') + ';width:36px;height:36px;padding:0"></button>';
  }).join('') + '</div><div class="chips">' + [4, 10, 22].map(function (w) { return '<button class="chip' + (O.tool.w === w ? ' on' : '') + '" data-act="otool" data-b="' + w + '">' + w + '</button>'; }).join('') +
    '<button class="chip" data-act="oclear">' + T('sk.clear') + '</button></div></div>';
}
function chain(v) {
  O.canDraw = false;
  if (v.phase === 'step') {
    if (!v.inGame) return '<div class="panel"><p class="hint">' + T('on.spectator') + '</p></div>';
    var head = '<div class="panel"><div class="label">' + T('ch.step', { n: v.step, m: v.n }) + '</div><div class="clock" id="clock" data-end="' + v.endsAt + '" style="font-size:36px">--</div></div>';
    var prog = '<p class="hint">' + T('on.voted', { n: v.done.length, m: v.n }) + '</p>';
    var skip = isHost() ? '<button class="btn alt small" data-act="oact" data-a="skip">' + T('ww.skipPhase') + '</button>' : '';
    if (v.kind === 'text') {
      var intro = v.prev ? '<div class="label">' + T('ch.describe') + '</div><canvas class="cv cvs" id="cprev" width="1000" height="750"></canvas>' : '<h2 class="q">' + T('ch.write') + '</h2>' + (v.idea ? '<p class="hint">' + T('ch.idea', { idea: v.idea }) + '</p>' : '');
      var form = v.mine ? '<div class="ok">' + T('ch.sent') + '</div>' : '<form class="add" data-form="otext" autocomplete="off"><input id="ctext" name="ctext" type="text" maxlength="80" placeholder="' + T('ch.placeholder') + '" aria-label="' + T('ch.placeholder') + '"><button class="btn" type="submit">' + T('ch.send') + '</button></form>';
      return '<div class="stage" style="text-align:left">' + head + '<div class="panel">' + intro + '</div>' + form + prog + skip + '</div>';
    }
    O.canDraw = !v.mine;
    return '<div class="stage" style="text-align:left">' + head + '<div class="panel"><div class="label">' + T('ch.drawThis') + '</div><h2 class="q">' + esc(v.prev ? v.prev.text : '') + '</h2></div>' +
      '<div id="cvhost" class="cvhost"></div>' + (v.mine ? '<div class="ok">' + T('ch.sent') + '</div>' : toolsHtml() + '<button class="btn" data-act="oact" data-a="done">' + T('ch.done') + '</button>') + prog + skip + '</div>';
  }
  var items = v.entries.map(function (e, i) {
    return '<div class="panel"><p class="kicker">' + T(e.kind === 'text' ? 'ch.wroteBy' : 'ch.drewBy', { name: pn(e.by) }) + '</p>' +
      (e.kind === 'text' ? '<p class="q">' + (e.text ? esc(e.text) : '…') + '</p>' : '<canvas class="cv cvs" data-i="' + i + '" width="1000" height="750"></canvas>') + '</div>';
  }).join('');
  var foot = v.phase === 'end' ? '<h2 class="q">' + T('ch.finished') + '</h2>' + hostBtns('again') : (isHost() ? '<button class="btn" data-act="oact" data-a="next">' + T('ch.next') + '</button>' : '<p class="hint">' + T('on.waitHost') + '</p>');
  return '<div class="stage" style="text-align:left"><h2 class="q">' + T('ch.chainOf', { name: pn(v.owner) }) + '</h2>' + items + foot + '</div>';
}
F.otext = function (f) {
  var el = f.elements.ctext, v = el.value.trim(); if (!v) return;
  post('text', { text: v });
};
function paintChat() {
  var el = document.getElementById('chat'); if (!el) return;
  el.innerHTML = O.chat.slice(-8).map(function (m) {
    return m.ok ? '<p class="ok">' + T('sk.correct', { name: pn(m.who) }) + '</p>' : '<p><b>' + esc(pn(m.who)) + ':</b> ' + esc(m.text) + '</p>';
  }).join('');
}

function boxes(v) {
  var B = window.TPBoxes, mine = v.turn === O.pid, st = v.board, letters = v.players.map(function (id) { return pn(id).charAt(0).toUpperCase(); });
  var inGame = v.players.indexOf(O.pid) !== -1;
  var rows = v.players.map(function (id, i) {
    return '<li><span><i class="dot" style="background:' + B.COLORS[i] + '"></i> ' + esc(pn(id)) + (id === v.turn && v.phase === 'play' ? ' ◀' : '') + '</span><span>' + st.scores[i] + '</span></li>';
  }).join('');
  var head = v.phase === 'end'
    ? '<h2 class="q">' + (v.winners.length > 1 ? T('bx.tie') : T('bx.win', { name: pn(v.winners[0]) })) + '</h2>'
    : '<p class="kicker">' + (mine ? T('bx.you') : T('bx.turn', { name: pn(v.turn) })) + '</p>';
  return '<div class="stage">' + head + B.svg(st, mine && inGame && v.phase === 'play' ? 'oedge' : null, letters) + '<div class="panel"><ul class="list">' + rows + '</ul></div>' +
    (v.phase === 'end' ? hostBtns('again') : (isHost() ? '<button class="btn alt small" data-act="oact" data-a="lobby">' + T('on.toLobby') + '</button>' : '')) + '</div>';
}
A.oedge = function (key) { post('edge', { key: key }); };

function spectrum(v) {
  if (v.phase === 'end') return '<div class="stage"><h2 class="q">' + T('sk.final') + '</h2><div class="panel">' + scoreList(v.scores, v.players) + '</div>' + hostBtns('again') + '</div>';
  var me = v.psychic === O.pid, pair = v.pair;
  var head = '<div class="panel"><div class="label">' + T('sk.round', { n: v.turn, m: v.total }) + '</div><p class="kicker">' + T('sp.psychic', { name: pn(v.psychic) }) + '</p>' +
    '<div class="row" style="justify-content:space-between"><b>' + esc(pair[0]) + '</b><b>' + esc(pair[1]) + '</b></div>';
  if (v.phase === 'result') {
    var marks = Object.keys(v.guesses).map(function (id) { return '<span class="mk" style="left:' + v.guesses[id] + '%" title="' + esc(pn(id)) + '">' + esc(pn(id).slice(0, 2)) + '</span>'; }).join('');
    var rows = v.players.filter(function (id) { return v.gained[id] !== undefined; }).map(function (id) { return '<li><span>' + esc(pn(id)) + (v.guesses[id] !== undefined ? ' (' + v.guesses[id] + '%)' : '') + '</span><span>+' + v.gained[id] + '</span></li>'; }).join('');
    return '<div class="stage">' + head + '<div class="spec"><i class="tg" style="left:' + v.target + '%"></i>' + marks + '</div><p class="hint">' + T('sp.result', { n: v.target }) + '</p></div>' +
      '<div class="panel"><ul class="list">' + rows + '</ul></div><div class="panel"><div class="label">' + T('sk.scores') + '</div>' + scoreList(v.scores, v.players) + '</div>' +
      (isHost() ? '<button class="btn aqua" data-act="oact" data-a="next">' + T('wq.next') + '</button>' : '<p class="hint">' + T('on.waitHost') + '</p>');
  }
  var body;
  if (me) body = '<div class="spec"><i class="tg" style="left:' + v.target + '%"></i></div><p class="hint">' + T('sp.you') + '</p>';
  else {
    if (O.sv === undefined || O.svTurn !== v.turn) { O.sv = v.myGuess === null ? 50 : v.myGuess; O.svTurn = v.turn; }
    body = '<p class="hint">' + T('sp.other', { name: pn(v.psychic) }) + '</p><input id="slider" type="range" min="0" max="100" value="' + O.sv + '" aria-label="' + esc(pair[0]) + ' – ' + esc(pair[1]) + '">' +
      (v.myGuess === null ? '<button class="btn coral" data-act="osp">' + T('sp.lock') + '</button>' : '<p class="ok">' + T('sp.locked') + '</p><button class="btn alt small" data-act="osp">' + T('sp.lock') + '</button>');
  }
  return '<div class="stage" style="text-align:left">' + head + '</div>' + body + '<p class="hint">' + T('sp.submitted', { n: v.submitted, m: v.need }) + '</p><div class="panel"><div class="label">' + T('sk.scores') + '</div>' + scoreList(v.scores, v.players) + '</div>' +
    (isHost() ? '<button class="btn alt small" data-act="oact" data-a="reveal">' + T('on.revealNow') + '</button>' : '');
}
A.osp = function () { post('guess', { value: O.sv === undefined ? 50 : O.sv }); };

/* werewolf */
function wolf(v) {
  var R = O.R, out = '';
  if (!v.inGame) return '<div class="panel"><p class="hint">' + T('on.spectator') + '</p></div>';
  var role = '<div class="role r-' + ({ werewolf: 'coral', seer: 'lilac', witch: 'pink', hunter: 'lemon', cupid: 'pink', guardian: 'aqua', girl: 'lemon', idiot: 'aqua', elder: 'lilac', villager: 'aqua' }[v.role] || 'aqua') + '" style="padding:16px"><p class="kicker">' + T('wolf.yourRole') + '</p><h2 style="font-size:34px">' + T('role.' + v.role).toUpperCase() + '</h2><p>' + T('role.' + v.role + '.t') + '</p>' +
    (v.pack && v.pack.length > 1 ? '<p>' + T('ww.pack', { names: v.pack.filter(function (id) { return id !== O.pid; }).map(pn).join(', ') }) + '</p>' : '') +
    (v.lover ? '<p>' + T('ww.lover', { name: pn(v.lover) }) + '</p>' : '') + '</div>';
  var logLine = function (e) {
    if (e.k === 'died') return T('ww.died', { name: pn(e.id), role: t('role.' + e.role) });
    if (e.k === 'elim') return T('ww.elim', { name: pn(e.id), role: t('role.' + e.role) });
    if (e.k === 'idiot') return T('ww.idiot', { name: pn(e.id) });
    return T('ww.tie');
  };
  var status = '';
  var vb = isHost() && TP.canSpeak() ? '<div class="row">' + TP.voiceBtn() + '</div>' : '';
  if (v.phase === 'end') {
    var rows = v.players.map(function (id) { return '<li><span>' + esc(pn(id)) + '</span><span>' + T('role.' + v.roles[id]) + (v.alive[id] ? '' : ' ✝') + '</span></li>'; }).join('');
    return '<div class="stage"><div class="role r-' + (v.winner === 'village' ? 'aqua' : 'coral') + '"><h2>' + T(v.winner === 'village' ? 'ww.winVillage' : 'ww.winWolves') + '</h2></div>' +
      '<div class="panel"><div class="label">' + T('ww.allRoles') + '</div><ul class="list">' + rows + '</ul></div>' + hostBtns('again') + '</div>';
  }
  var act = v.act, body = '';
  if (!v.amAlive && !(act && act.kind === 'hunter')) body += '<div class="panel"><p class="hint">' + T('ww.out') + '</p></div>';
  if (v.phase === 'night') {
    if (act) {
      O.max = act.kind === 'cupid' ? 2 : 1;
      if (act.kind === 'witch') {
        body += '<div class="panel"><h3>' + (act.victim ? T('ww.witch', { name: pn(act.victim) }) : T('ww.witchNone')) + '</h3>' +
          (act.canHeal ? '<button class="chip' + (O.heal ? ' on' : '') + '" data-act="oheal">' + T('ww.heal') + '</button>' : '') +
          (act.canPoison ? '<div class="label">' + T('ww.poison') + '</div>' + targets(act.targets, O.sel, 'osel') : '') +
          '<button class="btn coral" data-act="oconfirm" data-a="witch">' + T('ww.confirm') + '</button><button class="btn alt" data-act="owitchskip">' + T('ww.skip') + '</button></div>';
      } else {
        var key = { cupid: 'ww.cupid', guardian: 'ww.guardian', wolves: 'ww.wolves', seer: 'ww.seer' }[act.kind];
        var wv = '';
        if (act.kind === 'wolves' && v.wolfVotes) wv = '<p class="hint">' + Object.keys(v.wolfVotes).map(function (id) { return esc(pn(id)) + ' → ' + esc(pn(v.wolfVotes[id])); }).join('; ') + '</p>';
        body += '<div class="panel"><h3>' + T(key) + '</h3>' + targets(act.targets, O.sel, 'osel') + wv +
          '<button class="btn coral" data-act="oconfirm" data-a="' + act.kind + '"' + (O.sel.length === O.max ? '' : ' disabled') + '>' + T(act.kind === 'cupid' ? 'ww.confirm' : 'ww.confirm') + '</button></div>';
      }
    } else if (v.acted) {
      body += '<div class="panel"><p class="hint">' + T('ww.waiting') + '</p></div>';
    } else if (v.amAlive) {
      body += '<div class="panel"><h3>' + T('ww.sleep', { n: v.night }) + '</h3></div>';
    }
  } else if (v.phase === 'announce') {
    body += '<div class="panel"><h3>' + T('ww.dawn', { n: v.night }) + '</h3>' + (v.announce.length ? v.announce.map(function (id) { var e = v.log.filter(function (x) { return x.id === id && x.k !== 'elim'; }).pop(); return '<p>' + T('ww.died', { name: pn(id), role: t('role.' + (e ? e.role : v.roles && v.roles[id] || 'villager')) }) + '</p>'; }).join('') : '<p>' + T('ww.noDeaths') + '</p>') + '</div>';
  } else if (v.phase === 'hunter') {
    if (act) { O.max = 1; body += '<div class="panel"><h3>' + T('ww.hunter') + '</h3>' + targets(act.targets, O.sel, 'osel') + '<button class="btn coral" data-act="oconfirm" data-a="hunter"' + (O.sel.length ? '' : ' disabled') + '>' + T('ww.confirm') + '</button></div>'; }
    else body += '<div class="panel"><p class="hint">' + T('ww.waiting') + '</p></div>';
  } else if (v.phase === 'vote') {
    if (act) { O.max = 1; body += '<div class="panel"><h3>' + T('ww.vote') + '</h3>' + targets(act.targets, O.sel, 'osel') + '<button class="btn coral" data-act="oconfirm" data-a="vote"' + (O.sel.length ? '' : ' disabled') + '>' + T('ww.confirm') + '</button></div>'; }
    else if (v.mayNotVote) body += '<div class="panel"><p class="hint">' + T('ww.noVote') + '</p></div>';
    else body += '<div class="panel"><p class="hint">' + (v.myVote ? T('ww.voted', { name: pn(v.myVote) }) : T('ww.waiting')) + '</p></div>';
    body += progress(v.voted, v.total);
  } else if (v.phase === 'voteResult') {
    var lr = v.lastResult, e2 = v.log.slice(-1)[0];
    body += '<div class="panel"><h3>' + (lr && lr.kind === 'elim' && e2 ? T('ww.elim', { name: pn(e2.id), role: t('role.' + e2.role) }) : lr && lr.kind === 'idiot' ? T('ww.idiot', { name: pn(lr.id) }) : T('ww.tie')) + '</h3></div>';
  }
  var seer = v.seer && v.seer.length ? '<div class="panel"><ul class="list">' + v.seer.map(function (s) { return '<li><span>' + T(s.wolf ? 'ww.seerRes' : 'ww.seerNo', { name: pn(s.id) }) + '</span></li>'; }).join('') + '</ul></div>' : '';
  var alive = '<div class="panel"><ul class="list">' + v.players.map(function (id) { return '<li><span>' + esc(pn(id)) + '</span><span>' + T(v.alive[id] ? 'ww.alive' : 'ww.dead') + '</span></li>'; }).join('') + '</ul></div>';
  var hist = v.log.length ? '<div class="panel"><div class="label">' + T('ww.history') + '</div><ul class="list">' + v.log.slice().reverse().map(function (e) { return '<li><span>' + logLine(e) + '</span></li>'; }).join('') + '</ul></div>' : '';
  out = '<div class="stage" style="text-align:left">' + role + vb + body + seer + alive + hist +
    (isHost() ? '<button class="btn alt small" data-act="oact" data-a="skip">' + T('ww.skipPhase') + '</button>' : '') + '</div>';
  void R;
  return out;
}

/* ---------- room screen ---------- */
V.room = function () {
  var R = O.R;
  if (!R) return '<div class="stage"><p class="hint">' + T('on.connecting') + '</p></div>';
  var head = O.reconnecting ? '<div class="err" role="alert">' + T('on.connecting') + '</div>' : '';
  var body;
  if (!R.game) body = lobby();
  else {
    var v = R.game, top = '<div class="top"><span class="tag">' + esc(R.code) + '</span><div class="t">' + T('g.' + v.type) + '</div></div>';
    var inner = v.type === 'impostor' || v.type === 'spy' ? hidden(v) : v.type === 'wouldrather' ? wouldRather(v) : v.type === 'bomb' ? bomb(v) : v.type === 'sketch' ? sketch(v) : v.type === 'spectrum' ? spectrum(v) : v.type === 'boxes' ? boxes(v) : v.type === 'chain' ? chain(v) : wolf(v);
    body = top + inner + leaveBtn();
  }
  // keep a half-typed guess and focus across re-renders, re-attach the persistent canvas, start clocks
  var old = document.getElementById('guess'), keepVal = old ? old.value : '', hadFocus = old && document.activeElement === old;
  S.after = function () {
    var host = document.getElementById('cvhost');
    if (host) {
      var cv = canvas(); host.appendChild(cv); cv.style.touchAction = 'none';
      cv.style.cursor = O.canDraw ? 'crosshair' : 'default';
      paintChat();
    }
    var gm = O.R && O.R.game;
    if (gm && gm.type === 'chain') {
      var pv = document.getElementById('cprev'); if (pv && gm.prev) paintStrokes(pv, gm.prev.strokes);
      Array.prototype.forEach.call(document.querySelectorAll('canvas.cvs[data-i]'), function (c) { var e = gm.entries[+c.getAttribute('data-i')]; if (e) paintStrokes(c, e.strokes); });
      if (gm.phase === 'step' && gm.inGame && !gm.mine && O.autoKey !== gm.step) {
        O.autoKey = gm.step; clearTimeout(O.autoT);
        var stp = gm.step, kd = gm.kind;
        O.autoT = setTimeout(function () {
          var cur = O.R && O.R.game; if (!cur || cur.type !== 'chain' || cur.step !== stp || cur.mine) return;
          if (kd === 'draw') post('done'); else { var inp = document.getElementById('ctext'); if (inp && inp.value.trim()) post('text', { text: inp.value.trim() }); }
        }, Math.max(0, gm.endsAt - now()) + 200);
      }
    }
    var sl = document.getElementById('slider');
    if (sl) sl.addEventListener('input', function () { O.sv = +sl.value; });
    var g = document.getElementById('guess');
    if (g) { if (keepVal) g.value = keepVal; if (hadFocus) g.focus(); }
    clearInterval(O.clk);
    var clk = document.getElementById('clock');
    if (clk) {
      var end = +clk.getAttribute('data-end');
      var upd = function () { var c = document.getElementById('clock'); if (!c) { clearInterval(O.clk); return; } var left = Math.ceil((end - now()) / 1000); c.textContent = TP.fmt(left); c.classList.toggle('end', left <= 10); };
      upd(); O.clk = setInterval(upd, 500);
    }
  };
  return head + body;
};

TP.afterInit = function () {
  var sv = saved();
  var qp = ''; try { qp = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); } catch (e) { /* ignore */ }
  if (qp.length === 4 && !(sv && sv.code === qp)) { O.prefill = qp; S.screen = 'online'; try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ } return; }
  if (sv && TP.serverOnline()) { O.code = sv.code; O.pid = sv.pid; O.token = sv.token; S.screen = 'room'; connect(); }
};
TP.onlineGames = ONLINE_GAMES;
};
