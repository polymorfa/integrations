# Changelog

## Unreleased

- Separate webhook receiver secrets from public marker/idempotency metadata.
- Remove the Webhook Creation Key field from all triggers. Each activation uses
  its own adapter-generated nonce, so off/on, n8n test listening and Pipedream
  redeploys work, and a receipt for a deleted webhook is refused.
- Make: detach reads the recorded webhook by ID; unusual URLs on unrelated
  project webhooks no longer break attach.
- Zapier: accept the documented `Http-` prefixed raw request header form.
- The n8n inbound handoff recipe derives its subscription key from the workflow ID.
- Preserve definite subscription errors and non-JSON uncertain outcomes;
  normalize callback ownership and native Zapier response headers.
- Keep successful n8n batch items when Continue On Fail is enabled. Require
  saved notification identities before recipe sends and write identities in Zapier.
- Restrict n8n publication dispatch to main and bind its reviewed source receipt.

- First-party source for n8n, Make, Zapier and Pipedream with a common public API
  and SDK contract pin.
- Text/replies, templates, URL/base64 media, reactions, Number/template lookup
  and allowlisted API calls. n8n also maps native binary inputs.
- Owned project-webhook subscriptions for messages, message state, Number state
  and completed calls, with authenticated receivers and stable event identity.
- Explicit recovery for completed/uncertain writes and conservative retry age.
- Contract/generation checks, SDK drift detection and provider release records.

This is development source. No registry publication, provider approval or public
marketplace listing is established. Functions and message-operation lookup are
excluded until their public contracts are accepted.
