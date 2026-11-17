'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const core = require('../shared/core.cjs');
const hooks = require('../shared/hooks.cjs');
const { auth, server } = require('./fake-webhooks.cjs');

test('Connection selectors can start with an underscore, hyphen or non-traversal dot', () => {
  const input = { recipientType: 'id', recipient: '739182640518204', text: 'Synthetic', idempotencyKey: 'synthetic-write', writeCreatedAt: new Date().toISOString() };
  for (const connection of ['_tenant', '-tenant', '.tenant']) {
    assert.equal(core.buildRequest('sendText', { ...input, connection }, auth).url, `https://api.polymorfa.com/messaging/${connection}/messages/send`);
    assert.equal(core.buildRequest('apiRequest', { ...input, method: 'POST', path: `/messaging/${connection}/messages/send`, requestBody: { content: { text: 'Synthetic' } } }, auth).url, `https://api.polymorfa.com/messaging/${connection}/messages/send`);
  }
  for (const connection of ['.', '..', 'sales/eu', 'sales%2Feu', 'sales\\eu', 'a'.repeat(65)]) assert.throws(() => core.connectionSegment(connection));
});

test('an expired pending create recovers the proven live webhook without another POST', async () => {
  const s = server(); let pending;
  const store = { get: () => pending, set: value => { pending = value; } };
  const url = 'https://example.com/synthetic';
  s.loseNextCreate(); s.hideNewest(2);
  await assert.rejects(hooks.activate(auth, url, 'messageReceived', 'source-1', s.transport, 'test', store), e => e.code === 'subscription_requires_reconciliation');
  pending.startedAt = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const originalNonce = pending.nonce;
  const owned = await hooks.activate(auth, url, 'messageReceived', 'source-1', s.transport, 'test', store);
  assert.equal(owned.id, s.rows[0].id); assert.equal(s.posts().length, 1); assert.equal(pending, null);
  assert.ok(originalNonce);
  await hooks.unsubscribe(auth, owned.id, owned.url, owned.group, owned.subscriptionKey, s.transport, 'test', owned.markerName);
  assert.equal(s.rows.length, 0);
});

test('an expired pending create with no proven live webhook stays closed after its read-only lookup', async () => {
  const s = server(); const pending = { nonce: '11111111-1111-4111-8111-111111111111', group: 'messageReceived', url: 'https://example.com/synthetic', subscriptionKey: 'source-1', startedAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString() };
  const before = JSON.stringify(pending);
  await assert.rejects(hooks.activate(auth, pending.url, pending.group, pending.subscriptionKey, s.transport, 'test', { get: () => pending, set: () => assert.fail('must preserve unresolved receipt') }), e => e.code === 'subscription_requires_reconciliation');
  assert.equal(s.posts().length, 0); assert.equal(s.calls.length, 1); assert.equal(s.calls[0].method, 'GET'); assert.equal(JSON.stringify(pending), before);
});

test('retained Number-state cleanup uses the exact stored marker after token rotation', async () => {
  const s = server(); const key = 'source-1'; const url = 'https://example.com/synthetic';
  const scope = JSON.stringify(['polymorfa-webhook-v1', auth.projectId, 'numberState', key]);
  const marker = 'X-Polymorfa-Integration-Token-' + createHmac('sha256', 'synthetic-previous-token').update('marker:' + scope).digest('hex').slice(0, 24);
  const row = { id: 'retained', owner: 'project', projectId: auth.projectId, url, enabled: false, format: 'native', headers: [{ name: marker }], eventTypes: ['session.status', 'session.connected', 'session.logged_out'] };
  s.rows.push(row);
  for (const invalid of [undefined, '', 'X-Other', marker.slice(0, -1) + (marker.endsWith('0') ? '1' : '0')]) await assert.rejects(hooks.unsubscribe(auth, row.id, url, 'numberState', key, s.transport, 'test', invalid), e => e.code === 'subscription_ownership_mismatch');
  assert.equal(s.rows.length, 1);
  await hooks.unsubscribe(auth, row.id, url, 'numberState', key, s.transport, 'test', marker);
  assert.equal(s.rows.length, 0); assert.equal(s.posts().length, 0);
});
