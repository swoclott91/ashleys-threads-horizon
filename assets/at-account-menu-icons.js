/**
 * Adds icons to the Favorites and Bulk order links inside Shopify's account sheet
 * (<shopify-account>, snippets/header-actions.liquid).
 *
 * Shopify renders that sheet in its own shadow root from the `customer-account-main-menu`
 * menu and exposes no slot for it, so the links themselves come from the menu in admin.
 * This only decorates them. If Shopify changes the sheet's markup the links keep working
 * and the icons simply stop appearing.
 */

const SVG_ATTRIBUTES = 'viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" '
  + 'stroke-linejoin="round" aria-hidden="true" focusable="false" data-at-account-icon';

const ICONS = [
  {
    path: '/pages/bulk-order',
    svg: `<svg ${SVG_ATTRIBUTES}>`
      + '<path d="M18 6.66667V4.2807L10 1L2 4.2807V14.1228L10 18L11.7778 17.1053M10 18V7.85965M2 4.2807L10 7.85965M10 7.85965L18 4.2807"/>'
      + '<path d="M18.5373 10.442C18.3907 10.3019 18.2167 10.1907 18.0251 10.1149C17.8335 10.039 17.6281 10 17.4208 10C17.2134 10 17.008 10.039 16.8164 10.1149C16.6249 10.1907 16.4508 10.3019 16.3042 10.442L15.9999 10.7327L15.6957 10.442C15.3995 10.1591 14.9979 10.0001 14.5791 10.0001C14.1603 10.0001 13.7586 10.1591 13.4625 10.442C13.1664 10.725 13 11.1087 13 11.5089C13 11.909 13.1664 12.2927 13.4625 12.5757L15.9999 15L18.5373 12.5757C18.684 12.4356 18.8004 12.2693 18.8798 12.0862C18.9591 11.9032 19 11.707 19 11.5089C19 11.3107 18.9591 11.1145 18.8798 10.9315C18.8004 10.7484 18.684 10.5821 18.5373 10.442Z"/>'
      + '<path d="M14.5 6.5L7 3"/></svg>',
  },
  {
    path: '/pages/favorites',
    svg: `<svg ${SVG_ATTRIBUTES}>`
      + '<path d="M16.6 4.4a4.1 4.1 0 0 0-5.8 0L10 5.2l-.8-.8a4.1 4.1 0 0 0-5.8 5.8L10 16.8l6.6-6.6a4.1 4.1 0 0 0 0-5.8Z"/></svg>',
  },
];

function iconFor(link) {
  let pathname;
  try {
    pathname = new URL(link.getAttribute('href'), window.location.href).pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
  return ICONS.find((icon) => pathname.endsWith(icon.path)) ?? null;
}

function decorate(root) {
  for (const link of root.querySelectorAll('a[href]')) {
    if (link.querySelector('[data-at-account-icon]')) continue;
    const icon = iconFor(link);
    if (!icon) continue;

    const template = document.createElement('template');
    template.innerHTML = icon.svg;
    const svg = template.content.firstElementChild;
    const existing = link.querySelector('svg');
    if (existing) {
      // Shopify gave the link its own icon: take its place and its sizing.
      for (const name of ['class', 'width', 'height', 'part']) {
        const value = existing.getAttribute(name);
        if (value) svg.setAttribute(name, value);
      }
      existing.replaceWith(svg);
    } else {
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.style.cssText = 'flex:none;display:inline-block;vertical-align:middle;margin-inline-end:0.5rem;';
      link.prepend(svg);
    }
  }
}

function watch(account) {
  const root = account.shadowRoot;
  if (!root || account.dataset.atAccountIcons !== undefined) return;
  account.dataset.atAccountIcons = '';
  decorate(root);
  new MutationObserver(() => decorate(root)).observe(root, { subtree: true, childList: true });
}

function start() {
  for (const account of document.querySelectorAll('shopify-account')) watch(account);
}

if (typeof customElements !== 'undefined') {
  customElements.whenDefined('shopify-account').then(() => {
    start();
    // The shadow root can be attached a tick after the element is defined.
    requestAnimationFrame(start);
    setTimeout(start, 1000);
  });
}
