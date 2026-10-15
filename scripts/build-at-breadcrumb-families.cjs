const fs = require('node:fs');
const path = require('node:path');

function compile(manifest) {
  const rules = Object.entries(manifest.roots).map(([family, root]) => ({
    handle: root.rule_handle,
    name: root.title + ' root',
    family,
    breadcrumb_facets: root.facets,
    category_ids: [...new Set(root.category_ids)],
    priority: 0,
    destination: root.destination
  })).concat(manifest.subtypes);
  if (rules.length > 32) throw Error('The theme supports at most 32 shared rules');
  return { version: 4, store: manifest.store, type: 'at_breadcrumb_rule', shopMetafield: 'custom.breadcrumb_rules', rules };
}

if (require.main === module) {
  const directory = path.resolve(__dirname, '../docs/assortment');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'families.json'), 'utf8'));
  fs.writeFileSync(path.join(directory, 'breadcrumb-rules.json'), JSON.stringify(compile(manifest), null, 2) + '\n');
}

module.exports = { compile };
