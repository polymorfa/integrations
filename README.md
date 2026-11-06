# Polymorfa integrations

First-party integrations for n8n, Make, Zapier and Pipedream.

This repository is under development. Source availability does not mean an app
has been published, approved or listed in a provider's marketplace. Provider
release evidence is recorded in `releases/`.

The integrations follow the same public API contract as the Polymorfa SDKs.
They use each platform's own request and credential APIs. No integration builds
a separate workflow engine or stores your third-party app connections.

Documentation: [docs.polymorfa.com](https://docs.polymorfa.com).

Webhook triggers ask for one value: a subscription key that identifies the
trigger and stays stable. Each activation registers its own webhook with a
creation nonce the adapter generates and keeps in the platform's private trigger
state. A retry of an uncertain activation reuses that nonce, so it cannot create
a second webhook. Turning a trigger off and on again uses a new nonce. Before
creating, every adapter looks for its owned webhook and adopts it, and after
creating it confirms the webhook is live. If the API replays a receipt for a
webhook that was since deleted, activation fails with
`subscription_receipt_deleted` instead of reporting a working trigger; the next
activation registers a new webhook. Native editor acceptance remains pending.

Build and maintenance: [MAINTAINING.md](MAINTAINING.md).
Provider source: [n8n](n8n/README.md), [Make](make/README.md),
[Zapier](zapier/README.md), [Pipedream](pipedream/README.md).
[Recipe candidates](recipes/README.md) and [release state](releases/0.1.0.json)
record the remaining native acceptance and publication work.

License: MIT. Newly authored connector code only; no archived Titan adapter code
is included.
