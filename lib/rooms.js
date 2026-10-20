'use strict';
/*
 * Online rooms. Players join with a short code and use their own phone.
 * Transport: Server-Sent Events from server to client (works behind Nginx and Cloudflare without
 * WebSocket setup) and plain JSON POSTs from client to server.
 * The server owns the game state, so secret roles only ever reach the phone they belong to.
 */
const crypto = require('crypto');
const data = require('./data');
const GAMES = require('./games');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS = 20;

module.exports = function createRooms(h) {
  const MAX_ROOMS = h.maxRooms || 200;
  const rooms = new Map();
  const hits = { create: new Map(), join: new Map() };

  function limit(kind, req, max) {
    const ip = h.clientIp(req), now = Date.now(), m = hits[kind];
    let e = m.get(ip);
    if (!e || e.reset < now) { e = { n: 0, reset: now + 600e3 }; m.set(ip, e); }
    e.n++;
    return e.n > max;
  }
  setInterval(() => {
    const now = Date.now();
    Object.keys(hits).forEach((k) => hits[k].forEach((e, ip) => { if (e.reset < now) hits[k].delete(ip); }));
  }, 600e3).unref();

  const err = (status, code) => { const e = new Error(code); e.status = status; e.code = code; return e; };
  const id = () => crypto.randomBytes(4).toString('hex');
  function newCode() {
    for (let i = 0; i < 50; i++) {
      let c = '';
      for (let j = 0; j < 4; j++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
    throw err(503, 'rooms_limit');
  }
  function cleanName(n) {
    n = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    return n;
  }

  /* ---------- room object ---------- */
  function makeRoom(code, lang) {
    const room = {
      code, lang, hostId: null, players: [], game: null, created: Date.now(), activity: Date.now(),
      timers: new Set(),
      connectedIds() { return this.players.filter((p) => p.res).map((p) => p.id); },
      player(pid) { return this.players.find((p) => p.id === pid); },
      name(pid) { const p = this.player(pid); return p ? p.name : ''; },
      later(fn, ms) {
        const t = setTimeout(() => { this.timers.delete(t); try { fn(); } catch (e) { console.error(e); } }, ms);
        this.timers.add(t); return t;
      },
      clearTimers() { this.timers.forEach(clearTimeout); this.timers.clear(); },
      send(pid, obj) { const p = this.player(pid); if (p && p.res) write(p.res, obj); },
      sendAll(obj) { this.players.forEach((p) => { if (p.res) write(p.res, obj); }); },
      sendOthers(pid, obj) { this.players.forEach((p) => { if (p.res && p.id !== pid) write(p.res, obj); }); },
      broadcast() {
        this.activity = Date.now();
        this.players.forEach((p) => { if (p.res) write(p.res, stateFor(this, p)); });
      },
      endGame() { this.clearTimers(); this.game = null; this.broadcast(); }
    };
    return room;
  }
  function write(res, obj) { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) { /* closed */ } }
  function stateFor(room, p) {
    return {
      t: 'state', now: Date.now(), code: room.code, me: p.id, host: room.hostId, lang: room.lang,
      players: room.players.map((q) => ({ id: q.id, name: q.name, on: !!q.res })),
      gameType: room.game ? room.game.type : null,
      game: room.game ? GAMES[room.game.type].mod.view(room, room.game, p.id) : null
    };
  }
  function addPlayer(room, name) {
    let n = name, i = 2;
    while (room.players.some((p) => p.name.toLowerCase() === n.toLowerCase())) { n = name.slice(0, 14) + ' ' + i; i++; }
    const p = { id: id(), name: n, token: crypto.randomBytes(16).toString('hex'), res: null, seen: Date.now() };
    room.players.push(p);
    if (!room.hostId) room.hostId = p.id;
    return p;
  }
  function removePlayer(room, pid) {
    const p = room.player(pid); if (!p) return;
    if (p.res) { write(p.res, { t: 'closed', why: 'left' }); try { p.res.end(); } catch (e) { /* ignore */ } p.res = null; }
    room.players = room.players.filter((q) => q.id !== pid);
    if (!room.players.length) { closeRoom(room); return; }
    if (room.hostId === pid) {
      const next = room.players.find((q) => q.res) || room.players[0];
      room.hostId = next.id;
    }
    afterRosterChange(room);
  }
  function afterRosterChange(room) {
    if (room.game) {
      const g = GAMES[room.game.type];
      if (room.players.length < g.min) { room.endGame(); return; }
      if (g.mod.onChange) g.mod.onChange(room, room.game);
    }
    room.broadcast();
  }
  function closeRoom(room) {
    room.clearTimers();
    room.players.forEach((p) => { if (p.res) { write(p.res, { t: 'closed', why: 'room' }); try { p.res.end(); } catch (e) { /* ignore */ } p.res = null; } });
    rooms.delete(room.code);
  }

  setInterval(() => {
    const now = Date.now();
    rooms.forEach((room) => {
      const anyOn = room.players.some((p) => p.res);
      if ((!anyOn && now - room.activity > 10 * 60e3) || now - room.activity > 6 * 3600e3) { closeRoom(room); return; }
      // drop players who have been offline for a while, unless a game is running
      if (!room.game) {
        const gone = room.players.filter((p) => !p.res && now - p.seen > 5 * 60e3);
        gone.forEach((p) => removePlayer(room, p.id));
      }
    });
  }, 30e3).unref();
  setInterval(() => { rooms.forEach((room) => room.players.forEach((p) => { if (p.res) { try { p.res.write(': hb\n\n'); } catch (e) { /* ignore */ } } })); }, 20e3).unref();

  /* ---------- http ---------- */
  function auth(code, pid, token) {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) throw err(404, 'room_not_found');
    const p = room.player(String(pid || ''));
    if (!p || typeof token !== 'string' || token.length !== p.token.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(p.token))) throw err(404, 'room_not_found');
    return { room, p };
  }

  function stream(req, res, url) {
    const { room, p } = auth(url.searchParams.get('code'), url.searchParams.get('pid'), url.searchParams.get('token'));
    if (p.res) { try { p.res.end(); } catch (e) { /* ignore */ } }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    p.res = res; p.seen = Date.now();
    req.on('close', () => {
      if (p.res === res) {
        p.res = null; p.seen = Date.now();
        if (room.hostId === p.id) {
          const next = room.players.find((q) => q.res);
          if (next) room.hostId = next.id;
        }
        if (room.players.some((q) => q.res)) afterRosterChange(room);
      }
    });
    write(res, stateFor(room, p));
    if (room.game && GAMES[room.game.type].mod.onConnect) GAMES[room.game.type].mod.onConnect(room, room.game, p.id);
    afterRosterChange(room);
  }

  async function handle(req, res, url) {
    const route = url.pathname.replace(/\/+$/, '');
    if (route.indexOf('/api/room/') !== 0) return false;
    if (route === '/api/room/stream' && req.method === 'GET') { stream(req, res, url); return true; }
    if (req.method !== 'POST') throw err(405, 'bad_request');
    if (!h.sameOrigin(req)) throw err(403, 'forbidden');
    const b = await h.readBody(req);

    if (route === '/api/room/create') {
      if (limit('create', req, 20)) throw err(429, 'too_many_attempts');
      if (rooms.size >= MAX_ROOMS) throw err(503, 'rooms_limit');
      const name = cleanName(b.name); if (!name) throw err(400, 'bad_name');
      const room = makeRoom(newCode(), data.isLang(b.lang) ? b.lang : 'en');
      rooms.set(room.code, room);
      const p = addPlayer(room, name);
      h.sendJson(res, 200, { code: room.code, pid: p.id, token: p.token });
      return true;
    }
    if (route === '/api/room/join') {
      if (limit('join', req, 40)) throw err(429, 'too_many_attempts');
      const room = rooms.get(String(b.code || '').toUpperCase().trim());
      if (!room) throw err(404, 'room_not_found');
      const name = cleanName(b.name); if (!name) throw err(400, 'bad_name');
      if (room.players.length >= MAX_PLAYERS) throw err(403, 'room_full');
      const p = addPlayer(room, name);
      room.broadcast();
      h.sendJson(res, 200, { code: room.code, pid: p.id, token: p.token });
      return true;
    }

    const { room, p } = auth(b.code, b.pid, b.token);
    const a = String(b.a || '');
    if (a === 'leave') { removePlayer(room, p.id); h.sendJson(res, 200, { ok: true }); return true; }
    if (a === 'start') {
      if (room.hostId !== p.id) throw err(403, 'not_host');
      if (room.game) throw err(409, 'game_running');
      const def = Object.prototype.hasOwnProperty.call(GAMES, b.game) ? GAMES[b.game] : null;
      if (!def) throw err(400, 'bad_request');
      const n = room.connectedIds().length;
      if (n < def.min || n > MAX_PLAYERS) throw err(400, 'too_few');
      def.mod.start(room, b.opts && typeof b.opts === 'object' ? b.opts : {}, b.game);
      room.broadcast();
      h.sendJson(res, 200, { ok: true }); return true;
    }
    if (a === 'lobby') {
      if (room.hostId !== p.id) throw err(403, 'not_host');
      room.endGame(); h.sendJson(res, 200, { ok: true }); return true;
    }
    if (a === 'kick') {
      if (room.hostId !== p.id) throw err(403, 'not_host');
      const target = room.player(String(b.target || ''));
      if (target && target.id !== p.id) removePlayer(room, target.id);
      h.sendJson(res, 200, { ok: true }); return true;
    }
    if (!room.game) throw err(409, 'bad_request');
    GAMES[room.game.type].mod.act(room, room.game, p.id, b);
    h.sendJson(res, 200, { ok: true });
    return true;
  }

  return { handle, size: () => rooms.size, close: () => rooms.forEach(closeRoom) };
};
