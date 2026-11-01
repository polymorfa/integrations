import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
const source = JSON.parse(readFileSync('contracts/source.json'));
const coverage = JSON.parse(readFileSync('contracts/coverage.json'));
// Compare SDK contract fragments only. Never import an SDK's extra/private operations.
let mode = source.sdk.source;
if (!process.argv.includes('--pinned')) {
  const response = await fetch(`https://api.github.com/repos/${source.sdk.repository}/commits/main`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`SDK head unavailable: HTTP ${response.status}`);
  mode = (await response.json()).sha;
  if (!/^[a-f0-9]{40}$/.test(mode)) throw new Error('Invalid SDK source identity.');
}
const baseline = JSON.parse(readFileSync('contracts/sdk-baseline.json'));
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
};
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const semantic = value => {
  if (Array.isArray(value)) return value.map(semantic);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !['description', 'summary', 'example', 'examples', 'x-mint', 'externalDocs'].includes(k)).map(([k, v]) => [k, semantic(v)]));
};
let failures = 0;
if (mode !== source.sdk.source) { console.error(`SDK main advanced to ${mode}; review its covered behavior and update the integration pin in the same feature cycle.`); failures++; }
let audienceDifferences = 0;
for (const [kind, pin] of Object.entries(source.specs)) {
  const url = `https://raw.githubusercontent.com/${source.sdk.repository}/${mode}/${pin.sdkSnapshotPath}`;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`SDK snapshot unavailable: HTTP ${response.status}`);
  const sdk = await response.json(); const local = JSON.parse(readFileSync(pin.snapshot));
  const seen = new Set();
  const compare = (a, b, label) => {
    const key = label.startsWith(kind + ':') ? label.slice(kind.length + 1) : label;
    if ((b === undefined ? undefined : hash(b)) !== baseline.fragments[kind][key]) { console.error(`SDK drift from reviewed baseline: ${label}`); failures++; }
    if (!isDeepStrictEqual(semantic(a), semantic(b))) audienceDifferences++;
    const visit = v => {
      if (Array.isArray(v)) return v.forEach(visit);
      if (!v || typeof v !== 'object') return;
      if (typeof v.$ref === 'string' && !seen.has(v.$ref)) {
        seen.add(v.$ref); const [, , section, name] = v.$ref.split('/');
        compare(local.components[section]?.[name], sdk.components?.[section]?.[name], `${kind}:${v.$ref}`);
      }
      Object.values(v).forEach(visit);
    }; visit(a);
  };
  for (const item of Object.values(coverage.operations).filter(v => v.contract === kind)) compare(local.paths[item.path][item.method.toLowerCase()], sdk.paths?.[item.path]?.[item.method.toLowerCase()], `${item.method} ${item.path}`);
}
if (failures) { console.error(`${failures} changed fragments require an SDK/API reconciliation. No files were repinned.`); process.exitCode = 1; }
else console.log(`Covered SDK fragments match the reviewed ${source.sdk.repository}@${mode} baseline. ${audienceDifferences} API/SDK audience differences remain explicit; request compatibility is checked separately by check:sdk.`);
