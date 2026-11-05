function polymorfaOwnedHook(body, projectId, ownedUrl, markerName, group) {
const types = {"messageReceived":["message.received"],"messageState":["message.sent","message.ack","message.failed","message.update"],"numberState":["session.status","session.connected","session.logged_out"],"callEnded":["call.ended"]};
const h = body.data;
if (!h || h.owner !== 'project' || h.projectId !== projectId || iml.polymorfaCallback(h.url) !== iml.polymorfaCallback(ownedUrl) || h.format !== 'native' || !h.headers?.some(x => x.name.toLowerCase() === markerName.toLowerCase()) || h.eventTypes?.length !== types[group]?.length || !types[group].every(t => h.eventTypes.includes(t))) throw new Error('Subscription ownership mismatch.');
return true;
}
