function polymorfaCreateKey(key, nonce) {

if (!/^[a-f0-9]{64}$/.test(key) || typeof nonce !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(nonce)) throw new Error('Missing webhook activation identity.');
return 'integration-create-' + key + '-' + nonce;
}
