const isDecimalId = (id) => typeof id === 'string' && /^[1-9]\d*$/.test(id);

async function requestBulkSection(productUrl, sectionId, selector, selection, signal) {
  const url = new URL(productUrl, window.location.origin);
  if (url.origin !== window.location.origin) throw new TypeError('Expected a storefront product URL');
  const root = window.Shopify?.routes?.root || '/';
  if (url.pathname.startsWith('/products/')) url.pathname = root.replace(/\/$/, '') + url.pathname;
  for (const param of ['section_id', 'sections[]', 'variant', 'option_values']) {
    url.searchParams.delete(param);
  }
  url.searchParams.set('sections', sectionId);
  for (const [param, value] of Object.entries(selection)) url.searchParams.set(param, value);

  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Bulk variant request failed (HTTP ${response.status})`);
  const sections = await response.json();
  const html = sections?.[sectionId];
  if (typeof html !== 'string') throw new Error(`Shopify could not render ${sectionId}`);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const script = doc.querySelector(selector);
  if (!script?.textContent) throw new Error(`Missing variant data in ${sectionId}`);
  const data = JSON.parse(script.textContent);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Invalid variant data in ${sectionId}`);
  }
  return data;
}

/**
 * Load the legacy batch for a first-option selection, or a complete selection
 * when iterating the middle option of a three-option product.
 * @param {string} productUrl
 * @param {Array<string | number>} optionValueIds
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function fetchBulkVariantBatch(productUrl, optionValueIds, { signal } = {}) {
  const data = await requestBulkSection(
    productUrl, 'at-bulk-grid-data', 'script[data-at-bulk-variants]',
    { option_values: optionValueIds.join(',') }, signal
  );
  if (!Array.isArray(data?.variants)) throw new Error('Invalid bulk variant batch');
  return data.variants;
}

/**
 * Resolve one exact variant with one request. Supply a variant ID or the full
 * list of option value IDs in Shopify's option order. A missing or mismatched
 * selection returns status "missing". Request and decode failures reject.
 * @param {string} productUrl
 * @param {{ variantId?: string, optionValueIds?: string[], productId?: string, signal?: AbortSignal }} selection
 */
export async function fetchBulkVariant(productUrl, { variantId, optionValueIds, productId, signal }) {
  const byId = variantId !== undefined;
  if (byId ? !isDecimalId(variantId) || optionValueIds !== undefined
    : !Array.isArray(optionValueIds) || optionValueIds.length < 1 || optionValueIds.length > 3
      || !optionValueIds.every(isDecimalId)) {
    throw new TypeError('Expected one variant ID or an ordered option value ID tuple');
  }
  const selection = byId ? { variant: variantId } : { option_values: optionValueIds.join(',') };
  const data = await requestBulkSection(
    productUrl, 'at-bulk-variant-data', 'script[data-at-bulk-variant]', selection, signal
  );
  const missing = { status: 'missing', productId: data?.productId ?? null, currency: data?.currency ?? null, variant: null };
  if (data === null) return missing;
  if (!isDecimalId(data.productId) || typeof data.currency !== 'string') {
    throw new Error('Invalid bulk variant response');
  }
  if (data.variant === null) return missing;
  const { variant } = data;
  if (!isDecimalId(variant?.id) || !Array.isArray(variant.options) || !variant.options.length
    || variant.options.length > 3 || !variant.options.every((option) => isDecimalId(option?.id)
      && typeof option.name === 'string' && typeof option.value === 'string'
      && (option.swatchBackground === null || typeof option.swatchBackground === 'string'))
    || typeof variant.available !== 'boolean' || !Number.isSafeInteger(variant.price)
    || !Number.isSafeInteger(variant.quantityRule?.min) || !Number.isSafeInteger(variant.quantityRule.increment)
    || (variant.quantityRule.max !== null && !Number.isSafeInteger(variant.quantityRule.max))) {
    throw new Error('Invalid bulk variant details');
  }
  if (productId !== undefined && data.productId !== productId) return missing;
  if (byId ? variant.id !== variantId : variant.options.length !== optionValueIds.length
    || !variant.options.every((option, index) => option.id === optionValueIds[index])) return missing;

  return { status: 'found', productId: data.productId, currency: data.currency, variant };
}

async function decodeCartResponse(response, { read = false } = {}) {
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false, status: response.status, items: [], sections: undefined, data: null,
      error: { message: 'Shopify returned invalid cart JSON' } };
  }

  const lines = Array.isArray(data) && !read ? data : data?.items;
  const items = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const rawId = line?.variant_id ?? line?.id;
    const id = typeof rawId === 'number' && Number.isSafeInteger(rawId) ? String(rawId) : rawId;
    if (!isDecimalId(id) || !Number.isSafeInteger(line.quantity) || line.quantity < 1) continue;
    items.push({ ...line, id, variant_id: id });
  }

  let error = null;
  if (!response.ok || Number(data?.status) >= 400 || data?.errors) {
    error = data ?? { message: `Cart request failed (HTTP ${response.status})` };
  } else if (!Array.isArray(lines) || items.length !== lines.length || (!read && items.length === 0)
    || (read && !Number.isSafeInteger(data.item_count))) {
    error = { message: 'Shopify returned invalid cart data' };
  }
  return { ok: error === null, status: response.status, items, sections: data?.sections, error, data };
}

/**
 * Submit plain variants and return HTTP status, normalized items, bundled section
 * HTML, error and the original Shopify data. Network and abort failures reject.
 * @param {Array<{ id: string, quantity: number }>} items
 * @param {{ sectionIds?: string[], signal?: AbortSignal }} [options]
 */
export async function postBulkCartItems(items, { sectionIds = [], signal } = {}) {
  if (!items.length || items.some(({ id, quantity }) => !isDecimalId(id)
    || !Number.isSafeInteger(quantity) || quantity < 1)) {
    throw new TypeError('Expected decimal variant IDs and positive integer quantities');
  }
  const root = window.Shopify?.routes?.root || '/';
  const url = (typeof Theme !== 'undefined' && Theme.routes?.cart_add_url) || root + 'cart/add.js';
  const body = { items: items.map(({ id, quantity }) => ({ id, quantity })) };
  const sections = [...new Set(sectionIds)].slice(0, 5);
  if (sections.length) body.sections = sections.join(',');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return decodeCartResponse(response);
}

/**
 * Read the current cart. The result has the same shape as postBulkCartItems.
 * The original Shopify cart in data provides totals and currency.
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function readBulkCart({ signal } = {}) {
  const root = window.Shopify?.routes?.root || '/';
  const cartUrl = typeof Theme !== 'undefined' && Theme.routes?.cart_url;
  const url = cartUrl ? cartUrl + '.js' : root + 'cart.js';
  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal });
  return decodeCartResponse(response, { read: true });
}
