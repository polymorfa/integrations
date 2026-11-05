function polymorfaEnvelope(body, group) {
class IntegrationError extends Error {
  constructor(code, status = 0, requestId, retryAfter) {
    const recovery = code === 'idempotency_completed' ? ' The original write completed. Recover its original result; do not send again with a new key.' : /unknown|reconciliation/.test(code) ? ' Reconcile the original write before retrying. Keep its key and start time.' : retryAfter !== undefined ? ` Wait at least ${retryAfter} seconds; preserve the same key and start time.` : '';
    super(`Polymorfa ${code}${status ? ` (HTTP ${status})` : ''}${requestId ? `. Request: ${requestId}` : ''}.${recovery}`);
    this.name = 'IntegrationError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
  }
}
const events = {"messageReceived":{"label":"New Message","description":"Triggers when a message is received.","types":["message.received"]},"messageState":{"label":"Message State Changed","description":"Triggers when a message is sent, acknowledged, failed or updated.","types":["message.sent","message.ack","message.failed","message.update"]},"numberState":{"label":"Number State Changed","description":"Triggers when a Number changes state, connects or logs out.","types":["session.status","session.connected","session.logged_out"]},"callEnded":{"label":"Call Ended","description":"Triggers when a call ends.","types":["call.ended"]}};
function envelope(body, group) {
  if (!events[group] || !body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || !body.id || typeof body.session !== 'string' || !body.session || typeof body.timestamp !== 'string' || !Number.isFinite(Date.parse(body.timestamp)) || !events[group].types.includes(body.event) || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) throw new IntegrationError('invalid_event');
  // Copy the defined envelope only. Never export arbitrary top-level transport fields.
  return { id: body.id, session: body.session, ...(typeof body.externalId === 'string' ? { externalId: body.externalId } : {}), timestamp: body.timestamp, event: body.event, payload: body.payload };
}
return envelope(body, group);
}
