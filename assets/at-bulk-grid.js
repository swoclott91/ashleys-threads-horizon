/**
 * AT Bulk order grid – opens modal/sheet, renders color×size grid, aggregates quantities.
 * Hooks into data-at-bulk-grid, data-at-bulk-grid-trigger, data-at-bulk-line-items.
 * Uses variant data from AT variant picker (script[data-at-bulk-grid-config]).
 */

import { formatMoney } from '@theme/money-formatting';
import { CartLinesUpdateEvent } from '@shopify/events';
import { onAnimationEnd, yieldToMainThread, preloadImage } from '@theme/utilities';
import { fetchBulkVariantBatch, postBulkCartItems } from '@theme/at-bulk-transport';
import '@theme/at-favorite-colors';

const BULK_GRID_SELECTORS = {
  container: '[data-at-bulk-grid]',
  trigger: '[data-at-bulk-grid-trigger]',
  lineItemsInput: '[data-at-bulk-line-items]',
  configScript: 'script[data-at-bulk-grid-config]',
  search: '[data-at-bulk-search]',
};

const MOBILE_BREAKPOINT = 750;
const favoriteHeart = document.getElementById('at-favorite-color-heart');

/** Quick-add context constants */
const QUICK_ADD_MODAL_CONTENT_ID = 'quick-add-modal-content';
const QUICK_ADD_BULK_DIALOG_ID = 'at-bulk-grid-quick-add-dialog';
const QUICK_ADD_CLOSE_BTN_ID = 'at-bulk-grid-quick-add-close';
/** Sentinel sectionId key used to store quick-add config in the cache */
const QUICK_ADD_SECTION_KEY = '__at_quick_add__';

const CART_ICON_SELECTOR = '.header-actions__cart-icon';
const pendingCartAdds = new WeakSet();

/**
 * Same success treatment as AddToCartComponent.animateAddToCart (product-form.js):
 * `data-added` drives base.css checkmark / label transitions; then reset after 800ms.
 * Fire-and-forget — callers must not await this if they need to close the modal / open
 * the drawer after fly-to-cart only (the 800ms hold would otherwise dominate wall time).
 * @param {HTMLButtonElement | null} addBtn
 */
function playBulkAddToCartButtonSuccessAnimation(addBtn) {
  if (!addBtn) return;
  void (async () => {
    if (addBtn.dataset.added !== 'true') {
      addBtn.dataset.added = 'true';
    }
    await yieldToMainThread();
    await onAnimationEnd(addBtn);
    await new Promise((r) => setTimeout(r, 800));
    addBtn.removeAttribute('data-added');
  })();
}

/**
 * Section IDs for cart-items-component morph (same pattern as product-form.js).
 * Requesting these on cart/add.js avoids a post-add Section Rendering refetch.
 * @returns {string[]}
 */
function getCartItemsSectionIds() {
  /** @type {string[]} */
  const ids = [];
  for (const el of document.querySelectorAll('cart-items-component')) {
    if (el instanceof HTMLElement && el.dataset.sectionId) {
      ids.push(el.dataset.sectionId);
    }
  }
  return ids;
}

/**
 * Build a minimal Ajax cart object for CartLinesUpdateEvent without a cart.js round-trip.
 * Bubble count = previous cart-icon count + quantities just added.
 * @param {Array<{ id: string, key?: string, quantity: number, variant_id: string }>} addedItems
 * @param {number} addedQuantitySum
 */
function buildOptimisticCartFromAdd(addedItems, addedQuantitySum) {
  const cartIcon = /** @type {{ currentCartCount?: number } | null} */ (document.querySelector('cart-icon'));
  const prevCount = Number(cartIcon?.currentCartCount) || 0;
  return {
    token: '',
    item_count: prevCount + addedQuantitySum,
    total_price: 0,
    currency: window.Shopify?.currency?.active || 'USD',
    items: Array.isArray(addedItems) ? addedItems : [],
    discount_codes: [],
  };
}

/**
 * Preload the featured image used by fly-to-cart so the animation does not hitch.
 * @param {string} [sectionId]
 */
function preloadBulkFlyToCartImage(sectionId) {
  if (!sectionId) return;
  const config = getBulkConfig(sectionId) || bulkGridConfigCache.get(sectionId);
  const url = config?.productFeaturedImage;
  if (typeof url === 'string' && url) preloadImage(url);
}

/**
 * Dispatch Horizon v4 cart lines-update (replaces removed ThemeEvents CartAddEvent).
 * Dispatch from an Element inside the bulk modal (the ATC button) so cart-drawer
 * can detect `dialog:modal` via event.target and defer auto-open until close —
 * matching product-form.js (which dispatches from the form element).
 * @param {Array<{ id: string, quantity: number }>} items
 * @param {Element | null} [dispatchTarget] - Prefer the add button inside the open modal
 * @returns {{ promise: Promise<{ cart: object, detail?: object }>, resolve: Function, reject: Function }}
 */
function beginBulkCartLinesUpdate(items, dispatchTarget = null) {
  const deferred = CartLinesUpdateEvent.createPromise();
  const target = dispatchTarget instanceof Element ? dispatchTarget : document;
  target.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context: 'product',
      lines: items.map((item) => ({
        merchandiseId: String(item.id),
        quantity: item.quantity,
      })),
      promise: deferred.promise,
    })
  );
  return deferred;
}

/**
 * Show/hide the theme ring spinner on the bulk ATC button while cart/add is in flight.
 * Caller should re-run updateTotal() after clearing loading so disabled state matches selection.
 * @param {HTMLButtonElement | null} addBtn
 * @param {boolean} isLoading
 */
function setBulkAddButtonLoading(addBtn, isLoading) {
  if (!addBtn) return;

  if (isLoading) {
    addBtn.classList.add('at-bulk-grid__add--loading');
    addBtn.setAttribute('aria-busy', 'true');
    addBtn.disabled = true;
    return;
  }

  addBtn.classList.remove('at-bulk-grid__add--loading');
  addBtn.removeAttribute('aria-busy');
}

/**
 * POST selected variants to cart/add.js (with cart section HTML), then run success visuals.
 * Shows button spinner for the network wait; cart drawer opens only after fly animation
 * (CartLinesUpdateEvent is dispatched from the button so cart-drawer defers past the modal).
 * Skips a follow-up cart.js fetch — uses optimistic item_count + sections from the add response.
 * @param {HTMLElement} container
 * @param {string} sectionId
 * @param {HTMLButtonElement | null} addBtn
 * @param {() => void} updateTotal
 */
async function submitBulkCartAdd(container, sectionId, addBtn, updateTotal) {
  if (pendingCartAdds.has(container)) return;

  const items = [];
  for (const input of container.querySelectorAll('[data-at-bulk-qty]')) {
    if (!input.reportValidity()) return;
    const quantity = readBulkQuantity(input);
    if (quantity > 0 && input.dataset.variantId) items.push({ id: input.dataset.variantId, quantity });
  }
  if (items.length === 0) return;

  const section = document.getElementById(`shopify-section-${sectionId}`);
  const form = section?.querySelector('[data-at-bulk-form]');
  const lineItemsInput = form?.querySelector(BULK_GRID_SELECTORS.lineItemsInput);
  if (lineItemsInput) lineItemsInput.value = JSON.stringify(items);

  pendingCartAdds.add(container);
  const hadFocus = document.activeElement === addBtn;
  setBulkAddButtonLoading(addBtn, true);
  const errorMessage = container.querySelector('[data-at-bulk-cart-error]');
  if (errorMessage) errorMessage.textContent = '';
  const deferredEventPromise = beginBulkCartLinesUpdate(items, addBtn);
  const sectionIds = getCartItemsSectionIds();

  try {
    const { ok, error, items: addedItems, sections, data } = await postBulkCartItems(items, { sectionIds });
    if (!ok) throw error;

    window.dispatchEvent(new CustomEvent('at:bulk:added', { detail: { items, response: data } }));

    const addedQuantitySum = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const cart = buildOptimisticCartFromAdd(addedItems, addedQuantitySum);

    setBulkAddButtonLoading(addBtn, false);
    await handleBulkAddSuccess(container, updateTotal, addBtn, sectionId, cart, deferredEventPromise, sections);
  } catch (err) {
    console.error('at-bulk-grid: cart add failed', err);
    deferredEventPromise.reject(err);
    if (errorMessage) errorMessage.textContent = typeof err?.description === 'string'
      ? err.description
      : Theme.translations.bulk_cart_error;
  } finally {
    pendingCartAdds.delete(container);
    setBulkAddButtonLoading(addBtn, false);
    updateTotal();
    if (hadFocus && errorMessage?.textContent && container.closest('dialog[open]')) addBtn?.focus();
  }
}

/**
 * On successful bulk add: fly-to-cart (when enabled) + button burst (fire-and-forget).
 * Resolves the cart event immediately so drawer morph / bubble update run during fly,
 * then awaits fly-to-cart only before closing the modal (drawer opens on close).
 * @param {HTMLElement} container - Bulk grid container
 * @param {() => void} updateTotal - Function to refresh total display
 * @param {HTMLButtonElement | null} addBtn - Add to cart button (source for fly animation)
 * @param {string} sectionId - Section ID for config lookup
 * @param {Object} cart - Cart object (optimistic Ajax shape) for CartLinesUpdateEvent
 * @param {{ resolve: Function, reject: Function } | null} [deferredEventPromise]
 * @param {Record<string, string> | undefined} [sections] - Section HTML from cart/add.js
 */
async function handleBulkAddSuccess(
  container,
  updateTotal,
  addBtn,
  sectionId,
  cart,
  deferredEventPromise = null,
  sections = undefined
) {
  const resolveCartEvent = () => {
    deferredEventPromise?.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        source: 'at-bulk-grid',
        sourceId: 'at-bulk-grid',
        itemCount: cart.item_count,
        sections,
      },
    });
  };
  const nativeDialog = container.closest('dialog');
  const isNestedQuickAdd = nativeDialog?.id === QUICK_ADD_BULK_DIALOG_ID;
  // The quick-add parent can still be animating closed when the nested dialog closes.
  // Settle the cart event after both dialogs close so the drawer can capture focus.
  if (!isNestedQuickAdd) resolveCartEvent();

  const doAnimation = container.dataset.atBulkAddToCartAnimation === 'true';
  const config = getBulkConfig(sectionId) || bulkGridConfigCache.get(sectionId);
  const productImage = config?.productFeaturedImage;
  /** Individual quick-add skips fly when inside .quick-add-modal (product-form.js). */
  const skipFlyToCart = !!(addBtn && addBtn.closest('.quick-add-modal'));

  /** @type {Element | null} */
  let flyToCartEl = null;
  if (doAnimation && addBtn && productImage && customElements.get('fly-to-cart') && !skipFlyToCart) {
    const cartIcon = document.querySelector(CART_ICON_SELECTOR);
    if (cartIcon) {
      flyToCartEl = document.createElement('fly-to-cart');
      flyToCartEl.classList.add('fly-to-cart--main');
      flyToCartEl.style.setProperty('background-image', `url(${productImage})`);
      flyToCartEl.style.setProperty('--start-opacity', '0');
      flyToCartEl.source = addBtn;
      flyToCartEl.destination = cartIcon;
      document.body.appendChild(flyToCartEl);
    }
  }

  // Button burst is visual-only; do not gate modal close / drawer open on its 800ms hold.
  if (addBtn) playBulkAddToCartButtonSuccessAnimation(addBtn);
  if (flyToCartEl) await onAnimationEnd(flyToCartEl);

  const dialogComponent = container.closest('dialog-component');
  if (dialogComponent && typeof dialogComponent.closeDialog === 'function') {
    dialogComponent.closeDialog();
  } else {
    // Quick-add context: close bulk grid native <dialog>
    if (nativeDialog && typeof nativeDialog.close === 'function') {
      nativeDialog.close();
    }
    // Also close the quick-add modal so the cart drawer isn't obscured
    const quickAddDialog = document.getElementById('quick-add-dialog');
    if (quickAddDialog && typeof quickAddDialog.closeDialog === 'function') {
      await quickAddDialog.closeDialog();
    }
  }

  container.querySelectorAll('[data-at-bulk-qty]').forEach((input) => {
    if (input instanceof HTMLInputElement) input.value = '0';
  });
  const section = document.getElementById(`shopify-section-${sectionId}`);
  const form = section?.querySelector('[data-at-bulk-form]');
  const lineItemsInput = form?.querySelector(BULK_GRID_SELECTORS.lineItemsInput);
  if (lineItemsInput) lineItemsInput.value = '';
  updateTotal();
  if (isNestedQuickAdd) resolveCartEvent();
}

/** Theme add-to-cart icon (icon-add-to-cart.svg) – same as add-to-cart-button secondary */
const ADD_TO_CART_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="var(--icon-stroke-width)" d="M16.608 9.421V6.906H3.392v8.016c0 .567.224 1.112.624 1.513.4.402.941.627 1.506.627H8.63M8.818 3h2.333c.618 0 1.212.247 1.649.686a2.35 2.35 0 0 1 .683 1.658v1.562H6.486V5.344c0-.622.246-1.218.683-1.658A2.33 2.33 0 0 1 8.82 3"/><path stroke="currentColor" stroke-linecap="round" stroke-width="var(--icon-stroke-width)" d="M14.608 12.563v5m2.5-2.5h-5"/></svg>';

/** From assets/icon-checkmark-burst.svg (snippets/add-to-cart-button.liquid) */
const CHECKMARK_BURST_SVG =
  '<svg aria-hidden="true" class="checkmark-burst" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g class="check"><circle class="ring" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="tick" d="M9 12.75L11.25 15L15 9.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g><g class="burst"><g style="--index: 0;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g><g style="--index: 1;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g><g style="--index: 2;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g><g style="--index: 3;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g><g style="--index: 4;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g><g style="--index: 5;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g><g style="--index: 6;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g><g style="--index: 7;"><line class="line" stroke-linecap="round" pathLength="1" x1="12" y1="8.5" x2="12" y2="15.5" stroke="currentColor"/></g></g></svg>';

/** Inner markup for bulk ATC — mirrors snippets/add-to-cart-button.liquid */
const BULK_ADD_TO_CART_BUTTON_MARKUP =
  '<span class="add-to-cart-text">' +
  '<span aria-hidden="true" class="svg-wrapper add-to-cart-icon">' +
  ADD_TO_CART_ICON_SVG +
  '</span><span class="add-to-cart-text__content">Add to cart</span></span>' +
  '<span class="add-to-cart__added">' +
  '<span class="svg-wrapper add-to-cart__added-icon">' +
  CHECKMARK_BURST_SVG +
  '</span></span>';

/**
 * Enriched footer: item count • subtotal • projected discount %, plus the primary CTA.
 * Values populated by updateBulkSummary(); button starts disabled until a quantity is entered.
 * Shared by the desktop table and mobile accordion renderers.
 */
const BULK_GRID_ACTIONS_MARKUP =
  '<div class="at-bulk-grid__actions">' +
  '<span role="alert" class="at-bulk-grid__cart-error" data-at-bulk-cart-error></span>' +
  '<div class="at-bulk-grid__summary" data-at-bulk-summary>' +
  '<span class="at-bulk-grid__summary-count" data-at-bulk-count>0 items</span>' +
  '<span class="at-bulk-grid__summary-sep at-bulk-grid__summary-sep--count" aria-hidden="true">•</span>' +
  '<span class="at-bulk-grid__summary-subtotal" data-at-bulk-subtotal></span>' +
  '<span class="at-bulk-grid__summary-sep at-bulk-grid__summary-sep--discount" aria-hidden="true" data-at-bulk-discount-sep hidden>•</span>' +
  '<span class="at-bulk-grid__summary-discount" data-at-bulk-discount hidden></span>' +
  '</div>' +
  '<button type="button" class="button add-to-cart-button button-primary at-bulk-grid__add" data-at-bulk-add-to-cart disabled>' +
  BULK_ADD_TO_CART_BUTTON_MARKUP +
  '</button>' +
  '</div>';

/** Theme accordion caret – same as icon-caret.svg (mobile bulk grid expand/collapse) */
const ICON_CARET_SVG =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 5.5L7 9.5L3 5.5" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Theme quantity selector icons – same as quantity-selector.liquid (mobile bulk grid +/-) */
const ICON_MINUS_SVG =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.75 7H11.25" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"/></svg>';
const ICON_PLUS_SVG =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path class="vertical" d="M2.75 7H11.25" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"/><path class="horizontal" d="M7 2.75L7 11.25" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"/></svg>';

/**
 * Centered ring spinner while deferred variants load (matches AT menu / modal loading pattern).
 * @param {HTMLElement} container
 * @returns {string}
 */
function getBulkGridLoadingHtml(container) {
  const label = container?.dataset?.atBulkLoadingLabel?.trim() || 'Loading variants…';
  const safeLabel = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
  return (
    '<div class="at-bulk-grid__loading" aria-live="polite" aria-busy="true">' +
    '<div class="at-bulk-grid__spinner" role="status">' +
    `<span class="visually-hidden">${safeLabel}</span>` +
    '</div></div>'
  );
}

/**
 * @param {string} sectionId
 * @returns {{ productId: string, productUrl: string, sectionId: string, variants: Array<{ id: string, available: boolean, inventory_quantity: number, inventory_policy: string, option1: string, option2?: string, option3?: string }>, options: Array<{ name: string, position: number, values: string[], valueIds: string[] }> } | null}
 */
/**
 * Normalize variant entries: either index arrays [id,a,q,p,i1,i2[,i3],price,compare_at_price]
 * or compact objects (a,q,p,o1,o2,o3,pr,cp). Liquid outputs index arrays to stay under section size limits.
 */
function normalizeBulkConfig(config) {
  if (!config || !Array.isArray(config.variants)) return config;
  const opts = config.options || [];
  config.variants.forEach((v, i) => {
    if (Array.isArray(v)) {
      const len = v.length;
      const price = len >= 2 ? v[len - 2] : 0;
      const compareAtPrice = len >= 1 ? v[len - 1] : 0;
      const rest = len >= 2 ? v.slice(0, len - 2) : v;
      const [id, a, q, p, i1, i2, i3] = rest;
      const values0 = opts[0]?.values || [];
      const values1 = opts[1]?.values || [];
      const values2 = opts[2]?.values || [];
      config.variants[i] = {
        id,
        available: !!a,
        inventory_quantity: q,
        inventory_policy: p,
        option1: values0[i1],
        option2: values1[i2],
        option3: opts.length >= 3 ? values2[i3] : null,
        price: price,
        compare_at_price: compareAtPrice,
      };
    } else {
      if (v.a !== undefined) v.available = v.a;
      if (v.q !== undefined) v.inventory_quantity = v.q;
      if (v.p !== undefined) v.inventory_policy = v.p;
      if (v.o1 !== undefined) v.option1 = v.o1;
      if (v.o2 !== undefined) v.option2 = v.o2;
      if (v.o3 !== undefined) v.option3 = v.o3;
      if (v.pr !== undefined) v.price = v.pr;
      if (v.cp !== undefined) v.compare_at_price = v.cp;
    }
    const variant = config.variants[i];
    if (typeof variant.id === 'number' && !Number.isSafeInteger(variant.id)) throw new Error('Invalid bulk variant ID');
    variant.id = String(variant.id);
    if (!/^[1-9]\d*$/.test(variant.id)) throw new Error('Invalid bulk variant ID');
    variant.optionValues = [variant.option1, variant.option2, variant.option3].filter((value) => value != null);
  });
  return config;
}

function getBulkConfigScript(sectionId) {
  return document.getElementById(`shopify-section-${sectionId}`)?.querySelector(BULK_GRID_SELECTORS.configScript);
}

function getBulkConfig(sectionId) {
  // Quick-add context: config lives in the cache, not in a section element
  if (sectionId === QUICK_ADD_SECTION_KEY) {
    return bulkGridConfigCache.get(QUICK_ADD_SECTION_KEY) || null;
  }
  const script = getBulkConfigScript(sectionId);
  if (!script || !script.textContent) return null;
  try {
    const config = JSON.parse(script.textContent.trim());
    return normalizeBulkConfig(config);
  } catch {
    return null;
  }
}

/** Expected variant count from options (for deferred-load check). */
function expectedVariantCount(config) {
  if (!config?.options?.length) return 0;
  let n = 1;
  config.options.forEach((o) => {
    n *= (o.values && o.values.length) || 0;
  });
  return n;
}

/** Run promise-returning tasks with a concurrency limit; resolves when all complete. */
function runWithConcurrency(tasks, limit) {
  let index = 0;
  function runNext() {
    if (index >= tasks.length) return Promise.resolve();
    return tasks[index++]().then(() => runNext());
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  return Promise.all(workers);
}

const DEFERRED_FETCH_CONCURRENCY = 10;

/**
 * Keep the legacy first-option batches. With three options, fix both outer
 * values and let Shopify iterate the middle option in that selection.
 */
function getDeferredSelections(config) {
  const [first, second, third] = config.options;
  const present = new Set(config.variants.map((variant) => JSON.stringify(variant.optionValues)));
  const selections = [];
  const anchor = second?.valueIds?.[0];
  for (const [index, firstId] of first.valueIds.entries()) {
    const firstValue = first.values[index];
    if (anchor && third?.valueIds?.length) {
      for (const [thirdIndex, thirdId] of third.valueIds.entries()) {
        const thirdValue = third.values[thirdIndex];
        if (second.values.some((value) => !present.has(JSON.stringify([firstValue, value, thirdValue])))) {
          selections.push({ ids: [firstId, anchor, thirdId], firstValue, thirdValue });
        }
      }
    } else if ((second?.values || [null]).some((value) => !present.has(
      JSON.stringify(second ? [firstValue, value] : [firstValue])
    ))) {
      selections.push({ ids: [firstId], firstValue });
    }
  }
  return selections;
}

/**
 * Load full variant set via Section Rendering API + option_values when product has >250 variants.
 * Uses a lightweight data-only section (at-bulk-grid-data) to minimize response size (~1-5KB vs ~50-200KB for full page).
 * See https://shopify.dev/docs/storefronts/themes/product-merchandising/variants/support-high-variant-products
 */
async function fetchDeferredVariants(config) {
  const productPath = config.productUrl || window.location.pathname;
  const debug = window.atBulkGridDebugVerbose === true;
  const byId = new Map(config.variants.map((variant) => [variant.id, variant]));
  let failed = false;
  const selections = getDeferredSelections(config);
  const tasks = selections.map(({ ids, firstValue, thirdValue }) => async () => {
    try {
      const batch = await fetchBulkVariantBatch(productPath, ids);
      const { variants } = normalizeBulkConfig({ variants: batch });
      for (const variant of variants) {
        if (variant.option1 !== firstValue || (thirdValue !== undefined && variant.option3 !== thirdValue)) continue;
        byId.set(variant.id, variant);
      }
    } catch (error) {
      failed = true;
      console.warn('at-bulk-grid: deferred fetch failed for option_values=' + ids.join(','), error);
    }
  });

  await runWithConcurrency(tasks, DEFERRED_FETCH_CONCURRENCY);
  if (debug) console.log('at-bulk-grid: loaded', byId.size, 'variants from', selections.length, 'requests');
  return { variants: Array.from(byId.values()), failed };
}

/**
 * @param {number} qty
 * @param {boolean} available
 * @param {number} inventory
 * @param {string} policy
 * @returns {string}
 */
function availabilityBand(qty, available, inventory, policy) {
  if (!available) return 'Out';
  if (policy !== 'deny' || inventory === null || inventory === undefined) return 'In stock';
  if (inventory <= 0) return 'Out';
  if (inventory < 1000) return String(inventory);
  return '1000+';
}

/**
 * Format variant price HTML: compare-at (strikethrough) when on sale, then price. Matches theme price snippet.
 * @param {{ price: number, compare_at_price?: number }} variant - price/compare_at_price in minor units (cents)
 * @param {{ moneyFormat?: string, currency?: string }} config
 * @returns {string} HTML fragment
 */
function formatVariantPriceHtml(variant, config) {
  let format = config?.moneyFormat?.trim() || '';
  const currency = (config?.currency || 'USD').toString().toUpperCase();
  if (!format) format = currency === 'USD' ? '${{amount}}' : '{{amount}} ' + currency;
  const price = variant?.price ?? 0;
  const compareAt = variant?.compare_at_price ?? 0;
  const priceStr = formatMoney(price, format, currency);
  const onSale = compareAt > price && compareAt > 0;
  const compareAtStr = onSale ? formatMoney(compareAt, format, currency) : '';
  if (onSale) {
    return (
      '<span class="at-bulk-grid__price"><s class="compare-at-price">' +
      escapeHtml(compareAtStr) +
      '</s> <span class="price">' +
      escapeHtml(priceStr) +
      '</span></span>'
    );
  }
  return '<span class="at-bulk-grid__price"><span class="price">' + escapeHtml(priceStr) + '</span></span>';
}

/**
 * Format a minor-unit (cents) amount using the bulk grid config's money format.
 * @param {number} cents
 * @param {{ moneyFormat?: string, currency?: string }} config
 * @returns {string}
 */
function formatBulkMoney(cents, config) {
  let format = config?.moneyFormat?.trim() || '';
  const currency = (config?.currency || 'USD').toString().toUpperCase();
  if (!format) format = currency === 'USD' ? '${{amount}}' : '{{amount}} ' + currency;
  return formatMoney(cents, format, currency);
}

/**
 * The discount progress bar shares the modal shell with the grid; use it as the source of
 * truth for cart subtotal + milestone thresholds so the footer discount matches the strip.
 * @param {HTMLElement} container
 * @returns {HTMLElement | null}
 */
function findBulkDiscountBar(container) {
  const host = container.closest(
    '.at-bulk-grid-modal__inner, .at-buy-buttons__bulk-dialog-inner, .popup-link__inner'
  );
  return host?.querySelector('at-discount-progress-bar') || null;
}

/**
 * Highest reached (non-shipping) discount percentage for a projected subtotal (cents).
 * @param {number} projectedCents
 * @param {HTMLElement} container
 * @returns {number | null} percent, or null when no discount bar / milestones present
 */
function bulkDiscountPercent(projectedCents, container) {
  const bar = findBulkDiscountBar(container);
  if (!bar) return null;
  let milestones = [];
  try {
    milestones = JSON.parse(bar.dataset.milestones || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(milestones) || milestones.length === 0) return null;
  let pct = 0;
  milestones.forEach((m) => {
    if (!m || m.kind === 'shipping') return;
    if (projectedCents >= Number(m.threshold)) {
      const n = parseInt(String(m.benefitLabel).replace(/[^0-9]/g, ''), 10);
      if (!Number.isNaN(n)) pct = Math.max(pct, n);
    }
  });
  return pct;
}

function readBulkQuantity(input) {
  const value = Number(input.value);
  return input.validity.valid && Number.isSafeInteger(value) ? value : 0;
}

/**
 * Refresh the enriched footer summary (item count, subtotal, projected discount %) + CTA label,
 * plus per-color item counts (mobile) and active/selected states for quantity fields > 0.
 * Shared by the desktop table and mobile accordion renderers.
 * @param {HTMLElement} container
 * @param {{ moneyFormat?: string, currency?: string }} config
 * @returns {{ count: number, subtotalCents: number }}
 */
function updateBulkSummary(container, config) {
  let count = 0;
  let subtotalCents = 0;

  container.querySelectorAll('[data-at-bulk-qty]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const q = readBulkQuantity(input);
    input.classList.toggle('at-bulk-grid__qty-input--active', q > 0);
    if (q <= 0) return;
    count += q;
    const price = parseInt(input.getAttribute('data-at-bulk-variant-price') || '0', 10) || 0;
    subtotalCents += q * price;
  });

  // Per-color item counts + selected-row tint (mobile accordions; no-ops on desktop).
  container.querySelectorAll('[data-at-bulk-color-row]').forEach((row) => {
    let rowCount = 0;
    row.querySelectorAll('[data-at-bulk-qty]').forEach((input) => {
      rowCount += readBulkQuantity(input);
    });
    const badge = row.querySelector('[data-at-bulk-color-count]');
    if (badge) badge.textContent = rowCount > 0 ? (rowCount === 1 ? '1 item' : rowCount + ' items') : '';
    row.classList.toggle('at-bulk-grid__mobile-accordion--has-items', rowCount > 0);
    row.querySelectorAll('.at-bulk-grid__mobile-size-row').forEach((sizeRow) => {
      const input = sizeRow.querySelector('[data-at-bulk-qty]');
      const q = input ? readBulkQuantity(input) : 0;
      sizeRow.classList.toggle('at-bulk-grid__mobile-size-row--selected', q > 0);
    });
  });

  const countEl = container.querySelector('[data-at-bulk-count]');
  const subtotalEl = container.querySelector('[data-at-bulk-subtotal]');
  const discountEl = container.querySelector('[data-at-bulk-discount]');
  const discountSep = container.querySelector('[data-at-bulk-discount-sep]');
  const addBtn = container.querySelector('[data-at-bulk-add-to-cart]');

  if (countEl) countEl.textContent = count === 1 ? '1 item' : count + ' items';
  if (subtotalEl) subtotalEl.textContent = formatBulkMoney(subtotalCents, config);

  const bar = findBulkDiscountBar(container);
  const cartSubtotal = bar ? Number(bar.dataset.subtotal) || 0 : 0;
  const pct = bulkDiscountPercent(cartSubtotal + subtotalCents, container);
  if (discountEl instanceof HTMLElement && discountSep instanceof HTMLElement) {
    const show = typeof pct === 'number' && pct > 0;
    discountEl.textContent = show ? pct + '% off' : '';
    discountEl.hidden = !show;
    discountSep.hidden = !show;
  }

  if (addBtn instanceof HTMLButtonElement) {
    const labelEl = addBtn.querySelector('.add-to-cart-text__content');
    if (labelEl) {
      labelEl.textContent = count > 0 ? (count === 1 ? 'Add 1 item' : 'Add ' + count + ' items') : 'Add to cart';
    }
    addBtn.disabled = count === 0 || addBtn.classList.contains('at-bulk-grid__add--loading');
  }

  return { count, subtotalCents };
}

function indexBulkVariants(variants) {
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const idsByTuple = new Map();
  for (const variant of byId.values()) idsByTuple.set(JSON.stringify(variant.optionValues), variant.id);
  return { byId, idsByTuple };
}

function getGridOptions(config) {
  const { options, variants } = config;
  const colorIndex = options.findIndex(({ name }) => /^colou?r$/i.test(name.trim()));
  const rowIndex = Math.max(0, colorIndex);
  const sizeIndex = options.findIndex(({ name }) => /^size$/i.test(name.trim()));
  const colIndex = sizeIndex >= 0 && sizeIndex !== rowIndex ? sizeIndex : options.findIndex((_, i) => i !== rowIndex);
  const groupIndex = options.findIndex((_, i) => i !== rowIndex && i !== colIndex);
  const rowOption = options[rowIndex];
  const groupOption = options[groupIndex];
  const colorIds = new Map();
  if (colorIndex >= 0) {
    rowOption.values.forEach((color, index) => colorIds.set(color, rowOption.valueIds?.[index]));
  }
  const { byId, idsByTuple } = indexBulkVariants(variants);
  const rowsByGroup = new Map();
  for (const { optionValues } of byId.values()) {
    const group = optionValues[groupIndex];
    if (!rowsByGroup.has(group)) rowsByGroup.set(group, new Set());
    rowsByGroup.get(group).add(optionValues[rowIndex]);
  }

  return {
    optionRowName: rowOption.name,
    colorIds,
    optionColName: options[colIndex]?.name || 'Quantity',
    sizeValues: options[colIndex]?.values || [''],
    groups: (groupOption?.values || [undefined]).filter((value) => rowsByGroup.has(value)).map((value) => ({
      value,
      label: groupOption ? `${groupOption.name}: ${value}` : '',
      colors: groupOption ? rowOption.values.filter((color) => rowsByGroup.get(value).has(color)) : rowOption.values,
    })),
    getVariant(color, size, group) {
      const tuple = [];
      tuple[rowIndex] = color;
      if (colIndex >= 0) tuple[colIndex] = size;
      if (groupIndex >= 0) tuple[groupIndex] = group;
      return byId.get(idsByTuple.get(JSON.stringify(tuple)));
    },
    getSwatchStyle(color) {
      const background = rowOption.valueDetails?.find((detail) => detail?.name === color)?.swatchBackground;
      return background ? escapeAttr('background:' + background + ';') : '';
    },
  };
}

/**
 * @param {HTMLElement} container
 * @param {ReturnType<getBulkConfig>} config
 * @param {string} sectionId
 */
function renderDesktopGrid(container, config, sectionId) {
  if (!config || !config.variants?.length || !config.options?.length) {
    container.innerHTML = '<p class="at-bulk-grid__empty">No variants available for bulk order.</p>';
    return;
  }

  const { optionRowName, optionColName, sizeValues, groups, colorIds, getVariant, getSwatchStyle } = getGridOptions(config);

  let html = '';
  html += '<div class="at-bulk-grid__body">';
  html += '<div class="at-bulk-grid__search-wrap">';
  html += `<input type="search" class="at-bulk-grid__search" placeholder="Search ${escapeAttr(optionRowName)}..." data-at-bulk-search aria-label="Search ${escapeAttr(optionRowName)}">`;
  html += '</div>';
  html += '<div class="at-bulk-grid__table-wrapper">';
  for (const { value, label, colors } of groups) {
    html += '<table class="at-bulk-grid__table">';
    if (label) html += '<caption>' + escapeHtml(label) + '</caption>';
    html += '<thead><tr><th>' + escapeHtml(optionRowName) + '</th>';
    sizeValues.forEach((size) => {
      html += '<th>' + escapeHtml(size || optionColName) + '</th>';
    });
    html += '</tr></thead><tbody>';

    colors.forEach((color) => {
      const swatchStyle = getSwatchStyle(color);
      html += '<tr data-at-bulk-color-row data-at-bulk-color-value="' + escapeAttr(color) + '">';
      html += '<td class="at-bulk-grid__color-cell"><div class="at-bulk-grid__color-cell-inner">';
      if (swatchStyle) {
        html += '<span class="at-bulk-grid__swatch swatch" style="' + swatchStyle + '" aria-hidden="true"></span>';
      }
      html += '<span class="at-bulk-grid__color-name">' + escapeHtml(color) + '</span>';
      html += favoriteButton(config.productId, colorIds.get(color), color) + '</div></td>';
      sizeValues.forEach((size) => {
        const v = getVariant(color, size, value);
        if (!v) {
          html += '<td>—</td>';
          return;
        }
        const band = availabilityBand(
          v.inventory_quantity,
          v.available,
          v.inventory_quantity,
          v.inventory_policy || ''
        );
        const bandClass =
          band === 'Out'
            ? 'at-bulk-grid__availability--out'
            : band === '1000+' || band === 'In stock'
              ? 'at-bulk-grid__availability--in-stock'
              : 'at-bulk-grid__availability--low';
        const priceHtml = formatVariantPriceHtml(v, config);
        html +=
          '<td data-at-bulk-cell data-variant-id="' +
          v.id +
          '">' +
          '<div class="at-bulk-grid__cell-inner">' +
          '<input type="number" class="at-bulk-grid__qty-input" min="0" value="0" data-at-bulk-qty data-at-bulk-variant-price="' +
          v.price +
          '" data-variant-id="' +
          v.id +
          '" aria-label="Quantity ' +
          escapeAttr([color, size, label].filter(Boolean).join(' ')) +
          '">' +
          priceHtml +
          '<span class="at-bulk-grid__availability ' +
          bandClass +
          '">' +
          band +
          '</span></div></td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
  }
  html += '</div>';
  html += '</div>';
  html += BULK_GRID_ACTIONS_MARKUP;

  container.innerHTML = html;
  container.dataset.atBulkGridSectionId = sectionId;

  const searchEl = container.querySelector(BULK_GRID_SELECTORS.search);
  const addBtn = container.querySelector('[data-at-bulk-add-to-cart]');

  const updateTotal = () => {
    updateBulkSummary(container, config);
  };
  updateTotal();

  container.querySelector('.at-bulk-grid__body').addEventListener('input', (e) => {
    if (e.target.matches('[data-at-bulk-qty]')) updateTotal();
  });
  container.querySelector('.at-bulk-grid__body').addEventListener('change', (e) => {
    if (e.target.matches('[data-at-bulk-qty]')) updateTotal();
  });

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = (searchEl.value || '').trim().toLowerCase();
      container.querySelectorAll('[data-at-bulk-color-row]').forEach((row) => {
        const val = (row.dataset.atBulkColorValue || '').toLowerCase();
        row.style.display = q && !val.includes(q) ? 'none' : '';
      });
    });
  }

  const submitBulkItems = () => {
    submitBulkCartAdd(container, sectionId, addBtn, updateTotal);
  };

  if (addBtn) addBtn.addEventListener('click', submitBulkItems);

  updateTotal();
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function favoriteButton(productId, colorId, colorName) {
  if (!favoriteHeart || !colorId) return '';
  return `<at-favorite-color class="at-bulk-grid__favorite" data-product-id="${escapeAttr(productId)}"
    data-color-id="${escapeAttr(colorId)}" data-color-name="${escapeAttr(colorName)}">
    <button type="button" class="at-favorite-color__button" aria-pressed="false">${favoriteHeart.innerHTML}</button>
    <span class="at-favorite-color__error" role="status"></span>
  </at-favorite-color>`;
}

/**
 * Mobile: accordion per color, size rows with qty + availability.
 */
function renderMobileGrid(container, config, sectionId) {
  if (!config || !config.variants?.length || !config.options?.length) {
    container.innerHTML = '<p class="at-bulk-grid__empty">No variants available for bulk order.</p>';
    return;
  }

  const { optionRowName, sizeValues, groups, colorIds, getVariant, getSwatchStyle } = getGridOptions(config);

  let html = '';
  html += '<div class="at-bulk-grid__body">';
  html +=
    '<input type="search" class="at-bulk-grid__search" placeholder="Search ' +
    escapeAttr(optionRowName) +
    '..." data-at-bulk-search aria-label="Search ' +
    escapeAttr(optionRowName) +
    '">';
  html += '<div class="at-bulk-grid__mobile-accordions">';

  for (const { value, label, colors } of groups) {
    if (label) html += '<h3>' + escapeHtml(label) + '</h3>';
    colors.forEach((color) => {
      const swatchStyle = getSwatchStyle(color);
      html += '<div class="at-bulk-grid__mobile-accordion" data-at-bulk-color-row data-at-bulk-color-value="' + escapeAttr(color) + '">';
      html += '<div class="at-bulk-grid__mobile-accordion-heading">';
      html += '<button type="button" class="at-bulk-grid__mobile-accordion-header" data-at-bulk-accordion-toggle aria-expanded="false">';
      if (swatchStyle) {
        html += '<span class="at-bulk-grid__swatch swatch" style="' + swatchStyle + '" aria-hidden="true"></span>';
      }
      html += '<span class="at-bulk-grid__color-name">' + escapeHtml(color) + '</span> <span class="at-bulk-grid__color-count" data-at-bulk-color-count aria-hidden="true"></span> <span class="svg-wrapper icon-caret icon-animated at-bulk-grid__accordion-icon" aria-hidden="true" data-at-bulk-accordion-icon>' + ICON_CARET_SVG + '</span>';
      html += '</button>' + favoriteButton(config.productId, colorIds.get(color), color) + '</div>';
      html += '<div class="at-bulk-grid__mobile-accordion-content" hidden>';
      sizeValues.forEach((size) => {
        const v = getVariant(color, size, value);
        if (!v) return;
        const band = availabilityBand(
          v.inventory_quantity,
          v.available,
          v.inventory_quantity,
          v.inventory_policy || ''
        );
        const bandClass =
          band === 'Out'
            ? 'at-bulk-grid__availability--out'
            : band === '1000+' || band === 'In stock'
              ? 'at-bulk-grid__availability--in-stock'
              : 'at-bulk-grid__availability--low';
        const priceHtmlMobile = formatVariantPriceHtml(v, config);
        html +=
          '<div class="at-bulk-grid__mobile-size-row">' +
          '<span>' +
          escapeHtml(size) +
          ' ' +
          priceHtmlMobile +
          ' <span class="at-bulk-grid__availability ' +
          bandClass +
          '">' +
          band +
          '</span></span>' +
          '<div class="quantity-selector-wrapper at-bulk-grid__qty-selector-wrapper">' +
          '<div class="quantity-selector at-bulk-grid__qty-selector">' +
          '<button type="button" class="button quantity-minus button-unstyled" aria-label="Decrease quantity" data-at-bulk-qty-minus>' +
          '<span class="visually-hidden">Decrease quantity</span><span class="svg-wrapper icon-plus">' +
          ICON_MINUS_SVG +
          '</span></button>' +
          '<input type="number" class="at-bulk-grid__qty-input" min="0" value="0" data-at-bulk-qty data-at-bulk-variant-price="' +
          v.price +
          '" data-variant-id="' +
          v.id +
          '" aria-label="Quantity ' +
          escapeAttr([color, size, label].filter(Boolean).join(' ')) +
          '">' +
          '<button type="button" class="button quantity-plus button-unstyled" aria-label="Increase quantity" data-at-bulk-qty-plus>' +
          '<span class="visually-hidden">Increase quantity</span><span class="svg-wrapper icon-plus">' +
          ICON_PLUS_SVG +
          '</span></button>' +
          '</div></div>' +
          '</div>';
      });
      html += '</div></div>';
    });
  }

  html += '</div>';
  html += '</div>';
  html += BULK_GRID_ACTIONS_MARKUP;

  container.innerHTML = html;
  container.dataset.atBulkGridSectionId = sectionId;
  const body = container.querySelector('.at-bulk-grid__body');

  const updateTotal = () => {
    updateBulkSummary(container, config);
  };

  body.addEventListener('input', (e) => {
    if (e.target.matches('[data-at-bulk-qty]')) updateTotal();
  });
  body.addEventListener('change', (e) => {
    if (e.target.matches('[data-at-bulk-qty]')) updateTotal();
  });

  body.addEventListener('click', (e) => {
    const minusBtn = e.target.closest('[data-at-bulk-qty-minus]');
    const plusBtn = e.target.closest('[data-at-bulk-qty-plus]');
    const wrapper = minusBtn?.closest('.at-bulk-grid__qty-selector-wrapper') || plusBtn?.closest('.at-bulk-grid__qty-selector-wrapper');
    const input = wrapper?.querySelector('[data-at-bulk-qty]');
    if (!input) return;
    if (minusBtn) {
      e.preventDefault();
      e.stopPropagation();
      const val = Math.max(0, readBulkQuantity(input) - 1);
      input.value = String(val);
      updateTotal();
    } else if (plusBtn) {
      e.preventDefault();
      e.stopPropagation();
      const val = readBulkQuantity(input) + 1;
      input.value = String(val);
      updateTotal();
    }
  });

  container.querySelectorAll('[data-at-bulk-accordion-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const content = btn.parentElement?.nextElementSibling;
      const open = content?.getAttribute('hidden') != null;
      content?.toggleAttribute('hidden', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      updateTotal();
    });
  });

  const searchEl = container.querySelector('.at-bulk-grid__search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = (searchEl.value || '').trim().toLowerCase();
      container.querySelectorAll('[data-at-bulk-color-row]').forEach((row) => {
        const val = (row.dataset.atBulkColorValue || '').toLowerCase();
        row.style.display = q && !val.includes(q) ? 'none' : '';
      });
    });
  }

  const addBtnMobile = container.querySelector('[data-at-bulk-add-to-cart]');
  if (addBtnMobile) {
    addBtnMobile.addEventListener('click', () => {
      submitBulkCartAdd(container, sectionId, addBtnMobile, updateTotal);
    });
  }

  updateTotal();
}

/** Cache full config per section after deferred load so we don't re-fetch on reopen. */
const bulkGridConfigCache = new Map();

/** Cache for in-flight deferred variant load promises (from hover/focus preload). */
const deferredLoadPromises = new Map();
const pendingGridRenders = new WeakMap();

function invalidateStaleBulkConfig(sectionId) {
  if (sectionId === QUICK_ADD_SECTION_KEY) return;
  const productId = getBulkConfigScript(sectionId)?.dataset.atProductId;
  if (bulkGridConfigCache.get(sectionId)?.productId !== productId) {
    bulkGridConfigCache.delete(sectionId);
  }
  if (deferredLoadPromises.get(sectionId)?.productId !== productId) {
    deferredLoadPromises.delete(sectionId);
  }
}

function needsDeferredVariants(config) {
  return !config.deferredLoaded && config.variants.length < expectedVariantCount(config)
    && config.options[0]?.valueIds?.length > 0;
}

function getDeferredGridConfig(sectionId, config) {
  const pending = deferredLoadPromises.get(sectionId);
  if (pending?.productId === config.productId && pending?.productUrl === config.productUrl) return pending.promise;

  const promise = fetchDeferredVariants(config).then(({ variants, failed }) => {
    const loaded = { ...config, variants, deferredLoaded: !failed, deferredFailed: failed };
    if (!failed && sectionId !== QUICK_ADD_SECTION_KEY
      && deferredLoadPromises.get(sectionId)?.promise === promise) {
      bulkGridConfigCache.set(sectionId, loaded);
    }
    return loaded;
  }).finally(() => {
    if (deferredLoadPromises.get(sectionId)?.promise === promise) deferredLoadPromises.delete(sectionId);
  });
  deferredLoadPromises.set(sectionId, { productId: config.productId, productUrl: config.productUrl, promise });
  return promise;
}

/**
 * Start loading deferred variants before the modal opens (called on hover/focus of trigger).
 * The promise is reused by renderGrid to avoid duplicate fetches.
 */
function preloadBulkGridVariants(sectionId) {
  invalidateStaleBulkConfig(sectionId);
  const config = bulkGridConfigCache.get(sectionId) || getBulkConfig(sectionId);
  if (!config) return;

  preloadBulkFlyToCartImage(sectionId);
  if (needsDeferredVariants(config)) {
    getDeferredGridConfig(sectionId, config).catch((error) => console.warn('at-bulk-grid: preload failed', error));
  }
}

async function renderGrid(container) {
  if (pendingCartAdds.has(container)) return;
  const sectionId = container.dataset.atBulkGridSectionId;
  if (!sectionId) return;

  invalidateStaleBulkConfig(sectionId);
  let config = bulkGridConfigCache.get(sectionId) || getBulkConfig(sectionId);
  if (!config) return;

  if (needsDeferredVariants(config)) {
    const promise = getDeferredGridConfig(sectionId, config);
    if (pendingGridRenders.get(container) === promise) return;
    pendingGridRenders.set(container, promise);
    const productId = config.productId;
    const isCurrent = () => container.isConnected
      && pendingGridRenders.get(container) === promise
      && (sectionId === QUICK_ADD_SECTION_KEY || getBulkConfigScript(sectionId)?.dataset.atProductId === productId);
    container.innerHTML = getBulkGridLoadingHtml(container);
    try {
      config = await promise;
      if (!isCurrent()) return;
    } catch (error) {
      if (!isCurrent()) return;
      console.error('at-bulk-grid: deferred load failed', error);
      config = { ...config, deferredFailed: true };
    }
  }
  pendingGridRenders.delete(container);

  if (!config.deferredFailed && config.variants.length) bulkGridConfigCache.set(sectionId, config);
  preloadBulkFlyToCartImage(sectionId);
  const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
  if (isMobile) {
    renderMobileGrid(container, config, sectionId);
  } else {
    renderDesktopGrid(container, config, sectionId);
  }
  if (config.deferredFailed) {
    container.insertAdjacentHTML('afterbegin',
      '<p role="status" class="at-bulk-grid__empty">Some variants could not load. Reopen bulk order to try again.</p>');
  }
}

/**
 * Set up bulk grid support for the quick-add modal context (modal-in-modal).
 * Uses event delegation so it works after AJAX content loads into #quick-add-modal-content.
 * When a [data-at-bulk-grid-trigger] inside the quick-add content is clicked:
 *   - Reads the config script from #quick-add-modal-content
 *   - Caches it under QUICK_ADD_SECTION_KEY
 *   - Renders the grid into #at-bulk-grid-quick-add-dialog's container
 *   - Opens the native <dialog> as a modal above the quick-add modal
 */
function initQuickAddBulkGrid() {
  const bulkDialog = document.getElementById(QUICK_ADD_BULK_DIALOG_ID);
  const closeBtn = document.getElementById(QUICK_ADD_CLOSE_BTN_ID);

  if (!bulkDialog) return;

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      bulkDialog.close();
    });
  }

  // Backdrop click closes the dialog
  bulkDialog.addEventListener('click', (e) => {
    if (e.target === bulkDialog) bulkDialog.close();
  });

  // Event delegation: intercept trigger clicks inside the quick-add modal content.
  //
  // WHY window, not document:
  // Horizon's component.js also uses document.addEventListener('click', …, { capture: true })
  // to handle on:click="/showDialog" attributes. It registers that listener at startup
  // (before at-bulk-grid.js loads), so its document-capture handler fires first in
  // registration order. Calling stopPropagation() in our document-capture handler is
  // already too late — showDialog() has already been queued.
  //
  // window capture fires one step higher (window → document → … → target), so our
  // listener runs before Horizon's document-capture listener. stopPropagation() here
  // prevents the event from ever reaching document, keeping at-buy-buttons__bulk-dialog
  // from opening.
  window.addEventListener('click', (e) => {
    const trigger = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest(BULK_GRID_SELECTORS.trigger) : null);
    if (!trigger) return;

    const quickAddContent = document.getElementById(QUICK_ADD_MODAL_CONTENT_ID);
    if (!quickAddContent || !quickAddContent.contains(trigger)) return;

    // Prevent the event from reaching Horizon's document-level capture handler,
    // which would call dialog-component.showDialog() and open the wrong dialog.
    e.stopPropagation();

    const configScript = quickAddContent.querySelector(BULK_GRID_SELECTORS.configScript);
    if (!configScript?.textContent) return;

    let config;
    try {
      config = JSON.parse(configScript.textContent.trim());
      normalizeBulkConfig(config);
    } catch {
      return;
    }

    // Cache config under the quick-add sentinel key
    bulkGridConfigCache.set(QUICK_ADD_SECTION_KEY, config);
    deferredLoadPromises.delete(QUICK_ADD_SECTION_KEY);

    // Find the at-bulk-grid container inside the nested dialog
    const container = bulkDialog.querySelector(BULK_GRID_SELECTORS.container);
    if (!container) return;

    // Point the container at the cached config via the sentinel key
    container.dataset.atBulkGridSectionId = QUICK_ADD_SECTION_KEY;

    // Render the grid (respects mobile/desktop breakpoint)
    renderGrid(container);

    // Open the nested dialog as a modal (enters browser top layer)
    if (typeof bulkDialog.showModal === 'function') {
      bulkDialog.showModal();
    }
  }, true); // capture phase on window – fires before Horizon's document-capture handler
}

function init() {
  document.querySelectorAll(BULK_GRID_SELECTORS.trigger).forEach((trigger) => {
    const preload = () => {
      const container = trigger.closest('.at-buy-buttons__bulk-popup-component')?.querySelector(BULK_GRID_SELECTORS.container)
        || document.querySelector(BULK_GRID_SELECTORS.container);
      const sectionId = container?.dataset?.atBulkGridSectionId;
      if (sectionId) preloadBulkGridVariants(sectionId);
    };
    trigger.addEventListener('mouseenter', preload, { once: true });
    trigger.addEventListener('focusin', preload, { once: true });

    trigger.addEventListener('click', (e) => {
      const container = document.querySelector(BULK_GRID_SELECTORS.container);
      if (!container) return;
      const sectionId = container.dataset?.atBulkGridSectionId;
      if (sectionId) preloadBulkFlyToCartImage(sectionId);
      const dialogComponent = container.closest('dialog-component');
      if (dialogComponent && !trigger.closest('dialog-component')?.contains(container)) {
        e.preventDefault();
        if (typeof dialogComponent.showDialog === 'function') {
          dialogComponent.showDialog();
        }
      }
    });
  });

  document.addEventListener('dialog:open', (event) => {
    const container = event.target.querySelector(BULK_GRID_SELECTORS.container);
    if (container) renderGrid(container);
  }, true);

  window.matchMedia(`(width < ${MOBILE_BREAKPOINT}px)`).addEventListener('change', () => {
    document.querySelectorAll(BULK_GRID_SELECTORS.container).forEach((container) => {
      if (container.dataset.atBulkGridSectionId && container.closest('dialog')?.open) {
        renderGrid(container);
      }
    });
  });

  initQuickAddBulkGrid();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Console diagnostic for bulk grid: run atBulkGridDebug() or atBulkGridDebug('Turf Green').
 * Use cached config (after deferred load) when available so you see full variant set.
 * Set atBulkGridDebugVerbose = true before opening the grid to log each deferred fetch.
 */
window.atBulkGridDebug = function (searchOptionValue) {
  const container = document.querySelector(BULK_GRID_SELECTORS.container);
  const sectionIdFromContainer = container?.dataset?.atBulkGridSectionId;
  const cached = sectionIdFromContainer ? bulkGridConfigCache.get(sectionIdFromContainer) : null;
  let config = cached || null;
  let sectionId = sectionIdFromContainer || null;

  if (!config) {
    const script = document.querySelector('script[data-at-bulk-grid-config]');
    if (!script || !script.textContent) {
      console.warn('atBulkGridDebug: No config. Open the bulk grid on a product page (and wait for variants to finish loading if the spinner appears).');
      return null;
    }
    sectionId = script.dataset.atSectionId || script.getAttribute('data-at-section-id');
    if (!sectionId) {
      const sectionEl = script.closest('[id^="shopify-section-"]');
      if (sectionEl?.id) sectionId = sectionEl.id.replace('shopify-section-', '');
    }
    if (!sectionId) {
      console.warn('atBulkGridDebug: Could not determine section id.');
      return null;
    }
    try {
      config = JSON.parse(script.textContent.trim());
      normalizeBulkConfig(config);
    } catch (e) {
      console.error('atBulkGridDebug: Failed to parse config:', e);
      return null;
    }
  }
  if (cached) console.log('atBulkGridDebug: using cached config (post–deferred load)');

  const norm = (s) => (s == null ? '' : String(s).trim());
  const searchLower = (searchOptionValue || 'Turf Green').toLowerCase();

  const variantsMatching = config.variants.filter(
    (v) =>
      norm(v.option1).toLowerCase().includes(searchLower) ||
      norm(v.option2).toLowerCase().includes(searchLower) ||
      norm(v.option3).toLowerCase().includes(searchLower)
  );

  const { idsByTuple } = indexBulkVariants(config.variants);
  const mapKeysSample = Array.from(idsByTuple.keys()).slice(0, 20);

  const firstVariants = config.variants.slice(0, 2).map((v) => ({
    id: v.id,
    o1: v.option1,
    o1Length: (v.option1 && v.option1.length) || 0,
    o2: v.option2,
    o2Length: (v.option2 && v.option2.length) || 0,
  }));
  const lastVariants = config.variants.slice(-2).map((v) => ({
    id: v.id,
    o1: v.option1,
    o1Length: (v.option1 && v.option1.length) || 0,
    o2: v.option2,
    o2Length: (v.option2 && v.option2.length) || 0,
  }));

  const scriptEl = document.querySelector('script[data-at-bulk-grid-config]');
  const out = {
    fromCache: !!cached,
    variantCount: config.variants.length,
    options: config.options?.map((o) => ({ name: o.name, position: o.position, valueCount: (o.values || []).length })),
    variantsMatchingSearch: variantsMatching.length,
    variantsMatchingSample: variantsMatching.slice(0, 3).map((v) => ({ id: v.id, option1: v.option1, option2: v.option2 })),
    mapSize: idsByTuple.size,
    mapKeysSample,
    firstVariants,
    lastVariants,
    configRawLength: scriptEl?.textContent?.length ?? null,
  };

  console.log('atBulkGridDebug:', out);
  return out;
};
