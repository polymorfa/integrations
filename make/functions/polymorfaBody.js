function polymorfaBody(action, p) {
class IntegrationError extends Error {
  constructor(code, status = 0, requestId, retryAfter) {
    const recovery = code === 'idempotency_completed' ? ' The original write completed. Recover its original result; do not send again with a new key.' : /unknown|reconciliation/.test(code) ? ' Reconcile the original write before retrying. Keep its key and start time.' : retryAfter !== undefined ? ` Wait at least ${retryAfter} seconds; preserve the same key and start time.` : '';
    super(`Polymorfa ${code}${status ? ` (HTTP ${status})` : ''}${requestId ? `. Request: ${requestId}` : ''}.${recovery}`);
    this.name = 'IntegrationError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
  }
}
const MAX_MEDIA_BYTES = 4194304;
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new IntegrationError(`invalid_${name}`);
  return value;
}
function conversation(p) {
  if (!['phoneNumber', 'id', 'bsuid'].includes(p.recipientType)) throw new IntegrationError('invalid_recipient_type');
  required(p.recipient, 'recipient');
  if (p.recipientType === 'phoneNumber' && !/^\+[1-9]\d{1,14}$/.test(p.recipient)) throw new IntegrationError('invalid_phone_number');
  if (p.recipientType === 'id' && !/^[1-9]\d{0,18}$/.test(p.recipient)) throw new IntegrationError('invalid_conversation_id');
  if (p.recipientType === 'bsuid' && !/^[A-Z]{2}\.[A-Za-z0-9]{1,128}$/.test(p.recipient)) throw new IntegrationError('invalid_bsuid');
  return { [p.recipientType]: p.recipient };
}
function messageBody(action, p) {
  const body = { conversation: conversation(p) };
  if (action === 'sendText') {
    body.content = { text: required(p.text, 'text') };
    if (p.quotedMessageId) {
      if (!/^[1-9]\d{0,18}$/.test(required(p.quotedMessageId, 'quoted_message_id'))) throw new IntegrationError('invalid_quoted_message_id');
      body.quotedMessage = { id: p.quotedMessageId };
    }
  } else if (action === 'sendTemplate') {
    let components;
    try { components = typeof p.components === 'string' ? JSON.parse(p.components || '[]') : (p.components ?? []); } catch { throw new IntegrationError('invalid_components_json'); }
    if (!Array.isArray(components) || components.length > 1000) throw new IntegrationError('invalid_components');
    body.content = { template: { name: required(p.templateName, 'template_name'), language: required(p.language, 'language'), components } };
    if (p.language.length < 2) throw new IntegrationError('invalid_language');
  } else if (action === 'sendMedia') {
    if (!['image', 'video', 'file', 'voice'].includes(p.mediaType) || !['url', 'base64'].includes(p.mediaSource)) throw new IntegrationError('invalid_media_type');
    required(p.media, 'media');
    if (p.mediaSource === 'url') {
      // Use only ECMAScript/Buffer globals: Make does not promise the URL Web API.
      // Enforce HTTPS/no embedded credentials here; the API validates/fetches the URI.
      const address = p.media.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/i);
      if (!address || /[\s\\\x00-\x1f\x7f]/.test(p.media) || address[1].includes('@')) throw new IntegrationError('invalid_media_url');
    } else if (p.media.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.media) || Buffer.from(p.media, 'base64').length > MAX_MEDIA_BYTES) {
      throw new IntegrationError('invalid_or_oversized_media');
    }
    const media = { [p.mediaSource]: p.media };
    for (const key of ['mimeType', 'caption']) if (p[key]) media[key] = required(p[key], key);
    if (p.mediaType === 'file' && p.filename) media.filename = required(p.filename, 'filename');
    body.content = { [p.mediaType]: media };
  } else if (action === 'react') {
    if (!/^[1-9]\d{0,18}$/.test(required(p.messageId, 'message_id')) || typeof p.reaction !== 'string') throw new IntegrationError('invalid_reaction');
    body.id = p.messageId; body.reaction = p.reaction;
  } else throw new IntegrationError('unknown_action');
  return body;
}
return messageBody(action, p);
}
