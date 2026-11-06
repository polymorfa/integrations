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
  const n1 = iml.polymorfaCreationNonce('https://hook.make.com/synthetic'); const n2 = iml.polymorfaCreationNonce('https://hook.make.com/synthetic');
  assert.match(n1, /^[a-f0-9]{64}$/); assert.notEqual(n1, n2);
  const first = iml.polymorfaCreateKey(marker.key, n1);
  assert.notEqual(first, iml.polymorfaCreateKey(marker.key, n2)); assert.ok(!first.includes(marker.value));
  assert.equal(first, hooks.creationKey(marker.key, n1));
  assert.equal(first, iml.polymorfaCreateKey(marker.key, n1));
  for (const bad of ['', 'short', undefined, 'x'.repeat(129)]) assert.throws(() => iml.polymorfaCreateKey(marker.key, bad));
  const base = JSON.parse(readFileSync('make/base.json'));
  for (const path of ['request.headers.idempotency-key', 'request.body.headers', 'response.body.data.idempotency.key']) assert.ok(base.log.sanitize.includes(path));
});

test('Make verifies live creation receipts and maps the optional public QuickLink reference', () => {
  const marker = iml.polymorfaHook(auth, 'numberState', 'key');
  const row = { id: 'owned', projectId: auth.projectId, owner: 'project', url: 'https://example.com/', enabled: true, format: 'native', headers: [{ name: marker.name }], eventTypes: ['session.status', 'session.connected', 'session.logged_out'] };
  const args = [auth, row.url, 'numberState', 'key', 'owned'];
  assert.equal(iml.polymorfaLiveHook({ data: [row], page: { hasMore: false } }, ...args), 'owned');
  assert.throws(() => iml.polymorfaLiveHook({ data: [], page: { hasMore: false } }, ...args));
  assert.throws(() => iml.polymorfaLiveHook({ data: [{ ...row, id: 'different' }], page: { hasMore: false } }, ...args));
  const sample = { ...require('../fixtures/events.json').numberState, externalId: 'synthetic-order-reference', transportSecret: 'must-not-escape' };
  assert.deepEqual(JSON.parse(JSON.stringify(iml.polymorfaEnvelope(sample, 'numberState'))), hooks.envelope(sample, 'numberState'));
  const attach = JSON.parse(readFileSync('make/webhooks/numberState/attach.json'));
  assert.ok(attach[0].response.temp.nonce.includes('polymorfaCreationNonce(webhook.url)'));
  assert.ok(attach[1].headers['Idempotency-Key'].includes('temp.nonce'));
  assert.ok(!JSON.stringify(attach).includes('registrationKey'));
  assert.ok(attach[2].response.data.externalHookId.includes('polymorfaLiveHook'));
  assert.equal(JSON.parse(readFileSync('make/modules/react/parameters.json')).find(p => p.name === 'reaction').required, false);
});

test('Make detach reads the recorded webhook by ID and deletes it only when owned', () => {
  const marker = iml.polymorfaHook(auth, 'messageReceived', 'key');
  const row = { id: 'owned', owner: 'project', projectId: auth.projectId, url: 'https://EXAMPLE.COM:443', format: 'native', headers: [{ name: marker.name }], eventTypes: ['message.received'] };
  const args = ['owned', auth.projectId, 'https://example.com/', marker.name, 'messageReceived'];
  assert.equal(iml.polymorfaDetachHook(404, { error: { code: 'not_found' } }, ...args), false);
  assert.equal(iml.polymorfaDetachHook(200, { data: row }, ...args), true);
  assert.throws(() => iml.polymorfaDetachHook(200, { data: { ...row, id: 'different' } }, ...args));
  assert.throws(() => iml.polymorfaDetachHook(200, { data: { ...row, projectId: 'other-project' } }, ...args));
  assert.throws(() => iml.polymorfaDetachHook(200, { data: { ...row, url: 'https://user:pw@example.com/' } }, ...args), /ownership mismatch/);
  assert.throws(() => iml.polymorfaDetachHook(503, { error: { code: 'unavailable' } }, ...args), /unavailable/);
  for (const name of readdirSync('make/webhooks')) {
    const detach = JSON.parse(readFileSync(`make/webhooks/${name}/detach.json`));
    assert.equal(detach[0].method, 'GET'); assert.ok(detach[0].url.endsWith('/webhooks/{{polymorfaSegment(webhook.externalHookId)}}'));
    assert.equal(detach[0].qs, undefined); assert.ok(detach[0].response.valid.includes('polymorfaDetachHook(statusCode; body;'));
    assert.equal(detach[1].condition, '{{temp.ownedPresent}}'); assert.equal(detach[1].method, 'DELETE');
    assert.deepEqual(JSON.parse(readFileSync(`make/webhooks/${name}/parameters.json`)).map(p => p.name), ['subscriptionKey']);
  }
});

test('Make hook lookup matches shared find over the same inventories, including unusual URLs', async () => {
  const marker = hooks.identity(auth, 'messageReceived', 'key');
  const own = { id: 'owned', owner: 'project', projectId: auth.projectId, url: 'https://example.com/', enabled: true, format: 'native', headers: [{ name: marker.name }], eventTypes: ['message.received'] };
  const other = url => ({ id: 'other-' + url, owner: 'project', projectId: auth.projectId, url, enabled: true, format: 'native', headers: [{ name: 'X-Other' }], eventTypes: ['message.received'] });
  const unusual = ['https://user:pw@crm.example.com/hook', 'https://crm.example.com/hook#frag', 'http://crm.example.com/hook', 'https://crm.example.com/a b', 'not a url', '', 'https://crm.example.com/\\x'];
  const inventories = [[], [own], ...unusual.map(u => [other(u)]), ...unusual.map(u => [other(u), own]), [own, { ...own, id: 'dup' }], [{ ...own, enabled: false }], [{ ...own, url: 'https://elsewhere.example/' }]];
  for (const data of inventories) {
    let core, make;
    try { core = { id: (await hooks.find(auth, own.url, 'messageReceived', 'key', async () => ({ status: 200, body: { data, page: { hasMore: false } } }), 'test'))?.id || null }; } catch (e) { core = { error: true }; }
    try { make = { id: iml.polymorfaFindHook({ data, page: { hasMore: false } }, auth, own.url, 'messageReceived', 'key') }; } catch (e) { make = { error: true }; }
    assert.deepEqual(make, core, JSON.stringify(data.map(h => h.url)));
  }
});

test('Make attach and detach steps turn a webhook off and on again without a duplicate', async () => {
  const { server } = require('./fake-webhooks.cjs'); const s = server(auth);
  const hookUrl = 'https://hook.eu1.make.com/synthetic';
  const base = 'https://api.polymorfa.com/platform/projects/' + auth.projectId + '/webhooks';
  const headers = extra => ({ Authorization: 'Bearer ' + auth.apiKey, ...extra });
  const attach = async () => {
    const list = (await s.request({ method: 'GET', url: base, headers: headers() })).body;
    const temp = { ownedId: iml.polymorfaFindHook(list, auth, hookUrl, 'messageReceived', 'key'), nonce: iml.polymorfaCreationNonce(hookUrl) };
    const marker = iml.polymorfaHook(auth, 'messageReceived', 'key');
    if (!temp.ownedId) {
      const created = await s.request({ method: 'POST', url: base, headers: headers({ 'Idempotency-Key': iml.polymorfaCreateKey(marker.key, temp.nonce) }), body: { url: hookUrl, eventTypes: ['message.received'], format: 'native', enabled: true, headers: [{ name: marker.name, value: marker.value }] } });
      temp.createdId = created.body.data.webhook.id;
    }
    const live = (await s.request({ method: 'GET', url: base, headers: headers() })).body;
    return { externalHookId: iml.polymorfaLiveHook(live, auth, hookUrl, 'messageReceived', 'key', temp.ownedId || temp.createdId), ownedUrl: hookUrl, receiverName: marker.name };
  };
  const detach = async webhook => {
    const r = await s.request({ method: 'GET', url: base + '/' + webhook.externalHookId, headers: headers() });
    if (iml.polymorfaDetachHook(r.status, r.body, webhook.externalHookId, auth.projectId, webhook.ownedUrl, webhook.receiverName, 'messageReceived')) await s.request({ method: 'DELETE', url: base + '/' + webhook.externalHookId, headers: headers() });
  };
  for (let i = 0; i < 3; i++) {
    const webhook = await attach(); assert.equal(s.rows.length, 1); assert.equal(webhook.externalHookId, s.rows[0].id);
    await detach(webhook); assert.equal(s.rows.length, 0);
    await detach(webhook);
  }
  assert.equal(new Set(s.posts().map(r => r.headers['Idempotency-Key'])).size, 3);
});

test('Make non-2xx error handlers retain recovery and rate-limit guidance without response secrets', () => {
  assert.match(iml.polymorfaError(409, {}, { error: { code: 'idempotency_completed', message: auth.apiKey } }), /Recover its original result/);
  assert.match(iml.polymorfaError(429, { 'retry-after': '19' }, { error: { code: 'rate_limited' } }), /19 seconds/);
  assert.match(iml.polymorfaError(502, {}, '<html>gateway error</html>'), /Reconcile/);
  assert.match(iml.polymorfaError(503, {}, { error: { code: 'internal_error' } }, 'POST'), /Reconcile the original write/);
  assert.doesNotMatch(iml.polymorfaError(503, {}, { error: { code: 'internal_error' } }, 'GET'), /Reconcile/);
  for (const name of readdirSync('make/modules')) {
    if (JSON.parse(readFileSync(`make/modules/${name}/metadata.json`)).type !== 'action') continue;
    const communication = JSON.parse(readFileSync(`make/modules/${name}/communication.json`));
    assert.ok(communication.response.error.message.includes("polymorfaError(statusCode; headers; body; get(polymorfaRequest("));
    assert.equal(communication.response.error['429'].type, 'RateLimitError');
  }
  const error = JSON.parse(readFileSync('make/base.json')).response.error;
  assert.ok(error['409'].message.includes('polymorfaError')); assert.equal(error['429'].type, 'RateLimitError'); assert.equal(error['5xx'], undefined);
});
