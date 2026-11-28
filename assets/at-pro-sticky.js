/**
 * Ashley's Pro PDP: mobile sticky purchase bar (sections/at-pro-hero).
 * Shows once the main purchase button scrolls out of view.
 *
 * Shopify Inbox chat launcher (assets/at-pro.css does the styling):
 * - While the bar shows, `html[data-at-pro-sticky]` and `--at-pro-sticky-height` lift the launcher
 *   above the bar.
 * - Before that, on the first screen, the launcher would sit on the purchase block (button, billing
 *   note, Promise). While it overlaps that block, `html[data-at-pro-chat-covering]` hides the
 *   launcher; it comes back as soon as the shopper scrolls past or the bar appears, so chat is
 *   always one scroll away and never covers the purchase.
 */
class AtProStickyBar extends HTMLElement {
  connectedCallback() {
    this.target = document.getElementById(this.dataset.target || '');
    if (!this.target) return;
    this.guard = this.dataset.guard ? document.querySelector(this.dataset.guard) : null;
    // A scroll check rather than an IntersectionObserver: on mobile the button starts below the
    // fold, and a jump straight past it (an anchor link, restored scroll) never "intersects", so an
    // observer would never report that it is now above the viewport.
    window.addEventListener('scroll', this.schedule, { passive: true });
    window.addEventListener('resize', this.schedule, { passive: true });
    this.check();
    // The chat widget loads after the page; check again once it has had time to appear.
    this.timers = [1500, 4000].map((delay) => setTimeout(this.schedule, delay));
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
    this.checkChat();
  }

  /** Hide the chat launcher only while it would cover the purchase block (and the bar is hidden). */
  checkChat() {
    const root = document.documentElement;
    const activator = document.querySelector('shopify-chat')?.shadowRoot?.querySelector('[part~="activator"]');
    let covering = false;
    if (this.guard && activator && !root.hasAttribute('data-at-pro-sticky') && getComputedStyle(this).display !== 'none') {
      const a = activator.getBoundingClientRect();
      const g = this.guard.getBoundingClientRect();
      covering = a.width > 0 && a.left < g.right && a.right > g.left && a.top < g.bottom && a.bottom > g.top;
    }
    root.toggleAttribute('data-at-pro-chat-covering', covering);
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
    this.timers?.forEach(clearTimeout);
    document.documentElement.removeAttribute('data-at-pro-sticky');
    document.documentElement.removeAttribute('data-at-pro-chat-covering');
  }
}

if (!customElements.get('at-pro-sticky-bar')) customElements.define('at-pro-sticky-bar', AtProStickyBar);
