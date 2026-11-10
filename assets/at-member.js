/**
 * AT member pricing: opens and closes the "Your pricing" modal from the bar under the product price.
 * Delegated on document so it survives section re-renders and variant morphs.
 */
if (!window.__atMemberPricingBound) {
  window.__atMemberPricingBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const opener = target.closest('[data-at-pricing-open]');
    if (opener) {
      const dialog = document.getElementById(opener.getAttribute('data-at-pricing-open') || '');
      if (dialog instanceof HTMLDialogElement && !dialog.open) {
        event.preventDefault();
        dialog.showModal();
        opener.setAttribute('aria-expanded', 'true');
        dialog.addEventListener(
          'close',
          () => {
            opener.setAttribute('aria-expanded', 'false');
            if (opener instanceof HTMLElement) opener.focus();
          },
          { once: true }
        );
      }
      return;
    }

    if (target.closest('[data-at-pricing-close]')) {
      target.closest('dialog')?.close();
      return;
    }

    // Click on the backdrop (the dialog element itself, outside its panel).
    if (target instanceof HTMLDialogElement && target.hasAttribute('data-at-pricing-dialog')) {
      const rect = target.getBoundingClientRect();
      const { clientX: x, clientY: y } = /** @type {MouseEvent} */ (event);
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) target.close();
    }
  });
}

/**
 * Brands without MAP: keep the guest bar's member price in step with the selected variant.
 * `snippets/price.liquid` puts the variant's `wagner.member_price` in a hidden
 * `[data-at-member-price-src]` inside the price container, which product-price swaps on variant
 * change. Empty value → back to "Members pay less" with no number.
 */
function syncMemberPrice(productPrice) {
  const bar = productPrice.querySelector('.at-mbar--guest');
  const src = productPrice.querySelector('[data-at-member-price-src]');
  if (!bar || !src) return;
  const value = src.getAttribute('data-at-member-price-src') || '';
  const lead = bar.querySelector('[data-at-member-lead]');
  const priceLead = bar.querySelector('[data-at-member-price-lead]');
  const priceEl = bar.querySelector('[data-at-member-price]');
  if (!(lead instanceof HTMLElement) || !(priceLead instanceof HTMLElement) || !priceEl) return;
  // Only write on change: writing textContent is itself a mutation this observer sees.
  if (priceEl.textContent !== value) priceEl.textContent = value;
  if (priceLead.hidden !== (value === '')) priceLead.hidden = value === '';
  if (lead.hidden !== (value !== '')) lead.hidden = value !== '';
}

function watchProductPrices() {
  document.querySelectorAll('product-price').forEach((el) => {
    if (!(el instanceof HTMLElement) || el.dataset.atMemberWatched) return;
    if (!el.querySelector('.at-mbar--guest [data-at-member-price-lead]')) return;
    el.dataset.atMemberWatched = 'true';
    new MutationObserver(() => syncMemberPrice(el)).observe(el, { childList: true, subtree: true });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchProductPrices, { once: true });
} else {
  watchProductPrices();
}
