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

Each delivery must carry a valid `X-Webhook-Signature` header, an HMAC-SHA256 of
the exact raw request body made with the endpoint's signing secret. The trigger
checks it against the raw bytes before parsing the body, and also checks its
marker header. A missing, duplicate or invalid signature, a missing raw body or
a missing stored secret rejects the delivery. The REST Hook's signing secret is
kept in `bundle.subscribeData` and never emitted. Activation returns the secret from the create response, or rotates it
(zero overlap) when the webhook already exists, so activating a trigger replaces
any earlier secret for that webhook.

Triggers saved before signature verification have no stored secret and reject
every delivery. Turn the Zap off and on again to rotate and store a fresh secret.
Rotating the endpoint's signing secret in the Polymorfa Console also invalidates
the stored secret and rejects deliveries until the trigger is reactivated.

The signature is checked against `bundle.rawRequest.content`. If Zapier does not
provide the raw body, or does not pass `subscribeData` to `perform`, every delivery
is rejected. Confirm both on a real REST Hook delivery before review.

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
