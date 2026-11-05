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
