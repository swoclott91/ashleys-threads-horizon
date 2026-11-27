/**
 * Member setup notice (snippets/at-member-setup.liquid).
 *
 * A new account signs in before Wagner finishes setting it up (company, Member location, then
 * the `wagner.tier` metafield; usually about 5 seconds). Until the session buys for that
 * location the page shows guest prices.
 *
 * Shopify attaches the new company location to the session on a full page load, not on a
 * background section request (tested 2026-11-25: the section kept reporting no location while a
 * manual reload showed Member prices). So this script polls
 * sections/at-member-setup-data.liquid (Shopify only, never Wagner) for a sign that setup is
 * done and then reloads the page:
 * - the session already buys for a company location, or the `wagner.tier` metafield exists:
 *   reload now;
 * - Shopify offers the tier location's "set as current" URL: open it once (it switches the
 *   session without signing out);
 * - neither shows up: reload anyway at about 8 s and 25 s after the notice first appeared,
 *   since setup normally finishes in about 5 s.
 * At most MAX_RELOADS automatic reloads per browser session, so it can never loop. After about
 * 3 minutes it stops, asks the customer to refresh later, and stays quiet for 15 minutes.
 * Each check is logged to the console as `[at-member-setup]`.
 */
const DELAYS_MS = [1500, 2000, 2000, 2000, 2000, 3000, 3000, 5000, 5000, 10000, 15000, 30000, 30000, 30000, 30000];
const FALLBACK_RELOAD_AFTER_MS = [8000, 25000];
const MAX_RELOADS = 2;
const STOP_FOR_MS = 15 * 60 * 1000;

const notice = document.querySelector('[data-at-member-setup-notice]');

if (notice instanceof HTMLElement && !window.__atMemberSetupStarted) {
  window.__atMemberSetupStarted = true;
  start(notice);
}

/** @param {HTMLElement} el */
function start(el) {
  const customer = el.dataset.customer || '';
  const stopKey = `at-member-setup-stopped:${customer}`;
  const switchKey = `at-member-setup-switched:${customer}`;
  const startKey = `at-member-setup-started:${customer}`;
  const reloadsKey = `at-member-setup-reloads:${customer}`;
  const text = el.querySelector('[data-at-member-setup-text]');
  const close = el.querySelector('[data-at-member-setup-close]');
  const root = el.dataset.sectionUrl || '/';
  const url = `${root}${root.includes('?') ? '&' : '?'}sections=at-member-setup-data`;

  const stoppedAt = Number(read(stopKey) || 0);
  if (stoppedAt && Date.now() - stoppedAt < STOP_FOR_MS) return;

  // Kept across reloads, so the fallback timer counts from the first page that showed the notice.
  let startedAt = Number(read(startKey) || 0);
  if (!startedAt) {
    startedAt = Date.now();
    write(startKey, String(startedAt));
  }

  el.hidden = false;
  close?.addEventListener('click', () => {
    el.hidden = true;
  });

  let attempt = 0;

  const reloads = () => Number(read(reloadsKey) || 0);

  /** @param {string} reason */
  const reloadPage = (reason) => {
    // Without storage the reload count can't survive a reload, so never reload automatically.
    if (!storageWorks()) return false;
    const done = reloads();
    if (done >= MAX_RELOADS) return false;
    write(reloadsKey, String(done + 1));
    console.info('[at-member-setup] reloading:', reason);
    if (text) text.textContent = 'Your Member prices are ready. Updating the page.';
    window.location.reload();
    return true;
  };

  const stop = () => {
    write(stopKey, String(Date.now()));
    el.classList.add('at-member-setup--stopped');
    if (text) {
      text.textContent =
        'Your Member prices are taking longer than usual. Refresh the page in a minute to see them.';
    }
    if (close instanceof HTMLElement) close.hidden = false;
  };

  const next = () => {
    if (attempt >= DELAYS_MS.length) {
      stop();
      return;
    }
    window.setTimeout(poll, DELAYS_MS[attempt++]);
  };

  const poll = async () => {
    /** @type {{signedIn?: boolean, tier?: string, b2b?: boolean, setLocationUrl?: string} | null} */
    let status = null;
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const sections = await response.json();
        const html = sections && sections['at-member-setup-data'];
        if (typeof html === 'string') {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const json = doc.querySelector('script[data-at-member-setup]')?.textContent;
          if (json) status = JSON.parse(json);
        }
      }
    } catch (error) {
      console.warn('[at-member-setup] check failed; trying again', error);
    }

    const elapsed = Date.now() - startedAt;
    console.info('[at-member-setup] check', { elapsedMs: elapsed, reloads: reloads(), status });

    if (status && status.signedIn === false) {
      el.hidden = true;
      return;
    }
    if (status && status.b2b && reloadPage('session buys for a company location')) return;
    if (status && status.tier && reloadPage(`wagner.tier is ${status.tier}`)) return;
    // Switch once per browser session; if Shopify comes back without a location, keep going.
    if (status && status.setLocationUrl && !read(switchKey)) {
      write(switchKey, '1');
      if (text) text.textContent = 'Your Member prices are ready. Updating the page.';
      window.location.assign(status.setLocationUrl);
      return;
    }
    const fallbackAt = FALLBACK_RELOAD_AFTER_MS[reloads()];
    if (fallbackAt != null && elapsed >= fallbackAt && reloadPage(`no signal after ${elapsed} ms`)) return;
    next();
  };

  next();
}

function storageWorks() {
  try {
    const key = 'at-member-setup-probe';
    window.sessionStorage.setItem(key, '1');
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} key */
function read(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** @param {string} key @param {string} value */
function write(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked: polling still works, it just isn't remembered across pages.
  }
}
