function polymorfaOwnedHook(body, projectId, ownedUrl, markerName, group) {
const types = {"messageReceived":["message.received"],"messageState":["message.sent","message.ack","message.failed","message.update"],"numberState":["session.status","session.connected","session.logged_out"],"callEnded":["call.ended"]};
const same = (a, b) => { try { return iml.polymorfaCallback(a) === iml.polymorfaCallback(b); } catch (error) { return false; } };
const h = body.data;
if (!h || h.owner !== 'project' || h.projectId !== projectId || !same(h.url, ownedUrl) || h.format !== 'native' || !h.headers?.some(x => x.name.toLowerCase() === markerName.toLowerCase()) || h.eventTypes?.length !== types[group]?.length || !types[group].every(t => h.eventTypes.includes(t))) throw new Error('Subscription ownership mismatch.');
return true;
}
