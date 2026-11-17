# Ripper Skipper

A cel-shaded wakeboarding and wakesurfing game for the browser. Cut at the wake, launch, throw a trick and land it before the two-minute clock runs out. Built with Three.js and Vite.

Play it at **https://www.ripperskipper.com**.

## Run it

    npm install
    npm run dev       # play locally at http://localhost:5173

That's all you need to play. For the leaderboard too, set up the Worker config once and run the local API alongside the dev server:

    cp wrangler.example.jsonc wrangler.jsonc
    npm run build     # wrangler serves dist/, so build once first
    npm run api       # leaderboard API and a local database on :8787 (the dev server passes /api to it)

`npm run build` writes the static game to `dist/`.

## Controls

**Wakeboard** (the boat tows you on a rope)

| Key | On the water | In the air |
| --- | --- | --- |
| ← → | carve across the wake | spin |
| ↑ ↓ | ↓ also loads a pop, like Space | front / back roll |
| Space | hold to load, release at the lip to pop | — |
| W A S D | — | nose / melon / tail / indy grab |
| F, C | — | stalefish, mute grab (unlocked) |
| E | — | Air Raley; with a grab key, a Hoochie Glide (unlocked) |
| Q | — | Tantrum backflip (unlocked) |
| R | — | S-Bend (unlocked) |

**Wakesurf** (no rope — ride the boat's wave)

| Key | Action |
| --- | --- |
| ← → | point down / up the face; alternate quickly to pump forward; spin in the air |
| ↑ ↓ | step forward / back on the board |
| Space | hold to load, release to ollie — off the lip for a big air |
| Q | surface 180 (twice for a 360) |
| W A S D | grabs |
| E | shove-it |

**Both:** M toggles music, Esc asks to quit the run, G opens the locker from the menus. Pick the mode on the title screen with ← →, or add `?surf` to the URL.

**Touch** (phone held sideways): the left thumb steers with a stick that starts wherever it lands; in the air, a fresh push on it spins or rolls (whatever it was already holding at take-off doesn't). The right thumb pops by swiping down then back up anywhere off the buttons, and taps the buttons for grabs and tricks.

## Scoring and unlocks

Landed tricks build a combo multiplier (up to x4); repeats score less and a wipeout resets it. Every point adds to an XP total saved in your browser, which unlocks new tricks, speaker systems (each with its own song), boats and lakes — Lake Tahoe, Lake Havasu, Lake Washington, a ride in under the Golden Gate to the Bay Bridge, and a few made-up ones. Choose them in the locker, where picking a trick shows the rider doing it.

## Leaderboard and deploying

The top-ten boards are a small Cloudflare Worker with a D1 database. Locally, `npm run api` runs it with a database of its own, and the dev server talks only to that.

To host your own copy, copy `wrangler.example.jsonc` to `wrangler.jsonc` (it's gitignored) and fill in your Worker name, D1 database name and domain, then:

    npx wrangler login
    npm run deploy    # vite build && npx wrangler deploy

Scores are taken on trust — the API doesn't check them.

## Credits and license

`public/waternormals.jpg` is the water normal map from the [three.js examples](https://github.com/mrdoob/three.js) (MIT).

Ripper Skipper is released under the [MIT License](LICENSE).
