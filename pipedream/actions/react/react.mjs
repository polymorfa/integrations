// Generated from shared/catalog.cjs.
import polymorfa from '../../polymorfa.app.mjs';
export default {
  key: "polymorfa-react", name: "React to Message", description: "Adds or removes a reaction on a message.",
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
  "messageId": {
    "type": "string",
    "label": "Message ID",
    "optional": false
  },
  "reaction": {
    "type": "string",
    "label": "Reaction",
    "optional": true,
    "description": "An emoji. Leave empty to remove the reaction."
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
    const input = Object.fromEntries(["session","recipientType","recipient","messageId","reaction","idempotencyKey","writeCreatedAt"].map(key => [key, this[key]]));
    return this.polymorfa.execute($, "react", input);
  },
};
