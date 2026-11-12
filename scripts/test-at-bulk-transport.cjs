const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');

const origin = 'https://shop.example';
const variantId = '9007199254740993';
const options = [
  { id: '210', name: 'Size', value: 'S', swatchBackground: null },
  { id: '230', name: 'Color', value: 'Red', swatchBackground: 'rgb(255 0 0)' },
  { id: '250', name: 'Finish', value: 'Matte', swatchBackground: null },
];
const variant = { id: variantId, options, available: false, inventoryQuantity: 0, inventoryPolicy: 'deny',
  price: 1200, compareAtPrice: null, quantityRule: { min: 2, increment: 2, max: 10 } };
const productId = '100';
const currency = 'CAD';
const targetedSection = 'at-bulk-variant-data';
const legacySection = 'at-bulk-grid-data';
const requests = [];

const transport = import('../assets/at-bulk-transport.js');

function mockResponse(response) {
  global.fetch = async (url, init) => {
    requests.push({ url: new URL(url, origin), init });
    return response;
  };
}

function mockSection(section, attribute, data) {
  const html = `<script type="application/json" ${attribute}>${JSON.stringify(data)}</script>`;
  const json = JSON.stringify({ [section]: html });
  mockResponse(new Response(json));
  return Buffer.byteLength(json);
}

beforeEach(() => {
  requests.length = 0;
  global.window = { location: { origin }, Shopify: { routes: { root: '/fr-ca/' } } };
  delete global.Theme;
  global.DOMParser = class {
    parseFromString(html) {
      return {
        querySelector(selector) {
          const attribute = selector.slice('script['.length, -1);
          const script = new RegExp(`<script[^>]* ${attribute}>(.*?)</script>`, 's').exec(html);
          return script ? { textContent: script[1] } : null;
        },
      };
    }
  };
});

test('resolves a high variant by decimal ID with one skinny request', async (t) => {
  const { fetchBulkVariant } = await transport;
  const bytes = mockSection(targetedSection, 'data-at-bulk-variant', { productId, currency, variant });
  const result = await fetchBulkVariant('/products/shirt?variant=999&preview_theme_id=5', { variantId, productId });
  assert.deepEqual(result, { status: 'found', productId, currency, variant });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, '/fr-ca/products/shirt');
  assert.equal(requests[0].url.searchParams.get('variant'), variantId);
  assert.equal(requests[0].url.searchParams.get('preview_theme_id'), '5');
  assert.equal(requests[0].url.searchParams.get('sections'), targetedSection);
  t.diagnostic(`1 fixture request, ${bytes} bytes of section response JSON`);
});

test('matches one, reversed two, and distinct three-option tuples in Shopify order', async () => {
  const { fetchBulkVariant } = await transport;
  for (const tuple of [options.slice(1, 2), options.slice(0, 2), options,
    [...options.slice(0, 2), { ...options[2], id: '251', value: 'Gloss' }]]) {
    const selected = { ...variant, id: `9${tuple.at(-1).id}`, options: tuple };
    const ids = tuple.map(({ id }) => id);
    mockSection(targetedSection, 'data-at-bulk-variant', { productId, currency, variant: selected });
    const signal = new AbortController().signal;
    const result = await fetchBulkVariant('/fr-ca/products/shirt?option_values=123', { optionValueIds: ids, signal });
    assert.equal(result.variant.id, selected.id);
    assert.deepEqual(result.variant.options, tuple);
    assert.equal(requests.at(-1).url.searchParams.get('option_values'), ids.join(','));
    assert.equal(requests.at(-1).init.signal, signal);
  }
  assert.equal(requests.length, 4);
});

test('returns missing for null, a wrong ID or product, and incomplete, reordered or wrong tuples', async () => {
  const { fetchBulkVariant } = await transport;
  const ids = options.map(({ id }) => id);
  for (const selection of [{ variantId: '999' }, { variantId, productId: '999' },
    { optionValueIds: ids.slice(0, 2) }, { optionValueIds: [ids[1], ids[0], ids[2]] },
    { optionValueIds: [...ids.slice(0, 2), '251'] }]) {
    mockSection(targetedSection, 'data-at-bulk-variant', { productId, currency, variant });
    const result = await fetchBulkVariant('/products/shirt', selection);
    assert.equal(result.status, 'missing');
    assert.equal(result.variant, null);
  }
  mockSection(targetedSection, 'data-at-bulk-variant', { productId, currency, variant: null });
  assert.equal((await fetchBulkVariant('/products/shirt', { variantId })).status, 'missing');
  mockResponse(new Response(null, { status: 404 }));
  assert.equal((await fetchBulkVariant('/products/shirt', { variantId })).status, 'missing');
});

test('preserves legacy variant batches and rejects malformed section responses', async () => {
  const { fetchBulkVariant, fetchBulkVariantBatch } = await transport;
  const variants = [{ id: 91, a: true, q: 10, p: 'deny', o1: 'Red', o2: 'S', pr: 1200, cp: 0 }];
  mockSection(legacySection, 'data-at-bulk-variants', { variants });
  assert.deepEqual(await fetchBulkVariantBatch('/products/shirt', [230]), variants);
  assert.equal(requests[0].url.searchParams.get('option_values'), '230');
  mockResponse(Response.json({ [targetedSection]: null }));
  await assert.rejects(fetchBulkVariant('/products/shirt', { variantId }), /could not render/);
  mockResponse(Response.json({ [targetedSection]: '<script data-at-bulk-variant>{</script>' }));
  await assert.rejects(fetchBulkVariant('/products/shirt', { variantId }), SyntaxError);
  mockSection(legacySection, 'data-at-bulk-variants', { variants: null });
  await assert.rejects(fetchBulkVariantBatch('/products/shirt', [230]), /Invalid bulk variant batch/);
});

test('renders both sections in the active draft theme', async () => {
  const { fetchBulkVariant, fetchBulkVariantBatch } = await transport;
  window.Shopify.theme = { id: 5, role: 'unpublished' };
  mockSection(legacySection, 'data-at-bulk-variants', { variants: [] });
  await fetchBulkVariantBatch('/products/shirt', [230]);
  assert.equal(requests[0].url.searchParams.get('preview_theme_id'), '5');

  mockSection(targetedSection, 'data-at-bulk-variant', { productId, currency, variant });
  await fetchBulkVariant('/products/shirt', { variantId });
  assert.equal(requests[1].url.searchParams.get('preview_theme_id'), '5');

  window.Shopify.theme.role = 'main';
  mockSection(legacySection, 'data-at-bulk-variants', { variants: [] });
  await fetchBulkVariantBatch('/products/shirt', [230]);
  assert.equal(requests[2].url.searchParams.has('preview_theme_id'), false);
});

test('posts normalized cart inputs and exposes status, lines and bundled sections', async () => {
  const { postBulkCartItems } = await transport;
  global.Theme = { routes: { cart_add_url: '/fr-ca/custom-cart/add.js' } };
  const sections = { drawer: '<div>Cart</div>', footer: null };
  const line = { id: 91, variant_id: 91, quantity: 2, key: '91:abc', properties: { engraving: 'A' } };
  mockResponse(Response.json({ items: [line], sections }, { status: 201 }));
  const signal = new AbortController().signal;
  const result = await postBulkCartItems([{ id: variantId, quantity: 2 }], { sectionIds: ['drawer', 'drawer', 'footer'], signal });
  assert.equal(result.status, 201);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, [{ ...line, id: '91', variant_id: '91' }]);
  assert.deepEqual(result.sections, sections);
  assert.equal(requests[0].url.pathname, '/fr-ca/custom-cart/add.js');
  assert.equal(requests[0].init.signal, signal);
  assert.deepEqual(JSON.parse(requests[0].init.body), { items: [{ id: variantId, quantity: 2 }], sections: 'drawer,footer' });
  await assert.rejects(postBulkCartItems([{ id: 91, quantity: 2 }]), TypeError);
  await assert.rejects(postBulkCartItems([{ id: '91', quantity: 1.5 }]), TypeError);
  assert.equal(requests.length, 1);
});

test('keeps partial lines on rejection and reads authoritative cart without caching', async () => {
  const { postBulkCartItems, readBulkCart } = await transport;
  const line = { id: 91, quantity: 4, key: '91:abc', selling_plan_allocation: null };
  const rejection = { status: 422, description: 'Only four available', items: [line] };
  mockResponse(Response.json(rejection, { status: 422 }));
  const result = await postBulkCartItems([{ id: '91', quantity: 9 }]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.deepEqual(result.error, rejection);
  assert.equal(result.items[0].variant_id, '91');
  assert.equal(requests[0].url.pathname, '/fr-ca/cart/add.js');
  const cart = { items: [line], item_count: 4, currency, total_price: 400 };
  mockResponse(Response.json(cart));
  const current = await readBulkCart();
  assert.equal(current.ok, true);
  assert.deepEqual(current.data, cart);
  assert.equal(current.items[0].key, '91:abc');
  assert.equal(requests[1].url.pathname, '/fr-ca/cart.js');
  assert.equal(requests[1].init.cache, 'no-store');
  mockResponse(new Response('Bad gateway', { status: 502 }));
  const badResponse = await readBulkCart();
  assert.equal(badResponse.ok, false);
  assert.equal(badResponse.status, 502);
  mockResponse(Response.json({}));
  assert.equal((await readBulkCart()).ok, false);
});
