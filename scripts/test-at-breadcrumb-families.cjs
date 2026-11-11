const assert = require('node:assert/strict');
const path = require('node:path');
const { Liquid } = require(process.env.LIQUIDJS_PATH || '../.shopify-verify/breadcrumbs/node_modules/liquidjs');
const manifest = require('../docs/assortment/families.json');
const config = require('../docs/assortment/breadcrumb-rules.json');
const { compile } = require('./build-at-breadcrumb-families.cjs');
const { auditRuleGraph } = require('./audit-at-breadcrumb-rules.cjs');
const scalar = value => ({ type: 'single_line_text_field', value });
const reference = value => ({ type: 'collection_reference', value });
const list = value => ({ type: 'list.single_line_text_field', value });
const resources = new Map(config.rules.map(rule => [rule.destination, {
  id: Number(rule.destination.split('/').pop()), title: rule.name,
  url: '/collections/' + rule.handle, published_at: 'published', metafields: { custom: {} }
}]));
for (const rule of config.rules) {
  if (rule.priority > 0) resources.get(rule.destination).metafields.custom.breadcrumb_parent = reference(resources.get(manifest.roots[rule.family].destination));
}
const rules = config.rules.map(rule => ({
  family: scalar(rule.family), category_ids: list(rule.category_ids),
  priority: { type: 'number_integer', value: rule.priority },
  destination: reference(resources.get(rule.destination)),
  attribute_namespace: scalar(rule.attribute_namespace), attribute_key: scalar(rule.attribute_key),
  attribute_values: list(rule.attribute_values || []), breadcrumb_facets: list(rule.breadcrumb_facets || [])
}));
const shop = { metafields: { custom: { breadcrumb_rules: { type: 'list.metaobject_reference', value: rules } } } };
const engine = new Liquid({ root: path.resolve(__dirname, '../snippets'), extname: '.liquid' });
engine.registerTag('doc', { parse(token, tokens) { while (tokens.length) if (tokens.shift().name === 'enddoc') return; }, render() { return ''; } });
const category = id => 'gid://shopify/TaxonomyCategory/' + id;
const makeProduct = (id, handles, ancestors = []) => ({
  id: 1, title: 'Current product',
  category: { gid: category(id), ancestors: ancestors.map(id => ({ gid: category(id) })) },
  collections: handles.map(handle => resources.get(config.rules.find(rule => rule.handle === handle).destination)),
  metafields: { custom: {}, shopify: {} }
});
const links = html => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
const render = product => engine.renderFile('at-breadcrumbs', { product, shop, page_type: 'product' });

async function main() {
  assert.deepEqual(compile(manifest), config, 'Shared rule file must be generated from the family manifest');
  const graph = config.rules.map(rule => ({ id: rule.destination, onlineStorePublished: true, parentId: rule.priority ? manifest.roots[rule.family].destination : null }));
  assert.equal(auditRuleGraph(config, graph).ready, true);
  const cases = [
    ['Henley tee retains native Henley category', 'aa-1-13-7-1', ['tees'], ['aa-1-13-7'], ['tees']],
    ['Non-tee Henley stays in Shirts', 'aa-1-13-7-1', ['shirts'], ['aa-1-13-7'], ['shirts']],
    ['Track jacket uses Outerwear despite sweatshirt ancestor', 'aa-1-1-7-5', ['outerwear', 'track_jackets'], ['aa-1-1-7'], ['outerwear', 'track_jackets']],
    ['Ambiguous actual family memberships hide output', 'aa-1-1-7-5', ['sweatshirts', 'outerwear', 'track_jackets'], ['aa-1-1-7'], []],
    ['Children hats are covered without assumed age', 'aa-2-33-3', ['hats'], [], ['hats']],
    ['Children polos retain garment family', 'aa-1-25-9-5', ['polos'], [], ['polos']],
    ['Bags in alternate native path use broad validated parent', 'vp-1-7-6', ['bags'], [], ['bags']],
    ['Non-member alternate bag category is not fabricated', 'vp-1-7-6', [], [], []],
    ['Tote subtype precedes attributes', 'lb-13', ['bags', 'tote_bags'], ['lb'], ['bags', 'tote_bags']],
    ['Sweater retains separate garment family', 'aa-1-13-12', ['knitwear', 'sweaters'], [], ['knitwear', 'sweaters']],
    ['Activewear vest stays in Outerwear', 'aa-1-1-8-1', ['outerwear', 'vests'], ['aa-1-1-8'], ['outerwear', 'vests']],
    ['Unknown sleeve remains root', 'aa-1-13-8', ['tees', 'short_sleeve', 'long_sleeve'], [], ['tees']]
  ];
  for (const [name, id, handles, ancestors, expected] of cases) {
    const product = makeProduct(id, handles, ancestors);
    const html = await render(product);
    assert.deepEqual(links(html), expected.map(handle => resources.get(config.rules.find(rule => rule.handle === handle).destination).url), name);
    product.collections.reverse();
    assert.deepEqual(links(await render(product)), links(html), name + ' must not depend on membership order');
    assert.ok(!html.includes('Home') && !html.includes('Current product') && !html.includes('aria-current'));
  }
  console.log(`AT Breadcrumb families: ${cases.length} classification and membership fixtures passed; ${config.rules.length} shared rules passed graph validation.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
