// Generated from shared/. Run npm run generate.
'use strict';

const ORIGIN = 'https://api.polymorfa.com';
const VERSION = '2026-09-22';
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const MAX_WRITE_AGE = 23 * 60 * 60 * 1000;
class IntegrationError extends Error {
  constructor(code, status = 0, requestId, retryAfter) {
    const recovery = code === 'idempotency_completed' ? ' The original write completed. Recover its original result; do not send again with a new key.' : /unknown|reconciliation/.test(code) ? ' Reconcile the original write before retrying. Keep its key and start time.' : retryAfter !== undefined ? ` Wait at least ${retryAfter} seconds; preserve the same key and start time.` : '';
    super(`Polymorfa ${code}${status ? ` (HTTP ${status})` : ''}${requestId ? `. Request: ${requestId}` : ''}.${recovery}`);
    this.name = 'IntegrationError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
  }
}
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new IntegrationError(`invalid_${name}`);
  return value;
}
function segment(value, name) {
  required(value, name);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new IntegrationError(`invalid_${name}`);
  return value;
}
function object(value, name) {
  let parsed = value;
  try { if (typeof value === 'string') parsed = JSON.parse(value); } catch { throw new IntegrationError(`invalid_${name}_json`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new IntegrationError(`invalid_${name}`);
  return parsed;
}
function conversation(p) {
  if (!['phoneNumber', 'id', 'bsuid'].includes(p.recipientType)) throw new IntegrationError('invalid_recipient_type');
  required(p.recipient, 'recipient');
  if (p.recipientType === 'phoneNumber' && !/^\+[1-9]\d{1,14}$/.test(p.recipient)) throw new IntegrationError('invalid_phone_number');
  if (p.recipientType === 'id' && !/^[1-9]\d{0,18}$/.test(p.recipient)) throw new IntegrationError('invalid_conversation_id');
  if (p.recipientType === 'bsuid' && !/^[A-Z]{2}\.[A-Za-z0-9]{1,128}$/.test(p.recipient)) throw new IntegrationError('invalid_bsuid');
  return { [p.recipientType]: p.recipient };
}
function messageBody(action, p) {
  const body = { conversation: conversation(p) };
  if (action === 'sendText') {
    body.content = { text: required(p.text, 'text') };
    if (p.quotedMessageId) {
      if (!/^[1-9]\d{0,18}$/.test(required(p.quotedMessageId, 'quoted_message_id'))) throw new IntegrationError('invalid_quoted_message_id');
      body.quotedMessage = { id: p.quotedMessageId };
    }
  } else if (action === 'sendTemplate') {
    let components;
    try { components = typeof p.components === 'string' ? JSON.parse(p.components || '[]') : (p.components ?? []); } catch { throw new IntegrationError('invalid_components_json'); }
    if (!Array.isArray(components) || components.length > 1000) throw new IntegrationError('invalid_components');
    body.content = { template: { name: required(p.templateName, 'template_name'), language: required(p.language, 'language'), components } };
    if (p.language.length < 2) throw new IntegrationError('invalid_language');
  } else if (action === 'sendMedia') {
    if (!['image', 'video', 'file', 'voice'].includes(p.mediaType) || !['url', 'base64'].includes(p.mediaSource)) throw new IntegrationError('invalid_media_type');
    required(p.media, 'media');
    if (p.mediaSource === 'url') {
      // Use only ECMAScript/Buffer globals: Make does not promise the URL Web API.
      // Enforce HTTPS/no embedded credentials here; the API validates/fetches the URI.
      const address = p.media.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/i);
      if (!address || /[\s\\\x00-\x1f\x7f]/.test(p.media) || address[1].includes('@')) throw new IntegrationError('invalid_media_url');
    } else if (p.media.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4 || p.media.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.media) || Buffer.from(p.media, 'base64').length > MAX_MEDIA_BYTES) {
      throw new IntegrationError('invalid_or_oversized_media');
    }
    const media = { [p.mediaSource]: p.media };
    for (const key of ['mimeType', 'caption']) if (p[key]) media[key] = required(p[key], key);
    if (p.mediaType === 'file' && p.filename) media.filename = required(p.filename, 'filename');
    body.content = { [p.mediaType]: media };
  } else if (action === 'react') {
    const reaction = p.reaction ?? '';
    if (!/^[1-9]\d{0,18}$/.test(required(p.messageId, 'message_id')) || typeof reaction !== 'string') throw new IntegrationError('invalid_reaction');
    body.id = p.messageId; body.reaction = reaction;
  } else throw new IntegrationError('unknown_action');
  return body;
}
function writeHeaders(p, now = Date.now()) {
  const key = required(p.idempotencyKey, 'idempotency_key');
  if (Buffer.byteLength(key, 'utf8') > 255 || /[\x00-\x1f\x7f]/.test(key)) throw new IntegrationError('invalid_idempotency_key');
  const created = Date.parse(required(p.writeCreatedAt, 'write_started_at'));
  if (!Number.isFinite(created) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(p.writeCreatedAt) || created > now + 60000 || now - created >= MAX_WRITE_AGE) throw new IntegrationError('write_requires_reconciliation');
  return { 'Idempotency-Key': key };
}
function headers(auth, provider) {
  const token = required(auth.apiKey, 'project_token');
  if (/[\r\n]/.test(token)) throw new IntegrationError('invalid_project_token');
  segment(auth.projectId, 'project_id');
  return { Authorization: `Bearer ${token}`, 'Polymorfa-Version': VERSION, 'Content-Type': 'application/json', 'User-Agent': `polymorfa-${provider}/0.1.0` };
}
function advanced(p, auth) {
  const path = required(p.path, 'path');
  if (!path.startsWith('/') || path.startsWith('//') || /[%\\?#\s]/.test(path) || path.split('/').some(x => x === '.' || x === '..')) throw new IntegrationError('unsupported_path');
  const method = p.method;
  const allowed = (method === 'GET' && (path === '/platform/sessions' || /^\/messaging\/projects\/[A-Za-z0-9_-]+\/templates(?:\/[A-Za-z0-9_-]+)?$/.test(path))) ||
    (method === 'POST' && /^\/messaging\/[A-Za-z0-9_-]+\/messages\/(send|react)$/.test(path));
  if (!allowed) throw new IntegrationError('unsupported_operation');
  const body = method === 'POST' ? object(p.requestBody, 'request_body') : undefined;
  if (body) {
    const keys = path.endsWith('/react') ? ['conversation', 'id', 'reaction'] : ['conversation', 'isForwarded', 'mentions', 'quotedMessage', 'content'];
    if (Object.keys(body).some(k => !keys.includes(k))) throw new IntegrationError('unsupported_request_field');
  }
  return { method, url: ORIGIN + path, ...(body ? { body } : {}), ...(path === '/platform/sessions' ? { query: { projectId: auth.projectId } } : {}) };
}
function buildRequest(action, p, auth, provider = 'integration', now) {
  let r;
  if (['sendText', 'sendTemplate', 'sendMedia', 'react'].includes(action)) r = { method: 'POST', url: `${ORIGIN}/messaging/${segment(p.session, 'number')}/messages/${action === 'react' ? 'react' : 'send'}`, body: messageBody(action, p) };
  else if (action === 'listNumbers') r = { method: 'GET', url: ORIGIN + '/platform/sessions', query: { projectId: auth.projectId } };
  else if (action === 'listTemplates') r = { method: 'GET', url: `${ORIGIN}/messaging/projects/${segment(p.projectSlug, 'project_slug')}/templates` };
  else if (action === 'apiRequest') r = advanced(p, auth);
  else throw new IntegrationError('unknown_action');
  r.headers = { ...headers(auth, provider), ...(r.method === 'POST' ? writeHeaders(p, now) : {}) };
  return r;
}
function safeCode(v, fallback) { return typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : fallback; }
function parseResponse(response) {
  const status = response.status;
  let body = response.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch {
    if (status >= 200 && status < 300) throw new IntegrationError('invalid_response', status);
    body = undefined;
  }
  if (status < 200 || status >= 300) {
    const code = safeCode(body?.error?.code, status >= 500 ? 'outcome_unknown' : status >= 300 && status < 400 ? 'redirect_refused' : 'request_failed');
    const h = Object.fromEntries(Object.entries(response.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const retry = /^\d+$/.test(h['retry-after'] || '') ? Number(h['retry-after']) : undefined;
    throw new IntegrationError(code, status, safeCode(body?.error?.request_id || h['x-request-id'], undefined), retry);
  }
  if (!body || typeof body !== 'object') throw new IntegrationError('invalid_response', status);
  return body;
}
async function execute(action, p, auth, transport, provider, now) {
  const request = buildRequest(action, p, auth, provider, now);
  let response;
  try { response = await transport(request); } catch { throw new IntegrationError(request.method === 'GET' ? 'network_error' : 'outcome_unknown'); }
  return parseResponse(response);
}
module.exports = { ORIGIN, VERSION, MAX_MEDIA_BYTES, IntegrationError, required, segment, object, conversation, advanced, headers, writeHeaders, messageBody, buildRequest, parseResponse, execute };
