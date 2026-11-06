function polymorfaCreationNonce(url) {

if (typeof url !== 'string' || !url) throw new Error('Invalid callback.');
return iml.sha256(url + ':' + Date.now() + ':' + Math.random() + ':' + Math.random(), 'hex');
}
