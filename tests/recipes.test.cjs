'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const recipe = require('../recipes/n8n/order-notification.json');

test('order notification rejects an absent business identity before the send node', () => {
  const validate = recipe.nodes.find(n => n.id === 'validate-order');
  assert.equal(recipe.connections['Replace with authorized order trigger'].main[0][0].node, validate.name);
  assert.equal(recipe.connections[validate.name].main[0][0].node, 'Send order notification');
  const run = item => vm.runInNewContext(`(function () { ${validate.parameters.jsCode} })()`, { $input: { all: () => [{ json: item }] } });
  for (const notificationId of [undefined, null, '', '  ', 0]) assert.throws(() => run({ notificationId }));
  assert.equal(run({ notificationId: 'saved-order-1' })[0].json.notificationId, 'saved-order-1');
});
