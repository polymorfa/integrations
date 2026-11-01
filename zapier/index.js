'use strict';
const { version: platformVersion } = require('zapier-platform-core');
const { actions, fields, events } = require('./shared/catalog.cjs');
const core = require('./shared/core.cjs');
const hooks = require('./shared/hooks.cjs');

function transport(z) {
  return async r => {
    const response = await z.request({ method: r.method, url: r.url, headers: r.headers, params: r.query, body: r.body, redirect: 'manual', skipThrowForStatus: true });
    return { status: response.status, headers: response.headers, body: response.content };
  };
}
function field(name) {
  const f = fields[name];
  return { key: name, label: f.label, type: 'string', required: !!f.required, helpText: f.help, ...(f.options ? { choices: f.options } : {}), ...(f.default ? { default: f.default } : {}) };
}
const creates = Object.fromEntries(Object.entries(actions).map(([key, action]) => [key, {
  key, noun: 'Result', display: { label: action.label, description: action.description },
  operation: {
    inputFields: action.fields.map(field),
    async perform(z, bundle) { return core.execute(key, bundle.inputData, bundle.authData, transport(z), 'zapier'); },
    sample: { data: { id: '739182640518203' } },
  },
}]));
const triggers = Object.fromEntries(Object.entries(events).map(([key, event]) => [key, {
  key, noun: 'Event', display: { label: event.label, description: event.description },
  operation: {
    type: 'hook', canPaginate: false,
    inputFields: [{ key: 'subscriptionKey', label: 'Subscription Key', type: 'string', required: true, helpText: 'A unique stable key for this Zap trigger. Project-wide events are sent to Zapier. Use a different key for another trigger.' }],
    async performSubscribe(z, bundle) {
      // Zapier's logger scrubs authData values before its HTTP logs run.
      // Register the derived receiver secret before the registration request.
      bundle.authData.webhookVerificationSecret = hooks.identity(bundle.authData, key, bundle.inputData.subscriptionKey).value;
      const owned = await hooks.subscribe(bundle.authData, bundle.targetUrl, key, bundle.inputData.subscriptionKey, transport(z), 'zapier');
      return { ...owned, url: bundle.targetUrl };
    },
    async performUnsubscribe(z, bundle) {
      const owned = bundle.subscribeData;
      await hooks.unsubscribe(bundle.authData, owned.id, owned.url, owned.group, owned.subscriptionKey, transport(z), 'zapier', owned.markerName); return {};
    },
    async perform(z, bundle) {
      if (!hooks.authenticate(bundle.authData, key, bundle.inputData.subscriptionKey, bundle.cleanedRequest.headers)) throw new z.errors.Error('Webhook authentication failed.', 'WebhookAuthentication', 401);
      return [hooks.envelope(bundle.cleanedRequest.content, key)];
    },
    async performList() { return [require('./shared/samples.json')[key]]; },
    sample: require('./shared/samples.json')[key],
    outputFields: [{ key: 'id', type: 'string' }, { key: 'session', type: 'string' }, { key: 'timestamp', type: 'datetime' }, { key: 'event', type: 'string' }],
  },
}]));
module.exports = {
  version: require('./package.json').version, platformVersion,
  authentication: {
    type: 'custom', connectionLabel: '{{projectId}}',
    fields: [
      { key: 'apiKey', label: 'Project Token', type: 'password', required: true, helpText: 'A restricted project token. Connection testing requires sessions:read.' },
      { key: 'projectId', label: 'Project ID', type: 'string', required: true },
    ],
    async test(z, bundle) { await core.execute('listNumbers', {}, bundle.authData, transport(z), 'zapier'); return { projectId: bundle.authData.projectId }; },
  },
  creates, triggers,
};
