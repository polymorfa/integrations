function polymorfaCreateKey(key, registrationKey) {

if (!/^[a-f0-9]{64}$/.test(key) || typeof registrationKey !== 'string' || !registrationKey.trim() || registrationKey.length > 200) throw new Error('Missing webhook creation key.');
return 'integration-create-' + iml.sha256(registrationKey, 'hex', key);
}
