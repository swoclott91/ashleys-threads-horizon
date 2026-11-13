const settingsElement = document.getElementById('at-favorite-colors-settings');
const settings = settingsElement ? JSON.parse(settingsElement.textContent) : null;
let signedIn = settings?.signedIn ?? false;
const pickerSelector = 'variant-picker[ref="mainVariantPicker"]';
const pairKey = (productId, colorId) => `${productId}:${colorId}`;
const favorites = Array.isArray(settings?.favorites) ? settings.favorites : [];
const saved = new Set(favorites.map(({ productId, colorOptionValueId }) =>
  pairKey(productId, colorOptionValueId)
));
const pending = new Set();
const failures = new Set();
const changes = new EventTarget();
const selectedValues = 'input[data-option-value-id]:checked, option[data-option-value-id]:checked, [data-single-option-value-id]';
const optionValueId = (element) => element?.dataset.optionValueId || element?.dataset.singleOptionValueId;
const withColor = (text, color) => text.replace('[color]', () => color);

function signIn({ productUrl, variantId, optionValues }) {
  const currentUrl = new URL(window.location.href);
  const product = new URL(productUrl, currentUrl);
  if (currentUrl.pathname === product.pathname) product.search = currentUrl.search;
  product.searchParams.delete('variant');
  product.searchParams.delete('option_values');
  if (optionValues?.length) {
    product.searchParams.set('option_values', optionValues.join(','));
  } else if (variantId) {
    product.searchParams.set('variant', variantId);
  }
  const login = new URL(settings.loginUrl, currentUrl);
  login.searchParams.set('return_to', product.pathname + product.search);
  window.location.assign(login.href);
}

class FavoriteColor extends HTMLElement {
  #listeners;
  #button;
  #liveRegion;
  #key;

  connectedCallback() {
    if (!settings) return;
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    this.#button = this.querySelector('button');
    this.#liveRegion = this.querySelector('[role="status"]');
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
    const { pickerPosition, productId, productUrl, variantId, colorId, colorName } = this.dataset;
    const picker = this.picker;
    if (!picker) {
      const optionValues = this.dataset.optionValues?.split(',').filter(Boolean);
      return { productId, productUrl, variantId, colorId, colorName, optionValues };
    }

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
      productUrl: picker.dataset.productUrl || productUrl,
      optionValues: Array.from(picker.querySelectorAll(selectedValues), optionValueId),
      colorId: optionValueId(selected),
      colorName: selected?.value ?? selected?.textContent.trim(),
    };
  }

  refresh = () => {
    const { productId, colorId, colorName } = this.#currentColor();
    const key = productId && colorId && colorName ? pairKey(productId, colorId) : null;
    if (this.#key !== key) {
      this.#liveRegion.textContent = '';
      this.#key = key;
    }
    this.hidden = !key;
    if (this.hidden) return;

    const isSaved = signedIn && saved.has(key);
    this.#button.disabled = signedIn && pending.has(key);
    this.#button.setAttribute('aria-pressed', String(isSaved));
    this.#button.setAttribute('aria-label', withColor(isSaved ? settings.removeNamed : settings.saveNamed, colorName));
    const label = this.querySelector('[data-at-favorite-label]');
    if (label) {
      label.textContent = isSaved ? withColor(settings.saved, colorName) : settings.save;
    }
    const failed = signedIn && failures.has(key);
    this.#liveRegion.classList.toggle('visually-hidden', !failed);
    if (failed) {
      this.#liveRegion.textContent = settings.failure;
    } else if (this.#liveRegion.textContent === settings.failure) {
      this.#liveRegion.textContent = '';
    }
  };

  #toggle = async () => {
    const color = this.#currentColor();
    const { productId, colorId, colorName } = color;
    if (!productId || !colorId || !colorName) return;
    if (!signedIn) {
      signIn(color);
      return;
    }
    const key = pairKey(productId, colorId);
    if (pending.has(key)) return;

    const wasSaved = saved.has(key);
    const action = wasSaved ? 'remove' : 'add';
    pending.add(key);
    failures.delete(key);
    this.#liveRegion.textContent = '';
    if (wasSaved) saved.delete(key);
    else saved.add(key);
    changes.dispatchEvent(new Event('change'));
    try {
      const response = await fetch('/apps/wagner/favorite-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, productId, colorOptionValueId: colorId }),
      });
      const result = await response.json();
      if (response.status === 403 && result.error === 'login_required') {
        saved.clear();
        signedIn = false;
        if (this.isConnected && this.#key === key) signIn(color);
        return;
      }
      if (!response.ok) throw new Error('Favorite color request failed');
      if (result.productId !== productId || result.colorOptionValueId !== colorId || typeof result.saved !== 'boolean') {
        throw new Error('Unexpected favorite color response');
      }
      if (result.saved) saved.add(key);
      else saved.delete(key);
      if (signedIn && this.isConnected && this.#key === key) {
        this.#liveRegion.textContent = withColor(result.saved ? settings.saved : settings.removed, colorName);
      }
    } catch {
      if (wasSaved) saved.add(key);
      else saved.delete(key);
      failures.add(key);
    } finally {
      pending.delete(key);
      changes.dispatchEvent(new Event('change'));
    }
  };
}

if (settings) {
  customElements.define('at-favorite-color', FavoriteColor);

  if (window.Shopify?.designMode) {
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-at-preview-save-color]')) {
        const dialog = document.getElementById('at-save-color-dialog');
        if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
      }
    });
  }

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
