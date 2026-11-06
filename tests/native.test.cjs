'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { Polymorfa } = require('../n8n/dist/nodes/Polymorfa/Polymorfa.node.js');
const { PolymorfaTrigger } = require('../n8n/dist/nodes/Polymorfa/PolymorfaTrigger.node.js');
const zapier = require('../zapier');
const hooks = require('../shared/hooks.cjs');
const fake = require('./fake-webhooks.cjs');
const auth = { apiKey: 'synthetic-project-token', projectId: '11111111-1111-4111-8111-111111111111' };
const input = { operation: 'sendText', session: '739182640518203', recipientType: 'id', recipient: '9007199254740993123', text: 'Synthetic', idempotencyKey: 'synthetic-write-1', writeCreatedAt: new Date().toISOString() };
test('compiled n8n node uses native request helpers, preserved input pairing and disabled redirects', async () => {
  const calls = [];
  const context = {
    getCredentials: async () => auth, getInputData: () => [{ json: {} }], getNodeParameter: (key, i, fallback) => input[key] ?? fallback, getNode: () => ({ name: 'test', typeVersion: 1 }),
    helpers: { httpRequest: async request => { calls.push(request); return { statusCode: 200, body: { success: true, data: { id: '9007199254740993124' } }, headers: {} }; } },
  };
  const result = await new Polymorfa().execute.call(context);
  assert.equal(calls.length, 1); assert.equal(calls[0].disableFollowRedirect, true); assert.equal(calls[0].ignoreHttpStatusErrors, true);
  assert.deepEqual(result[0][0].pairedItem, { item: 0 }); assert.equal(result[0][0].json.data.id, '9007199254740993124');
});
test('compiled n8n native binary input maps bytes through the existing base64 request contract', async () => {
  let sent;
  const values = { ...input, operation: 'sendMedia', mediaType: 'file', mediaSource: 'binary', binaryProperty: 'attachment' };
  const context = { getCredentials: async () => auth, getInputData: () => [{ json: {}, binary: { attachment: { mimeType: 'application/octet-stream' } } }], getNodeParameter: (k, i, f) => values[k] ?? f, getNode: () => ({ name: 'test' }), helpers: { getBinaryDataBuffer: async () => Buffer.from([0, 1, 2]), httpRequest: async r => { sent = r; return { statusCode: 200, body: { data: { id: '739182640518204' } } }; } } };
  await new Polymorfa().execute.call(context);
  assert.deepEqual(sent.body.content.file, { base64: 'AAEC', mimeType: 'application/octet-stream' });
});
test('compiled n8n trigger rejects unauthenticated input and keeps event identity on valid input', async () => {
  const marker = hooks.identity(auth, 'messageReceived', 'synthetic-trigger');
  const sample = require('../fixtures/events.json').messageReceived;
  let incoming = {}; let status;
  const context = { getCredentials: async () => auth, getNodeParameter: k => k === 'eventGroup' ? 'messageReceived' : 'synthetic-trigger', getHeaderData: () => incoming, getBodyData: () => sample, getResponseObject: () => ({ status(v) { status = v; return this; }, end() {} }), helpers: { returnJsonArray: value => [{ json: value }] } };
  const trigger = new PolymorfaTrigger();
  assert.deepEqual(await trigger.webhook.call(context), { noWebhookResponse: true }); assert.equal(status, 401);
  incoming = { [marker.name]: marker.value };
  const valid = await trigger.webhook.call(context); assert.equal(valid.workflowData[0][0].json.id, sample.id);
});
test('Zapier native action returns the real API envelope and never follows redirects', async () => {
  let request;
  const z = { request: async r => { request = r; return { status: 202, content: JSON.stringify({ success: true, data: { requestId: '11111111-1111-4111-8111-111111111111' } }), headers: {} }; } };
  const result = await zapier.creates.sendText.operation.perform(z, { authData: auth, inputData: input });
  assert.equal(result.data.requestId, '11111111-1111-4111-8111-111111111111'); assert.equal(request.redirect, 'manual');
});
test('Zapier native hook uses stable event IDs and synthetic setup samples without HMS reads', async () => {
  const marker = hooks.identity(auth, 'messageReceived', 'synthetic-trigger'); const sample = require('../fixtures/events.json').messageReceived;
  const operation = zapier.triggers.messageReceived.operation;
  let requests = 0; const z = { request: () => { requests++; }, errors: { Error } };
  const bundle = { authData: auth, inputData: { subscriptionKey: 'synthetic-trigger' }, cleanedRequest: { headers: { [marker.name]: marker.value }, content: sample } };
  assert.deepEqual(await operation.perform(z, bundle), [sample]);
  assert.equal((await operation.performList(z, bundle))[0].id, sample.id); assert.equal(requests, 0);
  await assert.rejects(operation.perform(z, { ...bundle, cleanedRequest: { headers: {}, content: sample } }));
});

test('n8n continue-on-fail retains successful write results and continues later items', async () => {
  let requests = 0;
  const items = [{ json: {} }, { json: {} }, { json: {} }];
  const context = { getCredentials: async () => auth, getInputData: () => items, continueOnFail: () => true,
    getNodeParameter: (key, i, fallback) => key === 'recipient' && i === 1 ? 'invalid-conversation-id' : input[key] ?? fallback,
    getNode: () => ({ name: 'test', typeVersion: 1 }),
    helpers: { httpRequest: async () => ({ statusCode: 200, headers: {}, body: { data: { id: String(++requests) } } }) } };
  const [result] = await new Polymorfa().execute.call(context);
  assert.equal(requests, 2); assert.equal(result.length, 3);
  assert.equal(result[0].json.data.id, '1'); assert.equal(result[2].json.data.id, '2');
  assert.match(result[1].json.error, /invalid_conversation_id/); assert.deepEqual(result[1].pairedItem, { item: 1 });
  context.continueOnFail = () => false;
  await assert.rejects(new Polymorfa().execute.call(context));
});

test('Zapier consumes native Headers and requires write identity in its editor', async () => {
  const z = { request: async () => ({ status: 429, headers: new Headers({ 'Retry-After': '12', 'X-Request-ID': 'safe-request' }), content: '{}' }) };
  await assert.rejects(zapier.creates.sendText.operation.perform(z, { authData: auth, inputData: input }), e => e.retryAfter === 12 && e.requestId === 'safe-request');
  for (const key of ['sendText', 'sendTemplate', 'sendMedia', 'react']) for (const name of ['idempotencyKey', 'writeCreatedAt']) {
    assert.equal(zapier.creates[key].operation.inputFields.find(f => f.key === name).required, true);
  }
  assert.equal(zapier.creates.apiRequest.operation.inputFields.find(f => f.key === 'idempotencyKey').required, false);
});

test('Zapier routes real throttling middleware through shared parsing and its native retry error', async () => {
  const middleware = require('zapier-platform-core/src/http-middlewares/after/throw-for-throttling');
  const errors = require('zapier-platform-core/src/errors');
  const response = request => ({ request, status: 429, headers: new Headers({ 'Retry-After': '12' }), content: '{"error":{"code":"rate_limited"}}' });
  assert.throws(() => middleware(response({})), e => e.name === 'ThrottledError');
  const z = { errors, request: async request => middleware(response(request)) };
  for (const [action, inputData] of [['sendText', input], ['listNumbers', {}]]) {
    await assert.rejects(zapier.creates[action].operation.perform(z, { authData: auth, inputData }), e => e.name === 'ThrottledError' && JSON.parse(e.message).delay === 12 && JSON.parse(e.message).message.includes('rate_limited'));
  }
});

test('Zapier editor permits removal and sends an explicit empty reaction when the field is omitted', async () => {
  assert.equal(zapier.creates.react.operation.inputFields.find(f => f.key === 'reaction').required, false);
  let body;
  await zapier.creates.react.operation.perform({ request: async r => { body = r.body; return { status: 200, content: '{"data":{}}', headers: {} }; } }, { authData: auth, inputData: { ...input, messageId: '739182640518205' } });
  assert.equal(body.reaction, '');
  for (const trigger of Object.values(zapier.triggers)) assert.deepEqual(trigger.operation.inputFields.map(f => f.key), ['subscriptionKey']);
});

function n8nHookContext(s, staticData, params) {
  return { getCredentials: async () => fake.auth, getNodeWebhookUrl: () => params.url, getNodeParameter: k => params[k], getWorkflowStaticData: () => staticData,
    helpers: { httpRequest: async r => { const res = await s.request({ method: r.method, url: r.url, headers: r.headers, query: r.qs, body: r.body }); return { statusCode: res.status, headers: res.headers, body: res.body }; } } };
}
test('compiled n8n trigger survives test listen, activation, deactivation and reactivation', async () => {
  const s = fake.server(); const staticData = {}; const methods = new PolymorfaTrigger().webhookMethods.default;
  const params = { eventGroup: 'messageReceived', subscriptionKey: 'synthetic-trigger', url: 'https://n8n.example/webhook-test/abc/webhook' };
  const run = async () => {
    const context = n8nHookContext(s, staticData, params);
    if (!(await methods.checkExists.call(context))) await methods.create.call(context);
    assert.equal(staticData.pendingCreation, undefined); assert.equal(s.rows.length, 1); assert.equal(staticData.subscription.id, s.rows[0].id);
    await methods.delete.call(context); assert.equal(s.rows.length, 0); assert.equal(staticData.subscription, undefined);
  };
  await run(); await run();
  params.url = 'https://n8n.example/webhook/abc/webhook';
  await run(); await run();
  assert.equal(s.posts().length, 4); assert.equal(new Set(s.posts().map(r => r.headers['Idempotency-Key'])).size, 4);
  assert.deepEqual(new PolymorfaTrigger().description.properties.map(p => p.name), ['eventGroup', 'subscriptionKey', 'scopeNotice']);
});
test('compiled n8n trigger keeps an uncertain activation nonce in node static data for its retry', async () => {
  const s = fake.server(); const staticData = {}; const methods = new PolymorfaTrigger().webhookMethods.default;
  const context = n8nHookContext(s, staticData, { eventGroup: 'messageReceived', subscriptionKey: 'synthetic-trigger', url: 'https://n8n.example/webhook/abc/webhook' });
  s.loseNextCreate(); s.hideNewest(2);
  await assert.rejects(methods.create.call(context), e => e.code === 'subscription_requires_reconciliation');
  assert.ok(staticData.pendingCreation.nonce); s.hideNewest(1);
  await methods.create.call(context);
  assert.equal(s.rows.length, 1); assert.equal(s.posts()[0].headers['Idempotency-Key'], s.posts()[1].headers['Idempotency-Key']);
  assert.equal(staticData.pendingCreation, undefined);
});

function zapierZ(s) {
  return { request: async r => { const res = await s.request({ method: r.method, url: r.url, headers: r.headers, query: r.params, body: r.body }); return { status: res.status, headers: res.headers, content: JSON.stringify(res.body) }; }, errors: { Error } };
}
test('Zapier REST hook turns off and on again with a fresh activation each time', async () => {
  const s = fake.server(); const z = zapierZ(s); const operation = zapier.triggers.messageReceived.operation;
  const bundle = () => ({ authData: { ...fake.auth }, inputData: { subscriptionKey: 'synthetic-trigger' }, targetUrl: 'https://hooks.zapier.com/hooks/standard/1/abc/' });
  for (let i = 0; i < 3; i++) {
    const subscribeData = await operation.performSubscribe(z, bundle());
    assert.equal(s.rows.length, 1); assert.equal(subscribeData.id, s.rows[0].id);
    assert.ok(!JSON.stringify(subscribeData).includes('SYNTHETIC-ONE-TIME-SIGNING-SECRET'));
    await operation.performUnsubscribe(z, { ...bundle(), subscribeData }); assert.equal(s.rows.length, 0);
  }
  assert.equal(new Set(s.posts().map(r => r.headers['Idempotency-Key'])).size, 3);
});
test('Zapier accepts the documented rawRequest shape with Http- prefixed Camel-Case headers', async () => {
  const marker = hooks.identity(auth, 'messageReceived', 'synthetic-trigger'); const sample = require('../fixtures/events.json').messageReceived;
  const operation = zapier.triggers.messageReceived.operation; const z = { errors: { Error } };
  // Zapier docs (Bundle object, bundle.rawRequest): headers other than Content-Length and Content-Type
  // are prefixed with Http- and written in Camel-Case, for example X-Time-GMT becomes Http-X-Time-Gmt.
  const camel = ('Http-' + marker.name).split('-').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('-');
  const rawRequest = { method: 'POST', querystring: '', headers: { 'Content-Type': 'application/json', [camel]: marker.value, 'Http-User-Agent': 'polymorfa-webhooks' }, content: JSON.stringify(sample) };
  const bundle = { authData: auth, inputData: { subscriptionKey: 'synthetic-trigger' }, rawRequest, cleanedRequest: sample };
  assert.deepEqual(await operation.perform(z, bundle), [sample]);
  await assert.rejects(operation.perform(z, { ...bundle, rawRequest: { ...rawRequest, headers: { 'Content-Type': 'application/json' } } }));
  await assert.rejects(operation.perform(z, { ...bundle, rawRequest: { ...rawRequest, headers: { [camel]: marker.value, [marker.name]: marker.value } } }), 'one marker header only');
  await assert.rejects(operation.perform(z, { ...bundle, rawRequest: { ...rawRequest, headers: { [camel]: '0'.repeat(64) } } }));
});
