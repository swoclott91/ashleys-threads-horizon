/**
 * Ashley's Pro value calculator (docs/pro-membership-pdp.md, "Calculator math").
 *
 * The one implementation of the projection math. The compact calculator above the fold and the
 * expanded calculator section both use <at-pro-calculator>; config comes from snippets/at-pro-config
 * through `data-config`, so the theme never hardcodes rates, caps or the fee.
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
    this.addEventListener('input', this.update);
    this.addEventListener('change', this.update);
    this.update();
  }

  disconnectedCallback() {
    this.removeEventListener('input', this.update);
    this.removeEventListener('change', this.update);
  }

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
      restocks: this.read('restocks', Number(this.dataset.defaultRestocks || 1)),
      shipCharge: this.read('ship', Number(this.dataset.defaultShip || 0)) * 100,
    };
    const result = estimateProValue(inputs, config);
    const format = (cents) => this.money.format(Math.round((cents || 0) / 100));

    this.querySelectorAll('[data-pro-echo]').forEach((node) => {
      const key = node.getAttribute('data-pro-echo');
      if (key === 'monthly') node.textContent = format(inputs.monthlySpend);
      if (key === 'restocks') node.textContent = String(inputs.restocks);
      if (key === 'ship') node.textContent = format(inputs.shipCharge);
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

/** Mobile sticky purchase bar: shows once the main purchase button scrolls out of view. */
class AtProStickyBar extends HTMLElement {
  connectedCallback() {
    const target = document.getElementById(this.dataset.target || '');
    if (!target || !('IntersectionObserver' in window)) return;
    this.observer = new IntersectionObserver(([entry]) => {
      const above = entry.boundingClientRect.top < 0;
      this.toggleAttribute('data-visible', !entry.isIntersecting && above);
    });
    this.observer.observe(target);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }
}

if (!customElements.get('at-pro-sticky-bar')) customElements.define('at-pro-sticky-bar', AtProStickyBar);
