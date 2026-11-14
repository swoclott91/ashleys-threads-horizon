const assert = require('node:assert/strict');
const { test } = require('node:test');

const selector = import('../assets/at-multi-style-bulk-order.js');

test('loads in Node without defining the element', async () => {
  const { CHOOSE_QUANTITIES_EVENT, FILTERS } = await selector;
  assert.equal(CHOOSE_QUANTITIES_EVENT, 'at-bulk-order:choose-quantities');
  assert.deepEqual(FILTERS, ['all', 'purchase', 'favorite']);
});

test('parses sources in a fixed order and drops unknown ones', async () => {
  const { parseSources } = await selector;
  assert.deepEqual(parseSources('favorite purchase'), ['purchase', 'favorite']);
  assert.deepEqual(parseSources(' favorite  favorite bogus '), ['favorite']);
  assert.deepEqual(parseSources(''), []);
  assert.deepEqual(parseSources(undefined), []);
});

test('filters rows by source, with All and unknown filters showing everything', async () => {
  const { matchesFilter } = await selector;
  const both = ['purchase', 'favorite'];
  assert.equal(matchesFilter(both, 'all'), true);
  assert.equal(matchesFilter(both, 'purchase'), true);
  assert.equal(matchesFilter(both, 'favorite'), true);
  assert.equal(matchesFilter(['purchase'], 'favorite'), false);
  assert.equal(matchesFilter(['favorite'], 'purchase'), false);
  assert.equal(matchesFilter(['favorite'], 'nope'), true);
});

test('normalizes a style: string IDs, merged duplicate colors, invalid colors dropped', async () => {
  const { normalizeStyle } = await selector;
  const style = normalizeStyle({
    productId: '8123456789012',
    productUrl: '/products/gildan-5000',
    title: 'Gildan 5000',
    imageUrl: '//cdn.shopify.com/x.jpg',
    colorOptionPosition: '1',
    sources: 'favorite purchase',
    colors: [
      { optionValueId: '9007199254740993', name: 'Black', swatchBackground: 'rgb(0 0 0)', sources: 'purchase' },
      { optionValueId: '9007199254740993', name: 'Black', swatchBackground: 'rgb(0 0 0)', sources: 'favorite' },
      { optionValueId: '222', name: 'Navy', swatchBackground: '', sources: 'favorite' },
      { optionValueId: 'gid://shopify/ProductOptionValue/1', name: 'Bad', sources: 'favorite' },
      { optionValueId: '', name: 'Empty', sources: 'purchase' },
    ],
  });
  assert.deepEqual(style, {
    productId: '8123456789012',
    productUrl: '/products/gildan-5000',
    title: 'Gildan 5000',
    imageUrl: '//cdn.shopify.com/x.jpg',
    colorOptionPosition: 1,
    sources: ['purchase', 'favorite'],
    colors: [
      { optionValueId: '9007199254740993', name: 'Black', swatchBackground: 'rgb(0 0 0)', sources: ['favorite', 'purchase'] },
      { optionValueId: '222', name: 'Navy', swatchBackground: null, sources: ['favorite'] },
    ],
  });
  for (const color of style.colors) assert.equal(typeof color.optionValueId, 'string');
});

test('rejects styles the dialog could not load', async () => {
  const { normalizeStyle } = await selector;
  const color = { optionValueId: '1', name: 'Red', sources: 'favorite' };
  assert.equal(normalizeStyle({ productId: '1', productUrl: '/products/a', colors: [] }), null);
  assert.equal(normalizeStyle({ productId: '0', productUrl: '/products/a', colors: [color] }), null);
  assert.equal(normalizeStyle({ productId: '1', productUrl: 'https://evil.example/products/a', colors: [color] }), null);
  assert.equal(normalizeStyle({ productId: '1', productUrl: '/products/a', colors: [color] }).colorOptionPosition, 1);
  assert.equal(normalizeStyle({ productId: '1', productUrl: '/products/a', colorOptionPosition: '2', colors: [color] })
    .colorOptionPosition, 2);
});

test('keeps selection order and ignores repeats, removals of unknown IDs and unknown styles', async () => {
  const { StyleSelection } = await selector;
  const selection = new StyleSelection();
  selection.set('3', true).set('1', true).set('3', true).set('2', true).set('9', false);
  assert.deepEqual(selection.ids, ['3', '1', '2']);
  selection.set('1', false);
  assert.deepEqual(selection.ids, ['3', '2']);
  assert.equal(selection.has(2), true);
  assert.equal(selection.size, 2);
  const styles = new Map([['2', { productId: '2' }]]);
  assert.deepEqual(selection.resolve(styles), [{ productId: '2' }]);
  selection.clear();
  assert.equal(selection.size, 0);
});

test('payload copies cannot change the selector data', async () => {
  const { clonePayloadStyles } = await selector;
  const original = [{ productId: '1', sources: ['favorite'], colors: [{ optionValueId: '2', sources: ['favorite'] }] }];
  const copy = clonePayloadStyles(original);
  copy[0].sources.push('purchase');
  copy[0].colors[0].sources.push('purchase');
  copy[0].colors.push({});
  assert.deepEqual(original[0].sources, ['favorite']);
  assert.deepEqual(original[0].colors, [{ optionValueId: '2', sources: ['favorite'] }]);
});

test('formats the live selected count with plural rules', async () => {
  const { formatCount } = await selector;
  const strings = { selectedOne: '[count] style selected', selectedOther: '[count] styles selected' };
  assert.equal(formatCount(strings, 1, 'en'), '1 style selected');
  assert.equal(formatCount(strings, 0, 'en'), '0 styles selected');
  assert.equal(formatCount(strings, 3, 'not a locale!'), '3 styles selected');
});
