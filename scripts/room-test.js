'use strict';
// Plays every online game with bot players against a real server process.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boombox-rooms-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, BOOMBOX_TEST_FAST: '1' }),
  stdio: ['ignore', 'pipe', 'inherit']
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(url, body) {
  const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) { /* none */ }
  return { status: r.status, body: j };
}

class Bot {
  constructor(name) { this.name = name; this.state = null; this.events = []; this.abort = new AbortController(); }
  async create(lang) { const r = await post('/api/room/create', { name: this.name, lang }); Object.assign(this, r.body); return r; }
  async join(code) { const r = await post('/api/room/join', { name: this.name, code }); Object.assign(this, r.body); return r; }
  act(a, extra) { return post('/api/room/act', Object.assign({ code: this.code, pid: this.pid, token: this.token, a }, extra || {})); }
  async connect() {
    const url = base + '/api/room/stream?code=' + this.code + '&pid=' + this.pid + '&token=' + this.token;
    const res = await fetch(url, { signal: this.abort.signal });
    assert.strictEqual(res.status, 200, 'stream ok');
    const dec = new TextDecoder(); let buf = '';
    (async () => {
      try {
        for await (const chunk of res.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = block.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const m = JSON.parse(line.slice(6));
            if (m.t === 'state') this.state = m; else this.events.push(m);
          }
        }
      } catch (e) { /* aborted */ }
    })();
    await this.until(() => this.state, 3000);
  }
  async until(fn, ms) {
    const end = Date.now() + (ms || 8000);
    for (;;) {
      const v = fn(this); if (v) return v;
      if (Date.now() > end) throw new Error('timeout waiting for state: ' + JSON.stringify(this.state && this.state.game).slice(0, 400));
      await sleep(25);
    }
  }
  get g() { return this.state && this.state.game; }
  stop() { this.abort.abort(); }
}

async function room(n, lang) {
  const host = new Bot('Host'); await host.create(lang || 'en'); await host.connect();
  const bots = [host];
  for (let i = 1; i < n; i++) { const b = new Bot('P' + i); const r = await b.join(host.code); assert.strictEqual(r.status, 200); await b.connect(); bots.push(b); }
  await host.until((h) => h.state.players.length === n);
  return bots;
}
const stopAll = (bots) => bots.forEach((b) => b.stop());

async function testLobbyAndSecurity() {
  const bots = await room(3);
  const [host, a] = bots;
  assert.strictEqual(host.state.host, host.pid);
  let r = await a.act('start', { game: 'impostor', opts: {} }); assert.strictEqual(r.status, 403, 'only the host starts');
  r = await post('/api/room/act', { code: host.code, pid: a.pid, token: 'x'.repeat(32), a: 'leave' }); assert.strictEqual(r.status, 404, 'bad token');
  r = await post('/api/room/join', { code: 'ZZZZ', name: 'X' }); assert.strictEqual(r.status, 404);
  r = await post('/api/room/join', { code: host.code, name: '   ' }); assert.strictEqual(r.status, 400);
  r = await post('/api/room/join', { code: host.code.toLowerCase(), name: '<b>Host</b>' }); assert.strictEqual(r.status, 200, 'code is case-insensitive');
  assert(!/[<>]/.test(r.body.pid), 'ok');
  await host.until((h) => h.state.players.length === 4);
  const names = host.state.players.map((p) => p.name);
  assert(!names.some((x) => /[<>]/.test(x)), 'names are cleaned');
  r = await host.act('start', { game: 'wolf', opts: {} }); assert.strictEqual(r.status, 400, 'wolf needs 5 players');
  stopAll(bots);
  console.log('  lobby ok');
}

async function testHidden(kind) {
  const bots = await room(5);
  const [host] = bots;
  let r = await host.act('start', { game: kind, opts: { n: 1, minutes: 3 } }); assert.strictEqual(r.status, 200);
  await Promise.all(bots.map((b) => b.until((x) => x.g && x.g.type === kind)));
  const imps = bots.filter((b) => b.g.role === 'imp');
  assert.strictEqual(imps.length, 1, 'one impostor');
  imps.forEach((b) => assert(!b.g.secret, 'impostor gets no secret'));
  const crew = bots.filter((b) => b.g.role === 'crew');
  assert.strictEqual(new Set(crew.map((b) => b.g.secret)).size, 1, 'same secret for crew');
  assert(crew[0].g.secret.length > 1);
  await host.act('startVote'); await host.until((h) => h.g.phase === 'vote');
  const target = imps[0].pid;
  for (const b of bots) {
    const t = b.pid === target ? bots.find((x) => x.pid !== target).pid : target;
    r = await b.act('vote', { target: t }); assert.strictEqual(r.status, 200);
  }
  await host.until((h) => h.g.phase === 'result');
  assert.strictEqual(host.g.res.caught, true, 'impostor caught');
  assert.strictEqual(host.g.res.imps[0], target);
  await host.act('again'); await host.until((h) => h.g.phase === 'play' && h.g.round === 2);
  stopAll(bots);
  console.log('  ' + kind + ' ok');
}

async function testWouldRather() {
  const bots = await room(3);
  const [host, a, b] = bots;
  await host.act('start', { game: 'wouldrather' });
  await a.until((x) => x.g && x.g.q);
  assert(a.g.q.length > 10);
  await host.act('vote', { target: a.pid }); await a.act('vote', { target: a.pid });
  await b.act('vote', { target: host.pid });
  await host.until((h) => h.g.phase === 'result');
  assert.strictEqual(host.g.counts[a.pid], 2); assert.strictEqual(host.g.counts[host.pid], 1);
  await host.act('next'); await host.until((h) => h.g.phase === 'ask' && h.g.n === 2);
  stopAll(bots);
  console.log('  wouldrather ok');
}

async function testSpectrum() {
  const bots = await room(3);
  const [host] = bots;
  await host.act('start', { game: 'spectrum', opts: { rounds: 1 } });
  await host.until((h) => h.g && h.g.phase === 'guess');
  const psy = bots.find((b) => b.pid === host.g.psychic);
  await psy.until((x) => x.g && typeof x.g.target === 'number');
  const other = bots.find((b) => b !== psy);
  assert.strictEqual(other.g.target, null, 'target hidden from guessers');
  const target = psy.g.target;
  assert(psy.g.pair.length === 2);
  const guessers = bots.filter((b) => b !== psy);
  await guessers[0].act('guess', { value: target });
  await guessers[1].act('guess', { value: Math.min(100, target + 50) });
  await host.until((h) => h.g.phase === 'result');
  assert.strictEqual(host.g.target, target);
  assert.strictEqual(host.g.gained[guessers[0].pid], 4);
  await host.act('next'); await host.until((h) => h.g.phase === 'guess' && h.g.turn === 2);
  stopAll(bots);
  console.log('  spectrum ok');
}

async function testBoxes() {
  const bots = await room(2);
  const [host, a] = bots;
  await host.act('start', { game: 'boxes', opts: { n: 3 } });
  await host.until((h) => h.g && h.g.phase === 'play');
  const first = bots.find((b) => b.pid === host.g.turn), second = bots.find((b) => b !== first);
  let r = await second.act('edge', { key: 'h:0:0' });
  await sleep(100);
  assert.strictEqual(host.g.board.h[0], -1, 'not your turn');
  await first.act('edge', { key: 'h:0:0' }); await first.until((x) => x.g.turn === second.pid);
  await second.act('edge', { key: 'h:0:0' }); // already drawn: ignored
  await sleep(100); assert.strictEqual(first.g.turn, second.pid);
  // play the whole 3x3 board greedily with whoever is on turn
  const keys = [];
  for (let r2 = 0; r2 <= 3; r2++) for (let c = 0; c < 3; c++) keys.push('h:' + r2 + ':' + c);
  for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c <= 3; c++) keys.push('v:' + r2 + ':' + c);
  for (const k of keys) {
    const cur = bots.find((b) => b.pid === host.g.turn);
    await cur.act('edge', { key: k });
    await sleep(15);
  }
  await host.until((h) => h.g.phase === 'end');
  assert.strictEqual(host.g.board.scores.reduce((x, y) => x + y, 0), 9);
  assert(host.g.winners.length >= 1);
  stopAll(bots);
  void a; void r;
  console.log('  boxes ok');
}

async function testBomb() {
  const bots = await room(3);
  const [host] = bots;
  await host.act('start', { game: 'bomb' });
  await host.until((h) => h.g && h.g.phase === 'ready');
  await host.act('arm');
  await host.until((h) => h.g.phase === 'run');
  // pass the bomb around until it explodes (fast mode: about 1 second)
  const end = Date.now() + 6000;
  while (host.g.phase === 'run' && Date.now() < end) {
    const holder = bots.find((b) => b.pid === host.g.holder);
    if (holder) await holder.act('pass');
    await sleep(60);
  }
  await host.until((h) => h.g.phase === 'boom', 6000);
  assert(host.g.loser, 'someone lost');
  assert.strictEqual(host.g.scores[host.g.loser], 1);
  assert(host.events.some((e) => e.t === 'tick'), 'tick events were sent');
  await host.act('next'); await host.until((h) => h.g.phase === 'ready');
  stopAll(bots);
  console.log('  bomb ok');
}

async function testSketch() {
  const bots = await room(3);
  const [host] = bots;
  await host.act('start', { game: 'sketch', opts: { rounds: 1 } });
  await Promise.all(bots.map((b) => b.until((x) => x.g && x.g.type === 'sketch' && x.g.drawer)));
  let drawer = bots.find((b) => b.pid === host.g.drawer);
  assert(drawer.g.word, 'drawer sees the word');
  bots.filter((b) => b !== drawer).forEach((b) => assert.strictEqual(b.g.word, null, 'guessers do not see the word'));
  assert(/^[_ ]+$|_/.test(host.g.hint) || host.g.drawer === host.pid, 'hint is masked');
  await drawer.act('stroke', { s: { c: '#ff0000', w: 8, p: [[10, 10], [200, 220], [400, 300]] } });
  const other = bots.find((b) => b !== drawer);
  await other.until((o) => o.events.some((e) => e.t === 'stroke'));
  let r = await drawer.act('stroke', { s: { c: 'bad', w: 8, p: [[5000, 1]] } }); assert.strictEqual(r.status, 200);
  const word = drawer.g.word;
  const guessers = bots.filter((b) => b !== drawer);
  await guessers[0].act('guess', { text: 'definitely-wrong' });
  await other.until((o) => o.events.some((e) => e.t === 'chat' && e.text === 'definitely-wrong'));
  await guessers[0].act('guess', { text: word.toUpperCase() });
  await drawer.until((d) => d.g.guessed.indexOf(guessers[0].pid) !== -1);
  assert(drawer.g.scores[guessers[0].pid] >= 100 && drawer.g.scores[drawer.pid] === 60, 'points awarded');
  await guessers[1].act('guess', { text: word });
  await host.until((h) => h.g.phase === 'between');
  assert.strictEqual(host.g.word, word, 'word revealed after the turn');
  await host.until((h) => h.g.turn === 2 && h.g.phase === 'draw', 4000);
  assert.notStrictEqual(host.g.drawer, drawer.pid, 'drawer rotates');
  // late joiner receives the strokes drawn so far
  stopAll(bots);
  console.log('  sketch ok');
}

async function testChain() {
  const bots = await room(3);
  const [host] = bots;
  const r = await host.act('start', { game: 'chain' });
  assert.strictEqual(r.status, 200, 'chain starts');
  await Promise.all(bots.map((b) => b.until((x) => x.g && x.g.type === 'chain' && x.g.step === 1)));
  assert.strictEqual(host.g.kind, 'text');
  for (const [i, b] of bots.entries()) await b.act('text', { text: 'sentence ' + i });
  // step 2: draw what the neighbour wrote
  await Promise.all(bots.map((b) => b.until((x) => x.g.step === 2 && x.g.kind === 'draw' && x.g.prev && x.g.prev.kind === 'text')));
  const seen = bots.map((b) => b.g.prev.text).sort();
  assert.deepStrictEqual(seen, ['sentence 0', 'sentence 1', 'sentence 2'], 'each player gets another player\'s sentence');
  for (const b of bots) { await b.act('stroke', { s: { c: '#ff0000', w: 8, p: [[10, 10], [200, 220]] } }); await b.act('done'); }
  // step 3: describe the drawing
  await Promise.all(bots.map((b) => b.until((x) => x.g.step === 3 && x.g.kind === 'text' && x.g.prev && x.g.prev.kind === 'draw' && x.g.prev.strokes.length === 1)));
  for (const b of bots) await b.act('text', { text: 'a red line' });
  await host.until((h) => h.g.phase === 'reveal', 4000);
  assert.strictEqual(host.g.entries.length, 1, 'reveal starts with the first entry');
  for (let k = 0; k < 9; k++) { await host.act('next'); }
  await host.until((h) => h.g.phase === 'end');
  assert.strictEqual(host.g.entries.length, 3, 'whole last chain shown');
  stopAll(bots);
  console.log('  chain ok');
}

async function testWolf(roleOpts, n) {
  const bots = await room(n);
  const [host] = bots;
  const r = await host.act('start', { game: 'wolf', opts: { on: roleOpts, wolves: 2 } });
  assert.strictEqual(r.status, 200, 'wolf starts: ' + JSON.stringify(r.body));
  await Promise.all(bots.map((b) => b.until((x) => x.g && x.g.type === 'wolf' && x.g.role)));
  const roles = {}; bots.forEach((b) => { roles[b.pid] = b.g.role; });
  assert.strictEqual(Object.values(roles).filter((x) => x === 'werewolf').length, 2);
  bots.filter((b) => b.g.role === 'werewolf').forEach((b) => assert.strictEqual(b.g.pack.length, 2));
  bots.filter((b) => b.g.role !== 'werewolf').forEach((b) => assert(!b.g.pack, 'only wolves see the pack'));
  bots.forEach((b) => assert(!b.g.roles, 'roles stay secret during the game'));
  const wolves = Object.keys(roles).filter((k) => roles[k] === 'werewolf');
  const sawSteps = new Set();

  // greedy bot play until somebody wins
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const g = host.g;
    if (g.phase === 'end') break;
    for (const b of bots) {
      const v = b.g; if (!v || !v.act) continue;
      const k = v.act.kind; sawSteps.add(k);
      if (k === 'cupid') await b.act('pick', { targets: v.act.targets.slice(0, 2) });
      else if (k === 'witch') await b.act('witch', { heal: v.act.canHeal, poison: v.act.canPoison ? v.act.targets.find((t) => roles[t] === 'werewolf') : null });
      else if (k === 'vote') await b.act('vote', { target: wolves.find((w) => v.alive[w] && w !== b.pid) || v.act.targets[0] });
      else await b.act('pick', { target: v.act.targets[0] });
    }
    await sleep(40);
  }
  await host.until((h) => h.g.phase === 'end', 5000);
  assert(host.g.winner, 'there is a winner');
  assert.deepStrictEqual(host.g.roles, roles, 'roles revealed at the end');
  assert(sawSteps.has('wolves'), 'wolves acted');
  stopAll(bots);
  console.log('  wolf ok (' + host.g.winner + ' win, steps: ' + Array.from(sawSteps).join(',') + ')');
}

async function main() {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', (d) => { if (String(d).includes('Boombox listening')) { clearTimeout(t); resolve(); } });
  });
  console.log('room tests');
  await testLobbyAndSecurity();
  await testHidden('impostor');
  await testHidden('spy');
  await testWouldRather();
  await testBomb();
  await testSketch();
  await testChain();
  await testSpectrum();
  await testBoxes();
  await testWolf({ seer: true, witch: true, hunter: true }, 7);
  await testWolf({ cupid: true, guardian: true, girl: true, idiot: true, elder: true }, 9);
  console.log('room tests passed');
}
main().then(() => { child.kill(); process.exit(0); }).catch((e) => { console.error(e); child.kill(); process.exit(1); });
