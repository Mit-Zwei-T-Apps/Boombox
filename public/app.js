(function () {
'use strict';

/* ---------- constants ---------- */
var GAMES = {
  impostor: { min: 3, max: 20, cls: 'c-impostor', stat: 'impostor' },
  spy: { min: 3, max: 20, cls: 'c-spy', stat: 'spy' },
  wolf: { min: 5, max: 20, cls: 'c-wolf', stat: 'werewolf' },
  wouldrather: { min: 2, max: 20, cls: 'c-wouldrather', stat: 'wouldrather' },
  bomb: { min: 2, max: 20, cls: 'c-bomb', stat: 'bomb' },
  never: { min: 2, max: 20, cls: 'c-never', stat: 'never' },
  truth: { min: 2, max: 20, cls: 'c-truth', stat: 'truth' },
  whoami: { min: 2, max: 20, cls: 'c-whoami', stat: 'whoami' },
  boxes: { min: 2, max: 4, cls: 'c-boxes', stat: 'boxes' }
};
var SPECIALS = ['seer', 'witch', 'hunter', 'cupid', 'guardian', 'girl', 'idiot', 'elder'];
var ROLE_CLS = {
  werewolf: 'r-coral', seer: 'r-lilac', witch: 'r-pink', hunter: 'r-lemon', cupid: 'r-pink',
  guardian: 'r-aqua', girl: 'r-lemon', idiot: 'r-aqua', elder: 'r-lilac', villager: 'r-aqua'
};
var KEY_PLAYERS = 'boombox.players';
var KEY_LANG = 'boombox.lang';

/* ---------- state ---------- */
var app = document.getElementById('app');
var LANGS = [{ code: 'en', name: 'English' }];
var EN = {}, L = {}, lang = 'en';
var server = null;   // /api/config answer, null when there is no API (static hosting)
var me = null;       // signed-in user or null
var soundOn = true, audio = null, timers = [];
var S = {
  screen: 'home', players: loadPlayers(), g: {}, pass: null, b: null, q: null, msg: null, after: null,
  on: {}, cfg: { sketch: { rounds: 2 }, boxes: { n: 5 }, imp: { cat: 'all', n: 1 }, spy: { min: 8 }, wolf: { on: { seer: true }, wolves: 0, narrator: false } }
};

/* ---------- helpers ---------- */
function loadPlayers() {
  try { var v = JSON.parse(localStorage.getItem(KEY_PLAYERS) || 'null'); if (Array.isArray(v) && v.length) return v.slice(0, 20); } catch (e) { /* ignore */ }
  return ['Alex', 'Sam', 'Kim', 'Jo'];
}
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function t(k, v) {
  var s = L[k] !== undefined ? L[k] : (EN[k] !== undefined ? EN[k] : k);
  if (v) s = s.replace(/\{(\w+)\}/g, function (m, n) { return v[n] !== undefined ? v[n] : m; });
  return s;
}
function T(k, v) { return esc(t(k, v)); }
var custom = {};
function D(name) {
  var base = (L.data && L.data[name]) || EN.data[name], c = custom[name];
  if (!c || !c.length) return base;
  if (name === 'words') { var o = Object.assign({}, base); o.custom = { label: t('custom'), list: c }; return o; }
  return base.concat(c);
}
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function stopAll() { timers.forEach(function (x) { clearTimeout(x); clearInterval(x); }); timers = []; }
function later(fn, ms) { var x = setTimeout(fn, ms); timers.push(x); return x; }
function every(fn, ms) { var x = setInterval(fn, ms); timers.push(x); return x; }
function fmt(s) { s = Math.max(0, s); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
function toast(msg) {
  var el = document.getElementById('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2800);
}
function beep(freq, dur, vol) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    var o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square'; o.frequency.value = freq; g.gain.value = vol || 0.08;
    o.connect(g); g.connect(audio.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.stop(audio.currentTime + dur + 0.02);
  } catch (e) { /* no audio */ }
}
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }
function go(screen, extra, keepMsg) {
  stopAll(); S.screen = screen; if (!keepMsg) S.msg = null;
  if (extra) Object.assign(S.g, extra);
  render(); window.scrollTo(0, 0);
}

/* ---------- api (optional accounts) ---------- */
function api(method, url, body) {
  var opts = { method: method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch(url, opts).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) { var e = new Error(j.error || 'generic'); e.code = j.error || 'generic'; e.status = r.status; throw e; }
      return j;
    });
  }, function () { var e = new Error('network'); e.code = 'network'; throw e; });
}
function errText(e) { var k = 'err.' + (e && e.code); return L[k] !== undefined || EN[k] !== undefined ? t(k) : t('err.generic'); }
function setMsg(type, text) { S.msg = { type: type, text: text }; }
var syncTimer = null;
function syncProfile() {
  if (!me || me.mustChange) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function () {
    api('PUT', 'api/profile', { players: S.players, lang: lang }).then(function (r) { me = r.user; }, function () { /* offline, try next time */ });
  }, 500);
}
function recordGame(game) {
  if (!me || me.mustChange) return;
  api('POST', 'api/stats', { game: GAMES[game].stat }).then(function (r) { me = r.user; }, function () { /* ignore */ });
}
function savePlayers() { try { localStorage.setItem(KEY_PLAYERS, JSON.stringify(S.players)); } catch (e) { /* ignore */ } syncProfile(); }

/* ---------- languages ---------- */
function getJson(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
function supported(code) { return LANGS.some(function (l) { return l.code === code; }); }
function detectLang() {
  var saved = null; try { saved = localStorage.getItem(KEY_LANG); } catch (e) { /* ignore */ }
  if (me && me.profile && supported(me.profile.lang)) return me.profile.lang;
  if (saved && supported(saved)) return saved;
  var prefs = navigator.languages || [navigator.language || 'en'];
  for (var i = 0; i < prefs.length; i++) { var c = String(prefs[i]).slice(0, 2).toLowerCase(); if (supported(c)) return c; }
  return 'en';
}
function loadLang(code) {
  if (code === 'en') { L = EN; lang = 'en'; document.documentElement.lang = 'en'; return Promise.resolve(); }
  return getJson('locales/' + code + '.json').then(function (j) { L = j; lang = code; document.documentElement.lang = code; }, function () { L = EN; lang = 'en'; });
}
function setLang(code) {
  if (!supported(code)) return;
  try { localStorage.setItem(KEY_LANG, code); } catch (e) { /* ignore */ }
  loadLang(code).then(function () { syncProfile(); render(); });
}

/* ---------- ui blocks ---------- */
var V = {};
var A = {};
function top(title, backTo) {
  return '<div class="top"><button class="back" data-act="go" data-a="' + (backTo || 'home') + '">' + T('back') + '</button><div class="t">' + esc(title) + '</div></div>';
}
function msgBox() { return S.msg ? '<div class="' + (S.msg.type === 'err' ? 'err' : 'ok') + '" role="alert">' + esc(S.msg.text) + '</div>' : ''; }
function stepper(label, val, key, hint) {
  return '<div class="panel"><div class="label">' + esc(label) + '</div><div class="step">' +
    '<button data-act="step" data-a="' + key + '" data-b="-1" aria-label="−">−</button><div class="v">' + val + '</div>' +
    '<button data-act="step" data-a="' + key + '" data-b="1" aria-label="+">+</button></div>' +
    (hint ? '<p class="hint">' + esc(hint) + '</p>' : '') + '</div>';
}
function toggle(label, sub, on, key) {
  return '<button class="toggle" data-act="tog" data-a="' + key + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><span>' + esc(label) +
    (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><i class="sw' + (on ? ' on' : '') + '"></i></button>';
}
function field(id, label, type, extra) {
  return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" name="' + id + '" type="' + type + '" ' + (extra || '') + ' required></div>';
}
function bombSvg() {
  return '<svg class="bomb" id="bomb" viewBox="0 0 120 130" aria-hidden="true">' +
    '<circle cx="56" cy="78" r="42" fill="#04141C"/><circle cx="56" cy="78" r="42" fill="none" stroke="#FFD84A" stroke-width="5"/>' +
    '<ellipse cx="40" cy="62" rx="10" ry="7" fill="#F3F7F2" opacity=".35" transform="rotate(-35 40 62)"/>' +
    '<rect x="46" y="28" width="22" height="14" rx="3" fill="#A3BDC7"/>' +
    '<path d="M62 28 C62 14 80 18 84 8" fill="none" stroke="#FFD84A" stroke-width="5" stroke-linecap="round"/>' +
    '<circle cx="88" cy="8" r="7" fill="#FF6B57"/><circle cx="88" cy="8" r="3" fill="#FFD84A"/></svg>';
}

/* ---------- screens ---------- */
V.home = function () {
  var langs = LANGS.map(function (l) { return '<option value="' + esc(l.code) + '"' + (l.code === lang ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('');
  var acc = server ? '<button class="' + (me ? 'me' : '') + '" data-act="go" data-a="' + (me && me.mustChange ? 'changepw' : 'account') + '">' + (me ? esc(me.name) : T('signIn')) + '</button>' : '';
  var cards = Object.keys(GAMES).map(function (id) {
    var g = GAMES[id];
    return '<button class="card ' + g.cls + '" data-act="game" data-a="' + id + '"><h3>' + T('g.' + id) + '</h3><p>' + T('g.' + id + '.d') + '</p><span class="meta">' + T('range', { min: g.min, max: g.max }) + '</span></button>';
  }).join('');
  return '<header><h1 class="wordmark">Boombox</h1><p class="kicker">' + T('appSub') + '</p><p class="sub">' + T('tagline') + '</p></header>' +
    '<div class="tools"><select id="lang" aria-label="' + T('language') + '">' + langs + '</select>' + acc + '</div>' +
    '<button class="bar" data-act="go" data-a="players"><b>' + S.players.length + '</b><span><span class="l">' + T('players') + '</span><span class="n">' + S.players.map(esc).join(', ') + '</span></span><span class="go">' + T('change') + '</span></button>' +
    (server && server.online ? '<button class="card c-online" data-act="go" data-a="online"><h3>' + T('onlineTitle') + '</h3><p>' + T('onlineDesc') + '</p><span class="meta">' + T('onlineTag') + '</span></button>' : '') +
    '<div class="grid">' + cards + '</div>' +
    '<div class="foot"><p>' + T('footer1') + '</p><p>' + T('footer2') + '</p></div>';
};

V.players = function () {
  var chips = S.players.map(function (n, i) {
    return '<span class="chip p">' + esc(n) + '<button data-act="del" data-a="' + i + '" aria-label="' + T('pl.remove', { name: n }) + '">×</button></span>';
  }).join('');
  return top(t('pl.title')) +
    '<div class="panel"><div class="label">' + T('pl.label') + '</div>' +
    '<form class="add" data-form="add" autocomplete="off"><input id="pname" type="text" maxlength="18" placeholder="' + T('pl.ph') + '" aria-label="' + T('pl.ph') + '"><button class="btn" type="submit">' + T('pl.add') + '</button></form>' +
    '<div class="chips">' + (chips || '<p class="hint">' + T('pl.none') + '</p>') + '</div>' +
    '<p class="hint">' + T('pl.count', { n: S.players.length }) + '</p></div>' +
    '<button class="btn" data-act="go" data-a="home">' + T('done') + '</button>';
};

/* hand-the-phone-around flow shared by Impostor, Spy, Werewolf */
V.pass = function () {
  var P = S.pass, it = P.items[P.i];
  var pr = '<div class="prog"><i style="width:' + Math.round(P.i / P.items.length * 100) + '%"></i></div>';
  if (!P.shown) {
    return pr + '<div class="stage"><p class="kicker">' + T('pass.hand') + '</p><h2 class="big">' + esc(it.name) + '</h2>' +
      '<p class="hint">' + T('pass.only') + '</p>' +
      '<button class="btn" data-act="pshow">' + T('pass.iam', { name: it.name }) + '</button>' +
      '<p class="kicker">' + T('pass.of', { i: P.i + 1, n: P.items.length }) + '</p></div>';
  }
  var last = P.i === P.items.length - 1;
  return pr + '<div class="stage">' + it.html + '<button class="btn alt" data-act="pnext">' + (last ? T('pass.last') : T('pass.cover')) + '</button></div>';
};
function startPass(items, done) { S.pass = { items: items, i: 0, shown: false, done: done }; go('pass'); }

/* Impostor */
V.impSetup = function () {
  var c = S.cfg.imp, n = S.players.length, maxI = Math.max(1, Math.floor((n - 1) / 2)), words = D('words');
  if (c.n > maxI) c.n = maxI;
  var cats = ['all'].concat(Object.keys(words)).map(function (k) {
    return '<button class="chip' + (c.cat === k ? ' on' : '') + '" data-act="impcat" data-a="' + k + '">' + (k === 'all' ? T('imp.all') : esc(words[k].label)) + '</button>';
  }).join('');
  return top(t('g.impostor')) +
    '<div class="panel"><div class="label">' + T('imp.topic') + '</div><div class="chips">' + cats + '</div></div>' +
    stepper(t('imp.count'), c.n, 'imp', t('imp.hint', { n: n, max: maxI })) +
    '<button class="btn coral" data-act="impStart">' + T('imp.deal') + '</button>';
};
V.impPlay = function () {
  var g = S.g;
  var res = g.reveal ?
    '<div class="role r-coral"><p class="kicker">' + T('revealed') + '</p><h2>' + g.imps.map(esc).join(T('imp.and')) + '</h2><p>' + T(g.imps.length > 1 ? 'imp.wasN' : 'imp.was1') + '</p></div>' +
    '<div class="role r-lemon"><p class="kicker">' + T('imp.theWord') + '</p><h2>' + esc(g.word) + '</h2></div>' +
    '<div class="row"><button class="btn alt" data-act="impStart">' + T('newRound') + '</button><button class="btn" data-act="go" data-a="home">' + T('overview') + '</button></div>' :
    '<button class="btn coral" data-act="reveal">' + T('imp.vote') + '</button>';
  return '<div class="stage"><p class="kicker">' + T('starts') + '</p><h2 class="big">' + esc(g.starter) + '</h2>' +
    '<p class="hint">' + T('imp.rules') + '</p>' +
    (g.reveal ? '' : '<div class="panel"><div class="label">' + T('imp.discuss') + '</div><div class="clock" id="clock">3:00</div><button class="btn alt" data-act="clock" data-a="180">' + T('imp.timer') + '</button></div>') +
    res + '</div>';
};

/* Spy */
V.spySetup = function () {
  return top(t('g.spy')) + stepper(t('spy.len'), S.cfg.spy.min, 'spy', t('spy.hint')) +
    '<button class="btn" data-act="spyStart">' + T('imp.deal') + '</button>';
};
V.spyPlay = function () {
  var g = S.g;
  var res = g.reveal ?
    '<div class="role r-lemon"><p class="kicker">' + T('revealed') + '</p><h2>' + esc(g.spy) + '</h2><p>' + T('spy.res', { spy: g.spy, place: g.place }) + '</p></div>' +
    '<div class="row"><button class="btn alt" data-act="spyStart">' + T('newRound') + '</button><button class="btn" data-act="go" data-a="home">' + T('overview') + '</button></div>' :
    '<button class="btn" data-act="reveal">' + T('reveal') + '</button>';
  return '<div class="stage"><p class="kicker">' + T('starts') + '</p><h2 class="big">' + esc(g.starter) + '</h2>' +
    '<p class="hint">' + T('spy.rules') + '</p>' +
    (g.reveal ? '' : '<div class="panel"><div class="label">' + T('timeLeft') + '</div><div class="clock" id="clock">' + fmt(S.cfg.spy.min * 60) + '</div></div>') +
    res + '</div>';
};

/* Werewolf */
function nPlayers() { return S.screen === 'room' && S.on.R ? S.on.R.players.length : S.players.length; }
function wolfCounts(online) {
  var c = S.cfg.wolf, n = online ? nPlayers() : S.players.length - (c.narrator ? 1 : 0);
  var sp = SPECIALS.filter(function (r) { return c.on[r]; }).length;
  var maxW = Math.max(1, n - sp - 1);
  var w = c.wolves > 0 ? c.wolves : Math.max(1, Math.round(n / 4));
  w = Math.min(w, maxW);
  var vill = n - w - sp;
  return { n: n, sp: sp, w: w, vill: vill, maxW: maxW, ok: n >= 5 && vill >= 1 };
}
V.wolfSetup = function () {
  var c = S.cfg.wolf, k = wolfCounts();
  var tg = SPECIALS.map(function (r) { return toggle(t('role.' + r), t('role.' + r + '.t'), !!c.on[r], 'role:' + r); }).join('');
  return top(t('g.wolf')) +
    '<div class="panel"><div class="label">' + T('wolf.special') + '</div>' + tg + '</div>' +
    stepper(t('wolf.count'), k.w, 'wolves') +
    '<div class="panel">' + toggle(t('wolf.narr'), t('wolf.narr.d'), c.narrator, 'narrator') + '</div>' +
    '<div class="panel"><div class="label">' + T('wolf.dist') + '</div><ul class="list">' +
    '<li><span>' + T('wolf.count') + '</span><span>' + k.w + '</span></li>' +
    '<li><span>' + T('wolf.specials') + '</span><span>' + k.sp + '</span></li>' +
    '<li><span>' + T('wolf.villagers') + '</span><span>' + Math.max(0, k.vill) + '</span></li></ul>' +
    (k.ok ? '' : '<p class="hint">' + T('wolf.more') + '</p>') + '</div>' +
    '<button class="btn lilac" data-act="wolfStart"' + (k.ok ? '' : ' disabled') + '>' + T('wolf.deal') + '</button>';
};
function wolfSteps() {
  var g = S.g;
  return g.steps.filter(function (s) { return !(s.first && g.night > 1); });
}
V.wolfPlay = function () {
  var g = S.g;
  if (g.reveal) {
    var rows = g.assign.map(function (a) { return '<li><span>' + esc(a.name) + '</span><span>' + T('role.' + a.role) + '</span></li>'; }).join('');
    return top(t('wolf.rolesTitle'), 'home') + '<div class="panel"><div class="label">' + T('wolf.whoWas') + '</div><ul class="list">' + rows + '</ul></div>' +
      '<button class="btn alt" data-act="unreveal">' + T('wolf.backGame') + '</button>';
  }
  var steps = wolfSteps(), s = steps[Math.min(g.step, steps.length - 1)];
  return '<div class="stage"><span class="tag ' + (s.night ? 'night' : 'day') + '">' + (s.night ? T('wolf.night') : T('wolf.day')) + ' ' + (s.night ? g.night : g.night) + '</span>' +
    '<p class="script">' + T(s.key) + '</p>' +
    '<div class="prog"><i style="width:' + Math.round((g.step + 1) / steps.length * 100) + '%"></i></div>' +
    (g.step < steps.length - 1 ?
      '<button class="btn lilac" data-act="wnext">' + T('wolf.next') + '</button>' :
      '<button class="btn lilac" data-act="wnight">' + T('wolf.nextNight') + '</button>') +
    '<div class="row"><button class="btn alt small" data-act="wprev"' + (g.step === 0 ? ' disabled' : '') + '>' + T('wolf.prev') + '</button><button class="btn alt small" data-act="wreveal">' + T('wolf.rolesShow') + '</button></div>' +
    '<p class="hint">' + (g.narrator ? T('wolf.narrIs', { name: g.narrator }) : T('wolf.reader')) + '</p></div>';
};

/* Who would rather */
V.wouldrather = function () {
  var Q = S.q;
  return top(t('g.wouldrather')) + '<div class="stage"><p class="kicker">' + T('wouldrather', { n: Q.i + 1 }) + '</p><p class="q">' + esc(Q.order[Q.i]) + '</p>' +
    '<p class="hint">' + T('wq.rules') + '</p><button class="btn aqua" data-act="qnext">' + T('wq.next') + '</button></div>';
};

/* Bomb */
V.bomb = function () {
  var B = S.b;
  if (!B.armed) {
    return top(t('g.bomb')) + '<div class="stage">' + bombSvg() +
      '<p class="kicker">' + T('bomb.topic') + '</p><p class="q">' + esc(B.prompt) + '</p>' +
      '<p class="hint">' + T('bomb.rules') + '</p>' +
      '<p class="kicker">' + T('bomb.startsAt', { name: S.players[B.holder] }) + '</p>' +
      '<button class="btn pink" data-act="arm">' + T('bomb.arm') + '</button>' +
      '<button class="btn alt small" data-act="snd">' + T('bomb.sound', { state: t(soundOn ? 'on' : 'off') }) + '</button></div>';
  }
  return '<div class="stage">' + bombSvg() + '<p class="kicker">' + esc(B.prompt) + '</p>' +
    '<h2 class="big">' + esc(S.players[B.holder]) + '</h2><p class="hint">' + T('bomb.say') + '</p>' +
    '<button class="btn pink" data-act="bpass">' + T('bomb.pass', { name: S.players[(B.holder + 1) % S.players.length] }) + '</button></div>';
};
V.boom = function () {
  var B = S.b;
  var rows = S.players.map(function (n, i) { return { n: n, v: B.scores[i] || 0 }; }).sort(function (a, b) { return b.v - a.v; })
    .map(function (r) { return '<li><span>' + esc(r.n) + '</span><span>' + T('bomb.times', { n: r.v }) + '</span></li>'; }).join('');
  return '<div class="stage"><div class="boom"><p class="kicker" style="color:#fff">' + T('bomb.boomAt') + '</p><h1>' + T('bomb.boom') + '</h1><h2 class="big" style="color:#fff">' + esc(S.players[B.holder]) + '</h2></div>' +
    '<div class="panel"><div class="label">' + T('bomb.lost') + '</div><ul class="list">' + rows + '</ul></div>' +
    '<button class="btn pink" data-act="bnew">' + T('bomb.next') + '</button><button class="btn alt" data-act="go" data-a="home">' + T('bomb.finish') + '</button></div>';
};

/* Dots and boxes */
V.boxesSetup = function () {
  var n = Math.min(4, S.players.length);
  return top(t('g.boxes')) + '<div class="panel"><p class="hint">' + T('bx.local', { n: n }) + '</p></div>' + stepper(t('bx.size'), S.cfg.boxes.n, 'boxes', t('bx.limit')) +
    '<button class="btn lemon" data-act="bxStart">' + T('bx.start') + '</button>';
};
A.bxStart = function () {
  var names = S.players.slice(0, 4);
  S.bx = { s: TPBoxes.create(S.cfg.boxes.n, names.length), names: names };
  recordGame('boxes'); go('boxes');
};
V.boxes = function () {
  var X = S.bx, s = X.s, letters = X.names.map(function (n) { return n.charAt(0).toUpperCase(); });
  var rows = X.names.map(function (n, i) { return '<li><span><i class="dot" style="background:' + TPBoxes.COLORS[i] + '"></i> ' + esc(n) + (i === s.turn && !s.done ? ' ◀' : '') + '</span><span>' + s.scores[i] + '</span></li>'; }).join('');
  var w = s.done ? TPBoxes.winners(s) : [];
  var head = s.done ? '<h2 class="q">' + (w.length > 1 ? T('bx.tie') : T('bx.win', { name: X.names[w[0]] })) + '</h2>' : '<p class="kicker">' + T('bx.turn', { name: X.names[s.turn] }) + '</p>';
  return top(t('g.boxes')) + '<div class="stage">' + head + TPBoxes.svg(s, 'bxedge', letters) + '<div class="panel"><ul class="list">' + rows + '</ul></div>' +
    (s.done ? '<button class="btn lemon" data-act="bxStart">' + T('on.again') + '</button>' : '') + '</div>';
};
A.bxedge = function (key) { var got = TPBoxes.move(S.bx.s, key); if (got < 0) return; buzz(got ? [30, 40, 30] : 12); if (got) beep(880, 0.08, 0.06); render(); };

/* Never have I ever */
V.never = function () {
  var Q = S.q;
  return top(t('g.never')) + '<div class="stage"><p class="kicker">' + T('never.kicker', { n: Q.i + 1 }) + '</p><p class="q">' + esc(Q.order[Q.i]) + '</p>' +
    '<p class="hint">' + T('never.rules') + '</p><button class="btn lemon" data-act="nnext">' + T('wq.next') + '</button></div>';
};
A.nnext = function () {
  var Q = S.q; Q.i++;
  if (Q.i >= Q.order.length) { Q.order = shuffle(D('never')); Q.i = 0; toast(t('wq.again')); }
  render();
};

/* Truth or dare */
V.truth = function () {
  var X = S.tod, name = S.players[X.who];
  var body = X.card
    ? '<p class="kicker">' + T(X.card.kind === 'truth' ? 'tod.truth' : 'tod.dare') + '</p><p class="q">' + esc(X.card.text) + '</p><button class="btn lemon" data-act="tnext">' + T('tod.next') + '</button>'
    : '<p class="hint">' + T('tod.choose') + '</p><div class="row"><button class="btn aqua" data-act="tpick" data-a="truth">' + T('tod.truth') + '</button><button class="btn coral" data-act="tpick" data-a="dare">' + T('tod.dare') + '</button></div>';
  return top(t('g.truth')) + '<div class="stage"><p class="kicker">' + T('tod.turn') + '</p><h2 class="big">' + esc(name) + '</h2>' + body + '</div>';
};
A.tpick = function (kind) {
  var X = S.tod, list = D(kind), key = kind + 'U';
  var left = list.filter(function (x) { return (X.used || []).indexOf(x) < 0; });
  if (!left.length) { X.used = (X.used || []).filter(function (x) { return list.indexOf(x) < 0; }); left = list; }
  var text = pick(left); X.used.push(text); X.card = { kind: kind, text: text }; void key; render();
};
A.tnext = function () { var X = S.tod; X.card = null; X.who = (X.who + 1) % S.players.length; render(); };

/* Who am I (word on the forehead) */
function allWords() { var w = D('words'), out = []; Object.keys(w).forEach(function (k) { out = out.concat(w[k].list); }); return out; }
V.whoami = function () {
  var W = S.wh, name = S.players[W.i];
  if (W.turn === 'end') {
    var rows = S.players.map(function (n, i) { return { n: n, v: W.scores[i] || 0 }; }).sort(function (a, b) { return b.v - a.v; })
      .map(function (r) { return '<li><span>' + esc(r.n) + '</span><span>' + r.v + '</span></li>'; }).join('');
    return top(t('g.whoami')) + '<div class="stage"><div class="panel"><div class="label">' + T('on.score') + '</div><ul class="list">' + rows + '</ul></div>' +
      '<button class="btn lemon" data-act="whnext">' + T('who.nextPlayer') + '</button></div>';
  }
  if (!W.running) {
    return top(t('g.whoami')) + '<div class="stage"><p class="kicker">' + T('who.turn') + '</p><h2 class="big">' + esc(name) + '</h2><p class="hint">' + T('who.rules') + '</p>' +
      '<button class="btn lemon" data-act="whgo">' + T('who.go') + '</button></div>';
  }
  return '<div class="stage"><div class="clock" id="clock">--</div><div class="role r-lemon"><p class="kicker">' + T('who.guess') + '</p><h2>' + esc(W.order[W.w % W.order.length]) + '</h2></div>' +
    '<div class="row"><button class="btn aqua" data-act="whgot">' + T('who.got', { n: W.got }) + '</button><button class="btn alt" data-act="whskip">' + T('who.skip') + '</button></div></div>';
};
A.whgo = function () {
  var W = S.wh; W.running = true; W.got = 0; render();
  var end = Date.now() + 60000;
  every(function () {
    var left = Math.ceil((end - Date.now()) / 1000), c = document.getElementById('clock'); if (c) { c.textContent = fmt(left); if (left <= 10) c.classList.add('end'); }
    if (left <= 0) { stopAll(); W.running = false; W.scores[W.i] = (W.scores[W.i] || 0) + W.got; W.turn = 'end'; buzz([200, 100, 200]); beep(520, 0.5, 0.1); render(); }
  }, 250);
  render();
};
A.whgot = function () { var W = S.wh; W.got++; W.w++; buzz(15); beep(880, 0.08, 0.06); render(); };
A.whskip = function () { var W = S.wh; W.w++; render(); };
A.whnext = function () { var W = S.wh; W.i = (W.i + 1) % S.players.length; W.turn = null; render(); };

/* Accounts */
V.account = function () {
  if (!me) {
    var reg = S.g.mode === 'register';
    return top(t('acc.title')) + '<div class="panel"><p class="hint">' + T('acc.guestInfo') + '</p>' + msgBox() +
      '<form class="stack" data-form="' + (reg ? 'register' : 'login') + '" autocomplete="on">' +
      field('username', t('acc.username'), 'text', 'maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false"') +
      field('password', t('acc.password'), 'password', 'maxlength="128" autocomplete="' + (reg ? 'new-password' : 'current-password') + '"') +
      (reg ? field('password2', t('acc.password2'), 'password', 'maxlength="128" autocomplete="new-password"') : '') +
      '<button class="btn" type="submit">' + T(reg ? 'acc.register' : 'acc.login') + '</button></form>' +
      ((server && server.allowRegister) || reg ? '<button class="btn alt small" data-act="mode" data-a="' + (reg ? 'login' : 'register') + '">' + T(reg ? 'acc.toLogin' : 'acc.toRegister') + '</button>' : '') +
      '</div>';
  }
  var st = me.profile.stats || {}, names = { impostor: 'g.impostor', spy: 'g.spy', werewolf: 'g.wolf', wouldrather: 'g.wouldrather', bomb: 'g.bomb', never: 'g.never', truth: 'g.truth', whoami: 'g.whoami', boxes: 'g.boxes', spectrum: 'g.spectrum' };
  var rows = Object.keys(names).filter(function (k) { return st[k]; }).map(function (k) { return '<li><span>' + T(names[k]) + '</span><span>' + st[k] + '×</span></li>'; }).join('');
  return top(t('acc.title')) + msgBox() +
    '<div class="panel"><div class="label">' + T('acc.loggedAs', { name: me.name }) + '</div>' +
    '<div class="label">' + T('acc.stats') + '</div>' + (rows ? '<ul class="list">' + rows + '</ul>' : '<p class="hint">' + T('acc.statsNone') + '</p>') +
    (me.admin ? '<button class="btn alt" data-act="admin">' + T('acc.admin') + '</button>' : '') +
    '<button class="btn alt" data-act="logout">' + T('acc.logout') + '</button></div>' +
    '<div class="panel"><div class="label">' + T('acc.changePw') + '</div>' + pwForm() + '</div>' +
    (me.admin ? '' : '<div class="panel"><div class="label">' + T('acc.delete') + '</div><p class="hint">' + T('acc.deleteHint') + '</p>' +
      '<form class="stack" data-form="del">' + field('delpw', t('acc.password'), 'password', 'autocomplete="current-password"') +
      '<button class="btn coral" type="submit">' + T('acc.delete') + '</button></form></div>');
};
function pwForm() {
  return '<form class="stack" data-form="pw">' +
    field('curpw', t('acc.currentPw'), 'password', 'autocomplete="current-password"') +
    field('newpw', t('acc.newPw'), 'password', 'maxlength="128" autocomplete="new-password"') +
    '<button class="btn" type="submit">' + T('acc.save') + '</button></form>';
}
V.changepw = function () {
  return '<header><h1 class="wordmark">Boombox</h1></header>' + msgBox() +
    '<div class="panel"><div class="label">' + T('acc.changePw') + '</div><p class="hint">' + T('acc.mustChange') + '</p>' + pwForm() +
    '<button class="btn alt" data-act="logout">' + T('acc.logout') + '</button></div>';
};
V.admin = function () {
  var list = S.g.users || [];
  var rows = list.map(function (u) {
    var self = me && u.name.toLowerCase() === me.name.toLowerCase();
    return '<li><span>' + esc(u.name) + (self ? ' (' + T('adm.you') + ')' : '') + '</span><span>' +
      '<button class="btn alt" data-act="areset" data-a="' + esc(u.name) + '">' + T('adm.reset') + '</button> ' +
      (self ? '' : '<button class="btn coral" data-act="aremove" data-a="' + esc(u.name) + '">' + T('adm.remove') + '</button>') + '</span></li>';
  }).join('');
  var CL = ['words', 'questions', 'never', 'truth', 'dare', 'bomb'];
  var cform = '<form class="stack" data-form="custom" style="flex-direction:column">' + CL.map(function (k) {
    return '<div class="field"><label for="cl-' + k + '">' + T('cl.' + k) + '</label><textarea id="cl-' + k + '" name="' + k + '" maxlength="30000" spellcheck="false">' + esc((custom[k] || []).join('\n')) + '</textarea></div>';
  }).join('') + '<button class="btn" type="submit">' + T('adm.save') + '</button></form>';
  return top(t('adm.title'), 'account') + msgBox() +
    '<div class="panel"><div class="label">' + T('adm.custom') + '</div><p class="hint">' + T('adm.customHint') + '</p>' + cform + '</div>' +
    '<div class="panel"><div class="label">' + T('adm.limit', { n: list.length, max: S.g.max || '' }) + '</div><ul class="list">' + rows + '</ul></div>';
};

function render() {
  app.innerHTML = V[S.screen]();
  if (S.screen === 'players') { var inp = document.getElementById('pname'); if (inp && S.players.length < 20) inp.focus({ preventScroll: true }); }
  if (S.after) { var fn = S.after; S.after = null; fn(); }
}

/* ---------- clock ---------- */
function runClock(sec) {
  var el = document.getElementById('clock'); if (!el) return;
  var end = Date.now() + sec * 1000;
  every(function () {
    var left = Math.ceil((end - Date.now()) / 1000), c = document.getElementById('clock'); if (!c) return;
    c.textContent = fmt(left);
    if (left <= 10) c.classList.add('end');
    if (left <= 0) { stopAll(); c.textContent = t('timeUp'); buzz([200, 100, 200]); beep(520, 0.5, 0.1); }
  }, 250);
}

/* ---------- actions ---------- */
A.go = function (a) { go(a); };
A.game = function (id) {
  var g = GAMES[id], n = S.players.length;
  if (n < g.min) { toast(t('needPlayers', { game: t('g.' + id), min: g.min })); return; }
  if (id === 'impostor') go('impSetup');
  else if (id === 'spy') go('spySetup');
  else if (id === 'wolf') go('wolfSetup');
  else if (id === 'wouldrather') { S.q = { order: shuffle(D('questions')), i: 0 }; recordGame('wouldrather'); go('wouldrather'); }
  else if (id === 'never') { S.q = { order: shuffle(D('never')), i: 0 }; recordGame('never'); go('never'); }
  else if (id === 'truth') { S.tod = { who: Math.floor(Math.random() * n), card: null, used: [] }; recordGame('truth'); go('truth'); }
  else if (id === 'whoami') { S.wh = { i: 0, scores: {}, order: shuffle(allWords()), w: 0, running: false, got: 0, skipped: [], turn: null }; recordGame('whoami'); go('whoami'); }
  else if (id === 'boxes') { go('boxesSetup'); }
  else if (id === 'bomb') { S.b = { scores: {}, holder: 0, armed: false, used: [], prompt: '' }; newBomb(); recordGame('bomb'); go('bomb'); }
};
A.del = function (i) { S.players.splice(+i, 1); savePlayers(); render(); };
A.step = function (k, d) {
  d = +d;
  if (k === 'imp') { var m = Math.max(1, Math.floor((nPlayers() - 1) / 2)); S.cfg.imp.n = Math.min(m, Math.max(1, S.cfg.imp.n + d)); }
  if (k === 'spy') S.cfg.spy.min = Math.min(20, Math.max(2, S.cfg.spy.min + d));
  if (k === 'boxes') S.cfg.boxes.n = Math.min(7, Math.max(3, S.cfg.boxes.n + d));
  if (k === 'sketch') S.cfg.sketch.rounds = Math.min(4, Math.max(1, S.cfg.sketch.rounds + d));
  if (k === 'wolves') { var c = wolfCounts(S.screen === 'room'); S.cfg.wolf.wolves = Math.min(c.maxW, Math.max(1, c.w + d)); }
  render();
};
A.tog = function (k) {
  var c = S.cfg.wolf;
  if (k === 'narrator') c.narrator = !c.narrator;
  else if (k.indexOf('role:') === 0) { var r = k.slice(5); c.on[r] = !c.on[r]; }
  render();
};
A.impcat = function (k) { S.cfg.imp.cat = k; render(); };
A.reveal = function () { stopAll(); S.g.reveal = true; render(); };
A.unreveal = function () { S.g.reveal = false; render(); };
A.clock = function (sec) { runClock(+sec); };
A.pshow = function () { S.pass.shown = true; render(); buzz(20); };
A.pnext = function () {
  var P = S.pass;
  if (P.i >= P.items.length - 1) { P.done(); return; }
  P.i++; P.shown = false; render(); window.scrollTo(0, 0);
};
A.snd = function () { soundOn = !soundOn; render(); };

/* Impostor */
A.impStart = function () {
  var c = S.cfg.imp, words = D('words'), keys = Object.keys(words);
  var pool = c.cat === 'all' || !words[c.cat] ? [].concat.apply([], keys.map(function (k) { return words[k].list; })) : words[c.cat].list;
  var word = pick(pool), idx = shuffle(S.players.map(function (_, i) { return i; })).slice(0, c.n);
  var imps = idx.map(function (i) { return S.players[i]; });
  var catLabel = c.cat !== 'all' && words[c.cat] ? words[c.cat].label : null;
  var items = S.players.map(function (name, i) {
    var isImp = idx.indexOf(i) > -1;
    var html = isImp ?
      '<div class="role r-coral"><p class="kicker">' + T('imp.youAre') + '</p><h2>' + T('imp.role') + '</h2><p>' + T('imp.roleText') + (catLabel ? T('imp.topicIs', { cat: catLabel }) : '') + '</p></div>' :
      '<div class="role r-aqua"><p class="kicker">' + T('imp.wordIs') + '</p><h2>' + esc(word) + '</h2><p>' + T('imp.wordText') + '</p></div>';
    return { name: name, html: html };
  });
  recordGame('impostor');
  startPass(items, function () { go('impPlay', { word: word, imps: imps, starter: pick(S.players), reveal: false }); });
};

/* Spy */
A.spyStart = function () {
  var place = pick(D('places')), spyI = Math.floor(Math.random() * S.players.length);
  var items = S.players.map(function (name, i) {
    var html = i === spyI ?
      '<div class="role r-lemon"><p class="kicker">' + T('imp.youAre') + '</p><h2>' + T('spy.role') + '</h2><p>' + T('spy.roleText') + '</p></div>' :
      '<div class="role r-aqua"><p class="kicker">' + T('spy.placeIs') + '</p><h2>' + esc(place) + '</h2><p>' + T('spy.placeText') + '</p></div>';
    return { name: name, html: html };
  });
  recordGame('spy');
  startPass(items, function () {
    S.after = function () { runClock(S.cfg.spy.min * 60); };
    go('spyPlay', { place: place, spy: S.players[spyI], starter: pick(S.players), reveal: false });
  });
};

/* Werewolf */
A.wolfStart = function () {
  var c = S.cfg.wolf, list = S.players.slice(), narr = null;
  if (c.narrator) narr = list.shift();
  var k = wolfCounts();
  if (!k.ok) { toast(t('wolf.tooFew')); return; }
  var roles = [], i;
  for (i = 0; i < k.w; i++) roles.push('werewolf');
  SPECIALS.forEach(function (r) { if (c.on[r]) roles.push(r); });
  while (roles.length < list.length) roles.push('villager');
  roles = shuffle(roles);
  var assign = list.map(function (name, j) { return { name: name, role: roles[j] }; });
  var wolves = assign.filter(function (a) { return a.role === 'werewolf'; }).map(function (a) { return a.name; });
  var items = assign.map(function (a) {
    var extra = a.role === 'werewolf' && wolves.length > 1 ? '<p>' + T('wolf.pack', { names: wolves.filter(function (x) { return x !== a.name; }).join(', ') }) + '</p>' : '';
    return { name: a.name, html: '<div class="role ' + ROLE_CLS[a.role] + '"><p class="kicker">' + T('wolf.yourRole') + '</p><h2>' + T('role.' + a.role).toUpperCase() + '</h2><p>' + T('role.' + a.role + '.t') + '</p>' + extra + '</div>' };
  });
  var steps = [{ night: true, key: 'wolf.n1' }];
  if (c.on.cupid) steps.push({ night: true, key: 'wolf.nCupid', first: true });
  if (c.on.guardian) steps.push({ night: true, key: 'wolf.nGuardian' });
  steps.push({ night: true, key: 'wolf.nWolves' });
  if (c.on.seer) steps.push({ night: true, key: 'wolf.nSeer' });
  if (c.on.witch) steps.push({ night: true, key: 'wolf.nWitch' });
  steps.push({ night: false, key: 'wolf.d1' });
  if (c.on.hunter) steps.push({ night: false, key: 'wolf.dHunter' });
  steps.push({ night: false, key: 'wolf.dVote' });
  recordGame('wolf');
  startPass(items, function () { go('wolfPlay', { steps: steps, step: 0, night: 1, assign: assign, reveal: false, narrator: narr }); });
};
A.wnext = function () { S.g.step++; render(); };
A.wprev = function () { if (S.g.step > 0) { S.g.step--; render(); } };
A.wnight = function () { S.g.night++; S.g.step = 0; render(); };
A.wreveal = function () { S.g.reveal = true; render(); };

/* Who would rather */
A.qnext = function () {
  var Q = S.q; Q.i++;
  if (Q.i >= Q.order.length) { Q.order = shuffle(D('questions')); Q.i = 0; toast(t('wq.again')); }
  render();
};

/* Bomb */
function newBomb() {
  var B = S.b, prompts = D('bomb');
  var left = prompts.filter(function (p) { return B.used.indexOf(p) < 0; });
  if (!left.length) { B.used = []; left = prompts; }
  B.prompt = pick(left); B.used.push(B.prompt);
  B.holder = Math.floor(Math.random() * S.players.length); B.armed = false;
}
A.arm = function () {
  var B = S.b; B.armed = true; beep(660, 0.08, 0.05);
  var total = (12 + Math.random() * 24) * 1000, start = Date.now();
  render();
  function tick() {
    var el = Date.now() - start;
    if (el >= total) {
      B.scores[B.holder] = (B.scores[B.holder] || 0) + 1; B.armed = false;
      beep(120, 0.9, 0.2); beep(70, 1, 0.2); buzz([400, 80, 400]);
      go('boom'); return;
    }
    var r = el / total;
    beep(700 + r * 500, 0.07, 0.07);
    var b = document.getElementById('bomb');
    if (b && b.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) b.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (1.08 + r * 0.12) + ')' }, { transform: 'scale(1)' }], { duration: 160 });
    later(tick, Math.max(130, 900 - 760 * r));
  }
  later(tick, 700);
};
A.bpass = function () { var B = S.b; B.holder = (B.holder + 1) % S.players.length; buzz(15); render(); };
A.bnew = function () { newBomb(); go('bomb'); };

/* Accounts */
A.mode = function (m) { S.msg = null; S.g.mode = m; render(); };
function afterAuth(user) {
  me = user;
  var p = me.profile || {};
  var pl = p.lang && supported(p.lang) ? loadLang(p.lang) : Promise.resolve();
  if (p.players && p.players.length) { S.players = p.players.slice(); try { localStorage.setItem(KEY_PLAYERS, JSON.stringify(S.players)); } catch (e) { /* ignore */ } }
  pl.then(function () {
    if (me.mustChange) { go('changepw'); return; }
    if (!(p.players && p.players.length) || !p.lang) syncProfile();
    go('home');
  });
}
A.logout = function () {
  api('POST', 'api/logout', {}).then(function () {}, function () {}).then(function () { me = null; go('home'); });
};
A.admin = function () {
  api('GET', 'api/admin/users').then(function (r) { S.g.users = r.users; S.g.max = r.max; go('admin'); }, function (e) { setMsg('err', errText(e)); render(); });
};
A.areset = function (name) {
  api('POST', 'api/admin/users/' + encodeURIComponent(name) + '/reset').then(function (r) { setMsg('ok', t('adm.temp', { name: r.name, pw: r.tempPassword })); render(); }, function (e) { setMsg('err', errText(e)); render(); });
};
A.aremove = function (name) {
  api('DELETE', 'api/admin/users/' + encodeURIComponent(name)).then(function () {
    return api('GET', 'api/admin/users');
  }).then(function (r) { S.g.users = r.users; setMsg('ok', t('adm.removed')); render(); }, function (e) { setMsg('err', errText(e)); render(); });
};

/* Forms */
var F = {};
F.custom = function (f) {
  var body = {};
  ['words', 'questions', 'never', 'truth', 'dare', 'bomb'].forEach(function (k) { body[k] = f.elements[k].value.split('\n'); });
  api('PUT', 'api/admin/custom', body).then(function (r) { custom = r; setMsg('ok', t('adm.saved')); render(); window.scrollTo(0, 0); }, function (e) { setMsg('err', errText(e)); render(); });
};
F.add = function (f) {
  var inp = f.elements.pname, v = inp.value.trim().slice(0, 18); if (!v) return;
  if (S.players.length >= 20) { toast(t('pl.max')); return; }
  if (S.players.some(function (p) { return p.toLowerCase() === v.toLowerCase(); })) { toast(t('pl.dupe')); return; }
  S.players.push(v); savePlayers(); render();
};
F.login = function (f) {
  api('POST', 'api/login', { username: f.elements.username.value.trim(), password: f.elements.password.value }).then(function (r) { afterAuth(r.user); }, function (e) { setMsg('err', errText(e)); render(); });
};
F.register = function (f) {
  if (f.elements.password.value !== f.elements.password2.value) { setMsg('err', t('acc.mismatch')); render(); return; }
  api('POST', 'api/register', { username: f.elements.username.value.trim(), password: f.elements.password.value }).then(function (r) { afterAuth(r.user); }, function (e) { setMsg('err', errText(e)); render(); });
};
F.pw = function (f) {
  api('POST', 'api/password', { current: f.elements.curpw.value, next: f.elements.newpw.value }).then(function (r) {
    var was = me && me.mustChange; me = r.user;
    if (was) { syncProfile(); go('home'); } else { setMsg('ok', t('acc.pwChanged')); render(); }
  }, function (e) { setMsg('err', errText(e)); render(); });
};
F.del = function (f) {
  api('DELETE', 'api/me', { password: f.elements.delpw.value }).then(function () { me = null; go('home'); }, function (e) { setMsg('err', errText(e)); render(); });
};

/* ---------- events ---------- */
app.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  var fn = A[el.dataset.act]; if (fn) fn(el.dataset.a, el.dataset.b);
});
app.addEventListener('submit', function (e) {
  e.preventDefault();
  var fn = F[e.target.dataset.form]; if (fn) fn(e.target);
});
app.addEventListener('change', function (e) { if (e.target.id === 'lang') setLang(e.target.value); });

/* ---------- start ---------- */
function init() {
  getJson('locales/index.json').then(function (j) { if (Array.isArray(j) && j.length) LANGS = j; }, function () { /* keep default */ })
    .then(function () { return getJson('locales/en.json'); })
    .then(function (j) { EN = j; L = EN; })
    .then(function () {
      return api('GET', 'api/config').then(function (c) { server = c; return api('GET', 'api/custom').then(function (cu) { custom = cu || {}; }, function () { custom = {}; }); }).then(function () { return api('GET', 'api/me'); }).then(function (r) { me = r.user; }, function () { server = null; me = null; });
    })
    .then(function () {
      if (me && me.profile && me.profile.players && me.profile.players.length) { S.players = me.profile.players.slice(); }
      return loadLang(detectLang());
    })
    .then(function () {
      if (server && server.online && window.TPOnline) {
        var TPo = { S: S, V: V, A: A, F: F, t: t, T: T, esc: esc, has: function (k) { return L[k] !== undefined || EN[k] !== undefined; }, api: api, toast: toast, go: go, render: render,
          beep: beep, fmt: fmt, bombSvg: bombSvg, top: top, msgBox: msgBox, setMsg: setMsg, lang: function () { return lang; }, me: function () { return me; }, D: D,
          stepper: stepper, toggle: toggle, SPECIALS: SPECIALS, wolfCounts: wolfCounts, serverOnline: function () { return true; } };
        window.TPOnline(TPo);
        if (TPo.afterInit) TPo.afterInit();
      }
      if (me && me.mustChange) S.screen = 'changepw'; render();
    })
    .catch(function () { app.textContent = 'Could not load the game files.'; });
}
init();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ }); });
}
})();
