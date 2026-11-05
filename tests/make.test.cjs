'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readdirSync, readFileSync } = require('node:fs');
const { createHmac, createHash } = require('node:crypto');
const core = require('../shared/core.cjs'); const hooks = require('../shared/hooks.cjs');
const iml = { sha256: (text, encoding, key) => key ? createHmac('sha256', key).update(text).digest(encoding) : createHash('sha256').update(text).digest(encoding) };
for (const file of readdirSync('make/functions')) {
  const text = readFileSync('make/functions/' + file, 'utf8');
  assert.ok(text.length <= 5000);
  const name = file.slice(0, -3); iml[name] = vm.runInNewContext(`(${text})`, { Buffer, iml });
}
const auth = { apiKey: 'synthetic-token', projectId: '11111111-1111-4111-8111-111111111111' };
test('Make function output matches the shared public request across text, media and advanced calls', () => {
  const p = { session: '739182640518203', recipientType: 'id', recipient: '739182640518204', text: 'Synthetic', idempotencyKey: 'synthetic-write-1', writeCreatedAt: new Date().toISOString() };
  for (const [action, extra] of [['sendText', {}], ['sendMedia', { mediaType: 'file', mediaSource: 'base64', media: 'AAECAw==' }], ['sendMedia', { mediaType: 'image', mediaSource: 'url', media: 'https://example.com/synthetic.png' }], ['apiRequest', { method: 'GET', path: '/platform/sessions' }]]) {
    const expected = core.buildRequest(action, { ...p, ...extra }, auth, 'make');
    const actual = iml.polymorfaRequest(action, { ...p, ...extra }, auth);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
  }
});
test('Make uses the same authenticated subscription identity and refuses forged events', () => {
  const expected = hooks.identity(auth, 'messageReceived', 'synthetic-key');
  const actual = iml.polymorfaHook(auth, 'messageReceived', 'synthetic-key');
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
  const event = require('../fixtures/events.json').messageReceived;
  assert.equal(iml.polymorfaReceive(actual.name, actual.value, 'messageReceived', { [actual.name]: actual.value }, event), true);
  assert.equal(iml.polymorfaReceive(actual.name, actual.value, 'messageReceived', {}, event), false);
});
test('Make error function preserves completed/unknown write state without exposing response content', () => {
  for (const code of ['idempotency_completed', 'idempotency_outcome_unknown']) assert.throws(() => iml.polymorfaResult(409, {}, { error: { code, message: auth.apiKey } }), e => e.code === code && !e.message.includes(auth.apiKey));
});
test('Make refuses an incomplete hook inventory instead of creating a duplicate', () => {
  assert.throws(() => iml.polymorfaFindHook({ data: [], page: { hasMore: true } }, auth, 'https://example.com', 'messageReceived', 'key'));
});
test('Make preserves an operator-disabled owned hook', () => {
  const marker = hooks.identity(auth, 'messageReceived', 'key');
  const row = { id: 'owned', owner: 'project', projectId: auth.projectId, url: 'https://example.com', enabled: false, format: 'native', headers: [{ name: marker.name }], eventTypes: ['message.received'] };
  assert.throws(() => iml.polymorfaFindHook({ data: [row], page: { hasMore: false } }, auth, row.url, 'messageReceived', 'key'));
});

test('Make activation keys are independent of receiver secrets and change between activations', () => {
  const marker = iml.polymorfaHook(auth, 'messageReceived', 'key');
  const first = iml.polymorfaCreateKey(marker.key, '11111111-1111-4111-8111-111111111111');
  const second = iml.polymorfaCreateKey(marker.key, '22222222-2222-4222-8222-222222222222');
  assert.notEqual(first, second); assert.ok(!first.includes(marker.value));
  assert.throws(() => iml.polymorfaCreateKey(marker.key, ''));
  const base = JSON.parse(readFileSync('make/base.json'));
  for (const path of ['request.headers.idempotency-key', 'request.body.headers', 'response.body.data.idempotency.key']) assert.ok(base.log.sanitize.includes(path));
});

test('Make detach only deletes owned IDs in a complete successful inventory', () => {
  const marker = iml.polymorfaHook(auth, 'messageReceived', 'key');
  const row = { id: 'owned', owner: 'project', projectId: auth.projectId, url: 'https://EXAMPLE.COM:443', format: 'native', headers: [{ name: marker.name }], eventTypes: ['message.received'] };
  const args = ['owned', auth.projectId, 'https://example.com/', marker.name, 'messageReceived'];
  assert.equal(iml.polymorfaDetachHook({ data: [], page: { hasMore: false } }, ...args), false);
  assert.equal(iml.polymorfaDetachHook({ data: [row], page: { hasMore: false } }, ...args), true);
  assert.throws(() => iml.polymorfaDetachHook({ data: [], page: { hasMore: true } }, ...args));
  assert.throws(() => iml.polymorfaDetachHook({ data: [{ ...row, projectId: 'other-project' }], page: { hasMore: false } }, ...args));
  const detach = JSON.parse(readFileSync('make/webhooks/messageReceived/detach.json'));
  assert.ok(detach[0].url.endsWith('/webhooks')); assert.equal(detach[1].condition, '{{temp.ownedPresent}}');
});

test('Make non-2xx error handlers retain recovery and rate-limit guidance without response secrets', () => {
  assert.match(iml.polymorfaError(409, {}, { error: { code: 'idempotency_completed', message: auth.apiKey } }), /Recover its original result/);
  assert.match(iml.polymorfaError(429, { 'retry-after': '19' }, { error: { code: 'rate_limited' } }), /19 seconds/);
  assert.match(iml.polymorfaError(502, {}, '<html>gateway error</html>'), /Reconcile/);
  const error = JSON.parse(readFileSync('make/base.json')).response.error;
  assert.ok(error['409'].message.includes('polymorfaError')); assert.equal(error['429'].type, 'RateLimitError'); assert.equal(error['5xx'], undefined);
});
