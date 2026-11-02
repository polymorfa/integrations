# Polymorfa for Make

Native Custom App source, not a published or approved Make app. `app.json` holds
app metadata; `base.json` holds shared request settings. Component directories
separate metadata, parameters, communication and interfaces for review/upload
through Make's app tooling. They are source artifacts, not a scenario blueprint.

Marketplace connections are being revised to use browser-based OAuth consent.
The API-key connection files remain an earlier source candidate. They are not
the accepted marketplace login experience and have not been uploaded.

## Authoring access

The management client is pinned to `@makehq/sdk` 1.9.0 in the root lockfile. It
requires Node 20 or later; this repository uses its pinned Node 24 builder.
Custom-app authoring uses `make.sdk`, separate from runtime connections and the
Polymorfa OAuth client that customers will authorize.

Sign in to the intended Make account yourself and copy the organization's zone
hostname from its dashboard URL. Do not infer it from location. In Profile >
API, create a token with only `sdk-apps:read` and `sdk-apps:write`. Store the raw
token as `MAKE_API_KEY` and the hostname as `MAKE_ZONE` in the runner's secure
environment. An ignored local `.env` is also supported through Node's loader:

```sh
node --env-file=.env scripts/make-access.mjs
```

With the variables already loaded, run `npm run make:access`. The command uses
`new Make(apiKey, zone)` and `make.sdk.apps.list({ cols: ['name', 'version'] })`.
An empty list is valid. This checks read access only, never writes, creates a
runtime connection, or runs a scenario. Verify the write scope in the token's
settings. No team ID or extra scopes are required for this check.

Resolve the exact app/version and origin zone before editing an existing app.
Private upload and complete component readback remain pending the OAuth
contract, authoring access and native schema corrections. No upload command is
implemented by the access check.

Token setup: [official guide](https://developers.make.com/api-documentation/authentication/create-authentication-token).

## Component candidate

`functions/` contains generated custom IML functions, each below 5,000 characters.
Make must enable custom functions for the publisher. Local tests execute their
JavaScript with a small IML shim; they do not qualify Make's actual interpreter,
function bindings or private webhook parameter storage.

Create the **project** connection, then the functions, modules and dedicated
webhooks under one Polymorfa-owned app. Keep API keys and derived receiver values
in private connection/webhook state. Map static and mappable parameter files in
the native editor. Real API upload/import and editor acceptance are pending.

Connection tests require `sessions:read`. Sends/reactions need `messages:write`,
template lookup `templates:read`, and hooks `webhooks:read` plus `webhooks:manage`.
The universal **Make an API call** module permits only the public allowlist on
the fixed Polymorfa origin; it cannot call arbitrary hosts or change principals.

Writes require a stable business idempotency key and saved ISO start time. Map
native files to base64 and MIME type within the 4 MiB decoded connector limit.
Use string IDs. Deduplicate project-wide events by their stable event ID before
effects. Stop and reconcile incomplete/ambiguous hook inventories; do not create
another endpoint blindly.

The acceptance record must cover every module's success and error paths, field
mapping, file conversion, receiver authentication, actual IML evaluation,
pagination, retries, cleanup and secret redaction. Submit for public QA only
after those scenarios work. Make publication is irreversible; use supported
version/module controls for rollback.

Make's execution and retention locations are separate from Polymorfa EU/Brazil
hosting. Configure both deliberately before processing customer content.
