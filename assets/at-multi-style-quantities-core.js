/**
 * AT Multi-style bulk order: pure logic for the "Choose quantities" dialog
 * (assets/at-multi-style-quantities.js). No imports and no DOM, so every function here is
 * tested in Node (scripts/test-at-multi-style-quantities.cjs).
 *
 * - Variant data: normalizeColorBatch / loadColorVariants read sections/at-bulk-color-data.liquid
 *   one color at a time (never all variants of a product) and keep each variant's full option
 *   tuple. buildStyleGrid turns the per-color results into rows (color + third option) and
 *   size columns, keyed by exact variant ID.
 * - Draft: QuantityDraft holds what the shopper typed, keyed by variant ID, shared by the
 *   desktop grid and the mobile steppers and kept across close / reopen.
 * - Cart: classifyAddResponse + reconcileCartAdd decide, per exact variant ID, what a cart
 *   add really did by comparing cart reads before and after. Nothing here ever resubmits.
 */

export const isDecimalId = (id) => typeof id === 'string' && /^[1-9]\d*$/.test(id);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

/* ── Variant data ───────────────────────────────────────────────────────────────────────── */

function normalizeVariant(raw, optionCount) {
  const rule = raw?.quantityRule ?? {};
  const min = Number.isSafeInteger(rule.min) && rule.min > 0 ? rule.min : 1;
  const increment = Number.isSafeInteger(rule.increment) && rule.increment > 0 ? rule.increment : 1;
  const max = Number.isSafeInteger(rule.max) && rule.max > 0 ? rule.max : null;
  if (!isDecimalId(raw?.id) || typeof raw.available !== 'boolean' || !isCount(raw.price)
    || !Array.isArray(raw.options) || raw.options.length !== optionCount
    || !raw.options.every((option) => isDecimalId(option?.id) && typeof option.value === 'string')) {
    throw new Error('Invalid bulk color variant');
  }
  return {
    id: raw.id,
    available: raw.available,
    price: raw.price,
    compareAtPrice: isCount(raw.compareAtPrice) && raw.compareAtPrice > raw.price ? raw.compareAtPrice : null,
    inventoryQuantity: Number.isSafeInteger(raw.inventoryQuantity) ? raw.inventoryQuantity : null,
    inventoryPolicy: typeof raw.inventoryPolicy === 'string' ? raw.inventoryPolicy : '',
    quantityRule: { min, increment, max },
    options: raw.options.map(({ id, value }) => ({ id, value })),
  };
}

/**
 * Validates the JSON from sections/at-bulk-color-data.liquid. Throws on anything malformed.
 * @param {any} data
 */
export function normalizeColorBatch(data) {
  if (!data || typeof data !== 'object' || !isDecimalId(data.productId) || !Array.isArray(data.options)
    || data.options.length < 1 || data.options.length > 3 || !Array.isArray(data.variants)) {
    throw new Error('Invalid bulk color data');
  }
  const options = data.options.map((option, index) => {
    if (typeof option?.name !== 'string' || !Array.isArray(option.values)
      || !option.values.every((value) => isDecimalId(value?.id) && typeof value.value === 'string')) {
      throw new Error('Invalid bulk color option');
    }
    return { name: option.name, position: index + 1, values: option.values.map(({ id, value }) => ({ id, value })) };
  });
  const position = (value) => (Number.isSafeInteger(value) && value >= 1 && value <= options.length ? value : null);
  return {
    productId: data.productId,
    currency: typeof data.currency === 'string' ? data.currency : '',
    colorPosition: position(data.colorPosition),
    sizePosition: position(data.sizePosition),
    options,
    variants: data.variants.map((variant) => normalizeVariant(variant, options.length)),
  };
}

/**
 * Loads all sizes Shopify offers for one color. `fetchBatch(optionValueIds)` resolves the
 * raw section JSON (or null for a 404) and may reject; rejections propagate to the caller.
 *
 * Result: { status: 'ok', colorPosition, sizeOption, extraOption, variants }
 *       | { status: 'missing' }  (color no longer on the product, or it has no variants)
 *       | { status: 'gone' }     (product no longer available)
 *
 * Requests: one for the color; when the product has a third option, one more per other
 * value of that option, each a full tuple (color, first size, third value) in option order.
 * @param {{ colorId: string, colorPosition: number, fetchBatch: (ids: string[]) => Promise<any> }} input
 */
export async function loadColorVariants({ colorId, colorPosition, fetchBatch }) {
  const raw = await fetchBatch([colorId]);
  if (raw === null) return { status: 'gone' };
  const first = normalizeColorBatch(raw);
  const colorPos = first.colorPosition ?? colorPosition;
  const colorOption = first.options[colorPos - 1];
  if (!colorOption?.values.some(({ id }) => id === colorId)) return { status: 'missing' };

  const sizePos = first.sizePosition !== colorPos ? first.sizePosition : null;
  const extraPos = first.options.findIndex((_, index) => index + 1 !== colorPos && index + 1 !== sizePos) + 1 || null;
  const sizeOption = sizePos ? first.options[sizePos - 1] : null;
  const extraOption = extraPos ? first.options[extraPos - 1] : null;

  const byId = new Map();
  const keep = (variants, extraId = null) => {
    for (const variant of variants) {
      if (variant.options[colorPos - 1].id !== colorId) continue;
      if (extraId !== null && variant.options[extraPos - 1].id !== extraId) continue;
      byId.set(variant.id, variant);
    }
  };
  const tuple = (extraId) => first.options.map((option, index) => {
    if (index + 1 === colorPos) return colorId;
    if (index + 1 === extraPos) return extraId;
    return option.values[0]?.id;
  });

  keep(first.variants);
  if (byId.size === 0 && first.options.length > 1) {
    // Shopify picked a variant without this color: pin the full tuple once.
    const pinned = await fetchBatch(tuple(extraOption?.values[0]?.id));
    if (pinned === null) return { status: 'gone' };
    keep(normalizeColorBatch(pinned).variants, extraOption?.values[0]?.id ?? null);
  }
  if (extraOption) {
    const seen = new Set([...byId.values()].map((variant) => variant.options[extraPos - 1].id));
    for (const { id: extraId } of extraOption.values) {
      if (seen.has(extraId)) continue;
      const batch = await fetchBatch(tuple(extraId));
      if (batch === null) return { status: 'gone' };
      keep(normalizeColorBatch(batch).variants, extraId);
    }
  }
  if (byId.size === 0) return { status: 'missing' };
  return { status: 'ok', colorPosition: colorPos, sizeOption, extraOption, variants: [...byId.values()] };
}

/**
 * Rows and size columns for one style.
 * @param {{ colors: Array<{ optionValueId: string, name: string, swatchBackground: string | null }> }} style
 * @param {Map<string, any>} results - colorId → loadColorVariants result, or { status: 'error' | 'loading' }
 */
export function buildStyleGrid(style, results) {
  const loaded = style.colors.map((color) => results.get(color.optionValueId)).filter((r) => r?.status === 'ok');
  const sizeOption = loaded.find((r) => r.sizeOption)?.sizeOption ?? null;
  const sizePos = sizeOption?.position ?? null;
  const usedSizes = new Set();
  for (const result of loaded) {
    for (const variant of result.variants) if (sizePos) usedSizes.add(variant.options[sizePos - 1].id);
  }
  const columns = sizeOption
    ? sizeOption.values.filter(({ id }) => usedSizes.has(id)).map(({ id, value }) => ({ id, label: value }))
    : [{ id: null, label: null }];

  const rows = [];
  for (const color of style.colors) {
    const result = results.get(color.optionValueId);
    const base = { colorId: color.optionValueId, colorName: color.name, swatchBackground: color.swatchBackground };
    if (result?.status !== 'ok') {
      rows.push({ ...base, key: color.optionValueId, status: result?.status ?? 'loading', extra: null, cells: new Map() });
      continue;
    }
    const extraPos = result.extraOption?.position ?? null;
    const extraOrder = result.extraOption ? result.extraOption.values.map(({ id }) => id) : [null];
    const colorRows = [];
    for (const variant of result.variants) {
      const extra = extraPos ? variant.options[extraPos - 1] : null;
      const sizeKey = sizePos ? variant.options[sizePos - 1].id : null;
      const groupKey = `${color.optionValueId}:${extra?.id ?? ''}`;
      // Never let two variants share a cell: a clash starts another row with the same labels.
      let row = colorRows.find((candidate) => candidate.group === groupKey && !candidate.cells.has(sizeKey));
      if (!row) {
        const count = colorRows.filter((candidate) => candidate.group === groupKey).length;
        row = {
          ...base,
          key: count ? `${groupKey}#${count}` : groupKey,
          group: groupKey,
          status: 'ok',
          extra: extra ? { name: result.extraOption.name, id: extra.id, value: extra.value } : null,
          cells: new Map(),
        };
        colorRows.push(row);
      }
      row.cells.set(sizeKey, variant);
    }
    colorRows.sort((a, b) => extraOrder.indexOf(a.extra?.id ?? null) - extraOrder.indexOf(b.extra?.id ?? null));
    for (const row of colorRows) {
      delete row.group;
      rows.push(row);
    }
  }
  return { sizeName: sizeOption?.name ?? null, columns, rows };
}

/** 'out' | 'in_stock' | 'many' (1000+) | number (low count). Mirrors at-bulk-grid.js. */
export function availabilityBand(variant) {
  if (!variant.available) return 'out';
  const quantity = variant.inventoryQuantity;
  if (variant.inventoryPolicy !== 'deny' || quantity === null || quantity === undefined) return 'in_stock';
  if (quantity <= 0) return 'out';
  if (quantity < 1000) return quantity;
  return 'many';
}

/** Runs promise-returning tasks, at most `limit` at a time. */
export function runWithConcurrency(tasks, limit) {
  let index = 0;
  const next = () => (index >= tasks.length ? Promise.resolve()
    : Promise.resolve().then(tasks[index++]).catch(() => {}).then(next));
  return Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, next));
}

/* ── Quantities ─────────────────────────────────────────────────────────────────────────── */

/**
 * Checks one typed quantity against the variant's quantity rule. Blank and 0 mean "none".
 * @returns {{ quantity: number, error: null | 'integer' | 'min' | 'max' | 'increment' | 'unavailable' }}
 */
export function validateQuantity(raw, variant) {
  const text = String(raw ?? '').trim();
  if (text === '' || /^0+$/.test(text)) return { quantity: 0, error: null };
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) return { quantity: 0, error: 'integer' };
  const quantity = Number(text);
  if (!variant?.available) return { quantity, error: 'unavailable' };
  const { min, max, increment } = variant.quantityRule ?? { min: 1, max: null, increment: 1 };
  if (quantity < min) return { quantity, error: 'min' };
  if (max !== null && quantity > max) return { quantity, error: 'max' };
  if (quantity % increment !== 0) return { quantity, error: 'increment' };
  return { quantity, error: null };
}

/** Next stepper value: up jumps to the minimum first, down drops below the minimum to 0. */
export function stepQuantity(raw, variant, direction) {
  const { min, max, increment } = variant.quantityRule ?? { min: 1, max: null, increment: 1 };
  const current = /^\d+$/.test(String(raw ?? '').trim()) ? Number(String(raw).trim()) : 0;
  if (direction > 0) {
    const next = current < min ? min : current + increment;
    return max !== null ? Math.min(next, max) : next;
  }
  const next = current - increment;
  return next < min ? 0 : next;
}

/**
 * The shopper's quantities, keyed by exact variant ID. Each entry remembers its product and
 * color so the draft can be trimmed to the current selection.
 */
export class QuantityDraft {
  #entries = new Map();

  get(variantId) {
    return this.#entries.get(variantId)?.raw ?? '';
  }

  set(variantId, raw, { productId, colorId }) {
    const text = String(raw ?? '').trim();
    if (text === '') this.#entries.delete(variantId);
    else this.#entries.set(variantId, { raw: text, productId, colorId });
    return this;
  }

  delete(variantId) {
    this.#entries.delete(variantId);
    return this;
  }

  clear() {
    this.#entries.clear();
    return this;
  }

  get size() {
    return this.#entries.size;
  }

  entries() {
    return [...this.#entries].map(([variantId, entry]) => ({ variantId, ...entry }));
  }

  /** Drops entries for styles or colors that are no longer selected. */
  retainSelection(styles) {
    const keep = new Set();
    for (const style of styles) for (const color of style.colors) keep.add(`${style.productId}:${color.optionValueId}`);
    for (const [variantId, entry] of this.#entries) {
      if (!keep.has(`${entry.productId}:${entry.colorId}`)) this.#entries.delete(variantId);
    }
    return this;
  }

  /**
   * Cart lines for every valid positive quantity of a known variant, plus totals and the
   * variant IDs whose quantity is invalid.
   * @param {(variantId: string) => any} lookup
   * @param {{ productId?: string }} [filter]
   */
  summarize(lookup, { productId } = {}) {
    const items = [];
    const invalid = [];
    let count = 0;
    let subtotal = 0;
    for (const [variantId, entry] of this.#entries) {
      if (productId !== undefined && entry.productId !== productId) continue;
      const variant = lookup(variantId);
      if (!variant) continue;
      const { quantity, error } = validateQuantity(entry.raw, variant);
      if (error) {
        invalid.push(variantId);
        continue;
      }
      if (quantity <= 0) continue;
      items.push({ id: variantId, quantity });
      count += quantity;
      subtotal += quantity * variant.price;
    }
    return { items, invalid, count, subtotal };
  }
}

/** Ignores repeat submits while one is pending. */
export class SubmitGuard {
  #pending = false;

  get pending() {
    return this.#pending;
  }

  tryBegin() {
    if (this.#pending) return false;
    this.#pending = true;
    return true;
  }

  end() {
    this.#pending = false;
  }
}

/* ── Cart reconciliation ────────────────────────────────────────────────────────────────── */

/** Total quantity per variant ID across all cart lines (a variant can have several lines). */
export function cartQuantities(lines) {
  const totals = new Map();
  for (const line of lines ?? []) {
    const id = String(line?.variant_id ?? line?.id ?? '');
    if (!isDecimalId(id) || !Number.isSafeInteger(line.quantity)) continue;
    totals.set(id, (totals.get(id) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * What the add response says, before looking at the cart:
 * - 'ok': success and every requested variant is in the response;
 * - 'rejected': Shopify answered with a 4xx, or success without some requested variants
 *   (some lines may still have been added);
 * - 'lost': no usable answer (network error, abort, 5xx, unreadable body).
 * @param {Array<{ id: string }>} requested
 * @param {{ ok: boolean, status: number, items: Array<{ variant_id: string }> } | null} response
 */
export function classifyAddResponse(requested, response) {
  if (!response) return 'lost';
  if (response.ok) {
    const returned = new Set(response.items.map((item) => String(item.variant_id)));
    return requested.every(({ id }) => returned.has(id)) ? 'ok' : 'rejected';
  }
  if (response.status >= 400 && response.status < 500 && response.data) return 'rejected';
  return 'lost';
}

/**
 * Compares the cart before and after an add whose outcome was not a clean success.
 *
 * Per requested variant, delta = after − baseline (existing lines are in both, so they
 * cancel out):
 * - delta = requested → 'added' (clear the quantity)
 * - 0 < delta < requested → 'partial' (keep requested − delta)
 * - delta = 0 → 'not_added', or 'unconfirmed' after a lost response
 * Any delta below 0 or above the request, or a missing cart read, makes the whole result
 * 'uncertain': the draft must stay exactly as it was.
 *
 * @param {{ requested: Array<{ id: string, quantity: number }>, baseline: Map<string, number> | null,
 *   after: Map<string, number> | null, outcome: 'ok' | 'rejected' | 'lost' }} input
 * @returns {{ status: 'success' | 'partial' | 'none' | 'uncertain', addedCount: number,
 *   rows: Map<string, { kind: 'added' | 'partial' | 'not_added' | 'unconfirmed', requested: number,
 *   added: number, remaining: number }> }}
 */
export function reconcileCartAdd({ requested, baseline, after, outcome }) {
  const uncertain = { status: 'uncertain', addedCount: 0, rows: new Map() };
  if (!(baseline instanceof Map) || !(after instanceof Map)) return uncertain;

  const rows = new Map();
  let addedCount = 0;
  let allAdded = true;
  for (const { id, quantity } of requested) {
    const delta = (after.get(id) ?? 0) - (baseline.get(id) ?? 0);
    if (delta < 0 || delta > quantity) return uncertain;
    addedCount += delta;
    let kind = 'added';
    if (delta === 0) kind = outcome === 'lost' ? 'unconfirmed' : 'not_added';
    else if (delta < quantity) kind = 'partial';
    if (kind !== 'added') allAdded = false;
    rows.set(id, { kind, requested: quantity, added: delta, remaining: quantity - delta });
  }
  if (allAdded) return { status: 'success', addedCount, rows };
  return { status: addedCount > 0 ? 'partial' : 'none', addedCount, rows };
}

/**
 * Applies a reconciliation to the draft: clears confirmed quantities, keeps remainders.
 * An 'uncertain' result leaves the draft untouched.
 * @param {QuantityDraft} draft
 * @param {ReturnType<typeof reconcileCartAdd>} result
 */
export function applyReconciliation(draft, result) {
  if (result.status === 'uncertain') return draft;
  for (const [variantId, row] of result.rows) {
    if (row.kind === 'added') draft.delete(variantId);
    else if (row.kind === 'partial') {
      const entry = draft.entries().find((candidate) => candidate.variantId === variantId);
      if (entry) draft.set(variantId, String(row.remaining), entry);
    }
  }
  return draft;
}
