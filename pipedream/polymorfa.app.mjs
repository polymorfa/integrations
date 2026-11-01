import { axios } from '@pipedream/platform';
import core from './common/core.cjs';
import hooks from './common/hooks.cjs';

export default {
  type: 'app', app: 'polymorfa',
  propDefinitions: {
    session: { type: 'string', label: 'Number', description: 'Exact Polymorfa Number identifier, kept as a string.' },
  },
  methods: {
    auth() { return { apiKey: this.$auth.api_key, projectId: this.$auth.project_id }; },
    transport($) {
      return async request => {
        const result = await axios($, { url: request.url, method: request.method, headers: request.headers, params: request.query, data: request.body, maxRedirects: 0, validateStatus: () => true, returnFullResponse: true, timeout: 25000 });
        return { status: result.status, headers: result.headers, body: result.data };
      };
    },
    execute($, action, input) { return core.execute(action, input, this.auth(), this.transport($), 'pipedream'); },
    subscribe($, url, group, key) { return hooks.subscribe(this.auth(), url, group, key, this.transport($), 'pipedream'); },
    unsubscribe($, owned) { return hooks.unsubscribe(this.auth(), owned.id, owned.url, owned.group, owned.subscriptionKey, this.transport($), 'pipedream', owned.markerName); },
    authenticate(group, key, headers) { return hooks.authenticate(this.auth(), group, key, headers); },
    envelope(body, group) { return hooks.envelope(body, group); },
  },
};
