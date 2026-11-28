# Ashley's Pro membership PDP

Status:
- First implementation: November 26, 2026 ([PR #31](https://github.com/swoclott91/ashleys-threads-horizon/pull/31)).
- Second design iteration: November 27, 2026 ([PR #32](https://github.com/swoclott91/ashleys-threads-horizon/pull/32)). It is merged into `dev` only.
- Third iteration: November 27, 2026 ([PR #33](https://github.com/swoclott91/ashleys-threads-horizon/pull/33), into `dev`). It simplifies the page around the revised membership strategy.
- Fourth iteration (this document): November 27, 2026, same branch `pro/membership-pdp-v3`. Mobile above-the-fold purchase, no repeated benefits, and the price comparison moved to actual catalog prices (see Price comparison).
- Theme only. This work makes no Wagner, Shopify admin, product or policy changes. The Wagner route it calls, `GET /apps/wagner/pro-compare`, was built separately in Wagner PR #65 (merged November 27, 2026, behind `PRO_COMPARE_ENABLED`; contract in Wagner `docs/MEMBER_CONTRACT.md` §7).

Live status:
- `main` (the live theme) has the first version, and the Pro product uses the `pro-membership` template, so shoppers see version one.
- Iterations 2 and 3 reach shoppers only when `dev` is merged into `main`.

## Strategy (owner brief, November 27, 2026)

Pro isn't meant to make money on the $79 fee. It makes Ashley's Threads the customer's first choice for blank apparel:

| Benefit | Habit it builds |
|---|---|
| Exclusive Pro pricing | A lower cost structure across the assortment |
| 2% back in Threads Cash | Consolidating purchases with us |
| Up to $15 off shipping on one qualifying order a month | Recurring monthly orders |
| The Pro Promise | No financial hesitation |

The message is **Make more. Keep more.**

Division of labor:
- The PDP builds confidence. It needs no interaction, no calculator and no personal history to make the case.
- The cart will show immediate value ("You could save $X on this order with Pro"). That is a separate workstream; see Cart upsell.
- The recurring benefits build the habit.

Rules the page follows:
- Pro is never marketed as a universal percentage discount.
- Best price wins: discounted products don't necessarily get a further Pro discount.
- Internal margin targets are never shown. They live outside the theme (Wagner).
- The theme never calculates or estimates a tier price. Product prices come only from the Shopify tier catalogs Wagner publishes; the old "Pro price of $100" ratio setting and the labeled estimates were removed in iteration 4.

## Setup (owner)

1. **Template.** Products › *Ashley's Threads Pro Membership* › Theme template › `pro-membership`. This is already set.
2. **Product setting.** Theme settings › **Membership** › *Pro membership product* points at that product.
3. **Promise.** Leave *Pro Promise visibility* on **Theme editor preview only** until the guarantee terms and refund process are final.
4. **Restock link.** Optionally set Theme settings › Membership › *Pro restock link*, the target of "Start a restock" when a Pro member's shipping credit is ready. The default is all products.
5. **Price comparison.** In *Pro: price comparison*, optionally choose a *Curated Pro picks* collection (styles across the assortment where Pro has a real advantage). Wagner shows a curated style only when its actual Pro saving meets *Minimum Pro saving* (5% by default, pending validation).
6. **Wagner route.** Signed-in customers see actual price cards when Wagner's `GET /apps/wagner/pro-compare` answers (flag `PRO_COMPARE_ENABLED`, member app proxy secret set). Otherwise they see a short explanation instead.
7. **Product description.** A draft for review is in `docs/pro-membership-product-description.md`. It hasn't been applied.

## Page sequence (template order)

| # | Section | File |
|---|---|---|
| 1 | Membership hero: membership card and purchase panel | `sections/at-pro-hero.liquid` |
| 2 | Better prices on the blanks you build your business with | `sections/at-pro-price-compare.liquid` |
| 3 | The Ashley's Pro Promise (renders nothing while hidden) | `sections/at-pro-promise.liquid` |
| 4–5 | Rewards that come back every month: Threads Cash steps beside monthly shipping | `sections/at-pro-threads-cash.liquid` (*Pro: rewards*) |
| 6 | Member vs. Pro | `sections/at-pro-compare-table.liquid` |
| 7 | FAQ | `sections/at-pro-faq.liquid` |
| 8 | Closing CTA: "Make more. Keep more." | `sections/at-pro-final-cta.liquid` |

Removed in iteration 3:
- **The calculator:** `snippets/at-pro-calculator.liquid` and the calculator half of `assets/at-pro-value.js`. The brief prefers a static explanation for the first release.
- **`sections/at-pro-benefits.liquid`:** the hero now carries the three benefits, so a second three-card section repeated it.

The sticky bar moved to `assets/at-pro-sticky.js`.

Brief sections 4 and 5 (Threads Cash and monthly shipping) are one section with two panels. That keeps the page shorter and avoids two more full-width card sections.

## Files

| File | Role |
|---|---|
| `snippets/at-pro-config.liquid` | The only reader of Pro program values: fee, rates, shipping rules, Promise mode |
| `snippets/at-pro-value.liquid` | Customer state (A–F), figures and `qualifying` (Threads Cash + shipping); theme editor fixtures |
| `snippets/at-pro-cta.liquid` | Purchase, manage or wholesale action by state; "Become a Pro — [fee]/year" |
| `snippets/at-pro-tokens.liquid` | Program values in editor copy (see Tokens) |
| `snippets/at-pro-emblem.liquid` | Circular stitched Pro seal |
| `assets/at-pro-sticky.js` | `<at-pro-sticky-bar>` (mobile) and the chat-launcher guard |
| `assets/at-pro-compare.js` | `<at-pro-price-compare>`: fetches and renders the signed-in customer's actual Member vs Pro cards |
| `assets/at-pro.css` | Styles; colors and type come from Theme settings › Membership and the theme's buttons |

### Tokens

`[fee] [cash_rate] [ship_max] [ship_min] [free_ship] [ship_year] [cash_cover_spend] [cash_cover_cash]`

- `[ship_year]`: 12 full monthly credits ($180). Always described as a maximum.
- `[cash_cover_spend]`: annual eligible purchases whose Threads Cash covers the fee, rounded up to $100. At $79 and 2%: $3,950 → **$4,000**.
- `[cash_cover_cash]`: the Threads Cash on that spend (**$80**).

Every token comes from rewards or configured program values. The old `[breakeven_*]` tokens came from the Pro price ratio, so they were removed.

## Theme settings (Theme settings › Membership)

| Setting | Default | Notes |
|---|---|---|
| Pro membership product | — | The Pro product |
| Pro identity color / text | `#6C2639` / `#FFF0D7` | Burgundy and cream. Buy buttons stay forest green |
| Membership page / card background | `#FCF0E5` / `#FFFAF3` | |
| Editorial serif | Fraunces | Headlines only; numbers and controls use DM Sans |
| Pro / Member Threads Cash rate (%) | 2 / 0 | |
| Monthly shipping credit max / minimum order ($) | 15 / 100 | The minimum is pending final validation |
| Free standard shipping threshold ($) | 200 | Unchanged for every tier |
| Smallest personal estimate to show ($) | 20 | Floor for a Member's own Pro pricing figure and the homepage tile |
| Pro Promise visibility | Editor preview | Hidden, editor preview or live |
| Pro Promise terms page | — | |
| Pro restock link | — | State E "Start a restock" |

## Hero

### Membership card (left, burgundy, stitched)

Every prospective Pro (states A–D) sees the same card:

1. The emblem beside "Ashley's Pro" and **Make more. Keep more.** (editable), as one identity row.
2. **Exclusive Pro pricing**, the primary benefit: "Lower prices than Member pricing on eligible blanks, built into every order."
3. Two figures side by side, divided by a hairline rather than enclosed in boxes:
   - **2%** back in Threads Cash.
   - **Up to $15** off shipping monthly. (The $180 annual maximum is explained in the rewards section and FAQ.)
4. "Plus everything in your free Ashley's Threads membership."
5. Optionally, one personal line (below).

Eligibility details (first-of-month availability, the qualifying-order minimum) moved down the page. The card has no slider, breakdown, progress bar or margin-derived savings estimate.

### Personal line (Members only, never required)

The hero picks the most specific line the data supports, or none:

1. **"You could have saved an additional $X with Pro pricing on your orders [period]."** All of these must hold:
   - Wagner provides the pricing figure (`pro_value.pricing_savings` or `savings_ytd.pro_would_save`).
   - It is at least the *Smallest personal estimate*.
   - The prices are exact (`exact` isn't false).
   - The period is known (`trailing_12m` → "in the last 12 months"; `calendar_ytd` → "so far this year").

   The theme never reconstructs historical pricing.
2. **"Based on your orders over the past year, Pro could be a great fit for your business."** This shows when:
   - the state is C or D, or
   - the customer's merchandise spend over the last 365 days would earn the fee back in Threads Cash alone (at least $3,950).

When an authoritative cart comparison exists, "save $X on this order" should replace both (see Cart upsell).

### Purchase panel (right, open layout)

- The membership title, then **$79/year** as the largest figure in the column. The fee comes from `at-pro-config`.
- **Become a Pro — $79/year**, the forest-green button, directly after the card on mobile.
- No second benefits list (removed in iteration 4): the card already names every benefit, on desktop too.
- "One payment. 12 months of benefits." There are no renewal or subscription claims.
- Signed-out shoppers get a sign-in note.
- The compact Pro Promise sits below the button, when its visibility allows.

### Mobile

Design objective (iteration 4): title, annual price, the core benefits and the purchase button in the first screen at common phone sizes.

- **Order:** title and $79/year on one row → the compact card → the button → "One payment. 12 months of benefits." → the compact Promise (when visible).
- **Compact card:** tighter padding, a 48px emblem beside the headline, no boxed figures. A `max-height: 700px` rule trims spacing a little more on short phones. No text is below 12px.
- **Measured (guest, dev theme):** at 390×844 the button ends at 636px and the whole purchase block at 686px; at 375×667 the button ends at about 584px.
- **Sticky bar:** "$79/year · Become a Pro". It shows once the main button scrolls above the viewport. Its bottom padding includes `env(safe-area-inset-bottom)` (the theme's viewport meta has `viewport-fit=cover`), and the page reserves the same extra space at the bottom.
- **Chat (Shopify Inbox), through `shopify-chat::part(activator)`:**
  - While the bar shows, the launcher lifts above it (bar height, safe area included). Checked at 375×667: launcher bottom 591px, bar top 599px.
  - On the first screen, the launcher sat on the billing note under the button. It is now hidden only while it overlaps the purchase block (`html[data-at-pro-chat-covering]`), and comes back as soon as the shopper scrolls on. Desktop is unchanged.

## Customer states

`snippets/at-pro-value` decides the state; the hero only presents it.

| State | Who | Card | Action |
|---|---|---|---|
| A | Guest, or Member with no orders | Membership card | Become a Pro (guests sign in first) |
| B | Member, little history | Membership card (+ "great fit" if their spend qualifies) | Become a Pro |
| C | Member, potential value < fee | Membership card + personal line | Become a Pro |
| D | Member, potential value ≥ fee | Membership card + personal line | Become a Pro |
| E | Active Pro | Operational benefits (below) | Manage my membership |
| F | Wholesale | Wholesale recognition | Wholesale account; every section below the hero renders nothing |

### State E (active Pro)

The card shows real membership benefits only. It needs no merchandise pricing ledger:

- **Threads Cash and shipping savings this membership year.** This is the Promise's qualifying value.
- **Progress toward the fee:**
  - Below the fee: "covered 78% of your $79 membership", with a progress bar.
  - At or above the fee: "have covered your $79 membership. Your Pro pricing savings are on top."
- **Promise reminder:** while the Promise is visible and the fee isn't covered yet: "If they don't cover it by the end of your membership year, the Pro Promise refunds the difference."
- **Facts:**
  - Available Threads Cash.
  - Threads Cash issued this membership year.
  - Shipping savings this membership year.
  - This month's shipping credit (ready with its code and "Start a restock", used, or issued on the 1st).
  - Membership active through [date]. It says "active through", not "renews", because there's no automatic renewal.
- **Calendar-year data** (the `savings_ytd` fallback) is labeled "so far this year" and shows no progress toward the fee. It must not look like guarantee progress.

### Theme editor fixtures

Set *Pro membership hero › Theme editor preview*. Every fixture is labeled "Theme editor sample". Fixtures are gated by `request.design_mode` in the hero and in `at-pro-value`, so shoppers never see them.

| Fixture | Shows |
|---|---|
| A, B | Membership card, no personal line |
| C | "…saved an additional $34 … in the last 12 months" |
| D | "…$579…" |
| D · this year's pricing figure | "…$124 … so far this year" |
| E · below the fee | $62 qualifying, 78%, Promise reminder, credit ready |
| E · fee covered | $131 qualifying, "have covered your $79 membership" |
| E · calendar-year data | "so far this year", no progress |
| F | Wholesale |

Below-the-fold sections follow the real tier or *Preview tier as*, not the hero fixture.

## Price comparison

Heading: "Better prices on the blanks you build your business with."

Iteration 4 replaced the theme-side selection and the labeled estimates with actual catalog prices served by Wagner. The theme computes no tier price.

### What each shopper sees

| Shopper | Section |
|---|---|
| Guest | A non-product-specific explanation ("Pro pricing is lower than Member pricing on many styles across our assortment…") and **Sign in to compare**. No products, no prices |
| Signed-in Member or Pro | `<at-pro-price-compare>` asks Wagner for their comparison. Up to 4 compact cards when it answers; otherwise the explanation without numbers |
| Wholesale | Nothing |
| Theme editor | Three cards with labeled sample figures (setting *Show sample cards in the theme editor*), and an editor note that the route isn't live |

Restricted prices never appear in page HTML, Liquid-rendered JSON, public metafields, structured data or a public asset. The response goes only to the signed-in customer's browser, after Shopify signs the request.

### Investigation: where authoritative tier prices live

Checked November 27, 2026 against Wagner `main` and the live store (read-only):

- **Shopify:** three market catalogs, *Member pricing*, *Pro pricing* and *Wholesale pricing*, each with its own price list (USD). Every list's parent adjustment is **0%**, and Wagner writes each tier price as a **fixed price** (about 252k fixed prices each for Member and Pro). A variant with no fixed price inherits the guest price. Example: the OGIO 108084 duffel is $84.92 for guests, $78.38 for Members and $67.04 for Pros.
- **Wagner** already stores the exact tier prices it publishes: `membership.models.TierVariantPrice` keeps one current row per store, tier and variant: price, guest price, reason (`tier`, `deal`, `floor`, `guest_cap`, `no_saving`) and push status (`pushed`, `unchanged`, `not_needed`, `shadow`, `pending`, `failed`).
- **Wagner** already has a reader for both prices: `membership.rewards.orders.price_map(store_key, variant_gids)` returns Member and Pro unit prices per Shopify variant, and the Pro cart-upsell refund (`membership.pro.upsell`) uses it. It reads current rows regardless of push status, so a storefront route must keep only rows that are live in Shopify (see below).
- **Liquid can't do it.** The storefront shows only the shopper's own catalog price (`variant.price`); there is no way to read another tier's price list. Storefront API contexts are by country or buyer, so they can't safely expose another tier's catalog either.
- **Auth already exists.** The member app proxy forwards `/apps/wagner/*` to Wagner, and `membership.proxy.auth.verify_app_proxy_request` checks Shopify's HMAC signature, timestamp and `logged_in_customer_id`. The theme already uses it for favorite colors and profile answers.
- **MAP:** Wagner's `map_policy` treats tier and Member Deal prices as login-only and allowed below MAP; only public (guest, anchor) prices are restricted. Showing a signed-in Member their own Member and Pro prices fits that, as long as nothing reaches a guest or a crawler.

Conclusion: reuse Wagner's `TierVariantPrice` data through a signed app proxy route. No second price sync is needed, and the same service can feed product-level and cart-level upsells later.

### Price comparison route (Wagner PR #65)

Built in Wagner (`membership/proxy/pro_compare.py`, `membership/pro/compare.py`, `membership/pricing/compare.py`), as specified below. It also serves Ashley's customization proxy path. Wagner caches each customer's answer for 120 seconds and rate-limits at 20 a minute. Not yet verified end to end from a signed-in storefront session (see Validation).

```
GET /apps/wagner/pro-compare?limit=4&quantity=72&min_savings=5&curated=<collection handle>&recent=<product ids>
```

Requirements for Wagner:
- `verify_app_proxy_request` (member app proxy secret); `401` if unsigned, `403` without `logged_in_customer_id`; behind a flag (for example `PRO_MEMBERSHIP_ENABLED`); rate-limited like the favorites route.
- Only for an active `MemberAccount` at tier Member or Pro; Wholesale and unknown customers get `403`.
- Responses `Cache-Control: private, no-store`; never logged with prices.
- Prices from current `TierVariantPrice` rows that are live in Shopify: `push_status` `pushed` or `unchanged` with a price; `not_needed` means the variant inherits the guest price. Skip `shadow`, `pending`, `failed` and retired rows, and variants not in both catalogs. Optionally spot-check against the price lists' fixed prices.
- Selection (priority order, each only when the variant's actual Pro saving is at least `min_savings`% of its Member price, never when the prices are equal):
  1. Variants the customer bought (the exact variant from their orders).
  2. Their favorites (`FavoriteColor`; a representative size of that color).
  3. Recently viewed products (`recent`: product ids from the theme's `viewedProducts` local storage; untrusted hints, only used to choose among published products).
  4. The curated collection (`curated`).

  Prefer one product type each (fleece, polos, tees, headwear…), then fill. No brand is hard-coded in or out: a Gildan or Comfort Colors variant qualifies when its actual saving does, and strategic public pricing (best price wins) simply makes most of them fail the threshold. Wagner may enforce a higher floor than the theme's `min_savings`.
- Response (all money as decimal strings in shop currency; the theme validates and formats only):

```json
{
  "currency": "USD",
  "items": [{
    "source": "ordered",
    "url": "/products/ogio-108084-transfer-duffel?variant=54280690925843",
    "title": "Transfer Duffel", "brand": "OGIO", "style": "108084",
    "color": "Black", "size": "OSFA",
    "image": "https://cdn.shopify.com/…",
    "member": "78.38", "pro": "67.04",
    "save": "11.34", "save_pct": "14.5",
    "quantity": 72, "save_quantity": "816.48"
  }]
}
```

The theme drops any item whose figures are missing, malformed or inconsistent (`member − pro ≠ save`, Pro not lower, a non-relative URL or a non-Shopify image) and shows the explanation if none remain. It never repairs a figure.

### Cards

Compact and horizontal: a small product image, the source ("You've ordered this", "One of your favorites", "Recently viewed", "Pro pick"), brand and style, title, exact color and size, then the dominant figure **Save $X per garment** with an "N% less" chip, Member (struck through) and Pro prices, and "On 72 pieces, before quantity discounts: $Y". The section footnote says order savings are examples, not a checkout quote. Wagner publishes no quantity breaks today, so the representative order is the per-garment saving × quantity.

### Fallbacks

- Route missing, signed out, an error, an 8-second timeout, a currency mismatch or no qualifying variants → the explanation without numbers (checked: the route returns 404 today, so signed-in customers see the explanation).
- No estimates, ratios or guessed prices in any case.

## Pro Promise

The intended rule, from the owner. Terms and backend are not final:

```
refund = max(0, membership fee paid − qualifying Threads Cash − redeemed shipping savings)
```

- It is settled at each membership anniversary, every membership year, preferably as an automatic money refund.
- Exclusive Pro pricing savings never count; they are the customer's to keep.

How it appears:
- **Visibility:** Theme settings › Membership › *Pro Promise visibility*. While on editor preview, every Promise surface carries a "Draft · not visible to shoppers" badge.
- **Compact (purchase panel, states A–D):** "Pro pays for itself. We promise. If your Threads Cash and shipping savings don't cover the cost of your annual membership, we'll refund the difference."
- **Section:**
  - Kicker "The Ashley's Pro Promise", the heading, the body, and "And every dollar you save through exclusive Pro pricing is yours to keep."
  - Worked example: $1,000 eligible purchases → $20 Threads Cash (from the configured rate) + $30 shipping savings = $50 qualifying value; $79 fee; **$29 refunded at your membership anniversary**. The example hides itself if it reaches the fee.
  - Rewards-alone line: "About $4,000 a year in eligible purchases earns $80 in Threads Cash, enough to cover the membership through rewards alone."
- **Member vs. Pro:** a Promise row is added while the Promise is visible.
- **State E:** the reminder line described under State E.
- **When hidden:** the section, chip, table row and E reminder render nothing. Checked in shopper view: the section wrapper is 0px tall.

The theme only displays figures. It is not the ledger or the settlement engine.

## Threads Cash and monthly shipping

One section, two panels (stacked on mobile).

**How Threads Cash works**
1. Shop as usual. Earn 2% back on eligible purchases.
2. It's yours on the 1st. Eligible Threads Cash becomes available on the first of each month.
3. Put it toward your next order. Use available Threads Cash toward future eligible orders.

The steps name no vesting, expiry, return-adjustment or redemption rules. The editor sees what is still open while *Terms are final* is off.

**Monthly shipping savings**
- Up to $15 a month, and up to $180 a year in potential shipping savings.
- Rules:
  - One qualifying order a month.
  - At least $100 in merchandise.
  - Orders of $200+ already ship free.
  - The credit can't exceed the actual shipping charge.
  - Unused credits don't roll over.
- An editor note flags the minimum as pending validation and these rules as subject to final terms.

## Member vs. Pro, FAQ, closing CTA

**Member vs. Pro**
- Differences (emphasized): pricing, Threads Cash ("2% back, available monthly"), monthly shipping ("Up to $15 off one order a month"), and the Promise while visible.
- Shared (quiet): favorites, bulk ordering and personalized shopping, and free standard shipping.
- There is no Wholesale column.

**FAQ**

Shown to shoppers:
- How much better is Pro pricing? It says Pro isn't a flat percentage, and that sale items keep the lower price.
- How does Threads Cash work? It covers the first-of-month availability.
- How do the monthly shipping savings work?
- How much do I need to buy for Pro to pay for itself? About $4,000 a year in Threads Cash, with shipping and pricing savings on top.

Pending (editor only):
- Stacking with Member Deals and bulk pricing.
- The Promise, now cash plus shipping only, at each anniversary.
- Benefit start.
- Renewal.
- Cancellation.
- Eligibility.
- New: "Does Threads Cash expire?"

**Closing CTA:** "Make more. Keep more." / "Better everyday pricing. Monthly rewards. Monthly shipping savings." with the same action logic and fee as the hero.

## Data contract

### Read today

| Key | Used for |
|---|---|
| customer `wagner.tier` (via `at-member-tier`) | State E / F, guest vs Member |
| customer `wagner.savings_ytd` | Members: `pro_would_save` for the personal line. Pro: `threads_cash`, `shipping_saved`. Current calendar year only |
| customer `wagner.threads_cash.balance` | State E available Threads Cash |
| customer `wagner.ship_code` (`kind: pro_monthly`) | State E shipping credit status and code |
| customer `wagner.pro_expires` | State E "active through" |
| shop `wagner.tier_thresholds.pro.fee` | Fee (falls back to the Pro product price, then $79). Not set in the store today |
| `customer.orders` (first 20) | "Great fit" spend test |
| `GET /apps/wagner/pro-compare` (Wagner PR #65) | Price comparison cards for signed-in Members and Pros |

### Proposed: customer `wagner.pro_value`, reconsidered

The iteration 2 proposal asked Wagner to reconstruct a Member's historical Pro pricing and simulate shipping benefits. That isn't needed any more:
- The guarantee uses only Threads Cash and redeemed shipping.
- The PDP no longer depends on personal history.

The theme still reads `pro_value` if Wagner ever writes it (`kind`, `period.basis`, `pricing_savings`, `threads_cash`, `shipping_savings`, `exact`), so nothing breaks. It is not a requirement.

The essential record is now **membership-year data for active Pros**. Suggested shape, for owner and Wagner review. The contract was not changed in this pass:

```json
{
  "version": 1,
  "currency": "USD",
  "membership": { "start": "2026-06-15", "end": "2027-06-14", "fee_paid": "79.00" },
  "threads_cash": { "earned": "71.00", "issued": "71.00", "available": "43.00", "pending": "6.00" },
  "shipping": { "credit_status": "ready", "redeemed_value": "60.00" },
  "qualifying_total": "131.00",
  "guarantee": { "status": "not_due", "shortfall": "0.00", "settled_at": null },
  "updated_at": "2026-11-27T08:00:00Z"
}
```

Today's theme mapping:
- `threads_cash.issued` → "Threads Cash issued this membership year".
- `available` → the balance.
- `shipping.redeemed_value` → "Shipping savings this membership year".
- The sum → qualifying value and progress.

Until a record like this exists, State E uses `pro_value` (`kind: actual`) or the calendar-year `savings_ytd` fallback.

### Variant price metafields (dropped)

Iteration 3 read optional variant `wagner.pro_price` / `wagner.member_price` metafields. Iteration 4 removed that: a storefront-readable metafield would publish restricted prices. Use the price comparison route instead.

## Cart upsell (separate workstream, higher priority)

The target message is **"You could save $X on this order with Pro."** It must compare the actual basket with the same basket at Pro pricing, respecting all of these:
- Real variant prices and quantities.
- Best-price-wins.
- Strategic pricing exceptions.
- Promotions and bulk discounts.
- Eligibility.
- Shipping eligibility changes.

Where savings exceed the fee: "add Pro and potentially pay less for this order".

Requirements before building it:
- **Authoritative pricing from Wagner.** The price comparison route's data (current, published `TierVariantPrice` rows) is the shared source; the cart version would price the actual cart lines. Never margin targets or ratios.
- **Same-order Pro activation**, or an equivalent reliable adjustment. Without it the page can't promise immediate savings.

Reuse the Pro identity: the emblem, burgundy and cream, and "Become a Pro — $79/year".

## Purchase flow

- **Signed in, A–D:** the button adds the Pro variant to the cart with `return_to=/checkout`. If Pro is already in the cart, it shows "Check out".
- **Signed out:** the button opens sign-in and returns to the PDP.
- **Pro:** "Manage my membership"; there is no purchase button, so no duplicate membership.
- **Wholesale:** the wholesale account action.
- **Wording:** one-time annual product. "One payment. 12 months of benefits." There are no automatic-renewal or subscription claims, and no selling plans.

## Validation (iteration 4)

Checked on the development theme (`shopify theme dev`) as a guest. A temporary local patch forced the editor-only sample cards on; it was removed afterwards.

| Check | Result |
|---|---|
| Above the fold, 390×844 | Title, $79/year, card, button and billing note in view (button ends 636px, purchase block 686px) |
| Above the fold, 375×667 | Title, $79/year, card and button in view (button ends about 584px) |
| Repeated benefits | No benefits list on mobile or desktop |
| Chat on the first screen | Launcher hidden while it overlaps the purchase block; visible again after scrolling |
| Sticky bar and chat | Bar appears after the button scrolls away; launcher bottom 591px, bar top 599px (375×667) |
| Guest price comparison | Explanation and sign-in only; no product cards, no prices, no sample text in the page |
| Signed-in fallback | With the route missing (404), the explanation shows; cards and footnote stay hidden |
| Sample cards (editor) | Render on mobile (stacked) and desktop (three across), labeled "Sample · editor only" |
| Desktop 1280px | Card and purchase column balanced; comparison cards three across |
| Translations | No missing keys on the page |
| Theme Check | 0 offenses in the Pro files |

Not checked: a real signed-in Member or Pro (the dev theme has no test login), and real route responses. Wagner's route is now merged, but `shopify theme dev` gets a 302 on `/apps/wagner/*` and the storefront is password-protected, so it needs a check in a signed-in storefront session. The theme's checks match the route's output format (two-decimal money strings, one-decimal percent, relative product URL, `cdn.shopify.com` images, `USD`). States A–F were checked in iteration 3; iteration 4 changed only the shared card header and the A–D figures.

Iteration 3 checks (still valid, see PR #33): states A–F, the personal line, no duplicate Pro purchase, Wholesale, Promise hidden, pending FAQs hidden, homepage Pro tile and tokens.

## Known policy conflicts (not resolved in the theme)

- **Member Threads Cash:** Wagner design docs say 1%; the current strategy is 0%.
- **Shipping credit minimum:** Wagner design docs say $40; the brief says $100, pending validation. Wagner's `ship_code.min_subtotal` should match the theme setting.
- **Threads Cash timing:** Wagner design docs post Threads Cash after a ~30-day return window; the brief says it becomes available on the first of each month. Align the two before launch.
- **Not live in Wagner:** Pro activation, the Threads Cash ledger, shipping credit issuance and guarantee settlement.

## Open policy questions

1. **Pro Promise:**
   - Rewards still pending at the anniversary.
   - Refund method and timing (an automatic money refund is preferred).
   - The terms page.
   - Whether partially used shipping credits count at their redeemed value.
2. **Threads Cash:** vesting, expiry, return adjustments, redemption limits, excluded products, and redemption in B2B checkout.
3. **Shipping:** the final minimum; whether standard shipping only.
4. **Stacking:** Pro pricing with Member Deals and bulk pricing (affects the "at bulk pricing" estimate).
5. **Activation:** when Pro pricing starts, and same-order activation (needed for the cart upsell).
6. **Renewal and cancellation.**
7. **Eligibility:** whether Pro needs a registered business.
8. **Guest purchase:** today the button asks guests to sign in first.

## Decisions made without explicit owner guidance (iteration 3)

1. **No calculator.** The brief preferred the static explanation, so the calculator code was deleted rather than kept hidden.
2. **Benefits section removed.** The hero carries the three benefits.
3. **Threads Cash and shipping combined** into one two-panel section (the brief allowed it).
4. **One headline for A–D** ("Make more. Keep more."). The per-state headline settings A–D were removed. E and F keep their own.
5. **Personal-line rules.** The pricing figure needs exact prices and a known period. The "great fit" test uses state C/D or spend that would earn the fee back in Threads Cash.
6. **State E drops pricing savings** and shows Threads Cash and shipping only, with progress on those, matching the new Promise. The date reads "active through", not "renews".
7. **Variety by product type** in the price comparison.
8. **Member Deals** are excluded from estimated comparisons. Compare-at prices are ignored because the store uses them as retail references.
9. **Optional variant `wagner.pro_price` / `wagner.member_price`** are read if present. This is a proposed key, not a contract change; nothing writes it today.
10. **Per-$100 illustration removed** for guests; they get product images and a sign-in prompt instead.
11. **FAQ:** Threads Cash and shipping answers are now visible with decided facts only. Expiry moved to a new pending question.
12. **Settings help text** no longer quotes margin targets.
13. **Fixture E** is now below the fee, and `e_full` was added for the covered case.

## Decisions made without explicit owner guidance (iteration 4)

1. **The desktop benefits list was removed too**, not only on mobile, so nothing repeats the card.
2. **"Plus everything in your free Ashley's Threads membership"** in the card stands in for the fourth benefit.
3. **Chat:** hidden only while it would cover the purchase block on mobile, rather than moved, because there is no free corner on the first screen.
4. **Guests see no product cards.** The brief asked for a non-product-specific explanation, so the staple images were dropped.
5. **No estimates anywhere.** The ratio setting (*Pro price of $100 at Member prices*) and the `ratio_bp` config output were removed.
6. **Selection moved to Wagner.** The theme sends hints (limit, quantity, threshold, curated collection, recently viewed ids) and renders what comes back; it no longer picks styles in Liquid. The *Seller staples* product list became the *Curated Pro picks* collection.
7. **Threshold default 5%**, as a section setting sent to Wagner; Wagner can enforce its own floor.
8. **Card figures come from Wagner** (saving, percent and order saving included), so the theme does no price arithmetic.
9. **Editor sample cards** use invented, clearly labeled figures and product names, only in the theme editor, so the layout can be reviewed before the route exists.

## Remaining backend work (Wagner / admin)

- A membership-year record for Pros (fee paid, Threads Cash earned/issued/available, shipping redeemed, qualifying total, settlement status). See the suggested shape.
- Guarantee settlement at each anniversary, in Wagner, not the theme.
- Authoritative cart Pro pricing and same-order activation (cart upsell).
- **Price comparison route:** built (Wagner PR #65). Remaining: confirm the flag and proxy secret in production, then check it as a signed-in Member and Pro on the storefront.
- Populate shop `wagner.tier_thresholds` (fee, rates).
- Pro activation, the monthly `ship_code` and the Threads Cash ledger (2C; flags off).
- Migrate `sections/at-for-you`, `sections/at-personal-home` and `snippets/at-home-tier-benefits` to `at-pro-value`.
- Apply the product description after approval (`docs/pro-membership-product-description.md`).
