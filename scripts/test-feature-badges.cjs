const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Liquid } = require(process.env.LIQUIDJS_PATH || 'liquidjs');

const root = path.resolve(__dirname, '..');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
for (const name of ['doc', 'schema', 'stylesheet']) {
  engine.registerTag(name, {
    parse(token, tokens) {
      while (tokens.length) {
        if (tokens.shift().name === `end${name}`) return;
      }
      throw new Error(`Missing end${name}`);
    },
    render() { return ''; }
  });
}
engine.registerFilter('asset_url', name => `/assets/${name}`);
engine.registerFilter('inline_asset_content', name => fs.readFileSync(path.join(root, 'assets', name), 'utf8'));
const localeSource = fs.readFileSync(path.join(root, 'locales/en.default.json'), 'utf8');
const locale = JSON.parse(localeSource.slice(localeSource.indexOf('{')).replace(/^\s*\/\/.*$/gm, ''));
engine.registerFilter('t', (key, ...args) => {
  if (key === 'accessibility.close_dialog') return 'Close dialog';
  if (key === 'products.feature_badges.fabric_weight') {
    return locale.products.feature_badges.fabric_weight.replace('{{ weight }}', Object.fromEntries(args).weight);
  }
  return key;
});
const richText = node => node?.type === 'text' ? node.value : (node?.children || []).map(richText).join('');
engine.registerFilter('metafield_text', source => {
  if (source.type === 'weight') return `${Number(Number(source.value.value).toFixed(2))} ${source.value.unit}`;
  return richText(source.value);
});

const scalar = value => ({ type: 'single_line_text_field', value });
const entry = (label, handle = 'feature') => ({ label: scalar(label), system: { handle } });
const featureList = value => ({ type: 'list.metaobject_reference', value });
const rich = text => ({ type: 'rich_text_field', value: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }] } });
const productWith = source => ({ metafields: { custom: { test: source } } });
const condition = async (source, expected = '', field = 'label', metafieldPath = 'custom.test') =>
  (await engine.renderFile('feature-badge-matches', { product: productWith(source), metafield_path: metafieldPath, match_value: expected, entry_field: field })).trim();

async function main() {
  const cases = [
    ['missing metafield', undefined, '', ''],
    ['empty text', scalar(''), '', ''],
    ['whitespace text', scalar('  '), '', ''],
    ['populated text', scalar('Ring-Spun'), '', 'true'],
    ['exact cotton match', scalar('Ring-Spun'), 'Ring-Spun', 'true'],
    ['case and outer spaces', scalar(' Ring-Spun '), ' ring-spun ', 'true'],
    ['no partial cotton match', scalar('Combed Ring-Spun'), 'Ring-Spun', ''],
    ['different cotton', scalar('Open-End'), 'Ring-Spun', ''],
    ['empty metaobject list', featureList([]), '', ''],
    ['matching feature among others', featureList([entry('Moisture Wicking'), entry('Tear-Away Label')]), 'Tear-Away Label', 'true'],
    ['nonmatching feature', featureList([entry('Moisture Wicking')]), 'Tear-Away Label', ''],
    ['feature handle match', featureList([entry('Translated label', 'tear-away-label')]), 'tear-away-label', 'true'],
    ['populated list presence', featureList([entry('Moisture Wicking')]), '', 'true'],
    ['single metaobject match', { type: 'metaobject_reference', value: entry('Tear-Away Label') }, 'Tear-Away Label', 'true'],
    ['blank single reference', { type: 'metaobject_reference', value: null }, '', ''],
    ['empty rich text document', rich(''), '', ''],
    ['whitespace rich text', rich('  '), '', ''],
    ['populated rich text', rich('Made with recycled materials.'), '', 'true'],
    ['text list exact match', { type: 'list.single_line_text_field', 'list?': true, value: ['Open-End', 'Ring-Spun'] }, 'Ring-Spun', 'true'],
    ['text list no partial match', { type: 'list.single_line_text_field', 'list?': true, value: ['Combed Ring-Spun'] }, 'Ring-Spun', '']
  ];
  for (const [name, source, expected, result] of cases) {
    assert.equal(await condition(source, expected), result, name);
  }
  assert.equal(await condition(scalar('present'), '', 'label', 'invalid'), '', 'invalid metafield path');
  assert.equal(await condition({ type: 'metaobject_reference', value: { name: scalar('Custom Feature'), system: { handle: 'custom-feature' } } }, 'Custom Feature', 'name'), 'true', 'custom metaobject field');

  const blockSource = fs.readFileSync(path.join(root, 'blocks/feature-badges.liquid'), 'utf8');
  const schema = JSON.parse(blockSource.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
  const defaults = Object.fromEntries(schema.settings.filter(setting => setting.id).map(setting => [setting.id, setting.default ?? '']));
  const settings = { ...defaults, ...schema.presets[0].settings };
  const product = { metafields: { shopify: { 'clothing-features': featureList([entry('Tear-Away Label')]) }, custom: { cotton_type: scalar('Ring-Spun'), sustainable_style: rich('Recycled materials') } } };
  const renderBlock = (currentProduct, currentSettings = settings, designMode = false, blockId = 'test-block') => engine.parseAndRender(blockSource, {
    closest: { product: currentProduct }, block: { id: blockId, settings: currentSettings }, section: { id: 'test-section' }, request: { design_mode: designMode }
  });
  const rendered = await renderBlock(product, { ...settings, badge_2_content: '<p>A softer cotton yarn.</p>', badge_5_content: '<p>Recycled materials</p>' });
  assert.equal((rendered.match(/<dialog-component /g) || []).length, 3, 'only matching rows render');
  assert.ok(rendered.includes('<p>A softer cotton yarn.</p>'), 'popup HTML renders');
  assert.equal((rendered.match(/class="feature-badges__icon icon-default"/g) || []).length, 3, 'matching badges render their icons');
  assert.ok(!rendered.includes('>Open-End Cotton<'), 'unmatched cotton remains hidden');
  for (const cottonType of ['Open-End', 'Ring-Spun', 'Combed Ring-Spun']) {
    const weightedProduct = { ...product, metafields: { ...product.metafields, custom: { ...product.metafields.custom, cotton_type: scalar(cottonType), fabric_oz: { type: 'number_decimal', value: 5.3 } } } };
    const output = await renderBlock(weightedProduct);
    assert.equal((output.match(/class="feature-badges__weight"/g) || []).length, 1, 'only the matching cotton icon receives weight');
    assert.match(output, /class="feature-badges__media">[\s\S]*?<svg[\s\S]*?<\/svg>\s*<span class="feature-badges__weight">5\.3 oz<\/span>\s*<\/span>/, 'weight is beneath the cotton SVG in its media column');
    assert.ok(output.includes(`<span>${cottonType}${cottonType === 'Ring-Spun' ? '' : ' Cotton'}</span>`), 'cotton type label remains');
  }
  for (const [value, expected] of [[6, '6 oz'], ['5.30', '5.3 oz'], [undefined, null], ['', null], [0, null], [-1, null]]) {
    const weightedProduct = { ...product, metafields: { ...product.metafields, custom: { ...product.metafields.custom, fabric_oz: value === undefined ? undefined : { type: 'number_decimal', value } } } };
    const output = await renderBlock(weightedProduct);
    assert.ok(output.includes('<span>Ring-Spun</span>'), 'missing weight never hides the cotton type badge');
    if (expected) assert.ok(output.includes(`<span class="feature-badges__weight">${expected}</span>`), 'weight formats once with the ounce suffix');
    else assert.ok(!output.includes('feature-badges__weight') && !output.includes('feature-badges__media'), 'missing or nonpositive weight leaves no caption or empty media wrapper');
  }
  for (const cottonType of ['Open-End', 'Ring-Spun', 'Combed Ring-Spun']) {
    for (const [value, unit, expected] of [[5.3, 'oz', '5.3 oz'], [6, 'oz', '6 oz'], [180, 'g', '180 g'], [0, 'oz', null], [null, 'oz', null]]) {
      const measuredProduct = { ...product, metafields: { ...product.metafields, custom: { ...product.metafields.custom, cotton_type: scalar(cottonType), fabric_oz: { type: 'weight', value: { type: 'weight', value, unit } } } } };
      const output = await renderBlock(measuredProduct);
      if (expected) {
        assert.equal((output.match(/class="feature-badges__weight"/g) || []).length, 1, 'Shopify weight measurements produce exactly one cotton caption');
        assert.ok(output.includes(`<span class="feature-badges__weight">${expected}</span>`), 'measurement amount and stored unit render correctly');
      } else {
        assert.ok(!output.includes('feature-badges__weight'), 'empty or zero measurements remain hidden');
      }
    }
  }
  assert.equal((await renderBlock({ metafields: {} })).trim(), '', 'no storefront wrapper or scripts when no matches');
  assert.ok((await renderBlock({ metafields: {} }, settings, true)).includes('No feature badges match'), 'editor can select an empty block');
  assert.ok((await renderBlock(product, { ...settings, behavior: 'drawer' })).includes('dialog-drawer'), 'drawer option');
  const allSettings = { ...settings };
  for (let index = 1; index <= 6; index++) {
    allSettings[`badge_${index}_source`] = 'custom.cotton_type';
    allSettings[`badge_${index}_match`] = '';
    allSettings[`badge_${index}_label`] = `Badge ${index}`;
  }
  const all = await renderBlock(product, allSettings);
  assert.equal((all.match(/<dialog-component /g) || []).length, 5, 'hard limit of five rows');
  const ids = [...all.matchAll(/<dialog\s+id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, 5, 'unique popup IDs');
  const escaped = await renderBlock(product, { ...settings, badge_2_label: '<script>unsafe</script>' });
  assert.ok(escaped.includes('&lt;script&gt;unsafe&lt;/script&gt;'), 'labels are escaped');
  const iconSchema = JSON.parse(fs.readFileSync(path.join(root, 'blocks/icon.liquid'), 'utf8').match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
  for (let index = 1; index <= 5; index++) {
    assert.deepEqual(schema.settings.find(setting => setting.id === `badge_${index}_icon`).options, iconSchema.settings.find(setting => setting.id === 'icon').options, 'same existing icon picker');
    assert.equal(schema.settings.find(setting => setting.id === `badge_${index}_content`).type, 'richtext');
    assert.ok(!schema.settings.find(setting => setting.id === `badge_${index}_content`).default, 'popup fields start empty');
    assert.ok(schema.settings.find(setting => setting.id === `badge_${index}_source`).options.some(option => option.value === 'custom.garment_construction'), 'construction is selectable in every slot');
  }
  const constructionPreset = schema.presets.find(preset => preset.name === 'Construction Badges');
  assert.ok(constructionPreset, 'construction preset is available');
  const constructionSettings = { ...defaults, ...constructionPreset.settings };
  const constructionCases = [
    ['Side-Seamed', 'Side-Seamed Construction', 'Tubular Construction'],
    ['Tubular', 'Tubular Construction', 'Side-Seamed Construction'],
    ['  side-seamed  ', 'Side-Seamed Construction', 'Tubular Construction'],
    ['', null],
    [undefined, null],
    ['Unknown', null],
    ['Tubular with side seams', null],
  ];
  for (const [value, label, otherLabel] of constructionCases) {
    const constructionProduct = { ...product, metafields: { ...product.metafields, custom: { ...product.metafields.custom, garment_construction: value === undefined ? undefined : scalar(value), fabric_oz: { type: 'number_decimal', value: 5.3 } } } };
    const output = await renderBlock(constructionProduct, constructionSettings, false, 'construction-block');
    assert.ok(!output.includes('feature-badges__weight'), 'construction icons do not receive fabric weight');
    if (!label) {
      assert.equal(output.trim(), '', 'blank or unmatched construction hides the entire block');
      continue;
    }
    assert.equal((output.match(/<dialog-component /g) || []).length, 1, 'only the matching construction renders');
    assert.ok(output.includes(`<span>${label}</span>`), 'matching construction title');
    assert.ok(!output.includes(`<span>${otherLabel}</span>`), 'other construction remains hidden');
    const svg = output.match(/<svg\s+class="feature-badges__icon icon-default"[\s\S]*?<\/svg>/)?.[0];
    assert.ok(svg && svg.includes('<path'), 'construction SVG has actual icon paths');
    const iconName = label === 'Side-Seamed Construction' ? 'side-seam_construction' : 'tubular_construction';
    const expectedIcon = await engine.renderFile('icon', { icon: iconName });
    assert.ok(svg.includes(expectedIcon.trim()), 'selected construction uses its own supplied icon');
  }
  const rawTemplate = fs.readFileSync(path.join(root, 'templates/product.json'), 'utf8');
  const productTemplate = JSON.parse(rawTemplate.slice(rawTemplate.indexOf('{')));
  const descriptionRow = productTemplate.sections.main.blocks['product-details'].blocks.accordion_G8h4j4.blocks.accordion_row_r7w8aY;
  assert.ok(descriptionRow.blocks.feature_badges, 'existing badges remain in the template');
  assert.ok(descriptionRow.block_order.indexOf('construction_badges') < descriptionRow.block_order.indexOf('text_QjLNJK'), 'construction badges appear before the description');
  const configuredConstruction = { ...defaults, ...descriptionRow.blocks.construction_badges.settings };
  for (const [value, index] of [['Side-Seamed', 1], ['Tubular', 2]]) {
    const constructionProduct = { ...product, metafields: { ...product.metafields, custom: { ...product.metafields.custom, garment_construction: scalar(value) } } };
    const output = await renderBlock(constructionProduct, configuredConstruction, false, 'construction-block');
    assert.ok(output.includes(configuredConstruction[`badge_${index}_content`]), 'configured popup explanation renders');
    const combined = await renderBlock(constructionProduct) + output;
    const combinedIds = [...combined.matchAll(/<dialog\s+id="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(combinedIds).size, combinedIds.length, 'multiple badge blocks keep unique dialog IDs');
  }
  assert.ok(schema.settings.filter(setting => setting.id).length <= 40, 'settings remain within recommended limit');
  console.log('Feature Badges: cotton icon weights, empty weight handling, 22 matching scenarios, 7 construction cases and block/schema checks passed.');
  if (process.env.FEATURE_BADGES_PREVIEW) fs.writeFileSync(process.env.FEATURE_BADGES_PREVIEW, rendered);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
