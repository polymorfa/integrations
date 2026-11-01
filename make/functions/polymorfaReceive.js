function polymorfaReceive(expectedName, expectedValue, group, headers, body) {
const types = {"messageReceived":["message.received"],"messageState":["message.sent","message.ack","message.failed","message.update"],"numberState":["session.status","session.connected","session.logged_out"],"callEnded":["call.ended"]};
const entries = Object.entries(headers || {}).filter(([key]) => key.toLowerCase() === String(expectedName).toLowerCase());
if (!expectedValue || entries.length !== 1 || entries[0][1] !== expectedValue) return false;
return !!(body && typeof body.id === 'string' && body.id && typeof body.session === 'string' && body.session && types[group] && types[group].includes(body.event) && typeof body.timestamp === 'string' && Number.isFinite(Date.parse(body.timestamp)) && body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload));
}
