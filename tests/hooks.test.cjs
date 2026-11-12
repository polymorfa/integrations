'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const hooks = require('../shared/hooks.cjs');
const Ajv = require('ajv'); const addFormats = require('ajv-formats');
const { events } = require('../shared/catalog.cjs');
const { auth, server } = require('./fake-webhooks.cjs');
const url = 'https://example.com/synthetic-callback';
const key = 'synthetic-trigger-1';
const NONCE = '11111111-1111-4111-8111-111111111111';
function memory() { let value; return { get: () => value, set: v => { value = v || undefined; }, peek: () => value }; }
for (const group of Object.keys(events)) test(`${group}: activation, reactivation, authentication and owned cleanup`, async () => {
  const s = server(); const transport = s.request.bind(s);
  const first = await hooks.subscribe(auth, url, group, key, transport, 'test', NONCE);
  assert.deepEqual(Object.keys(first).sort(), ['group', 'id', 'markerName', 'subscriptionKey', 'url']);
  assert.ok(!JSON.stringify(first).includes('SYNTHETIC-ONE-TIME-SIGNING-SECRET'));
  assert.deepEqual(await hooks.subscribe(auth, url, group, key, transport, 'test', NONCE), first);
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
  const result = await hooks.subscribe(auth, url, 'messageReceived', key, s.request.bind(s), 'test', NONCE);
  assert.ok(result.id); assert.equal(s.calls.filter(r => r.method === 'POST').length, 1);
});
test('an operator-disabled hook is preserved instead of silently enabling or duplicating it', async () => {
  const s = server(); const t = s.request.bind(s);
  await hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', NONCE); s.rows[0].enabled = false;
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', NONCE), e => e.code === 'subscription_changed_requires_reconciliation');
  assert.equal(s.calls.filter(r => r.method === 'POST').length, 1);
});
test('a different callback cannot reuse the same active subscription identity', async () => {
  const s = server(); const t = s.request.bind(s);
  await hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', NONCE);
  await assert.rejects(hooks.subscribe(auth, 'https://other.example/hook', 'messageReceived', key, t, 'test', NONCE), e => e.code === 'subscription_key_already_in_use');
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
  const s = server(); const t = s.request.bind(s); const owned = await hooks.subscribe(auth, url, 'messageReceived', key, t, 'test', NONCE);
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

test('deactivate then reactivate registers a new webhook with a new creation key', async () => {
  const s = server(); const store = memory();
  const first = await hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store);
  assert.equal(store.peek(), undefined, 'a confirmed activation clears its pending nonce');
  await hooks.unsubscribe(auth, first.id, url, 'messageReceived', key, s.transport, 'test');
  const second = await hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store);
  assert.equal(s.rows.length, 1); assert.equal(s.rows[0].id, second.id); assert.notEqual(second.id, first.id);
  const posts = s.posts(); assert.equal(posts.length, 2);
  assert.notEqual(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
  assert.ok(posts.every(r => !r.headers['Idempotency-Key'].includes(hooks.identity(auth, 'messageReceived', key).value)));
});

test('a test callback followed by the production callback activates both in turn', async () => {
  const s = server(); const store = memory();
  const test = await hooks.activate(auth, 'https://n8n.example/webhook-test/abc/webhook', 'messageReceived', key, s.transport, 'test', store);
  await hooks.unsubscribe(auth, test.id, test.url, 'messageReceived', key, s.transport, 'test');
  const live = await hooks.activate(auth, 'https://n8n.example/webhook/abc/webhook', 'messageReceived', key, s.transport, 'test', store);
  assert.equal(s.rows.length, 1); assert.equal(s.rows[0].url, live.url);
});

test('a lost create response followed by a retry of the same activation yields one webhook', async () => {
  const s = server(); const store = memory();
  // The create is accepted, its response is lost and the inventory does not show it yet.
  s.loseNextCreate(); s.hideNewest(2);
  await assert.rejects(hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store), e => e.code === 'subscription_requires_reconciliation');
  const pending = store.peek(); assert.ok(pending && pending.nonce, 'the uncertain activation keeps its nonce');
  // The retry runs before the inventory catches up, so it sends the create again with the same key.
  s.hideNewest(1);
  const owned = await hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store);
  const posts = s.posts();
  assert.equal(posts.length, 2); assert.equal(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
  assert.equal(s.rows.length, 1); assert.equal(owned.id, s.rows[0].id); assert.equal(store.peek(), undefined);
});

test('a lost create response is reconciled from the inventory without a second create', async () => {
  const s = server(); const store = memory(); s.loseNextCreate();
  const owned = await hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store);
  assert.equal(s.posts().length, 1); assert.equal(s.rows.length, 1); assert.equal(owned.id, s.rows[0].id);
});

test('a replayed receipt for a deleted webhook is refused, then the next activation registers a new one', async () => {
  const s = server(); const store = memory();
  s.loseNextCreate(); s.hideNewest(2);
  await assert.rejects(hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store), e => e.code === 'subscription_requires_reconciliation');
  const nonce = store.peek().nonce;
  s.rows.splice(0); // Someone deletes the webhook before the retry.
  await assert.rejects(hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store), e => e.code === 'subscription_receipt_deleted' && /Activate the trigger again/.test(e.message));
  assert.equal(s.rows.length, 0, 'the dead webhook is not reported as live and nothing new was created');
  assert.equal(s.posts()[1].headers['Idempotency-Key'], s.posts()[0].headers['Idempotency-Key']);
  assert.equal(store.peek(), undefined, 'the spent nonce is discarded');
  const owned = await hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store);
  assert.equal(s.rows.length, 1); assert.equal(owned.id, s.rows[0].id);
  assert.notEqual(s.posts()[2].headers['Idempotency-Key'], s.posts()[0].headers['Idempotency-Key']);
  assert.ok(nonce);
});

test('a replayed receipt for a webhook that is live but missing from the inventory needs reconciliation', async () => {
  const s = server(); s.loseNextCreate(); s.hideNewest(10); const store = memory();
  await assert.rejects(hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store), e => e.code === 'subscription_requires_reconciliation');
  await assert.rejects(hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store), e => e.code === 'subscription_receipt_requires_reconciliation');
  assert.equal(s.rows.length, 1); assert.ok(store.peek(), 'an unresolved activation keeps its nonce');
});

test('creation keys require an adapter nonce and a pending nonce is bound to its callback and trigger', async () => {
  assert.throws(() => hooks.creationKey('a'.repeat(64), 'short'), e => e.code === 'invalid_creation_nonce');
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, async () => ({ status: 200, body: { data: [], page: {} } }), 'test'), e => e.code === 'invalid_creation_nonce');
  const s = server(); const store = memory();
  store.set({ nonce: NONCE, url: 'https://other.example/hook', group: 'messageReceived', subscriptionKey: key });
  await hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store);
  assert.notEqual(s.posts()[0].headers['Idempotency-Key'], hooks.creationKey(hooks.identity(auth, 'messageReceived', key).key, NONCE));
});

test('uncertain creation errors keep reconcile guidance even when the server sends an error code', async () => {
  const transport = async r => r.method === 'GET' ? { status: 200, body: { data: [], page: { hasMore: false } } } : { status: 503, headers: {}, body: { error: { code: 'internal_error' } } };
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, transport, 'test', NONCE), e => e.code === 'subscription_requires_reconciliation');
});

test('public QuickLink reference survives the event projection without arbitrary transport data', () => {
  const sample = require('../fixtures/events.json').numberState;
  const projected = hooks.envelope({ ...sample, externalId: 'synthetic-order-reference', transportSecret: 'must-not-escape' }, 'numberState');
  assert.equal(projected.externalId, 'synthetic-order-reference'); assert.ok(!('transportSecret' in projected));
  assert.ok(!('externalId' in hooks.envelope({ ...sample, externalId: { invalid: true } }, 'numberState')));
});

test('callback normalization preserves ownership across activation and cleanup', async () => {
  const s = server(); const transport = s.request.bind(s);
  const first = await hooks.subscribe(auth, 'https://EXAMPLE.COM:443', 'messageReceived', key, transport, 'test', NONCE);
  assert.equal(s.rows[0].url, 'https://example.com/');
  assert.deepEqual(await hooks.subscribe(auth, 'https://example.com/', 'messageReceived', key, transport, 'test', NONCE), first);
  await hooks.unsubscribe(auth, first.id, 'https://EXAMPLE.COM:443', 'messageReceived', key, transport, 'test');
  assert.equal(s.rows.length, 0);
  assert.equal(hooks.sameCallback(url + '?key=A', url + '?key=a'), false);
});

for (const status of [403, 422, 429]) test(`definite subscription rejection ${status} preserves its error and retry metadata`, async () => {
  let reads = 0;
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, async r => {
    if (r.method === 'GET') { reads++; return { status: 200, body: { data: [], page: { hasMore: false } } }; }
    return { status, headers: { 'retry-after': '17', 'x-request-id': 'safe-request' }, body: { error: { code: 'scope_denied' } } };
  }, 'test', NONCE), e => e.status === status && e.code === 'scope_denied' && e.retryAfter === 17 && e.requestId === 'safe-request');
  assert.equal(reads, 1);
});
