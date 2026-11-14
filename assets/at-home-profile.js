/**
 * <at-home-profile>: the member profile area on the homepage (sections/at-home-profile.liquid).
 * Saves answers through POST /apps/wagner/answers and advances in place. Decision rules are in
 * ./at-home-profile-core.js; this file only reads and writes the DOM and session storage.
 */
import {
  applySave,
  buildSaveBody,
  linksForQuestion,
  mergePending,
  nextQuestion,
  normalizeAnswers,
  profileView,
  saveErrorMessage,
  toggleMethod,
} from './at-home-profile-core.js';

const LATER_KEY = 'at_profile_later';
const PENDING_KEY = 'at_profile_pending';
const POINTER_WINDOW_MS = 1500;

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

const readJson = (element, fallback) => {
  try {
    return JSON.parse(element?.textContent || 'null') ?? fallback;
  } catch (error) {
    return fallback;
  }
};

class AtHomeProfile extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.endpoint = this.dataset.endpoint || '/apps/wagner/answers';
    this.collections = readJson(this.querySelector('[data-collections]'), {});
    const server = normalizeAnswers(readJson(this.querySelector('[data-answers]'), {}));
    const merged = mergePending(server, readJson({ textContent: storage.get(PENDING_KEY) }, null), Date.now());
    storage.set(PENDING_KEY, merged.pending ? JSON.stringify(merged.pending) : null);
    this.answers = merged.answers;
    this.later = storage.get(LATER_KEY) === '1';
    this.editing = false;
    this.methodsExpanded = false;
    this.current = nextQuestion(this.answers);
    this.savedQuestion = null;
    this.saving = false;
    this.queued = null;
    this.lastAttempt = null;
    this.pointerAt = 0;

    this.status = this.querySelector('[data-status]');
    this.retryButton = this.querySelector('[data-retry]');

    this.addEventListener('pointerdown', () => {
      this.pointerAt = Date.now();
    });
    this.addEventListener('keydown', () => {
      this.pointerAt = 0;
    });
    this.addEventListener('change', (event) => this.onChange(event));
    this.addEventListener('submit', (event) => this.onSubmit(event));
    this.addEventListener('click', (event) => this.onClick(event));

    if (merged.pending) this.syncInputs();
    this.render();
  }

  form(question) {
    return this.querySelector(`[data-form="${question}"]`);
  }

  selection(question) {
    const form = this.form(question);
    if (!form) return question === 'q3' ? [] : '';
    if (question === 'q3') return [...form.querySelectorAll('input[name="q3"]:checked')].map((input) => input.value);
    return form.querySelector(`input[name="${question}"]:checked`)?.value ?? '';
  }

  /** Puts the saved answers back into the inputs (entering or leaving Edit profile). */
  syncInputs() {
    for (const input of this.querySelectorAll('input[name="q1"], input[name="q2"]')) {
      input.checked = this.answers[input.name] === input.value;
    }
    for (const input of this.querySelectorAll('input[name="q3"]')) {
      input.checked = (this.answers.q3 ?? []).includes(input.value);
    }
  }

  onChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name === 'q3') {
      const selection = toggleMethod(this.selection('q3'), input.value, input.checked);
      for (const box of this.form('q3').querySelectorAll('input[name="q3"]')) box.checked = selection.includes(box.value);
      return;
    }
    if (input.name !== 'q1' && input.name !== 'q2') return;
    // A tap or click saves at once. Arrow keys move through the radios, so a keyboard choice
    // waits for "Save answer" instead of saving every option it passes.
    if (Date.now() - this.pointerAt < POINTER_WINDOW_MS) {
      this.save(input.name, input.value);
    } else {
      this.form(input.name).toggleAttribute('data-keyboard', true);
    }
  }

  onSubmit(event) {
    const form = event.target.closest('[data-form]');
    if (!form || !this.contains(form)) return;
    event.preventDefault();
    const question = form.dataset.form;
    this.save(question, this.selection(question));
  }

  onClick(event) {
    const target = event.target.closest('button');
    if (!target || !this.contains(target)) return;
    if (target.matches('[data-later]')) {
      this.later = true;
      storage.set(LATER_KEY, '1');
      this.setStatus('');
      this.render();
      this.querySelector('[data-resume]:not([hidden])')?.focus();
    } else if (target.matches('[data-resume]')) {
      this.later = false;
      storage.set(LATER_KEY, null);
      this.current = nextQuestion(this.answers);
      this.savedQuestion = null;
      this.render({ focus: 'question' });
    } else if (target.matches('[data-next]')) {
      this.current = nextQuestion(this.answers);
      this.savedQuestion = null;
      this.setStatus('');
      this.render({ focus: 'question' });
    } else if (target.matches('[data-edit]')) {
      this.editing = true;
      this.savedQuestion = null;
      this.syncInputs();
      this.setStatus('');
      this.render({ focus: 'edit' });
    } else if (target.matches('[data-done]')) {
      this.editing = false;
      this.savedQuestion = null;
      this.syncInputs();
      this.setStatus('');
      this.current = nextQuestion(this.answers);
      this.render({ focus: this.current ? 'question' : 'complete' });
    } else if (target.matches('[data-retry]') && this.lastAttempt) {
      this.save(this.lastAttempt.question, this.lastAttempt.selection);
    } else if (target.matches('[data-more-methods]')) {
      this.methodsExpanded = true;
      const firstMore = this.querySelector('.at-profile__method[data-more]');
      this.render();
      firstMore?.querySelector('a')?.focus();
    }
  }

  setStatus(message, tone = '') {
    if (!this.status) return;
    this.status.textContent = message;
    if (tone) this.status.dataset.tone = tone;
    else delete this.status.dataset.tone;
  }

  async save(question, selection) {
    const built = buildSaveBody(question, selection);
    if (!built.ok) {
      this.setStatus(question === 'q3' ? 'Pick at least one method, or None.' : 'Pick an answer first.', 'error');
      return;
    }
    if (this.saving) {
      this.queued = { question, selection };
      return;
    }
    this.saving = true;
    this.lastAttempt = { question, selection };
    this.retryButton.hidden = true;
    this.setStatus('Saving…');
    const form = this.form(question);
    form?.setAttribute('aria-busy', 'true');

    let failure = null;
    let data = null;
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(built.body),
      });
      data = await response.json().catch(() => null);
      // Success is the contract's {"ok": true}; a 200 HTML page (a redirect to the password or
      // login page, a missing proxy) is not a save.
      if (!response.ok || data?.ok !== true) failure = saveErrorMessage(response.ok ? 500 : response.status, data);
    } catch (error) {
      failure = saveErrorMessage(0);
    }
    form?.removeAttribute('aria-busy');
    this.saving = false;

    if (this.queued) {
      const queued = this.queued;
      this.queued = null;
      this.save(queued.question, queued.selection);
      return;
    }

    if (failure) {
      // The selection stays checked so "Try again" sends the same answer.
      this.setStatus(failure, 'error');
      this.retryButton.hidden = false;
      return;
    }

    this.answers = applySave(this.answers, built.body, data);
    this.rememberPending(built.body);
    this.lastAttempt = null;
    form?.removeAttribute('data-keyboard');

    if (this.editing) {
      this.setStatus('Saved.');
      this.render();
      return;
    }
    const next = nextQuestion(this.answers);
    if (!next) {
      this.current = null;
      this.savedQuestion = null;
      this.setStatus('Saved. Your profile is complete.');
      this.render({ focus: 'complete' });
      return;
    }
    this.current = question;
    this.savedQuestion = question;
    this.setStatus('Saved.');
    this.render();
  }

  /** Wagner writes the metafields from a queue; keep this visit's answers until they land. */
  rememberPending(body) {
    const previous = readJson({ textContent: storage.get(PENDING_KEY) }, null);
    const answers = { ...(previous && typeof previous.answers === 'object' ? previous.answers : {}) };
    for (const question of Object.keys(body)) answers[question] = this.answers[question];
    storage.set(PENDING_KEY, JSON.stringify({ answers, at: Date.now() }));
  }

  renderSavedLinks(question) {
    const box = this.form(question)?.querySelector('[data-saved]');
    if (!box) return;
    const visible = !this.editing && this.savedQuestion === question;
    box.hidden = !visible;
    if (!visible) return;
    const holder = box.querySelector('[data-saved-links]');
    const links = linksForQuestion(question, this.answers, this.collections);
    holder.replaceChildren();
    if (links.length) {
      holder.append(links.length === 1 ? 'Shop ' : 'Shop your collections: ');
      links.forEach((link, index) => {
        if (index) holder.append(', ');
        const anchor = document.createElement('a');
        anchor.href = link.url;
        anchor.textContent = link.title;
        holder.append(anchor);
      });
    }
    const nextButton = box.querySelector('[data-next]');
    if (nextButton) nextButton.hidden = !nextQuestion(this.answers);
  }

  render({ focus = null } = {}) {
    const view = profileView(this.answers, this.collections, { later: this.later });
    const mode = this.editing ? 'edit' : view.mode;
    if (mode === 'question' && !this.later && !this.current) this.current = view.question;

    this.dataset.mode = mode;
    this.dataset.question = mode === 'question' ? this.current ?? '' : '';
    this.toggleAttribute('data-later', this.later && mode === 'question');
    this.toggleAttribute('data-has-links', view.hasLinks);
    this.hidden = mode === 'question' && view.hidden;

    for (const question of ['q1', 'q2', 'q3']) {
      const form = this.form(question);
      if (!form) continue;
      form.hidden = mode === 'edit' ? false : mode === 'question' ? this.later || question !== this.current : true;
      this.renderSavedLinks(question);
    }
    const editHead = this.querySelector('[data-edit-head]');
    if (editHead) editHead.hidden = mode !== 'edit';
    const resume = this.querySelector('[data-resume]');
    if (resume) resume.hidden = !(mode === 'question' && this.later);

    // Collection links for saved answers.
    const shown = new Set([view.links.project, view.links.priority, ...view.methods.shown].filter(Boolean).map((link) => link.key));
    const more = new Set(view.methods.more.map((link) => link.key));
    for (const element of this.querySelectorAll('[data-link]')) {
      const key = element.dataset.link;
      element.toggleAttribute('data-more', more.has(key));
      element.hidden = !(shown.has(key) || (more.has(key) && this.methodsExpanded));
    }
    const methods = this.querySelector('[data-methods]');
    if (methods) methods.hidden = view.links.methods.length === 0;
    this.querySelector('[data-tiles]')?.classList.toggle('at-profile__tiles--no-methods', view.links.methods.length === 0);
    const moreButton = this.querySelector('[data-more-methods]');
    if (moreButton) {
      moreButton.hidden = view.methods.more.length === 0 || this.methodsExpanded;
      moreButton.setAttribute('aria-expanded', String(this.methodsExpanded));
    }

    if (focus === 'question' && this.current) this.form(this.current)?.querySelector('.at-profile__title')?.focus();
    else if (focus === 'edit') this.querySelector('[data-edit-heading]')?.focus();
    else if (focus === 'complete') this.querySelector('[data-complete-heading]')?.focus();
  }
}

if (!customElements.get('at-home-profile')) customElements.define('at-home-profile', AtHomeProfile);
