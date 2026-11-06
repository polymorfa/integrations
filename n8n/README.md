# Polymorfa for n8n

Development source for the Polymorfa action and trigger nodes. This package has
not been published or verified by n8n. Do not treat an npm name or this source as
a marketplace listing.

The node sends text/replies, templates, image/video/file/voice media and reactions;
lists Numbers/templates; and makes allowlisted public API calls. It is usable as
an AI tool. The trigger receives project-wide message, Number-state and completed
call events. Functions and asynchronous operation reads are not exposed yet.

Build from this repository's root using the instructions in `MAINTAINING.md`.
Then pack the workspace for a controlled development installation:

```sh
npm pack --workspace n8n-nodes-polymorfa
```

Create a **Polymorfa API** credential with a restricted project token and project
UUID. The credential test and Number picker need `sessions:read`; sends and
reactions need `messages:write`; template lookup needs `templates:read`.
Triggers also need `webhooks:read` and `webhooks:manage`.

For every write, map a stable **Idempotency Key** and **Write Started At** ISO
timestamp from the saved business event. Preserve both during retries. The
adapter refuses writes older than 23 hours. Recover the first result or
reconcile the effect before starting a different write. `idempotency_completed`
does not contain the original message ID.

Media accepts HTTPS URLs, base64 or a named n8n binary input field. The connector
caps decoded bytes at 4 MiB. Provider/API bounds can be lower. IDs remain strings.

With **Continue On Fail** enabled, successful batch items keep their results and
failed items return an error paired to the original input. Later items continue.
Use the saved write identity when handling an error; do not replay successful
items with new keys.

Give each trigger a unique, stable **Subscription Key**. The node registers a
new webhook on each activation and keeps its creation state in workflow static
data, so test listening, deactivation and reactivation need no extra field.
Webhook subscriptions are project-wide. Filtering a workflow after receipt does
not prevent disclosure to n8n. Dedupe by event `id` before downstream effects;
repeated delivery is possible. Delete/disable the owned webhook before revoking its credential.

n8n executes your workflow under its own hosting and retention settings. Choosing
a Polymorfa EU or Brazil region does not place n8n's processing in that region.
Test with synthetic data and check the platform's logs before release.
