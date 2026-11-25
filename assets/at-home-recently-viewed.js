import { RecentlyViewed } from '@theme/recently-viewed-products';
import { sectionRenderer } from '@theme/section-renderer';

class HomeRecentlyViewed extends HTMLElement {
  async connectedCallback() {
    if (this.dataset.loaded === 'true') return;

    const list = this.querySelector('[data-recent-items]');
    const empty = this.querySelector('[data-recent-empty]');
    if (!list || !empty || !this.dataset.searchUrl) return;

    try {
      const productIds = RecentlyViewed.getProducts().filter((id) => /^\d+$/.test(id));
      if (productIds.length === 0) return;

      const url = new URL(this.dataset.searchUrl, window.location.origin);
      url.searchParams.set('q', productIds.map((id) => `id:${id}`).join(' OR '));
      url.searchParams.set('resources[type]', 'product');

      const html = await sectionRenderer.getSectionHTML('predictive-search', false, url);
      if (!html || !this.isConnected) return;

      const results = new DOMParser().parseFromString(html, 'text/html');
      const cards = results.querySelectorAll('#predictive-search-products .resource-card');
      const items = [];

      for (const card of cards) {
        const sourceLink = card.querySelector('.resource-card__link');
        const href = sourceLink?.getAttribute('href');
        const title = sourceLink?.textContent?.trim();
        if (!href || !title) continue;

        const productUrl = new URL(href, window.location.origin);
        if (productUrl.origin !== window.location.origin || !productUrl.pathname.includes('/products/')) continue;

        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'at-member-home__viewed-link';
        link.href = productUrl.href;

        const image = card.querySelector('img.resource-card__image');
        const src = image?.getAttribute('src');
        if (src) {
          const thumbnail = document.createElement('img');
          const srcset = image.getAttribute('srcset');
          thumbnail.sizes = '(min-width: 750px) 13vw, 45vw';
          if (srcset) thumbnail.srcset = srcset;
          thumbnail.src = src;
          thumbnail.alt = '';
          link.append(thumbnail);
        }

        const caption = document.createElement('span');
        caption.className = 'at-member-home__viewed-caption';
        const label = document.createElement('span');
        label.textContent = title;
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        caption.append(label, arrow);
        link.append(caption);
        item.append(link);
        items.push(item);
        if (items.length === 2) break;
      }

      if (items.length === 0) return;
      list.replaceChildren(...items);
      list.hidden = false;
      empty.hidden = true;
      this.dataset.loaded = 'true';
    } catch {
      // The empty state remains visible when storage or search is unavailable.
    }
  }
}

if (!customElements.get('at-home-recently-viewed')) {
  customElements.define('at-home-recently-viewed', HomeRecentlyViewed);
}
