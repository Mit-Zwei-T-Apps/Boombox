'use strict';
/*
 * Boombox server. Zero dependencies, Node.js 18+.
 * Serves the static game in ./public and a small JSON API for optional accounts.
 * Guests never need the API: every game works without logging in.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pkg = require('./package.json');
const createRooms = require('./lib/rooms');

const env = process.env;
const flag = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const PORT = Number(env.SERVER_PORT || env.PORT) || 3000;
const HOST = env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const ALLOW_REGISTER = flag(env.ALLOW_REGISTER, true);
const COOKIE_SECURE = flag(env.COOKIE_SECURE, false);
const TRUST_PROXY = flag(env.TRUST_PROXY, false);
const MAX_USERS = Math.max(1, parseInt(env.MAX_USERS, 10) || 1000);
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
const ADMIN_USER = USERNAME_RE.test(env.ADMIN_USER || '') ? env.ADMIN_USER : 'admin';
const GAMES = ['impostor', 'spy', 'werewolf', 'wouldrather', 'bomb', 'never', 'truth', 'whoami', 'sketch', 'boxes', 'spectrum', 'duel', 'hangman', 'chess', 'solo'];
const SESSION_DAYS = 30;

fs.mkdirSync(DATA_DIR, { recursive: true });
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const CUSTOM_FILE = path.join(DATA_DIR, 'custom.json');
const CUSTOM_KEYS = ['words', 'questions', 'never', 'truth', 'dare', 'bomb'];
let custom = {};
try { custom = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8')); } catch (e) { custom = {}; }
require('./lib/data').setCustom(custom);
function cleanCustom(inp) {
  const out = {};
  CUSTOM_KEYS.forEach((k) => {
    const src = inp && Array.isArray(inp[k]) ? inp[k] : [];
    const seen = new Set();
    out[k] = [];
    src.forEach((x) => {
      const v = String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, 140);
      if (v && !seen.has(v.toLowerCase()) && out[k].length < 500) { seen.add(v.toLowerCase()); out[k].push(v); }
    });
  });
  return out;
}
const ADMIN_PW_FILE = path.join(DATA_DIR, 'admin-initial-password.txt');

/* ---------- storage ---------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
const users = readJson(USERS_FILE, {});     // lowercase name -> user
let sessions = readJson(SESSIONS_FILE, {}); // sha256(token) -> { u, exp }
const saveUsers = () => writeJson(USERS_FILE, users);
const saveSessions = () => writeJson(SESSIONS_FILE, sessions);

/* ---------- passwords ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve('s1$' + salt.toString('hex') + '$' + key.toString('hex'));
    });
  });
}
function verifyPassword(pw, stored) {
  return new Promise((resolve) => {
    const parts = String(stored).split('$');
    if (parts.length !== 3 || parts[0] !== 's1') return resolve(false);
    const salt = Buffer.from(parts[1], 'hex');
    const want = Buffer.from(parts[2], 'hex');
    crypto.scrypt(pw, salt, want.length, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) return resolve(false);
      resolve(key.length === want.length && crypto.timingSafeEqual(key, want));
    });
  });
}
let DUMMY_HASH = null;
hashPassword('dummy-password').then((h) => { DUMMY_HASH = h; });

/* ---------- admin bootstrap ---------- */
async function ensureAdmin() {
  const key = ADMIN_USER.toLowerCase();
  if (users[key]) return;
  let pw = env.ADMIN_PASSWORD;
  let random = false;
  if (!pw || pw.length < 8 || pw.length > 128) { pw = crypto.randomBytes(12).toString('base64url'); random = true; }
  users[key] = {
    name: ADMIN_USER, hash: await hashPassword(pw), admin: true, mustChange: true,
    created: Date.now(), profile: { players: [], lang: '', stats: {} }
  };
  saveUsers();
  if (random) {
    fs.writeFileSync(ADMIN_PW_FILE, pw + '\n', { mode: 0o600 });
    console.log('Created admin account "' + ADMIN_USER + '". The initial password is in ' + ADMIN_PW_FILE);
  } else {
    console.log('Created admin account "' + ADMIN_USER + '" with the password from ADMIN_PASSWORD. It must be changed at first login.');
  }
}

/* ---------- sessions ---------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function newSession(userKey) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[sha(token)] = { u: userKey, exp: Date.now() + SESSION_DAYS * 864e5 };
  saveSessions();
  return token;
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
function getAuth(req) {
  const token = parseCookies(req).boombox_sid;
  if (!token) return null;
  const s = sessions[sha(token)];
  if (!s || s.exp < Date.now() || !users[s.u]) return null;
  return { token, key: s.u, user: users[s.u] };
}
function cookie(token, maxAge) {
  return 'boombox_sid=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge + (COOKIE_SECURE ? '; Secure' : '');
}
function dropSessionsOf(userKey, exceptHash) {
  Object.keys(sessions).forEach((h) => { if (sessions[h].u === userKey && h !== exceptHash) delete sessions[h]; });
  saveSessions();
}
setInterval(() => {
  const now = Date.now();
  let changed = false;
  Object.keys(sessions).forEach((h) => { if (sessions[h].exp < now) { delete sessions[h]; changed = true; } });
  if (changed) saveSessions();
}, 3600e3).unref();

/* ---------- rate limit ---------- */
const hits = new Map();
function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}
function limited(req) {
  const ip = clientIp(req), now = Date.now();
  let h = hits.get(ip);
  if (!h || h.reset < now) { h = { n: 0, reset: now + 10 * 60e3 }; hits.set(ip, h); }
  h.n++;
  return h.n > 15;
}
setInterval(() => { const now = Date.now(); hits.forEach((h, k) => { if (h.reset < now) hits.delete(k); }); }, 600e3).unref();

/* ---------- http helpers ---------- */
function baseHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}
function sendJson(res, status, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }, extra || {}));
  res.end(body);
}
function fail(status, code) { const e = new Error(code); e.status = status; e.code = code; return e; }
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return reject(fail(415, 'bad_request'));
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > (max || 16 * 1024)) { reject(fail(413, 'bad_request')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { const o = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); resolve(o && typeof o === 'object' ? o : {}); }
      catch (e) { reject(fail(400, 'bad_request')); }
    });
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin).host;
    const hosts = [req.headers.host];
    if (TRUST_PROXY && req.headers['x-forwarded-host']) hosts.push(String(req.headers['x-forwarded-host']).split(',')[0].trim());
    return hosts.indexOf(o) !== -1;
  } catch (e) { return false; }
}
const publicUser = (u) => ({ name: u.name, admin: !!u.admin, mustChange: !!u.mustChange, profile: u.profile });

/* ---------- validation ---------- */
function cleanPlayers(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const n = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 18);
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
    if (out.length >= 20) break;
  }
  return out;
}
const validPw = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128;

/* ---------- api ---------- */
let rooms = null; // created after the helpers below exist
async function api(req, res, url) {
  if (rooms && (await rooms.handle(req, res, url))) return;
  const route = url.pathname.replace(/\/+$/, '');
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) throw fail(403, 'forbidden');

  if (route === '/api/config' && method === 'GET') {
    return sendJson(res, 200, { name: 'Boombox', version: pkg.version, accounts: true, allowRegister: ALLOW_REGISTER, online: true });
  }
  const auth = getAuth(req);

  if (route === '/api/custom' && method === 'GET') return sendJson(res, 200, cleanCustom(custom));
  if (route === '/api/me' && method === 'GET') {
    return sendJson(res, 200, { user: auth ? publicUser(auth.user) : null });
  }
  if (route === '/api/register' && method === 'POST') {
    if (!ALLOW_REGISTER) throw fail(403, 'registration_closed');
    if (limited(req)) throw fail(429, 'too_many_attempts');
    const b = await readBody(req);
    if (!USERNAME_RE.test(b.username || '')) throw fail(400, 'bad_username');
    if (!validPw(b.password)) throw fail(400, 'bad_password');
    const key = b.username.toLowerCase();
    if (users[key]) throw fail(409, 'username_taken');
    if (Object.keys(users).length >= MAX_USERS) throw fail(403, 'user_limit');
    users[key] = {
      name: b.username, hash: await hashPassword(b.password), admin: false, mustChange: false,
      created: Date.now(), profile: { players: [], lang: '', stats: {} }
    };
    saveUsers();
    const token = newSession(key);
    return sendJson(res, 200, { user: publicUser(users[key]) }, { 'Set-Cookie': cookie(token, SESSION_DAYS * 86400) });
  }
  if (route === '/api/login' && method === 'POST') {
    if (limited(req)) throw fail(429, 'too_many_attempts');
    const b = await readBody(req);
    const key = String(b.username || '').toLowerCase();
    const u = users[key];
    const ok = await verifyPassword(String(b.password || ''), u ? u.hash : (DUMMY_HASH || 'x'));
    if (!u || !ok) throw fail(401, 'invalid_credentials');
    const token = newSession(key);
    return sendJson(res, 200, { user: publicUser(u) }, { 'Set-Cookie': cookie(token, SESSION_DAYS * 86400) });
  }
  if (route === '/api/logout' && method === 'POST') {
    if (auth) { delete sessions[sha(auth.token)]; saveSessions(); }
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
  }

  if (!auth) throw fail(401, 'not_logged_in');
  const u = auth.user;

  if (route === '/api/password' && method === 'POST') {
    const b = await readBody(req);
    if (!(await verifyPassword(String(b.current || ''), u.hash))) throw fail(403, 'wrong_password');
    if (!validPw(b.next)) throw fail(400, 'bad_password');
    u.hash = await hashPassword(b.next);
    u.mustChange = false;
    saveUsers();
    dropSessionsOf(auth.key, sha(auth.token));
    if (u.admin && fs.existsSync(ADMIN_PW_FILE)) { try { fs.unlinkSync(ADMIN_PW_FILE); } catch (e) { /* ignore */ } }
    return sendJson(res, 200, { user: publicUser(u) });
  }
  if (u.mustChange) throw fail(403, 'must_change_password');

  if (route === '/api/profile' && method === 'PUT') {
    const b = await readBody(req);
    if (b.players !== undefined) u.profile.players = cleanPlayers(b.players);
    if (b.lang !== undefined) u.profile.lang = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(b.lang) ? b.lang : '';
    saveUsers();
    return sendJson(res, 200, { user: publicUser(u) });
  }
  if (route === '/api/stats' && method === 'POST') {
    const b = await readBody(req);
    if (GAMES.indexOf(b.game) === -1) throw fail(400, 'bad_request');
    u.profile.stats[b.game] = (u.profile.stats[b.game] || 0) + 1;
    saveUsers();
    return sendJson(res, 200, { user: publicUser(u) });
  }
  if (route === '/api/me' && method === 'DELETE') {
    const b = await readBody(req);
    if (u.admin) throw fail(403, 'forbidden');
    if (!(await verifyPassword(String(b.password || ''), u.hash))) throw fail(403, 'wrong_password');
    delete users[auth.key]; saveUsers(); dropSessionsOf(auth.key);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
  }

  if (route.indexOf('/api/admin/') === 0) {
    if (!u.admin) throw fail(403, 'forbidden');
    if (route === '/api/admin/users' && method === 'GET') {
      const list = Object.keys(users).map((k) => ({ name: users[k].name, admin: !!users[k].admin, created: users[k].created }));
      return sendJson(res, 200, { users: list, max: MAX_USERS });
    }
    if (route === '/api/admin/custom' && method === 'PUT') {
      if (!sameOrigin(req)) throw fail(403, 'forbidden');
      const b = await readBody(req, 512 * 1024);
      custom = cleanCustom(b);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      writeJson(CUSTOM_FILE, custom);
      require('./lib/data').setCustom(custom);
      return sendJson(res, 200, custom);
    }
    const m = route.match(/^\/api\/admin\/users\/([A-Za-z0-9_.-]{3,24})(\/reset)?$/);
    if (m) {
      const key = m[1].toLowerCase(), target = users[key];
      if (!target) throw fail(404, 'not_found');
      if (m[2] && method === 'POST') {
        const temp = crypto.randomBytes(9).toString('base64url');
        target.hash = await hashPassword(temp); target.mustChange = true; saveUsers(); dropSessionsOf(key);
        return sendJson(res, 200, { name: target.name, tempPassword: temp });
      }
      if (!m[2] && method === 'DELETE') {
        if (key === auth.key) throw fail(403, 'forbidden');
        delete users[key]; saveUsers(); dropSessionsOf(key);
        return sendJson(res, 200, { ok: true });
      }
    }
  }
  throw fail(404, 'not_found');
}

/* ---------- static files ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'bad_request' });
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return sendJson(res, 400, { error: 'bad_request' }); }
  if (rel.indexOf('\0') !== -1) return sendJson(res, 400, { error: 'bad_request' });
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && file.indexOf(PUBLIC_DIR + path.sep) !== 0) return sendJson(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: 'not_found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

rooms = createRooms({
  sendJson, readBody, sameOrigin, clientIp, maxRooms: Math.max(1, parseInt(env.MAX_ROOMS, 10) || 200)
});

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  try {
    baseHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (url.pathname.indexOf('/api/') === 0) return await api(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    if (e && e.status) return sendJson(res, e.status, { error: e.code || 'generic' });
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'generic' });
  }
});

ensureAdmin().then(() => {
  server.listen(PORT, HOST, () => {
    console.log('Boombox listening on http://' + HOST + ':' + PORT + ' (v' + pkg.version + ', registration ' + (ALLOW_REGISTER ? 'open' : 'closed') + ')');
  });
}).catch((e) => { console.error(e); process.exit(1); });

function shutdown() { try { rooms.close(); } catch (e) { /* ignore */ } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
