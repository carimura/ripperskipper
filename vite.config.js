// Local play (`npm run dev`) talks to a local leaderboard: run `npm run api` alongside it (wrangler dev on :8787, with a local database).
// Without it the game still plays; the leaderboard is just empty.
export default { server: { proxy: { '/api': 'http://localhost:8787' } } };
