const assert = require('node:assert/strict');
const path = require('node:path');
const { Liquid } = require(process.env.LIQUIDJS_PATH || '../.shopify-verify/breadcrumbs/node_modules/liquidjs');
const rules = require('../docs/breadcrumbs/rules.json');
const source = require('../docs/breadcrumbs/rules-before.json').data;
const evidence = require('../docs/breadcrumbs/rules-attribute-evidence.json');
const exportedCollections = require('../docs/breadcrumbs/rules-collections-before.json');
const { auditRuleGraph } = require('./audit-at-breadcrumb-rules.cjs');
const engine = new Liquid({ root: path.join(__dirname, '../snippets'), extname: '.liquid' });
engine.registerTag('doc', { parse(token, tokens) { while (tokens.length) if (tokens.shift().name === 'enddoc') return; }, render() { return ''; } });
const scalar = value => ({ type: 'single_line_text_field', value });
const ref = value => ({ type: 'collection_reference', value });
const collections = new Map(exportedCollections.map(c => [c.id, {
  id: Number(c.id.split('/').pop()), title: c.title, url: `/collections/${c.handle}`, published_at: c.onlineStorePublished ? 'published' : null,
  metafields: { custom: { breadcrumb_label: scalar(c.label?.value) } }
}]));
for (const c of exportedCollections) collections.get(c.id).metafields.custom.breadcrumb_parent = ref(collections.get(c.parentId));
const fieldTypes = { priority: 'number_integer', category_ids: 'list.single_line_text_field', attribute_values: 'list.single_line_text_field', destination: 'collection_reference' };
const ruleObjects = rules.rules.map(rule => Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, { type: fieldTypes[key] || 'single_line_text_field', value: key === 'destination' ? collections.get(value) : value }])));
const shop = { metafields: { custom: { breadcrumb_rules: { type: 'list.metaobject_reference', value: ruleObjects } } } };
const metaobjects = new Map(evidence.sleeve.map(m => [m.id, { system: { id: Number(m.id.split('/').pop()) }, ...Object.fromEntries(m.fields.map(f => [f.key, scalar(f.value)])) }]));
async function main() {
  assert.equal(auditRuleGraph(rules, exportedCollections).ready, true);
  const broken = structuredClone(rules);
  broken.rules[1].family = 'hat';
  assert.equal(auditRuleGraph(broken, exportedCollections).ready, false);
  const cyclic = structuredClone(exportedCollections);
  cyclic.find(c => c.title === 'T-Shirts').parentId = rules.rules[1].destination;
  assert.equal(auditRuleGraph(rules, cyclic).ready, false);
  const desired = {
    '10425148440851': 'short_sleeve', '10426121421075': 'long_sleeve', '10426124534035': 'hoodies',
    '10425198379283': 'beanies', '10426119618835': 'tees', '10425156731155': 'long_sleeve',
    '10425115672851': 'trucker', '10425115771155': 'trucker', '10425116164371': 'trucker'
  };
  const outputs = [];
  for (const p of [...source.products, ...source.extra.nodes, ...evidence.truckers]) {
    const facts = p.facts?.nodes || [];
    const sleeve = facts.find(f => f.key === 'sleeve-length-type');
    const product = {
      id: Number(p.id.split('/').pop()), title: p.title,
      category: { gid: p.category.id, ancestors: p.category.ancestorIds.map(gid => ({ gid })) },
      collections: p.collections.nodes.map(c => collections.get(c.id)).filter(Boolean),
      metafields: { custom: {}, shopify: { 'sleeve-length-type': { type: 'list.metaobject_reference', value: sleeve ? JSON.parse(sleeve.value).map(id => metaobjects.get(id)).filter(Boolean) : [] } } }
    };
    const html = await engine.renderFile('at-breadcrumbs', { product, shop, page_type: 'product' });
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    const rule = rules.rules.find(r => r.handle === desired[String(product.id)]);
    const destination = collections.get(rule.destination);
    const parent = destination.metafields.custom.breadcrumb_parent.value;
    const expected = parent ? [parent.url, destination.url] : [destination.url];
    assert.deepEqual(links, expected, p.title);
    assert.equal(product.metafields.custom.breadcrumb_collection, undefined, 'no individual assignment');
    outputs.push({ product: p.title, links });
  }
  console.log(JSON.stringify({ ready: true, fixtures: outputs }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
