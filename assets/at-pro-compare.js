/**
 * Ashley's Pro PDP: actual Member vs Pro price cards (sections/at-pro-price-compare).
 *
 * Signed-in Members and Pros only. Asks Wagner's signed app proxy route for the customer's own
 * comparison and renders what it returns. The theme never computes, estimates or stores a tier
 * price: every figure (prices, savings per garment, percent, order savings) comes from Wagner,
 * which reads the tier prices it publishes to the Shopify Member and Pro catalogs. Shopify signs
 * the proxied request and adds `logged_in_customer_id`, so Wagner decides who may see what.
 *
 *   GET /apps/wagner/pro-compare?limit=4&quantity=72&min_savings=5&curated=<handle>&recent=<ids>
 *
 * Proposed response (docs/pro-membership-pdp.md, "Price comparison route"):
 *   { "currency": "USD", "items": [{ "source": "ordered|favorite|recent|curated",
 *     "url": "/products/…?variant=…", "title", "brand", "style", "color", "size", "image",
 *     "member": "78.38", "pro": "67.04", "save": "11.34", "save_pct": "14.5",
 *     "quantity": 72, "save_quantity": "816.48" }] }
 *
 * Anything else (route not live, signed out, error, timeout, no qualifying styles, a malformed
 * item) shows the section's non-numeric explanation instead. Never a guessed price.
 */

const TIMEOUT_MS = 8000;
const RECENT_KEY = 'viewedProducts'; // assets/recently-viewed-products.js

/** Layout preview for the theme editor only (data-preview). Clearly labeled sample figures. */
const SAMPLE = {
  currency: 'USD',
  items: [
    { source: 'ordered', url: '#', title: 'Sample premium fleece hoodie', brand: 'Sample brand', color: 'Heather Navy', size: 'L', image: '', member: '38.00', pro: '33.25', save: '4.75', save_pct: '12.5', quantity: 72, save_quantity: '342.00' },
    { source: 'favorite', url: '#', title: 'Sample performance polo', brand: 'Sample brand', color: 'Black', size: 'M', image: '', member: '24.00', pro: '21.50', save: '2.50', save_pct: '10.4', quantity: 72, save_quantity: '180.00' },
    { source: 'curated', url: '#', title: 'Sample specialty tee', brand: 'Sample brand', color: 'Sage', size: 'L', image: '', member: '9.80', pro: '9.05', save: '0.75', save_pct: '7.7', quantity: 72, save_quantity: '54.00' },
  ],
};

const DECIMAL = /^\d{1,7}(\.\d{1,2})?$/;
const PERCENT = /^\d{1,2}(\.\d)?$/;

class AtProPriceCompare extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    this.strings = this.#readStrings();
    if (this.hasAttribute('data-preview')) {
      this.#render(SAMPLE, true);
      return;
    }
    this.#load();
  }

  #readStrings() {
    try {
      return JSON.parse(this.querySelector('[data-strings]')?.textContent || '{}');
    } catch {
      return {};
    }
  }

  async #load() {
    const params = new URLSearchParams({
      limit: this.dataset.limit || '4',
      quantity: this.dataset.quantity || '72',
      min_savings: this.dataset.minSavings || '5',
    });
    if (this.dataset.curated) params.set('curated', this.dataset.curated);
    const recent = this.#recentIds();
    if (recent.length) params.set('recent', recent.join(','));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${this.dataset.endpoint}?${params}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes('application/json')) throw new Error('unavailable');
      this.#render(await response.json(), false);
    } catch {
      this.#fallback();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Product ids only (digits), from the theme's own recently viewed list. */
  #recentIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(ids) ? ids.map(String).filter((id) => /^\d{1,20}$/.test(id)).slice(0, 8) : [];
    } catch {
      return [];
    }
  }

  /** @param {any} data @param {boolean} sample */
  #render(data, sample) {
    const currency = typeof data?.currency === 'string' && /^[A-Z]{3}$/.test(data.currency) ? data.currency : '';
    if (!currency || currency !== this.dataset.currency) return this.#fallback();
    const items = (Array.isArray(data.items) ? data.items : []).filter((item) => this.#valid(item, sample));
    const limit = Number(this.dataset.limit) || 4;
    if (!items.length) return this.#fallback();

    const money = new Intl.NumberFormat(this.dataset.locale || undefined, { style: 'currency', currency });
    const list = /** @type {HTMLElement} */ (this.querySelector('[data-cards]'));
    const template = /** @type {HTMLTemplateElement} */ (this.querySelector('template[data-card]'));
    list.replaceChildren();
    for (const item of items.slice(0, limit)) list.append(this.#card(template, item, money, sample));
    list.style.setProperty('--at-pro-cards', String(Math.min(items.length, limit)));
    list.hidden = false;
    const footnote = this.querySelector('[data-footnote]');
    if (footnote) footnote.hidden = false;
    this.#done();
  }

  /** Every figure must be present and consistent; a doubtful item is dropped, not repaired. */
  #valid(item, sample) {
    if (!item || typeof item !== 'object') return false;
    const fields = ['member', 'pro', 'save', 'save_quantity'];
    if (!fields.every((key) => typeof item[key] === 'string' && DECIMAL.test(item[key]))) return false;
    if (typeof item.save_pct !== 'string' || !PERCENT.test(item.save_pct)) return false;
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) return false;
    const member = Number(item.member);
    const pro = Number(item.pro);
    if (!(pro > 0 && member > pro)) return false;
    if (Math.abs(member - pro - Number(item.save)) > 0.005) return false;
    if (typeof item.title !== 'string' || !item.title) return false;
    if (sample) return true;
    return typeof item.url === 'string' && item.url.startsWith('/') && !item.url.startsWith('//');
  }

  #card(template, item, money, sample) {
    const node = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
    const $ = (selector) => /** @type {HTMLElement} */ (node.querySelector(selector));
    const s = this.strings;

    node.querySelectorAll('[data-link]').forEach((link) => {
      if (sample) link.removeAttribute('href');
      else link.setAttribute('href', item.url);
    });
    $('[data-title]').textContent = item.title;
    const brand = [item.brand, item.style].filter((v) => typeof v === 'string' && v).join(' ');
    if (brand) $('[data-brand]').textContent = brand;
    else $('[data-brand]').remove();

    const source = sample ? s.sample : s.sources?.[item.source];
    if (source) $('[data-source]').textContent = source;
    else $('[data-source]').remove();

    if (item.color && item.size && s.variant) {
      $('[data-variant]').textContent = s.variant.replace('[color]', () => item.color).replace('[size]', () => item.size);
    } else {
      $('[data-variant]').textContent = [item.color, item.size].filter(Boolean).join(' · ');
    }

    const image = /** @type {HTMLImageElement} */ ($('[data-image]'));
    const src = this.#imageUrl(item.image);
    if (src) image.src = src;
    else image.remove();

    $('[data-save]').textContent = (s.save || 'Save [amount]').replace('[amount]', () => money.format(Number(item.save)));
    $('[data-percent]').textContent = (s.percent || '[percent] less').replace('[percent]', () => `${Number(item.save_pct)}%`);
    $('[data-member]').textContent = money.format(Number(item.member));
    $('[data-pro]').textContent = money.format(Number(item.pro));
    $('[data-qty-label]').textContent = (s.order || 'On [quantity] pieces').replace('[quantity]', () => String(item.quantity));
    $('[data-qty-save]').textContent = money.format(Number(item.save_quantity));
    return node;
  }

  /** Shopify CDN images only, sized for the compact card. */
  #imageUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value, window.location.origin);
      const shopify = url.hostname === 'cdn.shopify.com' || (url.origin === window.location.origin && url.pathname.startsWith('/cdn/'));
      if (url.protocol !== 'https:' || !shopify) return '';
      url.searchParams.set('width', '240');
      return url.toString();
    } catch {
      return '';
    }
  }

  #fallback() {
    const list = this.querySelector('[data-cards]');
    if (list) {
      list.replaceChildren();
      list.hidden = true;
    }
    const footnote = this.querySelector('[data-footnote]');
    if (footnote) footnote.hidden = true;
    const fallback = this.querySelector('[data-fallback]');
    if (fallback) fallback.hidden = false;
    this.#done();
  }

  #done() {
    this.querySelector('[data-status]')?.remove();
    this.removeAttribute('aria-busy');
  }
}

if (!customElements.get('at-pro-price-compare')) customElements.define('at-pro-price-compare', AtProPriceCompare);
