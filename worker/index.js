// The server side of www.ripperskipper.com: the leaderboard — the best ten scores for each mode, shared by everyone who plays.
//   GET  /api/scores?mode=wake|surf          → { top: [{ name, score }] }
//   POST /api/scores { mode, name, score }   → { top, rank }      (kept only if it makes the ten; rank is null if it didn't)
// Everything else is the game itself, served from dist/. Scores are taken on trust: the game runs in the player's browser.
const MODES = ['wake', 'surf'], KEEP = 10;
let ready = false;                                     // the table is made on first use, once per isolate (a flag, not a shared promise: a promise from one request can't be awaited by another)

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const top = (db, mode) => db.prepare('SELECT name, score FROM scores WHERE mode = ? ORDER BY score DESC, at ASC LIMIT ?').bind(mode, KEEP).all().then(r => r.results);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/scores') return env.ASSETS.fetch(request);
    const db = env.DB;
    if (!ready) { await db.prepare('CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, at INTEGER NOT NULL)').run(); ready = true; }
    if (request.method === 'GET') {
      const mode = url.searchParams.get('mode');
      return MODES.includes(mode) ? json({ top: await top(db, mode) }) : json({ error: 'mode' }, 400);
    }
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    let b;
    try { b = await request.json(); } catch { return json({ error: 'json' }, 400); }
    const name = String(b?.name ?? '').toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').trim().slice(0, 10), score = Math.round(Number(b?.score));
    if (!MODES.includes(b?.mode) || !name || !(score > 0 && score <= 1e6)) return json({ error: 'entry' }, 400);
    const ahead = (await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE mode = ? AND score >= ?').bind(b.mode, score).first()).n;
    if (ahead < KEEP) {
      await db.prepare('INSERT INTO scores (mode, name, score, at) VALUES (?, ?, ?, ?)').bind(b.mode, name, score, Date.now()).run();
      await db.prepare('DELETE FROM scores WHERE mode = ?1 AND id NOT IN (SELECT id FROM scores WHERE mode = ?1 ORDER BY score DESC, at ASC LIMIT ?2)').bind(b.mode, KEEP).run();
    }
    return json({ top: await top(db, b.mode), rank: ahead < KEEP ? ahead + 1 : null });
  },
};
