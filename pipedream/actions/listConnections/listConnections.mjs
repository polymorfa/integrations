// Generated from shared/catalog.cjs.
import polymorfa from '../../polymorfa.app.mjs';
export default {
  key: "polymorfa-listConnections", name: "List Connections", description: "Lists Connections visible to the connected project.",
  version: '0.1.0', type: 'action',
  props: { polymorfa, ...{} },
  async run({ $ }) {
    const input = Object.fromEntries([].map(key => [key, this[key]]));
    return this.polymorfa.execute($, "listConnections", input);
  },
};
