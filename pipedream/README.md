# Polymorfa for Pipedream

Connect-compatible component source for a dedicated Polymorfa app record. No app
record has been requested and no registry PR has been submitted. The app slug
`polymorfa` is the requested identifier; its actual assignment is provider-owned.

The requested custom authentication fields are `api_key` (a secret project token)
and `project_id` (its project UUID). Verify credentials through
`GET /platform/sessions?projectId=...` with the accepted `Polymorfa-Version`.
This needs `sessions:read`. Restrict each connection's remaining scopes to its
actions and hooks. Never use dashboard cookies or client-token impersonation.

Each native action uses `polymorfa.app.mjs` and the provider's Axios helper with
redirects disabled. Each source owns its hook ID, authenticates the per-source
verifier and emits the public event envelope with `id` as its native dedupe key.
Confirm lifecycle, log redaction, Connect actions/events and MCP tools on the real
assigned app record before acceptance.

Each delivery must carry a valid `X-Webhook-Signature` header, an HMAC-SHA256 of
the exact raw request body made with the endpoint's signing secret. The trigger
checks it against the raw bytes before parsing the body, and also checks its
marker header. A missing, duplicate or invalid signature, a missing raw body or
a missing stored secret rejects the delivery. The source's signing secret is
kept in `$.service.db` and never emitted. Activation returns the secret from the create response, or rotates it
(zero overlap) when the webhook already exists, so activating a trigger replaces
any earlier secret for that webhook.

Triggers saved before signature verification have no stored secret and reject
every delivery. Deactivate and redeploy (activate again) the source to rotate and store a fresh secret.
Rotating the endpoint's signing secret in the Polymorfa Console also invalidates
the stored secret and rejects deliveries until the trigger is reactivated.

The signature is checked against `event.bodyRaw`. A delivery without it is
rejected. This field name comes from Pipedream's HTTP source documentation and is
not in the installed `@pipedream/platform` types; confirm it on a real source.

After the provider creates the app directory, prepare the contribution under its
registry conventions, retain MIT attribution and submit the components for review.
An unmerged contribution is not marketplace or Connect availability. No purchase
or embedding of Pipedream Connect is implied by listing Polymorfa as an app.

Examples target Connect action/tool/event use. Do not create recipes around the
Workflows builder scheduled to retire on March 31, 2027.

Pipedream processing has its own residency and retention. Do not imply that a
Polymorfa EU/Brazil Number places external component execution in that region.
