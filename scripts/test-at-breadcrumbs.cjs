const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Liquid } = require(process.env.LIQUIDJS_PATH || '../.shopify-verify/breadcrumbs/node_modules/liquidjs');
const { audit } = require('./audit-at-breadcrumbs.cjs');
const mapping = require('../docs/breadcrumbs/destinations.json');
const sharedRules = require('../docs/breadcrumbs/rules.json');

const root = path.resolve(__dirname, '..');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
for (const name of ['doc', 'schema', 'stylesheet']) {
  engine.registerTag(name, {
    parse(token, tokens) {
      while (tokens.length) if (tokens.shift().name === `end${name}`) return;
      throw new Error(`Missing end${name}`);
    },
    render() { return ''; }
  });
}
engine.registerFilter('t', key => key === 'accessibility.at_breadcrumbs' ? 'Breadcrumbs' : key);
engine.registerFilter('asset_url', name => `/assets/${name}`);
const ref = value => ({ type: 'collection_reference', value });
const collection = (id, title, parent, overrides = {}) => ({
  id, title, url: `/collections/${id}`, published_at: '2026-10-12',
  metafields: { custom: { breadcrumb_parent: ref(parent) } }, ...overrides
});
const product = (destination, members = []) => ({
  id: 100, title: 'Current product', collections: members,
  metafields: { custom: { breadcrumb_collection: ref(destination) } }
});
const render = async (p, c, page_type = 'product', shop = {}) => (await engine.renderFile('at-breadcrumbs', { product: p, collection: c, page_type, shop })).trim();
const links = html => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
const jsonc = filename => JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));

async function main() {
  const tees = collection(1, 'T-Shirts');
  const short = collection(2, 'Short Sleeve T-Shirts', tees);
  short.metafields.custom.breadcrumb_label = { type: 'single_line_text_field', value: 'Short Sleeve' };
  const validProduct = product(short, [tees, short]);
  const html = await render(validProduct);
  assert.deepEqual(links(html), ['/collections/1', '/collections/2']);
  assert.ok(html.includes('Short Sleeve</span>'));
  assert.ok(!html.includes('Current product') && !html.includes('Home') && !html.includes('aria-current'));
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 2);
  assert.deepEqual(links(await render(product(tees, [tees]))), ['/collections/1']);
  assert.equal(await render(product(null, [tees, short])), '', 'missing field never infers subtype');
  assert.equal(await render(product({ id: 4 }, [])), '', 'deleted reference hides row');
  assert.deepEqual(links(await render(product(short, [tees]))), ['/collections/1'], 'non-member subtype falls back to member root');
  const hidden = { ...short, published_at: null };
  assert.deepEqual(links(await render(product(hidden, [tees, hidden]))), ['/collections/1']);
  assert.equal(await render(product(hidden, [hidden])), '', 'no accessible member ancestor');
  const repeated = collection(3, 'Repeated');
  repeated.metafields.custom.breadcrumb_parent = ref(repeated);
  assert.deepEqual(links(await render(product(repeated, [repeated]))), ['/collections/3']);
  assert.deepEqual(links(await render(product(short, [short]))), ['/collections/2'], 'non-member parent omitted');
  assert.equal(await render(null, tees, 'collection'), '', 'root collection has no row');
  assert.deepEqual(links(await render(null, short, 'collection')), ['/collections/1']);
  assert.equal(await render(null, repeated, 'collection'), '', 'no self collection link');
  const family = collection(8, 'Family & Matching Sets');
  assert.deepEqual(links(await render(null, collection(9, 'Family Fleece', family), 'collection')), ['/collections/8']);
  const wrongType = product(short, [tees, short]);
  wrongType.metafields.custom.breadcrumb_collection.type = 'single_line_text_field';
  assert.equal(await render(wrongType), '');
  const escaped = collection(10, '<Unsafe & label>', undefined, { url: '/collections/test?x="quoted"' });
  assert.ok((await render(product(escaped, [escaped]))).includes('&lt;Unsafe &amp; label&gt;'));
  assert.match(await render(product(escaped, [escaped])), /x=(?:&quot;|&#34;)quoted(?:&quot;|&#34;)/);
  assert.equal(await render(validProduct, null, 'index'), '', 'no featured/card breadcrumb');
  assert.equal(await render(null, { id: 20, metafields: {} }, 'collection'), '', 'brand without parent has no row');

  const text = value => ({ type: 'single_line_text_field', value });
  const textList = value => ({ type: 'list.single_line_text_field', value });
  const hoodRoot = collection(5, 'Sweatshirts & Hoodies');
  const hoodie = collection(4, 'Hoodies', hoodRoot);
  const hats = collection(6, 'Hats');
  const trucker = collection(7, 'Trucker Hats', hats);
  const beanie = collection(8, 'Beanies', hats);
  const long = collection(11, 'Long Sleeve', tees);
  const resources = { tees, short_sleeve: short, long_sleeve: long, sweatshirts: hoodRoot, hoodies: hoodie, hats, trucker, beanies: beanie };
  const rules = sharedRules.rules.map(rule => ({
    family: text(rule.family), category_ids: textList(rule.category_ids), priority: { type: 'number_integer', value: rule.priority },
    destination: ref(resources[rule.handle]), attribute_namespace: text(rule.attribute_namespace),
    attribute_key: text(rule.attribute_key), attribute_values: textList(rule.attribute_values || [])
  }));
  const shopWith = value => ({ metafields: { custom: { breadcrumb_rules: { type: 'list.metaobject_reference', value } } } });
  const ruleShop = shopWith(rules);
  const shortValue = { system: { id: 1001 }, taxonomy_reference: text('gid://shopify/TaxonomyValue/169'), label: text('Translated Short') };
  const longValue = { system: { id: 1002 }, taxonomy_reference: text('gid://shopify/TaxonomyValue/17094') };
  const autoProduct = (categoryId, members, sleeve, ancestorIds = []) => ({
    id: 101, title: 'Automatic product', collections: members,
    category: { gid: `gid://shopify/TaxonomyCategory/${categoryId}`, ancestors: ancestorIds.map(id => ({ gid: `gid://shopify/TaxonomyCategory/${id}` })) },
    metafields: { shopify: { 'sleeve-length-type': { type: 'list.metaobject_reference', value: sleeve || [] } }, custom: {} }
  });
  const autoRender = (p, value = rules) => render(p, null, 'product', shopWith(value));
  const automatic = autoProduct('aa-1-13-8', [tees, short, long], [shortValue]);
  assert.deepEqual(links(await autoRender(automatic)), ['/collections/1', '/collections/2'], 'native rules need no product breadcrumb field');
  assert.deepEqual(links(await autoRender(automatic, [...rules].reverse())), ['/collections/1', '/collections/2'], 'rule order independent');
  assert.deepEqual(links(await autoRender({ ...automatic, collections: [long, short, tees] })), ['/collections/1', '/collections/2'], 'membership order independent');
  assert.deepEqual(links(await autoRender(autoProduct('aa-1-13-8', [tees, long], [longValue]))), ['/collections/1', '/collections/11']);
  assert.deepEqual(links(await autoRender(autoProduct('aa-1-1-2-2', [tees, hoodRoot, hoodie]))), ['/collections/1'], 'hooded performance tee cannot inherit fleece route');
  assert.deepEqual(links(await autoRender(autoProduct('aa-1-13-13', [hoodRoot, hoodie]))), ['/collections/5', '/collections/4']);
  assert.deepEqual(links(await autoRender(autoProduct('aa-2-17-14', [hats, trucker], [], ['aa-2-17']))), ['/collections/6', '/collections/7']);
  assert.deepEqual(links(await autoRender(autoProduct('aa-2-17-2', [hats, beanie], [], ['aa-2-17']))), ['/collections/6', '/collections/8']);
  assert.deepEqual(links(await autoRender(autoProduct('aa-1-13-8', [tees, short]))), ['/collections/1'], 'missing sleeve yields root');
  assert.deepEqual(links(await autoRender(autoProduct('aa-1-13-8', [tees, short], [shortValue, longValue]))), ['/collections/1'], 'conflicting facts yield root even when only one subtype is a member');
  assert.deepEqual(links(await autoRender(autoProduct('aa-1-13-8', [tees], [shortValue]))), ['/collections/1'], 'non-member subtype yields root');
  assert.deepEqual(links(await autoRender(autoProduct('aa-1-13-8', [short], [shortValue]))), ['/collections/2'], 'non-member root omitted');
  assert.equal(await autoRender(autoProduct('unknown', [tees, short], [shortValue])), '', 'no classification from memberships or titles');
  assert.equal(await autoRender({ ...automatic, category: null }), '', 'no native category hides row');
  assert.equal(await autoRender({ ...automatic, collections: [] }), '', 'no member destination hides row');
  const missingDestinationRules = structuredClone(rules);
  missingDestinationRules[1].destination = ref(null);
  assert.deepEqual(links(await autoRender(automatic, missingDestinationRules)), ['/collections/1'], 'deleted rule destination falls back to root');
  const hiddenRules = structuredClone(rules);
  hiddenRules[1].destination.value.published_at = null;
  assert.deepEqual(links(await autoRender(automatic, hiddenRules)), ['/collections/1'], 'unpublished rule destination falls back');
  const editorial = structuredClone(automatic);
  editorial.metafields.custom.breadcrumb_collection = ref(tees);
  assert.deepEqual(links(await autoRender(editorial)), ['/collections/1'], 'valid editorial override wins');
  editorial.metafields.custom.breadcrumb_collection = ref(collection(99, 'Invalid override'));
  assert.deepEqual(links(await autoRender(editorial)), ['/collections/1', '/collections/2'], 'invalid override uses native rules');
  const wrongFamilyRule = structuredClone(rules[0]);
  wrongFamilyRule.family = text('hat');
  assert.equal(await autoRender(automatic, [...rules, wrongFamilyRule]), '', 'ambiguous families hide row');
  assert.equal(await autoRender(automatic, Array(33).fill(rules[0])), '', 'rule count is bounded');
  assert.deepEqual(links(await autoRender(autoProduct('future-child', [tees, short], [shortValue], ['aa-1-13-8']))), ['/collections/1', '/collections/2'], 'native descendants inherit rules');
  const customRules = structuredClone(rules);
  customRules[1].attribute_namespace = text('custom');
  customRules[1].attribute_key = text('designation');
  customRules[1].attribute_values = textList(['gid://shopify/Metaobject/1001']);
  const customProduct = structuredClone(automatic);
  customProduct.metafields.custom.designation = { type: 'list.metaobject_reference', value: [shortValue] };
  assert.deepEqual(links(await autoRender(customProduct, customRules)), ['/collections/1', '/collections/2'], 'existing custom attribute references supported');
  customRules[1].attribute_values = textList(['Short']);
  customProduct.metafields.custom.designation = text('Short');
  assert.deepEqual(links(await autoRender(customProduct, customRules)), ['/collections/1', '/collections/2'], 'existing text designation supported');
  customProduct.metafields.custom.designation = text('Not Short');
  assert.deepEqual(links(await autoRender(customProduct, customRules)), ['/collections/1'], 'text matching is exact');

  const sectionSource = fs.readFileSync(path.join(root, 'sections/at-breadcrumbs.liquid'), 'utf8');
  const schema = JSON.parse(sectionSource.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
  const defaults = Object.fromEntries(schema.settings.map(item => [item.id, item.default]));
  const sectionRender = async (p, c, page_type, settings = defaults) => (await engine.parseAndRender(sectionSource, {
    product: p, collection: c, request: { page_type }, section: { settings }
  })).trim();
  const sectionHtml = await sectionRender(validProduct, null, 'product');
  assert.equal((sectionHtml.match(/<nav\b/g) || []).length, 1);
  assert.ok(sectionHtml.includes('aria-label="Breadcrumbs"'));
  assert.equal(await sectionRender(product(null), null, 'product'), '', 'no empty section wrapper or script');
  assert.equal(await sectionRender(null, tees, 'collection'), '');
  assert.equal(await sectionRender(validProduct, null, 'index'), '');
  assert.equal(await sectionRender(validProduct, null, 'product', { ...defaults, enabled: false }), '');
  for (const [filename, heading] of [['product.json', 'section_RcFbtd'], ['collection.json', 'section']]) {
    const template = jsonc(`templates/${filename}`);
    assert.equal(template.order[0], 'at_breadcrumbs');
    assert.equal(template.order[1], heading);
    assert.equal(template.sections.at_breadcrumbs.type, 'at-breadcrumbs');
  }
  assert.ok(!jsonc('templates/product.access-threads.json').order.includes('at_breadcrumbs'));
  assert.ok(!jsonc('templates/collection.brand.json').order.includes('at_breadcrumbs'));

  const id = key => mapping.destinations.find(item => item.key === key).id;
  const input = {
    store: mapping.store,
    collections: mapping.destinations.map(item => ({ id: item.id, onlineStorePublished: true })),
    products: [{ id: 'p1', membershipComplete: true, collectionIds: [id('tees'), id('short_sleeve')], evidence: { verified: true, categoryId: 'tee-category', families: ['tee'], source: 'reviewed fixture', facts: { sleeve: ['short'], performance: [true], finish: ['garment-dyed'], weight: ['heavyweight'] } } }]
  };
  assert.equal(audit(input).assignments[0].after, id('short_sleeve'), 'subtype beats attributes');
  const change = fn => { const copy = structuredClone(input); fn(copy); return audit(copy); };
  assert.equal(change(copy => copy.products[0].evidence.facts.sleeve = []).assignments[0].after, id('tees'));
  assert.ok(change(copy => copy.products[0].evidence.verified = false).issues.some(item => item.code === 'unmapped'));
  assert.equal(change(copy => copy.products[0].evidence.facts.sleeve = ['short', 'long']).assignments.length, 0);
  assert.equal(change(copy => copy.products[0].collectionIds = [id('tees')]).assignments[0].after, id('tees'));
  assert.equal(change(copy => copy.products[0].collectionIds = []).assignments.length, 0);
  assert.equal(change(copy => copy.products[0].membershipComplete = false).assignments.length, 0);
  assert.equal(change(copy => copy.products[0].evidence.facts.sleeve = 'short').assignments.length, 0);
  assert.equal(change(copy => copy.products[0].styleCode = 'PC380H').assignments.length, 0);
  assert.equal(change(copy => { copy.products[0].styleCode = 'PC380H'; copy.products[0].editorialReviewed = true; }).assignments[0].after, id('tees'));
  assert.equal(change(copy => copy.store = 'other.myshopify.com').assignments.length, 0);
  assert.ok(change(copy => copy.collections.find(item => item.id === id('short_sleeve')).onlineStorePublished = false).issues.some(item => item.code === 'inaccessible'));
  const cycleConfig = structuredClone(mapping);
  cycleConfig.destinations.find(item => item.key === 'tees').parent = 'short_sleeve';
  assert.ok(audit(input, cycleConfig).issues.some(item => item.code === 'cyclic'));
  assert.equal(audit(input, cycleConfig).assignments.length, 0);
  const deepConfig = structuredClone(mapping);
  deepConfig.destinations.find(item => item.key === 'tees').parent = 'hats';
  assert.ok(audit(input, deepConfig).issues.some(item => item.code === 'too_deep'));
  const repeatedIdConfig = structuredClone(mapping);
  repeatedIdConfig.destinations[1].id = repeatedIdConfig.destinations[0].id;
  assert.ok(audit(input, repeatedIdConfig).issues.some(item => item.code === 'ambiguous'));
  console.log('AT Breadcrumbs: Liquid resolver, section/template placement, and mapping audit fixtures passed.');

  if (process.env.BREADCRUMBS_PREVIEW) {
    const css = sectionSource.match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)[1];
    const cases = [
      ['Verified tee', sectionHtml],
      ['Fleece hoodie', await sectionRender(product(collection(4, 'Hoodies', collection(5, 'Sweatshirts & Hoodies')), [collection(4, 'Hoodies', collection(5, 'Sweatshirts & Hoodies')), collection(5, 'Sweatshirts & Hoodies')]), null, 'product')],
      ['Root destination', await sectionRender(product(tees, [tees]), null, 'product')],
      ['Subtype collection', await sectionRender(null, short, 'collection')],
      ['Top-level collection', await sectionRender(null, tees, 'collection')]
    ];
    fs.writeFileSync(process.env.BREADCRUMBS_PREVIEW, `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>AT Breadcrumbs development fixtures</title><style>
      :root{--font-body--family:Arial,sans-serif;--font-size--sm:14px;--gap-xs:8px;--color-foreground:#292a25;--page-margin:16px;--page-width:1200px}
      body{margin:0;background:#faf9f6;color:#292a25;font-family:Arial,sans-serif}main{max-width:1200px;margin:auto}article{border-bottom:1px solid #d7d5cf;padding-bottom:32px}h1,h2{margin:0 16px 16px}h1{font-size:24px}h2{font-size:18px;padding-top:32px}p{margin:16px} .section{display:grid;grid-template-columns:16px minmax(0,1fr) 16px}.section>*{grid-column:2}
      ${css}</style></head><body><main><h1>AT Breadcrumbs — local fixtures</h1>${cases.map(([name, markup]) => `<article><h2>${name}</h2>${markup}<h1>Existing page heading</h1></article>`).join('')}</main></body></html>`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
