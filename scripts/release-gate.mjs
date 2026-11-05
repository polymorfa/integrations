import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateReleaseIdentity } from './release-policy.mjs';
const pkg = JSON.parse(readFileSync('n8n/package.json'));
assert.equal(process.env.RELEASE_VERSION, pkg.version, 'Dispatch version must match the reviewed package.');
const receipt = JSON.parse(readFileSync(`releases/${pkg.version}.json`));
for (const key of ['reviewedSource', 'apiProductionAcceptance', 'n8nRuntimeAcceptance', 'publisherOwnership', 'publicationAuthorization']) assert.ok(typeof receipt[key] === 'string' && receipt[key].length > 10, `Missing ${key} receipt. Source completion is not publication authority.`);
assert.match(receipt.reviewedSource, /^[a-f0-9]{40}$/);
validateReleaseIdentity({ ref: process.env.RELEASE_REF, source: process.env.RELEASE_SOURCE,
  checkedOut: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  reviewed: process.env.RELEASE_REVIEWED_SOURCE, receiptReviewed: receipt.reviewedSource });
execFileSync('git', ['merge-base', '--is-ancestor', receipt.reviewedSource, process.env.RELEASE_SOURCE]);
// Receipt-only changes may follow the reviewed candidate; executable source must match.
execFileSync('git', ['diff', '--exit-code', receipt.reviewedSource, 'HEAD', '--', 'shared', 'n8n', 'contracts', 'scripts', 'fixtures', 'package.json', 'package-lock.json', '.github/workflows/publish-n8n.yml'], { stdio: 'inherit' });
console.log('Required publication receipts are recorded. Protected environment approval and npm trusted publisher configuration remain required.');
