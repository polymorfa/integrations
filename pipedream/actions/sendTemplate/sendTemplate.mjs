// Generated from shared/catalog.cjs.
import polymorfa from '../../polymorfa.app.mjs';
export default {
  key: "polymorfa-sendTemplate", name: "Send Template", description: "Sends a template with its approved name and language.",
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
  "templateName": {
    "type": "string",
    "label": "Template Name",
    "optional": false
  },
  "language": {
    "type": "string",
    "label": "Template Language",
    "optional": false,
    "description": "The exact language code for the selected template."
  },
  "components": {
    "type": "string",
    "label": "Template Components",
    "optional": true,
    "description": "JSON array matching the template definition.",
    "default": "[]"
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
    const input = Object.fromEntries(["session","recipientType","recipient","templateName","language","components","idempotencyKey","writeCreatedAt"].map(key => [key, this[key]]));
    return this.polymorfa.execute($, "sendTemplate", input);
  },
};
