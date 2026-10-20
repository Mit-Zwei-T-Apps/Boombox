'use strict';
// Starts the server on a free port with a temp data dir and checks the main flows.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boombox-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, MAX_USERS: '5' }),
  stdio: ['ignore', 'pipe', 'inherit']
});

let jar = '';
async function call(method, url, body, opts) {
  const r = await fetch(base + url, {
    method,
    headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, jar ? { Cookie: jar } : {}, (opts && opts.headers) || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.get('set-cookie');
  if (sc) jar = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
  let j = {}; try { j = await r.json(); } catch (e) { /* not json */ }
  return { status: r.status, body: j, headers: r.headers };
}

async function run() {
  const adminPw = fs.readFileSync(path.join(dir, 'admin-initial-password.txt'), 'utf8').trim();
  assert(adminPw.length >= 12, 'admin password written');

  let r = await fetch(base + '/');
  assert.strictEqual(r.status, 200); assert((await r.text()).includes('<html'), 'index served');
  r = await fetch(base + '/locales/index.json'); assert.strictEqual(r.status, 200);
  r = await fetch(base + '/..%2fserver.js'); assert.notStrictEqual(r.status, 200, 'no traversal');
  r = await fetch(base + '/%2e%2e/server.js'); assert.notStrictEqual(r.status, 200, 'no traversal 2');

  r = await call('GET', '/api/config'); assert.strictEqual(r.body.allowRegister, true);
  r = await call('GET', '/api/me'); assert.strictEqual(r.body.user, null);

  // admin must change password first
  r = await call('POST', '/api/login', { username: 'admin', password: adminPw });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.mustChange, true);
  r = await call('PUT', '/api/profile', { players: ['A'] }); assert.strictEqual(r.body.error, 'must_change_password');
  r = await call('POST', '/api/password', { current: adminPw, next: 'a-new-password-1' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.mustChange, false);
  assert(!fs.existsSync(path.join(dir, 'admin-initial-password.txt')), 'initial password file removed');

  // csrf
  r = await call('POST', '/api/logout', {}, { headers: { Origin: 'https://evil.example' } });
  assert.strictEqual(r.status, 403);

  // registration + profile
  const guest = jar; jar = '';
  r = await call('POST', '/api/register', { username: 'ab', password: 'longenough1' }); assert.strictEqual(r.body.error, 'bad_username');
  r = await call('POST', '/api/register', { username: 'Matteo', password: 'short' }); assert.strictEqual(r.body.error, 'bad_password');
  r = await call('POST', '/api/register', { username: 'Matteo', password: 'longenough1' }); assert.strictEqual(r.status, 200);
  r = await call('PUT', '/api/profile', { players: ['Alex', 'alex', ' Sam ', '<b>x</b>'], lang: 'de' });
  assert.deepStrictEqual(r.body.user.profile.players, ['Alex', 'Sam', 'bx/b']); assert.strictEqual(r.body.user.profile.lang, 'de');
  r = await call('POST', '/api/stats', { game: 'bomb' }); assert.strictEqual(r.body.user.profile.stats.bomb, 1);
  r = await call('POST', '/api/stats', { game: 'nope' }); assert.strictEqual(r.status, 400);
  r = await call('GET', '/api/admin/users'); assert.strictEqual(r.status, 403);

  // wrong login + duplicate
  const mine = jar; jar = '';
  r = await call('POST', '/api/login', { username: 'matteo', password: 'wrong-password' }); assert.strictEqual(r.status, 401);
  r = await call('POST', '/api/register', { username: 'MATTEO', password: 'longenough1' }); assert.strictEqual(r.body.error, 'username_taken');

  // admin tools
  jar = guest; // old admin session was dropped on password change, so log in again
  r = await call('POST', '/api/login', { username: 'admin', password: 'a-new-password-1' }); assert.strictEqual(r.status, 200);
  r = await call('GET', '/api/admin/users'); assert.strictEqual(r.body.users.length, 2);
  r = await call('PUT', '/api/admin/custom', { words: ['Zebra  ', 'zebra', ''], bomb: ['Name a river'], truth: 'x' });
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.words, ['Zebra']); assert.deepStrictEqual(r.body.truth, []);
  r = await call('GET', '/api/custom'); assert.deepStrictEqual(r.body.bomb, ['Name a river']);
  const saveJar = jar; jar = '';
  r = await call('PUT', '/api/admin/custom', { words: ['x'] }); assert.strictEqual(r.status, 401, 'custom needs login');
  jar = saveJar;
  r = await call('POST', '/api/admin/users/Matteo/reset'); assert(r.body.tempPassword.length >= 8);
  const temp = r.body.tempPassword;
  jar = ''; r = await call('POST', '/api/login', { username: 'Matteo', password: temp });
  assert.strictEqual(r.body.user.mustChange, true);
  r = await call('POST', '/api/logout', {}); assert.strictEqual(r.status, 200);
  r = await call('GET', '/api/me'); assert.strictEqual(r.body.user, null);
  void mine;

  // restart persistence is covered by reading users.json
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
  assert(stored.admin && stored.matteo, 'users persisted');
  assert(!JSON.stringify(stored).includes('longenough1'), 'no plain passwords on disk');
  console.log('smoke test passed');
}

function waitReady() {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', (d) => { process.stdout.write(d); if (String(d).includes('Boombox listening')) { clearTimeout(t); resolve(); } });
  });
}
waitReady().then(run).then(() => { child.kill(); process.exit(0); })
  .catch((e) => { console.error(e); child.kill(); process.exit(1); });
