# Integration maintenance

Keep n8n, Make, Zapier and Pipedream aligned with the same accepted public API
and SDK contract. Inspect `contracts/source.json`, `contracts/coverage.json`
and the affected native adapter before editing. Preserve unrelated changes.

Use `npm ci`, `npm run check` and focused behavioral tests. Do not add external
runtime dependencies to n8n. Shared files are copied at build time into provider
packages. Use provider request/credential APIs at runtime.

Never import complete internal API schemas. New operations require deliberate
coverage on all four platforms and public availability evidence. Functions and
message-operation reads remain excluded until their public export is accepted.

Keep opaque IDs as strings, a stable business idempotency key across retries,
and the accepted API version. Never automatically repeat uncertain writes or
invent a result for `idempotency_completed`. Keep secrets out of outputs,
samples, exceptions, URLs and logs. Delete only a trigger's owned subscription.

Fixture tests do not establish native platform acceptance. Record actual
provider/editor tests and source, publication, review/listing and customer
availability separately. No automatic publication or marketplace submissions.
Do not request automated reviews. Follow the coordinated feature cycle owned
by the Polymorfa product repository; include downstream docs and recipes.

Write plain English. Store temporary research and test artifacts outside the
repository. Publish no credentials, customer data or private infrastructure.
