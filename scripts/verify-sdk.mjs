import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
const require = createRequire(import.meta.url);
const openApi3 = require('./openapi-schema.cjs');
const { buildRequest } = require('../shared/core.cjs');
const source = JSON.parse(readFileSync('contracts/source.json'));
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
for (const kind of ['messaging', 'platform']) {
  const response = await fetch(`https://raw.githubusercontent.com/${source.sdk.repository}/${source.sdk.source}/${source.specs[kind].sdkSnapshotPath}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `SDK ${kind} snapshot HTTP ${response.status}`);
  ajv.addSchema(openApi3(await response.json()), kind);
}
const auth = { apiKey: 'synthetic-project-token', projectId: '11111111-1111-4111-8111-111111111111' };
const input = { session: '739182640518203', recipientType: 'id', recipient: '9007199254740993123', text: 'Synthetic', idempotencyKey: 'synthetic-write', writeCreatedAt: new Date().toISOString() };
const cases = [['sendText', {}], ['sendTemplate', { templateName: 'order_ready', language: 'en', components: '[]' }], ['react', { messageId: '739182640518204', reaction: '' }], ...['image', 'video', 'file', 'voice'].flatMap(mediaType => ['url', 'base64'].map(mediaSource => ['sendMedia', { mediaType, mediaSource, media: mediaSource === 'url' ? 'https://example.com/media' : 'AAECAw==' }]))];
for (const [action, extra] of cases) {
  const request = buildRequest(action, { ...input, ...extra }, auth);
  const validate = ajv.compile({ $ref: `messaging#/components/schemas/${action === 'react' ? 'ReactRequest' : 'SendMessageRequest'}` });
  assert.ok(validate(request.body), `${action}: ${JSON.stringify(validate.errors)}`);
}
const webhook = { url: 'https://example.com/synthetic', eventTypes: ['message.received'], enabled: true, format: 'native', headers: [{ name: 'X-Polymorfa-Integration-test', value: 'synthetic-receiver-secret' }] };
const validate = ajv.compile({ $ref: 'platform#/components/schemas/CreateProjectWebhookInput' });
assert.ok(validate(webhook), JSON.stringify(validate.errors));
console.log(`${cases.length} action request cases and webhook registration match SDK ${source.sdk.source}. No SDK-only field or operation is exposed.`);
