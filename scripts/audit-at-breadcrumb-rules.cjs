const fs = require('node:fs');

function auditRuleGraph(config, collections) {
  const issues = [];
  const byId = new Map(collections.map(item => [item.id, item]));
  const roots = new Map();
  const handles = new Set();
  const categoryFamilies = new Map();
  const issue = (rule, detail) => issues.push({ rule: rule.handle, detail });
  if (!Array.isArray(config.rules) || config.rules.length > 32) return { ready: false, issues: [{ detail: 'At most 32 rules are supported' }] };
  for (const rule of config.rules) {
    if (!rule.family || !rule.handle || handles.has(rule.handle)) issue(rule, 'Unique handle and garment family required');
    handles.add(rule.handle);
    if (!Number.isInteger(rule.priority) || rule.priority < 0) issue(rule, 'Priority must be a nonnegative integer');
    if (rule.priority === 0) {
      if (roots.has(rule.family)) issue(rule, 'Each family must have exactly one root rule');
      roots.set(rule.family, rule);
    }
    if (!Array.isArray(rule.category_ids) || !rule.category_ids.length || rule.category_ids.length > 32 || rule.category_ids.some(id => !/^gid:\/\/shopify\/TaxonomyCategory\/[a-z0-9-]+$/.test(id))) {
      issue(rule, 'One to 32 native category GIDs are required');
    } else {
      for (const id of rule.category_ids) {
        if (categoryFamilies.has(id) && categoryFamilies.get(id) !== rule.family) issue(rule, 'Category is assigned to conflicting families');
        categoryFamilies.set(id, rule.family);
      }
    }
    const hasAttribute = Boolean(rule.attribute_namespace || rule.attribute_key || rule.attribute_values?.length);
    if (hasAttribute && (!rule.attribute_namespace || !rule.attribute_key || !Array.isArray(rule.attribute_values) || !rule.attribute_values.length || rule.attribute_values.length > 16 || rule.attribute_values.some(value => typeof value !== 'string' || !value.trim()))) issue(rule, 'Attribute namespace, key, and one to 16 exact values must be supplied together');
    if (rule.priority === 0 && hasAttribute) issue(rule, 'Root rules must not depend on subtype attributes');
    if (rule.breadcrumb_facets && (rule.priority !== 0 || !Array.isArray(rule.breadcrumb_facets) || rule.breadcrumb_facets.length > 2 || new Set(rule.breadcrumb_facets).size !== rule.breadcrumb_facets.length || rule.breadcrumb_facets.some(key => !['age-group', 'target-gender'].includes(key)))) issue(rule, 'Only root rules can declare up to two unique approved native audience filters');
    if (!byId.get(rule.destination)?.onlineStorePublished) issue(rule, 'Destination must exist and be published to the Online Store');
  }
  for (const rule of config.rules) {
    const root = roots.get(rule.family);
    const collection = byId.get(rule.destination);
    if (!root) issue(rule, 'Family root is missing');
    if (collection && root) {
      if (rule.priority === 0 && collection.parentId) issue(rule, 'Root collection must have no parent');
      if (rule.priority > 0 && collection.parentId !== root.destination) issue(rule, 'Subtype parent must be its family root');
      const seen = new Set();
      let current = collection;
      while (current) {
        if (seen.has(current.id)) { issue(rule, 'Parent cycle'); break; }
        seen.add(current.id);
        current = byId.get(current.parentId);
      }
      if (seen.size > 2) issue(rule, 'At most two collection levels are supported');
    }
  }
  return { ready: issues.length === 0, issues };
}

if (require.main === module) {
  const [configPath, collectionsPath, reportPath] = process.argv.slice(2);
  if (!configPath || !collectionsPath) throw Error('Usage: node scripts/audit-at-breadcrumb-rules.cjs rules.json collections.json [report.json]');
  const report = auditRuleGraph(JSON.parse(fs.readFileSync(configPath, 'utf8')), JSON.parse(fs.readFileSync(collectionsPath, 'utf8')));
  const json = JSON.stringify(report, null, 2) + '\n';
  if (reportPath) fs.writeFileSync(reportPath, json); else process.stdout.write(json);
  if (!report.ready) process.exitCode = 1;
}
module.exports = { auditRuleGraph };
