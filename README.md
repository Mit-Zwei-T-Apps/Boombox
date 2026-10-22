# Boombox – Party Games

Party games for one phone or for everyone's own phone (online rooms). Free, no ads, no account needed.

Pass the phone around, look at your card, cover it, hand it on. Everything runs in the browser; the small Node.js server only serves the game and, if you want, keeps optional accounts.

**Games**

- **Impostor:** everyone knows the secret word except the impostor(s).
- **Spy:** everyone is at the same place except the spy.
- **Werewolf:** with an on-screen narrator. Roles: werewolf, seer, witch, hunter, Cupid, guardian, little girl, village idiot, elder, villager. Optional separate narrator.
- **Who would rather:** 30 questions, everyone points at the same time.
- **Bomb:** name something for the topic and pass the phone before it explodes.
- **Never have I ever**, **Truth or dare**, **Who am I?** (one phone).
- **Dots and boxes** (Käsekästchen): 2 to 4 players, one phone or online.
- **Sketch it:** one player draws, the others guess (online only).
- **Spectrum:** one player knows a hidden spot between two opposites and gives a hint, the others place it (online only).

**Online play**

Choose *Play online*, create a room, and share the 4-letter code. Everybody uses their own phone. Online: Impostor, Spy, Werewolf (secret roles on each phone, automatic narrator), Who would rather, Bomb, Dots and boxes, Spectrum and Sketch it. The host can share an invite link (`/?room=ABCD`). Names and rooms need no account. The host picks the game; words and questions use the host's language. Rooms are kept in memory and disappear when idle. Limit with `MAX_ROOMS` (default 200).

**Features**

- 3 to 20 players, names are saved in the browser.
- Languages: English (default) and Deutsch. Anything else falls back to English. Easy to add more (see below).
- Optional accounts: sign in to keep your player names and language on the server and use them on other devices. Guests lose nothing.
- No dependencies. Needs only Node.js 18 or newer.
- No external requests: no fonts, CDNs or trackers.

## Install

### Pterodactyl

1. Download `egg-boombox.json` from the [latest release](../../releases/latest) (or use `egg/egg-boombox.json` from this repository) and import it under *Nests → Import Egg*.
2. Create a server with the egg and set the variables (see below).
3. Start it. On the first start an `admin` account is created with a random password. You find it in `data/admin-initial-password.txt`. The admin has to change it at the first login.
4. Put an HTTPS reverse proxy in front (see below) and set `COOKIE_SECURE=true` and `TRUST_PROXY=true`.

**Updating:** set `RELEASE_TAG` to the new version (or `latest`) and press **Reinstall**. The `data/` folder (accounts) is kept.

The installer checks `boombox.tar.gz.sha256` and rejects archives with unsafe paths or links.

### Locally

```sh
node server.js
```

Then open <http://localhost:3000>. Use `npm test` to run the smoke test.

## Configuration

Environment variables (the egg exposes these as server variables):

| Variable | Default | Meaning |
| --- | --- | --- |
| `SERVER_PORT` / `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Address to listen on |
| `DATA_DIR` | `./data` | Where accounts and sessions are stored |
| `ALLOW_REGISTER` | `true` | Allow visitors to create accounts |
| `ADMIN_USER` | `admin` | Name of the admin account |
| `ADMIN_PASSWORD` | random | Optional start password. Must be changed at first login |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy |
| `MAX_USERS` | `1000` | Maximum number of accounts |
| `MAX_ROOMS` | `200` | Maximum simultaneous online rooms |

`GITHUB_REPO` and `RELEASE_TAG` are only used by the egg installer.

### Reverse proxy (Nginx example)

```nginx
server {
    server_name boombox.example.com;
    # listen 443 ssl; ssl_certificate ...; (your TLS setup)

    location / {
        proxy_pass http://127.0.0.1:3000;   # the Pterodactyl allocation port
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # live updates for online rooms must not be buffered
    location /api/room/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

## Own content and app install

- The admin can add own words, questions, "never have I ever" lines, truths, dares and bomb topics under *Account → Admin → Own content*. They are stored in `data/custom.json` and added to the built-in lists in every language.
- The site is an installable web app (PWA). Use "Add to Home Screen" in the browser. The one-phone games also open offline once the site has been loaded. Online rooms and accounts need a connection.

## Accounts

- Registration is open by default; turn it off with `ALLOW_REGISTER=false`.
- Passwords are hashed with scrypt. Sessions use an HttpOnly, SameSite=Lax cookie.
- Login and registration are rate limited per address.
- The admin can list users, reset passwords (the user must choose a new one at the next login) and remove users.
- Users can change their password and delete their account.
- Data lives in `data/users.json` and `data/sessions.json`. Back up `data/` to keep accounts.

If the game is hosted as plain static files without the server, the account button is hidden and everything else still works.

## Add a language

1. Copy `public/locales/en.json` to `public/locales/<code>.json` (for example `it.json`) and translate the values. Keep the keys, the `{placeholders}` and the lists under `data`.
2. Add the language to `public/locales/index.json`.
3. Open a pull request.

Missing keys fall back to English.

## Releases

Push a tag that matches the version in `package.json`:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The *Release* workflow tests the server, builds `boombox.tar.gz` and `boombox.tar.gz.sha256`, generates `egg-boombox.json` for the repository and publishes all three as a GitHub Release.

### Forks

Regenerate the egg for your own repository:

```sh
python3 scripts/make_egg.py YOUR-NAME/YOUR-REPO --author you@example.com
```

## Project layout

```
server.js              HTTP server, static files, account API
public/                the game (index.html, app.js, app.css)
public/locales/        translations
egg/egg-boombox.json   Pterodactyl egg (generated)
scripts/make_egg.py    egg generator
scripts/smoke-test.js  end-to-end test of the server
.github/workflows/     CI and release
```

## Credits

Created by Matteo Mit Zwei T, with Claude.

Boombox is a home-made project and is not affiliated with the app Splash.


## Solo, Bots & Schwierigkeit
- Schach: gegen Bot (3 Stufen) oder zu zweit an einem Handy, mit Rochade, en passant und Umwandlung.
- Solo-Spiele: Wordle (Wortraten), Memory, Reaktionstest.
- 2-Spieler-Duelle, 4-Spieler-Modi und Dots & Boxes lassen sich allein gegen Bots spielen; Schwierigkeit: leicht/mittel/schwer.
- Rollen-Karten: nach oben wischen zum Aufdecken, nach unten wischen zum Verdecken (wie bei Splash).
