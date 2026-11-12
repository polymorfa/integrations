function polymorfaCreateKey(key, nonce) {

if (!/^[a-f0-9]{64}$/.test(key) || typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) throw new Error('Invalid webhook creation nonce.');
return 'integration-create-' + iml.sha256(nonce, 'hex', key);
}
