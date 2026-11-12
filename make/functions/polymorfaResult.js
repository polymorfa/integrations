function polymorfaResult(status, headers, body, method) {
class IntegrationError extends Error {
  constructor(code, status = 0, requestId, retryAfter, write = false) {
    // A write that ended in a server error or is still running has an uncertain outcome, whatever its code.
    const uncertain = /unknown|reconciliation/.test(code) || code === 'idempotency_in_progress' || (write && status >= 500);
    const wait = retryAfter !== undefined ? ` Wait at least ${retryAfter} seconds; preserve the same key and start time.` : '';
    const recovery = code === 'idempotency_completed' ? ' The original write completed. Recover its original result; do not send again with a new key.' : code === 'subscription_receipt_deleted' ? ' The webhook created by this activation was deleted. Activate the trigger again to register a new one.' : uncertain ? ' Reconcile the original write before retrying. Keep its key and start time.' + wait : wait;
    super(`Polymorfa ${code}${status ? ` (HTTP ${status})` : ''}${requestId ? `. Request: ${requestId}` : ''}.${recovery}`);
    this.name = 'IntegrationError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
  }
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
    throw new IntegrationError(code, status, safeCode(body?.error?.request_id || h['x-request-id'], undefined), retry, typeof response.method === 'string' && response.method.toUpperCase() !== 'GET');
  }
  if (!body || typeof body !== 'object') throw new IntegrationError('invalid_response', status);
  return body;
}
return parseResponse({ status, headers, body, method });
}
