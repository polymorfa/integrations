import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseIdentity } from '../scripts/release-policy.mjs';

test('publication requires main and exact immutable dispatch, checkout and review identities', () => {
  const valid = { ref: 'refs/heads/main', source: 'a'.repeat(40), checkedOut: 'a'.repeat(40), reviewed: 'b'.repeat(40), receiptReviewed: 'b'.repeat(40) };
  assert.doesNotThrow(() => validateReleaseIdentity(valid));
  for (const delta of [{ ref: 'refs/heads/unreviewed' }, { source: 'main' }, { checkedOut: 'c'.repeat(40) }, { reviewed: 'main' }, { receiptReviewed: 'd'.repeat(40) }]) {
    assert.throws(() => validateReleaseIdentity({ ...valid, ...delta }));
  }
});

import { RELEASE_GATE_PATHSPEC } from '../scripts/release-policy.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('the release gate rejects post-review changes everywhere except release receipts', t => {
  const root = mkdtempSync(join(tmpdir(), 'polymorfa-release-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } }).trim();
  git('init', '-q');
  for (const [path, text] of [['.npmrc', 'save-exact=true\n'], ['.nvmrc', '24.15.0\n'], ['tests/a.test.cjs', 'ok\n'], ['n8n/package.json', '{}\n'], ['releases/0.1.0.json', '{}\n'], ['README.md', 'x\n']]) {
    mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text);
  }
  git('add', '-A'); git('commit', '-qm', 'reviewed'); const reviewed = git('rev-parse', 'HEAD');
  const gate = () => spawnSync('git', ['diff', '--quiet', reviewed, 'HEAD', '--', ...RELEASE_GATE_PATHSPEC], { cwd: root }).status;
  writeFileSync(join(root, 'releases/0.1.0.json'), '{"reviewedSource":"x"}\n'); git('commit', '-qam', 'receipt');
  assert.equal(gate(), 0, 'a receipt-only change passes');
  for (const path of ['.npmrc', '.nvmrc', 'tests/a.test.cjs', 'README.md', 'n8n/package.json']) {
    writeFileSync(join(root, path), 'changed\n'); git('commit', '-qam', 'change ' + path);
    assert.equal(gate(), 1, `${path} change is refused`);
    git('reset', '-q', '--hard', 'HEAD~1');
  }
});

test('the publication workflow gates source before repository code runs with an OIDC token', () => {
  const workflow = readFileSync('.github/workflows/publish-n8n.yml', 'utf8');
  const [verify, publish] = workflow.split(/\n  publish:\n/);
  assert.ok(publish, 'publish is a separate job');
  assert.doesNotMatch(verify, /id-token/); assert.match(publish, /id-token: write/); assert.match(publish, /needs: verify/);
  assert.ok(verify.indexOf('node scripts/release-gate.mjs') < verify.indexOf('setup-node'), 'the verify job gates before installing or testing');
  const gateAt = publish.indexOf('Check reviewed source binding');
  assert.ok(gateAt > 0 && gateAt < publish.indexOf('setup-node') && gateAt < publish.indexOf('- run: npm'), 'the publish job gates before Node setup and npm');
  assert.ok(!/node |npm run/.test(publish.slice(publish.indexOf('actions/checkout'), publish.indexOf('setup-node'))), 'the publish gate runs no repository code');
  assert.ok(publish.includes(`git diff --exit-code "$RELEASE_REVIEWED_SOURCE" HEAD -- ${RELEASE_GATE_PATHSPEC.map(p => p === '.' ? '.' : `'${p}'`).join(' ')}`));
});
