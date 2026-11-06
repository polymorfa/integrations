function polymorfaHook(auth, group, subscriptionKey) {
class IntegrationError extends Error {
  constructor(code, status = 0, requestId, retryAfter) {
    const recovery = code === 'idempotency_completed' ? ' The original write completed. Recover its original result; do not send again with a new key.' : code === 'subscription_receipt_deleted' ? ' The webhook created by this activation was deleted. Activate the trigger again to register a new one.' : /unknown|reconciliation/.test(code) ? ' Reconcile the original write before retrying. Keep its key and start time.' : retryAfter !== undefined ? ` Wait at least ${retryAfter} seconds; preserve the same key and start time.` : '';
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
const events = {"messageReceived":{"label":"New Message","description":"Triggers when a message is received.","types":["message.received"]},"messageState":{"label":"Message State Changed","description":"Triggers when a message is sent, acknowledged, failed or updated.","types":["message.sent","message.ack","message.failed","message.update"]},"numberState":{"label":"Number State Changed","description":"Triggers when a Number changes state, connects or logs out.","types":["session.status","session.connected","session.logged_out"]},"callEnded":{"label":"Call Ended","description":"Triggers when a call ends.","types":["call.ended"]}};
if (!events[group]) throw new IntegrationError('invalid_event_group');
required(subscriptionKey, 'subscription_key');
if (subscriptionKey.length > 200) throw new IntegrationError('invalid_subscription_key');
const scope = JSON.stringify(['polymorfa-webhook-v1', segment(auth.projectId, 'project_id'), group, subscriptionKey]);
const derive = label => iml.sha256(label + ':' + scope, 'hex', auth.apiKey);
return { name: 'X-Polymorfa-Integration-Token-' + derive('marker').slice(0, 24), value: derive('receiver'), key: derive('create') };
}
