'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const hooks = require('../shared/hooks.cjs');
const Ajv = require('ajv'); const addFormats = require('ajv-formats');
const { events } = require('../shared/catalog.cjs');
const auth = { apiKey: 'synthetic-project-token-not-a-credential', projectId: '11111111-1111-4111-8111-111111111111' };
const url = 'https://example.com/synthetic-callback';
const key = 'synthetic-trigger-1';
function server() {
  const rows = []; const calls = []; const receipts = new Map(); let lost = false;
  return { rows, calls, loseNextCreate() { lost = true; }, async request(r) {
    calls.push(r);
    assert.equal(new URL(r.url).origin, 'https://api.polymorfa.com');
    assert.equal(r.headers.Authorization, `Bearer ${auth.apiKey}`);
    if (r.method === 'GET' && r.url.endsWith('/webhooks')) return { status: 200, body: { data: rows, page: { hasMore: false, nextCursor: null } } };
    if (r.method === 'POST') {
      const requestKey = r.headers['Idempotency-Key'];
      if (receipts.has(requestKey)) return receipts.get(requestKey);
      const row = { ...r.body, owner: 'project', projectId: auth.projectId, id: `synthetic-hook-${receipts.size + 1}`, headers: r.body.headers.map(h => ({ name: h.name })) }; rows.push(row);
      const receipt = { status: 200, body: { data: { webhook: row, secret: 'SYNTHETIC-ONE-TIME-SIGNING-SECRET' } } };
      receipts.set(requestKey, receipt);
      if (lost) { lost = false; throw new Error('Response lost after accepted create'); }
      return receipt;
    }
    const row = rows.find(row => r.url.endsWith('/' + row.id));
    if (!row) return { status: 404, body: { error: { code: 'not_found' } } };
    if (r.method === 'DELETE') { rows.splice(rows.indexOf(row), 1); return { status: 200, body: { data: {} } }; }
    return { status: 200, body: { data: row } };
  } };
}
for (const group of Object.keys(events)) test(`${group}: activation, reactivation, authentication and owned cleanup`, async () => {
  const s = server(); const transport = s.request.bind(s);
  const first = await hooks.subscribe(auth, url, group, key, transport, 'test', 'registration-generation-1');
  assert.deepEqual(Object.keys(first).sort(), ['group', 'id', 'markerName', 'subscriptionKey', 'url']);
  assert.ok(!JSON.stringify(first).includes('SYNTHETIC-ONE-TIME-SIGNING-SECRET'));
  assert.deepEqual(await hooks.subscribe(auth, url, group, key, transport, 'test', 'registration-generation-1'), first);
  assert.equal(s.calls.filter(r => r.method === 'POST').length, 1);
  const marker = hooks.identity(auth, group, key);
  assert.ok(hooks.authenticate(auth, group, key, { [marker.name.toLowerCase()]: marker.value }));
  assert.ok(!hooks.authenticate(auth, group, 'another-trigger', { [marker.name]: marker.value }));
  assert.ok(!hooks.authenticate({ ...auth, apiKey: 'rotated-synthetic-key' }, group, key, { [marker.name]: marker.value }));
  for (const bad of [{}, { [marker.name]: ['a', 'b'] }, { [marker.name]: 'not-a-secret' }, { [marker.name]: marker.value + 'x' }]) assert.ok(!hooks.authenticate(auth, group, key, bad));
  await hooks.unsubscribe(auth, first.id, url, group, key, transport, 'test');
  assert.equal(s.rows.length, 0);
});
test('an ambiguous accepted create is recovered without another create', async () => {
  const s = server(); s.loseNextCreate();
  const result = await hooks.subscribe(auth, url, 'messageReceived', key, s.request.bind(s), 'test', 'registration-generation-1');
  assert.ok(result.id); assert.equal(s.calls.filter(r => r.method === 'POST').length, 1);
});
test('an operator-disabled hook is preserved instead of silently enabling or duplicating it', async () => {
  const s = server(); const t = s.request.bind(s);
  await hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', 'registration-generation-1'); s.rows[0].enabled = false;
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', 'registration-generation-1'), e => e.code === 'subscription_changed_requires_reconciliation');
  assert.equal(s.calls.filter(r => r.method === 'POST').length, 1);
});
test('a different callback cannot reuse the same active subscription identity', async () => {
  const s = server(); const t = s.request.bind(s);
  await hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', 'registration-generation-1');
  await assert.rejects(hooks.subscribe(auth, 'https://other.example/hook', 'messageReceived', key, t, 'test', 'registration-generation-1'), e => e.code === 'subscription_key_already_in_use');
  assert.equal(s.calls.filter(r => r.method === 'POST').length, 1);
});
test('owned lookup follows cursor pages and refuses looping cursors', async () => {
  const marker = hooks.identity(auth, 'messageReceived', key); const calls = [];
  const hook = { id: 'owned', projectId: auth.projectId, owner: 'project', enabled: true, format: 'native', url, headers: [{ name: marker.name }], eventTypes: ['message.received'] };
  const found = await hooks.find(auth, url, 'messageReceived', key, async r => {
    calls.push(r); return { status: 200, body: r.query.cursor ? { data: [hook], page: { hasMore: false } } : { data: [], page: { hasMore: true, nextCursor: 'next' } } };
  }, 'test');
  assert.equal(found.id, 'owned'); assert.equal(calls.length, 2); assert.equal(calls[1].query.cursor, 'next');
  await assert.rejects(hooks.find(auth, url, 'messageReceived', key, async () => ({ status: 200, body: { data: [], page: { hasMore: true, nextCursor: 'loop' } } }), 'test'), e => e.code === 'invalid_subscription_pagination');
});
test('cleanup refuses another subscription and never falls back to broader credentials', async () => {
  const s = server(); const t = s.request.bind(s); const owned = await hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', 'registration-generation-1');
  await assert.rejects(hooks.unsubscribe(auth, owned.id, 'https://another.example/hook', 'messageReceived', key, t, 'test'), e => e.code === 'subscription_ownership_mismatch');
  assert.equal(s.calls.filter(r => r.method === 'DELETE').length, 0);
});
test('only the selected public envelope is emitted and event IDs remain stable', () => {
  const samples = require('../fixtures/events.json');
  for (const [group, body] of Object.entries(samples)) {
    const event = hooks.envelope({ ...body, headers: { Authorization: 'must-not-escape' } }, group);
    assert.equal(event.id, body.id); assert.ok(!('headers' in event));
    assert.throws(() => hooks.envelope({ ...body, event: 'session.qr' }, group));
    assert.throws(() => hooks.envelope({ ...body, session: 739182640518203 }, group));
  }
});
test('editor samples match their public event schemas', () => {
  const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
  ajv.addSchema(require('../scripts/openapi-schema.cjs')(require('../contracts/openapi.messaging.json')), 'messaging');
  const names = { messageReceived: 'MessageReceivedEvent', messageState: 'MessageSentEvent', numberState: 'SessionStatusEvent', callEnded: 'CallEndedEvent' };
  for (const [group, sample] of Object.entries(require('../fixtures/events.json'))) {
    const validate = ajv.compile({ $ref: `messaging#/components/schemas/${names[group]}` });
    assert.ok(validate(sample), `${group}: ${JSON.stringify(validate.errors)}`);
  }
});

test('public marker and create keys do not reveal receiver verifier material', () => {
  const marker = hooks.identity(auth, 'messageReceived', key);
  assert.notEqual(marker.key, marker.value);
  assert.ok(!marker.name.includes(marker.value.slice(0, 24)));
});

test('saved creation generations prevent deleted-receipt activation and permit confirmed recreation', async () => {
  const s = server(); const transport = s.request.bind(s);
  const first = await hooks.subscribe(auth, url, 'messageReceived', key, transport, 'test', 'registration-generation-1');
  await hooks.unsubscribe(auth, first.id, url, 'messageReceived', key, transport, 'test');
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, transport, 'test', 'registration-generation-1'), e => e.code === 'subscription_requires_reconciliation');
  assert.equal(s.rows.length, 0);
  const second = await hooks.subscribe(auth, url, 'messageReceived', key, transport, 'test', 'registration-generation-2');
  const requests = s.calls.filter(r => r.method === 'POST');
  assert.equal(requests.length, 3); assert.equal(s.rows.length, 1); assert.notEqual(second.id, first.id);
  assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
  assert.notEqual(requests[0].headers['Idempotency-Key'], requests[2].headers['Idempotency-Key']);
  assert.ok(requests.every(r => !r.headers['Idempotency-Key'].includes(hooks.identity(auth, 'messageReceived', key).value)));
});

test('uncertain creation retries use the same saved key and refuse a missing generation', async () => {
  const keys = [];
  const transport = async r => {
    if (r.method === 'GET') return { status: 200, body: { data: [], page: { hasMore: false } } };
    keys.push(r.headers['Idempotency-Key']); throw new Error('Uncertain synthetic transport');
  };
  for (let i = 0; i < 2; i++) await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, transport, 'test', 'saved-generation'), e => e.code === 'subscription_requires_reconciliation');
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, transport, 'test'), e => e.code === 'invalid_registration_key');
  assert.equal(keys.length, 2);
});

test('public QuickLink reference survives the event projection without arbitrary transport data', () => {
  const sample = require('../fixtures/events.json').numberState;
  const projected = hooks.envelope({ ...sample, externalId: 'synthetic-order-reference', transportSecret: 'must-not-escape' }, 'numberState');
  assert.equal(projected.externalId, 'synthetic-order-reference'); assert.ok(!('transportSecret' in projected));
  assert.ok(!('externalId' in hooks.envelope({ ...sample, externalId: { invalid: true } }, 'numberState')));
});

test('callback normalization preserves ownership across activation and cleanup', async () => {
  const s = server(); const transport = s.request.bind(s);
  const first = await hooks.subscribe(auth, 'https://EXAMPLE.COM:443', 'messageReceived', key, transport, 'test', 'registration-generation-1');
  assert.equal(s.rows[0].url, 'https://example.com/');
  assert.deepEqual(await hooks.subscribe(auth, 'https://example.com/', 'messageReceived', key, transport, 'test', 'registration-generation-1'), first);
  await hooks.unsubscribe(auth, first.id, 'https://EXAMPLE.COM:443', 'messageReceived', key, transport, 'test');
  assert.equal(s.rows.length, 0);
  assert.equal(hooks.sameCallback(url + '?key=A', url + '?key=a'), false);
});

for (const status of [403, 422, 429]) test(`definite subscription rejection ${status} preserves its error and retry metadata`, async () => {
  let reads = 0;
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, async r => {
    if (r.method === 'GET') { reads++; return { status: 200, body: { data: [], page: { hasMore: false } } }; }
    return { status, headers: { 'retry-after': '17', 'x-request-id': 'safe-request' }, body: { error: { code: 'scope_denied' } } };
  }, 'test', 'registration-generation-1'), e => e.status === status && e.code === 'scope_denied' && e.retryAfter === 17 && e.requestId === 'safe-request');
  assert.equal(reads, 1);
});
