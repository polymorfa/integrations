function polymorfaFindHook(body, auth, url, group, key) {
const expected = iml.polymorfaHook(auth, group, key);
const types = {"messageReceived":["message.received"],"messageState":["message.sent","message.ack","message.failed","message.update"],"numberState":["session.status","session.connected","session.logged_out"],"callEnded":["call.ended"]};
const same = h => iml.polymorfaCallback(h.url) === iml.polymorfaCallback(url);
if (!Array.isArray(body.data) || body.page?.hasMore) throw new Error('Subscription inventory needs reconciliation.');
if (body.data.some(h => !same(h) && h.headers?.some(x => x.name.toLowerCase() === expected.name.toLowerCase()))) throw new Error('Subscription key is already in use.');
const owns = h => h.projectId === auth.projectId && h.owner === 'project' && same(h) && h.format === 'native' && h.enabled && h.headers?.some(x => x.name.toLowerCase() === expected.name.toLowerCase()) && h.eventTypes?.length === types[group].length && types[group].every(t => h.eventTypes.includes(t));
if (body.data.some(h => (same(h) || h.headers?.some(x => x.name.toLowerCase() === expected.name.toLowerCase())) && !owns(h))) throw new Error('Changed subscription needs reconciliation.');
const matches = body.data.filter(owns);
if (matches.length > 1) throw new Error('Duplicate owned subscriptions need reconciliation.');
return matches[0]?.id || null;
}
