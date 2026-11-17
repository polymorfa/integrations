'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const hooks = require('../shared/hooks.cjs');
const { auth, server } = require('./fake-webhooks.cjs');
const url = 'https://example.com/synthetic-callback';
const key = 'synthetic-trigger-1';
const NONCE = '11111111-1111-4111-8111-111111111111';
const SECRET = 'synthetic-signing-secret-for-tests';
const sign = (secret, body) => createHmac('sha256', secret).update(body).digest('hex');
const body = '{"id":"evt-1","note":"  spacing   and \\u00e9 kept  "}';
const H = 'x-webhook-signature';

test('verify accepts a valid signature over the exact raw body, string or Buffer', () => {
  assert.ok(hooks.verify(SECRET, body, { [H]: sign(SECRET, body) }));
  assert.ok(hooks.verify(SECRET, Buffer.from(body), { 'X-Webhook-Signature': sign(SECRET, body) }));
  assert.ok(hooks.verify(SECRET, body, { 'Http-X-Webhook-Signature': sign(SECRET, body) }, ['', 'http-']));
});
test('verify fails closed on every malformed or mismatched input', () => {
  const good = sign(SECRET, body);
  const cases = {
    'wrong secret': [SECRET + 'x', body, { [H]: good }],
    'tampered body': [SECRET, body + ' ', { [H]: good }],
    're-serialized body': [SECRET, JSON.stringify(JSON.parse(body)), { [H]: good }],
    'missing header': [SECRET, body, {}],
    'duplicate header': [SECRET, body, { [H]: good, 'X-Webhook-Signature': good }],
    'uppercase hex': [SECRET, body, { [H]: good.toUpperCase() }],
    'short hex': [SECRET, body, { [H]: good.slice(0, 62) }],
    'array value': [SECRET, body, { [H]: [good] }],
    'prefix not allowed': [SECRET, body, { 'Http-X-Webhook-Signature': good }],
    'missing raw body': [SECRET, undefined, { [H]: good }],
    'parsed object body': [SECRET, JSON.parse(body), { [H]: good }],
    'missing secret': [undefined, body, { [H]: good }],
    'empty secret': ['', body, { [H]: sign('', body) }],
    'short secret': ['short', body, { [H]: sign('short', body) }],
  };
  for (const [name, args] of Object.entries(cases)) assert.equal(hooks.verify(...args), false, name);
});
test('the secret from the create response is returned separately and used without rotation', async () => {
  const s = server();
  const { owned, secret } = await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
  assert.equal(secret, 'SYNTHETIC-ONE-TIME-SIGNING-SECRET');
  assert.equal(s.rotations().length, 0);
  assert.ok(!JSON.stringify(owned).includes(secret));
});
test('an existing hook gets a fresh secret by rotation with overlap 0 and a fresh key', async () => {
  const s = server();
  await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
  const again = await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
  assert.equal(again.secret, 'SYNTHETIC-ROTATED-SIGNING-SECRET-1');
  const [rotation] = s.rotations(); assert.deepEqual(rotation.body, { overlapSeconds: 0 });
  assert.ok(rotation.headers['Idempotency-Key'].startsWith('integration-rotate-'));
  await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
  const keys = s.rotations().map(r => r.headers['Idempotency-Key']); assert.equal(new Set(keys).size, 2);
});
test('a hook recovered after a lost create response gets its secret by rotation', async () => {
  const s = server(); s.loseNextCreate();
  const { owned, secret } = await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
  assert.equal(s.posts().length, 1); assert.equal(s.rotations().length, 1);
  assert.equal(secret, s.secrets.get(owned.id));
});
test('a replayed create receipt without a secret falls back to rotation', async () => {
  const s = server(); const store = { v: undefined, get() { return this.v; }, set(x) { this.v = x || undefined; } };
  s.loseNextCreate(); s.hideNewest(2);
  await assert.rejects(hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store), e => e.code === 'subscription_requires_reconciliation');
  s.hideNewest(1); // The retry's first inventory read misses it, so it replays the create receipt.
  const { owned, secret } = await hooks.activate(auth, url, 'messageReceived', key, s.transport, 'test', store);
  assert.equal(s.posts().length, 2); assert.equal(s.rotations().length, 1);
  assert.equal(secret, s.secrets.get(owned.id));
});
test('rotation failure or a missing secret gives signing_secret_unavailable and no owned hook', async () => {
  for (const mode of ['reject', 'nosecret']) {
    const s = server(); await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
    s.rotateMode(mode);
    await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE), e => e.code === 'signing_secret_unavailable' && !/SYNTHETIC/.test(e.message), mode);
  }
});
test('an uncertain rotation is not retried and asks for reconciliation', async () => {
  const s = server(); await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
  s.rotateMode('lose');
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE), e => e.code === 'signing_secret_rotation_requires_reconciliation' && /rotate again/.test(e.message));
  assert.equal(s.rotations().length, 1);
});
test('a malformed rotated secret is refused', async () => {
  const s = server(); await hooks.subscribe(auth, url, 'messageReceived', key, s.transport, 'test', NONCE);
  const transport = r => /secret-rotations$/.test(r.url) ? Promise.resolve({ status: 200, headers: {}, body: { data: { secret: 'has space and is long enough' } } }) : s.request(r);
  await assert.rejects(hooks.subscribe(auth, url, 'messageReceived', key, transport, 'test', NONCE), e => e.code === 'signing_secret_unavailable');
});
