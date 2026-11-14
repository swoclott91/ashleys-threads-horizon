/**
 * AT Multi-style bulk order: "Choose quantities" dialog and add-all-to-cart
 * (sections/at-multi-style-bulk-order.liquid → <at-msbo-quantities>).
 *
 * Claims `at-bulk-order:choose-quantities` from <at-multi-style-bulk-order> with the same
 * section ID (see the contract at the top of assets/at-multi-style-bulk-order.js), opens one
 * native modal <dialog> with a section per selected style, loads every current size of the
 * selected colors only (sections/at-bulk-color-data.liquid, three styles at a time, cached
 * per style + color for the page lifetime) and adds every valid quantity in one cart request.
 *
 * Pure logic (draft, validation, grid model, reconciliation) is in
 * assets/at-multi-style-quantities-core.js. Cart events follow assets/at-bulk-grid.js:
 * a CartLinesUpdateEvent is dispatched from the add button inside the modal before the
 * request and resolved with the cart afterwards, so the cart icon and drawer update and the
 * drawer opens once the dialog closes.
 *
 * Review & reorder: with `?reorder=<order ID or name>` on the page URL, the dialog loads that
 * order's lines (sections/at-reorder-data.liquid), checks the ordered styles in the selector
 * and opens itself with those colors and the order's exact variants prefilled with their
 * ordered quantities. Everything stays editable; sold-out sizes keep a blank, disabled input
 * with an "ordered N" note, and lines that cannot be prefilled are listed in a notice. None
 * of them count in the total. Nothing is added until the shopper presses add. An order not in
 * the first 20 falls back to the normal selector with a notice.
 */

import { formatMoney } from '@theme/money-formatting';
import { CartLinesUpdateEvent } from '@shopify/events';
import { fetchBulkColorBatch, fetchReorderData, postBulkCartItems, readBulkCart } from '@theme/at-bulk-transport';
import {
  QuantityDraft,
  SubmitGuard,
  applyReconciliation,
  availabilityBand,
  buildReorderPrefill,
  buildStyleGrid,
  cartQuantities,
  classifyAddResponse,
  findReorderOrder,
  loadColorVariants,
  parseReorderParam,
  planPrefillSeed,
  reconcileCartAdd,
  reorderProductIds,
  runWithConcurrency,
  stepQuantity,
  validateQuantity,
} from '@theme/at-multi-style-quantities-core';

const CHOOSE_QUANTITIES_EVENT = 'at-bulk-order:choose-quantities';
const STYLE_CONCURRENCY = 3;
const ADD_TIMEOUT_MS = 45000;
const DESKTOP_QUERY = '(min-width: 750px)';

const ICON_CARET = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false"><path d="M11 5.5L7 9.5L3 5.5" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_MINUS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false"><path d="M2.75 7H11.25" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false"><path d="M2.75 7H11.25" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"/><path d="M7 2.75L7 11.25" stroke="currentColor" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"/></svg>';

/** Page-lifetime cache: `${productId}:${colorId}` → Promise of a loadColorVariants result. */
const colorCache = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fill(template, values) {
  return String(template ?? '').replace(/\[(\w+)\]/g, (match, key) => (key in values ? String(values[key]) : match));
}

function plural(strings, key, count, values = {}) {
  let rule = 'other';
  try {
    rule = new Intl.PluralRules(document.documentElement.lang || undefined).select(count);
  } catch {
    rule = count === 1 ? 'one' : 'other';
  }
  const template = strings[`${key}_${rule}`] ?? strings[`${key}_other`];
  return fill(template, { count, ...values });
}

/** Section IDs for cart-items-component morph (same as at-bulk-grid.js / product-form.js). */
function cartItemsSectionIds() {
  return [...document.querySelectorAll('cart-items-component')]
    .map((element) => (element instanceof HTMLElement ? element.dataset.sectionId : ''))
    .filter(Boolean);
}

function loadColor(style, color) {
  const key = `${style.productId}:${color.optionValueId}`;
  let promise = colorCache.get(key);
  if (!promise) {
    promise = loadColorVariants({
      colorId: color.optionValueId,
      colorPosition: style.colorOptionPosition,
      fetchBatch: (ids) => fetchBulkColorBatch(style.productUrl, ids),
    });
    colorCache.set(key, promise);
    // Failed loads are not cached, so Try again refetches them.
    promise.catch(() => {
      if (colorCache.get(key) === promise) colorCache.delete(key);
    });
  }
  return promise;
}

class MultiStyleQuantities extends HTMLElement {
  #listeners;
  #strings = {};
  #dialog;
  #body;
  #draft = new QuantityDraft();
  #guard = new SubmitGuard();
  /** @type {Array<any>} */
  #styles = [];
  /** productId → { status: 'loading' | 'ready' | 'error', results: Map<colorId, result> } */
  #state = new Map();
  /** variantId → { variant, style, color, label } for every loaded cell */
  #variants = new Map();
  /** variantId → message after a cart add */
  #notes = new Map();
  #expanded = new Set();
  #media;
  /** Review & reorder: { name, pending: Map<productId, entries>, soldOut: Set, unavailable: string[] } */
  #prefill = null;

  connectedCallback() {
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    try {
      this.#strings = JSON.parse(this.querySelector('script[data-at-msq-strings]')?.textContent || '{}');
    } catch {
      this.#strings = {};
    }
    this.#dialog = this.querySelector('dialog[data-at-msq-dialog]');
    this.#body = this.querySelector('[data-at-msq-body]');
    if (!this.#dialog || !this.#body) return;

    document.addEventListener(CHOOSE_QUANTITIES_EVENT, this.#onChoose, { signal });
    this.#dialog.addEventListener('click', this.#onDialogClick, { signal });
    this.#dialog.addEventListener('close', this.#onClose, { signal });
    this.#body.addEventListener('input', this.#onInput, { signal });
    this.#body.addEventListener('change', this.#onChange, { signal });
    this.#media = window.matchMedia(DESKTOP_QUERY);
    this.#media.addEventListener('change', () => {
      if (this.#dialog.open) this.#renderAll();
    }, { signal });

    const reorder = parseReorderParam(window.location.search);
    if (reorder) this.#startReorder(reorder, signal);
  }

  disconnectedCallback() {
    this.#listeners?.abort();
  }

  get #isDesktop() {
    return this.#media?.matches ?? true;
  }

  get #addButton() {
    return this.querySelector('[data-at-msq-add]');
  }

  #money(cents) {
    const currency = (this.dataset.currency || window.Shopify?.currency?.active || 'USD').toUpperCase();
    let format = this.dataset.moneyFormat?.trim() || '';
    if (!format) format = currency === 'USD' ? '${{amount}}' : `{{amount}} ${currency}`;
    return formatMoney(cents, format, currency);
  }

  /* ── Open / close ─────────────────────────────────────────────────────────────────────── */

  #onChoose = (event) => {
    if (event.detail?.sectionId !== this.dataset.sectionId) return;
    event.preventDefault();
    // A normal "Choose quantities" ends the reorder review; quantities already typed stay.
    this.#prefill = null;
    this.#open(Array.isArray(event.detail.styles) ? event.detail.styles : []);
  };

  #open(styles) {
    this.#styles = styles;
    // Keep quantities for styles and colors that are still selected.
    this.#draft.retainSelection(this.#styles);
    for (const variantId of [...this.#notes.keys()]) {
      if (!this.#variants.has(variantId) || !this.#draft.get(variantId)) this.#notes.delete(variantId);
    }
    if (!this.#guard.pending) this.#setMessage('');
    this.#renderAll();
    if (!this.#dialog.open) {
      this.#dialog.showModal();
      document.documentElement.classList.add('at-msq-scroll-lock');
    }
    this.querySelector('[data-at-msq-heading]')?.focus();
    // Styles already loaded come from the cache; styles still loading finish on their own.
    this.#loadStyles(this.#styles.filter((style) => !['ready', 'loading'].includes(this.#state.get(style.productId)?.status)));
    for (const style of this.#styles) {
      if (this.#state.get(style.productId)?.status === 'ready' && this.#applyPrefill(style)) this.#renderStyle(style);
    }
    this.#renderPrefillNotice();
    this.#renderSummary();
  }

  /* ── Review & reorder ─────────────────────────────────────────────────────────────────── */

  async #startReorder(param, signal) {
    const fallback = (key) => {
      if (signal.aborted) return;
      const notice = this.closest('.at-msbo')?.querySelector('[data-at-msbo-reorder-notice]');
      if (notice) {
        notice.textContent = this.#strings[key] ?? '';
        notice.hidden = false;
      }
      this.#selector()?.setFilter('purchase');
    };

    let order = null;
    let failed = false;
    try {
      const data = await fetchReorderData(window.location.pathname);
      order = data ? findReorderOrder(data, param) : null;
    } catch (error) {
      console.warn('[at-msbo-quantities] Order lines failed to load', error);
      failed = true;
    }
    await customElements.whenDefined('at-multi-style-bulk-order');
    if (signal.aborted) return;
    const selector = this.#selector();
    if (failed || !order || !selector) {
      fallback(failed ? 'reorder_failed' : 'reorder_not_found');
      return;
    }

    selector.selectStyles(reorderProductIds(order));
    const prefill = buildReorderPrefill(order, selector.selection);
    if (!prefill.styles.length) {
      fallback('reorder_nothing');
      return;
    }
    const pending = new Map();
    for (const entry of prefill.quantities) {
      if (!pending.has(entry.productId)) pending.set(entry.productId, []);
      pending.get(entry.productId).push(entry);
    }
    this.#prefill = {
      name: order.name,
      pending,
      soldOut: new Set(),
      unavailable: prefill.unavailable.map((line) => line.title).filter(Boolean),
    };
    this.#open(prefill.styles);
  }

  #selector() {
    return document.querySelector(
      `at-multi-style-bulk-order[data-section-id="${CSS.escape(this.dataset.sectionId || '')}"]`
    );
  }

  /**
   * Puts a loaded style's ordered quantities in the draft (available sizes only) and flags
   * the rest. Returns true when anything changed, so the caller re-renders the style.
   */
  #applyPrefill(style) {
    const entries = this.#prefill?.pending.get(style.productId);
    const state = this.#state.get(style.productId);
    if (!entries || (state?.status !== 'ready' && state?.status !== 'error')) return false;
    const { seed, soldOut, missing } = planPrefillSeed(entries, this.#lookup);
    for (const entry of seed) {
      this.#draft.set(entry.variantId, String(entry.quantity), entry);
    }
    for (const entry of soldOut) {
      this.#prefill.soldOut.add(entry.variantId);
      this.#notes.set(entry.variantId, fill(this.#strings.prefill_ordered, { count: entry.quantity }));
      // Keep the color open on mobile so the flag is seen.
      const row = this.#body.querySelector(`[data-at-msq-cell][data-variant-id="${entry.variantId}"]`)
        ?.closest('[data-row-key]');
      if (row instanceof HTMLElement && row.dataset.rowKey) this.#expanded.add(row.dataset.rowKey);
    }
    const unresolved = [];
    for (const entry of missing) {
      // A color that failed to load may still come back with Try again.
      if (state.results.get(entry.colorId)?.status === 'error') {
        unresolved.push(entry);
        continue;
      }
      const color = style.colors.find((candidate) => candidate.optionValueId === entry.colorId);
      this.#prefill.unavailable.push([style.title, color?.name].filter(Boolean).join(' - '));
    }
    if (unresolved.length) this.#prefill.pending.set(style.productId, unresolved);
    else this.#prefill.pending.delete(style.productId);
    this.#renderPrefillNotice();
    return seed.length > 0 || soldOut.length > 0;
  }

  #renderPrefillNotice() {
    const target = this.querySelector('[data-at-msq-prefill]');
    if (!target) return;
    const prefill = this.#prefill;
    if (!prefill) {
      target.hidden = true;
      target.textContent = '';
      return;
    }
    const parts = [fill(this.#strings.prefill_intro, { order: prefill.name })];
    if (prefill.soldOut.size) parts.push(plural(this.#strings, 'prefill_sold_out', prefill.soldOut.size));
    const titles = [...new Set(prefill.unavailable)];
    if (titles.length) {
      const shown = titles.slice(0, 4).join(', ') + (titles.length > 4 ? ', …' : '');
      parts.push(plural(this.#strings, 'prefill_unavailable', titles.length, { items: shown }));
    }
    target.textContent = parts.join(' ');
    target.hidden = false;
  }

  #onClose = () => {
    document.documentElement.classList.remove('at-msq-scroll-lock');
    const choose = document.querySelector(
      `at-multi-style-bulk-order[data-section-id="${CSS.escape(this.dataset.sectionId || '')}"] [data-at-msbo-choose]`
    );
    if (choose instanceof HTMLElement && !choose.hasAttribute('disabled')) choose.focus();
  };

  #onDialogClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-at-msq-close]')) {
      this.#dialog.close();
      return;
    }
    if (target === this.#dialog) {
      const rect = this.#dialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) this.#dialog.close();
      return;
    }
    if (target?.closest('[data-at-msq-add]')) {
      this.#submit();
      return;
    }
    const retry = target?.closest('[data-at-msq-retry]');
    if (retry) {
      const style = this.#styles.find((candidate) => candidate.productId === retry.dataset.productId);
      if (style) this.#loadStyles([style], { focus: true });
      return;
    }
    const toggle = target?.closest('[data-at-msq-toggle]');
    if (toggle) {
      const key = toggle.dataset.rowKey;
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      document.getElementById(toggle.getAttribute('aria-controls') || '')?.toggleAttribute('hidden', !open);
      if (open) this.#expanded.add(key);
      else this.#expanded.delete(key);
      return;
    }
    const step = target?.closest('[data-at-msq-step]');
    if (step) {
      const input = step.parentElement?.querySelector('[data-at-msq-qty]');
      const entry = input && this.#variants.get(input.dataset.variantId);
      if (!entry || input.disabled) return;
      const next = stepQuantity(input.value, entry.variant, Number(step.dataset.atMsqStep));
      input.value = next ? String(next) : '';
      this.#updateDraft(input);
    }
  };

  /* ── Loading ──────────────────────────────────────────────────────────────────────────── */

  #loadStyles(styles, { focus = false } = {}) {
    for (const style of styles) {
      this.#state.set(style.productId, { status: 'loading', results: this.#state.get(style.productId)?.results ?? new Map() });
      this.#renderStyle(style);
    }
    const tasks = styles.map((style) => async () => {
      const state = this.#state.get(style.productId);
      let failed = false;
      for (const color of style.colors) {
        if (color.removed) {
          // Review & reorder: a color the product no longer has. Nothing to load.
          state.results.set(color.optionValueId, { status: 'missing' });
          continue;
        }
        try {
          state.results.set(color.optionValueId, await loadColor(style, color));
        } catch (error) {
          console.warn('[at-msbo-quantities] Sizes failed to load', style.productUrl, color.optionValueId, error);
          state.results.set(color.optionValueId, { status: 'error' });
          failed = true;
        }
      }
      state.status = failed ? 'error' : 'ready';
      this.#renderStyle(style, { focus });
      if (this.#applyPrefill(style)) this.#renderStyle(style, { focus });
      this.#renderSummary();
    });
    return runWithConcurrency(tasks, STYLE_CONCURRENCY);
  }

  /* ── Rendering ────────────────────────────────────────────────────────────────────────── */

  #renderAll() {
    const subtitle = this.querySelector('[data-at-msq-subtitle]');
    if (subtitle) subtitle.textContent = plural(this.#strings, 'subtitle', this.#styles.length);
    this.#body.replaceChildren(...this.#styles.map((style) => {
      const section = document.createElement('section');
      section.className = 'at-msq__style';
      section.dataset.productId = style.productId;
      section.setAttribute('aria-labelledby', this.#id(style.productId, 'title'));
      return section;
    }));
    for (const style of this.#styles) this.#renderStyle(style);
    this.#renderSummary();
  }

  #id(...parts) {
    return `at-msq-${this.dataset.sectionId}-${parts.join('-')}`.replace(/[^\w-]/g, '_');
  }

  #renderStyle(style, { focus = false } = {}) {
    const section = this.#body.querySelector(`.at-msq__style[data-product-id="${style.productId}"]`);
    if (!section) return;
    const hadFocus = section.contains(document.activeElement);
    const state = this.#state.get(style.productId) ?? { status: 'loading', results: new Map() };
    const strings = this.#strings;

    let content = '';
    const allGone = style.colors.length > 0
      && style.colors.every((color) => state.results.get(color.optionValueId)?.status === 'gone');
    if (allGone) {
      content = `<p class="at-msq__state">${escapeHtml(strings.style_gone)}</p>`;
    } else {
      if (state.status === 'error') {
        content += `<div class="at-msq__state at-msq__state--error" role="alert"><p>${escapeHtml(strings.load_failed)}</p>`
          + `<button type="button" class="button button-secondary at-msq__retry" data-at-msq-retry data-product-id="${escapeHtml(style.productId)}">`
          + `${escapeHtml(strings.retry)}</button></div>`;
      }
      if (state.status === 'loading') {
        content += `<div class="at-bulk-grid__loading at-msq__loading" aria-busy="true"><div class="at-bulk-grid__spinner" role="status">`
          + `<span class="visually-hidden">${escapeHtml(strings.loading)}</span></div></div>`;
      } else {
        const grid = buildStyleGrid(style, state.results);
        for (const row of grid.rows) {
          for (const variant of row.cells.values()) {
            const color = style.colors.find((candidate) => candidate.optionValueId === row.colorId);
            this.#variants.set(variant.id, { variant, style, color, label: this.#variantLabel(row, variant, grid) });
          }
        }
        content += this.#isDesktop ? this.#desktopGrid(style, grid) : this.#mobileGrid(style, grid);
      }
    }

    const href = escapeHtml(style.productUrl);
    const image = style.imageUrl
      ? `<a class="at-msq__style-link" href="${href}" tabindex="-1" aria-hidden="true"><img class="at-msq__style-image" src="${escapeHtml(style.imageUrl)}" alt="" width="56" height="56" loading="lazy"></a>`
      : '<span class="at-msq__style-image" aria-hidden="true"></span>';
    section.innerHTML = `<header class="at-msq__style-head">${image}`
      + `<div class="at-msq__style-text"><h3 class="at-msq__style-title" id="${this.#id(style.productId, 'title')}"><a class="at-msq__style-title-link" href="${href}">${escapeHtml(style.title)}</a></h3>`
      + `<p class="at-msq__style-meta">${escapeHtml(plural(strings, 'colors', style.colors.length))}</p></div>`
      + `<p class="at-msq__style-total" data-at-msq-style-total></p></header>`
      + `<div class="at-msq__style-content">${content}</div>`;
    this.#renderStyleTotal(style.productId);
    this.#refreshValidity(section);

    if (focus || hadFocus) {
      const target = section.querySelector('[data-at-msq-qty]:not([disabled]), [data-at-msq-toggle], [data-at-msq-retry]')
        || section.querySelector('.at-msq__style-title');
      if (target instanceof HTMLElement) {
        if (!target.matches('input, button')) target.tabIndex = -1;
        target.focus();
      }
    }
  }

  #variantLabel(row, variant, grid) {
    const parts = [row.colorName];
    if (row.extra) parts.push(fill(this.#strings.extra_option, { name: row.extra.name, value: row.extra.value }));
    const size = grid.columns.length && grid.columns[0].id !== null
      ? grid.columns.find(({ id }) => variant.options.some((option) => option.id === id))?.label
      : null;
    if (size) parts.push(size);
    return parts.join(', ');
  }

  #rowLabel(row) {
    const extra = row.extra ? fill(this.#strings.extra_option, { name: row.extra.name, value: row.extra.value }) : '';
    const swatch = row.swatchBackground
      ? `<span class="at-bulk-grid__swatch swatch" style="--swatch-background: ${escapeHtml(row.swatchBackground)}" aria-hidden="true"></span>`
      : '<span class="at-bulk-grid__swatch swatch" aria-hidden="true"></span>';
    return `${swatch}<span class="at-msq__row-name"><span class="at-bulk-grid__color-name">${escapeHtml(row.colorName)}</span>`
      + (extra ? `<span class="at-msq__row-extra">${escapeHtml(extra)}</span>` : '') + '</span>';
  }

  #rowMessage(row) {
    if (row.status === 'missing' || row.status === 'gone') return this.#strings.color_gone;
    if (row.status === 'error') return this.#strings.color_failed;
    return this.#strings.loading;
  }

  #priceHtml(variant) {
    const price = `<span class="price">${escapeHtml(this.#money(variant.price))}</span>`;
    const compare = variant.compareAtPrice
      ? `<s class="compare-at-price">${escapeHtml(this.#money(variant.compareAtPrice))}</s> `
      : '';
    return `<span class="at-bulk-grid__price">${compare}${price}</span>`;
  }

  #availabilityHtml(variant) {
    const band = availabilityBand(variant);
    let text = this.#strings.in_stock;
    let modifier = 'in-stock';
    if (band === 'out') {
      text = this.#strings.sold_out;
      modifier = 'out';
    } else if (band === 'many') {
      text = fill(this.#strings.stock_count, { count: '1000+' });
    } else if (typeof band === 'number') {
      text = fill(this.#strings.stock_count, { count: band });
      modifier = 'low';
    }
    return `<span class="at-bulk-grid__availability at-bulk-grid__availability--${modifier}">${escapeHtml(text)}</span>`;
  }

  #inputHtml(variant, label) {
    const value = this.#draft.get(variant.id);
    const soldOut = !variant.available;
    const aria = soldOut ? `${label} (${this.#strings.sold_out})` : label;
    const { min, increment, max } = variant.quantityRule;
    return `<input type="number" inputmode="numeric" min="0" step="${increment}" autocomplete="off" class="at-bulk-grid__qty-input at-msq__qty"`
      + ` data-at-msq-qty data-variant-id="${variant.id}" value="${escapeHtml(value)}" placeholder="0"`
      + ` aria-label="${escapeHtml(fill(this.#strings.quantity_label, { variant: aria }))}"`
      + ` aria-describedby="${this.#id('note', variant.id)}"`
      + ` data-min="${min}" data-increment="${increment}"${max !== null ? ` data-max="${max}"` : ''}`
      + `${soldOut ? ' disabled' : ''}>`;
  }

  #noteHtml(variant) {
    return `<span class="at-msq__note" id="${this.#id('note', variant.id)}" data-at-msq-note="${variant.id}" aria-live="polite">`
      + `${escapeHtml(this.#notes.get(variant.id) ?? '')}</span>`;
  }

  #ruleHint(variant) {
    const { min, increment, max } = variant.quantityRule;
    if (min <= 1 && increment <= 1 && max === null) return '';
    const parts = [];
    if (min > 1) parts.push(fill(this.#strings.rule_min, { min }));
    if (increment > 1) parts.push(fill(this.#strings.rule_increment, { increment }));
    if (max !== null) parts.push(fill(this.#strings.rule_max, { max }));
    return `<span class="at-msq__rule">${escapeHtml(parts.join(' · '))}</span>`;
  }

  #desktopGrid(style, grid) {
    const strings = this.#strings;
    const columns = grid.columns;
    let html = '<div class="at-bulk-grid__table-wrapper at-msq__table-wrapper"><table class="at-bulk-grid__table at-msq__table">';
    html += `<caption class="visually-hidden">${escapeHtml(style.title)}</caption>`;
    html += `<thead><tr><th scope="col">${escapeHtml(strings.color_column)}</th>`;
    for (const column of columns) html += `<th scope="col">${escapeHtml(column.label ?? strings.quantity_column)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of grid.rows) {
      html += `<tr data-row-key="${escapeHtml(row.key)}"><th scope="row" class="at-bulk-grid__color-cell at-msq__row-head">`
        + `<div class="at-bulk-grid__color-cell-inner">${this.#rowLabel(row)}</div></th>`;
      if (row.status !== 'ok') {
        html += `<td colspan="${columns.length}" class="at-msq__row-message">${escapeHtml(this.#rowMessage(row))}</td></tr>`;
        continue;
      }
      for (const column of columns) {
        const variant = row.cells.get(column.id);
        if (!variant) {
          html += `<td class="at-msq__cell--none"><span aria-hidden="true">—</span><span class="visually-hidden">${escapeHtml(strings.not_offered)}</span></td>`;
          continue;
        }
        const label = this.#variants.get(variant.id)?.label ?? row.colorName;
        html += `<td data-at-msq-cell data-variant-id="${variant.id}"${variant.available ? '' : ' class="at-msq__cell--sold-out"'}>`
          + `<div class="at-bulk-grid__cell-inner">${this.#inputHtml(variant, label)}${this.#priceHtml(variant)}`
          + `${this.#availabilityHtml(variant)}${this.#ruleHint(variant)}${this.#noteHtml(variant)}</div></td>`;
      }
      html += '</tr>';
    }
    return `${html}</tbody></table></div>`;
  }

  #mobileGrid(style, grid) {
    const strings = this.#strings;
    let html = '<div class="at-msq__accordions">';
    for (const row of grid.rows) {
      if (row.status !== 'ok') {
        html += `<div class="at-msq__accordion at-msq__accordion--static"><div class="at-msq__accordion-header">${this.#rowLabel(row)}</div>`
          + `<p class="at-msq__row-message">${escapeHtml(this.#rowMessage(row))}</p></div>`;
        continue;
      }
      const panelId = this.#id(style.productId, 'row', row.key);
      const open = this.#expanded.has(row.key);
      html += `<div class="at-msq__accordion" data-row-key="${escapeHtml(row.key)}">`
        + `<button type="button" class="at-msq__accordion-header" data-at-msq-toggle data-row-key="${escapeHtml(row.key)}"`
        + ` aria-expanded="${open}" aria-controls="${panelId}">${this.#rowLabel(row)}`
        + `<span class="at-msq__row-count" data-at-msq-row-count="${escapeHtml(row.key)}"></span>`
        + `<span class="svg-wrapper at-msq__caret">${ICON_CARET}</span></button>`
        + `<div class="at-msq__accordion-content" id="${panelId}"${open ? '' : ' hidden'}>`;
      for (const column of grid.columns) {
        const variant = row.cells.get(column.id);
        if (!variant) continue;
        const label = this.#variants.get(variant.id)?.label ?? row.colorName;
        const disabled = variant.available ? '' : ' disabled';
        html += `<div class="at-msq__size-row${variant.available ? '' : ' at-msq__size-row--sold-out'}" data-at-msq-cell data-variant-id="${variant.id}">`
          + `<div class="at-msq__size-info"><span class="at-msq__size-label">${escapeHtml(column.label ?? strings.quantity_column)}</span>`
          + `${this.#priceHtml(variant)}${this.#availabilityHtml(variant)}${this.#ruleHint(variant)}${this.#noteHtml(variant)}</div>`
          + '<div class="quantity-selector at-bulk-grid__qty-selector at-msq__stepper">'
          + `<button type="button" class="button quantity-minus button-unstyled" data-at-msq-step="-1"${disabled}`
          + ` aria-label="${escapeHtml(fill(strings.decrease, { variant: label }))}"><span class="svg-wrapper">${ICON_MINUS}</span></button>`
          + this.#inputHtml(variant, label)
          + `<button type="button" class="button quantity-plus button-unstyled" data-at-msq-step="1"${disabled}`
          + ` aria-label="${escapeHtml(fill(strings.increase, { variant: label }))}"><span class="svg-wrapper">${ICON_PLUS}</span></button>`
          + '</div></div>';
      }
      html += '</div></div>';
    }
    return `${html}</div>`;
  }

  /* ── Draft ────────────────────────────────────────────────────────────────────────────── */

  #onInput = (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches('[data-at-msq-qty]')) this.#updateDraft(input, { showError: false });
  };

  #onChange = (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches('[data-at-msq-qty]')) this.#updateDraft(input);
  };

  #updateDraft(input, { showError = true } = {}) {
    const entry = this.#variants.get(input.dataset.variantId);
    if (!entry) return;
    this.#draft.set(entry.variant.id, input.value, { productId: entry.style.productId, colorId: entry.color?.optionValueId });
    this.#notes.delete(entry.variant.id);
    this.#refreshInput(input, entry.variant, { showError });
    this.#renderStyleTotal(entry.style.productId);
    this.#renderSummary();
  }

  #errorText(error, variant) {
    const { min, max, increment } = variant.quantityRule;
    const key = { integer: 'error_integer', min: 'error_min', max: 'error_max', increment: 'error_increment',
      unavailable: 'sold_out' }[error];
    return fill(this.#strings[key], { min, max, increment });
  }

  #refreshInput(input, variant, { showError = true } = {}) {
    const { quantity, error } = validateQuantity(input.value, variant);
    const message = error ? this.#errorText(error, variant) : '';
    input.setCustomValidity(message);
    if (error && showError) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    input.classList.toggle('at-bulk-grid__qty-input--active', quantity > 0 && !error);
    const note = this.querySelector(`[data-at-msq-note="${variant.id}"]`);
    if (note && (showError || !error)) note.textContent = this.#notes.get(variant.id) ?? message;
    note?.classList.toggle('at-msq__note--error', Boolean(error) && showError);
  }

  #refreshValidity(scope) {
    for (const input of scope.querySelectorAll('[data-at-msq-qty]')) {
      const entry = this.#variants.get(input.dataset.variantId);
      if (entry) this.#refreshInput(input, entry.variant, { showError: Boolean(input.value) });
    }
  }

  #lookup = (variantId) => this.#variants.get(variantId)?.variant;

  #renderStyleTotal(productId) {
    const target = this.#body.querySelector(`.at-msq__style[data-product-id="${productId}"] [data-at-msq-style-total]`);
    const { count, subtotal } = this.#draft.summarize(this.#lookup, { productId });
    if (target) target.textContent = count ? `${plural(this.#strings, 'units', count)} · ${this.#money(subtotal)}` : '';
    for (const badge of this.#body.querySelectorAll(`.at-msq__style[data-product-id="${productId}"] [data-at-msq-row-count]`)) {
      const accordion = badge.closest('.at-msq__accordion');
      let rowCount = 0;
      for (const input of accordion?.querySelectorAll('[data-at-msq-qty]') ?? []) {
        const variant = this.#lookup(input.dataset.variantId);
        const { quantity, error } = validateQuantity(input.value, variant);
        if (!error) rowCount += quantity;
      }
      badge.textContent = rowCount ? plural(this.#strings, 'units', rowCount) : '';
      accordion?.classList.toggle('at-msq__accordion--has-items', rowCount > 0);
    }
  }

  #selectedSummary() {
    const productIds = new Set(this.#styles.map((style) => style.productId));
    const summary = this.#draft.summarize(this.#lookup);
    // Only quantities shown in the dialog count; summarize already skips unknown variants.
    summary.items = summary.items.filter(({ id }) => productIds.has(this.#variants.get(id)?.style.productId));
    return summary;
  }

  #renderSummary() {
    const { count, subtotal } = this.#selectedSummary();
    const countEl = this.querySelector('[data-at-msq-count]');
    const subtotalEl = this.querySelector('[data-at-msq-subtotal]');
    const label = this.querySelector('[data-at-msq-add-label]');
    const button = this.#addButton;
    if (countEl) countEl.textContent = plural(this.#strings, 'units', count);
    if (subtotalEl) subtotalEl.textContent = this.#money(subtotal);
    if (label) label.textContent = count ? plural(this.#strings, 'add_all', count) : this.#strings.add_empty;
    if (button) button.disabled = count === 0 || this.#guard.pending;
  }

  #setMessage(text, { reviewCart = false } = {}) {
    const target = this.querySelector('[data-at-msq-message]');
    if (!target) return;
    target.textContent = text;
    if (text && reviewCart && this.dataset.cartUrl) {
      const link = document.createElement('a');
      link.href = this.dataset.cartUrl;
      link.className = 'at-msq__cart-link';
      link.textContent = this.#strings.review_cart;
      target.append(' ', link);
    }
  }

  /* ── Add to cart ──────────────────────────────────────────────────────────────────────── */

  #setLoading(loading) {
    const button = this.#addButton;
    if (!button) return;
    button.classList.toggle('at-bulk-grid__add--loading', loading);
    button.toggleAttribute('aria-busy', loading);
    if (loading) button.disabled = true;
  }

  async #submit() {
    if (!this.#guard.tryBegin()) return;
    const button = this.#addButton;
    let deferred = null;
    try {
      const { items, invalid } = this.#selectedSummary();
      const shownInvalid = invalid.filter((id) => this.#styles.some((style) => style.productId === this.#variants.get(id)?.style.productId));
      if (shownInvalid.length) {
        for (const input of this.querySelectorAll('[data-at-msq-qty]')) {
          const entry = this.#variants.get(input.dataset.variantId);
          if (entry) this.#refreshInput(input, entry.variant);
        }
        this.#setMessage(this.#strings.fix_errors);
        const first = this.querySelector('[data-at-msq-qty][aria-invalid]');
        if (first instanceof HTMLInputElement) {
          this.#revealInput(first);
          first.focus();
        }
        return;
      }
      if (!items.length) return;

      this.#setLoading(true);
      this.#setMessage('');

      // Baseline first: without it a partial add could not be attributed, so nothing is sent.
      let baseline = null;
      try {
        const read = await readBulkCart();
        if (read.ok) baseline = read;
      } catch (error) {
        console.warn('[at-msbo-quantities] Cart read before add failed', error);
      }
      if (!baseline) {
        this.#setMessage(this.#strings.baseline_failed);
        return;
      }

      deferred = CartLinesUpdateEvent.createPromise();
      (button ?? this).dispatchEvent(new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
        promise: deferred.promise,
      }));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ADD_TIMEOUT_MS);
      let response = null;
      try {
        response = await postBulkCartItems(items, { sectionIds: cartItemsSectionIds(), signal: controller.signal });
      } catch (error) {
        console.warn('[at-msbo-quantities] Cart add response lost', error);
      } finally {
        clearTimeout(timer);
      }
      const outcome = classifyAddResponse(items, response);

      if (outcome === 'ok') {
        const count = items.reduce((sum, item) => sum + item.quantity, 0);
        const cart = {
          ...baseline.data,
          item_count: baseline.data.item_count + count,
          items: response.items,
        };
        this.#finishSuccess(items, count, cart, response.sections, response.data, deferred);
        deferred = null;
        return;
      }

      // 422, partial or lost: read the cart again and attribute per exact variant ID.
      let after = null;
      try {
        const read = await readBulkCart();
        if (read.ok) after = read;
      } catch (error) {
        console.warn('[at-msbo-quantities] Cart read after add failed', error);
      }
      const result = reconcileCartAdd({
        requested: items,
        baseline: cartQuantities(baseline.items),
        after: after ? cartQuantities(after.items) : null,
        outcome,
      });

      if (result.status === 'success') {
        this.#finishSuccess(items, result.addedCount, after.data, undefined, response?.data ?? null, deferred);
        deferred = null;
        return;
      }

      applyReconciliation(this.#draft, result);
      this.#applyRowNotes(result);
      const reason = typeof response?.error?.description === 'string' ? response.error.description
        : typeof response?.error?.message === 'string' && response.status === 422 ? response.error.message : '';
      if (result.status === 'uncertain') {
        this.#setMessage(this.#strings.uncertain, { reviewCart: true });
      } else if (result.status === 'partial') {
        this.#setMessage([plural(this.#strings, 'partial', result.addedCount), reason].filter(Boolean).join(' '),
          { reviewCart: outcome === 'lost' });
      } else {
        this.#setMessage([outcome === 'lost' ? this.#strings.lost_none : this.#strings.none_added, reason].filter(Boolean).join(' '),
          { reviewCart: outcome === 'lost' });
      }

      // The cart changed (or may have): refresh the icon and drawer from the cart we just read.
      if (after && result.status !== 'none') {
        if (result.status === 'partial') {
          window.dispatchEvent(new CustomEvent('at:bulk:added', { detail: { items: this.#confirmedItems(result), response: after.data } }));
        }
        deferred.resolve({
          cart: CartLinesUpdateEvent.createCartFromAjaxResponse(after.data),
          detail: { source: 'at-multi-style-bulk-order', sourceId: 'at-multi-style-bulk-order', itemCount: after.data.item_count },
        });
        deferred = null;
      }
      this.#rerenderInputs();
    } finally {
      deferred?.reject(new Error('Bulk add not confirmed'));
      this.#guard.end();
      this.#setLoading(false);
      this.#renderSummary();
      // A disabled or re-rendered control can drop focus to <body>; keep it in the dialog.
      if (this.#dialog.open && !this.#dialog.contains(document.activeElement)) {
        const target = button && !button.disabled ? button : this.querySelector('[data-at-msq-heading]');
        if (target instanceof HTMLElement) target.focus();
      }
    }
  }

  #confirmedItems(result) {
    return [...result.rows].filter(([, row]) => row.added > 0).map(([id, row]) => ({ id, quantity: row.added }));
  }

  #finishSuccess(items, count, cart, sections, responseData, deferred) {
    window.dispatchEvent(new CustomEvent('at:bulk:added', { detail: { items, response: responseData } }));
    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: { source: 'at-multi-style-bulk-order', sourceId: 'at-multi-style-bulk-order', itemCount: cart.item_count, sections },
    });
    for (const { id } of items) {
      this.#draft.delete(id);
      this.#notes.delete(id);
    }
    // Quantities left only on styles that are no longer shown were already trimmed on open.
    this.#draft.retainSelection(this.#styles);
    this.#setMessage('');
    const status = this.querySelector('[data-at-msq-page-status]');
    if (status) status.textContent = plural(this.#strings, 'added', count);
    this.#rerenderInputs();
    if (this.#dialog.open) this.#dialog.close();
  }

  #applyRowNotes(result) {
    if (result.status === 'uncertain') return;
    for (const [variantId, row] of result.rows) {
      let text = '';
      if (row.kind === 'partial') text = fill(this.#strings.row_partial, { added: row.added, requested: row.requested, remaining: row.remaining });
      else if (row.kind === 'not_added') text = this.#strings.row_not_added;
      else if (row.kind === 'unconfirmed') text = this.#strings.row_unconfirmed;
      if (text) this.#notes.set(variantId, text);
      else this.#notes.delete(variantId);
      // Keep rows with a message open on mobile so the shopper sees them.
      const entry = this.#variants.get(variantId);
      if (text && entry) {
        const row = this.querySelector(`[data-at-msq-cell][data-variant-id="${variantId}"]`)?.closest('[data-row-key]');
        if (row instanceof HTMLElement && row.dataset.rowKey) this.#expanded.add(row.dataset.rowKey);
      }
    }
  }

  #rerenderInputs() {
    for (const style of this.#styles) {
      if (this.#state.get(style.productId)?.status !== 'loading') this.#renderStyle(style);
    }
    this.#renderSummary();
  }

  #revealInput(input) {
    const accordion = input.closest('.at-msq__accordion');
    const toggle = accordion?.querySelector('[data-at-msq-toggle]');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  }
}

if (!customElements.get('at-msbo-quantities')) customElements.define('at-msbo-quantities', MultiStyleQuantities);
