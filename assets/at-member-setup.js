/**
 * Member setup notice (snippets/at-member-setup.liquid).
 *
 * A new account signs in before Wagner finishes setting it up (company, Member location, then
 * the `wagner.tier` metafield; usually a few seconds). Until the session buys for that
 * location the page shows guest prices. This polls sections/at-member-setup-data.liquid,
 * which Shopify renders (never Wagner), and:
 * - reloads once the session is buying for a company location (Member prices now apply);
 * - otherwise, once Shopify offers the tier location, opens its "set as current" URL, which
 *   switches the session without signing out and comes back with Member prices;
 * - stops after about 3 minutes and asks the customer to refresh later. That choice is kept
 *   for 15 minutes in sessionStorage so other pages don't start polling again.
 */
const DELAYS_MS = [1500, 2000, 3000, 3000, 5000, 5000, 10000, 10000, 15000, 15000, 30000, 30000, 30000, 30000];
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
  const text = el.querySelector('[data-at-member-setup-text]');
  const close = el.querySelector('[data-at-member-setup-close]');
  const root = el.dataset.sectionUrl || '/';
  const url = `${root}${root.includes('?') ? '&' : '?'}sections=at-member-setup-data`;

  const stoppedAt = Number(read(stopKey) || 0);
  if (stoppedAt && Date.now() - stoppedAt < STOP_FOR_MS) return;

  el.hidden = false;
  close?.addEventListener('click', () => {
    el.hidden = true;
  });

  let attempt = 0;

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
      const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
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
      console.warn('Member setup check failed; trying again', error);
    }

    if (status && status.signedIn === false) {
      el.hidden = true;
      return;
    }
    if (status && status.b2b) {
      if (text) text.textContent = 'Your Member prices are ready. Updating the page.';
      window.location.reload();
      return;
    }
    // Switch once per page session; if Shopify comes back without a location, keep polling.
    if (status && status.setLocationUrl && !read(switchKey)) {
      write(switchKey, '1');
      if (text) text.textContent = 'Your Member prices are ready. Updating the page.';
      window.location.assign(status.setLocationUrl);
      return;
    }
    next();
  };

  next();
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
