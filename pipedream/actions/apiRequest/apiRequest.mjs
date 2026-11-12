// Generated from shared/catalog.cjs.
import polymorfa from '../../polymorfa.app.mjs';
export default {
  key: "polymorfa-apiRequest", name: "Make an API Call", description: "Performs an authorized call to a supported public Polymorfa operation.",
  version: '0.1.0', type: 'action',
  props: { polymorfa, ...{
  "method": {
    "type": "string",
    "label": "Method",
    "optional": false,
    "default": "GET",
    "options": [
      {
        "value": "GET",
        "label": "GET"
      },
      {
        "value": "POST",
        "label": "POST"
      }
    ]
  },
  "path": {
    "type": "string",
    "label": "Path",
    "optional": false,
    "description": "A supported relative public API path, for example /platform/sessions. External hosts and credential operations are refused."
  },
  "requestBody": {
    "type": "string",
    "label": "Request Body",
    "optional": true,
    "description": "JSON object. Authentication and version headers are supplied by the connection.",
    "default": "{}"
  },
  "idempotencyKey": {
    "type": "string",
    "label": "Idempotency Key",
    "optional": true,
    "description": "Required for writes. Map a stable business key unique to this write. Preserve it across retries."
  },
  "writeCreatedAt": {
    "type": "string",
    "label": "Write Started At",
    "optional": true,
    "description": "Required for writes. ISO timestamp saved when this logical write first began. Preserve it across retries; writes older than 23 hours require reconciliation."
  }
} },
  async run({ $ }) {
    const input = Object.fromEntries(["method","path","requestBody","idempotencyKey","writeCreatedAt"].map(key => [key, this[key]]));
    return this.polymorfa.execute($, "apiRequest", input);
  },
};
