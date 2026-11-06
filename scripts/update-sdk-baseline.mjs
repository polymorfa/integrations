import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const source = JSON.parse(readFileSync('contracts/source.json'));
assert.equal(process.argv[2], source.sdk.source, 'Pass the exact reviewed SDK source SHA. Repinning is a deliberate PR change.');
const coverage = JSON.parse(readFileSync('contracts/coverage.json'));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const fragments = {};
for (const [kind, pin] of Object.entries(source.specs)) {
  const response = await fetch(`https://raw.githubusercontent.com/${source.sdk.repository}/${source.sdk.source}/${pin.sdkSnapshotPath}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `SDK ${kind} HTTP ${response.status}`);
  const sdk = await response.json(); const local = JSON.parse(readFileSync(pin.snapshot));
  const entries = {}; const seen = new Set();
  const visit = v => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    if (typeof v.$ref === 'string' && !seen.has(v.$ref)) {
      seen.add(v.$ref); const [, , section, name] = v.$ref.split('/');
      const part = sdk.components?.[section]?.[name];
      if (part) { entries[v.$ref] = hash(part); visit(part); }
    }
    Object.values(v).forEach(visit);
  };
  for (const operation of Object.values(coverage.operations).filter(o => o.contract === kind)) {
    const op = sdk.paths?.[operation.path]?.[operation.method.toLowerCase()];
    assert.ok(op, `Missing SDK operation ${operation.method} ${operation.path}`);
    entries[`${operation.method} ${operation.path}`] = hash(op); visit(op);
    visit(local.paths[operation.path][operation.method.toLowerCase()]);
  }
  fragments[kind] = entries;
}
writeFileSync('contracts/sdk-baseline.json', JSON.stringify({ source: source.sdk.source, note: 'Fingerprints of reviewed public SDK fragments. The SDK audience differs from the public API projection; no extra operation is imported. Changes require reconciliation, not automatic repinning.', fragments }, null, 2) + '\n');
console.log(`Updated SDK fragment fingerprints from immutable source ${source.sdk.source}; review the diff before committing.`);
