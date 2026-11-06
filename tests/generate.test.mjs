import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const inputs = ['shared', 'fixtures', 'contracts', 'LICENSE', 'NOTICE.md', 'scripts/generate.mjs', 'n8n/shared', 'n8n/LICENSE', 'n8n/NOTICE.md', 'zapier/shared', 'pipedream', 'make'];
function copy() {
  const root = mkdtempSync(join(tmpdir(), 'polymorfa-generate-'));
  for (const path of inputs) cpSync(path, join(root, path), { recursive: true });
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, ['scripts/generate.mjs', ...args], { cwd: root, encoding: 'utf8' });

test('generated-file check fails on stale files the generator no longer emits, and generate removes them', t => {
  const root = copy(); t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(run(root, '--check').status, 0);
  const stale = ['pipedream/actions/removedAction/removedAction.mjs', 'make/modules/removedModule/metadata.json', 'make/functions/polymorfaRemoved.js', 'make/webhooks/messageReceived/extra.json', 'zapier/shared/old.cjs'];
  for (const path of stale) { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), 'stale\n'); }
  const result = run(root, '--check');
  assert.equal(result.status, 1);
  for (const path of stale) assert.match(result.stderr, new RegExp(`Stale generated file: ${path.replace(/[./]/g, '\\$&')}`));
  assert.equal(run(root).status, 0);
  for (const path of stale) assert.equal(existsSync(join(root, path)), false);
  assert.equal(existsSync(join(root, 'pipedream/actions/removedAction')), false);
  assert.equal(existsSync(join(root, 'pipedream/polymorfa.app.mjs')), true, 'hand-written files outside generated directories are kept');
  assert.equal(run(root, '--check').status, 0);
});
