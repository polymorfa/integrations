// Generated from shared/catalog.cjs.
import polymorfa from '../../polymorfa.app.mjs';
export default {
  key: "polymorfa-messageState", name: "Message State Changed", description: "Triggers when a message is sent, acknowledged, failed or updated.",
  version: '0.1.0', type: 'source', dedupe: 'unique',
  props: { polymorfa, db: '$.service.db', http: { type: '$.interface.http', customResponse: true },
    subscriptionKey: { type: 'string', label: 'Subscription Key', description: 'Unique stable label for this source. Events are project-wide.' } },
  hooks: {
    async activate() {
      const store = { get: () => this.db.get('pendingCreation'), set: value => this.db.set('pendingCreation', value || null) };
      const owned = await this.polymorfa.activate(undefined, this.http.endpoint, "messageState", this.subscriptionKey, store);
      this.db.set('ownedSubscription', owned);
    },
    async deactivate() {
      const owned = this.db.get('ownedSubscription');
      if (owned) { await this.polymorfa.unsubscribe(undefined, owned); this.db.set('ownedSubscription', null); }
      this.db.set('pendingCreation', null);
    },
  },
  async run(event) {
    if (!this.polymorfa.authenticate("messageState", this.subscriptionKey, event.headers)) { this.http.respond({ status: 401 }); return; }
    let data;
    try { data = this.polymorfa.envelope(event.body, "messageState"); } catch { this.http.respond({ status: 400 }); return; }
    this.$emit(data, { id: data.id, summary: data.event, ts: Date.parse(data.timestamp) });
    this.http.respond({ status: 200 });
  },
};
