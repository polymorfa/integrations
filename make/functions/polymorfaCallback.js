function polymorfaCallback(value) {

if (typeof value !== 'string' || /[\s\\\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid callback.');
const parts = value.match(/^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?$/i);
if (!parts || parts[1].includes('@')) throw new Error('Invalid callback.');
return 'https://' + parts[1].toLowerCase().replace(/:443$/, '') + (parts[2] || '/') + (parts[3] || '');
}
