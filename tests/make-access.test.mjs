import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMakeAccess } from '../scripts/make-access.mjs';

const env = { MAKE_API_KEY: 'synthetic-not-a-token', MAKE_ZONE: 'eu1.make.com' };

test('Make authoring access refuses missing credentials or malformed zones before any request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  for (const invalid of [{}, { MAKE_ZONE: env.MAKE_ZONE }, { ...env, MAKE_ZONE: 'https://eu1.make.com/api/v2' }, { ...env, MAKE_API_KEY: ' token ' }]) {
    await assert.rejects(checkMakeAccess(invalid));
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('Make authoring access uses the installed SDK, accepts an empty app list and performs only GET', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://eu1.make.com');
    assert.equal(url.pathname, '/api/v2/sdk/apps');
    assert.equal(init?.method ?? 'GET', 'GET');
    assert.match(decodeURIComponent(url.search), /name/);
    assert.match(decodeURIComponent(url.search), /version/);
    return Response.json({ apps: [] });
  });
  const result = await checkMakeAccess(env);
  assert.equal(result.readAccess, true);
  assert.deepEqual(result.apps, []);
  assert.match(result.writeAccess, /not tested/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('Make authoring access omits extra app fields and credential-bearing error bodies', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ apps: [{ name: 'polymorfa-test', version: 1, secret: env.MAKE_API_KEY }] }));
  assert.deepEqual((await checkMakeAccess(env)).apps, [{ name: 'polymorfa-test', version: 1 }]);
  t.mock.restoreAll();
  for (const status of [401, 403, 500]) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ message: env.MAKE_API_KEY }, { status }));
    await assert.rejects(checkMakeAccess(env), error => {
      assert.ok(!error.message.includes(env.MAKE_API_KEY));
      assert.match(error.message, status === 500 ? /listing failed/ : new RegExp(String(status)));
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
    t.mock.restoreAll();
  }
});
