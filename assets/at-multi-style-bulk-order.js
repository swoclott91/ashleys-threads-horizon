/**
 * AT Multi-style bulk order: style selector (sections/at-multi-style-bulk-order.liquid).
 *
 * Rows, colors, labels and tab counts are rendered in Liquid. This module adds the filter
 * tabs, the "Selected styles" panel and the hand-off to the quantities dialog. It has no
 * imports so its pure helpers can be tested in Node (scripts/test-at-multi-style-bulk-order.cjs).
 *
 * ── Hand-off contract for the quantities dialog ──────────────────────────────────────────
 *
 * Element: <at-multi-style-bulk-order> (one per section; `data-section-id` = section.id).
 *
 * Event: `at-bulk-order:choose-quantities` (CHOOSE_QUANTITIES_EVENT), a CustomEvent fired
 * on the element when "Choose quantities" is pressed with at least one style selected.
 * It bubbles, is composed and is cancelable. `event.detail`:
 *
 *   {
 *     sectionId: string,
 *     styles: Array<{
 *       productId: string,            // decimal string, e.g. "8123456789012"
 *       productUrl: string,           // storefront path from `product.url`, e.g. "/products/gildan-5000"
 *       title: string,
 *       imageUrl: string,             // Shopify CDN URL (may be protocol-relative) or ""
 *       colorOptionPosition: number,  // 1-based position of the Color/Colour option
 *       sources: Array<'purchase' | 'favorite'>,
 *       colors: Array<{
 *         optionValueId: string,      // decimal string product_option_value ID
 *         name: string,               // e.g. "Black"
 *         swatchBackground: string | null, // CSS background, "rgb(…)" or "url(…)", null if none
 *         sources: Array<'favorite' | 'purchase'>,
 *       }>,
 *     }>,
 *   }
 *
 * Styles are in the order the shopper selected them; colors are in the product's option
 * order and are the union of favorited and purchased colors (only colors that still exist).
 * All sizes of each color are for the dialog to load:
 *
 *   import { fetchBulkVariantBatch } from '@theme/at-bulk-transport';
 *   await fetchBulkVariantBatch(style.productUrl, [color.optionValueId]);
 *
 * `productUrl` is a same-origin storefront path (what that function requires; it adds the
 * locale root and preview_theme_id itself) and `optionValueId` is a decimal string.
 * Note: sections/at-bulk-grid-data.liquid treats the second option as the varying one, so a
 * single-ID batch lists all sizes only when color is option 1 (`colorOptionPosition === 1`).
 * Check `colorOptionPosition` and handle other layouts explicitly.
 *
 * The dialog claims the hand-off by calling `event.preventDefault()`. If no listener does,
 * the selector shows a short notice in the panel ("Choosing quantities isn't available
 * yet.") and logs the payload with console.info, so the button is never a dead click.
 *
 * The same data is available without the event:
 *   element.selection        -> the `styles` array above (fresh copy each read)
 *   element.getSelection()   -> same as `selection`
 *   element.clearSelection() -> unchecks every style (e.g. after a successful cart add)
 *   element.selectStyles(ids)-> checks these product IDs (keeps any already checked) and
 *                               returns the IDs it found; used by Review & reorder
 *   element.setFilter(name)  -> shows the 'all' | 'purchase' | 'favorite' tab
 *
 * Deep links: `?tab=purchase` or `?tab=favorite` (also the plurals) opens with that tab
 * shown. It only filters; nothing is preselected. `?reorder=<order>` is handled by the
 * quantities dialog (assets/at-multi-style-quantities.js), which calls selectStyles.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export const CHOOSE_QUANTITIES_EVENT = 'at-bulk-order:choose-quantities';
export const FILTERS = Object.freeze(['all', 'purchase', 'favorite']);

export const TAB_PARAM = 'tab';
const SOURCE_ORDER = ['purchase', 'favorite'];
const TAB_ALIASES = { purchases: 'purchase', favorites: 'favorite' };
const isDecimalId = (id) => typeof id === 'string' && /^[1-9]\d*$/.test(id);

/** Splits a space-separated sources attribute into known sources, deduplicated and ordered. */
export function parseSources(value, order = SOURCE_ORDER) {
  const found = new Set(String(value ?? '').split(/\s+/).filter(Boolean));
  return order.filter((source) => found.has(source));
}

/** The tab named by `?tab=` ('purchase' | 'favorite'), or null to keep the default (All). */
export function initialFilter(search) {
  let value = '';
  try {
    value = new URLSearchParams(search ?? '').get(TAB_PARAM) ?? '';
  } catch {
    return null;
  }
  value = value.trim().toLowerCase();
  value = TAB_ALIASES[value] ?? value;
  return value !== 'all' && FILTERS.includes(value) ? value : null;
}

/** Whether a row with these sources shows under a filter tab. */
export function matchesFilter(sources, filter) {
  if (filter === 'all' || !FILTERS.includes(filter)) return true;
  return sources.includes(filter);
}

/**
 * Normalizes one style read from the markup. Drops colors with invalid IDs, merges duplicate
 * colors (unioning their sources) and returns null for a style that cannot be loaded.
 * @param {object} raw
 */
export function normalizeStyle(raw) {
  const productId = String(raw?.productId ?? '');
  const productUrl = String(raw?.productUrl ?? '');
  if (!isDecimalId(productId) || !productUrl.startsWith('/')) return null;

  const colors = new Map();
  for (const color of raw.colors ?? []) {
    const optionValueId = String(color?.optionValueId ?? '');
    if (!isDecimalId(optionValueId)) continue;
    const sources = parseSources(Array.isArray(color.sources) ? color.sources.join(' ') : color.sources,
      ['favorite', 'purchase']);
    const existing = colors.get(optionValueId);
    if (existing) {
      existing.sources = ['favorite', 'purchase'].filter((s) => existing.sources.includes(s) || sources.includes(s));
      continue;
    }
    colors.set(optionValueId, {
      optionValueId,
      name: String(color.name ?? ''),
      swatchBackground: color.swatchBackground ? String(color.swatchBackground) : null,
      sources,
    });
  }
  if (!colors.size) return null;

  const position = Number(raw.colorOptionPosition);
  const rowSources = parseSources(Array.isArray(raw.sources) ? raw.sources.join(' ') : raw.sources);
  return {
    productId,
    productUrl,
    title: String(raw.title ?? ''),
    imageUrl: String(raw.imageUrl ?? ''),
    colorOptionPosition: Number.isInteger(position) && position > 0 ? position : 1,
    sources: rowSources,
    colors: [...colors.values()],
  };
}

/** Ordered set of selected product IDs. Selection order is kept for the panel and payload. */
export class StyleSelection {
  #ids = [];

  get ids() {
    return [...this.#ids];
  }

  get size() {
    return this.#ids.length;
  }

  has(id) {
    return this.#ids.includes(String(id));
  }

  set(id, selected) {
    const key = String(id);
    const index = this.#ids.indexOf(key);
    if (selected && index === -1) this.#ids.push(key);
    if (!selected && index !== -1) this.#ids.splice(index, 1);
    return this;
  }

  clear() {
    this.#ids.length = 0;
    return this;
  }

  /** Styles for the selected IDs, in selection order, skipping unknown IDs. */
  resolve(stylesById) {
    return this.#ids.map((id) => stylesById.get(id)).filter(Boolean);
  }
}

/** Deep copy so consumers cannot mutate the selector's own data. */
export function clonePayloadStyles(styles) {
  return styles.map((style) => ({
    ...style,
    sources: [...style.sources],
    colors: style.colors.map((color) => ({ ...color, sources: [...color.sources] })),
  }));
}

export function formatCount(strings, count, locale) {
  let rule = 'other';
  try {
    rule = new Intl.PluralRules(locale || undefined).select(count);
  } catch {
    rule = count === 1 ? 'one' : 'other';
  }
  const template = rule === 'one' ? strings.selectedOne : strings.selectedOther;
  return String(template ?? '').replace('[count]', () => String(count));
}

function readStyle(row) {
  return normalizeStyle({
    productId: row.dataset.productId,
    productUrl: row.dataset.productUrl,
    title: row.dataset.title,
    imageUrl: row.dataset.imageUrl,
    colorOptionPosition: row.dataset.colorPosition,
    sources: row.dataset.sources,
    colors: Array.from(row.querySelectorAll('[data-at-style-color]'), (item) => ({
      optionValueId: item.dataset.optionValueId,
      name: item.dataset.name,
      swatchBackground: item.dataset.swatch || null,
      sources: item.dataset.sources,
    })),
  });
}

function defineElement() {
  class MultiStyleBulkOrder extends HTMLElement {
    #listeners;
    #selection = new StyleSelection();
    #styles = new Map();
    #rows = new Map();
    #strings = {};

    connectedCallback() {
      this.#listeners?.abort();
      this.#listeners = new AbortController();
      const { signal } = this.#listeners;

      try {
        this.#strings = JSON.parse(this.querySelector('script[data-at-msbo-strings]')?.textContent || '{}');
      } catch {
        this.#strings = {};
      }

      this.#styles.clear();
      this.#rows.clear();
      this.#selection.clear();
      for (const row of this.querySelectorAll('[data-at-style]')) {
        const style = readStyle(row);
        const checkbox = row.querySelector('[data-at-style-checkbox]');
        if (!style || !checkbox) {
          row.hidden = true;
          continue;
        }
        this.#styles.set(style.productId, style);
        this.#rows.set(style.productId, row);
        // Browsers may restore checkbox state on back/forward navigation.
        if (checkbox.checked) this.#selection.set(style.productId, true);
      }

      this.addEventListener('change', this.#onChange, { signal });
      this.addEventListener('click', this.#onClick, { signal });
      this.#watchFavorites(signal);
      const linked = initialFilter(window.location.search);
      if (linked) this.#checkFilter(linked);
      this.#applyFilter(this.#currentFilter());
      this.#renderPanel({ announce: false });
    }

    disconnectedCallback() {
      this.#listeners?.abort();
    }

    get selection() {
      return clonePayloadStyles(this.#selection.resolve(this.#styles));
    }

    getSelection() {
      return this.selection;
    }

    clearSelection() {
      for (const id of this.#selection.ids) this.#checkbox(id).checked = false;
      this.#selection.clear();
      this.#renderPanel({ announce: true });
    }

    selectStyles(ids) {
      const found = [];
      for (const id of ids ?? []) {
        const key = String(id);
        const checkbox = this.#checkbox(key);
        if (!checkbox || !this.#styles.has(key)) continue;
        checkbox.checked = true;
        this.#selection.set(key, true);
        found.push(key);
      }
      this.#renderPanel({ announce: found.length > 0 });
      return found;
    }

    setFilter(filter) {
      if (!FILTERS.includes(filter)) return;
      this.#checkFilter(filter);
      this.#applyFilter(filter);
    }

    #checkFilter(filter) {
      const radio = this.querySelector(`[data-at-msbo-filters] input[type="radio"][value="${filter}"]`);
      if (radio instanceof HTMLInputElement) radio.checked = true;
    }

    #checkbox(id) {
      return this.#rows.get(id)?.querySelector('[data-at-style-checkbox]');
    }

    #currentFilter() {
      return this.querySelector('[data-at-msbo-filters] input[type="radio"]:checked')?.value || 'all';
    }

    #onChange = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.matches('[data-at-style-checkbox]')) {
        if (!this.#styles.has(target.value)) return;
        this.#selection.set(target.value, target.checked);
        this.#renderPanel({ announce: true });
      } else if (target.type === 'radio' && target.closest('[data-at-msbo-filters]')) {
        this.#applyFilter(target.value);
      }
    };

    #onClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const remove = target?.closest('[data-at-msbo-remove]');
      if (remove) {
        this.#remove(remove.dataset.productId);
        return;
      }
      if (target?.closest('[data-at-msbo-choose]')) this.#chooseQuantities();
    };

    /**
     * The shared heart (assets/at-favorite-colors.js) flips aria-pressed when a color is
     * saved or removed, including the optimistic toggle and its revert. Mirror that onto
     * the row so the label, the Favorites tab and its count update without a reload.
     */
    #watchFavorites(signal) {
      if (typeof MutationObserver === 'undefined') return;
      const observer = new MutationObserver((records) => {
        const rows = new Set();
        for (const record of records) {
          const button = record.target;
          if (!(button instanceof Element) || !button.closest('at-favorite-color')) continue;
          const color = button.closest('[data-at-style-color]');
          const row = button.closest('[data-at-style]');
          if (!color || !row) continue;
          const sources = parseSources(color.dataset.sources, ['favorite', 'purchase'])
            .filter((source) => source !== 'favorite');
          if (button.getAttribute('aria-pressed') === 'true') sources.unshift('favorite');
          color.dataset.sources = sources.join(' ');
          rows.add(row);
        }
        if (!rows.size) return;
        for (const row of rows) this.#refreshRowSources(row);
        this.#applyFilter(this.#currentFilter());
      });
      observer.observe(this, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
      signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    }

    #refreshRowSources(row) {
      const id = row.dataset.productId;
      if (!this.#styles.has(id)) return;
      const colors = Array.from(row.querySelectorAll('[data-at-style-color]'));
      const has = (source) => colors.some((item) => String(item.dataset.sources).split(/\s+/).includes(source));
      const sources = ['purchase', 'favorite'].filter(has);
      row.dataset.sources = sources.join(' ');
      row.toggleAttribute('data-row-favorite', sources.includes('favorite'));
      row.toggleAttribute('data-row-purchase', sources.includes('purchase'));
      const label = row.querySelector('[data-at-msbo-sources]');
      if (label) {
        label.textContent = sources
          .map((source) => (source === 'purchase' ? this.#strings.sourcePurchase : this.#strings.sourceFavorite))
          .filter(Boolean)
          .join(' · ');
      }
      const style = readStyle(row);
      if (style) this.#styles.set(id, style);
      for (const source of ['purchase', 'favorite']) {
        const count = this.querySelector(`[data-at-msbo-filter-count="${source}"]`);
        if (!count) continue;
        let total = 0;
        for (const item of this.#styles.values()) if (item.sources.includes(source)) total += 1;
        count.textContent = String(total);
      }
    }

    #applyFilter(filter) {
      let visible = 0;
      for (const [id, row] of this.#rows) {
        const show = matchesFilter(this.#styles.get(id).sources, filter);
        row.hidden = !show;
        if (show) visible += 1;
      }
      for (const empty of this.querySelectorAll('[data-at-msbo-empty]')) {
        empty.hidden = !(visible === 0 && empty.dataset.atMsboEmpty === filter);
      }
    }

    #remove(id) {
      const ids = this.#selection.ids;
      const index = ids.indexOf(id);
      if (index === -1) return;
      const checkbox = this.#checkbox(id);
      if (checkbox) checkbox.checked = false;
      this.#selection.set(id, false);
      this.#renderPanel({ announce: true });
      // Keep focus in the panel: next remove button, else previous, else the row's checkbox.
      const buttons = this.querySelectorAll('[data-at-msbo-remove]');
      const next = buttons[Math.min(index, buttons.length - 1)];
      if (next instanceof HTMLElement) next.focus();
      else if (checkbox && !this.#rows.get(id)?.hidden) checkbox.focus();
      else this.querySelector('[data-at-msbo-choose]')?.focus();
    }

    #renderPanel({ announce }) {
      const styles = this.#selection.resolve(this.#styles);
      const list = this.querySelector('[data-at-msbo-selected]');
      const empty = this.querySelector('[data-at-msbo-selected-empty]');
      const count = this.querySelector('[data-at-msbo-count]');
      const status = this.querySelector('[data-at-msbo-status]');
      const choose = this.querySelector('[data-at-msbo-choose]');
      const notice = this.querySelector('[data-at-msbo-notice]');

      if (list) {
        list.replaceChildren(...styles.map((style) => {
          const item = document.createElement('li');
          item.className = 'at-msbo__selected-item';
          const title = document.createElement('span');
          title.className = 'at-msbo__selected-title';
          title.textContent = style.title;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'at-msbo__remove button-unstyled';
          button.dataset.atMsboRemove = '';
          button.dataset.productId = style.productId;
          button.setAttribute('aria-label',
            String(this.#strings.removeStyle ?? '').replace('[title]', () => style.title));
          button.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">'
            + '<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
          item.append(title, button);
          return item;
        }));
      }
      if (empty) empty.hidden = styles.length > 0;
      if (count) count.textContent = String(styles.length);
      if (choose) choose.disabled = styles.length === 0;
      if (notice) notice.textContent = '';
      if (status && announce) {
        status.textContent = formatCount(this.#strings, styles.length, document.documentElement.lang);
      }
    }

    #chooseQuantities() {
      const styles = this.selection;
      if (!styles.length) return;
      const event = new CustomEvent(CHOOSE_QUANTITIES_EVENT, {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { sectionId: this.dataset.sectionId ?? '', styles },
      });
      this.dispatchEvent(event);
      if (event.defaultPrevented) return;

      // No quantities dialog yet: say so instead of a dead click.
      const notice = this.querySelector('[data-at-msbo-notice]');
      if (notice) notice.textContent = this.#strings.quantitiesUnavailable ?? '';
      console.info(`[at-multi-style-bulk-order] No listener handled ${CHOOSE_QUANTITIES_EVENT}.`, event.detail);
    }
  }

  if (!customElements.get('at-multi-style-bulk-order')) {
    customElements.define('at-multi-style-bulk-order', MultiStyleBulkOrder);
  }
}

if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') defineElement();
