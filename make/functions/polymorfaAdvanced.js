function polymorfaAdvanced(p, auth) {
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
function object(value, name) {
  let parsed = value;
  try { if (typeof value === 'string') parsed = JSON.parse(value); } catch { throw new IntegrationError(`invalid_${name}_json`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new IntegrationError(`invalid_${name}`);
  return parsed;
}
const ORIGIN = 'https://api.polymorfa.com';
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
return advanced(p, auth);
}
