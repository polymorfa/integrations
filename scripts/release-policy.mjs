import assert from 'node:assert/strict';

export function validateReleaseIdentity({ ref, source, checkedOut, reviewed, receiptReviewed }) {
  assert.equal(ref, 'refs/heads/main', 'Publication is restricted to main.');
  assert.match(source || '', /^[a-f0-9]{40}$/, 'Dispatch source must be immutable.');
  assert.equal(checkedOut, source, 'Checkout must match the dispatched main commit.');
  assert.match(reviewed || '', /^[a-f0-9]{40}$/, 'Reviewed source must be immutable.');
  assert.equal(reviewed, receiptReviewed, 'Dispatch approval must bind the exact reviewed source receipt.');
}
