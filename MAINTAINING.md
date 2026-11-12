# Maintain the integrations with the SDKs

Use Node 24.15.0 and npm 11.20.0 for the build tools. The generated JavaScript is
also checked on Node 22.23.2 for the Zapier execution boundary. These checks do
not establish the versions deployed by a provider.

```sh
npm ci --ignore-scripts
npm run check
npm run lint --workspace n8n-nodes-polymorfa
npm run validate:zapier
npm run check:sdk
node scripts/check-upstream.mjs --pinned
```

`shared/` owns the action fields, event groups, request mapping and recovery
behavior. `npm run generate` copies that code into independently deployable
native packages and generates Make functions and Pipedream components. Do not
edit generated files directly. CI rejects stale generated output, including
files in generated directories that the generator no longer emits; `npm run
generate` removes them.

`contracts/source.json` pins the public API audience and matching SDK source.
`coverage.json` identifies each allowed operation and deliberate exclusions.
The public snapshots contain only these operations and their referenced schemas.
Do not import the complete management API or an SDK's extra operation catalog.

The SDK's baseline also contains fields outside this public audience, including
transport selection. The adapters do not expose them. `check:sdk` validates the
actual request cases against the pinned SDK schemas. `sdk-baseline.json` records
the corresponding reviewed SDK fragment fingerprints. `check:upstream` compares
them to current SDK `main`; its scheduled workflow reports changes without
repinning, publishing or creating an app. The pinned check is reproducible even
when SDK `main` advances.

For a relevant API/SDK change, update the accepted public snapshot, source/hash
metadata, coverage and every affected adapter. Add an exclusion with its reason
when a capability is intentionally unavailable. Test errors, IDs, media, hooks,
pagination and uncertain writes where affected. Regenerate all packages and
update native recipe mappings. Keep one integrations PR for that feature cycle.

Record real provider tests separately from these local fixtures. Include exact
source/app versions and the accepted API revision. Update the owning product
feature, issue, release record, customer documentation and provider submission.
Source merge, package publication, app review and public listing are distinct.

The n8n publication workflow is manual, uses npm provenance and requires recorded
receipts. Configure a protected `npm-release` environment and a Polymorfa-owned
npm trusted publisher before use. No provider account, environment protection or
trusted publisher has been configured by adding this workflow. Review is still
required; the gate is bookkeeping and does not authenticate human authorization.

Publication accepts only a `main` dispatch, checks out its immutable commit, and
requires the dispatch's reviewed-source commit to match the release receipt. Every
path except `releases/` must match the reviewed source, including tests, `.npmrc`
and `.nvmrc`. The `verify` job runs the gate before any install or test and has no
OIDC token. The `publish` job, which has `id-token: write`, repeats the check with
git and jq before Node setup, `.npmrc` use or any repository script. Restrict the `npm-release` environment to protected `main`
and require an independent release reviewer before enabling the trusted publisher.
These external settings cannot be secured by editable workflow code alone.

Webhook marker names, receiver verifiers and create-key seeds use separate HMAC
domains. The create key is `HMAC(markerKey, nonce)`. `hooks.activate` generates
a random nonce per activation and saves it in provider-private state before the
create: n8n node static data, Pipedream `$.service.db`, Zapier and Make in the
single `performSubscribe` call or attach run (neither platform offers state that
persists before those return). An uncertain retry of the same activation reuses
the nonce; a confirmed activation, a deletion or a replayed receipt for a deleted
webhook (`subscription_receipt_deleted`) clears it. Find-before-create and the
post-create live-ownership check stay in place. Users no longer enter a webhook
creation key. This is a change before the first release; no migration is implied.

Keep API credentials in each provider's credential store. Webhook receivers use
an authenticated per-subscription header supported by the public subscription
contract. A stable unique subscription key determines its private verifier.
Reactivation reuses its owned hook; another callback cannot reuse the key while
that hook exists. Changing a verifier or connection requires explicit lifecycle
and rotation testing. The adapters never emit signing secrets or add a relay.

All delivery channels can repeat events. Use the event ID in downstream dedupe
storage and a stable business key for effects. Zapier and Pipedream also use that
event ID in their native dedupe paths. No unbounded exactly-once claim is made.
Native n8n and Make consumers must persist their own processed-event IDs.

Revoking an API key does not delete an existing webhook endpoint. Disable/delete
the owned endpoint before withdrawing a connection, or remove it through an
authorized project management path if the key is already revoked. Never use a
broader credential automatically. Verify provider log redaction and callback
cleanup during acceptance, including failed cleanup and credential rotation.

Make uses provider-native custom IML functions, which require enablement by Make.
The generated JavaScript functions are tested, but their IML bindings, private
webhook-state mapping and attach/detach behavior require real platform acceptance.
Its attach preflight refuses inventories larger than one page instead of risking
a duplicate. Detach reads the recorded webhook by ID, so cleanup works in any
project size. Qualify attach pagination in Make before approving large-project
triggers. Its hook matching treats an unparseable URL as no match, as the shared
code does; a test runs both over the same inventories.
