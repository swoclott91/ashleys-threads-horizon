/**
 * Ashley's Pro PDP: mobile sticky purchase bar (sections/at-pro-hero).
 * Shows once the main purchase button scrolls out of view.
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
