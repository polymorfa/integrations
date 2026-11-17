function polymorfaOwnedHook(body, projectId, ownedUrl, markerName, group) {
const types = {"messageReceived":["message.received"],"messageState":["message.sent","message.ack","message.failed","message.update"],"connectionState":["connection.status","connection.connected","connection.logged_out"],"callEnded":["call.ended"]};
const same = (a, b) => { try { return iml.polymorfaCallback(a) === iml.polymorfaCallback(b); } catch (error) { return false; } };
const h = body.data;
// Cleanup only. Neither registration nor event emission accepts this retired set.
const legacy = ['session.status', 'session.connected', 'session.logged_out'];
const allowed = group === 'numberState' ? [legacy] : group === 'connectionState' ? [types[group], legacy] : [types[group]];
const matches = t => t && h?.eventTypes?.length === t.length && t.every(e => h.eventTypes.includes(e));
if (typeof markerName !== 'string' || !/^X-Polymorfa-Integration-Token-[a-f0-9]{24}$/i.test(markerName) || !h || h.owner !== 'project' || h.projectId !== projectId || !same(h.url, ownedUrl) || h.format !== 'native' || !h.headers?.some(x => x.name.toLowerCase() === markerName.toLowerCase()) || !allowed.some(matches)) throw new Error('Subscription ownership mismatch.');
return true;
}
