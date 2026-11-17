import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Project only covered public operations and their referenced components. Event
// schemas are independent roots because OpenAPI does not reference webhooks from
// HTTP operations. Security requirements also reference named components.
export function projectContract(spec, kind, coverage, eventTypes) {
  const components = { schemas: {} }; const paths = {}; const seen = new Set();
  const include = (section, name) => {
    const key = `${section}/${name}`;
    if (seen.has(key)) return;
    const value = spec.components?.[section]?.[name];
    assert.ok(value, `Missing public component ${key}`);
    seen.add(key); (components[section] ??= {})[name] = value; visit(value);
  };
  const visit = value => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const match = /^#\/components\/([^/]+)\/([^/]+)$/.exec(value.$ref);
      assert.ok(match, `Unsupported public reference ${value.$ref}`);
      include(match[1], match[2]);
    }
    if (Array.isArray(value.security)) for (const requirement of value.security) for (const name of Object.keys(requirement)) include('securitySchemes', name);
    Object.values(value).forEach(visit);
  };
  if (spec.security) visit({ security: spec.security });
  for (const [operationId, operation] of Object.entries(coverage.operations).filter(([, item]) => item.contract === kind)) {
    const method = operation.method.toLowerCase(); const item = spec.paths[operation.path];
    assert.equal(item?.[method]?.operationId, operationId, `Missing covered public operation ${operationId}`);
    const target = paths[operation.path] ??= {};
    if (item.parameters) { target.parameters = item.parameters; visit(item.parameters); }
    target[method] = item[method]; visit(item[method]);
  }
  if (kind === 'messaging') for (const [name, schema] of Object.entries(spec.components.schemas)) {
    if (schema.properties?.event?.enum?.some(type => eventTypes.includes(type))) include('schemas', name);
  }
  return { openapi: spec.openapi, info: spec.info, ...(spec.servers ? { servers: spec.servers } : {}), ...(spec.security ? { security: spec.security } : {}), paths, components };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const value = name => args[args.indexOf(name) + 1];
  assert.ok(args.includes('--api-root') && args.includes('--source'), 'Pass --api-root and immutable --source SHA.');
  const sourceSha = value('--source'); assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const source = JSON.parse(readFileSync('contracts/source.json'));
  const coverage = JSON.parse(readFileSync('contracts/coverage.json'));
  const events = Object.values(require('../shared/catalog.cjs').events).flatMap(event => event.types);
  for (const [kind, pin] of Object.entries(source.specs)) {
    const bytes = execFileSync('git', ['-C', value('--api-root'), 'show', `${sourceSha}:${pin.publicSourcePath}`], { maxBuffer: 32 * 1024 * 1024 });
    const spec = JSON.parse(bytes); const projected = projectContract(spec, kind, coverage, events);
    const snapshot = JSON.stringify(projected, null, 2) + '\n';
    writeFileSync(pin.snapshot, snapshot);
    pin.publicSourceSha256 = createHash('sha256').update(bytes).digest('hex');
    pin.sha256 = createHash('sha256').update(snapshot).digest('hex');
  }
  source.apiSource = sourceSha;
  writeFileSync('contracts/source.json', JSON.stringify(source, null, 2) + '\n');
  console.log(`Projected nine covered public operations from ${sourceSha}. SDK binding and release acceptance remain separate.`);
}
