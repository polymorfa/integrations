// @ts-check
import { Make } from '@makehq/sdk';
import { pathToFileURL } from 'node:url';

/** Check app-definition read access only. Never create an app to test a token.
 * @param {NodeJS.ProcessEnv} env
 */
export async function checkMakeAccess(env = process.env) {
  const apiKey = env.MAKE_API_KEY;
  const zone = env.MAKE_ZONE;
  if (!apiKey || !zone) {
    throw new Error('Set MAKE_API_KEY and MAKE_ZONE securely in the runner environment.');
  }
  if (apiKey.trim() !== apiKey || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(zone)) {
    throw new Error('Use the raw token and the exact Make zone hostname without a scheme, path or whitespace.');
  }
  const make = new Make(apiKey, zone);
  try {
    const apps = await make.sdk.apps.list({ cols: ['name', 'version'] });
    // Project only the requested non-secret identity fields, even if a server
    // returns extra fields. Do not log the client, headers or error body.
    return {
      zone,
      readAccess: true,
      writeAccess: 'not tested; verify sdk-apps:write in the token settings',
      apps: apps.map(({ name, version }) => ({ name, version })),
    };
  } catch (error) {
    const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    if (status === 401) throw new Error('Make returned 401. Check the token belongs to the selected zone and remains valid.');
    if (status === 403) throw new Error('Make returned 403. Check sdk-apps:read and the account permissions in the selected zone. App ownership must be checked separately before editing.');
    throw new Error('Make app listing failed. No app was created or changed; the response body was omitted.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 2) {
    console.error('This command takes no arguments. Load MAKE_API_KEY and MAKE_ZONE through the secure environment.');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await checkMakeAccess(), null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Make access check failed.');
      process.exitCode = 1;
    }
  }
}
