import { test } from 'node:test'; import assert from 'node:assert/strict';
import action from '../pipedream/actions/sendText/sendText.mjs';
import source from '../pipedream/sources/messageReceived/messageReceived.mjs';
import hooks from '../shared/hooks.cjs';
import { readFileSync } from 'node:fs';
test('Pipedream action passes exact fields to the app request boundary', async () => {
  const input = { session: '739182640518203', recipientType: 'id', recipient: '9007199254740993123', text: 'Synthetic', quotedMessageId: undefined, idempotencyKey: 'write-1', writeCreatedAt: '2026-11-01T12:00:00Z' };
  let call;
  const result = await action.run.call({ ...input, polymorfa: { execute: async ($, key, values) => { call = { key, values }; return { data: { id: '739182640518204' } }; } } }, { $: {} });
  assert.deepEqual(call, { key: 'sendText', values: input }); assert.equal(result.data.id, '739182640518204');
});
test('Pipedream source rejects forgery and emits only the defined envelope with dedupe identity', async () => {
  const auth = { apiKey: 'synthetic-token', projectId: '11111111-1111-4111-8111-111111111111' }; const key = 'source-1';
  const marker = hooks.identity(auth, 'messageReceived', key); const sample = JSON.parse(readFileSync('fixtures/events.json')).messageReceived;
  const emitted = []; const responses = [];
  const context = { subscriptionKey: key, polymorfa: { authenticate: (g, k, h) => hooks.authenticate(auth, g, k, h), envelope: hooks.envelope }, http: { respond: value => responses.push(value) }, $emit: (data, metadata) => emitted.push({ data, metadata }) };
  await source.run.call(context, { headers: {}, body: sample }); assert.equal(responses.at(-1).status, 401); assert.equal(emitted.length, 0);
  await source.run.call(context, { headers: { [marker.name]: marker.value }, body: sample });
  assert.deepEqual(emitted[0].data, sample); assert.equal(emitted[0].metadata.id, sample.id); assert.equal(source.dedupe, 'unique');
});

import app from '../pipedream/polymorfa.app.mjs';
import fake from './fake-webhooks.cjs';
import { readdirSync } from 'node:fs';
function pipedreamApp(s) {
  return { ...app.methods, $auth: { api_key: fake.auth.apiKey, project_id: fake.auth.projectId }, transport: () => s.transport };
}
function serviceDb() { const values = new Map(); return { values, get: k => values.get(k), set: (k, v) => values.set(k, v) }; }
test('Pipedream source deactivates and reactivates with a fresh creation nonce in $.service.db', async () => {
  const s = fake.server(); const db = serviceDb();
  const context = { polymorfa: pipedreamApp(s), db, http: { endpoint: 'https://synthetic.m.pipedream.net' }, subscriptionKey: 'source-1' };
  for (let i = 0; i < 3; i++) {
    await source.hooks.activate.call(context);
    assert.equal(s.rows.length, 1); assert.equal(db.get('ownedSubscription').id, s.rows[0].id); assert.equal(db.get('pendingCreation'), null);
    await source.hooks.deactivate.call(context);
    assert.equal(s.rows.length, 0); assert.equal(db.get('ownedSubscription'), null);
  }
  assert.equal(new Set(s.posts().map(r => r.headers['Idempotency-Key'])).size, 3);
});
test('Pipedream retries an uncertain activation with the nonce saved in $.service.db', async () => {
  const s = fake.server(); const db = serviceDb();
  const context = { polymorfa: pipedreamApp(s), db, http: { endpoint: 'https://synthetic.m.pipedream.net' }, subscriptionKey: 'source-1' };
  s.loseNextCreate(); s.hideNewest(2);
  await assert.rejects(source.hooks.activate.call(context), e => e.code === 'subscription_requires_reconciliation');
  assert.ok(db.get('pendingCreation').nonce); s.hideNewest(1);
  await source.hooks.activate.call(context);
  assert.equal(s.rows.length, 1); assert.equal(s.posts()[0].headers['Idempotency-Key'], s.posts()[1].headers['Idempotency-Key']);
});
test('Pipedream sources expose no webhook creation key prop', async () => {
  for (const name of readdirSync('pipedream/sources')) {
    const { default: component } = await import(`../pipedream/sources/${name}/${name}.mjs`);
    assert.deepEqual(Object.keys(component.props).sort(), ['db', 'http', 'polymorfa', 'subscriptionKey']);
  }
});
