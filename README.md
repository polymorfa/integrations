# Polymorfa integrations

First-party integrations for n8n, Make, Zapier and Pipedream.

This repository is under development. Source availability does not mean an app
has been published, approved or listed in a provider's marketplace. Provider
release evidence is recorded in `releases/`.

The integrations follow the same public API contract as the Polymorfa SDKs.
They use each platform's own request and credential APIs. No integration builds
a separate workflow engine or stores your third-party app connections.

Documentation: [docs.polymorfa.com](https://docs.polymorfa.com).

Webhook triggers save two values in their native configuration. The subscription
key identifies the trigger and stays stable. The webhook creation key identifies
one registration attempt and stays the same across uncertain retries. Change the
creation key only after confirming that the previous registration was deleted.
Reusing a deleted registration's key fails reconciliation instead of reporting a
working trigger. An old or uncertain registration needs inventory reconciliation
before a new creation key is used. Native editor acceptance remains pending.

Build and maintenance: [MAINTAINING.md](MAINTAINING.md).
Provider source: [n8n](n8n/README.md), [Make](make/README.md),
[Zapier](zapier/README.md), [Pipedream](pipedream/README.md).
[Recipe candidates](recipes/README.md) and [release state](releases/0.1.0.json)
record the remaining native acceptance and publication work.

License: MIT. Newly authored connector code only; no archived Titan adapter code
is included.
