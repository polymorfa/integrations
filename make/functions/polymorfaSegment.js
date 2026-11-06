function polymorfaSegment(value) {
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
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new IntegrationError(`invalid_${name}`);
  return value;
}
function segment(value, name) {
  required(value, name);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new IntegrationError(`invalid_${name}`);
  return value;
}
return segment(value, 'resource_id');
}
