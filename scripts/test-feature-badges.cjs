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
engine.registerFilter('t', key => key === 'accessibility.close_dialog' ? 'Close dialog' : key);
const richText = node => node?.type === 'text' ? node.value : (node?.children || []).map(richText).join('');
engine.registerFilter('metafield_text', source => richText(source.value));

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
  const renderBlock = (currentProduct, currentSettings = settings, designMode = false) => engine.parseAndRender(blockSource, {
    closest: { product: currentProduct }, block: { id: 'test-block', settings: currentSettings }, section: { id: 'test-section' }, request: { design_mode: designMode }
  });
  const rendered = await renderBlock(product, { ...settings, badge_2_content: '<p>A softer cotton yarn.</p>', badge_5_content: '<p>Recycled materials</p>' });
  assert.equal((rendered.match(/<dialog-component /g) || []).length, 3, 'only matching rows render');
  assert.ok(rendered.includes('<p>A softer cotton yarn.</p>'), 'popup HTML renders');
  assert.equal((rendered.match(/class="feature-badges__icon icon-default"/g) || []).length, 3, 'matching badges render their icons');
  assert.ok(!rendered.includes('>Open-End Cotton<'), 'unmatched cotton remains hidden');
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
  }
  assert.ok(schema.settings.filter(setting => setting.id).length <= 40, 'settings remain within recommended limit');
  console.log('Feature Badges: 22 matching scenarios and block rendering/schema checks passed.');
  if (process.env.FEATURE_BADGES_PREVIEW) fs.writeFileSync(process.env.FEATURE_BADGES_PREVIEW, rendered);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
