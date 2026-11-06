import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = JSON.parse(readFileSync('contracts/source.json'));
const coverage = JSON.parse(readFileSync('contracts/coverage.json'));
const { actions, events } = require('../shared/catalog.cjs');
assert.equal(source.apiVersion, require('../shared/core.cjs').VERSION);
const operationIds = new Set(); const eventTypes = new Set();
for (const [kind, pin] of Object.entries(source.specs)) {
  const raw = readFileSync(pin.snapshot);
  assert.equal(createHash('sha256').update(raw).digest('hex'), pin.sha256, `${kind} snapshot changed without repinning`);
  const spec = JSON.parse(raw);
  for (const [path, methods] of Object.entries(spec.paths)) for (const [method, operation] of Object.entries(methods)) {
    const entry = coverage.operations[operation.operationId];
    assert.ok(entry, `Unexpected operation ${operation.operationId}`);
    assert.equal(entry.contract, kind); assert.equal(entry.path, path); assert.equal(entry.method, method.toUpperCase());
    operationIds.add(operation.operationId);
  }
  for (const schema of Object.values(spec.components.schemas)) for (const value of schema.properties?.event?.enum || []) eventTypes.add(value);
  assert.ok(!Object.keys(spec.paths).some(p => /functions|admin|console|quicklink|credentials/i.test(p)));
}
assert.equal(operationIds.size, Object.keys(coverage.operations).length);
for (const a of Object.values(actions)) if (a.operation) assert.ok(operationIds.has(a.operation));
for (const group of Object.values(events)) for (const type of group.types) assert.ok(eventTypes.has(type), `Missing public event ${type}`);
console.log(`Public contract verified: ${operationIds.size} operations, ${eventTypes.size} event types; SDK pin ${source.sdk.source}.`);
