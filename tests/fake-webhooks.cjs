'use strict';
// Synthetic project-webhook API for lifecycle tests. It models idempotent create receipts,
// which the real API replays for 24 hours, including receipts for since-deleted webhooks.
const assert = require('node:assert/strict');
const auth = { apiKey: 'synthetic-project-token-not-a-credential', projectId: '11111111-1111-4111-8111-111111111111' };
function server(credentials = auth) {
  const rows = []; const calls = []; const receipts = new Map();
  let lose = 0; let hide = 0; let created = 0;
  const api = {
    rows, calls, receipts,
    // The next create is accepted but its response is lost.
    loseNextCreate() { lose++; },
    // The next n inventory reads omit the newest row, as an eventually consistent list may.
    hideNewest(n) { hide = n; },
    posts() { return calls.filter(r => r.method === 'POST'); },
    async request(r) {
      calls.push(r);
      assert.equal(new URL(r.url).origin, 'https://api.polymorfa.com');
      assert.equal(r.headers.Authorization, `Bearer ${credentials.apiKey}`);
      if (r.method === 'GET' && /\/webhooks$/.test(new URL(r.url).pathname)) {
        let data = rows.slice();
        if (hide > 0) { hide--; data = data.slice(0, -1); }
        return { status: 200, headers: {}, body: { data, page: { hasMore: false, nextCursor: null } } };
      }
      if (r.method === 'POST') {
        const key = r.headers['Idempotency-Key'];
        assert.ok(key, 'create requires an idempotency key');
        if (receipts.has(key)) {
          const receipt = receipts.get(key);
          assert.deepEqual(r.body, receipt.request, 'replayed create must send the same request');
          return { ...receipt.response, body: { data: { ...receipt.response.body.data, idempotency: { key, replayed: true } } } };
        }
        const row = { ...r.body, owner: 'project', projectId: credentials.projectId, id: `synthetic-hook-${++created}`, headers: r.body.headers.map(h => ({ name: h.name })) };
        rows.push(row);
        const response = { status: 201, headers: {}, body: { data: { webhook: { ...row }, secret: 'SYNTHETIC-ONE-TIME-SIGNING-SECRET' } } };
        receipts.set(key, { request: r.body, response });
        if (lose > 0) { lose--; throw new Error('Response lost after accepted create'); }
        return response;
      }
      const row = rows.find(row => new URL(r.url).pathname.endsWith('/' + row.id));
      if (!row) return { status: 404, headers: {}, body: { error: { code: 'not_found' } } };
      if (r.method === 'DELETE') { rows.splice(rows.indexOf(row), 1); return { status: 200, headers: {}, body: { data: {} } }; }
      return { status: 200, headers: {}, body: { data: row } };
    },
  };
  api.transport = api.request.bind(api);
  return api;
}
module.exports = { auth, server };
