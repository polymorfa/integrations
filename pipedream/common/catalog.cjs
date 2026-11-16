// Generated from shared/. Run npm run generate.
'use strict';

const actions = {
  sendText: { label: 'Send Text', description: 'Sends a text message or replies to a message.', operation: 'sendMessage', fields: ['connection', 'recipientType', 'recipient', 'text', 'quotedMessageId', 'idempotencyKey', 'writeCreatedAt'] },
  sendTemplate: { label: 'Send Template', description: 'Sends a template with its approved name and language.', operation: 'sendMessage', fields: ['connection', 'recipientType', 'recipient', 'templateName', 'language', 'components', 'idempotencyKey', 'writeCreatedAt'] },
  sendMedia: { label: 'Send Media', description: 'Sends an image, video, file or voice message.', operation: 'sendMessage', fields: ['connection', 'recipientType', 'recipient', 'mediaType', 'mediaSource', 'media', 'mimeType', 'caption', 'filename', 'idempotencyKey', 'writeCreatedAt'] },
  react: { label: 'React to Message', description: 'Adds or removes a reaction on a message.', operation: 'sendReaction', fields: ['connection', 'recipientType', 'recipient', 'messageId', 'reaction', 'idempotencyKey', 'writeCreatedAt'] },
  listConnections: { label: 'List Connections', description: 'Lists Connections visible to the connected project.', operation: 'listPlatformConnections', fields: [] },
  listTemplates: { label: 'List Templates', description: 'Lists message templates for a project.', operation: 'listProjectTemplates', fields: ['projectSlug'] },
  apiRequest: { label: 'Make an API Call', description: 'Performs an authorized call to a supported public Polymorfa operation.', operation: null, fields: ['method', 'path', 'requestBody', 'idempotencyKey', 'writeCreatedAt'] },
};
const fields = {
  connection: { label: 'Connection', required: true, help: 'The exact Connection identifier from Polymorfa. Keep it as a string.' },
  recipientType: { label: 'Recipient Type', required: true, options: { phoneNumber: 'Phone Number', id: 'Conversation ID', bsuid: 'Business-scoped User ID' }, default: 'phoneNumber' },
  recipient: { label: 'Recipient', required: true, help: 'Use an international phone number including +, a conversation ID, or a business-scoped user ID.' },
  text: { label: 'Text', required: true },
  quotedMessageId: { label: 'Reply to Message ID', help: 'Use the Polymorfa message ID, not a WhatsApp transport reference.' },
  templateName: { label: 'Template Name', required: true },
  language: { label: 'Template Language', required: true, help: 'The exact language code for the selected template.' },
  components: { label: 'Template Components', json: true, default: '[]', help: 'JSON array matching the template definition.' },
  mediaType: { label: 'Media Type', required: true, options: { image: 'Image', video: 'Video', file: 'File', voice: 'Voice' }, default: 'image' },
  mediaSource: { label: 'Media Source', required: true, options: { url: 'HTTPS URL', base64: 'Base64 Bytes' }, default: 'url' },
  media: { label: 'Media', required: true, help: 'HTTPS URL or raw base64 bytes. Base64 is limited to 4 MiB decoded by these adapters; provider/API limits can be lower.' },
  mimeType: { label: 'MIME Type' },
  caption: { label: 'Caption' },
  filename: { label: 'Filename', help: 'Used for file messages.' },
  messageId: { label: 'Message ID', required: true },
  reaction: { label: 'Reaction', help: 'An emoji. Leave empty to remove the reaction.' },
  idempotencyKey: { label: 'Idempotency Key', help: 'Required for writes. Map a stable business key unique to this write. Preserve it across retries.' },
  writeCreatedAt: { label: 'Write Started At', help: 'Required for writes. ISO timestamp saved when this logical write first began. Preserve it across retries; writes older than 23 hours require reconciliation.' },
  projectSlug: { label: 'Project Slug', required: true },
  method: { label: 'Method', required: true, options: { GET: 'GET', POST: 'POST' }, default: 'GET' },
  path: { label: 'Path', required: true, help: 'A supported relative public API path, for example /platform/connections. External hosts and credential operations are refused.' },
  requestBody: { label: 'Request Body', json: true, default: '{}', help: 'JSON object. Authentication and version headers are supplied by the connection.' },
};
const events = {
  messageReceived: { label: 'New Message', description: 'Triggers when a message is received.', types: ['message.received'] },
  messageState: { label: 'Message State Changed', description: 'Triggers when a message is sent, acknowledged, failed or updated.', types: ['message.sent', 'message.ack', 'message.failed', 'message.update'] },
  connectionState: { label: 'Connection State Changed', description: 'Triggers when a Connection changes state, connects or logs out.', types: ['connection.status', 'connection.connected', 'connection.logged_out'] },
  callEnded: { label: 'Call Ended', description: 'Triggers when a call ends.', types: ['call.ended'] },
};
module.exports = { actions, fields, events };
