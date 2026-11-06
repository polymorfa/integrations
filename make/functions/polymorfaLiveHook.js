function polymorfaLiveHook(body, auth, url, group, key, expectedId) {

const id = iml.polymorfaFindHook(body, auth, url, group, key);
if (!id || id !== expectedId) throw new Error('Subscription receipt needs reconciliation.');
return id;
}
