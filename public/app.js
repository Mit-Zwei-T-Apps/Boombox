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
  boxes: { min: 1, max: 4, cls: 'c-boxes', stat: 'boxes' },
  duel: { min: 1, max: 2, cls: 'c-duel', stat: 'duel', meta: 'duel.meta' },
  quad: { min: 1, max: 4, cls: 'c-quad', stat: 'duel' },
  hangman: { min: 1, max: 20, cls: 'c-hangman', stat: 'hangman' },
  chess: { min: 1, max: 2, cls: 'c-chess', stat: 'chess', meta: 'duel.meta' },
  solo: { min: 1, max: 1, cls: 'c-solo', stat: 'solo', meta: 'solo.meta' }
};
var ICON = { impostor: '🕵️', spy: '🔍', wolf: '🐺', wouldrather: '🤔', bomb: '💣', never: '🙈', truth: '🎯', whoami: '🎭', boxes: '🔲', duel: '⚔️', quad: '🎮', hangman: '🔤', solo: '🧩', chess: '♟️', chain: '🎨' };
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
  on: {}, cfg: { sketch: { rounds: 2 }, boxes: { n: 5 }, imp: { cat: 'all', n: 1, tip: true }, hm: { cat: 'all' }, diff: 'medium', duelBot: false, quadBots: 0, spy: { min: 8 }, wolf: { on: { seer: true }, wolves: 0, narrator: false } }
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
function rnd() { try { var u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch (e) { return Math.random(); } }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
/* like pick, but remembers the last picks in this browser so words and places don't repeat soon */
function pickFresh(list, key) {
  var seen = []; try { seen = JSON.parse(localStorage.getItem('boombox.seen.' + key) || '[]'); } catch (e) { seen = []; }
  var fresh = list.filter(function (x) { return seen.indexOf(x) === -1; });
  if (!fresh.length) { fresh = list; seen = []; }
  var x = pick(fresh); seen.push(x); if (seen.length > Math.min(60, list.length - 1)) seen.shift();
  try { localStorage.setItem('boombox.seen.' + key, JSON.stringify(seen)); } catch (e) { /* ignore */ }
  return x;
}
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
var KEY_VOICE = 'boombox.voice';
var voiceOn = true;
try { voiceOn = localStorage.getItem(KEY_VOICE) !== '0'; } catch (e) { /* ignore */ }
var SPEECH = { en: 'en-US', de: 'de-DE', nl: 'nl-NL', fr: 'fr-FR', es: 'es-ES' };
var KEY_VSET = 'boombox.voiceset';
var VSET = { name: '', style: 'normal', fun: true };
try { var vs0 = JSON.parse(localStorage.getItem(KEY_VSET) || 'null'); if (vs0) { VSET.name = vs0.name || ''; VSET.style = vs0.style || 'normal'; VSET.fun = vs0.fun !== false; } } catch (e) { /* ignore */ }
function saveVset() { try { localStorage.setItem(KEY_VSET, JSON.stringify(VSET)); } catch (e) { /* ignore */ } }
var STYLES = { normal: [1, 0.92], deep: [0.55, 0.85], high: [1.8, 1.05], slow: [0.8, 0.7], fast: [1.3, 1.35] };
function voicesFor() {
  var out = [];
  try { (window.speechSynthesis.getVoices() || []).forEach(function (v) { if (v.lang && v.lang.slice(0, 2).toLowerCase() === lang && out.length < 12) out.push(v); }); } catch (e) { /* ignore */ }
  return out;
}
function joke(kind) {
  if (!VSET.fun) return '';
  var o = [1, 2].filter(function (i) { return L['fun.' + kind + '.' + i] !== undefined || EN['fun.' + kind + '.' + i] !== undefined; });
  return o.length ? ' ' + t('fun.' + kind + '.' + o[Math.floor(rnd() * o.length)]) : '';
}
function canSpeak() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); }
function speak(text, force) {
  if (!canSpeak() || (!voiceOn && !force) || !text) return;
  if (!force && S.screen === 'wolfPlay' && S.g && S.g.narr) return; /* a human narrator reads it out */
  try {
    var ss = window.speechSynthesis, u = new SpeechSynthesisUtterance(text), code = SPEECH[lang] || lang;
    var stl = STYLES[VSET.style] || STYLES.normal;
    u.lang = code; u.rate = stl[1]; u.pitch = stl[0];
    var vs = ss.getVoices ? ss.getVoices() : [], v = null, i;
    for (i = 0; i < vs.length && !v; i++) if (VSET.name && vs[i].name === VSET.name && vs[i].lang.slice(0, 2).toLowerCase() === lang) v = vs[i];
    for (i = 0; i < vs.length && !v; i++) if (vs[i].lang && vs[i].lang.replace('_', '-').toLowerCase() === code.toLowerCase()) v = vs[i];
    for (i = 0; i < vs.length && !v; i++) if (vs[i].lang && vs[i].lang.slice(0, 2).toLowerCase() === lang) v = vs[i];
    if (v) u.voice = v;
    ss.cancel(); ss.speak(u);
  } catch (e) { /* ignore */ }
}
function stopSpeak() { try { if (canSpeak()) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
function voiceBtn() {
  if (!canSpeak()) return '';
  var vl = voicesFor(), cur = vl.filter(function (v) { return v.name === VSET.name; })[0];
  return '<button class="chip' + (voiceOn ? ' on' : '') + '" data-act="voice" aria-pressed="' + (voiceOn ? 'true' : 'false') + '">' + (voiceOn ? '🔊 ' : '🔇 ') + T('voice.label') + '</button>' +
    (vl.length > 1 ? '<button class="chip" data-act="voicepick">' + T('voice.pick') + ': ' + esc(cur ? cur.name.replace(/^(Microsoft|Google)\s+/, '').slice(0, 14) : T('voice.auto')) + '</button>' : '') +
    '<button class="chip" data-act="voicestyle">' + T('voice.style') + ': ' + T('voice.st.' + VSET.style) + '</button>' +
    '<button class="chip' + (VSET.fun ? ' on' : '') + '" data-act="voicefun" aria-pressed="' + (VSET.fun ? 'true' : 'false') + '">😄 ' + T('voice.fun') + '</button>';
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
function diffChips() {
  return '<div class="panel"><div class="label">' + T('diff.label') + '</div><div class="chips">' + ['easy', 'medium', 'hard'].map(function (d) {
    return '<button class="chip' + (S.cfg.diff === d ? ' on' : '') + '" data-act="setdiff" data-a="' + d + '">' + T('diff.' + d) + '</button>';
  }).join('') + '</div></div>';
}
A.setdiff = function (d) { S.cfg.diff = d; render(); };
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
  var input = '<input id="' + id + '" name="' + id + '" type="' + type + '" ' + (extra || '') + ' required>';
  if (type === 'password') input = '<div class="pw">' + input + '<button type="button" class="pwb" data-act="pwshow" data-a="' + id + '" aria-label="' + T('pw.show') + '" aria-pressed="false">' + T('pw.show') + '</button></div>';
  return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + input + '</div>';
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
    return '<button class="card ' + g.cls + '" data-act="game" data-a="' + id + '"><span class="ico" aria-hidden="true">' + (ICON[id] || '') + '</span><h3>' + T('g.' + id) + '</h3><p>' + T('g.' + id + '.d') + '</p><span class="meta">' + (g.meta ? T(g.meta) : T('range', { min: g.min, max: g.max })) + '</span></button>';
  }).join('');
  return '<header><h1 class="wordmark">Boombox</h1><p class="kicker">' + T('appSub') + '</p><p class="sub">' + T('tagline') + '</p></header>' +
    '<div class="tools"><select id="lang" aria-label="' + T('language') + '">' + langs + '</select>' + acc + '</div>' +
    '<button class="bar" data-act="go" data-a="players"><b>' + S.players.length + '</b><span><span class="l">' + T('players') + '</span><span class="n">' + S.players.map(esc).join(', ') + '</span></span><span class="go">' + T('change') + '</span></button>' +
    (server && server.online ? '<button class="card c-online" data-act="go" data-a="online"><span class="ico" aria-hidden="true">🌐</span><h3>' + T('onlineTitle') + '</h3><p>' + T('onlineDesc') + '</p><span class="meta">' + T('onlineTag') + '</span></button>' : '') +
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
function swipeInit() {
  var el = document.getElementById('swc'); if (!el) return;
  var y0 = null, dy = 0;
  el.addEventListener('pointerdown', function (e) { y0 = e.clientY; dy = 0; el.style.transition = 'none'; try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
  el.addEventListener('pointermove', function (e) { if (y0 === null) return; dy = Math.min(0, e.clientY - y0); el.style.transform = 'translateY(' + dy + 'px)'; });
  function end() {
    if (y0 === null) return; y0 = null;
    if (dy < -Math.min(160, el.offsetHeight * 0.4)) { el.style.transition = 'transform .18s'; el.style.transform = 'translateY(-110%)'; setTimeout(function () { A.pshow(); }, 150); }
    else { el.style.transition = 'transform .2s'; el.style.transform = ''; }
  }
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
V.pass = function () {
  var P = S.pass, it = P.items[P.i];
  var pr = '<div class="prog"><i style="width:' + Math.round(P.i / P.items.length * 100) + '%"></i></div>';
  if (!P.shown) {
    S.after = swipeInit;
    return pr + '<div class="stage"><div class="swipe"><div class="under">' + it.html + '</div><div class="cover" id="swc"><p class="kicker">' + T('pass.hand') + '</p><h2 class="big">' + esc(it.name) + '</h2>' +
      '<p class="hint">' + T('pass.only') + '</p><div class="up">&#9650;<br>' + T('pass.swipe') + '</div></div></div>' +
      '<button class="btn alt small" data-act="pshow">' + T('pass.orTap') + ': ' + T('pass.iam', { name: it.name }) + '</button>' +
      '<p class="kicker">' + T('pass.of', { i: P.i + 1, n: P.items.length }) + '</p></div>';
  }
  var last = P.i === P.items.length - 1;
  S.after = swipeDown;
  return pr + '<div class="stage"><div class="swipe open"><div class="under">' + it.html + '</div><div class="cover" id="swc"><p class="kicker">' + esc(it.name) + '</p><div class="up dn">' + T('pass.down') + '<br>&#9660;</div></div></div><button class="btn alt" data-act="pnext">' + (last ? T('pass.last') : T('pass.cover')) + '</button></div>';
};
function swipeDown() {
  var el = document.getElementById('swc'); if (!el) return;
  var H = el.offsetHeight, rest = -(H - 56), y0 = null, dy = 0;
  el.style.transform = 'translateY(' + rest + 'px)';
  el.addEventListener('pointerdown', function (e) { y0 = e.clientY; dy = 0; el.style.transition = 'none'; try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
  el.addEventListener('pointermove', function (e) { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = 'translateY(' + Math.min(0, rest + dy) + 'px)'; });
  function end() {
    if (y0 === null) return; y0 = null;
    if (dy > Math.min(140, H * 0.35)) { el.style.transition = 'transform .18s'; el.style.transform = 'translateY(0)'; setTimeout(function () { A.pnext(); }, 170); }
    else { el.style.transition = 'transform .2s'; el.style.transform = 'translateY(' + rest + 'px)'; }
  }
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
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
    '<div class="panel">' + toggle(t('imp.tipOpt'), t('imp.tipOpt.d'), c.tip, 'imptip') + '</div>' +
    '<button class="btn coral" data-act="impStart">' + T('imp.deal') + '</button>';
};
function impVote(g) {
  var chips = S.players.map(function (nm) { return '<button class="chip' + (g.acc === nm ? ' on' : '') + '" data-act="impacc" data-a="' + esc(nm) + '">' + esc(nm) + '</button>'; }).join('');
  return '<div class="panel"><div class="label">' + T('imp.who') + '</div><p class="hint">' + T('imp.whoHint') + '</p><div class="chips">' + chips + '</div></div>' +
    '<button class="btn coral" data-act="reveal"' + (g.acc ? '' : ' disabled') + '>' + T('imp.accuse') + '</button><button class="btn alt small" data-act="impskip">' + T('imp.skipVote') + '</button>';
}
A.impwho = function () { S.g.vote = true; S.g.acc = null; render(); };
A.impacc = function (n) { S.g.acc = n; render(); };
A.impskip = function () { S.g.acc = null; stopAll(); S.g.reveal = true; render(); };
V.impPlay = function () {
  var g = S.g;
  var res = g.reveal ?
    (g.acc ? '<div class="panel"><p>' + T('imp.accused', { name: g.acc }) + '</p><p><b>' + T(g.imps.indexOf(g.acc) !== -1 ? 'imp.caught' : 'imp.missed') + '</b></p></div>' : '') + '<div class="role r-coral"><p class="kicker">' + T('revealed') + '</p><h2>' + g.imps.map(esc).join(T('imp.and')) + '</h2><p>' + T(g.imps.length > 1 ? 'imp.wasN' : 'imp.was1') + '</p></div>' +
    '<div class="role r-lemon"><p class="kicker">' + T('imp.theWord') + '</p><h2>' + esc(g.word) + '</h2></div>' +
    '<div class="row"><button class="btn alt" data-act="impStart">' + T('newRound') + '</button><button class="btn" data-act="go" data-a="home">' + T('overview') + '</button></div>' :
    (g.vote ? impVote(g) : '<div class="panel"><p class="hint">' + T('imp.suggest') + '</p></div><button class="btn coral" data-act="impwho">' + T('imp.vote') + '</button>');
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
  var c = S.cfg.wolf, n = online ? nPlayers() : S.players.length;
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
    '<div class="panel"><div class="label">' + T('wolf.dist') + '</div><ul class="list">' +
    '<li><span>' + T('wolf.count') + '</span><span>' + k.w + '</span></li>' +
    '<li><span>' + T('wolf.specials') + '</span><span>' + k.sp + '</span></li>' +
    '<li><span>' + T('wolf.villagers') + '</span><span>' + Math.max(0, k.vill) + '</span></li></ul>' +
    (k.ok ? '' : '<p class="hint">' + T('wolf.more') + '</p>') + '</div>' +
    '<div class="panel">' + toggle(t('wolf.narr'), t('wolf.narr.d'), c.narrator, 'narrator') + '</div>' +
    '<button class="btn lilac" data-act="wolfStart"' + (k.ok ? '' : ' disabled') + '>' + T('wolf.deal') + '</button>';
};
var NAR = { cupid: 'nar.cupid', guardian: 'nar.guardian', wolves: 'nar.wolves', seer: 'nar.seer', witch: 'nar.witch' };
function wolfBoard(W) {
  return '<div class="panel"><div class="label">' + T('wolf.board') + '</div><div class="chips">' + W.players.map(function (p) {
    return '<span class="chip' + (p.alive ? '' : ' dead') + '">' + esc(p.name) + (p.alive ? '' : ' ✝') + '</span>';
  }).join('') + '</div></div>';
}
function wolfChips(W, idxs, sel) {
  return '<div class="chips">' + idxs.map(function (i) {
    return '<button class="chip' + (sel.indexOf(i) !== -1 ? ' on' : '') + '" data-act="wsel" data-a="' + i + '">' + esc(W.players[i].name) + '</button>';
  }).join('') + '</div>';
}
function wolfDeaths(W) {
  return W.announce.map(function (i) { return W.players[i].name + ' (' + t('role.' + W.players[i].role) + ')'; }).join(', ');
}
/* the text the moderator voice reads for the current screen */
function wolfSpeech(W) {
  var X = S.g, p = W.phase;
  if (p === 'night') return (X.sayNight ? t('nar.night') + joke('night') + ' ' : '') + t(NAR[W.step]);
  if (p === 'dawn') return t('nar.dawn') + joke('dawn') + ' ' + (W.announce.length ? t('nar.died', { names: wolfDeaths(W) }) + joke('died') : t('nar.noDeaths') + joke('noDeaths'));
  if (p === 'hunter') return t('nar.hunter');
  if (p === 'vote') return t('nar.vote') + joke('vote');
  if (p === 'voteResult') return W.last.kind === 'elim' ? t('nar.elim', { name: W.players[W.last.id].name, role: t('role.' + W.players[W.last.id].role) }) + joke('elim') : W.last.kind === 'idiot' ? t('nar.idiot', { name: W.players[W.last.id].name }) : t('nar.tie') + joke('tie');
  if (p === 'end') return t(W.winner === 'village' ? 'ww.winVillage' : 'ww.winWolves') + joke('win');
  return '';
}
V.wolfPlay = function () {
  var g = S.g, W = g.W;
  if (g.reveal) {
    var rows = W.players.map(function (a) { return '<li><span>' + esc(a.name) + (a.alive ? '' : ' ✝') + '</span><span>' + T('role.' + a.role) + '</span></li>'; }).join('');
    return top(t('wolf.rolesTitle'), 'home') + '<div class="panel"><div class="label">' + T('wolf.whoWas') + '</div><ul class="list">' + rows + '</ul></div>' +
      '<button class="btn alt" data-act="unreveal">' + T('wolf.backGame') + '</button>';
  }
  var sel = g.sel || [], body = '', p = W.phase, tagNight = p === 'night';
  var alive = TPWolf.alive(W);
  if (p === 'night') {
    var st = W.step, who = TPWolf.actors(W, st), targets = alive.slice();
    g.max = 1;
    if (st === 'cupid') g.max = 2;
    if (st === 'guardian') targets = alive.filter(function (i) { return i !== W.lastGuard; });
    if (st === 'wolves') targets = alive.filter(function (i) { return W.players[i].role !== 'werewolf'; });
    if (st === 'seer') targets = alive.filter(function (i) { return W.players[i].role !== 'seer'; });
    if (st === 'witch') targets = alive.filter(function (i) { return W.players[i].role !== 'witch'; });
    body = '<p class="script">' + T(NAR[st]) + '</p>';
    if (!who.length) {
      body += '<p class="hint">' + T('wolf.deadRole') + '</p><button class="btn lilac" data-act="wgo">' + T('wolf.next') + '</button>';
    } else if (st === 'witch') {
      body += '<div class="panel">' + (W.act.victim !== null ? '<p>' + T('wolf.victim', { name: W.players[W.act.victim].name }) + '</p>' : '<p>' + T('wolf.noVictim') + '</p>') +
        (W.potions.heal && W.act.victim !== null ? '<button class="chip' + (g.heal ? ' on' : '') + '" data-act="wheal">' + T('ww.heal') + '</button>' : '') +
        (W.potions.poison ? '<div class="label">' + T('ww.poison') + '</div>' + wolfChips(W, targets, sel) : '') + '</div>' +
        '<button class="btn lilac" data-act="wgo">' + T('ww.confirm') + '</button>';
    } else {
      var seerRes = '';
      if (st === 'seer' && sel.length === 1) seerRes = '<p class="ok">' + T(W.players[sel[0]].role === 'werewolf' ? 'ww.seerRes' : 'ww.seerNo', { name: W.players[sel[0]].name }) + '</p>';
      body += '<div class="panel"><div class="label">' + T('wolf.select') + '</div>' + wolfChips(W, targets, sel) + seerRes + '</div>' +
        '<button class="btn lilac" data-act="wgo"' + (sel.length === g.max ? '' : ' disabled') + '>' + T('ww.confirm') + '</button>';
    }
  } else if (p === 'dawn') {
    body = '<p class="script">' + T('nar.dawn') + '</p><div class="panel">' + (W.announce.length ? '<p>' + T('nar.died', { names: wolfDeaths(W) }) + '</p>' : '<p>' + T('nar.noDeaths') + '</p>') + '</div>' +
      '<button class="btn lilac" data-act="wgo">' + T('wolf.next') + '</button>';
  } else if (p === 'hunter') {
    g.max = 1;
    body = '<p class="script">' + T('nar.hunter') + '</p><div class="panel">' + wolfChips(W, alive, sel) + '</div>' +
      '<button class="btn lilac" data-act="wgo"' + (sel.length ? '' : ' disabled') + '>' + T('ww.confirm') + '</button>' +
      '<button class="btn alt small" data-act="wnone">' + T('wolf.noShot') + '</button>';
  } else if (p === 'vote') {
    g.max = 1;
    var voters = alive;
    body = '<p class="script">' + T('nar.vote') + '</p><div class="panel"><div class="label">' + T('wolf.out') + '</div>' + wolfChips(W, voters, sel) + '</div>' +
      '<button class="btn lilac" data-act="wgo"' + (sel.length ? '' : ' disabled') + '>' + T('wolf.eliminate') + '</button>' +
      '<button class="btn alt small" data-act="wnone">' + T('wolf.tieBtn') + '</button>';
  } else if (p === 'voteResult') {
    body = '<div class="panel"><p>' + esc(wolfSpeech(W)) + '</p></div><button class="btn lilac" data-act="wgo">' + T('wolf.next') + '</button>';
  } else {
    body = '<div class="role ' + (W.winner === 'village' ? 'r-aqua' : 'r-coral') + '"><h2>' + T(W.winner === 'village' ? 'ww.winVillage' : 'ww.winWolves') + '</h2></div>' +
      '<div class="panel"><ul class="list">' + W.players.map(function (a) { return '<li><span>' + esc(a.name) + (a.alive ? '' : ' ✝') + '</span><span>' + T('role.' + a.role) + '</span></li>'; }).join('') + '</ul></div>' +
      '<button class="btn lilac" data-act="go" data-a="home">' + T('bomb.finish') + '</button>';
  }
  S.after = function () { if (g.speakKey !== wolfKey(W)) { g.speakKey = wolfKey(W); var sp = wolfSpeech(W); g.sayNight = false; speak(sp); } };
  return '<div class="stage"><span class="tag ' + (tagNight ? 'night' : 'day') + '">' + (tagNight ? T('wolf.night') : T('wolf.day')) + ' ' + W.night + '</span>' + (g.narr ? '<p class="hint">' + T('wolf.narrOn') + '</p>' : '') + body +
    '<div class="row">' + voiceBtn() + (canSpeak() ? '<button class="chip" data-act="wsay">' + T('voice.again') + '</button>' : '') + '<button class="chip" data-act="wreveal">' + T('wolf.rolesShow') + '</button></div>' + wolfBoard(W) + '</div>';
};
function wolfKey(W) { return W.phase + ':' + W.night + ':' + (W.step || '') + ':' + W.announce.length + ':' + (W.last ? W.last.kind + W.last.id : ''); }

/* Who would rather */
V.wouldrather = function () {
  var Q = S.q, ab = Q.i % 3 === 2;
  if (ab) {
    var pr = Q.pairs[Q.pi % Q.pairs.length].split('|');
    return top(t('g.wouldrather')) + '<div class="stage"><p class="kicker">' + T('wouldrather', { n: Q.i + 1 }) + '</p>' +
      '<div class="ab"><div class="opt oa"><b>A</b><p class="q">' + esc(pr[0]) + '</p></div><div class="or">' + T('wq.or') + '</div><div class="opt ob"><b>B</b><p class="q">' + esc(pr[1]) + '</p></div></div>' +
      '<p class="hint">' + T('wq.rulesAB') + '</p><button class="btn aqua" data-act="qnext">' + T('wq.next') + '</button></div>';
  }
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
      (window.DeviceMotionEvent ? '<button class="chip' + (bMotion ? ' on' : '') + '" data-act="bmotion" aria-pressed="' + (bMotion ? 'true' : 'false') + '">' + T('bomb.motion') + ': ' + T(bMotion ? 'on' : 'off') + '</button><p class="hint">' + T('bomb.motionHint') + '</p>' : '') +
      '<button class="btn pink" data-act="arm">' + T('bomb.arm') + '</button>' +
      '<button class="btn alt small" data-act="snd">' + T('bomb.sound', { state: t(soundOn ? 'on' : 'off') }) + '</button></div>';
  }
  return '<div class="stage">' + bombSvg() + '<p class="kicker">' + esc(B.prompt) + '</p>' +
    '<h2 class="big">' + esc(S.players[B.holder]) + '</h2><p class="hint">' + T('bomb.say') + '</p>' +
    (bMotion ? '<p class="hint">' + T('bomb.motionPass') + '</p>' : '') +
    '<button class="btn ' + (bMotion ? 'alt small' : 'pink') + '" data-act="bpass">' + T('bomb.pass', { name: S.players[(B.holder + 1) % S.players.length] }) + '</button></div>';
};
/* Hands-free mode: passing the phone on is detected as a jolt by the motion sensor */
var bMotion = false;
try { bMotion = localStorage.getItem('boombox.bmotion') === '1'; } catch (e) { /* ignore */ }
var motionFn = null;
function motionStop() { if (motionFn) { window.removeEventListener('devicemotion', motionFn); motionFn = null; } }
function motionStart() {
  motionStop();
  var last = null, armedAt = Date.now(), lastHit = 0;
  motionFn = function (e) {
    var a = e.accelerationIncludingGravity || e.acceleration; if (!a) return;
    var m = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0)), now = Date.now();
    if (!S.b || !S.b.armed || S.screen !== 'bomb') { motionStop(); return; }
    var d = last === null ? 0 : Math.abs(m - last); last = m;
    if (d > 9 && now - lastHit > 1300 && now - armedAt > 900) { lastHit = now; A.bpass(); }
  };
  window.addEventListener('devicemotion', motionFn);
}
A.bmotion = function () {
  bMotion = !bMotion; try { localStorage.setItem('boombox.bmotion', bMotion ? '1' : '0'); } catch (e) { /* ignore */ }
  if (bMotion && window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(function (r) { if (r !== 'granted') { bMotion = false; toast(t('bomb.motionDenied')); render(); } }, function () { bMotion = false; render(); });
  }
  render();
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
  var c = S.cfg.boxes, humans = Math.min(S.players.length, 4), nb = c.bots || 0;
  var botChips = '<div class="panel"><div class="label">' + T('bx.bots') + '</div><div class="chips">' + [0, 1, 2, 3].map(function (n) {
    return '<button class="chip' + (nb === n ? ' on' : '') + '" data-act="bxbots" data-a="' + n + '">' + n + '</button>';
  }).join('') + '</div></div>';
  return top(t('g.boxes')) + '<div class="panel"><p class="hint">' + T('bx.local', { n: Math.min(4, Math.max(2, humans + nb)) }) + '</p></div>' + stepper(t('bx.size'), c.n, 'boxes', t('bx.limit')) + botChips + (nb || humans < 2 ? diffChips() : '') +
    '<button class="btn lemon" data-act="bxStart">' + T('bx.start') + '</button>';
};
A.bxbots = function (n) { S.cfg.boxes.bots = +n; render(); };
A.bxStart = function () {
  var c = S.cfg.boxes, nb = Math.min(3, c.bots || 0), hum = S.players.slice(0, Math.max(1, Math.min(S.players.length, 4 - nb)));
  if (hum.length + nb < 2) nb = 2 - hum.length;
  var names = hum.slice(), isBot = hum.map(function () { return false; }), i;
  for (i = 0; i < nb; i++) { names.push(t('bx.botName', { n: i + 1 })); isBot.push(true); }
  S.bx = { s: TPBoxes.create(c.n, names.length), names: names, bot: isBot, diff: S.cfg.diff, token: Math.random() };
  recordGame('boxes'); go('boxes'); bxBotTurn();
};
function bxBotTurn() {
  var X = S.bx; if (!X || S.screen !== 'boxes' || X.s.done || !X.bot[X.s.turn]) return;
  var tok = X.token;
  later(function () {
    if (S.bx !== X || X.token !== tok || S.screen !== 'boxes' || X.s.done || !X.bot[X.s.turn]) return;
    var got = TPBoxes.move(X.s, TPBoxes.bestMove(X.s, X.diff, rnd));
    if (got > 0) beep(880, 0.08, 0.06);
    render(); bxBotTurn();
  }, 650);
}
V.boxes = function () {
  var X = S.bx, s = X.s, letters = X.names.map(function (n) { return n.charAt(0).toUpperCase(); });
  var rows = X.names.map(function (n, i) { return '<li><span><i class="dot" style="background:' + TPBoxes.COLORS[i] + '"></i> ' + esc(n) + (i === s.turn && !s.done ? ' ◀' : '') + '</span><span>' + s.scores[i] + '</span></li>'; }).join('');
  var w = s.done ? TPBoxes.winners(s) : [];
  var head = s.done ? '<h2 class="q">' + (w.length > 1 ? T('bx.tie') : T('bx.win', { name: X.names[w[0]] })) + '</h2>' : '<p class="kicker">' + T('bx.turn', { name: X.names[s.turn] }) + '</p>';
  return top(t('g.boxes')) + '<div class="stage">' + head + TPBoxes.svg(s, 'bxedge', letters) + '<div class="panel"><ul class="list">' + rows + '</ul></div>' +
    (s.done ? '<button class="btn lemon" data-act="bxStart">' + T('on.again') + '</button>' : '') + '</div>';
};
A.bxedge = function (key) { if (S.bx.bot[S.bx.s.turn]) return; var got = TPBoxes.move(S.bx.s, key); if (got < 0) return; buzz(got ? [30, 40, 30] : 12); if (got) beep(880, 0.08, 0.06); render(); bxBotTurn(); };

/* Never have I ever */
V.never = function () {
  var Q = S.q;
  return top(t('g.never')) + '<div class="stage"><p class="kicker">' + T('never.kicker', { n: Q.i + 1 }) + '</p><p class="q">' + esc(Q.order[Q.i]) + '</p>' +
    '<p class="hint">' + T('never.rules') + '</p><button class="btn lemon" data-act="nnext">' + T('wq.next') + '</button></div>';
};
A.nnext = function () {
  var Q = S.q; if (Q.i % 3 === 2) Q.pi++; Q.i++;
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
  else if (id === 'duel') go('duel', {});
  else if (id === 'quad') go('quad', {});
  else if (id === 'solo') go('solo', {});
  else if (id === 'chess') { recordGame('chess'); go('chessSetup', {}); }
  else if (id === 'hangman') { recordGame('hangman'); go('hangmanSetup', {}); }
  else if (id === 'wouldrather') { S.q = { order: shuffle(D('questions')), i: 0, pairs: shuffle(D('rather')), pi: 0 }; recordGame('wouldrather'); go('wouldrather'); }
  else if (id === 'never') { S.q = { order: shuffle(D('never')), i: 0 }; recordGame('never'); go('never'); }
  else if (id === 'truth') { S.tod = { who: Math.floor(rnd() * n), card: null, used: [] }; recordGame('truth'); go('truth'); }
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
  if (k === 'imptip') S.cfg.imp.tip = !S.cfg.imp.tip;
  else if (k === 'narrator') c.narrator = !c.narrator;
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
  var word = pickFresh(pool, 'imp'), idx = shuffle(S.players.map(function (_, i) { return i; })).slice(0, c.n);
  var imps = idx.map(function (i) { return S.players[i]; });
  var rk = keys.filter(function (k) { return words[k].list.indexOf(word) !== -1; })[0];
  var catLabel = c.tip ? (rk ? words[rk].label : null) : (c.cat !== 'all' && words[c.cat] ? words[c.cat].label : null), letter = String(word).charAt(0).toUpperCase();
  var items = S.players.map(function (name, i) {
    var isImp = idx.indexOf(i) > -1;
    var html = isImp ?
      '<div class="role r-coral"><p class="kicker">' + T('imp.youAre') + '</p><h2>' + T('imp.role') + '</h2><p>' + T('imp.roleText') + (catLabel ? T('imp.topicIs', { cat: catLabel }) : '') + '</p>' + (c.tip ? '<p class="hint">' + T('imp.tip', { l: esc(letter) }) + '</p>' : '') + '</div>' :
      '<div class="role r-aqua"><p class="kicker">' + T('imp.wordIs') + '</p><h2>' + esc(word) + '</h2><p>' + T('imp.wordText') + '</p></div>';
    return { name: name, html: html };
  });
  recordGame('impostor');
  startPass(items, function () { go('impPlay', { word: word, imps: imps, starter: pick(S.players), reveal: false }); });
};

/* Spy */
A.spyStart = function () {
  var place = pickFresh(D('places'), 'spy'), spyI = Math.floor(rnd() * S.players.length);
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
  var c = S.cfg.wolf, list = S.players.slice(), narr = c.narrator ? true : null;
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
  recordGame('werewolf');
  var cfg = { on: Object.assign({}, c.on) };
  startPass(items, function () { go('wolfPlay', { W: TPWolf.create(assign, cfg), narr: narr, reveal: false, sel: [], heal: false, speakKey: '', sayNight: true }); });
};
A.wsel = function (i) {
  var g = S.g, k = +i, p = g.sel.indexOf(k);
  if (p !== -1) g.sel.splice(p, 1); else { if (g.sel.length >= (g.max || 1)) g.sel.shift(); g.sel.push(k); }
  render();
};
A.wheal = function () { S.g.heal = !S.g.heal; render(); };
function wolfDone() { S.g.sel = []; S.g.heal = false; render(); window.scrollTo(0, 0); }
A.wgo = function () {
  var g = S.g, W = g.W, p = W.phase, sel = g.sel.slice();
  if (p === 'night') { var wasLast = TPWolf.actors(W, W.step).length === 0; TPWolf.submit(W, wasLast ? {} : { targets: sel, heal: g.heal }); }
  else if (p === 'dawn') TPWolf.leaveDawn(W);
  else if (p === 'hunter') TPWolf.shoot(W, sel[0]);
  else if (p === 'vote') TPWolf.vote(W, sel[0]);
  else if (p === 'voteResult') { var before = W.night; TPWolf.leaveVote(W); if (W.night !== before) g.sayNight = true; }
  wolfDone();
};
A.wnone = function () { var W = S.g.W; if (W.phase === 'hunter') TPWolf.shoot(W, null); else if (W.phase === 'vote') TPWolf.vote(W, null); wolfDone(); };
A.voicepick = function () {
  var vl = voicesFor(), i = -1; vl.forEach(function (v, k) { if (v.name === VSET.name) i = k; });
  i++; VSET.name = i >= vl.length ? '' : vl[i].name; saveVset(); render(); speak(t('voice.pick') + ' ' + (VSET.name || t('voice.auto')), true);
};
A.voicestyle = function () { var k = Object.keys(STYLES); VSET.style = k[(k.indexOf(VSET.style) + 1) % k.length]; saveVset(); render(); speak(t('voice.st.' + VSET.style), true); };
A.voicefun = function () { VSET.fun = !VSET.fun; saveVset(); S.g.speakKey = ''; render(); };
A.wsay = function () { speak(wolfSpeech(S.g.W), true); };
A.voice = function () { voiceOn = !voiceOn; try { localStorage.setItem(KEY_VOICE, voiceOn ? '1' : '0'); } catch (e) { /* ignore */ } if (!voiceOn) stopSpeak(); else if (S.screen === 'wolfPlay') S.g.speakKey = ''; render(); };
A.pwshow = function (id) {
  var el = document.getElementById(id); if (!el) return;
  var show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  var b = el.parentNode.querySelector('.pwb'); if (b) { b.textContent = t(show ? 'pw.hide' : 'pw.show'); b.setAttribute('aria-pressed', show ? 'true' : 'false'); }
};
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
  B.holder = Math.floor(rnd() * S.players.length); B.armed = false;
}
A.arm = function () {
  var B = S.b; B.armed = true; beep(660, 0.08, 0.05);
  if (bMotion) motionStart();
  var total = (6 + rnd() * 54) * 1000, start = Date.now();
  render();
  function tick() {
    var el = Date.now() - start;
    if (el >= total) {
      B.scores[B.holder] = (B.scores[B.holder] || 0) + 1; B.armed = false;
      beep(120, 0.9, 0.2); beep(70, 1, 0.2); buzz([400, 80, 400]);
      motionStop(); go('boom'); return;
    }
    var r = Math.max(0, Math.min(1, 1 - (total - el) / 8000));
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
      return api('GET', 'api/config').then(function (c) { server = c; try { document.getElementById('ver').textContent = 'v' + c.version; } catch (e) { /* ignore */ } return api('GET', 'api/custom').then(function (cu) { custom = cu || {}; }, function () { custom = {}; }); }).then(function () { return api('GET', 'api/me'); }).then(function (r) { me = r.user; }, function () { server = null; me = null; });
    })
    .then(function () {
      if (me && me.profile && me.profile.players && me.profile.players.length) { S.players = me.profile.players.slice(); }
      return loadLang(detectLang());
    })
    .then(function () {
      var TPo = { S: S, V: V, A: A, F: F, t: t, T: T, esc: esc, has: function (k) { return L[k] !== undefined || EN[k] !== undefined; }, api: api, toast: toast, go: go, render: render,
        beep: beep, buzz: buzz, fmt: fmt, bombSvg: bombSvg, top: top, msgBox: msgBox, setMsg: setMsg, lang: function () { return lang; }, me: function () { return me; }, D: D,
        stepper: stepper, toggle: toggle, diffChips: diffChips, D: D, SPECIALS: SPECIALS, wolfCounts: wolfCounts, serverOnline: function () { return true; }, speak: speak, voiceBtn: voiceBtn, canSpeak: canSpeak };
      if (window.TPDuel) window.TPDuel(TPo);
      if (window.TPHangman) window.TPHangman(TPo);
      if (window.TPSolo) window.TPSolo(TPo);
      if (window.TPChess) window.TPChess(TPo);
      if (server && server.online && window.TPOnline) {
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
