// Generated from shared/catalog.cjs.
import polymorfa from '../../polymorfa.app.mjs';
export default {
  key: "polymorfa-listTemplates", name: "List Templates", description: "Lists message templates for a project.",
  version: '0.1.0', type: 'action',
  props: { polymorfa, ...{
  "projectSlug": {
    "type": "string",
    "label": "Project Slug",
    "optional": false
  }
} },
  async run({ $ }) {
    const input = Object.fromEntries(["projectSlug"].map(key => [key, this[key]]));
    return this.polymorfa.execute($, "listTemplates", input);
  },
};
