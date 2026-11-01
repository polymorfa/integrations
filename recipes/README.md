# Recipe candidates

These recipes need provider acceptance before a public template launch. The n8n
JSON files are inactive workflow imports targeting this development node. The
other files are field/step specifications, not claimed provider template URLs.

| Recipe | Required behavior | Native release dependency |
| --- | --- | --- |
| Order notification | Send a template or text once per saved notification event | Real order trigger, restricted connection, stable key/start-time mapping |
| Inbound handoff | Forward a received message to an authorized destination | Owned authenticated hook, project-wide disclosure acceptance, destination auth, dedupe |
| Reply-aware appointment follow-up | Wait, re-read saved reply state, then send only when due and unanswered | External platform's durable wait and customer-chosen state store; atomic admission/race qualification |
| Custom transformation | Invoke a pinned Function, then map its result | Public Functions contract and regional runtime acceptance; gated on all four platforms |

For the n8n order workflow, replace the Manual Trigger with an authorized order
source that supplies these string fields:

```json
{
  "numberId": "YOUR_NUMBER_ID",
  "recipient": "YOUR_AUTHORIZED_TEST_RECIPIENT",
  "notificationId": "YOUR_SAVED_NOTIFICATION_ID",
  "notificationStartedAt": "YOUR_SAVED_ISO_TIMESTAMP",
  "notificationText": "YOUR_MESSAGE"
}
```

Save `notificationStartedAt` when that logical notification first begins. Do not
replace it with the current clock on every attempt. Missing inputs stop before a
send. For a real send, configure a synthetic test recipient you control.

The inbound workflow needs its own subscription key, Polymorfa credential and
authorized destination. Its destination starts at `example.invalid`; configure
destination authentication before activation. It sends project-wide message
content to the selected external system. Add persistent dedupe by `id` before
effects. Neither workflow is activated by importing it.

Make blueprint IDs, Zapier template/share IDs and Pipedream app/component IDs must
come from the real assigned apps. Do not fabricate them. Record the accepted IDs
and native test evidence in the release record, then bind/export the templates.
