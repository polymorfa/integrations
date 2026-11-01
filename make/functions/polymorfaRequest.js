function polymorfaRequest(action, p, auth) {
class IntegrationError extends Error {
  constructor(code, status = 0, requestId, retryAfter) {
    const recovery = code === 'idempotency_completed' ? ' The original write completed. Recover its original result; do not send again with a new key.' : /unknown|reconciliation/.test(code) ? ' Reconcile the original write before retrying. Keep its key and start time.' : retryAfter !== undefined ? ` Wait at least ${retryAfter} seconds; preserve the same key and start time.` : '';
    super(`Polymorfa ${code}${status ? ` (HTTP ${status})` : ''}${requestId ? `. Request: ${requestId}` : ''}.${recovery}`);
    this.name = 'IntegrationError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
  }
}
const ORIGIN = 'https://api.polymorfa.com', VERSION = '2026-09-22', MAX_WRITE_AGE = 82800000;
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new IntegrationError(`invalid_${name}`);
  return value;
}
function segment(value, name) {
  required(value, name);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new IntegrationError(`invalid_${name}`);
  return value;
}
function headers(auth, provider) {
  const token = required(auth.apiKey, 'project_token');
  if (/[\r\n]/.test(token)) throw new IntegrationError('invalid_project_token');
  segment(auth.projectId, 'project_id');
  return { Authorization: `Bearer ${token}`, 'Polymorfa-Version': VERSION, 'Content-Type': 'application/json', 'User-Agent': `polymorfa-${provider}/0.1.0` };
}
function writeHeaders(p, now = Date.now()) {
  const key = required(p.idempotencyKey, 'idempotency_key');
  if (Buffer.byteLength(key, 'utf8') > 255 || /[\x00-\x1f\x7f]/.test(key)) throw new IntegrationError('invalid_idempotency_key');
  const created = Date.parse(required(p.writeCreatedAt, 'write_started_at'));
  if (!Number.isFinite(created) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(p.writeCreatedAt) || created > now + 60000 || now - created >= MAX_WRITE_AGE) throw new IntegrationError('write_requires_reconciliation');
  return { 'Idempotency-Key': key };
}
function buildRequest(action, p, auth, provider = 'integration', now) {
  let r;
  if (['sendText', 'sendTemplate', 'sendMedia', 'react'].includes(action)) r = { method: 'POST', url: `${ORIGIN}/messaging/${segment(p.session, 'number')}/messages/${action === 'react' ? 'react' : 'send'}`, body: iml.polymorfaBody(action, p) };
  else if (action === 'listNumbers') r = { method: 'GET', url: ORIGIN + '/platform/sessions', query: { projectId: auth.projectId } };
  else if (action === 'listTemplates') r = { method: 'GET', url: `${ORIGIN}/messaging/projects/${segment(p.projectSlug, 'project_slug')}/templates` };
  else if (action === 'apiRequest') r = iml.polymorfaAdvanced(p, auth);
  else throw new IntegrationError('unknown_action');
  r.headers = { ...headers(auth, provider), ...(r.method === 'POST' ? writeHeaders(p, now) : {}) };
  return r;
}
return buildRequest(action, p, auth, 'make');
}
