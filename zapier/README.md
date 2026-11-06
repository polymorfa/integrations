# Polymorfa for Zapier

The native integration source passes local schema validation. No Zapier app has
been registered, uploaded, promoted or listed by this repository.

Use a restricted project token and its project UUID. Connection testing requires
`sessions:read`. Sends/reactions require `messages:write`, template lookup
`templates:read`, and REST Hook lifecycle `webhooks:read` plus `webhooks:manage`.

Actions preserve the public Polymorfa response envelope. A 202 response is an
admission receipt, not a delivered-message receipt. Map opaque IDs as strings.
Keep the same business idempotency key and saved write-start timestamp on retry.
No automatic replacement write is made after completion or an unknown outcome.

REST Hooks register their own project-wide endpoint and delete only that endpoint.
Use a unique subscription key for each Zap. The editor sample is labelled
synthetic and reads no hosted customer history. Test the real subscription,
samples, delivery, dedupe, cleanup, rotation and provider log redaction before
requesting public review. Provider acceptance of the synthetic sample path is
still required.

The receiver reads `bundle.rawRequest.headers`. Zapier's bundle documentation
says those headers, other than Content-Type and Content-Length, arrive with an
`Http-` prefix in Camel-Case. The receiver accepts that form or the plain name,
exactly once. Confirm it on a real REST Hook delivery before review.

Validate without contacting Zapier's style service:

```sh
npm run validate:zapier
```

Public listing needs a Polymorfa-controlled publisher, a company-domain admin,
public setup docs, native test Zaps and an authorized support test account.
Record the approved Beta/Public status and actual directory URL. Do not submit a
duplicate app or promote a version merely because local validation passes.

Zapier has its own execution, retention and billing. Its processing location is
separate from the Polymorfa region selected for a Number.
