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

After the provider creates the app directory, prepare the contribution under its
registry conventions, retain MIT attribution and submit the components for review.
An unmerged contribution is not marketplace or Connect availability. No purchase
or embedding of Pipedream Connect is implied by listing Polymorfa as an app.

Examples target Connect action/tool/event use. Do not create recipes around the
Workflows builder scheduled to retire on March 31, 2027.

Pipedream processing has its own residency and retention. Do not imply that a
Polymorfa EU/Brazil Number places external component execution in that region.
