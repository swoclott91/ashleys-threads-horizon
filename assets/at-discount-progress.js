import {
  ThemeEvents,
  VariantUpdateEvent,
  QuantitySelectorUpdateEvent,
} from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

const INFO_ICON_SVG =
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="7.25" stroke="currentColor" stroke-width="1.5"/><path d="M9 8.25V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="5.25" r="0.75" fill="currentColor"/></svg>';

/**
 * @param {string} str
 * @param {Record<string, string>} vars
 */
function applyLiquidPlaceholders(str, vars) {
  if (!str) return '';
  let out = str;
  for (const [key, val] of Object.entries(vars)) {
    const needle = `{{ ${key} }}`;
    out = out.split(needle).join(val);
  }
  return out;
}

/** Wrapper that contains a bulk grid + optional discount bar (quick-add, PDP bulk, popup-link). */
function findBulkDiscountHost(el) {
  return (
    el.closest('.at-bulk-grid-modal__inner') ||
    el.closest('.at-buy-buttons__bulk-dialog-inner') ||
    el.closest('.popup-link__inner')
  );
}

class AtDiscountProgressBar extends HTMLElement {
  /** @type {Array<{ threshold: number, name: string, benefitShort: string, benefitLabel: string, kind?: string }>} */
  #milestones = [];

  /** @type {Record<string, string>} */
  #i18n = {};

  /** @type {number} */
  #subtotal = 0;

  /** @type {HTMLElement | null} */
  #bulkGrid = null;

  /** @type {MutationObserver | null} */
  #bulkMo = null;

  connectedCallback() {
    this.#parseAttributes();
    this.#bindEvents();
    this.render();
  }

  disconnectedCallback() {
    this.#unbindEvents();
  }

  #parseAttributes() {
    try {
      this.#milestones = JSON.parse(this.dataset.milestones || '[]');
    } catch {
      this.#milestones = [];
    }
    try {
      this.#i18n = JSON.parse(this.dataset.i18n || '{}');
    } catch {
      this.#i18n = {};
    }
    this.#subtotal = Number(this.dataset.subtotal) || 0;
  }

  #bindEvents() {
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartOrDiscount);
    document.addEventListener(ThemeEvents.discountUpdate, this.#onCartOrDiscount);
    document.addEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate);
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#onQuantityUpdate);

    if (this.dataset.context === 'bulk-modal') {
      const inner = findBulkDiscountHost(this);
      const grid = inner?.querySelector('[data-at-bulk-grid]');
      if (grid instanceof HTMLElement) {
        this.#bulkGrid = grid;
        grid.addEventListener('input', this.#onBulkInput);
        grid.addEventListener('change', this.#onBulkInput);
        this.#bulkMo = new MutationObserver(() => this.render());
        this.#bulkMo.observe(grid, { childList: true, subtree: true });
      }
    }

    document.addEventListener('pointerdown', this.#onDocPointerDown, true);
  }

  #unbindEvents() {
    document.removeEventListener(ThemeEvents.cartUpdate, this.#onCartOrDiscount);
    document.removeEventListener(ThemeEvents.discountUpdate, this.#onCartOrDiscount);
    document.removeEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate);
    document.removeEventListener(ThemeEvents.quantitySelectorUpdate, this.#onQuantityUpdate);
    document.removeEventListener('pointerdown', this.#onDocPointerDown, true);
    if (this.#bulkGrid) {
      this.#bulkGrid.removeEventListener('input', this.#onBulkInput);
      this.#bulkGrid.removeEventListener('change', this.#onBulkInput);
    }
    this.#bulkMo?.disconnect();
    this.#bulkMo = null;
    this.#bulkGrid = null;
  }

  /** @param {Event} e */
  #onCartOrDiscount = (e) => {
    void this.#applyCartResource(/** @type {{ detail?: { resource?: Record<string, unknown> } }} */ (e).detail?.resource);
  };

  /** @param {Record<string, unknown> | undefined} resource */
  async #applyCartResource(resource) {
    let r = resource;
    if (!r || typeof r.items_subtotal_price !== 'number') {
      try {
        const root = window.Shopify?.routes?.root || '/';
        const res = await fetch(`${root}cart.js`);
        if (res.ok) r = await res.json();
      } catch {
        return;
      }
    }
    if (typeof r?.items_subtotal_price === 'number') {
      this.#subtotal = /** @type {number} */ (r.items_subtotal_price);
      this.dataset.subtotal = String(r.items_subtotal_price);
      this.render();
    }
  }

  /** @param {Event} e */
  #onVariantUpdate = (e) => {
    if (!(e instanceof VariantUpdateEvent)) return;
    const productId = e.detail?.data?.productId;
    if (productId != null && String(productId) !== String(this.dataset.productId)) return;
    const price = e.detail?.resource?.price;
    if (typeof price === 'number') {
      this.dataset.variantPrice = String(price);
      this.render();
    }
  };

  /** @param {Event} e */
  #onQuantityUpdate = (e) => {
    if (!(e instanceof QuantitySelectorUpdateEvent)) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const form = target.closest('product-form-component');
    if (!form || String(form.dataset.productId) !== String(this.dataset.productId)) return;
    this.render();
  };

  #onBulkInput = () => {
    this.render();
  };

  /** @param {Event} e */
  #onDocPointerDown = (e) => {
    const panel = this.querySelector('.at-dp__panel');
    const btn = this.querySelector('.at-dp__info-ref');
    if (!(panel instanceof HTMLElement) || !(btn instanceof HTMLElement)) return;
    if (panel.hidden) return;
    const t = e.target;
    if (t instanceof Node && !panel.contains(t) && !btn.contains(t)) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  };

  /**
   * Formatted money with no fractional part (milestone labels, “add more” amounts).
   * @param {number} amountCents
   * @returns {string}
   */
  #moneyWhole(amountCents) {
    const fmt = this.dataset.moneyFormat || '{{amount}}';
    const cur = this.dataset.currency || 'USD';
    const wholeFmt = fmt
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, '{{amount_no_decimals_with_comma_separator}}')
      .replace(/\{\{\s*amount_with_space_separator\s*\}\}/g, '{{amount_no_decimals_with_space_separator}}')
      .replace(/\{\{\s*amount_with_period_and_space_separator\s*\}\}/g, '{{amount_no_decimals_with_space_separator}}')
      .replace(/\{\{\s*amount_with_apostrophe_separator\s*\}\}/g, '{{amount_no_decimals}}')
      .replace(/\{\{\s*amount\s*\}\}/g, '{{amount_no_decimals}}');
    return formatMoney(amountCents, wholeFmt, cur);
  }

  /**
   * @param {number} amount
   * @returns {number}
   */
  #amountToPercent(amount) {
    const m = this.#milestones;
    const n = m.length;
    if (n === 0) return 0;
    if (amount <= 0) return 0;
    const lastT = m[n - 1].threshold;
    if (amount >= lastT) return 100;

    const visuals = m.map((_, i) => (n === 1 ? 0 : (i / (n - 1)) * 100));

    if (amount < m[0].threshold) {
      return (amount / m[0].threshold) * visuals[0];
    }

    for (let i = 0; i < n - 1; i++) {
      const t0 = m[i].threshold;
      const t1 = m[i + 1].threshold;
      if (amount >= t0 && amount < t1) {
        const v0 = visuals[i];
        const v1 = visuals[i + 1];
        return v0 + ((amount - t0) / (t1 - t0)) * (v1 - v0);
      }
    }
    return visuals[n - 1];
  }

  /** @returns {number} */
  #getPendingCents() {
    const ctx = this.dataset.context || 'cart';
    if (ctx === 'product') {
      const pid = String(this.dataset.productId || '');
      if (!pid) return 0;
      const form = document.querySelector(`product-form-component[data-product-id="${pid}"]`);
      const defaultQty = Number(form?.dataset.quantityDefault) || 1;
      const input = form?.querySelector('quantity-selector-component input[name="quantity"]');
      const qty = Number(input?.value) || defaultQty;
      const unit = Number(this.dataset.variantPrice) || 0;
      /* Value of this add-to-cart line (always include default qty so empty-cart preview works). */
      return Math.max(0, qty * unit);
    }
    if (ctx === 'bulk-modal') {
      const inner = findBulkDiscountHost(this);
      const grid = inner?.querySelector('[data-at-bulk-grid]');
      if (!grid) return 0;
      let sum = 0;
      grid.querySelectorAll('[data-at-bulk-qty]').forEach((inp) => {
        if (!(inp instanceof HTMLInputElement)) return;
        const q = parseInt(inp.value, 10) || 0;
        const p = parseInt(inp.getAttribute('data-at-bulk-variant-price') || '0', 10) || 0;
        sum += q * p;
      });
      return sum > 0 ? sum : 0;
    }
    return 0;
  }

  render() {
    const m = this.#milestones;
    const n = m.length;
    if (n === 0) {
      this.innerHTML = '';
      return;
    }

    const subtotal = this.#subtotal;
    const pending = this.#getPendingCents();
    const projected = subtotal + pending;
    const ctx = this.dataset.context || 'cart';
    /** Cart page/drawer: actual cart only. PDP / bulk: include form line so preview matches “after add”. */
    const previewBasis = ctx === 'cart' ? subtotal : projected;

    let highestPreview = -1;
    for (let i = 0; i < n; i++) {
      if (previewBasis >= m[i].threshold) highestPreview = i;
    }

    const actualPct = this.#amountToPercent(subtotal);
    const projectedPct = ctx !== 'cart' ? this.#amountToPercent(projected) : actualPct;
    /** Layer pending from 0 → projectedPct (smooth width transition); committed fill on top masks 0 → actualPct. */
    const showPendingLayer =
      ctx !== 'cart' && pending > 0 && projectedPct > actualPct + 0.001;

    /** First milestone not yet reached at preview level — drives top “add more” toward that tier. */
    let targetIdx = -1;
    for (let i = 0; i < n; i++) {
      if (projected < m[i].threshold) {
        targetIdx = i;
        break;
      }
    }

    /** Top row: “Add {{ amount }} more for {{ benefit }}” — always use projected so crossing a tier advances to the next goal. */
    let topAddMoreHtml = '';
    if (targetIdx >= 0) {
      const need = m[targetIdx].threshold - projected;
      if (need > 0) {
        const amount = this.#moneyWhole(need);
        const benefit = m[targetIdx].name;
        const tpl = this.#i18n.add_more_for || '';
        topAddMoreHtml = applyLiquidPlaceholders(tpl, { amount, benefit });
      }
    }

    /** Bottom: tier messaging uses preview on PDP/bulk (pre–add-to-cart), cart subtotal on cart. */
    let achievementHtml = '';
    if (highestPreview === n - 1) {
      achievementHtml = `<span class="at-dp__achievement-icon" aria-hidden="true">✓</span>${this.#i18n.max_tier_reached || ''}`;
    } else if (highestPreview >= 0) {
      const tier = m[highestPreview].name;
      const benefit = m[highestPreview].benefitShort;
      const tpl = this.#i18n.tier_unlocked || '';
      achievementHtml = `<span class="at-dp__achievement-icon" aria-hidden="true">✓</span>${applyLiquidPlaceholders(tpl, { tier, benefit })}`;
    } else {
      achievementHtml = this.#i18n.achievement_none || '';
    }

    const uid = this.dataset.sectionUid || 'at-dp';
    const panelId = `at-dp-panel-${uid}`;
    const nonSaleUrl = (this.dataset.nonSaleUrl || '').trim();

    let nextTierIdx = -1;
    for (let i = 0; i < n; i++) {
      if (previewBasis < m[i].threshold) {
        nextTierIdx = i;
        break;
      }
    }

    const benefitsRow = m
      .map((ms, i) => {
        const left = n === 1 ? 0 : (i / (n - 1)) * 100;
        const active = previewBasis >= ms.threshold ? ' at-dp__benefit--active' : '';
        return `<span class="at-dp__benefit${active}" style="left:${left}%">${ms.benefitLabel}</span>`;
      })
      .join('');

    const dots = m
      .map((ms, i) => {
        const left = n === 1 ? 0 : (i / (n - 1)) * 100;
        let cls = 'at-dp__dot';
        if (previewBasis >= ms.threshold) cls += ' at-dp__dot--reached';
        else if (nextTierIdx === i) cls += ' at-dp__dot--next';
        return `<span class="${cls}" style="left:${left}%"></span>`;
      })
      .join('');

    const amounts = m
      .map((ms, i) => {
        const left = n === 1 ? 0 : (i / (n - 1)) * 100;
        const active = previewBasis >= ms.threshold ? ' at-dp__amount--active' : '';
        return `<span class="at-dp__amount${active}" style="left:${left}%">${this.#moneyWhole(ms.threshold)}</span>`;
      })
      .join('');

    const previewNote =
      ctx !== 'cart' && pending > 0 && (ctx === 'product' || ctx === 'bulk-modal')
        ? `<p class="at-dp__preview-note">${this.#i18n.preview_helper || ''}</p>`
        : '';

    const qualifyingLink =
      nonSaleUrl !== ''
        ? `<p class="at-dp__panel-line"><a href="${nonSaleUrl}">${this.#i18n.browse_qualifying || 'Shop qualifying items'}</a></p>`
        : '';

    const headerBlock = topAddMoreHtml
      ? `<div class="at-dp__header"><p class="at-dp__nudge-top" role="status" aria-live="polite">${topAddMoreHtml}</p></div>`
      : '';

    const achievementBlock = `
      <p class="at-dp__achievement" role="status" aria-live="polite">
        <span class="at-dp__achievement-text">${achievementHtml}</span>
        <span class="at-dp__tip at-dp__info-wrap at-dp__info-wrap--sup">
          <button
            type="button"
            class="at-dp__info-ref button-unstyled"
            aria-expanded="false"
            aria-controls="${panelId}"
            aria-label="${this.#i18n.info_open || 'Discount details'}"
          >
            ${INFO_ICON_SVG}
          </button>
          <div
            class="at-dp__panel at-dp__panel--sup"
            id="${panelId}"
            hidden
            role="region"
            aria-label="${this.#i18n.info_open || ''}"
          >
            <p class="at-dp__panel-line">${this.#i18n.non_sale_disclaimer || ''}</p>
            ${qualifyingLink}
            ${previewNote}
            <button type="button" class="at-dp__close-panel button-unstyled">
              ${this.#i18n.info_close || 'Close'}
            </button>
          </div>
        </span>
      </p>
    `;

    this.innerHTML = `
      <div class="at-dp">
        ${headerBlock}
        <div class="at-dp__benefits">${benefitsRow}</div>
        <div class="at-dp__track-wrap">
          <div class="at-dp__track">
            ${
              showPendingLayer
                ? `<div class="at-dp__fill at-dp__fill--pending" style="width:${projectedPct}%"></div>`
                : ''
            }
            <div class="at-dp__fill at-dp__fill--committed" style="width:${actualPct}%"></div>
          </div>
          <div class="at-dp__dots">${dots}</div>
          <div class="at-dp__amounts">${amounts}</div>
        </div>
        ${achievementBlock}
      </div>
    `;

    const infoBtn = this.querySelector('.at-dp__info-ref');
    const panel = this.querySelector('.at-dp__panel');
    const closeBtn = this.querySelector('.at-dp__close-panel');
    const infoWrap = this.querySelector('.at-dp__info-wrap--sup');

    const togglePanel = (open) => {
      if (!(panel instanceof HTMLElement) || !(infoBtn instanceof HTMLElement)) return;
      panel.hidden = !open;
      infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeBtn?.focus?.();
    };

    infoBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!(panel instanceof HTMLElement)) return;
      togglePanel(panel.hidden);
    });

    closeBtn?.addEventListener('click', () => togglePanel(false));

    infoBtn?.addEventListener('mouseenter', () => {
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        if (panel instanceof HTMLElement && panel.hidden) togglePanel(true);
      }
    });

    infoWrap?.addEventListener('mouseleave', () => {
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        if (panel instanceof HTMLElement && !panel.matches(':focus-within')) togglePanel(false);
      }
    });
  }
}

if (!customElements.get('at-discount-progress-bar')) {
  customElements.define('at-discount-progress-bar', AtDiscountProgressBar);
}
