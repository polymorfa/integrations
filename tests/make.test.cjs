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
