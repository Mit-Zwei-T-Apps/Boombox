/* Single-player games: word guessing, memory pairs and a reaction test. */
window.TPSolo = function (TP) {
  'use strict';
  var S = TP.S, V = TP.V, A = TP.A, t = TP.t, T = TP.T, esc = TP.esc;
  var FALLBACK = ['apple', 'bread', 'chair', 'dream', 'earth', 'flame', 'grape', 'house', 'ivory', 'juice', 'knife', 'lemon', 'mouse', 'night', 'ocean', 'piano', 'queen', 'river', 'stone', 'tiger'];
  function rnd() { try { var u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch (e) { return Math.random(); } }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('boombox.' + k); localStorage.setItem('boombox.' + k, String(v)); } catch (e) { /* ignore */ } return null; }
  var timer = null;
  function clear() { if (timer) { clearTimeout(timer); timer = null; } }

  V.solo = function () {
    var items = [['wordle', 'c-wordle'], ['memory', 'c-memory'], ['reaction', 'c-reaction']].map(function (k) {
      return '<button class="card ' + k[1] + '" data-act="sostart" data-a="' + k[0] + '"><h3>' + T('solo.' + k[0]) + '</h3><p>' + T('solo.' + k[0] + '.d') + '</p></button>';
    }).join('');
    return TP.top(t('g.solo')) + '<div class="grid">' + items + '</div>';
  };
  A.sostart = function (k) {
    if (k === 'wordle') A.wdnew(); else if (k === 'memory') TP.go('memorySetup', {}); else TP.go('reactionSetup', {});
  };

  /* ================= Wordle-like ================= */
  var WD_LEN = 5, TRIES = { easy: 8, medium: 6, hard: 5 };
  var deb = function (w) { return String(w).toLowerCase().normalize ? String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : String(w).toLowerCase(); };
  function wordList() {
    var l = (TP.D('wordle') || []).map(deb).filter(function (w) { return /^[a-z]{5}$/.test(w); });
    return l.length >= 20 ? l : FALLBACK;
  }
  A.wdnew = function () {
    var list = wordList(), seen = [];
    try { seen = JSON.parse(store('seen.wordle') || '[]'); } catch (e) { seen = []; }
    var fresh = list.filter(function (w) { return seen.indexOf(w) === -1; }); if (!fresh.length) { fresh = list; seen = []; }
    var word = fresh[Math.floor(rnd() * fresh.length)]; seen.push(word); if (seen.length > 80) seen.shift(); store('seen.wordle', JSON.stringify(seen));
    TP.go('wordle', { target: word, guesses: [], cur: '', done: null, tries: TRIES[S.cfg.diff] || 6, shake: false, msg: '' });
  };
  function rate(guess, target) {
    var res = [0, 0, 0, 0, 0], left = {}, i;
    for (i = 0; i < 5; i++) if (guess[i] === target[i]) res[i] = 2; else left[target[i]] = (left[target[i]] || 0) + 1;
    for (i = 0; i < 5; i++) if (res[i] === 0 && left[guess[i]]) { res[i] = 1; left[guess[i]]--; }
    return res;
  }
  V.wordle = function () {
    var g = S.g, rows = [], i, j;
    for (i = 0; i < g.tries; i++) {
      var word = i < g.guesses.length ? g.guesses[i].w : i === g.guesses.length && !g.done ? g.cur : '';
      var rs = i < g.guesses.length ? g.guesses[i].r : null, cells = '';
      for (j = 0; j < 5; j++) cells += '<i class="wc' + (rs ? ' r' + rs[j] : word[j] ? ' f' : '') + '">' + esc((word[j] || '').toUpperCase()) + '</i>';
      rows.push('<div class="wr' + (i === g.guesses.length && g.shake ? ' shake' : '') + '">' + cells + '</div>');
    }
    var best = {};
    g.guesses.forEach(function (x) { for (var k = 0; k < 5; k++) { var c = x.w[k]; if (best[c] === undefined || x.r[k] > best[c]) best[c] = x.r[k]; } });
    var layout = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    var kb = layout.map(function (row, ri) {
      return '<div class="kr">' + (ri === 2 ? '<button class="key wide" data-act="wkey" data-a="enter">' + T('wd.enter') + '</button>' : '') + row.split('').map(function (c) {
        return '<button class="key' + (best[c] === 2 ? ' hit' : best[c] === 1 ? ' near' : best[c] === 0 ? ' bad' : '') + '" data-act="wkey" data-a="' + c + '">' + c.toUpperCase() + '</button>';
      }).join('') + (ri === 2 ? '<button class="key wide" data-act="wkey" data-a="back">&#9003;</button>' : '') + '</div>';
    }).join('');
    var status = g.done === 'win' ? '<div class="role r-aqua"><h2>' + T('wd.win') + '</h2></div>' : g.done === 'lose' ? '<div class="role r-coral"><h2>' + T('wd.lose', { word: esc(g.target.toUpperCase()) }) + '</h2></div>' : '<p class="hint">' + (g.msg ? esc(g.msg) : T('wd.hint')) + '</p>';
    S.after = function () { wdListen(); };
    return TP.top(t('solo.wordle'), 'solo') + '<div class="stage">' + status + '<div class="wgrid">' + rows.join('') + '</div>' +
      (g.done ? '<div class="row"><button class="btn lilac" data-act="wdnew">' + T('wd.again') + '</button><button class="btn alt" data-act="go" data-a="solo">' + T('duel.menu') + '</button></div>' : '<div class="kb">' + kb + '</div>' + TP.diffChips()) + '</div>';
  };
  function wdKey(k) {
    var g = S.g; if (S.screen !== 'wordle' || g.done) return;
    g.msg = ''; g.shake = false;
    if (k === 'back') g.cur = g.cur.slice(0, -1);
    else if (k === 'enter') {
      if (g.cur.length < 5) { g.msg = t('wd.short'); g.shake = true; TP.render(); return; }
      var r = rate(g.cur, g.target); g.guesses.push({ w: g.cur, r: r }); TP.beep(r.every(function (x) { return x === 2; }) ? 880 : 440, 0.06, 0.05);
      if (g.cur === g.target) g.done = 'win'; else if (g.guesses.length >= g.tries) g.done = 'lose';
      g.cur = '';
    } else if (/^[a-z]$/.test(k) && g.cur.length < 5) g.cur += k;
    TP.render();
  }
  A.wkey = function (k) { wdKey(k); };
  var wdBound = false;
  function wdListen() {
    if (wdBound) return; wdBound = true;
    document.addEventListener('keydown', function (e) {
      if (S.screen !== 'wordle' || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') wdKey('enter'); else if (e.key === 'Backspace') wdKey('back'); else if (/^[a-zA-Z]$/.test(e.key)) wdKey(e.key.toLowerCase());
    });
  }

  /* ================= Memory ================= */
  var EMOJI = ['🐶', '🐱', '🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🍕', '🍔', '🍩', '🍉', '⚽', '🎸', '🚀', '🌈'];
  var PAIRS = { easy: 6, medium: 8, hard: 12 };
  V.memorySetup = function () {
    var d = S.cfg.diff, best = store('best.mem.' + d);
    return TP.top(t('solo.memory'), 'solo') + TP.diffChips() + '<div class="panel"><p class="hint">' + T('solo.memory.d') + '</p>' + (best ? '<p class="hint">' + T('mem.best', { n: best }) + '</p>' : '') + '</div><button class="btn aqua" data-act="memstart">' + T('mem.start') + '</button>';
  };
  A.memstart = function () {
    var n = PAIRS[S.cfg.diff] || 8, em = EMOJI.slice().sort(function () { return rnd() - 0.5; }).slice(0, n), cards = [];
    em.forEach(function (e, i) { cards.push({ e: e, id: i, open: false, done: false }, { e: e, id: i, open: false, done: false }); });
    cards.sort(function () { return rnd() - 0.5; });
    TP.go('memory', { cards: cards, first: -1, lock: false, moves: 0, start: 0, end: 0, cols: n > 8 ? 4 : 4, diff: S.cfg.diff });
  };
  V.memory = function () {
    var g = S.g, won = g.cards.every(function (c) { return c.done; });
    var grid = g.cards.map(function (c, i) {
      return '<button class="mc' + (c.open || c.done ? ' open' : '') + (c.done ? ' done' : '') + '" data-act="memflip" data-a="' + i + '" aria-label="' + (c.open || c.done ? c.e : '?') + '"><span>' + (c.open || c.done ? c.e : '') + '</span></button>';
    }).join('');
    var msg = won ? '<div class="role r-aqua"><h2>' + T('mem.win') + '</h2><p>' + T('mem.moves', { n: g.moves }) + ' · ' + T('mem.time', { n: Math.round((g.end - g.start) / 1000) }) + '</p></div>' : '<p class="hint">' + T('mem.moves', { n: g.moves }) + '</p>';
    return TP.top(t('solo.memory'), 'memorySetup') + '<div class="stage">' + msg + '<div class="mgrid">' + grid + '</div>' + (won ? '<div class="row"><button class="btn aqua" data-act="memstart">' + T('mem.again') + '</button><button class="btn alt" data-act="go" data-a="solo">' + T('duel.menu') + '</button></div>' : '') + '</div>';
  };
  A.memflip = function (i) {
    var g = S.g; i = +i; var c = g.cards[i]; if (g.lock || c.open || c.done) return;
    if (!g.start) g.start = Date.now();
    c.open = true; TP.beep(500, 0.03, 0.04);
    if (g.first < 0) { g.first = i; TP.render(); return; }
    var a = g.cards[g.first]; g.moves++; g.lock = true;
    if (a.id === c.id) {
      a.done = c.done = true; a.open = c.open = false; g.first = -1; g.lock = false; TP.beep(880, 0.08, 0.06);
      if (g.cards.every(function (x) { return x.done; })) {
        g.end = Date.now(); var key = 'best.mem.' + g.diff, b = +store(key); if (!b || g.moves < b) store(key, g.moves);
      }
      TP.render(); return;
    }
    TP.render(); clear();
    var first = g.first;
    timer = setTimeout(function () { if (S.g !== g || S.screen !== 'memory') return; g.cards[first].open = false; c.open = false; g.first = -1; g.lock = false; TP.render(); }, 750);
  };

  /* ================= Reaction test ================= */
  var RX_ROUNDS = 5;
  V.reactionSetup = function () {
    var best = store('best.rx');
    return TP.top(t('solo.reaction'), 'solo') + '<div class="panel"><p class="hint">' + T('solo.reaction.d') + '</p>' + (best ? '<p class="hint">' + T('rx.best', { ms: best }) + '</p>' : '') + '</div><button class="btn coral" data-act="rxstart">' + T('rx.start') + '</button>';
  };
  A.rxstart = function () { clear(); TP.go('reaction', { phase: 'idle', round: 0, times: [], early: false }); rxNext(); };
  function rxNext() {
    var g = S.g; clear(); g.phase = 'wait'; g.round++; g.early = false; TP.render();
    var tok = g.round + ':' + g.times.length;
    timer = setTimeout(function () {
      if (S.g !== g || S.screen !== 'reaction' || g.phase !== 'wait' || tok !== g.round + ':' + g.times.length) return;
      g.phase = 'go'; g.t0 = performance.now(); TP.render(); TP.beep(880, 0.1, 0.1);
    }, 1200 + rnd() * 3800);
  }
  V.reaction = function () {
    var g = S.g, body;
    if (g.phase === 'done') {
      var avg = Math.round(g.times.reduce(function (a, b) { return a + b; }, 0) / g.times.length), best = +store('best.rx');
      body = '<div class="role r-lemon"><h2>' + T('rx.result', { ms: avg }) + '</h2><p>' + g.times.map(function (x) { return x + ' ms'; }).join(' · ') + '</p>' + (best ? '<p>' + T('rx.best', { ms: best }) + '</p>' : '') + '</div><div class="row"><button class="btn coral" data-act="rxstart">' + T('rx.again') + '</button><button class="btn alt" data-act="go" data-a="solo">' + T('duel.menu') + '</button></div>';
    } else {
      var label = g.phase === 'go' ? T('rx.tap') : g.early ? T('rx.early') : T('rx.wait');
      body = '<p class="kicker">' + T('rx.round', { n: g.round, m: RX_ROUNDS }) + '</p><button class="rxpad ' + (g.phase === 'go' ? 'go' : g.early ? 'early' : 'wait') + '" id="rxpad">' + label + '</button>';
    }
    S.after = function () {
      var el = document.getElementById('rxpad'); if (!el) return;
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (g.phase === 'wait') { clear(); g.early = true; g.round--; TP.beep(200, 0.15, 0.1); TP.render(); timer = setTimeout(function () { if (S.g === g && S.screen === 'reaction') rxNext(); }, 1200); return; }
        if (g.phase === 'go') {
          g.times.push(Math.round(performance.now() - g.t0));
          if (g.times.length >= RX_ROUNDS) {
            g.phase = 'done'; var avg = Math.round(g.times.reduce(function (a, b) { return a + b; }, 0) / g.times.length), b = +store('best.rx');
            if (!b || avg < b) store('best.rx', avg);
            TP.render();
          } else rxNext();
        }
      });
    };
    return TP.top(t('solo.reaction'), 'reactionSetup') + '<div class="stage">' + body + '</div>';
  };
};
