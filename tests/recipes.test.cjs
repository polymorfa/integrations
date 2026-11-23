'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const recipe = require('../recipes/n8n/order-notification.json');

test('order notification rejects an absent business identity before the send node', () => {
  const validate = recipe.nodes.find(n => n.id === 'validate-order');
  assert.equal(recipe.connections['Replace with authorized order trigger'].main[0][0].node, validate.name);
  assert.equal(recipe.connections[validate.name].main[0][0].node, 'Send order notification');
  const run = item => vm.runInNewContext(`(function () { ${validate.parameters.jsCode} })()`, { $input: { all: () => [{ json: item }] } });
  for (const notificationId of [undefined, null, '', '  ', 0]) assert.throws(() => run({ notificationId }));
  assert.equal(run({ notificationId: 'saved-order-1' })[0].json.notificationId, 'saved-order-1');
});

const { PolymorfaTrigger } = require('../n8n/dist/nodes/Polymorfa/PolymorfaTrigger.node.js');
const fake = require('./fake-webhooks.cjs');
test('inbound handoff trigger parameters satisfy the node description and activate as imported', async () => {
  const inbound = require('../recipes/n8n/inbound-handoff.json');
  const node = inbound.nodes.find(n => n.type === 'n8n-nodes-polymorfa.polymorfaTrigger');
  const description = new PolymorfaTrigger().description;
  const names = description.properties.map(p => p.name);
  for (const name of Object.keys(node.parameters)) assert.ok(names.includes(name), `unknown parameter ${name}`);
  for (const p of description.properties.filter(p => p.required)) assert.ok(typeof node.parameters[p.name] === 'string' && node.parameters[p.name].trim(), `missing ${p.name}`);
  // Evaluate the recipe's n8n expression the way n8n resolves it for this workflow.
  const evaluate = value => value.startsWith('={{') ? vm.runInNewContext(value.slice(3, -2), { $workflow: { id: 'synthetic-workflow-17' } }) : value;
  const params = Object.fromEntries(Object.entries(node.parameters).map(([k, v]) => [k, evaluate(v)]));
  assert.equal(params.subscriptionKey, 'inbound-handoff-synthetic-workflow-17');
  const s = fake.server(); const staticData = {}; const methods = new PolymorfaTrigger().webhookMethods.default;
  const context = { getCredentials: async () => fake.auth, getNodeWebhookUrl: () => 'https://n8n.example/webhook/inbound/webhook', getNodeParameter: k => params[k], getWorkflowStaticData: () => staticData,
    helpers: { httpRequest: async r => { const res = await s.request({ method: r.method, url: r.url, headers: r.headers, query: r.qs, body: r.body }); return { statusCode: res.status, headers: res.headers, body: res.body }; } } };
  assert.equal(await methods.checkExists.call(context), false);
  await methods.create.call(context);
  assert.equal(s.rows.length, 1); assert.equal(staticData.subscription.subscriptionKey, params.subscriptionKey);
});

test('the imported order recipe uses supported action fields and sends its stable Connection selector', async () => {
  const { Polymorfa } = require('../n8n/dist/nodes/Polymorfa/Polymorfa.node.js');
  const send = recipe.nodes.find(n => n.type === 'n8n-nodes-polymorfa.polymorfa');
  const description = new Polymorfa().description;
  const names = description.properties.map(p => p.name);
  for (const name of Object.keys(send.parameters)) assert.ok(names.includes(name), `unknown action parameter ${name}`);
  const order = { connectionId: 'stable-session-id', notificationId: 'saved-order-1', notificationStartedAt: new Date().toISOString(), recipient: '+14155550123', notificationText: 'Synthetic order update' };
  const validate = recipe.nodes.find(n => n.id === 'validate-order');
  const [validated] = vm.runInNewContext(`(function () { ${validate.parameters.jsCode} })()`, { $input: { all: () => [{ json: order }] } });
  const evaluate = value => typeof value === 'string' && value.startsWith('={{') ? vm.runInNewContext(value.slice(3, -2), { $json: validated.json }) : value;
  const params = Object.fromEntries(Object.entries(send.parameters).map(([k, v]) => [k, evaluate(v)]));
  const calls = [];
  const context = { getCredentials: async () => fake.auth, getInputData: () => [validated], getNodeParameter: (k, i, fallback) => params[k] ?? fallback, getNode: () => ({ name: send.name }), helpers: { httpRequest: async request => { calls.push(request); return { statusCode: 200, body: { success: true, data: { id: '739182640518204' } }, headers: {} }; } } };
  await new Polymorfa().execute.call(context);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/messaging/stable-session-id/messages/send');
  assert.equal(calls[0].headers['Idempotency-Key'], params.idempotencyKey);
  assert.deepEqual(calls[0].body.conversation, { phoneNumber: order.recipient });
  assert.equal(params.writeCreatedAt, order.notificationStartedAt);
});
