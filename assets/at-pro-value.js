/**
 * Ashley's Pro value calculator (docs/pro-membership-pdp.md, "Calculator math").
 *
 * The one implementation of the projection math, used by the single <at-pro-calculator> on the Pro
 * PDP (snippets/at-pro-calculator). Config comes from snippets/at-pro-config through `data-config`,
 * so the theme never hardcodes rates, caps or the fee.
 *
 * Spending basis: what the customer spends on blank apparel at standard Member prices.
 *   proSpend   = memberSpend × ratio
 *   pricing    = memberSpend − proSpend
 *   cash       = proSpend × (Pro cash rate − Member cash rate)
 *   shipping   = one credit a month, min(shipping charge, cap), only when an average restock
 *                (at Pro prices) meets the credit minimum and is below the free shipping threshold
 *                (orders that already ship free don't use the credit)
 *   total      = pricing + cash + shipping;  net = total − fee
 */

/**
 * @typedef {{fee:number, ratio:number, cashRate:number, memberCashRate:number,
 *   shipMax:number, shipMin:number, freeShip:number}} ProConfig  money in cents, rates as fractions
 * @typedef {{monthlySpend:number, restocks:number, shipCharge:number}} ProInputs  money in cents
 */

/**
 * @param {ProInputs} inputs
 * @param {ProConfig} config
 */
export function estimateProValue(inputs, config) {
  const monthly = Math.max(0, inputs.monthlySpend || 0);
  const restocks = Math.max(0, Math.floor(inputs.restocks || 0));
  const shipCharge = Math.max(0, inputs.shipCharge || 0);

  const memberAnnual = monthly * 12;
  const proAnnual = memberAnnual * config.ratio;
  const pricing = memberAnnual - proAnnual;
  const cash = proAnnual * Math.max(0, config.cashRate - config.memberCashRate);

  const averageRestock = restocks > 0 ? (monthly * config.ratio) / restocks : 0;
  const shipEligible = restocks > 0 && averageRestock >= config.shipMin && averageRestock < config.freeShip;
  const shipping = shipEligible ? 12 * Math.min(shipCharge, config.shipMax) : 0;

  const total = pricing + cash + shipping;
  const net = total - config.fee;
  const perMonth = total / 12;

  return {
    memberAnnual,
    proAnnual,
    pricing,
    cash,
    shipping,
    shipEligible,
    averageRestock,
    total,
    fee: config.fee,
    net,
    recovered: config.fee > 0 ? total / config.fee : 0,
    paybackMonths: perMonth > 0 ? Math.ceil(config.fee / perMonth) : null,
    breakEvenMonthly: breakEvenMonthlySpend(config),
  };
}

/** Monthly Member-price spend at which pricing + Threads Cash alone cover the fee. */
export function breakEvenMonthlySpend(config) {
  const perDollar = 1 - config.ratio + config.ratio * Math.max(0, config.cashRate - config.memberCashRate);
  if (perDollar <= 0) return null;
  return config.fee / perDollar / 12;
}

class AtProCalculator extends HTMLElement {
  connectedCallback() {
    try {
      this.config = JSON.parse(this.dataset.config || '{}');
    } catch {
      return;
    }
    const locale = document.documentElement.lang || undefined;
    const currency = this.dataset.currency || 'USD';
    this.money = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
    this.addEventListener('input', this.onInput);
    this.addEventListener('change', this.onInput);
    this.update();
  }

  disconnectedCallback() {
    this.removeEventListener('input', this.onInput);
    this.removeEventListener('change', this.onInput);
  }

  /** Keeps the slider and its number field in step, then recalculates. */
  onInput = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const mirrorOf = target?.getAttribute?.('data-pro-mirror');
    if (mirrorOf) {
      const field = /** @type {HTMLInputElement|null} */ (this.querySelector(`[data-pro-input="${mirrorOf}"]`));
      if (field) field.value = target.value;
    } else if (target?.getAttribute?.('data-pro-input')) {
      const name = target.getAttribute('data-pro-input');
      const range = /** @type {HTMLInputElement|null} */ (this.querySelector(`[data-pro-mirror="${name}"]`));
      if (range) {
        const value = Math.max(0, parseFloat(target.value) || 0);
        if (value > Number(range.max)) range.max = String(Math.ceil(value / 500) * 500);
        range.value = String(value);
      }
    }
    this.update();
  };

  /** @param {string} name */
  read(name, fallback) {
    const field = /** @type {HTMLInputElement|null} */ (this.querySelector(`[data-pro-input="${name}"]`));
    if (!field) return fallback;
    const value = parseFloat(field.value);
    return Number.isFinite(value) ? value : fallback;
  }

  update = () => {
    const config = this.config;
    if (!config) return;
    const inputs = {
      monthlySpend: this.read('monthly', 0) * 100,
      restocks: this.read('restocks', Number(this.dataset.defaultRestocks || 3)),
      shipCharge: Math.max(0, this.read('ship', Number(this.dataset.defaultShip || 0))) * 100,
    };
    const result = estimateProValue(inputs, config);
    const format = (cents) => this.money.format(Math.round((cents || 0) / 100));

    this.querySelectorAll('[data-pro-echo]').forEach((node) => {
      const key = node.getAttribute('data-pro-echo');
      if (key === 'monthly') node.textContent = format(inputs.monthlySpend);
      if (key === 'restocks') node.textContent = String(inputs.restocks);
      if (key === 'ship') node.textContent = format(inputs.shipCharge);
      if (key === 'assumption') {
        const template = node.getAttribute(inputs.restocks === 1 ? 'data-one' : 'data-other');
        if (template) node.textContent = template.replace('[count]', String(inputs.restocks)).replace('[ship]', format(inputs.shipCharge));
      }
    });

    this.querySelectorAll('[data-pro-out]').forEach((node) => {
      const key = node.getAttribute('data-pro-out');
      switch (key) {
        case 'net':
          node.textContent = (result.net < 0 ? '−' : '') + format(Math.abs(result.net));
          break;
        case 'fee':
          node.textContent = '−' + format(result.fee);
          break;
        case 'breakeven':
          node.textContent = result.breakEvenMonthly == null ? '—' : format(Math.ceil(result.breakEvenMonthly / 100) * 100);
          break;
        case 'payback-text': {
          const months = result.paybackMonths;
          const template = months === 1 ? node.getAttribute('data-one') : node.getAttribute('data-other');
          node.textContent = months == null || !template ? '' : template.replace('[count]', String(months));
          break;
        }
        case 'payback':
          node.textContent = result.paybackMonths == null ? '—' : String(result.paybackMonths);
          break;
        default:
          if (key in result) node.textContent = format(result[key]);
      }
    });

    this.querySelectorAll('[data-pro-show]').forEach((node) => {
      const rule = node.getAttribute('data-pro-show');
      let visible = true;
      if (rule === 'net-positive') visible = result.net >= 0;
      if (rule === 'net-negative') visible = result.net < 0;
      if (rule === 'ship-ineligible') visible = !result.shipEligible && inputs.restocks > 0;
      if (rule === 'payback') visible = result.paybackMonths != null && result.paybackMonths <= 12;
      node.hidden = !visible;
    });

    const progress = Math.max(0, Math.min(1, result.recovered));
    this.style.setProperty('--at-pro-progress', String(progress));
    this.toggleAttribute('data-paid-for-itself', result.net >= 0);
  };
}

if (!customElements.get('at-pro-calculator')) customElements.define('at-pro-calculator', AtProCalculator);

/**
 * Mobile sticky purchase bar: shows once the main purchase button scrolls out of view.
 * While it shows, `html[data-at-pro-sticky]` and `--at-pro-sticky-height` let assets/at-pro.css lift
 * the Shopify Inbox chat launcher above the bar instead of overlapping it.
 */
class AtProStickyBar extends HTMLElement {
  connectedCallback() {
    this.target = document.getElementById(this.dataset.target || '');
    if (!this.target) return;
    // A scroll check rather than an IntersectionObserver: on mobile the button starts below the
    // fold, and a jump straight past it (an anchor link, restored scroll) never "intersects", so an
    // observer would never report that it is now above the viewport.
    window.addEventListener('scroll', this.schedule, { passive: true });
    window.addEventListener('resize', this.schedule, { passive: true });
    this.check();
  }

  schedule = () => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.check();
    });
  };

  check() {
    if (!this.target) return;
    this.setVisible(this.target.getBoundingClientRect().bottom < 0);
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    if (visible === this.hasAttribute('data-visible')) return;
    this.toggleAttribute('data-visible', visible);
    const root = document.documentElement;
    const shown = visible && getComputedStyle(this).display !== 'none';
    root.toggleAttribute('data-at-pro-sticky', shown);
    if (shown) root.style.setProperty('--at-pro-sticky-height', `${Math.round(this.getBoundingClientRect().height)}px`);
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.schedule);
    window.removeEventListener('resize', this.schedule);
    if (this.frame) cancelAnimationFrame(this.frame);
    document.documentElement.removeAttribute('data-at-pro-sticky');
  }
}

if (!customElements.get('at-pro-sticky-bar')) customElements.define('at-pro-sticky-bar', AtProStickyBar);
