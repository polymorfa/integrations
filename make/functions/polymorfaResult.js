function polymorfaResult(status, headers, body) {
class IntegrationError extends Error {
  constructor(code, status = 0, requestId, retryAfter) {
    const recovery = code === 'idempotency_completed' ? ' The original write completed. Recover its original result; do not send again with a new key.' : /unknown|reconciliation/.test(code) ? ' Reconcile the original write before retrying. Keep its key and start time.' : retryAfter !== undefined ? ` Wait at least ${retryAfter} seconds; preserve the same key and start time.` : '';
    super(`Polymorfa ${code}${status ? ` (HTTP ${status})` : ''}${requestId ? `. Request: ${requestId}` : ''}.${recovery}`);
    this.name = 'IntegrationError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
  }
}
function safeCode(v, fallback) { return typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : fallback; }
function parseResponse(response) {
  const status = response.status;
  let body = response.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { throw new IntegrationError('invalid_response', status); }
  if (status < 200 || status >= 300) {
    const code = safeCode(body?.error?.code, status >= 500 ? 'outcome_unknown' : status >= 300 && status < 400 ? 'redirect_refused' : 'request_failed');
    const h = Object.fromEntries(Object.entries(response.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const retry = /^\d+$/.test(h['retry-after'] || '') ? Number(h['retry-after']) : undefined;
    throw new IntegrationError(code, status, safeCode(body?.error?.request_id || h['x-request-id'], undefined), retry);
  }
  if (!body || typeof body !== 'object') throw new IntegrationError('invalid_response', status);
  return body;
}
return parseResponse({ status, headers, body });
}
