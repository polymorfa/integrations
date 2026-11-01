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
