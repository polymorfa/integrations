'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { Polymorfa } = require('../n8n/dist/nodes/Polymorfa/Polymorfa.node.js');
const { PolymorfaTrigger } = require('../n8n/dist/nodes/Polymorfa/PolymorfaTrigger.node.js');
const zapier = require('../zapier');
const hooks = require('../shared/hooks.cjs');
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
