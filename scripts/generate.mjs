import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { actions, fields, events } = require('../shared/catalog.cjs');
const core = require('../shared/core.cjs');
const check = process.argv.includes('--check');
let drift = false;
function emit(path, value) {
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) { console.error(`Generated file differs: ${path}`); drift = true; }
  } else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
}
for (const target of ['n8n/shared', 'zapier/shared', 'pipedream/common']) {
  for (const name of ['catalog', 'core', 'hooks']) {
    let text = readFileSync(`shared/${name}.cjs`, 'utf8');
    if (target.startsWith('n8n')) text = text.replaceAll('.cjs', '.js');
    emit(`${target}/${name}.${target.startsWith('n8n') ? 'js' : 'cjs'}`, '// Generated from shared/. Run npm run generate.\n' + text);
  }
  emit(`${target}/samples.json`, JSON.parse(readFileSync('fixtures/events.json')));
}
for (const name of ['LICENSE', 'NOTICE.md']) emit(`n8n/${name}`, readFileSync(name, 'utf8'));
const specs = Object.fromEntries(['messaging', 'platform'].map(k => [k, JSON.parse(readFileSync(`contracts/openapi.${k}.json`))]));
function interfaceFields(schema, spec, depth = 0) {
  if (!schema || depth > 4) return [];
  if (schema.$ref) return interfaceFields(spec.components.schemas[schema.$ref.split('/').at(-1)], spec, depth + 1);
  const fields = { ...schema.properties };
  for (const variant of [...(schema.allOf || []), ...(schema.oneOf || []), ...(schema.anyOf || [])]) for (const item of interfaceFields(variant, spec, depth + 1)) if (!fields[item.name]) fields[item.name] = { __interface: item };
  return Object.entries(fields).map(([name, s]) => {
    if (s.__interface) return s.__interface;
    const resolved = s.$ref ? spec.components.schemas[s.$ref.split('/').at(-1)] : s;
    const type = resolved.type === 'array' ? 'array' : resolved.type === 'boolean' ? 'boolean' : ['number', 'integer'].includes(resolved.type) ? 'number' : resolved.type === 'object' || resolved.properties || resolved.oneOf || resolved.anyOf || resolved.allOf ? 'collection' : resolved.format === 'date-time' ? 'date' : 'text';
    const children = type === 'array' ? interfaceFields(resolved.items, spec, depth + 1) : type === 'collection' ? interfaceFields(resolved, spec, depth + 1) : [];
    return { name, label: name, type, ...(children.length ? { spec: type === 'array' ? { type: 'collection', spec: children } : children } : {}) };
  });
}
// Generate native Pipedream components, without a second HTTP client/runtime.
for (const [key, action] of Object.entries(actions)) {
  const props = {};
  for (const name of action.fields) {
    const f = fields[name]; props[name] = { type: 'string', label: f.label, optional: !f.required, ...(f.help ? { description: f.help } : {}), ...(f.default ? { default: f.default } : {}), ...(f.options ? { options: Object.entries(f.options).map(([value, label]) => ({ value, label })) } : {}) };
    if (['idempotencyKey', 'writeCreatedAt'].includes(name) && key !== 'apiRequest') props[name].optional = false;
  }
  emit(`pipedream/actions/${key}/${key}.mjs`, `// Generated from shared/catalog.cjs.\nimport polymorfa from '../../polymorfa.app.mjs';\nexport default {\n  key: ${JSON.stringify('polymorfa-' + key)}, name: ${JSON.stringify(action.label)}, description: ${JSON.stringify(action.description)},\n  version: '0.1.0', type: 'action',\n  props: { polymorfa, ...${JSON.stringify(props, null, 2)} },\n  async run({ $ }) {\n    const input = Object.fromEntries(${JSON.stringify(action.fields)}.map(key => [key, this[key]]));\n    return this.polymorfa.execute($, ${JSON.stringify(key)}, input);\n  },\n};\n`);
}
for (const [key, event] of Object.entries(events)) emit(`pipedream/sources/${key}/${key}.mjs`, `// Generated from shared/catalog.cjs.\nimport polymorfa from '../../polymorfa.app.mjs';\nexport default {\n  key: ${JSON.stringify('polymorfa-' + key)}, name: ${JSON.stringify(event.label)}, description: ${JSON.stringify(event.description)},\n  version: '0.1.0', type: 'source', dedupe: 'unique',\n  props: { polymorfa, db: '$.service.db', http: { type: '$.interface.http', customResponse: true },\n    subscriptionKey: { type: 'string', label: 'Subscription Key', description: 'Unique stable label for this source. Events are project-wide.' } },\n  hooks: {\n    async activate() {\n      const owned = await this.polymorfa.subscribe(undefined, this.http.endpoint, ${JSON.stringify(key)}, this.subscriptionKey);\n      this.db.set('ownedSubscription', owned);\n    },\n    async deactivate() {\n      const owned = this.db.get('ownedSubscription');\n      if (owned) { await this.polymorfa.unsubscribe(undefined, owned); this.db.set('ownedSubscription', null); }\n    },\n  },\n  async run(event) {\n    if (!this.polymorfa.authenticate(${JSON.stringify(key)}, this.subscriptionKey, event.headers)) { this.http.respond({ status: 401 }); return; }\n    let data;\n    try { data = this.polymorfa.envelope(event.body, ${JSON.stringify(key)}); } catch { this.http.respond({ status: 400 }); return; }\n    this.$emit(data, { id: data.id, summary: data.event, ts: Date.parse(data.timestamp) });\n    this.http.respond({ status: 200 });\n  },\n};\n`);

// Make custom IML functions reuse the exact shared request/response behavior.
// Every function fits Make's 5,000-character limit. They require provider enablement.
const errorClass = core.IntegrationError.toString();
const safeCode = "function safeCode(v, fallback) { return typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : fallback; }";
function imlFunction(name, args, definitions, statement) {
  const content = `function ${name}(${args}) {\n${definitions}\n${statement}\n}\n`;
  if (content.length > 5000) throw new Error(`${name} exceeds Make's function limit: ${content.length}`);
  emit(`make/functions/${name}.js`, content);
}
imlFunction('polymorfaBody', 'action, p', `${errorClass}\nconst MAX_MEDIA_BYTES = ${core.MAX_MEDIA_BYTES};\n${core.required}\n${core.conversation || ''}\n${core.messageBody}`, 'return messageBody(action, p);');
imlFunction('polymorfaAdvanced', 'p, auth', `${errorClass}\n${core.required}\n${core.object || ''}\nconst ORIGIN = '${core.ORIGIN}';\n${core.advanced || ''}`, 'return advanced(p, auth);');
imlFunction('polymorfaRequest', 'action, p, auth', `${errorClass}\nconst ORIGIN = '${core.ORIGIN}', VERSION = '${core.VERSION}', MAX_WRITE_AGE = ${23 * 60 * 60 * 1000};\n${core.required}\n${core.segment}\n${core.headers}\n${core.writeHeaders}\n${core.buildRequest.toString().replace('messageBody(action, p)', 'iml.polymorfaBody(action, p)').replace('advanced(p, auth)', 'iml.polymorfaAdvanced(p, auth)')}`, "return buildRequest(action, p, auth, 'make');");
imlFunction('polymorfaResult', 'status, headers, body', `${errorClass}\n${safeCode}\n${core.parseResponse}`, 'return parseResponse({ status, headers, body });');
imlFunction('polymorfaSegment', 'value', `${errorClass}\n${core.required}\n${core.segment}`, "return segment(value, 'resource_id');");
imlFunction('polymorfaHook', 'auth, group, subscriptionKey', `${errorClass}\n${core.required}\n${core.segment}\nconst events = ${JSON.stringify(events)};`, `if (!events[group]) throw new IntegrationError('invalid_event_group');\nrequired(subscriptionKey, 'subscription_key');\nif (subscriptionKey.length > 200) throw new IntegrationError('invalid_subscription_key');\nconst scope = JSON.stringify(['polymorfa-webhook-v1', segment(auth.projectId, 'project_id'), group, subscriptionKey]);\nconst derive = label => iml.sha256(label + ':' + scope, 'hex', auth.apiKey);\nreturn { name: 'X-Polymorfa-Integration-Token-' + derive('marker').slice(0, 24), value: derive('receiver'), key: derive('create') };`);
imlFunction('polymorfaCreateKey', 'key, nonce', '', `if (!/^[a-f0-9]{64}$/.test(key) || typeof nonce !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(nonce)) throw new Error('Missing webhook activation identity.');\nreturn 'integration-create-' + key + '-' + nonce;`);
imlFunction('polymorfaCallback', 'value', '', `if (typeof value !== 'string' || /[\\s\\\\\\x00-\\x1f\\x7f]/.test(value)) throw new Error('Invalid callback.');\nconst parts = value.match(/^https:\\/\\/([^/?#]+)([^?#]*)(\\?[^#]*)?$/i);\nif (!parts || parts[1].includes('@')) throw new Error('Invalid callback.');\nreturn 'https://' + parts[1].toLowerCase().replace(/:443$/, '') + (parts[2] || '/') + (parts[3] || '');`);
imlFunction('polymorfaError', 'status, headers, body', '', `try { iml.polymorfaResult(status, headers, body); return 'Polymorfa invalid_response'; } catch (error) { return error.message; }`);
imlFunction('polymorfaReceive', 'expectedName, expectedValue, group, headers, body', `const types = ${JSON.stringify(Object.fromEntries(Object.entries(events).map(([k, e]) => [k, e.types])))};`, `const entries = Object.entries(headers || {}).filter(([key]) => key.toLowerCase() === String(expectedName).toLowerCase());\nif (!expectedValue || entries.length !== 1 || entries[0][1] !== expectedValue) return false;\nreturn !!(body && typeof body.id === 'string' && body.id && typeof body.session === 'string' && body.session && types[group] && types[group].includes(body.event) && typeof body.timestamp === 'string' && Number.isFinite(Date.parse(body.timestamp)) && body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload));`);
imlFunction('polymorfaFindHook', 'body, auth, url, group, key', `const expected = iml.polymorfaHook(auth, group, key);\nconst types = ${JSON.stringify(Object.fromEntries(Object.entries(events).map(([k, e]) => [k, e.types])))};\nconst same = h => iml.polymorfaCallback(h.url) === iml.polymorfaCallback(url);`, `if (!Array.isArray(body.data) || body.page?.hasMore) throw new Error('Subscription inventory needs reconciliation.');\nif (body.data.some(h => !same(h) && h.headers?.some(x => x.name.toLowerCase() === expected.name.toLowerCase()))) throw new Error('Subscription key is already in use.');\nconst owns = h => h.projectId === auth.projectId && h.owner === 'project' && same(h) && h.format === 'native' && h.enabled && h.headers?.some(x => x.name.toLowerCase() === expected.name.toLowerCase()) && h.eventTypes?.length === types[group].length && types[group].every(t => h.eventTypes.includes(t));\nif (body.data.some(h => (same(h) || h.headers?.some(x => x.name.toLowerCase() === expected.name.toLowerCase())) && !owns(h))) throw new Error('Changed subscription needs reconciliation.');\nconst matches = body.data.filter(owns);\nif (matches.length > 1) throw new Error('Duplicate owned subscriptions need reconciliation.');\nreturn matches[0]?.id || null;`);
imlFunction('polymorfaOwnedHook', 'body, projectId, ownedUrl, markerName, group', `const types = ${JSON.stringify(Object.fromEntries(Object.entries(events).map(([k, e]) => [k, e.types])))};`, `const h = body.data;\nif (!h || h.owner !== 'project' || h.projectId !== projectId || iml.polymorfaCallback(h.url) !== iml.polymorfaCallback(ownedUrl) || h.format !== 'native' || !h.headers?.some(x => x.name.toLowerCase() === markerName.toLowerCase()) || h.eventTypes?.length !== types[group]?.length || !types[group].every(t => h.eventTypes.includes(t))) throw new Error('Subscription ownership mismatch.');\nreturn true;`);
imlFunction('polymorfaDetachHook', 'body, id, projectId, ownedUrl, markerName, group', '', `if (!Array.isArray(body.data) || body.page?.hasMore) throw new Error('Subscription inventory needs reconciliation.');\nconst matches = body.data.filter(h => h.id === id);\nif (matches.length > 1) throw new Error('Duplicate subscription IDs need reconciliation.');\nif (!matches.length) return false;\nreturn iml.polymorfaOwnedHook({ data: matches[0] }, projectId, ownedUrl, markerName, group);`);

emit('make/app.json', { name: 'polymorfa', label: 'Polymorfa', version: 1, theme: '#7657ff', language: 'en', description: 'Send messages and receive project events with Polymorfa.' });
const makeError = '{{polymorfaError(statusCode; headers; body)}}';
emit('make/base.json', { baseUrl: core.ORIGIN, headers: { Authorization: 'Bearer {{connection.apiKey}}', 'Polymorfa-Version': core.VERSION, 'User-Agent': 'polymorfa-make/0.1.0' }, log: { sanitize: ['request.headers.authorization', 'request.headers.Authorization', 'request.headers.idempotency-key', 'request.headers.Idempotency-Key', 'request.body.headers', 'response.body.data.secret', 'response.body.data.idempotency.key'] }, response: { error: { message: makeError, '409': { message: makeError }, '429': { type: 'RateLimitError', message: makeError } } } });
emit('make/connections/project/parameters.json', [{ name: 'apiKey', type: 'password', label: 'Project Token', required: true }, { name: 'projectId', type: 'text', label: 'Project ID', required: true }]);
emit('make/connections/project/communication.json', { url: '/platform/sessions', method: 'GET', qs: { projectId: '{{parameters.projectId}}' }, headers: { Authorization: 'Bearer {{parameters.apiKey}}', 'Polymorfa-Version': core.VERSION }, response: { valid: '{{statusCode = 200}}', metadata: { type: 'text', value: '{{parameters.projectId}}' } }, log: { sanitize: ['request.headers.authorization'] } });
for (const [key, action] of Object.entries(actions)) {
  emit(`make/modules/${key}/metadata.json`, { label: key === 'apiRequest' ? 'Make an API call' : action.label, description: key === 'apiRequest' ? 'Calls an allowlisted public operation on the Polymorfa API.' : action.description, connection: 'project', type: 'action' });
  emit(`make/modules/${key}/parameters.json`, action.fields.map(name => {
    const f = fields[name];
    return { name, type: f.options ? 'select' : 'text', label: f.label, required: !!f.required || (key !== 'apiRequest' && ['idempotencyKey', 'writeCreatedAt'].includes(name)), ...(f.default ? { default: f.default } : {}), ...(f.help ? { help: f.help } : {}), ...(f.options ? { options: Object.entries(f.options).map(([value, label]) => ({ value, label })) } : {}) };
  }));
  const r = `polymorfaRequest('${key}'; parameters; connection)`;
  emit(`make/modules/${key}/communication.json`, { url: `{{get(${r}; 'url')}}`, method: `{{get(${r}; 'method')}}`, headers: `{{get(${r}; 'headers')}}`, qs: `{{get(${r}; 'query')}}`, body: `{{get(${r}; 'body')}}`, type: 'json', followRedirect: false, response: { valid: '{{polymorfaResult(statusCode; headers; body) != null}}', output: '{{polymorfaResult(statusCode; headers; body)}}' }, log: { sanitize: ['request.headers.authorization', 'request.headers.idempotency-key'] } });
  const spec = key === 'listNumbers' ? specs.platform : specs.messaging;
  const response = key === 'listNumbers' ? { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/PlatformSession' } } } } : spec.components.schemas[key === 'listTemplates' ? 'ListProjectTemplatesResponse' : key === 'react' ? 'SendReactionResponse' : 'SendMessageResponse'];
  emit(`make/modules/${key}/interface.json`, key === 'apiRequest' ? [{ name: 'data', label: 'Result', type: 'collection' }] : interfaceFields(response, spec));
}
for (const [key, e] of Object.entries(events)) {
  emit(`make/modules/${key}/metadata.json`, { label: e.label, description: e.description, type: 'instant', webhook: key });
  const schemas = Object.values(specs.messaging.components.schemas).filter(s => s.properties?.event?.enum?.some(type => e.types.includes(type)));
  const merge = (a, b) => {
    const result = [...a];
    for (const item of b) {
      const existing = result.find(x => x.name === item.name);
      if (!existing) result.push(item);
      else if (existing.type === 'collection' && item.type === 'collection') existing.spec = merge(existing.spec || [], item.spec || []);
    }
    return result;
  };
  emit(`make/modules/${key}/interface.json`, schemas.reduce((all, schema) => merge(all, interfaceFields(schema, specs.messaging)), []));
  emit(`make/webhooks/${key}/parameters.json`, [{ name: 'subscriptionKey', label: 'Subscription Key', type: 'text', required: true, help: 'Unique stable label for this webhook. Events are project-wide.' }]);
  emit(`make/webhooks/${key}/metadata.json`, { type: 'dedicated', connection: 'project', label: e.label });
  const marker = `polymorfaHook(connection; '${key}'; parameters.subscriptionKey)`;
  const markerField = field => `{{get(${marker}; '${field}')}}`;
  emit(`make/webhooks/${key}/attach.json`, [
    { url: '/platform/projects/{{polymorfaSegment(connection.projectId)}}/webhooks', method: 'GET', qs: { limit: 100 }, response: { temp: { ownedId: `{{polymorfaFindHook(body; connection; webhook.url; '${key}'; parameters.subscriptionKey)}}`, activationId: '{{uuid}}' }, data: { externalHookId: '{{temp.ownedId}}', ownedUrl: '{{webhook.url}}', receiverName: markerField('name'), receiverValue: markerField('value') } } },
    { condition: '{{!temp.ownedId}}', url: '/platform/projects/{{polymorfaSegment(connection.projectId)}}/webhooks', method: 'POST', headers: { 'Idempotency-Key': `{{polymorfaCreateKey(get(${marker}; 'key'); temp.activationId)}}` }, body: { url: '{{webhook.url}}', eventTypes: e.types, format: 'native', enabled: true, headers: [{ name: markerField('name'), value: markerField('value') }] }, response: { data: { externalHookId: '{{body.data.webhook.id}}', ownedUrl: '{{webhook.url}}', receiverName: markerField('name'), receiverValue: markerField('value') } } },
  ]);
  emit(`make/webhooks/${key}/detach.json`, [
    { url: '/platform/projects/{{polymorfaSegment(connection.projectId)}}/webhooks', method: 'GET', qs: { limit: 100 }, response: { temp: { ownedPresent: `{{polymorfaDetachHook(body; webhook.externalHookId; connection.projectId; webhook.ownedUrl; webhook.receiverName; '${key}')}}` } } },
    { condition: '{{temp.ownedPresent}}', url: '/platform/projects/{{polymorfaSegment(connection.projectId)}}/webhooks/{{polymorfaSegment(webhook.externalHookId)}}', method: 'DELETE', headers: { 'Idempotency-Key': 'integration-delete-{{webhook.externalHookId}}' } },
  ]);
  const valid = `polymorfaReceive(parameters.receiverName; parameters.receiverValue; '${key}'; headers; body)`;
  emit(`make/webhooks/${key}/communication.json`, { condition: `{{${valid}}}`, respond: { status: `{{if(${valid}; 200; 401)}}`, type: 'json', body: {} }, output: { id: '{{body.id}}', session: '{{body.session}}', timestamp: '{{body.timestamp}}', event: '{{body.event}}', payload: '{{body.payload}}' } });
}
if (drift) process.exitCode = 1;
else console.log(check ? 'Generated adapter files are current.' : 'Generated native adapter files.');
