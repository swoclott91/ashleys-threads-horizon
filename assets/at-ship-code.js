/**
 * AT free-shipping code auto-apply (welcome code and Pro monthly codes).
 *
 * `snippets/at-ship-code-autoapply.liquid` renders #AtShipCodeConfig only for a signed-in customer
 * whose `wagner.ship_code` is usable today. Rules:
 * - Apply once per cart (keyed by cart token), and only when the items subtotal is at least the
 *   code's minimum. Below the minimum nothing happens; the cart strip shows "add $X".
 * - Add the code next to the codes already on the cart (Cart AJAX `discount` replaces the whole
 *   list, so the existing codes are sent back with it). Never removes a customer's code.
 * - If the customer removes the code, it stays removed for that cart.
 * - If Shopify says the code doesn't apply (used, not combinable), put the cart's codes back the way
 *   they were.
 * - No storage (private mode, blocked) = no auto-apply, so a removed code can't come back.
 */
import { CartDiscountUpdateEvent, StandardEvents } from '@shopify/events';
import { fetchConfig } from '@theme/utilities';

const STORAGE_PREFIX = 'at-ship-auto:';

/** @returns {{ code: string, min: number, customer: number } | null} */
function readConfig() {
  const el = document.getElementById('AtShipCodeConfig');
  if (!el) return null;
  try {
    const cfg = JSON.parse(el.textContent || '{}');
    if (!cfg.code) return null;
    return { code: String(cfg.code), min: Number(cfg.min) || 0, customer: Number(cfg.customer) || 0 };
  } catch {
    return null;
  }
}

/** @param {string} key */
function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

/** @param {string} key @param {string} value */
function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} a @param {string} b */
const sameCode = (a, b) => a.trim().toUpperCase() === b.trim().toUpperCase();

const config = readConfig();
let busy = false;
let again = false;

async function fetchCart() {
  const root = window.Shopify?.routes?.root || '/';
  const res = await fetch(`${root}cart.js`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`cart.js ${res.status}`);
  return res.json();
}

/** @param {string[]} codes */
async function updateDiscounts(codes) {
  const deferred = CartDiscountUpdateEvent.createPromise();
  document.dispatchEvent(
    new CartDiscountUpdateEvent({
      discountCodes: codes.map((code) => ({ code })),
      promise: deferred.promise,
    })
  );
  try {
    const url = window.Theme?.routes?.cart_update_url || `${window.Shopify?.routes?.root || '/'}cart/update.js`;
    const res = await fetch(url, fetchConfig('json', { body: JSON.stringify({ discount: codes.join(',') }) }));
    const data = await res.json();
    deferred.resolve({ cart: CartDiscountUpdateEvent.createCartFromAjaxResponse(data) });
    return data;
  } catch (error) {
    deferred.reject?.(error);
    throw error;
  }
}

async function check() {
  if (!config) return;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    const cart = await fetchCart();
    if (!cart || !cart.token || !cart.item_count) return;
    if ((cart.items_subtotal_price || 0) < config.min) return;

    const key = `${STORAGE_PREFIX}${config.customer}:${config.code.toUpperCase()}`;
    const done = storageGet(key);
    if (done === undefined || done === cart.token) return; // no storage, or already tried on this cart

    /** @type {{ code: string, applicable?: boolean }[]} */
    const current = Array.isArray(cart.discount_codes) ? cart.discount_codes : [];
    const existing = current.map((d) => d.code).filter(Boolean);
    if (!storageSet(key, cart.token)) return;
    if (existing.some((c) => sameCode(c, config.code))) return; // already on the cart (typed by hand)

    const data = await updateDiscounts([...existing, config.code]);
    const ours = (data?.discount_codes || []).find((/** @type {{ code: string }} */ d) => sameCode(d.code, config.code));
    if (!ours || ours.applicable === false) {
      // Not usable on this cart: leave the customer's codes exactly as they were.
      await updateDiscounts(existing);
    }
  } catch (error) {
    console.warn('[at-ship-code]', error);
  } finally {
    busy = false;
    if (again) {
      again = false;
      void check();
    }
  }
}

if (config) {
  document.addEventListener(StandardEvents.cartLinesUpdate, (event) => {
    const promise = /** @type {{ promise?: Promise<unknown> }} */ (event).promise;
    if (promise) promise.then(check, check);
    else void check();
  });
  void check();
}
