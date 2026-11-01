# Polymorfa for Make

Native Custom App source, not a published or approved Make app. `app.json` holds
app metadata; `base.json` holds shared request settings. Component directories
separate metadata, parameters, communication and interfaces for review/upload
through Make's app tooling. They are source artifacts, not a scenario blueprint.

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
