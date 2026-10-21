/* Two-player games on one phone: the players sit opposite each other, the top half is mirrored. */
window.TPDuel = function (TP) {
  'use strict';
  var S = TP.S, V = TP.V, A = TP.A, t = TP.t, T = TP.T, esc = TP.esc;
  var KINDS = ['tug', 'react', 'ttt', 'rps'];
  var tm = null;
  function rnd() { try { var u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch (e) { return Math.random(); } }
  function names(g) { return [S.players[g.a] || t('duel.p1'), S.players[g.b] || t('duel.p2')]; }
  function clear() { if (tm) { clearTimeout(tm); tm = null; } }

  V.duel = function () {
    var g = S.g, n = S.players.length;
    if (g.a === undefined) { g.a = 0; g.b = Math.min(1, n - 1); }
    function chips(who) {
      return '<div class="chips">' + S.players.map(function (nm, i) {
        var other = who === 'a' ? g.b : g.a;
        return '<button class="chip' + (g[who] === i ? ' on' : '') + '"' + (i === other ? ' disabled' : '') + ' data-act="duelpick" data-a="' + who + '" data-b="' + i + '">' + esc(nm) + '</button>';
      }).join('') + '</div>';
    }
    var list = KINDS.map(function (k) {
      return '<button class="card c-duel" data-act="duelstart" data-a="' + k + '"><h3>' + T('duel.' + k) + '</h3><p>' + T('duel.' + k + '.d') + '</p></button>';
    }).join('');
    return TP.top(t('g.duel')) + '<div class="panel"><div class="label">' + T('duel.pickA') + '</div>' + chips('a') + '<div class="label" style="margin-top:12px">' + T('duel.pickB') + '</div>' + chips('b') + '</div><div class="grid">' + list + '</div>';
  };
  A.duelpick = function (who, i) { var g = S.g; g[who] = +i; TP.render(); };
  A.duelstart = function (kind) {
    var g = S.g;
    TP.go('duelPlay', { kind: kind, a: g.a, b: g.b, score: [0, 0], round: newRound(kind) });
  };
  function newRound(kind) {
    if (kind === 'tug') return { pos: 50, done: null };
    if (kind === 'react') return { phase: 'wait', done: null, token: Math.random() };
    if (kind === 'ttt') return { cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], turn: 1, done: null };
    return { pick: [null, null], done: null };
  }
  /* side 1 = bottom player (normal), side 2 = top player (mirrored) */
  function frame(g, nm, mid, body1, body2) {
    var p = g.kind === 'tug' ? Math.max(4, Math.min(96, g.round.pos)) : 50;
    return '<div class="dw"><div class="half h2 flip" style="flex-grow:' + (100 - p) + '">' + body2 + '</div><div class="mid">' + mid + '</div><div class="half h1" style="flex-grow:' + p + '">' + body1 + '</div></div>';
  }
  function scoreLine(g) { var nm = names(g); return '<span>' + esc(nm[1]) + ' ' + g.score[1] + ' : ' + g.score[0] + ' ' + esc(nm[0]) + '</span>'; }
  function endBtns() { return '<button class="btn small" data-act="duelagain">' + T('duel.again') + '</button><button class="btn alt small" data-act="go" data-a="duel">' + T('duel.menu') + '</button>'; }
  function result(g, side) { /* side 0 or 1: which player's half */
    var r = g.round, nm = names(g);
    if (r.done === null) return '';
    var txt = r.done === 'draw' ? T('duel.draw') : T('duel.wins', { name: nm[r.done] });
    if (r.note) txt += '<small>' + r.note + '</small>';
    return '<div class="res"><h2>' + txt + '</h2></div>';
  }

  V.duelPlay = function () {
    var g = S.g, r = g.round, nm = names(g), k = g.kind, over = r.done !== null;
    var mid = '<button class="back sm" data-act="go" data-a="duel">' + T('back') + '</button>' + scoreLine(g) + (over ? '<span class="eb">' + endBtns() + '</span>' : '');
    var b = ['', ''];
    S.after = function () { hook(g); };
    if (k === 'tug') {
      [0, 1].forEach(function (i) { b[i] = over ? result(g, i) : '<button class="tapbtn" id="tap' + i + '" aria-label="' + esc(nm[i]) + '">' + T('duel.tap') + '<small>' + esc(nm[i]) + '</small></button>'; });
    } else if (k === 'react') {
      [0, 1].forEach(function (i) {
        var cls = r.phase === 'go' ? 'go' : 'wait';
        b[i] = over ? result(g, i) : '<button class="tapbtn ' + cls + '" id="tap' + i + '">' + (r.phase === 'go' ? T('duel.now') : T('duel.wait')) + '<small>' + esc(nm[i]) + '</small></button>';
      });
    } else if (k === 'ttt') {
      var cells = r.cells.map(function (c, i) {
        return '<button class="cell" data-act="duelttt" data-a="' + i + '"' + (c || over ? ' disabled' : '') + '>' + (c === 1 ? 'X' : c === 2 ? 'O' : '') + '</button>';
      }).join('');
      var st = over ? '' : T('duel.turn', { name: nm[r.turn === 1 ? 0 : 1] }) + ' (' + (r.turn === 1 ? 'X' : 'O') + ')';
      b[0] = over ? result(g, 0) : '<p class="st">' + (r.turn === 1 ? st : '') + '</p>';
      b[1] = over ? result(g, 1) : '<p class="st">' + (r.turn === 2 ? st : '') + '</p>';
      mid = '<div class="board3">' + cells + '</div>' + mid;
    } else {
      [0, 1].forEach(function (i) {
        if (over) { b[i] = result(g, i) + '<p class="st">' + esc(nm[0]) + ': ' + T('duel.' + ['rock', 'paper', 'scissors'][r.pick[0]]) + ' · ' + esc(nm[1]) + ': ' + T('duel.' + ['rock', 'paper', 'scissors'][r.pick[1]]) + '</p>'; return; }
        if (r.pick[i] !== null) { b[i] = '<p class="st">' + T('duel.locked') + '</p>'; return; }
        b[i] = '<p class="st">' + esc(nm[i]) + '</p><div class="rps">' + ['✊', '✋', '✌️'].map(function (e, j) {
          return '<button data-act="duelrps" data-a="' + i + '" data-b="' + j + '" aria-label="' + T('duel.' + ['rock', 'paper', 'scissors'][j]) + '">' + e + '</button>';
        }).join('') + '</div>';
      });
    }
    return frame(g, nm, mid, b[0], b[1]);
  };

  function finish(g, winner, note) {
    var r = g.round; if (r.done !== null) return;
    r.done = winner; r.note = note || '';
    if (winner === 0 || winner === 1) g.score[winner]++;
    TP.beep(winner === 'draw' ? 300 : 880, 0.18, 0.12);
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ }
    clear(); TP.render();
  }
  function hook(g) {
    var r = g.round; clear();
    if (g.kind === 'tug' && r.done === null) {
      [0, 1].forEach(function (i) {
        var el = document.getElementById('tap' + i); if (!el) return;
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault(); if (r.done !== null) return;
          r.pos += i === 0 ? 4 : -4; TP.beep(500 + Math.abs(50 - r.pos) * 4, 0.03, 0.04);
          var p = Math.max(4, Math.min(96, r.pos)), h1 = document.querySelector('.dw .h1'), h2 = document.querySelector('.dw .h2');
          if (h1) h1.style.flexGrow = p; if (h2) h2.style.flexGrow = 100 - p;
          if (r.pos >= 100) finish(g, 0); else if (r.pos <= 0) finish(g, 1);
        });
      });
    }
    if (g.kind === 'react' && r.done === null) {
      var tok = r.token;
      [0, 1].forEach(function (i) {
        var el = document.getElementById('tap' + i); if (!el) return;
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault(); if (r.done !== null) return;
          if (r.phase === 'wait') finish(g, 1 - i, t('duel.early', { name: names(g)[i] }));
          else finish(g, i, t('duel.time', { ms: Math.round(performance.now() - r.t0) }));
        });
      });
      if (r.phase === 'wait') {
        tm = setTimeout(function () {
          if (S.screen !== 'duelPlay' || S.g !== g || r.token !== tok || r.done !== null) return;
          r.phase = 'go'; r.t0 = performance.now();
          [0, 1].forEach(function (i) { var el = document.getElementById('tap' + i); if (el) { el.className = 'tapbtn go'; el.firstChild.nodeValue = t('duel.now'); } });
          TP.beep(880, 0.12, 0.12);
        }, 1500 + rnd() * 3500);
      }
    }
  }
  A.duelagain = function () { var g = S.g; clear(); g.round = newRound(g.kind); TP.render(); };
  A.duelttt = function (i) {
    var g = S.g, r = g.round; i = +i; if (r.done !== null || r.cells[i]) return;
    r.cells[i] = r.turn; TP.beep(r.turn === 1 ? 520 : 420, 0.05, 0.06);
    var L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]], w = 0;
    L.forEach(function (l) { if (r.cells[l[0]] && r.cells[l[0]] === r.cells[l[1]] && r.cells[l[1]] === r.cells[l[2]]) w = r.cells[l[0]]; });
    if (w) return finish(g, w === 1 ? 0 : 1);
    if (r.cells.every(Boolean)) return finish(g, 'draw');
    r.turn = r.turn === 1 ? 2 : 1; TP.render();
  };
  A.duelrps = function (side, ch) {
    var g = S.g, r = g.round; side = +side; if (r.done !== null || r.pick[side] !== null) return;
    r.pick[side] = +ch; TP.beep(450, 0.04, 0.05);
    if (r.pick[0] === null || r.pick[1] === null) { TP.render(); return; }
    var d = (r.pick[0] - r.pick[1] + 3) % 3; /* 0 draw, 1 side0 wins, 2 side1 wins */
    finish(g, d === 0 ? 'draw' : d === 1 ? 0 : 1);
  };
  /* ---- 4 player games: a 2x2 grid, the top row is mirrored ---- */
  var QZONE = ['q0', 'q1', 'q2', 'q3'];
  function qnames() { return [0, 1, 2, 3].map(function (i) { return S.players[i] || t('duel.player', { n: i + 1 }); }); }
  V.quad = function () {
    var list = ['race', 'react'].map(function (k) {
      return '<button class="card c-quad" data-act="quadstart" data-a="' + k + '"><h3>' + T('quad.' + k) + '</h3><p>' + T('quad.' + k + '.d') + '</p></button>';
    }).join('');
    return TP.top(t('g.quad')) + '<p class="hint">' + T('quad.hint') + '</p><div class="grid">' + list + '</div>';
  };
  A.quadstart = function (kind) { TP.go('quadPlay', { kind: kind, score: [0, 0, 0, 0], round: qround(kind) }); };
  function qround(kind) { return kind === 'race' ? { n: [0, 0, 0, 0], done: null } : { phase: 'wait', out: [false, false, false, false], done: null, token: Math.random() }; }
  function zoneHtml(g, i, nm) {
    var r = g.round, win = r.done !== null && r.done !== 'draw' && r.done === i;
    var body;
    if (r.done !== null) body = '<div class="res"><h2>' + (r.done === 'draw' ? T('duel.draw') : win ? T('duel.wins', { name: esc(nm[i]) }) : '&nbsp;') + '</h2></div>';
    else if (g.kind === 'race') body = '<button class="tapbtn" id="z' + i + '">' + T('duel.tap') + '<small>' + esc(nm[i]) + '</small><b id="c' + i + '">' + r.n[i] + '</b></button>';
    else body = '<button class="tapbtn ' + (r.out[i] ? 'out' : r.phase === 'go' ? 'go' : 'wait') + '" id="z' + i + '">' + (r.out[i] ? T('quad.out') : r.phase === 'go' ? T('duel.now') : T('duel.wait')) + '<small>' + esc(nm[i]) + '</small></button>';
    return '<div class="zone q' + i + (i > 1 ? ' flip' : '') + '">' + body + '</div>';
  }
  V.quadPlay = function () {
    var g = S.g, nm = qnames(), over = g.round.done !== null;
    S.after = function () { qhook(g); };
    var score = '<span>' + [2, 3, 0, 1].map(function (i) { return esc(nm[i]) + ' ' + g.score[i]; }).join(' · ') + '</span>';
    var mid = '<button class="back sm" data-act="go" data-a="quad">' + T('back') + '</button>' + score + (over ? '<span class="eb"><button class="btn small" data-act="quadagain">' + T('duel.again') + '</button><button class="btn alt small" data-act="go" data-a="quad">' + T('duel.menu') + '</button></span>' : '');
    return '<div class="dw quad"><div class="row4">' + zoneHtml(g, 2, nm) + zoneHtml(g, 3, nm) + '</div><div class="mid">' + mid + '</div><div class="row4">' + zoneHtml(g, 0, nm) + zoneHtml(g, 1, nm) + '</div></div>';
  };
  function qfinish(g, w) {
    var r = g.round; if (r.done !== null) return;
    r.done = w; if (w !== 'draw') g.score[w]++;
    TP.beep(w === 'draw' ? 300 : 880, 0.18, 0.12);
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ }
    clear(); TP.render();
  }
  function qhook(g) {
    var r = g.round; clear(); if (r.done !== null) return;
    var tok = r.token;
    [0, 1, 2, 3].forEach(function (i) {
      var el = document.getElementById('z' + i); if (!el) return;
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault(); if (r.done !== null) return;
        if (g.kind === 'race') {
          r.n[i]++; var c = document.getElementById('c' + i); if (c) c.textContent = r.n[i]; TP.beep(400 + r.n[i] * 8, 0.02, 0.03);
          if (r.n[i] >= 25) qfinish(g, i);
        } else {
          if (r.out[i]) return;
          if (r.phase === 'go') return qfinish(g, i);
          r.out[i] = true; el.className = 'tapbtn out'; el.firstChild.nodeValue = t('quad.out');
          var left = [0, 1, 2, 3].filter(function (k) { return !r.out[k]; });
          if (left.length === 1) qfinish(g, left[0]); else if (!left.length) qfinish(g, 'draw');
        }
      });
    });
    if (g.kind === 'react' && r.phase === 'wait') {
      tm = setTimeout(function () {
        if (S.screen !== 'quadPlay' || S.g !== g || r.token !== tok || r.done !== null) return;
        r.phase = 'go';
        [0, 1, 2, 3].forEach(function (i) { var el = document.getElementById('z' + i); if (el && !r.out[i]) { el.className = 'tapbtn go'; el.firstChild.nodeValue = t('duel.now'); } });
        TP.beep(880, 0.12, 0.12);
      }, 1500 + rnd() * 3500);
    }
  }
  A.quadagain = function () { var g = S.g; clear(); g.round = qround(g.kind); TP.render(); };
};
