'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHmac } = require('node:crypto');
const vm = require('node:vm');
const core = require('../shared/core.cjs');
const hooks = require('../shared/hooks.cjs');
const { auth, server } = require('./fake-webhooks.cjs');
const now = Date.parse('2026-11-01T12:00:00Z');
const input = { connection: 'sales.eu', recipientType: 'id', recipient: '739182640518204', text: 'Synthetic', idempotencyKey: 'synthetic-write', writeCreatedAt: new Date(now - 54 * 60_000).toISOString() };
function field(items, ...path) {
  let result;
  for (const name of path) {
    result = items.find(item => item.name === name);
    assert.ok(result, `missing Make output ${path.join('.')}`);
    items = result.type === 'array' ? result.spec?.spec : result.spec;
  }
  return result;
}
test('messaging retries stop before the API one-hour receipt expires', () => {
  core.buildRequest('sendText', { ...input, connection: 'support' }, auth, 'test', now);
  for (const minutes of [55, 60, 120]) assert.throws(() => core.buildRequest('sendText', { ...input, connection: 'support', writeCreatedAt: new Date(now - minutes * 60_000).toISOString() }, auth, 'test', now), e => e.code === 'write_requires_reconciliation');
});
test('only Connection selectors accept the canonical dotted name and 64-character boundary', () => {
  for (const connection of ['sales.eu', 'a', 'a'.repeat(64)]) {
    assert.ok(core.buildRequest('sendText', { ...input, connection }, auth, 'test', now).url.endsWith(`/messaging/${connection}/messages/send`));
    assert.ok(core.buildRequest('apiRequest', { ...input, method: 'POST', path: `/messaging/${connection}/messages/send`, requestBody: { content: { text: 'Synthetic' } } }, auth, 'test', now));
  }
  for (const connection of ['.', '..', 'a'.repeat(65), 'sales/eu', 'sales%2Feu', 'sales\\eu']) assert.throws(() => core.buildRequest('sendText', { ...input, connection }, auth, 'test', now));
  assert.throws(() => core.buildRequest('listConnections', {}, { ...auth, projectId: 'project.eu' }));
});
test('Make mapping exposes only the projected envelope and includes nested native message outputs', () => {
  for (const name of ['messageReceived', 'messageState', 'connectionState', 'callEnded']) {
    const items = JSON.parse(readFileSync(`make/modules/${name}/interface.json`));
    assert.deepEqual(items.map(item => item.name).sort(), ['connection', 'event', 'externalId', 'id', 'payload', 'timestamp']);
  }
  const received = JSON.parse(readFileSync('make/modules/messageReceived/interface.json'));
  for (const key of ['fileName', 'stickerType']) field(received, 'payload', 'stickerPack', 'items', key);
  const sent = JSON.parse(readFileSync('make/modules/sendText/interface.json'));
  field(sent, 'data', 'content', 'buttons', 'media');
  field(sent, 'data', 'content', 'stickerPack', 'items', 'fileName');
});
test('Make uses the same dotted Connection validation and bounded retry policy', () => {
  const iml = {};
  for (const name of ['polymorfaBody', 'polymorfaAdvanced', 'polymorfaRequest']) iml[name] = vm.runInNewContext(`(${readFileSync(`make/functions/${name}.js`, 'utf8')})`, { Buffer, iml });
  const p = { ...input, writeCreatedAt: new Date(Date.now() - 54 * 60_000).toISOString() };
  assert.equal(iml.polymorfaRequest('sendText', p, auth).url, 'https://api.polymorfa.com/messaging/sales.eu/messages/send');
  assert.throws(() => iml.polymorfaRequest('sendText', { ...p, writeCreatedAt: new Date(Date.now() - 60 * 60_000).toISOString() }, auth), e => e.code === 'write_requires_reconciliation');
});
test('retained Number trigger receipts can only remove their exact owned legacy webhook', async () => {
  const s = server(); const url = 'https://example.com/synthetic'; const key = 'source-1';
  const scope = JSON.stringify(['polymorfa-webhook-v1', auth.projectId, 'numberState', key]);
  const marker = 'X-Polymorfa-Integration-Token-' + createHmac('sha256', auth.apiKey).update('marker:' + scope).digest('hex').slice(0, 24);
  const owned = { id: 'retained', owner: 'project', projectId: auth.projectId, url, enabled: false, format: 'native', headers: [{ name: marker }], eventTypes: ['session.status', 'session.connected', 'session.logged_out'] };
  s.rows.push(owned);
  await assert.rejects(hooks.unsubscribe(auth, owned.id, url, 'numberState', key, s.transport, 'test', marker.slice(0, -1) + (marker.endsWith('0') ? '1' : '0')), e => e.code === 'subscription_ownership_mismatch');
  assert.equal(s.rows.length, 1);
  await hooks.unsubscribe(auth, owned.id, url, 'numberState', key, s.transport, 'test', marker);
  assert.equal(s.rows.length, 0);
  assert.throws(() => hooks.identity(auth, 'numberState', key), e => e.code === 'invalid_event_group');
});
test('Pipedream preserves unresolved legacy activation state when deactivation cannot prove an owned ID', async () => {
  const { default: source } = await import('../pipedream/sources/connectionState/connectionState.mjs');
  const pending = { nonce: '11111111-1111-4111-8111-111111111111', group: 'numberState', url: 'https://example.com/synthetic', subscriptionKey: 'source-1' };
  const values = new Map([['pendingCreation', pending]]);
  const context = { db: { get: key => values.get(key), set: (key, value) => values.set(key, value) }, polymorfa: { unsubscribe: () => { throw new Error('must not dispatch'); } } };
  await assert.rejects(source.hooks.deactivate.call(context), e => e.code === 'subscription_requires_reconciliation');
  assert.deepEqual(values.get('pendingCreation'), pending);
  const store = { get: () => pending, set: () => { throw new Error('must not replace uncertain nonce'); } };
  await assert.rejects(hooks.activate(auth, pending.url, 'connectionState', pending.subscriptionKey, () => { throw new Error('must not dispatch'); }, 'test', store), e => e.code === 'subscription_requires_reconciliation');
});

test('unknown webhook activation age preserves its original identity without dispatch', async () => {
  for (const startedAt of [undefined, 'invalid']) {
    const pending = { nonce: '11111111-1111-4111-8111-111111111111', group: 'messageReceived', url: 'https://example.com/synthetic', subscriptionKey: 'source-1', startedAt };
    const before = JSON.stringify(pending);
    let called = false;
    await assert.rejects(hooks.activate(auth, pending.url, pending.group, pending.subscriptionKey, () => { called = true; }, 'test', { get: () => pending, set: () => { throw new Error('must preserve pending'); } }), e => e.code === 'subscription_requires_reconciliation');
    assert.equal(called, false); assert.equal(JSON.stringify(pending), before);
  }
});
