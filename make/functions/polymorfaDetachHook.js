function polymorfaDetachHook(body, id, projectId, ownedUrl, markerName, group) {

if (!Array.isArray(body.data) || body.page?.hasMore) throw new Error('Subscription inventory needs reconciliation.');
const matches = body.data.filter(h => h.id === id);
if (matches.length > 1) throw new Error('Duplicate subscription IDs need reconciliation.');
if (!matches.length) return false;
return iml.polymorfaOwnedHook({ data: matches[0] }, projectId, ownedUrl, markerName, group);
}
