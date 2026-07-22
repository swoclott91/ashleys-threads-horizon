import { QuantitySelectorUpdateEvent, ThemeEvents } from '@theme/events';
import { StandardEvents } from '@shopify/events';
import { formatMoney } from '@theme/money-formatting';
import { isClickedOutside } from '@theme/utilities';

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

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Decode entities so copy from `data-i18n` (Liquid `| escape` on the attribute) is not double-encoded.
 * @param {string} s
 */
function decodeHtmlEntities(s) {
  if (!s) return '';
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

/** Theme i18n + safe placeholders: decode then escape for innerHTML text nodes. */
function textForInnerHtml(s) {
  return escapeHtml(decodeHtmlEntities(String(s)));
}

/** Decode then escape `"` and `&` for use inside double-quoted HTML attributes (e.g. aria-label). */
function escapeAttr(s) {
  return decodeHtmlEntities(String(s || ''))
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} tpl
 * @param {string} amount
 * @param {string} benefit
 */
function cartCondensedStatusRich(tpl, amount, benefit) {
  if (!tpl) return '';
  const amt = escapeHtml(amount);
  const ben = escapeHtml(benefit);
  const benSpan = `<span class="at-dp__cart-status-goal">${ben}</span>`;
  const tplDecoded = decodeHtmlEntities(tpl);
  let s = applyLiquidPlaceholders(tplDecoded, { amount: '__AT_DP_AMT__', benefit: '__AT_DP_BEN__' });
  if (s.includes('__AT_DP_AMT__') || s.includes('__AT_DP_BEN__')) {
    return textForInnerHtml(applyLiquidPlaceholders(tplDecoded, { amount, benefit }));
  }
  s = s.split('__AT_DP_AMT__').join(amt);
  s = s.split('__AT_DP_BEN__').join(benSpan);
  return s;
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
  static observedAttributes = [
    'data-subtotal',
    'data-milestones',
    'data-i18n',
    'data-money-format',
    'data-currency',
    'data-product-id',
    'data-variant-price',
    'data-non-sale-url',
    'data-context',
    'data-section-uid',
  ];

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

  /**
   * Section re-renders (cart change, quantity updates) morph this node against SSR: empty children + fresh data-*.
   * We use data-skip-subtree-update so morph does not delete our rendered UI; when attrs copy over, re-render.
   */
  attributeChangedCallback(_name, oldVal, newVal) {
    if (oldVal === newVal) return;
    this.#parseAttributes();
    if (this.isConnected) this.render();
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
    document.addEventListener(StandardEvents.cartLinesUpdate, this.#onCartOrDiscount);
    document.addEventListener(StandardEvents.cartDiscountUpdate, this.#onCartOrDiscount);
    document.addEventListener(StandardEvents.productSelect, this.#onVariantUpdate);
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
    document.removeEventListener(StandardEvents.cartLinesUpdate, this.#onCartOrDiscount);
    document.removeEventListener(StandardEvents.cartDiscountUpdate, this.#onCartOrDiscount);
    document.removeEventListener(StandardEvents.productSelect, this.#onVariantUpdate);
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
    const promise = /** @type {{ promise?: Promise<unknown> }} */ (e).promise;
    if (promise) {
      promise
        .then(() => {
          void this.#applyCartResource(undefined);
        })
        .catch(() => {
          void this.#applyCartResource(undefined);
        });
      return;
    }
    void this.#applyCartResource(undefined);
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
    const promise = /** @type {{ promise?: Promise<{ detail?: { productId?: string, resource?: { price?: number } } }> }} */ (e)
      .promise;
    if (!promise) return;
    promise
      .then((result) => {
        const productId = result?.detail?.productId;
        if (productId != null && String(productId) !== String(this.dataset.productId)) return;
        const price = result?.detail?.resource?.price;
        if (typeof price === 'number') {
          this.dataset.variantPrice = String(price);
          this.render();
        }
      })
      .catch(() => {});
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

  /**
   * @param {ParentNode} scope
   */
  #mountTemplateIcons(scope) {
    const uid = this.dataset.sectionUid || 'at-dp';
    scope.querySelectorAll('[data-at-dp-mount]').forEach((el) => {
      const kind = el.getAttribute('data-at-dp-mount');
      if (kind !== 'truck' && kind !== 'check' && kind !== 'lock' && kind !== 'close') return;
      const tpl = document.getElementById(`at-dp-${kind}-${uid}`);
      const node = tpl?.content?.firstElementChild;
      if (!(node instanceof HTMLElement)) return;
      el.replaceWith(node.cloneNode(true));
    });
  }

  /**
   * @param {{
   *   m: Array<{ threshold: number; name: string; benefitShort: string; benefitLabel: string; kind?: string }>;
   *   n: number;
   *   previewBasis: number;
   *   nextTierIdx: number;
   *   uid: string;
   *   nonSaleUrl: string;
   * }} p
   */
  #renderCartCondensed(p) {
    const { m, n, previewBasis, nextTierIdx, uid, nonSaleUrl } = p;

    let statusInner = '';
    if (nextTierIdx < 0) {
      statusInner = textForInnerHtml(this.#i18n.max_tier_reached || '');
    } else {
      const need = m[nextTierIdx].threshold - previewBasis;
      if (need > 0) {
        const amount = this.#moneyWhole(need);
        const benefit = m[nextTierIdx].name;
        const tpl = this.#i18n.cart_condensed_status || this.#i18n.add_more_for || '';
        statusInner = cartCondensedStatusRich(tpl, amount, benefit);
      }
    }

    const fillEndIdx = nextTierIdx >= 0 ? nextTierIdx : n - 1;
    const lineActivePct = n <= 1 ? 100 : (fillEndIdx / (n - 1)) * 100;

    /**
     * Milestone labels rendered UNDER the rail (matches restyled mockup):
     * shipping → tier name ("Free shipping"); reached discount → "{{ label }} applied";
     * future / current discount → short benefit label (e.g. "15%").
     */
    const appliedTpl = this.#i18n.node_applied || '{{ label }} applied';
    const labelsHtml = m
      .map((ms, i) => {
        const left = n === 1 ? 50 : (i / (n - 1)) * 100;
        const reached = previewBasis >= ms.threshold;
        const current = nextTierIdx === i;
        const shipping = ms.kind === 'shipping';
        let cls = 'at-dp__cart-label';
        if (i === 0) cls += ' at-dp__cart-label--first';
        if (i === n - 1) cls += ' at-dp__cart-label--last';
        if (shipping) cls += ' at-dp__cart-label--shipping';
        if (reached) cls += ' at-dp__cart-label--reached';
        else if (current) cls += ' at-dp__cart-label--current';
        else cls += ' at-dp__cart-label--future';

        let labelText;
        if (shipping) {
          labelText = ms.name;
        } else if (reached) {
          labelText = applyLiquidPlaceholders(decodeHtmlEntities(appliedTpl), { label: ms.benefitLabel });
        } else {
          labelText = ms.benefitLabel;
        }
        return `<span class="${cls}" style="--at-dp-node-left:${left}%">${textForInnerHtml(labelText)}</span>`;
      })
      .join('');

    const modalListHtml = m
      .map((ms, i) => {
        const reached = previewBasis >= ms.threshold;
        const current = nextTierIdx === i;
        const shipping = ms.kind === 'shipping';

        const iconMount = reached
          ? shipping
            ? '<div class="at-dp__modal-iconwrap"><span data-at-dp-mount="truck"></span></div>'
            : '<div class="at-dp__modal-iconwrap"><span data-at-dp-mount="check"></span></div>'
          : current
            ? shipping
              ? '<div class="at-dp__modal-iconwrap at-dp__modal-iconwrap--current"><span data-at-dp-mount="truck"></span></div>'
              : '<div class="at-dp__modal-iconwrap at-dp__modal-iconwrap--current"><span class="at-dp__modal-target" aria-hidden="true"></span></div>'
            : '<div class="at-dp__modal-iconwrap"><span data-at-dp-mount="lock"></span></div>';

        let rightHtml = '';
        if (reached) {
          rightHtml = `<span class="at-dp__modal-badge">${textForInnerHtml(this.#i18n.unlocked_badge || '')}</span>`;
        } else if (current) {
          const need = m[i].threshold - previewBasis;
          const amountAway = this.#moneyWhole(Math.max(0, need));
          rightHtml = `<span class="at-dp__modal-away">${textForInnerHtml(applyLiquidPlaceholders(decodeHtmlEntities(this.#i18n.modal_away || ''), { amount: amountAway }))}</span>`;
        } else {
          rightHtml = `<span class="at-dp__modal-threshold">${textForInnerHtml(applyLiquidPlaceholders(decodeHtmlEntities(this.#i18n.modal_at || ''), { amount: this.#moneyWhole(ms.threshold) }))}</span>`;
        }

        const subRaw = reached
          ? applyLiquidPlaceholders(decodeHtmlEntities(this.#i18n.modal_unlocked_at || ''), {
              amount: this.#moneyWhole(ms.threshold),
            })
          : current
            ? applyLiquidPlaceholders(decodeHtmlEntities(this.#i18n.modal_spend_for || ''), {
                amount: this.#moneyWhole(ms.threshold),
                name: ms.name,
              })
            : '';
        const subHtml = subRaw ? `<p class="at-dp__modal-sub">${textForInnerHtml(subRaw)}</p>` : '';

        const rowCls = ['at-dp__modal-step'];
        if (reached) rowCls.push('at-dp__modal-step--reached');
        if (current) rowCls.push('at-dp__modal-step--current');
        if (!reached && !current) rowCls.push('at-dp__modal-step--locked');

        return `<li class="${rowCls.join(' ')}">
          <div class="at-dp__modal-gutter" aria-hidden="true">
            ${iconMount}
          </div>
          <div class="at-dp__modal-main">
            <div class="at-dp__modal-title-row">
              <span class="at-dp__modal-title">${textForInnerHtml(ms.name)}</span>
              ${rightHtml}
            </div>
            ${subHtml}
          </div>
        </li>`;
      })
      .join('');

    const qualifyingLink =
      nonSaleUrl !== ''
        ? `<p class="at-dp__dialog-qualify"><a href="${escapeHtml(nonSaleUrl)}">${textForInnerHtml(this.#i18n.browse_qualifying || '')}</a></p>`
        : '';

    const dialogId = `at-dp-sheet-${uid}`;
    const statusId = `at-dp-status-${uid}`;
    const expandLabelAttr = escapeAttr(this.#i18n.expand_savings_aria || '');
    const closeLabelAttr = escapeAttr(this.#i18n.close_dialog || '');

    this.innerHTML = `
      <div class="at-dp at-dp--cart-condensed">
        <button
          type="button"
          class="at-dp__cart-expand button-unstyled"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="${dialogId}"
          aria-describedby="${statusId}"
          aria-label="${expandLabelAttr}"
        >
          <span class="at-dp__cart-status" id="${statusId}" role="status" aria-live="polite">${statusInner}</span>
          <div class="at-dp__cart-railwrap" aria-hidden="true">
            <div class="at-dp__cart-line">
              <span class="at-dp__cart-line-active" style="width:${lineActivePct}%"></span>
            </div>
          </div>
          <div class="at-dp__cart-labels" aria-hidden="true">${labelsHtml}</div>
        </button>
        <dialog id="${dialogId}" class="at-dp__dialog dialog-modal">
          <div class="at-dp__dialog-panel">
            <button
              type="button"
              class="button button-unstyled close-button at-dp__dialog-close"
              aria-label="${closeLabelAttr}"
            >
              <span data-at-dp-mount="close"></span>
            </button>
            <div class="at-dp__dialog-handle" aria-hidden="true"></div>
            <h2 class="at-dp__dialog-title">${textForInnerHtml(this.#i18n.bulk_savings_title || '')}</h2>
            <p class="at-dp__dialog-lede">${textForInnerHtml(this.#i18n.bulk_savings_subtitle || '')}</p>
            <ul class="at-dp__modal-list">${modalListHtml}</ul>
            <div class="at-dp__dialog-foot">
              <p class="at-dp__dialog-note">
                <span class="at-dp__dialog-infoic" aria-hidden="true">${INFO_ICON_SVG}</span>
                <span>${textForInnerHtml(this.#i18n.modal_footer_note || '')}</span>
              </p>
              <p class="at-dp__dialog-disclaimer">${textForInnerHtml(this.#i18n.non_sale_disclaimer || '')}</p>
              ${qualifyingLink}
            </div>
            <button type="button" class="button button-secondary at-dp__dialog-got-it">${textForInnerHtml(this.#i18n.modal_got_it || '')}</button>
          </div>
        </dialog>
      </div>
    `;

    this.#mountTemplateIcons(this);

    const expandBtn = this.querySelector('.at-dp__cart-expand');
    const dlg = /** @type {HTMLDialogElement | null} */ (document.getElementById(dialogId));
    const gotIt = this.querySelector('.at-dp__dialog-got-it');
    const dialogClose = this.querySelector('.at-dp__dialog-close');

    const setOpen = (open) => {
      if (expandBtn instanceof HTMLElement) {
        expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    };

    expandBtn?.addEventListener('click', () => {
      if (dlg instanceof HTMLDialogElement) {
        dlg.showModal();
        setOpen(true);
      }
    });

    dlg?.addEventListener('click', (e) => {
      if (!(dlg instanceof HTMLDialogElement)) return;
      if (isClickedOutside(e, dlg)) dlg.close();
    });

    dialogClose?.addEventListener('click', () => {
      dlg?.close();
    });

    dlg?.addEventListener('close', () => {
      setOpen(false);
      expandBtn?.focus?.();
    });

    gotIt?.addEventListener('click', () => {
      dlg?.close();
    });
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
    /** Cart: cart subtotal only. PDP / bulk: include pending line so preview matches “after add”. */
    const previewBasis = ctx === 'cart' ? subtotal : projected;

    const uid = this.dataset.sectionUid || 'at-dp';
    const nonSaleUrl = (this.dataset.nonSaleUrl || '').trim();

    let nextTierIdx = -1;
    for (let i = 0; i < n; i++) {
      if (previewBasis < m[i].threshold) {
        nextTierIdx = i;
        break;
      }
    }

    /** Cart, drawer, bulk modals, and PDP all use the same condensed strip + “Bulk savings” sheet. */
    if (ctx === 'cart' || ctx === 'bulk-modal' || ctx === 'product') {
      this.#renderCartCondensed({
        m,
        n,
        previewBasis,
        nextTierIdx,
        uid,
        nonSaleUrl,
      });
      return;
    }

    this.innerHTML = '';
  }
}

if (!customElements.get('at-discount-progress-bar')) {
  customElements.define('at-discount-progress-bar', AtDiscountProgressBar);
}
