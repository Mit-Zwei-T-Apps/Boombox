/* Hangman on one phone: players take turns picking letters. */
window.TPHangman = function (TP) {
  'use strict';
  var S = TP.S, V = TP.V, A = TP.A, F = TP.F, t = TP.t, T = TP.T, esc = TP.esc;
  var MAX = 8, ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function base(ch) {
    var u = String(ch).toUpperCase();
    if (u === 'ß') return 'S';
    var d = u.normalize ? u.normalize('NFD').replace(/[̀-ͯ]/g, '') : u;
    return d.charAt(0);
  }
  function isLetter(ch) { return /[A-Z]/.test(base(ch)); }
  function pickWord(cat) {
    var words = TP.D('words'), keys = Object.keys(words), pool;
    pool = cat === 'all' || !words[cat] ? [].concat.apply([], keys.map(function (k) { return words[k].list; })) : words[cat].list;
    pool = pool.filter(function (w) { return String(w).replace(/[^A-Za-zÀ-ÿß]/g, '').length >= 3; });
    var u = new Uint32Array(1); try { crypto.getRandomValues(u); } catch (e) { u[0] = Math.floor(Math.random() * 4294967295); }
    return pool[u[0] % pool.length];
  }
  function newGame(word) {
    var w = String(word).trim().toUpperCase().slice(0, 30);
    return { word: w, max: { easy: 10, medium: 8, hard: 6 }[S.cfg.diff] || 8, base: w.split('').map(base), guessed: [], wrong: 0, turn: Math.floor(Math.random() * Math.max(1, S.players.length)), done: null, cat: S.cfg.hm.cat };
  }
  function figure(wrong, max) {
    var n = wrong >= max ? 8 : Math.ceil(wrong * 8 / max);
    var p = [
      '<path d="M10 190 H110"/>', '<path d="M40 190 V20"/>', '<path d="M40 20 H120"/>', '<path d="M120 20 V45"/>',
      '<circle cx="120" cy="60" r="15"/>', '<path d="M120 75 V130"/>', '<path d="M120 90 L98 112 M120 90 L142 112"/>', '<path d="M120 130 L100 165 M120 130 L140 165"/>'
    ];
    return '<svg class="hang" viewBox="0 0 180 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' + p.slice(0, n).join('') + '</g></svg>';
  }

  V.hangmanSetup = function () {
    var words = TP.D('words'), c = S.cfg.hm;
    var cats = ['all'].concat(Object.keys(words)).map(function (k) {
      return '<button class="chip' + (c.cat === k ? ' on' : '') + '" data-act="hmcat" data-a="' + k + '">' + (k === 'all' ? T('imp.all') : esc(words[k].label)) + '</button>';
    }).join('') + '<button class="chip' + (c.cat === 'own' ? ' on' : '') + '" data-act="hmcat" data-a="own">' + T('hm.own') + '</button>';
    return TP.top(t('g.hangman')) + '<div class="panel"><div class="label">' + T('hm.topic') + '</div><div class="chips">' + cats + '</div>' +
      (c.cat === 'own' ? '<p class="hint">' + T('hm.ownHint') + '</p>' : '') + '</div>' + TP.diffChips() + '<button class="btn lilac" data-act="hmstart">' + T('hm.start') + '</button>';
  };
  A.hmcat = function (k) { S.cfg.hm.cat = k; TP.render(); };
  A.hmstart = function () {
    var c = S.cfg.hm;
    if (c.cat === 'own') { TP.go('hangmanOwn', {}); return; }
    TP.go('hangman', newGame(pickWord(c.cat)));
  };
  V.hangmanOwn = function () {
    return TP.top(t('g.hangman'), 'hangmanSetup') + '<form class="stack" data-form="hmown"><div class="panel"><p class="hint">' + T('hm.ownTitle') + '</p>' +
      '<div class="field"><label for="hmword">' + T('hm.word') + '</label><div class="pw"><input id="hmword" name="hmword" type="password" maxlength="30" autocomplete="off" autocapitalize="characters" required>' +
      '<button type="button" class="pwb" data-act="pwshow" data-a="hmword" aria-pressed="false">' + T('pw.show') + '</button></div></div></div><button class="btn lilac" type="submit">' + T('hm.start') + '</button></form>';
  };
  F.hmown = function (f) {
    var w = f.elements.hmword.value.trim(); if (w.replace(/[^A-Za-zÀ-ÿß]/g, '').length < 2) return;
    TP.go('hangman', newGame(w));
  };
  V.hangman = function () {
    var g = S.g, shown = g.word.split('').map(function (ch, i) {
      if (!isLetter(ch)) return ch === ' ' ? '&nbsp;&nbsp;' : esc(ch);
      return g.guessed.indexOf(g.base[i]) !== -1 || g.done === 'lose' ? '<span class="' + (g.guessed.indexOf(g.base[i]) === -1 ? 'miss' : '') + '">' + esc(ch) + '</span>' : '_';
    }).join(' ');
    var who = S.players[g.turn % S.players.length];
    var keys = ABC.map(function (l) {
      var used = g.guessed.indexOf(l) !== -1, hit = used && g.base.indexOf(l) !== -1;
      return '<button class="key' + (used ? (hit ? ' hit' : ' bad') : '') + '"' + (used || g.done ? ' disabled' : '') + ' data-act="hmpick" data-a="' + l + '">' + l + '</button>';
    }).join('');
    var msg = g.done === 'win' ? '<div class="role r-aqua"><h2>' + T('hm.win') + '</h2></div>' : g.done === 'lose' ? '<div class="role r-coral"><h2>' + T('hm.lose') + '</h2></div>' : '<p class="kicker">' + T('hm.turn', { name: who }) + '</p>';
    return TP.top(t('g.hangman'), 'hangmanSetup') + '<div class="stage">' + msg + figure(g.wrong, g.max) + '<p class="hmword">' + shown + '</p><p class="hint">' + T('hm.wrong', { n: g.wrong, m: g.max }) + '</p>' +
      (g.done ? '<div class="row"><button class="btn lilac" data-act="hmstart">' + T('hm.again') + '</button><button class="btn alt" data-act="go" data-a="home">' + T('overview') + '</button></div>' : '<div class="keys">' + keys + '</div>') + '</div>';
  };
  A.hmpick = function (l) {
    var g = S.g; if (g.done || g.guessed.indexOf(l) !== -1) return;
    g.guessed.push(l);
    if (g.base.indexOf(l) === -1) { g.wrong++; TP.beep(180, 0.15, 0.1); } else TP.beep(660, 0.06, 0.06);
    var won = g.base.every(function (b, i) { return !isLetter(g.word.charAt(i)) || g.guessed.indexOf(b) !== -1; });
    if (won) g.done = 'win'; else if (g.wrong >= g.max) g.done = 'lose'; else g.turn = (g.turn + 1) % S.players.length;
    TP.render();
  };
};
