class ATColorOptionOrder extends HTMLElement {
  #observer = new MutationObserver(() => this.#schedule());
  #frame = 0;

  static observedAttributes = ['data-value-ids'];

  connectedCallback() {
    const picker = this.closest('variant-picker');
    if (!picker) return;
    this.#observer.observe(picker, { childList: true, subtree: true });
    this.#sort();
  }

  disconnectedCallback() {
    this.#observer.disconnect();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#schedule();
  }

  #schedule() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#sort();
    });
  }

  #sort() {
    const picker = this.closest('variant-picker');
    if (!picker) return;
    let ids;
    try {
      ids = JSON.parse(this.dataset.valueIds || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && /^\d+$/.test(id))) return;
    const ranks = new Map(ids.map((id, index) => [id, index]));
    const focused = document.activeElement;
    const order = (items, getId) => {
      if (!items.some((item) => ranks.has(getId(item)))) return items;
      return items.map((item, index) => ({ item, index, rank: ranks.get(getId(item)) ?? Infinity }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ item }) => item);
    };
    for (const fieldset of picker.querySelectorAll('fieldset')) {
      const labels = Array.from(fieldset.children).filter((node) => node.matches('label.variant-option__button-label'));
      const sorted = order(labels, (label) => label.querySelector('input')?.dataset.optionValueId);
      if (labels.some((label, index) => label !== sorted[index])) fieldset.append(...sorted);
    }
    for (const select of picker.querySelectorAll('select')) {
      const options = Array.from(select.options);
      const sorted = order(options, (option) => option.dataset.optionValueId);
      if (options.some((option, index) => option !== sorted[index])) {
        const selected = select.value;
        select.append(...sorted);
        select.value = selected;
      }
    }
    if (focused instanceof HTMLElement && picker.contains(focused) && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
  }
}

if (!customElements.get('at-color-option-order')) customElements.define('at-color-option-order', ATColorOptionOrder);
