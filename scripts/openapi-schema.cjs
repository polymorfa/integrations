'use strict';
const assert = require('node:assert/strict');
// Convert OpenAPI 3.0's draft-04 exclusive bounds without changing constraints.
module.exports = function openApi3(value) {
  if (Array.isArray(value)) return value.map(openApi3);
  if (!value || typeof value !== 'object') return value;
  const out = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, openApi3(v)]));
  for (const [exclusive, bound] of [['exclusiveMinimum', 'minimum'], ['exclusiveMaximum', 'maximum']]) {
    if (typeof out[exclusive] === 'boolean') {
      const enabled = out[exclusive]; delete out[exclusive];
      if (enabled) { assert.equal(typeof out[bound], 'number'); out[exclusive] = out[bound]; delete out[bound]; }
    }
  }
  return out;
};
