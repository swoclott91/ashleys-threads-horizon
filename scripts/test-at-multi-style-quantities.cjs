const assert = require('node:assert/strict');
const { test } = require('node:test');

const core = import('../assets/at-multi-style-quantities-core.js');
const transport = import('../assets/at-bulk-transport.js');

const rule = (min = 1, increment = 1, max = null) => ({ min, increment, max });

/** Fake product: options in Shopify order, variants as [id, [valueIds], available?]. */
function product({ options, variants, colorPosition, sizePosition }) {
  const valueName = new Map(options.flatMap((option) => option.values.map(([id, value]) => [id, value])));
  const all = variants.map(([id, ids, available = true, extra = {}]) => ({
    id,
    available,
    price: 1000,
    compareAtPrice: null,
    inventoryQuantity: 50,
    inventoryPolicy: 'deny',
    quantityRule: rule(),
    options: ids.map((optionId) => ({ id: optionId, value: valueName.get(optionId) })),
    ...extra,
  }));
  const requests = [];
  // Mimics sections/at-bulk-color-data.liquid: selected = first variant matching the given IDs
  // (or the first variant when none match), then option_value.variant per size value.
  const fetchBatch = async (ids) => {
    requests.push(ids);
    const known = ids.filter((id) => valueName.has(id));
    const selected = all.find((variant) => known.every((id) => variant.options.some((o) => o.id === id))) ?? all[0];
    const selectedIds = selected.options.map((o) => o.id);
    // Requested IDs override the selected value of their option (Shopify's selected_value).
    for (const id of known) {
      const index = options.findIndex((option) => option.values.some(([valueId]) => valueId === id));
      selectedIds[index] = id;
    }
    let list = [selected];
    if (sizePosition) {
      list = options[sizePosition - 1].values.map(([sizeId]) => {
        const tuple = selectedIds.slice();
        tuple[sizePosition - 1] = sizeId;
        return all.find((variant) => variant.options.every((o, i) => o.id === tuple[i]));
      }).filter(Boolean);
    }
    return {
      productId: '100',
      currency: 'USD',
      colorPosition,
      sizePosition: sizePosition ?? null,
      options: options.map((option, index) => ({
        name: option.name,
        position: index + 1,
        values: option.values.map(([id, value]) => ({ id, value })),
      })),
      variants: list,
    };
  };
  return { fetchBatch, requests };
}

test('normalizes color data and rejects malformed batches', async () => {
  const { normalizeColorBatch } = await core;
  const good = {
    productId: '1', currency: 'USD', colorPosition: 1, sizePosition: 2,
    options: [{ name: 'Color', values: [{ id: '11', value: 'Black' }] }, { name: 'Size', values: [{ id: '21', value: 'S' }] }],
    variants: [{ id: '501', available: true, price: 293, compareAtPrice: 0, inventoryQuantity: 4, inventoryPolicy: 'deny',
      quantityRule: { min: 0, increment: 0, max: null }, options: [{ id: '11', value: 'Black' }, { id: '21', value: 'S' }] }],
  };
  const batch = normalizeColorBatch(good);
  assert.deepEqual(batch.variants[0].quantityRule, { min: 1, increment: 1, max: null });
  assert.equal(batch.variants[0].compareAtPrice, null);
  assert.throws(() => normalizeColorBatch({ ...good, productId: 1 }), /Invalid bulk color data/);
  assert.throws(() => normalizeColorBatch({ ...good, variants: [{ ...good.variants[0], id: 501 }] }), /Invalid bulk color variant/);
  assert.throws(() => normalizeColorBatch({ ...good, variants: [{ ...good.variants[0], options: [{ id: '11', value: 'Black' }] }] }),
    /Invalid bulk color variant/);
});

test('loads all sizes of one color when color is not option 1', async () => {
  const { loadColorVariants } = await core;
  const { fetchBatch, requests } = product({
    colorPosition: 2,
    sizePosition: 1,
    options: [
      { name: 'Size', values: [['21', 'S'], ['22', 'M'], ['23', 'L']] },
      { name: 'Color', values: [['11', 'Black'], ['12', 'Navy']] },
    ],
    variants: [['501', ['21', '11']], ['502', ['22', '11'], false], ['503', ['23', '11']], ['504', ['21', '12']]],
  });
  const result = await loadColorVariants({ colorId: '11', colorPosition: 2, fetchBatch });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.variants.map((v) => v.id), ['501', '502', '503']);
  assert.equal(result.sizeOption.name, 'Size');
  assert.equal(result.extraOption, null);
  assert.deepEqual(requests, [['11']]);
});

test('keeps every third-option value as its own variant, one request per extra value', async () => {
  const { loadColorVariants, buildStyleGrid } = await core;
  const { fetchBatch, requests } = product({
    colorPosition: 1,
    sizePosition: 2,
    options: [
      { name: 'Color', values: [['11', 'Black']] },
      { name: 'Size', values: [['21', 'M'], ['22', 'L']] },
      { name: 'Length', values: [['31', 'Regular'], ['32', 'Tall']] },
    ],
    variants: [['601', ['11', '21', '31']], ['602', ['11', '22', '31']], ['603', ['11', '21', '32']], ['604', ['11', '22', '32']]],
  });
  const result = await loadColorVariants({ colorId: '11', colorPosition: 1, fetchBatch });
  assert.deepEqual(result.variants.map((v) => v.id).sort(), ['601', '602', '603', '604']);
  assert.deepEqual(requests, [['11'], ['11', '21', '32']]);

  const style = { colors: [{ optionValueId: '11', name: 'Black', swatchBackground: null }] };
  const grid = buildStyleGrid(style, new Map([['11', result]]));
  assert.deepEqual(grid.columns.map((c) => c.label), ['M', 'L']);
  assert.deepEqual(grid.rows.map((r) => r.extra.value), ['Regular', 'Tall']);
  assert.equal(grid.rows[0].cells.get('21').id, '601');
  assert.equal(grid.rows[1].cells.get('21').id, '603');
});

test('reports a removed color and a removed product without guessing', async () => {
  const { loadColorVariants } = await core;
  const { fetchBatch } = product({
    colorPosition: 1,
    sizePosition: 2,
    options: [{ name: 'Color', values: [['11', 'Black']] }, { name: 'Size', values: [['21', 'S']] }],
    variants: [['501', ['11', '21']]],
  });
  // Shopify falls back to another color's variant when the requested color is gone.
  assert.deepEqual(await loadColorVariants({ colorId: '19', colorPosition: 1, fetchBatch }), { status: 'missing' });
  assert.deepEqual(await loadColorVariants({ colorId: '11', colorPosition: 1, fetchBatch: async () => null }), { status: 'gone' });
  await assert.rejects(loadColorVariants({ colorId: '11', colorPosition: 1, fetchBatch: async () => { throw new Error('HTTP 500'); } }),
    /HTTP 500/);
});

test('pins the full tuple once when the color-only request resolves another color', async () => {
  const { loadColorVariants } = await core;
  const options = [{ name: 'Color', position: 1, values: [{ id: '11', value: 'Black' }, { id: '12', value: 'Navy' }] },
    { name: 'Size', position: 2, values: [{ id: '21', value: 'S' }] }];
  const variant = (id, color) => ({ id, available: true, price: 1, compareAtPrice: null, inventoryQuantity: 1,
    inventoryPolicy: 'deny', quantityRule: rule(), options: [{ id: color, value: 'x' }, { id: '21', value: 'S' }] });
  const requests = [];
  const fetchBatch = async (ids) => {
    requests.push(ids);
    return { productId: '1', currency: 'USD', colorPosition: 1, sizePosition: 2, options,
      variants: [variant(ids.length === 1 ? '700' : '701', ids.length === 1 ? '11' : '12')] };
  };
  const result = await loadColorVariants({ colorId: '12', colorPosition: 1, fetchBatch });
  assert.deepEqual(result.variants.map((v) => v.id), ['701']);
  assert.deepEqual(requests, [['12'], ['12', '21']]);
});

test('a product without a size option gets one quantity column per color', async () => {
  const { loadColorVariants, buildStyleGrid } = await core;
  const { fetchBatch } = product({
    colorPosition: 1,
    options: [{ name: 'Color', values: [['11', 'Black'], ['12', 'Navy']] }],
    variants: [['801', ['11']], ['802', ['12']]],
  });
  const black = await loadColorVariants({ colorId: '11', colorPosition: 1, fetchBatch });
  assert.deepEqual(black.variants.map((v) => v.id), ['801']);
  const style = { colors: [{ optionValueId: '11', name: 'Black' }, { optionValueId: '12', name: 'Navy' }] };
  const grid = buildStyleGrid(style, new Map([['11', black], ['12', { status: 'missing' }]]));
  assert.deepEqual(grid.columns, [{ id: null, label: null }]);
  assert.equal(grid.rows[0].cells.get(null).id, '801');
  assert.equal(grid.rows[1].status, 'missing');
  assert.equal(grid.rows[1].cells.size, 0);
});

test('two variants with the same labels never share a cell', async () => {
  const { buildStyleGrid } = await core;
  const v = (id) => ({ id, available: true, price: 1, quantityRule: rule(), options: [{ id: '11', value: 'Black' }, { id: '21', value: 'M' }] });
  const result = { status: 'ok', sizeOption: { name: 'Size', position: 2, values: [{ id: '21', value: 'M' }] }, extraOption: null,
    variants: [v('901'), v('902')] };
  const grid = buildStyleGrid({ colors: [{ optionValueId: '11', name: 'Black' }] }, new Map([['11', result]]));
  assert.equal(grid.rows.length, 2);
  assert.deepEqual(grid.rows.map((row) => row.cells.get('21').id), ['901', '902']);
  assert.notEqual(grid.rows[0].key, grid.rows[1].key);
});

test('the draft is keyed by variant ID across a third option and follows the selection', async () => {
  const { QuantityDraft } = await core;
  const variants = new Map([
    ['601', { id: '601', available: true, price: 500, quantityRule: rule() }],
    ['603', { id: '603', available: true, price: 700, quantityRule: rule() }],
    ['701', { id: '701', available: true, price: 100, quantityRule: rule() }],
  ]);
  const draft = new QuantityDraft();
  // Black / M / Regular and Black / M / Tall share color and size labels.
  draft.set('601', '2', { productId: '1', colorId: '11' });
  draft.set('603', '3', { productId: '1', colorId: '11' });
  draft.set('701', '4', { productId: '2', colorId: '51' });
  assert.equal(draft.get('601'), '2');
  assert.equal(draft.get('603'), '3');
  assert.deepEqual(draft.summarize((id) => variants.get(id)), {
    items: [{ id: '601', quantity: 2 }, { id: '603', quantity: 3 }, { id: '701', quantity: 4 }],
    invalid: [], count: 9, subtotal: 2 * 500 + 3 * 700 + 400,
  });
  assert.equal(draft.summarize((id) => variants.get(id), { productId: '1' }).count, 5);

  // Style 2 deselected, style 1 still selected: its quantities survive.
  draft.retainSelection([{ productId: '1', colors: [{ optionValueId: '11' }] }]);
  assert.deepEqual(draft.entries().map((e) => e.variantId), ['601', '603']);
  draft.set('601', '', { productId: '1', colorId: '11' });
  assert.equal(draft.size, 1);
});

test('validates quantities against min, max and increment rules', async () => {
  const { validateQuantity, stepQuantity, QuantityDraft } = await core;
  const variant = { id: '1', available: true, price: 100, quantityRule: rule(6, 6, 24) };
  assert.deepEqual(validateQuantity('', variant), { quantity: 0, error: null });
  assert.deepEqual(validateQuantity('0', variant), { quantity: 0, error: null });
  assert.equal(validateQuantity('2.5', variant).error, 'integer');
  assert.equal(validateQuantity('-6', variant).error, 'integer');
  assert.equal(validateQuantity('abc', variant).error, 'integer');
  assert.equal(validateQuantity('3', variant).error, 'min');
  assert.equal(validateQuantity('30', variant).error, 'max');
  assert.equal(validateQuantity('15', variant).error, 'increment');
  assert.deepEqual(validateQuantity(' 18 ', variant), { quantity: 18, error: null });
  assert.equal(validateQuantity('6', { ...variant, available: false }).error, 'unavailable');
  assert.equal(validateQuantity('3', { id: '2', available: true, quantityRule: rule() }).error, null);

  assert.equal(stepQuantity('', variant, 1), 6);
  assert.equal(stepQuantity('6', variant, 1), 12);
  assert.equal(stepQuantity('24', variant, 1), 24);
  assert.equal(stepQuantity('6', variant, -1), 0);
  assert.equal(stepQuantity('12', variant, -1), 6);

  const draft = new QuantityDraft().set('1', '15', { productId: '1', colorId: '11' });
  const summary = draft.summarize(() => variant);
  assert.deepEqual(summary.invalid, ['1']);
  assert.deepEqual(summary.items, []);
});

test('classifies add responses', async () => {
  const { classifyAddResponse } = await core;
  const requested = [{ id: '1', quantity: 2 }, { id: '2', quantity: 1 }];
  const items = [{ variant_id: '1' }, { variant_id: '2' }];
  assert.equal(classifyAddResponse(requested, { ok: true, status: 200, items, data: {} }), 'ok');
  assert.equal(classifyAddResponse(requested, { ok: true, status: 200, items: items.slice(0, 1), data: {} }), 'rejected');
  assert.equal(classifyAddResponse(requested, { ok: false, status: 422, items: [], data: { status: 422 } }), 'rejected');
  assert.equal(classifyAddResponse(requested, { ok: false, status: 502, items: [], data: null }), 'lost');
  assert.equal(classifyAddResponse(requested, { ok: false, status: 200, items: [], data: null }), 'lost');
  assert.equal(classifyAddResponse(requested, null), 'lost');
});

test('reconciles a full success and clears the draft', async () => {
  const { reconcileCartAdd, applyReconciliation, cartQuantities, QuantityDraft } = await core;
  const draft = new QuantityDraft().set('1', '2', { productId: 'p', colorId: 'c' }).set('2', '3', { productId: 'p', colorId: 'c' });
  const result = reconcileCartAdd({
    requested: [{ id: '1', quantity: 2 }, { id: '2', quantity: 3 }],
    baseline: cartQuantities([]),
    after: cartQuantities([{ variant_id: '1', quantity: 2 }, { variant_id: '2', quantity: 3 }]),
    outcome: 'rejected',
  });
  assert.equal(result.status, 'success');
  assert.equal(result.addedCount, 5);
  applyReconciliation(draft, result);
  assert.equal(draft.size, 0);
});

test('a partial add clears confirmed quantities and keeps the remainder', async () => {
  const { reconcileCartAdd, applyReconciliation, cartQuantities, QuantityDraft } = await core;
  const meta = { productId: 'p', colorId: 'c' };
  const draft = new QuantityDraft().set('1', '2', meta).set('2', '10', meta).set('3', '5', meta);
  const result = reconcileCartAdd({
    requested: [{ id: '1', quantity: 2 }, { id: '2', quantity: 10 }, { id: '3', quantity: 5 }],
    baseline: new Map(),
    after: cartQuantities([{ id: 1, variant_id: 1, quantity: 2 }, { variant_id: '2', quantity: 4 }]),
    outcome: 'rejected',
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.addedCount, 6);
  assert.deepEqual(result.rows.get('2'), { kind: 'partial', requested: 10, added: 4, remaining: 6 });
  assert.equal(result.rows.get('3').kind, 'not_added');
  applyReconciliation(draft, result);
  assert.equal(draft.get('1'), '');
  assert.equal(draft.get('2'), '6');
  assert.equal(draft.get('3'), '5');
  assert.deepEqual(draft.entries().find((e) => e.variantId === '2'), { variantId: '2', raw: '6', ...meta });
});

test('an existing line for the same variant is part of the baseline, not of the add', async () => {
  const { reconcileCartAdd, cartQuantities } = await core;
  const baseline = cartQuantities([
    { variant_id: '1', quantity: 3, key: '1:a' },
    { variant_id: '1', quantity: 1, key: '1:b', properties: { note: 'x' } },
    { variant_id: '9', quantity: 7 },
  ]);
  assert.equal(baseline.get('1'), 4);
  const full = reconcileCartAdd({
    requested: [{ id: '1', quantity: 5 }],
    baseline,
    after: cartQuantities([{ variant_id: '1', quantity: 8 }, { variant_id: '1', quantity: 1 }, { variant_id: '9', quantity: 7 }]),
    outcome: 'rejected',
  });
  assert.equal(full.status, 'success');
  const partial = reconcileCartAdd({
    requested: [{ id: '1', quantity: 5 }],
    baseline,
    after: cartQuantities([{ variant_id: '1', quantity: 6 }, { variant_id: '9', quantity: 7 }]),
    outcome: 'rejected',
  });
  assert.deepEqual(partial.rows.get('1'), { kind: 'partial', requested: 5, added: 2, remaining: 3 });
  const none = reconcileCartAdd({ requested: [{ id: '1', quantity: 5 }], baseline, after: baseline, outcome: 'rejected' });
  assert.equal(none.status, 'none');
  assert.equal(none.rows.get('1').kind, 'not_added');
});

test('a lost response with a successful cart read is reconciled; zero deltas stay unconfirmed', async () => {
  const { reconcileCartAdd, cartQuantities } = await core;
  const requested = [{ id: '1', quantity: 2 }, { id: '2', quantity: 3 }];
  const allIn = reconcileCartAdd({ requested, baseline: new Map(),
    after: cartQuantities([{ variant_id: '1', quantity: 2 }, { variant_id: '2', quantity: 3 }]), outcome: 'lost' });
  assert.equal(allIn.status, 'success');
  const nothing = reconcileCartAdd({ requested, baseline: new Map(), after: new Map(), outcome: 'lost' });
  assert.equal(nothing.status, 'none');
  assert.equal(nothing.rows.get('1').kind, 'unconfirmed');
  const some = reconcileCartAdd({ requested, baseline: new Map(), after: cartQuantities([{ variant_id: '2', quantity: 3 }]), outcome: 'lost' });
  assert.equal(some.status, 'partial');
  assert.equal(some.rows.get('1').kind, 'unconfirmed');
  assert.equal(some.rows.get('2').kind, 'added');
});

test('a failed cart read or an unexplained delta leaves the draft untouched', async () => {
  const { reconcileCartAdd, applyReconciliation, QuantityDraft } = await core;
  const meta = { productId: 'p', colorId: 'c' };
  const requested = [{ id: '1', quantity: 2 }, { id: '2', quantity: 3 }];
  for (const result of [
    reconcileCartAdd({ requested, baseline: new Map(), after: null, outcome: 'lost' }),
    reconcileCartAdd({ requested, baseline: null, after: new Map(), outcome: 'rejected' }),
    // More than requested (another tab added too) and fewer than before (a line was removed).
    reconcileCartAdd({ requested, baseline: new Map(), after: new Map([['1', 2], ['2', 5]]), outcome: 'rejected' }),
    reconcileCartAdd({ requested, baseline: new Map([['1', 4]]), after: new Map([['1', 1], ['2', 3]]), outcome: 'lost' }),
  ]) {
    assert.equal(result.status, 'uncertain');
    const draft = new QuantityDraft().set('1', '2', meta).set('2', '3', meta);
    applyReconciliation(draft, result);
    assert.deepEqual(draft.entries().map((e) => [e.variantId, e.raw]), [['1', '2'], ['2', '3']]);
  }
});

test('a pending submit ignores repeat clicks until it ends', async () => {
  const { SubmitGuard } = await core;
  const guard = new SubmitGuard();
  let posts = 0;
  let release;
  const submit = async () => {
    if (!guard.tryBegin()) return 'ignored';
    try {
      posts += 1;
      await new Promise((resolve) => { release = resolve; });
      return 'sent';
    } finally {
      guard.end();
    }
  };
  const first = submit();
  assert.equal(await submit(), 'ignored');
  assert.equal(await submit(), 'ignored');
  assert.equal(guard.pending, true);
  release();
  assert.equal(await first, 'sent');
  assert.equal(posts, 1);
  assert.equal(guard.pending, false);
  const again = submit();
  release();
  assert.equal(await again, 'sent');
  assert.equal(posts, 2);
});

test('runs at most three style loads at a time', async () => {
  const { runWithConcurrency } = await core;
  let active = 0;
  let peak = 0;
  const done = [];
  const tasks = Array.from({ length: 7 }, (_, i) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (i === 2) throw new Error('one style failed');
    done.push(i);
  });
  await runWithConcurrency(tasks, 3);
  assert.equal(peak, 3);
  assert.equal(done.length, 6);
});

test('labels stock like the single-product bulk grid', async () => {
  const { availabilityBand } = await core;
  assert.equal(availabilityBand({ available: false, inventoryQuantity: 5, inventoryPolicy: 'deny' }), 'out');
  assert.equal(availabilityBand({ available: true, inventoryQuantity: 5, inventoryPolicy: 'continue' }), 'in_stock');
  assert.equal(availabilityBand({ available: true, inventoryQuantity: 240, inventoryPolicy: 'deny' }), 240);
  assert.equal(availabilityBand({ available: true, inventoryQuantity: 1500, inventoryPolicy: 'deny' }), 'many');
});

test('requests one color from the color data section', async () => {
  const { fetchBulkColorBatch } = await transport;
  const requests = [];
  global.window = { location: { origin: 'https://shop.example' }, Shopify: { routes: { root: '/' } } };
  global.DOMParser = class {
    parseFromString(html) {
      return { querySelector: () => ({ textContent: /<script[^>]*>(.*)<\/script>/s.exec(html)[1] }) };
    }
  };
  global.fetch = async (url) => {
    requests.push(new URL(url));
    return Response.json({ 'at-bulk-color-data': '<script type="application/json" data-at-bulk-color>{"productId":"1"}</script>' });
  };
  assert.deepEqual(await fetchBulkColorBatch('/products/hat', ['11']), { productId: '1' });
  assert.equal(requests[0].searchParams.get('sections'), 'at-bulk-color-data');
  assert.equal(requests[0].searchParams.get('option_values'), '11');
  await assert.rejects(fetchBulkColorBatch('/products/hat', [11]), TypeError);
  await assert.rejects(fetchBulkColorBatch('/products/hat', []), TypeError);
  global.fetch = async () => new Response(null, { status: 404 });
  assert.equal(await fetchBulkColorBatch('/products/hat', ['11']), null);
});
