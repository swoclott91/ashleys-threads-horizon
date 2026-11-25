/**
 * <at-home-profile>: the profile question on the homepage (sections/at-home-profile.liquid).
 * Each answer card links to its collection. A tap saves the answer through
 * POST /apps/wagner/answers and then opens the collection; the save never blocks shopping (a
 * failed or slow save still navigates, and the question is asked again on a later visit).
 * Rules for answers and the pending record live in ./at-home-profile-core.js.
 */
import { buildSaveBody, mergePending, nextQuestion, normalizeAnswers } from './at-home-profile-core.js';

const LATER_KEY = 'at_profile_later';
const PENDING_KEY = 'at_profile_pending';
/** How long a tap waits for the save before opening the collection anyway. */
const SAVE_WAIT_MS = 1500;

const storage = {
  get(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch (error) {
      /* Private mode or blocked storage: the visit just isn't remembered. */
    }
  },
};

const parse = (text, fallback) => {
  try {
    return JSON.parse(text || 'null') ?? fallback;
  } catch (error) {
    return fallback;
  }
};

class AtHomeProfile extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.endpoint = this.dataset.endpoint || '/apps/wagner/answers';
    this.designMode = Boolean(window.Shopify?.designMode);

    const server = normalizeAnswers(parse(this.querySelector('[data-answers]')?.textContent, {}));
    const merged = mergePending(server, parse(storage.get(PENDING_KEY), null), Date.now());
    storage.set(PENDING_KEY, merged.pending ? JSON.stringify(merged.pending) : null);
    this.answers = merged.answers;

    if (!this.designMode) {
      // An answer saved earlier this visit may not be in the metafields yet.
      const question = nextQuestion(this.answers);
      if (!question || storage.get(LATER_KEY) === '1') {
        this.hidden = true;
        return;
      }
      for (const panel of this.querySelectorAll('[data-question-panel]')) {
        panel.hidden = panel.dataset.questionPanel !== question;
      }
    }

    this.addEventListener('click', (event) => this.onClick(event));
  }

  onClick(event) {
    if (event.target.closest('[data-later]')) {
      if (this.designMode) return;
      storage.set(LATER_KEY, '1');
      this.hidden = true;
      return;
    }

    const card = event.target.closest('a[data-answer]');
    if (!card || !this.contains(card) || this.designMode) return;
    // A new tab or window keeps this page open: let the browser handle it, without saving.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const question = card.dataset.answer;
    const built = buildSaveBody(question, question === 'q3' ? [card.dataset.value] : card.dataset.value);
    if (!built.ok) return;

    event.preventDefault();
    if (this.saving) return;
    this.saving = true;
    card.setAttribute('aria-busy', 'true');
    this.save(built.body).finally(() => window.location.assign(card.href));
  }

  /** Sends the answer; resolves once it is saved, has failed, or SAVE_WAIT_MS has passed. */
  save(body) {
    const request = fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      // Lets the save finish after the page has moved on to the collection.
      keepalive: true,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        // Success is the contract's {"ok": true}; a 200 HTML page is not a save.
        if (response.ok && data?.ok === true) this.rememberPending(body);
      })
      .catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, SAVE_WAIT_MS));
    return Promise.race([request, timeout]);
  }

  /** Wagner writes the metafields from a queue; keep this visit's answers until they land. */
  rememberPending(body) {
    const previous = parse(storage.get(PENDING_KEY), null);
    const answers = { ...(previous && typeof previous.answers === 'object' ? previous.answers : {}), ...body };
    storage.set(PENDING_KEY, JSON.stringify({ answers, at: Date.now() }));
  }
}

if (!customElements.get('at-home-profile')) customElements.define('at-home-profile', AtHomeProfile);
