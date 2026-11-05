'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const core = require('../shared/core.cjs');
const { actions } = require('../shared/catalog.cjs');
const spec = require('../contracts/openapi.messaging.json');
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
ajv.addSchema(spec, 'messaging');
const now = Date.parse('2026-11-01T12:00:00Z');
const auth = { apiKey: 'synthetic-project-token-not-a-credential', projectId: '11111111-1111-4111-8111-111111111111' };
const input = { session: '739182640518203', recipientType: 'id', recipient: '9007199254740993123', text: 'An order is ready.', idempotencyKey: 'order-123-notification-1', writeCreatedAt: '2026-11-01T11:59:00Z' };

test('non-JSON gateway failures retain uncertain-write recovery and safe retry metadata', () => {
  assert.throws(() => core.parseResponse({ status: 502, headers: { 'retry-after': '8' }, body: '<html>upstream unavailable</html>' }), e => e.code === 'outcome_unknown' && e.retryAfter === 8 && /Reconcile/.test(e.message));
  assert.throws(() => core.parseResponse({ status: 200, body: '<html>not JSON</html>' }), e => e.code === 'invalid_response');
});
test('text/reply preserves opaque IDs, version, credential and logical-write identity', () => {
  const r = core.buildRequest('sendText', { ...input, quotedMessageId: '9007199254740993124' }, auth, 'test', now);
  assert.equal(r.url, 'https://api.polymorfa.com/messaging/739182640518203/messages/send');
  assert.deepEqual(r.body, { conversation: { id: '9007199254740993123' }, content: { text: input.text }, quotedMessage: { id: '9007199254740993124' } });
  assert.equal(r.headers['Idempotency-Key'], input.idempotencyKey); assert.equal(r.headers['Polymorfa-Version'], '2026-09-22');
  assert.equal(r.headers.Authorization, `Bearer ${auth.apiKey}`);
});
const sendCases = [
  ['sendText', {}], ['sendTemplate', { templateName: 'order_ready', language: 'en', components: '[{"type":"body","parameters":[{"type":"text","text":"123"}]}]' }],
  ...['image', 'video', 'file', 'voice'].flatMap(mediaType => ['url', 'base64'].map(mediaSource => ['sendMedia', { mediaType, mediaSource, media: mediaSource === 'url' ? 'https://example.com/synthetic.png' : 'AAECAw==', mimeType: 'image/png', filename: 'example.png' }])),
  ['react', { messageId: '9007199254740993124', reaction: '' }],
];
for (const [action, extra] of sendCases) test(`${action} ${extra.mediaType || ''} ${extra.mediaSource || ''} matches the public request schema`, () => {
  const r = core.buildRequest(action, { ...input, ...extra }, auth, 'test', now);
  const schema = action === 'react' ? 'ReactRequest' : 'SendMessageRequest';
  const validate = ajv.compile({ $ref: `messaging#/components/schemas/${schema}` });
  assert.ok(validate(r.body), JSON.stringify(validate.errors));
});
for (const key of [undefined, '', 'a'.repeat(256), 'é'.repeat(128), 'bad\r\nheader']) test(`invalid write identity is refused before transport: ${String(key).slice(0, 12)}`, async () => {
  let called = false;
  await assert.rejects(core.execute('sendText', { ...input, idempotencyKey: key }, auth, () => { called = true; }, 'test', now));
  assert.equal(called, false);
});
for (const created of [undefined, 'not a date', '2026-10-31T12:00:00Z', '2026-11-01T12:02:00Z']) test(`uncertain age refuses a new write: ${created}`, () => {
  assert.throws(() => core.buildRequest('sendText', { ...input, writeCreatedAt: created }, auth, 'test', now));
});
for (const [method, path] of [
  ['POST', 'https://attacker.example/'], ['GET', '//attacker.example/'], ['GET', '/platform/sessions?projectId=other'],
  ['GET', '/platform/../admin'], ['GET', '/platform/%2e%2e/credentials'], ['GET', '/platform\\sessions'],
  ['GET', '/platform/projects/project/credentials'], ['POST', '/platform/projects/project/webhooks'],
  ['POST', '/platform/functions/invoke'], ['DELETE', '/messaging/number/messages/send'],
]) test(`advanced request refuses ${method} ${path}`, () => assert.throws(() => core.buildRequest('apiRequest', { method, path, requestBody: '{}' }, auth, 'test', now)));
test('advanced allowed read scopes the Number list to the connected project', () => {
  const r = core.buildRequest('apiRequest', { method: 'GET', path: '/platform/sessions' }, auth);
  assert.deepEqual(r.query, { projectId: auth.projectId });
});
test('advanced sends cannot add SDK-only transport fields to the public request', () => {
  assert.throws(() => core.buildRequest('apiRequest', { ...input, method: 'POST', path: '/messaging/739182640518203/messages/send', requestBody: JSON.stringify({ conversation: { id: input.recipient }, content: { text: 'Synthetic' }, transport: 'linked_devices' }) }, auth, 'test', now), e => e.code === 'unsupported_request_field');
});
for (const code of ['idempotency_completed', 'idempotency_in_progress', 'idempotency_conflict', 'idempotency_outcome_unknown', 'feature_unavailable', 'billing_credit_required', 'unsupported_for_connection']) test(`API ${code} is a failure with no fabricated ID or replacement write`, async () => {
  const calls = [];
  await assert.rejects(core.execute('sendText', input, auth, async r => { calls.push(r); return { status: 409, headers: { 'Retry-After': '7' }, body: { error: { code, message: auth.apiKey } } }; }, 'test', now), e => e.code === code && !e.message.includes(auth.apiKey) && e.retryAfter === 7);
  assert.equal(calls.length, 1);
});
test('lost write response does not resend or leak transport details', async () => {
  let sends = 0;
  await assert.rejects(core.execute('sendText', input, auth, async () => { sends++; throw new Error(auth.apiKey); }, 'test', now), e => e.code === 'outcome_unknown' && !e.message.includes(auth.apiKey));
  assert.equal(sends, 1);
});
test('rate limits, redirects and server errors are surfaced without dispatch loops', () => {
  for (const status of [302, 429, 500, 504]) assert.throws(() => core.parseResponse({ status, headers: { 'retry-after': '30' }, body: { error: { code: 'rate_limited' } } }), e => e.status === status && e.retryAfter === 30);
});
test('accepted async response remains an admission receipt', async () => {
  const response = { success: true, data: { requestId: '11111111-1111-4111-8111-111111111111' } };
  assert.deepEqual(await core.execute('sendText', input, auth, async () => ({ status: 202, body: response }), 'test', now), response);
});
for (const p of [
  { mediaSource: 'url', media: 'http://example.com/media' }, { mediaSource: 'url', media: 'https://user:secret@example.com/file' },
  { mediaSource: 'base64', media: 'data:image/png;base64,AA==' }, { mediaSource: 'base64', media: '====' },
  { mediaSource: 'base64', media: Buffer.alloc(core.MAX_MEDIA_BYTES + 1).toString('base64') },
]) test(`invalid media ${p.mediaSource} is refused before a send`, () => assert.throws(() => core.buildRequest('sendMedia', { ...input, mediaType: 'file', ...p }, auth, 'test', now)));
test('public surface excludes unlaunched Functions and message-operation lookups', () => {
  assert.ok(!('runFunction' in actions)); assert.ok(!('getMessageOperation' in actions));
});
module.exports = { auth, input, now };
