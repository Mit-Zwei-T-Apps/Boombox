/* Two- and four-player games on one phone. Players sit opposite each other, the top half is mirrored.
   Any seat can be a bot, so the games can also be played alone. */
window.TPDuel = function (TP) {
  'use strict';
  var S = TP.S, V = TP.V, A = TP.A, t = TP.t, T = TP.T, esc = TP.esc;
  var KINDS = ['tug', 'react', 'ttt', 'rps'];
  var tm = null, bots = [];
  /* bot skill per difficulty: tap = ms between taps, react = ms to react, early = chance of a false start */
  var SK = { easy: { tap: 330, react: 650, early: 0.1, smart: 0 }, medium: { tap: 205, react: 400, early: 0.04, smart: 0.55 }, hard: { tap: 130, react: 270, early: 0, smart: 1 } };
  function sk(g) { return SK[g.diff] || SK.medium; }
  function rnd() { try { var u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch (e) { return Math.random(); } }
  function clear() { if (tm) { clearTimeout(tm); tm = null; } bots.forEach(clearTimeout); bots = []; }
  function later(fn, ms) { var x = setTimeout(fn, ms); bots.push(x); return x; }
  function alive(g, screen) { return S.screen === screen && S.g === g; }

  /* ================= two players ================= */
  function names(g) { return [S.players[g.a] || t('duel.p1'), g.bot ? t('duel.bot') : (S.players[g.b] || t('duel.p2'))]; }

  V.duel = function () {
    var g = S.g, n = S.players.length, c = S.cfg;
    if (g.a === undefined) { g.a = 0; g.b = Math.min(1, n - 1); }
    var bot = !!c.duelBot || n < 2;
    function chips(who) {
      return '<div class="chips">' + S.players.map(function (nm, i) {
        var other = who === 'a' ? g.b : g.a;
        return '<button class="chip' + (g[who] === i ? ' on' : '') + '"' + (i === other && !bot ? ' disabled' : '') + ' data-act="duelpick" data-a="' + who + '" data-b="' + i + '">' + esc(nm) + '</button>';
      }).join('') + '</div>';
    }
    var opp = n < 2 ? '' : '<div class="panel"><div class="label">' + T('duel.opp') + '</div><div class="chips"><button class="chip' + (!c.duelBot ? ' on' : '') + '" data-act="duelbot" data-a="0">' + T('duel.human') + '</button><button class="chip' + (c.duelBot ? ' on' : '') + '" data-act="duelbot" data-a="1">' + T('duel.bot') + '</button></div></div>';
    var pickers = '<div class="panel"><div class="label">' + T(bot ? 'duel.you' : 'duel.pickA') + '</div>' + chips('a') + (bot ? '' : '<div class="label" style="margin-top:12px">' + T('duel.pickB') + '</div>' + chips('b')) + '</div>';
    var list = KINDS.map(function (k) {
      return '<button class="card c-duel" data-act="duelstart" data-a="' + k + '"><h3>' + T('duel.' + k) + '</h3><p>' + T('duel.' + k + '.d') + '</p></button>';
    }).join('');
    return TP.top(t('g.duel')) + opp + (bot ? TP.diffChips() : '') + pickers + '<div class="grid">' + list + '</div>';
  };
  A.duelpick = function (who, i) { var g = S.g; g[who] = +i; if (who === 'a' && g.b === g.a) g.b = (g.a + 1) % Math.max(1, S.players.length); TP.render(); };
  A.duelbot = function (v) { S.cfg.duelBot = v === '1'; TP.render(); };
  A.duelstart = function (kind) {
    var g = S.g, bot = !!S.cfg.duelBot || S.players.length < 2;
    var ng = { kind: kind, a: g.a, b: g.b, bot: bot, diff: S.cfg.diff, score: [0, 0], rn: 0 };
    ng.round = newRound(ng);
    TP.go('duelPlay', ng);
  };
  function newRound(g) {
    var kind = g.kind;
    if (kind === 'tug') return { pos: 50, done: null };
    if (kind === 'react') return { phase: 'wait', done: null, token: Math.random() };
    if (kind === 'ttt') return { cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], turn: g.rn % 2 === 0 ? 1 : 2, done: null };
    return { pick: [null, null], done: null };
  }
  function frame(g, mid, body1, body2) {
    var p = g.kind === 'tug' ? Math.max(4, Math.min(96, g.round.pos)) : 50;
    return '<div class="dw"><div class="half h2 flip" style="flex-grow:' + (100 - p) + '">' + body2 + '</div><div class="mid">' + mid + '</div><div class="half h1" style="flex-grow:' + p + '">' + body1 + '</div></div>';
  }
  function scoreLine(g) { var nm = names(g); return '<span>' + esc(nm[1]) + ' ' + g.score[1] + ' : ' + g.score[0] + ' ' + esc(nm[0]) + '</span>'; }
  function endBtns() { return '<button class="btn small" data-act="duelagain">' + T('duel.again') + '</button><button class="btn alt small" data-act="go" data-a="duel">' + T('duel.menu') + '</button>'; }
  function result(g) {
    var r = g.round, nm = names(g);
    if (r.done === null) return '';
    var txt = r.done === 'draw' ? T('duel.draw') : T('duel.wins', { name: esc(nm[r.done]) });
    if (r.note) txt += '<small>' + esc(r.note) + '</small>';
    return '<div class="res"><h2>' + txt + '</h2></div>';
  }

  V.duelPlay = function () {
    var g = S.g, r = g.round, nm = names(g), k = g.kind, over = r.done !== null;
    var mid = '<button class="back sm" data-act="go" data-a="duel">' + T('back') + '</button>' + scoreLine(g) + (over ? '<span class="eb">' + endBtns() + '</span>' : '');
    var b = ['', ''];
    S.after = function () { hook(g); };
    if (k === 'tug') {
      [0, 1].forEach(function (i) { b[i] = over ? result(g) : '<button class="tapbtn' + (i === 1 && g.bot ? ' out' : '') + '" id="tap' + i + '" aria-label="' + esc(nm[i]) + '">' + T('duel.tap') + '<small>' + esc(nm[i]) + '</small></button>'; });
    } else if (k === 'react') {
      [0, 1].forEach(function (i) {
        var cls = r.phase === 'go' ? 'go' : 'wait';
        b[i] = over ? result(g) : '<button class="tapbtn ' + (i === 1 && g.bot ? 'out' : cls) + '" id="tap' + i + '">' + (r.phase === 'go' ? T('duel.now') : T('duel.wait')) + '<small>' + esc(nm[i]) + '</small></button>';
      });
    } else if (k === 'ttt') {
      var botTurn = g.bot && r.turn === 2;
      var cells = r.cells.map(function (c, i) {
        return '<button class="cell" data-act="duelttt" data-a="' + i + '"' + (c || over || botTurn ? ' disabled' : '') + '>' + (c === 1 ? 'X' : c === 2 ? 'O' : '') + '</button>';
      }).join('');
      var st = over ? '' : T('duel.turn', { name: esc(nm[r.turn === 1 ? 0 : 1]) }) + ' (' + (r.turn === 1 ? 'X' : 'O') + ')';
      b[0] = over ? result(g) : '<p class="st">' + (r.turn === 1 ? st : '') + '</p>';
      b[1] = over ? result(g) : '<p class="st">' + (r.turn === 2 ? st : '') + '</p>';
      mid = '<div class="board3">' + cells + '</div>' + mid;
    } else {
      var nmr = ['rock', 'paper', 'scissors'];
      [0, 1].forEach(function (i) {
        if (over) { b[i] = result(g) + '<p class="st">' + esc(nm[0]) + ': ' + T('duel.' + nmr[r.pick[0]]) + ' · ' + esc(nm[1]) + ': ' + T('duel.' + nmr[r.pick[1]]) + '</p>'; return; }
        if (i === 1 && g.bot) { b[i] = '<p class="st">' + esc(nm[1]) + '</p>'; return; }
        if (r.pick[i] !== null) { b[i] = '<p class="st">' + T('duel.locked') + '</p>'; return; }
        b[i] = '<p class="st">' + esc(nm[i]) + '</p><div class="rps">' + ['✊', '✋', '✌️'].map(function (e, j) {
          return '<button data-act="duelrps" data-a="' + i + '" data-b="' + j + '" aria-label="' + T('duel.' + nmr[j]) + '">' + e + '</button>';
        }).join('') + '</div>';
      });
    }
    return frame(g, mid, b[0], b[1]);
  };

  function finish(g, winner, note) {
    var r = g.round; if (r.done !== null) return;
    r.done = winner; r.note = note || '';
    if (winner === 0 || winner === 1) g.score[winner]++;
    TP.beep(winner === 'draw' ? 300 : 880, 0.18, 0.12);
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ }
    clear(); TP.render();
  }
  function tugTap(g, i) {
    var r = g.round; if (r.done !== null) return;
    r.pos += i === 0 ? 4 : -4; TP.beep(500 + Math.abs(50 - r.pos) * 4, 0.03, 0.04);
    var p = Math.max(4, Math.min(96, r.pos)), h1 = document.querySelector('.dw .h1'), h2 = document.querySelector('.dw .h2');
    if (h1) h1.style.flexGrow = p; if (h2) h2.style.flexGrow = 100 - p;
    if (r.pos >= 100) finish(g, 0); else if (r.pos <= 0) finish(g, 1);
  }
  function hook(g) {
    var r = g.round; clear();
    var s = sk(g);
    if (g.kind === 'tug' && r.done === null) {
      [0, 1].forEach(function (i) {
        var el = document.getElementById('tap' + i); if (!el || (i === 1 && g.bot)) return;
        el.addEventListener('pointerdown', function (e) { e.preventDefault(); tugTap(g, i); });
      });
      if (g.bot) {
        var loop = function () {
          if (!alive(g, 'duelPlay') || r.done !== null) return;
          tugTap(g, 1); later(loop, s.tap * (0.7 + rnd() * 0.6));
        };
        later(loop, 900);
      }
    }
    if (g.kind === 'react' && r.done === null) {
      var tok = r.token;
      [0, 1].forEach(function (i) {
        var el = document.getElementById('tap' + i); if (!el || (i === 1 && g.bot)) return;
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault(); if (r.done !== null) return;
          if (r.phase === 'wait') finish(g, 1 - i, t('duel.early', { name: names(g)[i] }));
          else finish(g, i, t('duel.time', { ms: Math.round(performance.now() - r.t0) }));
        });
      });
      if (r.phase === 'wait') {
        var wait = 1500 + rnd() * 3500;
        tm = setTimeout(function () {
          if (!alive(g, 'duelPlay') || r.token !== tok || r.done !== null) return;
          r.phase = 'go'; r.t0 = performance.now();
          [0, 1].forEach(function (i) { var el = document.getElementById('tap' + i); if (el && !(i === 1 && g.bot)) { el.className = 'tapbtn go'; el.firstChild.nodeValue = t('duel.now'); } });
          TP.beep(880, 0.12, 0.12);
          if (g.bot && !r.botEarly) {
            var ms = Math.round(s.react * (0.8 + rnd() * 0.4));
            later(function () { if (alive(g, 'duelPlay') && r.token === tok && r.done === null) finish(g, 1, t('duel.time', { ms: ms })); }, ms);
          }
        }, wait);
        if (g.bot && rnd() < s.early) { r.botEarly = true; later(function () { if (alive(g, 'duelPlay') && r.token === tok && r.done === null && r.phase === 'wait') finish(g, 0, t('duel.early', { name: names(g)[1] })); }, wait * (0.35 + rnd() * 0.5)); }
      }
    }
    if (g.kind === 'ttt' && r.done === null && g.bot && r.turn === 2) {
      later(function () { if (alive(g, 'duelPlay') && r.done === null && r.turn === 2) tttPlay(g, tttBot(r.cells, s.smart)); }, 550);
    }
  }
  A.duelagain = function () { var g = S.g; clear(); g.rn++; g.round = newRound(g); TP.render(); };

  /* ---- tic-tac-toe ---- */
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function winner(c) { var w = 0; LINES.forEach(function (l) { if (c[l[0]] && c[l[0]] === c[l[1]] && c[l[1]] === c[l[2]]) w = c[l[0]]; }); return w; }
  function free(c) { var f = []; c.forEach(function (v, i) { if (!v) f.push(i); }); return f; }
  function minimax(c, turn, me) { /* score for `me`: +1 win, 0 draw, -1 loss; perfect play */
    var w = winner(c); if (w) return w === me ? 1 : -1;
    var f = free(c); if (!f.length) return 0;
    var best = turn === me ? -2 : 2;
    f.forEach(function (i) { c[i] = turn; var v = minimax(c, turn === 1 ? 2 : 1, me); c[i] = 0; best = turn === me ? Math.max(best, v) : Math.min(best, v); });
    return best;
  }
  function tttBot(cells, smart) {
    var f = free(cells), me = 2, c = cells.slice(), i;
    if (rnd() > smart && smart < 1) { /* sometimes just random; medium also wins/blocks at least */
      if (smart > 0) {
        for (i = 0; i < f.length; i++) { c[f[i]] = me; if (winner(c) === me) return f[i]; c[f[i]] = 0; }
        for (i = 0; i < f.length; i++) { c[f[i]] = 1; if (winner(c) === 1) return f[i]; c[f[i]] = 0; }
      }
      return f[Math.floor(rnd() * f.length)];
    }
    var bestV = -2, bestI = [];
    f.forEach(function (j) { c[j] = me; var v = minimax(c, 1, me); c[j] = 0; if (v > bestV) { bestV = v; bestI = [j]; } else if (v === bestV) bestI.push(j); });
    return bestI[Math.floor(rnd() * bestI.length)];
  }
  function tttPlay(g, i) {
    var r = g.round; if (r.done !== null || r.cells[i]) return;
    r.cells[i] = r.turn; TP.beep(r.turn === 1 ? 520 : 420, 0.05, 0.06);
    var w = winner(r.cells);
    if (w) return finish(g, w === 1 ? 0 : 1);
    if (r.cells.every(Boolean)) return finish(g, 'draw');
    r.turn = r.turn === 1 ? 2 : 1; TP.render();
  }
  A.duelttt = function (i) { var g = S.g; if (g.bot && g.round.turn === 2) return; tttPlay(g, +i); };

  /* ---- rock paper scissors ---- */
  function rpsBot(g) {
    var h = g.hist || [], s = sk(g), counter = function (x) { return (x + 1) % 3; }; /* paper(1) beats rock(0) ... */
    if (!h.length || rnd() > s.smart * 0.75) return Math.floor(rnd() * 3);
    var cnt = [0, 0, 0]; h.forEach(function (x) { cnt[x]++; });
    var likely = cnt.indexOf(Math.max.apply(null, cnt));
    if (s.smart > 0.9 && h.length >= 2) likely = h[h.length - 1]; /* hard bot expects a repeat */
    return counter(likely);
  }
  A.duelrps = function (side, ch) {
    var g = S.g, r = g.round; side = +side; if (r.done !== null || r.pick[side] !== null) return;
    if (g.bot && side === 1) return;
    r.pick[side] = +ch; TP.beep(450, 0.04, 0.05);
    if (g.bot) { r.pick[1] = rpsBot(g); (g.hist = g.hist || []).push(r.pick[0]); }
    if (r.pick[0] === null || r.pick[1] === null) { TP.render(); return; }
    var d = (r.pick[0] - r.pick[1] + 3) % 3;
    finish(g, d === 0 ? 'draw' : d === 1 ? 0 : 1);
  };

  /* ================= four players ================= */
  function qnames(g) { var bi = 0; return [0, 1, 2, 3].map(function (i) { return g.bots.indexOf(i) !== -1 ? t('duel.botN', { n: ++bi }) : (S.players[g.human.indexOf(i)] || t('duel.player', { n: i + 1 })); }); }
  V.quad = function () {
    var c = S.cfg, nb = c.quadBots || 0;
    var botChips = '<div class="panel"><div class="label">' + T('quad.bots') + '</div><div class="chips">' + [0, 1, 2, 3].map(function (n) {
      return '<button class="chip' + (nb === n ? ' on' : '') + '" data-act="quadbots" data-a="' + n + '">' + n + '</button>';
    }).join('') + '</div></div>';
    var list = ['race', 'react'].map(function (k) {
      return '<button class="card c-quad" data-act="quadstart" data-a="' + k + '"><h3>' + T('quad.' + k) + '</h3><p>' + T('quad.' + k + '.d') + '</p></button>';
    }).join('');
    return TP.top(t('g.quad')) + '<p class="hint">' + T('quad.hint') + '</p>' + botChips + (nb ? TP.diffChips() : '') + '<div class="grid">' + list + '</div>';
  };
  A.quadbots = function (n) { S.cfg.quadBots = +n; TP.render(); };
  A.quadstart = function (kind) {
    var nb = S.cfg.quadBots || 0, bz = [3, 2, 1].slice(0, nb), hz = [0, 1, 2, 3].filter(function (i) { return bz.indexOf(i) === -1; });
    var g = { kind: kind, score: [0, 0, 0, 0], bots: bz, human: hz, diff: S.cfg.diff };
    g.round = qround(g); TP.go('quadPlay', g);
  };
  function qround(g) { return g.kind === 'race' ? { n: [0, 0, 0, 0], done: null } : { phase: 'wait', out: [false, false, false, false], done: null, token: Math.random() }; }
  function isBot(g, i) { return g.bots.indexOf(i) !== -1; }
  function zoneHtml(g, i, nm) {
    var r = g.round, win = r.done !== null && r.done !== 'draw' && r.done === i, body;
    if (r.done !== null) body = '<div class="res"><h2>' + (r.done === 'draw' ? T('duel.draw') : win ? T('duel.wins', { name: esc(nm[i]) }) : '&nbsp;') + '</h2></div>';
    else if (g.kind === 'race') body = '<button class="tapbtn' + (isBot(g, i) ? ' out' : '') + '" id="z' + i + '">' + T('duel.tap') + '<small>' + esc(nm[i]) + '</small><b id="c' + i + '">' + r.n[i] + '</b></button>';
    else body = '<button class="tapbtn ' + (r.out[i] ? 'out' : isBot(g, i) ? 'wait' : r.phase === 'go' ? 'go' : 'wait') + '" id="z' + i + '">' + (r.out[i] ? T('quad.out') : r.phase === 'go' ? T('duel.now') : T('duel.wait')) + '<small>' + esc(nm[i]) + '</small></button>';
    return '<div class="zone q' + i + (i > 1 ? ' flip' : '') + '">' + body + '</div>';
  }
  V.quadPlay = function () {
    var g = S.g, nm = qnames(g), over = g.round.done !== null;
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
  function qOut(g, i) {
    var r = g.round, el = document.getElementById('z' + i);
    r.out[i] = true; if (el) { el.className = 'tapbtn out'; el.firstChild.nodeValue = t('quad.out'); }
    var left = [0, 1, 2, 3].filter(function (k) { return !r.out[k]; });
    if (left.length === 1) qfinish(g, left[0]); else if (!left.length) qfinish(g, 'draw');
  }
  function qhook(g) {
    var r = g.round; clear(); if (r.done !== null) return;
    var tok = r.token, s = sk(g);
    function raceTap(i) {
      r.n[i]++; var c = document.getElementById('c' + i); if (c) c.textContent = r.n[i]; TP.beep(400 + r.n[i] * 8, 0.02, 0.03);
      if (r.n[i] >= 25) qfinish(g, i);
    }
    [0, 1, 2, 3].forEach(function (i) {
      var el = document.getElementById('z' + i); if (!el || isBot(g, i)) return;
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault(); if (r.done !== null) return;
        if (g.kind === 'race') raceTap(i);
        else { if (r.out[i]) return; if (r.phase === 'go') return qfinish(g, i); qOut(g, i); }
      });
      void tok;
    });
    if (g.kind === 'race') {
      g.bots.forEach(function (i, k) {
        var loop = function () { if (!alive(g, 'quadPlay') || r.done !== null) return; raceTap(i); later(loop, s.tap * (1.15 + k * 0.1) * (0.7 + rnd() * 0.6)); };
        later(loop, 900 + k * 120);
      });
    } else if (r.phase === 'wait') {
      var wait = 1500 + rnd() * 3500;
      tm = setTimeout(function () {
        if (!alive(g, 'quadPlay') || r.token !== tok || r.done !== null) return;
        r.phase = 'go';
        [0, 1, 2, 3].forEach(function (i) { var el = document.getElementById('z' + i); if (el && !r.out[i] && !isBot(g, i)) { el.className = 'tapbtn go'; el.firstChild.nodeValue = t('duel.now'); } });
        TP.beep(880, 0.12, 0.12);
        g.bots.forEach(function (i) {
          if (r.botEarly && r.botEarly[i]) return;
          var ms = Math.round(s.react * (0.8 + rnd() * 0.5));
          later(function () { if (alive(g, 'quadPlay') && r.token === tok && r.done === null && !r.out[i]) qfinish(g, i); }, ms);
        });
      }, wait);
      g.bots.forEach(function (i) {
        if (rnd() < s.early) {
          (r.botEarly = r.botEarly || {})[i] = true;
          later(function () { if (alive(g, 'quadPlay') && r.token === tok && r.done === null && r.phase === 'wait') qOut(g, i); }, wait * (0.35 + rnd() * 0.5));
        }
      });
    }
  }
  A.quadagain = function () { var g = S.g; clear(); g.round = qround(g); TP.render(); };
};
