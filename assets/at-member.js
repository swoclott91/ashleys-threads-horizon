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
