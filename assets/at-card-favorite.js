import { favoritesReady, favoriteChanges, hasSavedColor } from '@theme/at-favorite-colors';

/**
 * Heart on a product card photo (snippets/at-card-favorite.liquid). Opens a small color panel
 * over the photo; its swatches come from sections/at-card-favorite-colors, fetched once per
 * product, and each swatch is a shared `at-favorite-color` control that saves that color.
 */

const colorLists = new Map();
let openCard = null;
let nextId = 0;

function loadColors(url) {
  let request = colorLists.get(url);
  if (!request) {
    request = fetch(url, { headers: { Accept: 'text/html' } }).then((response) => {
      if (!response.ok) throw new Error(`Color list request failed: ${response.status}`);
      return response.text();
    });
    colorLists.set(url, request);
    request.catch(() => colorLists.delete(url));
  }
  return request;
}

class CardFavorite extends HTMLElement {
  #listeners;
  #openListeners;
  #toggle;
  #panel;
  #colors;
  #name;
  #loaded = false;
  #loading = null;

  connectedCallback() {
    if (!favoritesReady) return;
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;

    this.#toggle = this.querySelector('.at-card-favorite__toggle');
    this.#panel = this.querySelector('.at-card-favorite__panel');
    this.#colors = this.querySelector('[data-at-card-favorite-colors]');
    this.#name = this.querySelector('[data-at-card-favorite-name]');

    const id = `at-card-favorite-${++nextId}`;
    this.#panel.id = `${id}-panel`;
    this.querySelector('[data-at-card-favorite-title]').id = `${id}-title`;
    this.#panel.setAttribute('aria-labelledby', `${id}-title`);
    this.#toggle.setAttribute('aria-controls', this.#panel.id);

    this.addEventListener('click', this.#onClick, { signal });
    this.addEventListener('keydown', this.#onKeydown, { signal });
    this.#colors.addEventListener('pointerover', this.#showName, { signal });
    this.#colors.addEventListener('focusin', this.#showName, { signal });
    this.#colors.addEventListener('pointerleave', this.#resetName, { signal });
    this.#colors.addEventListener('focusout', this.#resetName, { signal });
    favoriteChanges.addEventListener('change', this.#refresh, { signal });

    this.hidden = false;
    this.#refresh();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#openListeners?.abort();
    if (openCard === this) openCard = null;
  }

  get isOpen() {
    return !this.#panel.hidden;
  }

  open() {
    if (this.isOpen) return;
    if (openCard && openCard !== this) openCard.close({ restoreFocus: false });
    openCard = this;

    this.#panel.hidden = false;
    this.classList.add('is-open');
    this.#toggle.setAttribute('aria-expanded', 'true');

    this.#openListeners = new AbortController();
    // Clicks inside the card stop at this element, so any click reaching the document is outside.
    document.addEventListener('click', this.#onOutsideClick, { signal: this.#openListeners.signal });

    this.#panel.querySelector('.at-card-favorite__close').focus();
    this.#load().then(() => {
      if (!this.isOpen || !this.#panel.contains(document.activeElement)) return;
      const target = this.#colors.querySelector('.at-card-favorite__swatch[aria-pressed="true"]')
        ?? this.#colors.querySelector('.at-card-favorite__swatch');
      target?.focus();
    });
  }

  close({ restoreFocus = true } = {}) {
    if (!this.isOpen) return;
    const hadFocus = this.contains(document.activeElement);
    this.#openListeners?.abort();
    this.#panel.hidden = true;
    this.classList.remove('is-open');
    this.#toggle.setAttribute('aria-expanded', 'false');
    this.#resetName();
    if (openCard === this) openCard = null;
    if (restoreFocus && hadFocus) this.#toggle.focus();
  }

  #load() {
    if (this.#loaded) return Promise.resolve();
    if (this.#loading) return this.#loading;

    const url = new URL(this.dataset.colorsUrl, window.location.href).href;
    this.#loading = loadColors(url)
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const grid = doc.querySelector('.at-card-favorite__grid');
        if (!grid) throw new Error('Color list missing from response');
        // Imported into this document so the at-favorite-color controls upgrade on insert.
        this.#colors.replaceChildren(document.importNode(grid, true));
        this.#loaded = true;
      })
      .catch((error) => {
        console.warn('Could not load card colors', error);
        const status = document.createElement('p');
        status.className = 'at-card-favorite__status';
        status.setAttribute('role', 'status');
        status.textContent = this.dataset.labelFailed;
        this.#colors.replaceChildren(status);
      })
      .finally(() => {
        this.#loading = null;
      });
    return this.#loading;
  }

  #refresh = () => {
    const saved = hasSavedColor(this.dataset.productId);
    this.classList.toggle('is-saved', saved);
    this.#toggle.setAttribute('aria-label', saved ? this.dataset.labelSaved : this.dataset.labelSave);
  };

  #onClick = (event) => {
    // Keep the card's own link and view transition from treating this as a product click.
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.at-card-favorite__toggle')) {
      event.preventDefault();
      this.open();
    } else if (target.closest('.at-card-favorite__close')) {
      event.preventDefault();
      this.close();
    } else if (target.closest('.at-card-favorite__status') && !this.#loaded) {
      this.#load();
    }
  };

  #onOutsideClick = (event) => {
    if (event.target instanceof Node && this.contains(event.target)) return;
    this.close({ restoreFocus: false });
  };

  #onKeydown = (event) => {
    if (!this.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const swatches = Array.from(this.#colors.querySelectorAll('.at-card-favorite__swatch'));
    const index = swatches.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = swatches.length - 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowRight') next = index + 1;
    else {
      // Up/down move one row: the first swatch on a new row gives the column count.
      const firstOfRow2 = swatches.findIndex((swatch) => swatch.offsetTop !== swatches[0].offsetTop);
      const columns = firstOfRow2 > 0 ? firstOfRow2 : swatches.length;
      next = event.key === 'ArrowUp' ? index - columns : index + columns;
      if (next < 0 || next >= swatches.length) return;
    }
    swatches[Math.min(swatches.length - 1, Math.max(0, next))]?.focus();
  };

  #showName = (event) => {
    const swatch = event.target instanceof Element ? event.target.closest('.at-card-favorite__swatch') : null;
    if (swatch) this.#name.textContent = swatch.dataset.name;
  };

  #resetName = (event) => {
    if (event?.type === 'focusout' && this.#colors.contains(event.relatedTarget)) return;
    if (event?.type === 'pointerleave' && this.#colors.contains(document.activeElement)) {
      const focused = document.activeElement.closest('.at-card-favorite__swatch');
      if (focused) {
        this.#name.textContent = focused.dataset.name;
        return;
      }
    }
    this.#name.textContent = this.dataset.hint;
  };
}

if (favoritesReady && !customElements.get('at-card-favorite')) {
  customElements.define('at-card-favorite', CardFavorite);
}
