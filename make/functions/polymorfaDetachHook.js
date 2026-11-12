function polymorfaDetachHook(status, body, id, projectId, ownedUrl, markerName, group) {

if (status === 404) return false;
if (status !== 200) throw new Error(iml.polymorfaError(status, {}, body, 'GET'));
if (!body || !body.data || body.data.id !== id) throw new Error('Subscription ownership mismatch.');
return iml.polymorfaOwnedHook(body, projectId, ownedUrl, markerName, group);
}
