# Ashley's Pro membership PDP

Status: first implementation, November 26, 2026. Theme only. No Wagner, Shopify admin or
policy changes are made by this work.

The Pro PDP is the middle of one customer conversation:

| Surface | Job | Presentation |
|---|---|---|
| Homepage Pro tile (`blocks/at-home-pro-estimate`) | Why you should consider Pro | Compact: one number + link |
| Pro PDP (`templates/product.pro-membership.json`) | What Pro could mean for your business | Expanded: states, ledger, calculator |
| Pro dashboard (account, later) | The value you've received | Same figures as PDP state E |

All three read the same snippet, so a number on the homepage tile is the number on the PDP.

## Setup (owner)

1. Assign the template: Products › *Ashley's Threads Pro Membership* › Theme template ›
   `pro-membership`. (The product is `gid://shopify/Product/15495114129683`, SKU
   `WAGNER-PRO-1Y`, $79, one-time, no selling plans.) Not done by this branch.
2. Theme settings › **Membership** › *Pro membership product*: set to that product
   (`config/settings_data.json` already points at `ashleys-threads-pro-membership`). The
   homepage Pro tile links to it when its own link is empty.
3. Leave *Pro Promise visibility* on **Theme editor preview only** until the guarantee terms
   are final.

## Files

| File | Role |
|---|---|
| `snippets/at-pro-config.liquid` | The only reader of Pro program values (fee, ratio, rates, shipping rules, Promise mode) |
| `snippets/at-pro-value.liquid` | Customer state (A–F) and figures; dev fixtures in the theme editor |
| `assets/at-pro-value.js` | Calculator math (`estimateProValue`) + `<at-pro-calculator>`, `<at-pro-sticky-bar>` |
| `snippets/at-pro-calculator.liquid` | Calculator markup (compact and expanded), shared by hero and section 3 |
| `snippets/at-pro-cta.liquid` | Purchase / manage / wholesale action by state |
| `snippets/at-pro-tokens.liquid` | `[fee] [cash_rate] [ship_max] [ship_min] [free_ship] [breakeven_annual] [breakeven_monthly]` in editor copy |
| `snippets/at-pro-emblem.liquid` | Circular stitched Pro seal with the needle-and-thread monogram |
| `sections/at-pro-hero.liquid` | Above the fold: value panel + purchase panel + mobile sticky bar |
| `sections/at-pro-benefits.liquid` … `at-pro-final-cta.liquid` | Below-the-fold sections 1–8 |
| `assets/at-pro.css` | Styles; colors and type from Theme settings › Membership and the theme's buttons |

## Theme settings added (Theme settings › Membership)

| Setting | Default | Notes |
|---|---|---|
| Pro membership product | — | Set in `settings_data.json` to the Pro product |
| Pro identity color | `#6C2639` | Burgundy (palette color 13). Buy buttons stay on the primary forest-green button |
| Text on Pro identity color | `#FFF0D7` | Homepage cream |
| Membership page background | `#FCF0E5` | |
| Membership card background | `#FFFAF3` | |
| Editorial serif | Fraunces | Membership editorial headlines only; numbers and controls use the body font |
| Pro price of $100 at Member prices (cents) | 8553 | Calculator and labeled estimates |
| Pro / Member Threads Cash rate (%) | 2 / 0 | Member earns no Threads Cash (owner, Nov 26, 2026) |
| Monthly shipping credit max / minimum order ($) | 15 / 100 | Pending financial validation |
| Free standard shipping threshold ($) | 200 | Unchanged for every tier |
| Smallest personal estimate to show ($) | 20 | Below this, state B (no small historical number) |
| Pro Promise visibility | Editor preview | Hidden / editor preview / live |
| Pro Promise terms page | — | |

CSS variables (`snippets/color-palette.liquid`): `--at-pro-identity`, `--at-pro-identity-rgb`,
`--at-pro-identity-ink`, `--at-membership-surface`, `--at-membership-card`. The homepage tile
and the amber `--at-tier-pro` price label / header ring still hardcode their colors; moving
them to these variables is a follow-up (owner chose PDP-only for now).

## Customer states

`snippets/at-pro-value` decides the state; sections only present it.

| State | Who | Value panel | Action |
|---|---|---|---|
| A | Guest, or Member with no orders | Opportunity + compact calculator (illustrative) | Become a Pro (guests sign in first) |
| B | Member, potential value < *smallest personal estimate* | "Make your next order go further" + calculator, prefilled from their average month if larger | Become a Pro |
| C | Member, potential value < fee | Itemized potential value, % of fee covered, progress bar | Become a Pro |
| D | Member, potential value ≥ fee | Largest number is their potential value; net after fee; "would have paid for itself" | Become a Pro |
| E | Active Pro | Actual value this membership year, fee recovered, Threads Cash balance, this month's shipping credit, renewal date | Manage my membership |
| F | Wholesale | Recognizes the account; no upsell; below-fold upsell sections hidden | Wholesale account |

Historical figures are labeled as what the customer *could have saved*, never as rewards to be
issued. Nothing is annualized from a single order; projections exist only in the calculator.

Theme editor: *Pro membership hero › Theme editor preview* loads a labeled fixture for each
state (state D uses the brief's $579 / $68 / $90 example). Below-fold sections follow the real
or *Preview tier as* state, not the hero fixture.

## Data contract

### Read today (membership contract §5)

| Key | Used for |
|---|---|
| customer `wagner.tier` (via `at-member-tier`) | State E / F, guest vs Member |
| customer `wagner.savings_ytd` | Fallback figures. Members: `pro_would_save` → pricing line. Pro: `pro_would_save`, `threads_cash`, `shipping_saved`. Current calendar year only |
| customer `wagner.threads_cash.balance` | State E available balance |
| customer `wagner.ship_code` (`kind: pro_monthly`) | State E shipping credit status |
| customer `wagner.pro_expires` | State E renewal date |
| shop `wagner.tier_thresholds.pro.fee` | Fee (falls back to the Pro product price, then $79). Not set in the store today |
| `customer.orders` (first 20, last 365 days) | Calculator prefill only (merchandise lines, not cancelled/refunded) |

With only `savings_ytd`, Members see the pricing line alone (Threads Cash and shipping lines are
hidden, not shown as $0). That is the same number the homepage tile showed before this change.

### Proposed: customer `wagner.pro_value` (json) — needs an owner-approved contract change

One precomputed record per customer, written by Wagner (2C), so every surface reads the same
figures and the theme never reconstructs historical pricing.

```json
{
  "version": 1,
  "currency": "USD",
  "kind": "potential",
  "period": { "start": "2025-11-26", "end": "2026-11-25", "basis": "trailing_12m" },
  "member_spend": "4000.00",
  "pricing_savings": "579.00",
  "threads_cash": "68.00",
  "shipping_savings": "90.00",
  "other_savings": "0.00",
  "total": "737.00",
  "fee": "79.00",
  "qualifying_orders": 14,
  "shipping_credit_months": 6,
  "exact": true,
  "updated_at": "2026-11-26T08:00:00Z"
}
```

- `kind: "potential"` (Members): what their eligible orders in the period would have cost at Pro.
  - Pricing: net merchandise paid minus the equivalent Pro price per variant, after the same sale
    and bulk discounts, net of returns and cancellations. `exact: false` when Pro prices had to be
    estimated (the theme then still shows it; add a label if the owner wants one).
  - Threads Cash: Pro rate × equivalent eligible Pro merchandise spend (Member rate is 0).
  - Shipping: simulate one credit per calendar month on the first qualifying order (merchandise ≥
    minimum, standard shipping, not already free), capped at the credit max and the actual charge.
- `kind: "actual"` (Pro, `basis: "membership_year"`): incremental savings vs what the same customer
  would have paid as a Member at the time; vested Threads Cash earned; shipping credits redeemed;
  `other_savings` = other Pro-only discounts. Excludes unused credits, Member-available discounts,
  returned or cancelled merchandise, and anything hypothetical.
- Guarantee shortfall (for the Promise, settled by Wagner): `max(0, fee − total)` on `kind: actual`.

The theme prefers `pro_value` when present and falls back to `savings_ytd`; no theme change is
needed when Wagner starts writing it.

### Calculator math (`assets/at-pro-value.js`)

Spending basis: monthly blank apparel spend at standard Member prices, including other suppliers.

```
proSpend  = memberSpend × ratio                          (ratio = 0.8553)
pricing   = memberSpend − proSpend                       ($14.47 per $100)
cash      = proSpend × (Pro rate − Member rate)          ($1.71 per $100)
shipping  = 12 × min(shipping charge, credit max)  when an average restock at Pro prices is
            ≥ credit minimum and < free shipping threshold; otherwise 0
total     = pricing + cash + shipping;  net = total − fee
break-even (pricing + cash only) = fee ÷ (1 − ratio + ratio × cash rate) ≈ $489 a year
```

Section 2 (price comparison) uses the same ratio: Members see their real Member price and an
**estimated** Pro price; Pros see their real Pro price and an estimated Member price. Guests see
no product numbers (MAP rule) — only the per-$100 illustration and a sign-in prompt.

## Purchase flow

- Signed in, states A–D: the button posts the Pro variant to `/cart/add` with `return_to=/checkout`.
  It goes straight to checkout alongside any merchandise already in the cart. If Pro is already in
  the cart, the button becomes "Check out".
- Signed out: the button opens sign-in and returns to the PDP (Pro is attached to a customer
  account / company location).
- Pro and Wholesale never see a purchase button.
- Mobile: a sticky bar ($79/year + Become a Pro) appears once the main button scrolls away.

## Open policy questions (not published to shoppers)

FAQ entries marked *Answer pending policy* are hidden from shoppers and shown in the theme editor
with a Pending badge. The Threads Cash section shows a "terms coming" note until *Terms are final*
is turned on. The Promise is editor-preview only.

1. **Pro Promise**: first year vs every year; automatic shortfall refund timing and method; formal terms page.
2. **Threads Cash**: when it posts (Wagner design: after ~30-day return window), expiry (design: 12 months), excluded products (design: anchor variants, 12% featured deals), redemption in B2B checkout.
3. **Shipping credit**: $100 minimum vs Wagner design's $40 and the "~$15 of label cost" cap; standard-only rule. Wagner's `ship_code.min_subtotal` should match the theme setting.
4. **Stacking**: Pro pricing with sales, Member Deals and bulk discounts.
5. **Activation**: when Pro pricing starts; whether merchandise bought in the same order as the membership gets Pro pricing (Wagner design: refund the Member–Pro difference after payment — not promised on the page).
6. **Renewal and cancellation**: one-time annual product today; auto-renew, grace period, cancellation and refund terms.
7. **Eligibility**: whether Pro needs a registered business.
8. **Guest purchase**: whether a signed-out shopper may buy Pro at checkout (today the button asks them to sign in first).
9. **Customer-facing savings percentage**: the page avoids quoting "~14.5%"; the calculator still implies it. Confirm that is acceptable given margins are internal.

## Remaining backend work (Wagner / admin)

- Contract change + writer for `wagner.pro_value` (potential and actual).
- Populate shop `wagner.tier_thresholds` (fee, rates) — today the theme falls back to settings.
- Pro activation on paid membership order, renewal, monthly `ship_code`, Threads Cash ledger (2C; flags off).
- Optional variant `wagner.pro_price` to replace estimated prices in section 2.
- Migrate `sections/at-for-you`, `sections/at-personal-home` and `snippets/at-home-tier-benefits`
  (still reading `savings_ytd` directly) to `at-pro-value`, and the account dashboard when built.
