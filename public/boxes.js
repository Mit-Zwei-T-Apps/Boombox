/* Dots and boxes (Käsekästchen): shared rules for the browser and the server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TPBoxes = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var COLORS = ['#FF6B57', '#3FD6C8', '#FFD84A', '#B0A4FF'];

  function create(n, players) {
    n = Math.max(2, Math.min(8, n | 0 || 5));
    var h = [], v = [], box = [], i;
    for (i = 0; i < (n + 1) * n; i++) h.push(-1);
    for (i = 0; i < n * (n + 1); i++) v.push(-1);
    for (i = 0; i < n * n; i++) box.push(-1);
    var scores = []; for (i = 0; i < players; i++) scores.push(0);
    return { n: n, h: h, v: v, box: box, turn: 0, scores: scores, players: players, done: false, last: null };
  }
  function parse(s, key) {
    var m = /^([hv]):(\d+):(\d+)$/.exec(String(key));
    if (!m) return null;
    var k = m[1], r = +m[2], c = +m[3], n = s.n;
    if (k === 'h' ? !(r <= n && c < n) : !(r < n && c <= n)) return null;
    return { k: k, r: r, c: c, i: k === 'h' ? r * n + c : r * (n + 1) + c };
  }
  function boxDone(s, r, c) {
    var n = s.n;
    return s.h[r * n + c] >= 0 && s.h[(r + 1) * n + c] >= 0 && s.v[r * (n + 1) + c] >= 0 && s.v[r * (n + 1) + c + 1] >= 0;
  }
  // Draw one edge for the player whose turn it is. Returns the number of boxes completed, or -1 if the move is invalid.
  function move(s, key) {
    if (s.done) return -1;
    var e = parse(s, key); if (!e) return -1;
    var arr = e.k === 'h' ? s.h : s.v;
    if (arr[e.i] >= 0) return -1;
    arr[e.i] = s.turn; s.last = key;
    var n = s.n, got = 0, cand = e.k === 'h' ? [[e.r - 1, e.c], [e.r, e.c]] : [[e.r, e.c - 1], [e.r, e.c]];
    cand.forEach(function (b) {
      var r = b[0], c = b[1];
      if (r < 0 || c < 0 || r >= n || c >= n || s.box[r * n + c] >= 0) return;
      if (boxDone(s, r, c)) { s.box[r * n + c] = s.turn; s.scores[s.turn]++; got++; }
    });
    if (s.scores.reduce(function (a, b) { return a + b; }, 0) === n * n) { s.done = true; return got; }
    if (!got) s.turn = (s.turn + 1) % s.players;
    return got;
  }
  function winners(s) {
    var max = Math.max.apply(null, s.scores);
    return s.scores.map(function (x, i) { return x === max ? i : -1; }).filter(function (i) { return i >= 0; });
  }
  // SVG board. act = data-act name for taps (omit for a read-only board).
  function svg(s, act, letters) {
    var n = s.n, u = 100, pad = 22, size = n * u + pad * 2, out = [], r, c, i;
    out.push('<svg class="board" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="board">');
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      var o = s.box[r * n + c];
      if (o >= 0) {
        out.push('<rect x="' + (pad + c * u + 6) + '" y="' + (pad + r * u + 6) + '" width="' + (u - 12) + '" height="' + (u - 12) + '" rx="12" fill="' + COLORS[o] + '" opacity=".85"/>');
        out.push('<text x="' + (pad + c * u + u / 2) + '" y="' + (pad + r * u + u / 2 + 13) + '" text-anchor="middle" font-size="38" font-weight="800" fill="#0A2733">' + ((letters && letters[o]) || '') + '</text>');
      }
    }
    function edge(k, rr, cc, x1, y1, x2, y2, owner) {
      var key = k + ':' + rr + ':' + cc, drawn = owner >= 0;
      if (drawn) out.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + COLORS[owner] + '" stroke-width="' + (s.last === key ? 13 : 10) + '" stroke-linecap="round"/>');
      else {
        out.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#A3BDC7" stroke-opacity=".35" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 12"/>');
        if (act && !s.done) out.push('<line class="hit" data-act="' + act + '" data-a="' + key + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="transparent" stroke-width="42" stroke-linecap="round" role="button" aria-label="' + key + '"/>');
      }
    }
    for (r = 0; r <= n; r++) for (c = 0; c < n; c++) edge('h', r, c, pad + c * u, pad + r * u, pad + (c + 1) * u, pad + r * u, s.h[r * n + c]);
    for (r = 0; r < n; r++) for (c = 0; c <= n; c++) edge('v', r, c, pad + c * u, pad + r * u, pad + c * u, pad + (r + 1) * u, s.v[r * (n + 1) + c]);
    for (r = 0; r <= n; r++) for (c = 0; c <= n; c++) out.push('<circle cx="' + (pad + c * u) + '" cy="' + (pad + r * u) + '" r="7" fill="#F3F7F2"/>');
    out.push('</svg>');
    void i;
    return out.join('');
  }

  // ---- computer player: level 'easy' | 'medium' | 'hard' ----
  function freeEdges(s) {
    var n = s.n, out = [], r, c;
    for (r = 0; r <= n; r++) for (c = 0; c < n; c++) if (s.h[r * n + c] < 0) out.push('h:' + r + ':' + c);
    for (r = 0; r < n; r++) for (c = 0; c <= n; c++) if (s.v[r * (n + 1) + c] < 0) out.push('v:' + r + ':' + c);
    return out;
  }
  function sides(s, r, c) {
    var n = s.n;
    return (s.h[r * n + c] >= 0 ? 1 : 0) + (s.h[(r + 1) * n + c] >= 0 ? 1 : 0) + (s.v[r * (n + 1) + c] >= 0 ? 1 : 0) + (s.v[r * (n + 1) + c + 1] >= 0 ? 1 : 0);
  }
  // how many boxes this edge completes and how many it turns into 3-sided boxes (a gift for the opponent)
  function judge(s, key) {
    var e = parse(s, key), n = s.n, take = 0, give = 0;
    var cand = e.k === 'h' ? [[e.r - 1, e.c], [e.r, e.c]] : [[e.r, e.c - 1], [e.r, e.c]];
    cand.forEach(function (b) {
      if (b[0] < 0 || b[1] < 0 || b[0] >= n || b[1] >= n || s.box[b[0] * n + b[1]] >= 0) return;
      var k = sides(s, b[0], b[1]);
      if (k === 3) take++; else if (k === 2) give++;
    });
    return { take: take, give: give };
  }
  function pickRand(a, rnd) { return a[Math.floor(rnd() * a.length)]; }
  function bestMove(s, level, rnd) {
    rnd = rnd || Math.random;
    var f = freeEdges(s); if (!f.length) return null;
    var j = f.map(function (k) { return { k: k, j: judge(s, k) }; });
    var takes = j.filter(function (x) { return x.j.take > 0; });
    if (level === 'easy') { if (takes.length && rnd() < 0.5) return pickRand(takes, rnd).k; return pickRand(f, rnd); }
    if (takes.length) {
      if (level === 'hard') { // grab boxes, but prefer a move that takes more and doesn't open another one
        takes.sort(function (a, b) { return (b.j.take - b.j.give) - (a.j.take - a.j.give); });
        return takes[0].k;
      }
      return pickRand(takes, rnd).k;
    }
    var safe = j.filter(function (x) { return x.j.give === 0; });
    if (safe.length) return pickRand(safe, rnd).k;
    var least = Math.min.apply(null, j.map(function (x) { return x.j.give; }));
    return pickRand(j.filter(function (x) { return x.j.give === least; }), rnd).k;
  }
  return { COLORS: COLORS, create: create, move: move, winners: winners, svg: svg, bestMove: bestMove };
}));
