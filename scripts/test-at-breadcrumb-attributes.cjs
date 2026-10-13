const assert = require('node:assert/strict');
const path = require('node:path');
const { Liquid } = require(process.env.LIQUIDJS_PATH || '../.shopify-verify/breadcrumbs/node_modules/liquidjs');
const config = require('../docs/breadcrumbs/rules.json');
const evidence = require('../docs/breadcrumbs/attribute-product-evidence.json');
const exported = require('../docs/breadcrumbs/rules-collections-before.json');
const { auditRuleGraph } = require('./audit-at-breadcrumb-rules.cjs');
const engine = new Liquid({ root: path.join(__dirname, '../snippets'), extname: '.liquid' });
engine.registerTag('doc', { parse(token, tokens) { while (tokens.length) if (tokens.shift().name === 'enddoc') return; }, render() { return ''; } });
const scalar = value => ({ type: 'single_line_text_field', value });
const ref = value => ({ type: 'collection_reference', value });
const collections = new Map(exported.map(c => [c.id, {
  id: Number(c.id.split('/').pop()), title: c.title, url: '/collections/' + c.handle,
  published_at: c.onlineStorePublished ? 'published' : null,
  metafields: { custom: { breadcrumb_label: scalar(c.label?.value) } }
}]));
for (const c of exported) collections.get(c.id).metafields.custom.breadcrumb_parent = ref(collections.get(c.parentId));
const fieldTypes = { priority: 'number_integer', category_ids: 'list.single_line_text_field', attribute_values: 'list.single_line_text_field', breadcrumb_facets: 'list.single_line_text_field', destination: 'collection_reference' };
const rules = config.rules.map(rule => Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, { type: fieldTypes[key] || 'single_line_text_field', value: key === 'destination' ? collections.get(value) : value }])));
const shop = { metafields: { custom: { breadcrumb_rules: { type: 'list.metaobject_reference', value: rules } } } };
const toProduct = p => ({
  id: Number(p.id.split('/').pop()), title: p.title,
  category: { gid: p.category.id, ancestors: p.category.ancestorIds.map(gid => ({ gid })) },
  collections: p.collections.nodes.map(c => collections.get(c.id)).filter(Boolean),
  metafields: { custom: {}, shopify: Object.fromEntries(p.facts.nodes.filter(f => f.namespace === 'shopify').map(f => [
    f.key.replace(/^shopify\./, ''),
    { type: f.type, value: f.references.nodes.map(m => ({ system: { id: Number(m.id.split('/').pop()) }, ...Object.fromEntries(m.fields.map(x => [x.key, scalar(x.value)])) })) }
  ])) }
});
const products = evidence.nodes.map(toProduct);
const render = (product, extras = {}) => engine.renderFile('at-breadcrumbs', { product, shop, page_type: 'product', use_attributes: true, ...extras });
const links = html => [...html.matchAll(/href="([^"]+)"/g)].map(m => new URL(m[1].replaceAll('&amp;', '&'), 'https://example.com'));
const labels = html => [...html.matchAll(/<span class="at-breadcrumbs__label">([^<]+)<\/span>/g)].map(m => m[1]);
async function main() {
  const outputs = [];
  for (const p of products) {
    const html = await render(p);
    const urls = links(html);
    assert.equal(urls[0].pathname, '/collections/t-shirts');
    assert.ok(!html.includes('Home') && !html.includes(p.title) && !html.includes('aria-current'));
    assert.equal(new Set(urls.map(u => u.href)).size, urls.length);
    assert.ok(urls.length <= 4);
    const age = p.metafields.shopify['age-group']?.value[0]?.taxonomy_reference.value;
    const hasSubtype = p.id === 10426151076115 || p.id === 10425148440851;
    const ageIndex = hasSubtype ? 2 : 1;
    if (age) {
      assert.equal(urls[ageIndex].searchParams.get('filter.v.t.shopify.age-group'), age);
      assert.equal(urls[ageIndex].searchParams.size, 1);
    }
    const genderIndex = ageIndex + (age ? 1 : 0);
    assert.equal(urls[genderIndex].searchParams.get('filter.v.t.shopify.target-gender'), 'gid://shopify/TaxonomyValue/20');
    if (age) assert.equal(urls[genderIndex].searchParams.get('filter.v.t.shopify.age-group'), age);
    if (hasSubtype) {
      assert.deepEqual(labels(html), ['T-Shirts', 'Short Sleeve', p.metafields.shopify['age-group'].value[0].label.value, 'Unisex']);
      assert.equal(urls[1].pathname, '/collections/long-sleeve-t-shirts-copy');
      assert.equal(urls[1].search, '', 'subtype precedes audience filtering');
      assert.ok(urls.slice(1).every(u => u.pathname === '/collections/long-sleeve-t-shirts-copy'), 'every attribute retains the subtype');
      assert.equal(urls.at(-1).pathname, '/collections/long-sleeve-t-shirts-copy');
      assert.equal(urls.at(-1).searchParams.get('filter.v.t.shopify.age-group'), age);
      assert.equal(urls.at(-1).searchParams.get('filter.v.t.shopify.target-gender'), 'gid://shopify/TaxonomyValue/20');
      assert.equal(urls.length, 4);
    } else {
      assert.ok(urls.every(u => u.pathname === '/collections/t-shirts'), 'unverified subtype is not fabricated');
    }
    outputs.push({ product: p.title, links: urls.map(u => u.pathname + u.search) });
  }
  for (const p of require("../docs/breadcrumbs/attribute-additional-evidence.json").nodes.map(toProduct)) {
    const html = await render(p);
    const urls = links(html);
    const base = p.id === 10426124534035 ? "sweatshirts-hoodies" : "hats";
    const subtype = p.id === 10426124534035 ? "hoodies" : "beanies";
    assert.deepEqual(labels(html), p.id === 10426124534035 ? ['Sweatshirts &amp; Hoodies', 'Hoodies', 'Unisex'] : ['Hats', 'Beanies', 'Unisex']);
    assert.deepEqual(urls.map(u => u.pathname), ["/collections/"+base, "/collections/"+subtype, "/collections/"+subtype]);
    assert.equal(urls[1].search, '', 'subtype is an unfiltered category link');
    assert.equal(urls[2].searchParams.get("filter.v.t.shopify.target-gender"), "gid://shopify/TaxonomyValue/20");
    assert.ok(urls.every(u => !u.searchParams.has("filter.v.t.shopify.age-group")), "missing age never implies Adults");
    outputs.push({ product:p.title, links:urls.map(u => u.pathname+u.search) });
  }
  const tee = products[0];
  const ambiguous = structuredClone(tee);
  ambiguous.metafields.shopify['target-gender'].value.push(ambiguous.metafields.shopify['target-gender'].value[0]);
  const ambiguousLinks = links(await render(ambiguous));
  assert.equal(ambiguousLinks.length, 3);
  assert.ok(ambiguousLinks.every(u => !u.searchParams.has('filter.v.t.shopify.target-gender')));
  const missing = structuredClone(tee);
  missing.metafields.shopify = { 'sleeve-length-type': tee.metafields.shopify['sleeve-length-type'] };
  assert.deepEqual(links(await render(missing)).map(u => u.pathname), ['/collections/t-shirts', '/collections/long-sleeve-t-shirts-copy']);
  const invalid = structuredClone(tee);
  invalid.metafields.shopify['age-group'].value[0].taxonomy_reference.value = 'https://example.net/unsafe';
  assert.ok(links(await render(invalid)).every(u => !u.searchParams.has('filter.v.t.shopify.age-group')));
  const escaped = structuredClone(tee);
  escaped.metafields.shopify['age-group'].value[0].label.value = '<Kids & Youth>';
  assert.ok((await render(escaped)).includes('&lt;Kids &amp; Youth&gt;'));
  assert.equal(links(await render(tee, { use_attributes: false })).length, 2);
  const overridden = structuredClone(tee);
  overridden.metafields.custom.breadcrumb_collection = ref(collections.get('gid://shopify/Collection/523280777491'));
  assert.equal(links(await render(overridden)).length, 1, 'valid editorial override retains its own path');
  const noMember = structuredClone(tee);
  noMember.collections = [];
  assert.equal((await render(noMember)).trim(), '');
  assert.equal((await render(tee, { page_type: 'index' })).trim(), '');
  assert.equal((await render(null, { page_type: 'collection', collection: collections.get('gid://shopify/Collection/523280777491') })).trim(), '');
  const disabledShop = structuredClone(shop);
  delete disabledShop.metafields.custom.breadcrumb_rules.value[0].breadcrumb_facets;
  assert.equal(links(await render(tee, { shop: disabledShop })).length, 2);
  const duplicateShop = structuredClone(shop);
  duplicateShop.metafields.custom.breadcrumb_rules.value[0].breadcrumb_facets.value = ['age-group', 'age-group'];
  assert.equal(links(await render(tee, { shop: duplicateShop })).length, 2);
  const malformed = structuredClone(config);
  malformed.rules[0].breadcrumb_facets = ['age-group', 'material'];
  assert.equal(auditRuleGraph(malformed, exported).ready, false);
  const childPolicy = structuredClone(config);
  childPolicy.rules[1].breadcrumb_facets = ['age-group'];
  assert.equal(auditRuleGraph(childPolicy, exported).ready, false);
  console.log(JSON.stringify({ ready: true, fixtures: outputs }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
