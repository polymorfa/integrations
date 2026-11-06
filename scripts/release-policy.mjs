import assert from 'node:assert/strict';

// The reviewed source must match the published commit everywhere except release receipts.
export const RELEASE_GATE_PATHSPEC = Object.freeze(['.', ':(exclude)releases']);

export function validateReleaseIdentity({ ref, source, checkedOut, reviewed, receiptReviewed }) {
  assert.equal(ref, 'refs/heads/main', 'Publication is restricted to main.');
  assert.match(source || '', /^[a-f0-9]{40}$/, 'Dispatch source must be immutable.');
  assert.equal(checkedOut, source, 'Checkout must match the dispatched main commit.');
  assert.match(reviewed || '', /^[a-f0-9]{40}$/, 'Reviewed source must be immutable.');
  assert.equal(reviewed, receiptReviewed, 'Dispatch approval must bind the exact reviewed source receipt.');
}
