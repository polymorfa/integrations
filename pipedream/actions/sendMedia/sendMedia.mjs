// Generated from shared/catalog.cjs.
import polymorfa from '../../polymorfa.app.mjs';
export default {
  key: "polymorfa-sendMedia", name: "Send Media", description: "Sends an image, video, file or voice message.",
  version: '0.1.0', type: 'action',
  props: { polymorfa, ...{
  "session": {
    "type": "string",
    "label": "Number",
    "optional": false,
    "description": "The exact Number identifier from Polymorfa. Keep it as a string."
  },
  "recipientType": {
    "type": "string",
    "label": "Recipient Type",
    "optional": false,
    "default": "phoneNumber",
    "options": [
      {
        "value": "phoneNumber",
        "label": "Phone Number"
      },
      {
        "value": "id",
        "label": "Conversation ID"
      },
      {
        "value": "bsuid",
        "label": "Business-scoped User ID"
      }
    ]
  },
  "recipient": {
    "type": "string",
    "label": "Recipient",
    "optional": false,
    "description": "Use an international phone number including +, a conversation ID, or a business-scoped user ID."
  },
  "mediaType": {
    "type": "string",
    "label": "Media Type",
    "optional": false,
    "default": "image",
    "options": [
      {
        "value": "image",
        "label": "Image"
      },
      {
        "value": "video",
        "label": "Video"
      },
      {
        "value": "file",
        "label": "File"
      },
      {
        "value": "voice",
        "label": "Voice"
      }
    ]
  },
  "mediaSource": {
    "type": "string",
    "label": "Media Source",
    "optional": false,
    "default": "url",
    "options": [
      {
        "value": "url",
        "label": "HTTPS URL"
      },
      {
        "value": "base64",
        "label": "Base64 Bytes"
      }
    ]
  },
  "media": {
    "type": "string",
    "label": "Media",
    "optional": false,
    "description": "HTTPS URL or raw base64 bytes. Base64 is limited to 4 MiB decoded by these adapters; provider/API limits can be lower."
  },
  "mimeType": {
    "type": "string",
    "label": "MIME Type",
    "optional": true
  },
  "caption": {
    "type": "string",
    "label": "Caption",
    "optional": true
  },
  "filename": {
    "type": "string",
    "label": "Filename",
    "optional": true,
    "description": "Used for file messages."
  },
  "idempotencyKey": {
    "type": "string",
    "label": "Idempotency Key",
    "optional": false,
    "description": "Required for writes. Map a stable business key unique to this write. Preserve it across retries."
  },
  "writeCreatedAt": {
    "type": "string",
    "label": "Write Started At",
    "optional": false,
    "description": "Required for writes. ISO timestamp saved when this logical write first began. Preserve it across retries; writes older than 23 hours require reconciliation."
  }
} },
  async run({ $ }) {
    const input = Object.fromEntries(["session","recipientType","recipient","mediaType","mediaSource","media","mimeType","caption","filename","idempotencyKey","writeCreatedAt"].map(key => [key, this[key]]));
    return this.polymorfa.execute($, "sendMedia", input);
  },
};
