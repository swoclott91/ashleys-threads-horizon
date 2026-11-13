const settingsElement = document.getElementById('at-favorite-colors-settings');
const settings = settingsElement ? JSON.parse(settingsElement.textContent) : null;
const pickerSelector = 'variant-picker[ref="mainVariantPicker"]';
const pairKey = (productId, colorId) => `${productId}:${colorId}`;
const favorites = Array.isArray(settings?.favorites) ? settings.favorites : [];
const saved = new Set(favorites.map(({ productId, colorOptionValueId }) =>
  pairKey(productId, colorOptionValueId)
));
const pending = new Set();
const failures = new Set();
const changes = new EventTarget();

class FavoriteColor extends HTMLElement {
  #listeners;
  #button;

  connectedCallback() {
    if (!settings) return;
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    this.#button = this.querySelector('button');
    this.#button.addEventListener('click', this.#toggle, { signal });
    changes.addEventListener('change', this.refresh, { signal });
    this.refresh();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
  }

  get picker() {
    if (!this.dataset.pickerPosition) return null;
    return this.closest('.shopify-section')?.querySelector(pickerSelector);
  }

  #currentColor() {
    const { pickerPosition, productId, colorId, colorName } = this.dataset;
    const picker = this.picker;
    if (!picker) return { productId, colorId, colorName };

    const optionPosition = `[data-input-id^="${pickerPosition}-"]`;
    const selected = picker.querySelector(
      `input${optionPosition}:checked, option${optionPosition}:checked, ${optionPosition}[data-single-option-value-id]`
    );
    const connectedUrl = selected?.dataset.connectedProductUrl;
    if (connectedUrl && connectedUrl.split('?')[0] !== picker.dataset.productUrl?.split('?')[0]) {
      return {};
    }
    return {
      productId: picker.dataset.productId,
      colorId: selected?.dataset.optionValueId || selected?.dataset.singleOptionValueId,
      colorName: selected?.value ?? selected?.textContent.trim(),
    };
  }

  refresh = () => {
    const { productId, colorId, colorName } = this.#currentColor();
    this.hidden = !productId || !colorId || !colorName;
    if (this.hidden) return;

    const key = pairKey(productId, colorId);
    const isSaved = saved.has(key);
    this.#button.setAttribute('aria-pressed', String(isSaved));
    this.#button.setAttribute('aria-disabled', String(pending.has(key)));
    const label = this.querySelector('[data-at-favorite-label]');
    if (label) {
      label.textContent = isSaved ? settings.saved.replace('[color]', () => colorName) : settings.save;
    } else {
      this.#button.setAttribute('aria-label', settings.saveNamed.replace('[color]', () => colorName));
    }
    this.querySelector('[role="status"]').textContent =
      failures.has(key) ? settings.failure.replace('[color]', () => colorName) : '';
  };

  #toggle = async () => {
    const { productId, colorId, colorName } = this.#currentColor();
    if (!productId || !colorId || !colorName) return;
    const key = pairKey(productId, colorId);
    if (pending.has(key)) return;

    const action = saved.has(key) ? 'remove' : 'add';
    pending.add(key);
    failures.delete(key);
    changes.dispatchEvent(new Event('change'));
    try {
      const response = await fetch('/apps/wagner/favorite-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, productId, colorOptionValueId: colorId }),
      });
      if (!response.ok) throw new Error('Favorite color request failed');
      const result = await response.json();
      if (result.productId !== productId || result.colorOptionValueId !== colorId || typeof result.saved !== 'boolean') {
        throw new Error('Unexpected favorite color response');
      }
      if (result.saved) saved.add(key);
      else saved.delete(key);
    } catch {
      failures.add(key);
    } finally {
      pending.delete(key);
      changes.dispatchEvent(new Event('change'));
    }
  };
}

if (settings) {
  customElements.define('at-favorite-color', FavoriteColor);

  document.addEventListener('shopify:product:select', (event) => {
    if (!(event.target instanceof Element) || !event.target.matches(pickerSelector)) return;
    const sectionId = event.target.closest('.shopify-section')?.id;
    if (!sectionId) return;
    const refresh = () => document.getElementById(sectionId)?.querySelectorAll('at-favorite-color[data-picker-position]')
      .forEach((control) => control.refresh());
    refresh();
    // The picker can resolve a missing combination or switch products in the returned markup.
    event.promise?.then(refresh, refresh);
  });
}
