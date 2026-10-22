/* Chess on one phone: two players or against a bot (3 levels). Engine is dependency-free. */
(function (root) {
  'use strict';
  var START = 'rnbqkbnrpppppppp' + '                ' + '                ' + 'PPPPPPPPRNBQKBNR';
  var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  var N = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var K = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var D = [[-1, -1], [-1, 1], [1, -1], [1, 1]], O = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  function white(c) { return c !== ' ' && c === c.toUpperCase(); }
  function newState() { return { b: START.split(''), turn: 'w', cast: 'KQkq', ep: -1, half: 0, last: null }; }
  function side(c) { return white(c) ? 'w' : 'b'; }
  function attacked(b, sq, by) { // is square sq attacked by side `by`
    var r = sq >> 3, f = sq & 7, i, x, y, c, k;
    var pr = by === 'w' ? 1 : -1; // white pawns attack upward (towards smaller row): attacker sits at row r+1
    for (i = -1; i <= 1; i += 2) { y = r + pr; x = f + i; if (y >= 0 && y < 8 && x >= 0 && x < 8) { c = b[y * 8 + x]; if (c === (by === 'w' ? 'P' : 'p')) return true; } }
    for (i = 0; i < 8; i++) { y = r + N[i][0]; x = f + N[i][1]; if (y >= 0 && y < 8 && x >= 0 && x < 8 && b[y * 8 + x] === (by === 'w' ? 'N' : 'n')) return true; }
    for (i = 0; i < 8; i++) { y = r + K[i][0]; x = f + K[i][1]; if (y >= 0 && y < 8 && x >= 0 && x < 8 && b[y * 8 + x] === (by === 'w' ? 'K' : 'k')) return true; }
    for (k = 0; k < 8; k++) {
      var dir = k < 4 ? D[k] : O[k - 4], q = by === 'w' ? 'Q' : 'q', s = k < 4 ? (by === 'w' ? 'B' : 'b') : (by === 'w' ? 'R' : 'r');
      y = r + dir[0]; x = f + dir[1];
      while (y >= 0 && y < 8 && x >= 0 && x < 8) { c = b[y * 8 + x]; if (c !== ' ') { if (c === q || c === s) return true; break; } y += dir[0]; x += dir[1]; }
    }
    return false;
  }
  function kingSq(b, s) { return b.indexOf(s === 'w' ? 'K' : 'k'); }
  function inCheck(st, s) { return attacked(st.b, kingSq(st.b, s), s === 'w' ? 'b' : 'w'); }
  function pseudo(st) {
    var b = st.b, s = st.turn, out = [], from, c, r, f, i, y, x, t, dir, e = s === 'w' ? 'b' : 'w';
    function add(to, flag) { out.push({ from: from, to: to, flag: flag || '' }); }
    for (from = 0; from < 64; from++) {
      c = b[from]; if (c === ' ' || side(c) !== s) continue;
      r = from >> 3; f = from & 7; var p = c.toLowerCase();
      if (p === 'p') {
        dir = s === 'w' ? -1 : 1; var start = s === 'w' ? 6 : 1, last = s === 'w' ? 0 : 7;
        y = r + dir;
        if (y >= 0 && y < 8 && b[y * 8 + f] === ' ') {
          add(y * 8 + f, y === last ? 'q' : '');
          if (r === start && b[(r + 2 * dir) * 8 + f] === ' ') add((r + 2 * dir) * 8 + f, 'dbl');
        }
        for (i = -1; i <= 1; i += 2) {
          x = f + i; if (x < 0 || x > 7 || y < 0 || y > 7) continue; t = y * 8 + x;
          if (b[t] !== ' ' && side(b[t]) === e) add(t, y === last ? 'q' : '');
          else if (t === st.ep) add(t, 'ep');
        }
      } else if (p === 'n' || p === 'k') {
        var L = p === 'n' ? N : K;
        for (i = 0; i < 8; i++) { y = r + L[i][0]; x = f + L[i][1]; if (y < 0 || y > 7 || x < 0 || x > 7) continue; t = y * 8 + x; if (b[t] === ' ' || side(b[t]) === e) add(t); }
        if (p === 'k') {
          var home = s === 'w' ? 60 : 4, ks = s === 'w' ? 'K' : 'k', qs = s === 'w' ? 'Q' : 'q';
          if (from === home && !attacked(b, home, e)) {
            if (st.cast.indexOf(ks) !== -1 && b[home + 1] === ' ' && b[home + 2] === ' ' && b[home + 3] === (s === 'w' ? 'R' : 'r') && !attacked(b, home + 1, e) && !attacked(b, home + 2, e)) add(home + 2, 'ks');
            if (st.cast.indexOf(qs) !== -1 && b[home - 1] === ' ' && b[home - 2] === ' ' && b[home - 3] === ' ' && b[home - 4] === (s === 'w' ? 'R' : 'r') && !attacked(b, home - 1, e) && !attacked(b, home - 2, e)) add(home - 2, 'qs');
          }
        }
      } else {
        var dirs = p === 'b' ? D : p === 'r' ? O : D.concat(O);
        for (i = 0; i < dirs.length; i++) {
          y = r + dirs[i][0]; x = f + dirs[i][1];
          while (y >= 0 && y < 8 && x >= 0 && x < 8) {
            t = y * 8 + x;
            if (b[t] === ' ') add(t); else { if (side(b[t]) === e) add(t); break; }
            y += dirs[i][0]; x += dirs[i][1];
          }
        }
      }
    }
    return out;
  }
  function apply(st, m, promo) {
    var b = st.b.slice(), c = b[m.from], cap = b[m.to] !== ' ' || m.flag === 'ep', s = st.turn, cast = st.cast, ep = -1;
    b[m.from] = ' '; b[m.to] = c;
    if (m.flag === 'ep') b[m.to + (s === 'w' ? 8 : -8)] = ' ';
    if (m.flag === 'dbl') ep = (m.from + m.to) / 2;
    if (m.flag === 'ks') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = ' '; }
    if (m.flag === 'qs') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = ' '; }
    if (m.flag === 'q') { var pc = promo || 'q'; b[m.to] = s === 'w' ? pc.toUpperCase() : pc; }
    function strip(ch) { cast = cast.replace(ch, ''); }
    if (c === 'K') { strip('K'); strip('Q'); } if (c === 'k') { strip('k'); strip('q'); }
    [[0, 'q'], [7, 'k'], [56, 'Q'], [63, 'K']].forEach(function (z) { if (m.from === z[0] || m.to === z[0]) strip(z[1]); });
    return { b: b, turn: s === 'w' ? 'b' : 'w', cast: cast, ep: ep, half: (cap || c.toLowerCase() === 'p') ? 0 : st.half + 1, last: { from: m.from, to: m.to } };
  }
  function legal(st) {
    var s = st.turn;
    return pseudo(st).filter(function (m) { return !inCheck(apply(st, m), s); });
  }
  function insufficient(b) {
    var pcs = b.filter(function (c) { return c !== ' ' && c.toLowerCase() !== 'k'; });
    if (!pcs.length) return true;
    return pcs.length === 1 && /[nb]/i.test(pcs[0]);
  }
  function status(st) { // 'play' | 'check' | 'mate' | 'stalemate' | 'draw50' | 'material'
    var ms = legal(st), chk = inCheck(st, st.turn);
    if (!ms.length) return chk ? 'mate' : 'stalemate';
    if (insufficient(st.b)) return 'material';
    if (st.half >= 100) return 'draw50';
    return chk ? 'check' : 'play';
  }
  function evalSt(st) { // from white's view
    var s = 0, i, c, v, r, f, p;
    for (i = 0; i < 64; i++) {
      c = st.b[i]; if (c === ' ') continue; p = c.toLowerCase(); v = VAL[p];
      r = i >> 3; f = i & 7;
      var rr = white(c) ? 7 - r : r, cen = 3.5 - Math.abs(3.5 - f) + 3.5 - Math.abs(3.5 - r);
      if (p === 'p') v += rr * 8 + (f > 1 && f < 6 ? cen * 2 : 0);
      else if (p === 'n' || p === 'b') v += cen * 6;
      else if (p === 'q') v += cen * 2;
      else if (p === 'k') v -= rr === 0 ? 0 : rr * 6;
      s += white(c) ? v : -v;
    }
    return s;
  }
  function order(st, ms) {
    return ms.map(function (m) { var t = st.b[m.to]; m.o = (t !== ' ' ? VAL[t.toLowerCase()] * 10 - VAL[st.b[m.from].toLowerCase()] : 0) + (m.flag === 'q' ? 800 : 0); return m; })
      .sort(function (a, b) { return b.o - a.o; });
  }
  function search(st, d, alpha, beta, q) {
    var ms = legal(st), pl = st.turn === 'w';
    if (!ms.length) return inCheck(st, st.turn) ? (pl ? -100000 - d : 100000 + d) : 0;
    if (d <= 0) {
      var e = evalSt(st);
      if (q <= 0) return e;
      var caps = ms.filter(function (m) { return st.b[m.to] !== ' ' || m.flag === 'ep'; });
      if (!caps.length) return e;
      if (pl) { if (e >= beta) return e; if (e > alpha) alpha = e; } else { if (e <= alpha) return e; if (e < beta) beta = e; }
      ms = caps;
    }
    ms = order(st, ms);
    var best = pl ? -Infinity : Infinity, i, v;
    for (i = 0; i < ms.length; i++) {
      v = search(apply(st, ms[i]), d - 1, alpha, beta, q);
      if (pl) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
      if (beta <= alpha) break;
    }
    return best;
  }
  function bestMove(st, level, rnd) {
    var ms = legal(st); if (!ms.length) return null;
    rnd = rnd || Math.random;
    if (level === 'easy') { // mostly random, grabs a free piece sometimes
      if (rnd() < 0.5) { var g = order(st, ms.slice()); if (st.b[g[0].to] !== ' ' && rnd() < 0.7) return g[0]; }
      return ms[Math.floor(rnd() * ms.length)];
    }
    var depth = level === 'hard' ? 3 : 2, pl = st.turn === 'w', best = null, bv = pl ? -Infinity : Infinity;
    order(st, ms).forEach(function (m) {
      var v = search(apply(st, m), depth - 1, -Infinity, Infinity, level === 'hard' ? 2 : 0) + (rnd() - 0.5) * (level === 'hard' ? 4 : 30);
      if (pl ? v > bv : v < bv) { bv = v; best = m; }
    });
    return best;
  }
  var api = { newState: newState, legal: legal, apply: apply, status: status, inCheck: inCheck, bestMove: bestMove, white: white };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TPChessEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof window !== 'undefined') window.TPChess = function (TP) {
  'use strict';
  var S = TP.S, V = TP.V, A = TP.A, t = TP.t, T = TP.T, E = window.TPChessEngine, timer = null;
  var SYM = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  S.cfg.chess = S.cfg.chess || { bot: true, side: 'w' };
  function stop() { if (timer) { clearTimeout(timer); timer = null; } }
  V.chessSetup = function () {
    var c = S.cfg.chess;
    function chip(on, act, a, label) { return '<button class="chip' + (on ? ' on' : '') + '" data-act="' + act + '" data-a="' + a + '">' + label + '</button>'; }
    return TP.top(t('g.chess')) +
      '<div class="panel"><div class="label">' + T('duel.opp') + '</div><div class="chips">' + chip(c.bot, 'chbot', '1', T('duel.bot')) + chip(!c.bot, 'chbot', '0', T('duel.human')) + '</div></div>' +
      (c.bot ? '<div class="panel"><div class="label">' + T('chess.side') + '</div><div class="chips">' + chip(c.side === 'w', 'chside', 'w', T('chess.white')) + chip(c.side === 'b', 'chside', 'b', T('chess.black')) + chip(c.side === 'r', 'chside', 'r', T('chess.random')) + '</div></div>' + TP.diffChips() : '') +
      '<button class="btn lilac" data-act="chstart">' + T('hm.start') + '</button>';
  };
  A.chbot = function (v) { S.cfg.chess.bot = v === '1'; TP.render(); };
  A.chside = function (v) { S.cfg.chess.side = v; TP.render(); };
  A.chstart = function () {
    stop(); var c = S.cfg.chess, me = c.side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : c.side;
    TP.go('chess', { ch: { st: E.newState(), sel: -1, moves: [], bot: c.bot, me: me, diff: S.cfg.diff, over: null, promo: null, hist: [] } });
    botMove();
  };
  function names() {
    var ch = S.g.ch, P = S.players;
    if (ch.bot) return { w: ch.me === 'w' ? P[0] : T('chess.bot'), b: ch.me === 'b' ? P[0] : T('chess.bot') };
    return { w: P[0], b: P[1] || T('chess.black') };
  }
  function botMove() {
    var ch = S.g.ch; stop();
    if (!ch.bot || ch.over || ch.st.turn === ch.me) return;
    timer = setTimeout(function () {
      timer = null; if (S.screen !== 'chess' || S.g.ch !== ch || ch.over) return;
      var m = E.bestMove(ch.st, ch.diff); if (m) play(m, 'q');
    }, 450);
  }
  function play(m, promo) {
    var ch = S.g.ch, cap = ch.st.b[m.to] !== ' ' || m.flag === 'ep';
    ch.st = E.apply(ch.st, m, promo); ch.sel = -1; ch.moves = []; ch.promo = null;
    var s = E.status(ch.st);
    if (s === 'mate' || s === 'stalemate' || s === 'draw50' || s === 'material') { ch.over = s; TP.buzz([60, 40, 60]); TP.beep(s === 'mate' ? 880 : 440, 0.3, 0.1); }
    else TP.beep(cap ? 330 : 520, 0.05, 0.06);
    TP.render(); botMove();
  }
  A.chsq = function (i) {
    var ch = S.g.ch, sq = +i; if (ch.over || ch.promo) return;
    if (ch.bot && ch.st.turn !== ch.me) return;
    var mv = ch.moves.filter(function (m) { return m.to === sq; });
    if (ch.sel >= 0 && mv.length) {
      if (mv[0].flag === 'q') { ch.promo = mv[0]; TP.render(); return; }
      play(mv[0]); return;
    }
    var c = ch.st.b[sq];
    if (c !== ' ' && E.white(c) === (ch.st.turn === 'w')) { ch.sel = sq; ch.moves = E.legal(ch.st).filter(function (m) { return m.from === sq; }); } else { ch.sel = -1; ch.moves = []; }
    TP.render();
  };
  A.chpromo = function (p) { var ch = S.g.ch; if (ch.promo) play(ch.promo, p); };
  A.chundo = function () { /* new game restarts */ A.chstart(); };
  V.chess = function () {
    var ch = S.g.ch, st = ch.st, flip = ch.bot ? ch.me === 'b' : false, nm = names(), html = '', r, f, i, chk = E.status(st) === 'check' || ch.over === 'mate';
    var ks = chk ? st.b.indexOf(st.turn === 'w' ? 'K' : 'k') : -1;
    for (r = 0; r < 8; r++) for (f = 0; f < 8; f++) {
      var rr = flip ? 7 - r : r, ff = flip ? 7 - f : f; i = rr * 8 + ff;
      var c = st.b[i], cls = 'sq ' + ((rr + ff) % 2 ? 'dk' : 'lt');
      if (ch.sel === i) cls += ' sel';
      if (st.last && (st.last.from === i || st.last.to === i)) cls += ' lm';
      if (ks === i) cls += ' chk';
      var tgt = ch.moves.some(function (m) { return m.to === i; });
      if (tgt) cls += c !== ' ' ? ' cap' : ' tgt';
      html += '<button class="' + cls + '" data-act="chsq" data-a="' + i + '" aria-label="' + (c === ' ' ? '' : c) + '">' + (c === ' ' ? '' : '<span class="pc ' + (E.white(c) ? 'wp' : 'bp') + '">' + SYM[c.toUpperCase()] + '</span>') + '</button>';
    }
    var msg;
    if (ch.over === 'mate') msg = '<div class="role r-aqua"><h2>' + T('chess.mate', { name: st.turn === 'w' ? nm.b : nm.w }) + '</h2></div>';
    else if (ch.over) msg = '<div class="role r-lemon"><h2>' + T('chess.' + ch.over) + '</h2></div>';
    else msg = '<p class="kicker">' + T('chess.turn', { name: st.turn === 'w' ? nm.w : nm.b }) + (chk ? ' · ' + T('chess.check') : '') + '</p>';
    var promo = ch.promo ? '<div class="panel"><div class="label">' + T('chess.promo') + '</div><div class="chips">' + ['q', 'r', 'b', 'n'].map(function (p) { return '<button class="chip pcp" data-act="chpromo" data-a="' + p + '">' + SYM[p.toUpperCase()] + '</button>'; }).join('') + '</div></div>' : '';
    return TP.top(t('g.chess'), 'chessSetup') + '<div class="stage">' + msg + '<div class="board' + (ch.bot ? '' : '') + '">' + html + '</div>' + promo +
      '<div class="row"><button class="btn lilac" data-act="chstart">' + T('chess.again') + '</button><button class="btn alt" data-act="go" data-a="home">' + T('overview') + '</button></div></div>';
  };
};
