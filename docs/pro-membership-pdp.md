# Ashley's Pro membership PDP

Status:
- First implementation: November 26, 2026.
- Second design iteration: November 27, 2026. It covers visual polish, value-first storytelling, a single calculator, product price cards, the Pro Promise preview and mobile fixes.
- Theme only. This work makes no Wagner, Shopify admin or policy changes.

Live status (found November 27, 2026):
- The first implementation was merged into `dev` and `main` ([PR #31](https://github.com/swoclott91/ashleys-threads-horizon/pull/31)).
- The live theme, `ashleys-threads-horizon/main`, has `templates/product.pro-membership.json`.
- The Pro product's template suffix is `pro-membership`.
- So the first version is live for shoppers. Iteration 2 lives on the development theme until it is reviewed.

The Pro PDP is the middle of one customer conversation:

| Surface | Job | Presentation |
|---|---|---|
| Homepage Pro tile (`blocks/at-home-pro-estimate`) | Why you should consider Pro | Compact: one number and a link |
| Pro PDP (`templates/product.pro-membership.json`) | What Pro could mean for your business | Expanded: states, breakdown, calculator |
| Pro dashboard (account, later) | The value you've received | Same figures as PDP state E |

All three read the same snippet, so a number on the homepage tile is the number on the PDP.

Guiding idea: the page demonstrates why Pro is worthwhile; it does not ask the customer to work it out. Each state leads with the value. The financial tools back up the proposition; they are not the proposition.

Messaging order, everywhere on the page:
1. Exclusive Pro pricing improves margins.
2. Threads Cash rewards consolidating purchases with us.
3. The monthly shipping credit gives customers a reason to shop with us first.
4. The Pro Promise removes the risk, once it is finalized.

## Setup (owner)

1. **Template.** Products › *Ashley's Threads Pro Membership* › Theme template › `pro-membership`. The product is `gid://shopify/Product/15495114129683`, SKU `WAGNER-PRO-1Y`, $79, one-time, no selling plans. This is already set; see Live status.
2. **Product setting.** Theme settings › **Membership** › *Pro membership product* points at that product.
3. **Promise.** Leave *Pro Promise visibility* on **Theme editor preview only** until the guarantee terms are final.
4. **Restock link.** Optionally set Theme settings › Membership › *Pro restock link*. It is where "Start a restock" goes when a Pro member's monthly shipping credit is ready. The default is all products.
5. **Price comparison.** In the *Pro: price comparison* section, keep 3–4 *Seller staples* from different categories. They are used after a customer's own styles.

## Page sequence (template order)

The sections can be reordered in the theme editor.

| # | Section | File |
|---|---|---|
| 1 | Personalized hero: value panel and purchase panel | `sections/at-pro-hero.liquid` |
| 2 | Three ways Pro works for your business | `sections/at-pro-benefits.liquid` |
| 3 | Better prices on the blanks you already buy | `sections/at-pro-price-compare.liquid` |
| 4 | The Pro Promise (renders nothing while hidden) | `sections/at-pro-promise.liquid` |
| 5 | How Threads Cash works | `sections/at-pro-threads-cash.liquid` |
| 6 | Member vs. Pro | `sections/at-pro-compare-table.liquid` |
| 7 | FAQ | `sections/at-pro-faq.liquid` |
| 8 | Closing CTA: "Make more. Keep more." | `sections/at-pro-final-cta.liquid` |

Iteration 2 removed the separate expanded calculator section (`sections/at-pro-calculator.liquid`). There is now one calculator, in the hero (see Calculator). The Promise took its place in the sequence.

## Files

| File | Role |
|---|---|
| `snippets/at-pro-config.liquid` | The only reader of Pro program values: fee, ratio, rates, shipping rules, Promise mode |
| `snippets/at-pro-value.liquid` | Customer state (A–F) and figures, plus `complete` and `exact`; dev fixtures in the theme editor |
| `assets/at-pro-value.js` | Calculator math (`estimateProValue`), `<at-pro-calculator>` and `<at-pro-sticky-bar>` |
| `snippets/at-pro-calculator.liquid` | The calculator, value first; assumptions sit behind a disclosure |
| `snippets/at-pro-cta.liquid` | Purchase, manage or wholesale action by state; "Become a Pro — [fee]/year" |
| `snippets/at-pro-tokens.liquid` | `[fee] [cash_rate] [ship_max] [ship_min] [free_ship] [breakeven_annual] [breakeven_monthly]` in editor copy |
| `snippets/at-pro-emblem.liquid` | Circular stitched Pro seal with the needle-and-thread monogram (xs, sm, md, lg) |
| `assets/at-pro.css` | Styles; colors and type come from Theme settings › Membership and the theme's buttons |

## Theme settings (Theme settings › Membership)

| Setting | Default | Notes |
|---|---|---|
| Pro membership product | — | Set in `settings_data.json` to the Pro product |
| Pro identity color | `#6C2639` | Burgundy. Buy buttons stay on the primary forest-green button |
| Text on Pro identity color | `#FFF0D7` | Homepage cream |
| Membership page background | `#FCF0E5` | |
| Membership card background | `#FFFAF3` | |
| Editorial serif | Fraunces | Editorial headlines only; numbers and controls use DM Sans |
| Pro price of $100 at Member prices (cents) | 8553 | Calculator, labeled estimates and the per-$100 illustration |
| Pro / Member Threads Cash rate (%) | 2 / 0 | Member earns no Threads Cash (owner, Nov 26, 2026) |
| Monthly shipping credit max / minimum order ($) | 15 / 100 | Pending financial validation |
| Free standard shipping threshold ($) | 200 | Unchanged for every tier |
| Smallest personal estimate to show ($) | 20 | Below this, state B (no small historical number) |
| Pro Promise visibility | Editor preview | Hidden, editor preview or live |
| Pro Promise terms page | — | |
| Pro restock link | — | **New in iteration 2.** Target of "Start a restock" in state E |

CSS variables (`snippets/color-palette.liquid`):
- `--at-pro-identity`, `--at-pro-identity-rgb`, `--at-pro-identity-ink`
- `--at-membership-surface`, `--at-membership-card`

The shipping benefit card uses a tint of the theme's primary button color, so no new color setting is needed. The homepage tile and the amber `--at-tier-pro` price label and header ring still hardcode their colors. Moving them is a separate membership-identity pass.

## Hero

### Value panel (left, burgundy, stitched)

Reading order:
1. Editorial headline
2. Primary number
3. What that number means
4. A short breakdown
5. The break-even conclusion
6. Controls

The slider always comes after the value.

Typography:
- The primary number is DM Sans 700 with tabular figures, at 3.5–6rem.
- Breakdown rows are quieter, with one divider above the fee.
- The progress bar appears only below break-even. Above it, a check-mark success line replaces the bar.

### Purchase panel (right, open layout, no enclosing card)

- **Identity group:** seal, kicker and title, then a large `[fee]` with "per year". The fee comes from `at-pro-config`, never hardcoded.
- **Value proposition.**
- **Four benefit rows** with theme icons (`icon-discount`, a coin drawn in the same stroke style, `icon-orders`, `icon-checkmark`). Exclusive Pro pricing leads with a filled burgundy icon and a larger title.
- **Action:** "Become a Pro — [fee]/year", the billing note ("One payment for 12 months of Pro.") and the sign-in note for guests.
- **Compact Pro Promise** below the action: "Pro pays for itself. We promise."

### Mobile

- **Order:** identity and `$79` come first. The value panel and the primary number are on the first screen at 375px, followed by the purchase panel.
- **Sticky bar:** "$79/year · Become a Pro".
  - It appears once the main button has scrolled above the viewport.
  - It uses a scroll check, not an IntersectionObserver, so a jump past the button (an anchor link, a restored scroll position) still shows it.
  - It respects the safe area.
- **Chat launcher:** while the bar shows, the Shopify Inbox launcher moves up through the widget's exposed `shopify-chat::part(activator)`. The chat window itself is untouched, and chat isn't hidden.

## Customer states

`snippets/at-pro-value` decides the state; sections only present it.

| State | Who | Headline (editable) | Primary number | Then |
|---|---|---|---|---|
| A | Guest, or Member with no orders | Better margins for your business. | Calculator: estimated net savings after the fee | Breakdown, "Pro could pay for itself…", spend slider, assumptions |
| B | Member, potential value < smallest personal estimate | Make your next order go further. | Same calculator; prefilled from their average month only if larger than the example | — |
| C | Member, potential value < fee | Your orders could earn you more. | Potential value (all lines known) or *potential Pro pricing savings* (pricing only) | Breakdown, progress bar, "% of the fee covered", Promise line (when on), *Estimate your next 12 months* |
| D | Member, potential value ≥ fee | Your business is ready for Pro. | Net after the fee (all lines known) or *potential Pro pricing savings* (pricing only) | Breakdown with fee, "Pro would have paid for itself" or "Pro pricing alone would have covered the fee", *Estimate your next 12 months* |
| E | Active Pro | Your Pro membership at work. | Value received this membership year, or *Pro savings so far this year* for calendar-year data | Breakdown, progress until the fee is recovered then a celebration, shipping credit ready (code and "Start a restock"), balance, renewal |
| F | Wholesale | You already have wholesale pricing. | — | Wholesale account action; every acquisition section renders nothing |

### Period and completeness rules

These are enforced in the hero.

**Period wording follows `basis`:**
- `trailing_12m`: "in the last 12 months"
- `calendar_ytd`: "so far this year"
- `membership_year`: "this membership year"

Calendar-year data is never called annual, past-12-month or membership-year.

**`complete = 0`** means some lines are unknown. Today Members get Wagner's pricing savings alone. In that case:
- The number is labeled *Potential Pro pricing savings*, never a total or a net.
- The missing lines are named ("Threads Cash and shipping savings aren't included yet…"). They are never shown as $0.

**`exact = 0`** (from `wagner.pro_value.exact`) adds "Some Pro prices are estimated."

**State E with calendar-year data** shows no progress toward the fee. It says the membership-year total will appear later. Calendar-year savings must not look like guarantee progress.

**Historical figures:**
- Every historical figure carries "This is what Pro could have saved you, priced at Pro. It isn't a credit and isn't applied to past orders."
- Historical and future figures never share inputs. The C/D future estimate is a separate, collapsed calculator, labeled as hypothetical.
- In C/D it is prefilled from the customer's own average month whenever one exists, so it starts from their real pattern rather than the $500 example.

### Theme editor fixtures

Set *Pro membership hero › Theme editor preview* to a state. Each fixture is labeled "Theme editor sample". Fixtures are gated by `request.design_mode` in both the hero and `at-pro-value`, so shoppers never see them.

| Fixture | Data |
|---|---|
| D | The brief's $579 / $68 / $90 example |
| D · Pricing savings only (this year) | `savings_ytd` shape: pricing only, calendar year |
| E | Membership year, paid for itself, shipping credit ready |
| E · Active Pro (calendar-year data) | `savings_ytd` shape for a Pro member |

Below-the-fold sections follow the real tier or *Preview tier as*, not the hero fixture.

## Calculator

There is one calculator, `snippets/at-pro-calculator` and `<at-pro-calculator>`, in the hero for A/B and inside *Estimate your next 12 months* for C/D.
- **Default view:** monthly spend slider plus estimated net annual savings.
- **Assumptions:** restocks a month and shipping per restock sit behind "Adjust spending and shipping assumptions". The summary line restates the current assumption, pluralized.
- **Slider sync:** the slider and the number field stay in step. Typing above the slider maximum raises the maximum.

Spending basis: monthly blank apparel spend at Ashley's Threads Member prices, including what the customer buys elsewhere. Spending with other suppliers is an input for estimating, not a comparison with their prices.

```
proSpend  = memberSpend × ratio                          (ratio = 0.8553)
pricing   = memberSpend − proSpend                       ($14.47 per $100)
cash      = proSpend × (Pro rate − Member rate)          ($1.71 per $100)
shipping  = 12 × min(shipping charge, credit max)  when an average restock at Pro prices is
            ≥ credit minimum and < free shipping threshold; otherwise 0 (one credit a month)
total     = pricing + cash + shipping;  net = total − fee
break-even (pricing + cash only) = fee ÷ (1 − ratio + ratio × cash rate) ≈ $489 a year (~$41/month)
```

Checked in the browser:

| Input | Result |
|---|---|
| $500/month, 3 restocks, $12 shipping | $868 + $103 + $144 − $79 = **$1,036** net, "pays for itself in your first month" |
| 1 restock | $427 at Pro prices ships free, so shipping is $0 |
| $30 shipping | Capped at $15, so $180 |
| $250/month | Average restock is below $100, so shipping is $0; payback about 2 months |
| $0 or negative | Total shown with the progress view and the ~$41/month break-even line |

The payback line says "could", and the disclaimer says it is an estimate, not a promise of when a membership recovers its cost. The $180 a year shipping figure is always described as a maximum.

## Price comparison

The heading is "Better prices on the blanks you already buy."

### Signed-in Members and Pros

They see up to 4 cards, in this priority:
1. **Their own orders** (first 20 orders, cancelled orders skipped), most often bought first. These are labeled "You order this often" or "In your recent orders".
2. **Their favorites** (customer `wagner.favorite_products`).
3. **Curated seller staples** from the section setting. The template ships a tee, a premium tee, a hoodie and a cap.

Recently viewed styles are not used. That list exists only in the browser, and restricted prices must be rendered on the server for the signed-in customer, never put in client-side markup.

### Each card

- The variant image, vendor, title and "Price for [variant]".
- **Member price** and **Pro price**. The Pro price is on a burgundy tile.
- The estimated side is labeled "(est.)":
  - Members see an estimated Pro price (Member price × ratio).
  - Pros see an estimated Member price (Pro price ÷ ratio).
  - The footnote says estimated Pro prices aren't prices you can buy at yet.
- "Save $X per garment".
- "On [qty] pieces: $Y". It uses the variant's quantity price break at that quantity when the catalog has one ("at bulk pricing"), and otherwise says "before quantity discounts".

### Guests and others

- **Guests:** the per-$100 illustration (`$100` → `$85.53` → `$14.47` stays in your business) and a sign-in prompt. No product prices are shown (MAP).
- **Members or Pros with no styles to show:** the same illustration, without the sign-in prompt. The editor sees a setup note. The section is never left as a heading over an empty area.
- **Wholesale:** the section renders nothing.

Why the first version looked empty: the template had no products configured. Signed-in Members and Pros (and the editor's *Preview tier as* Member or Pro) got the heading and nothing else; guests saw the illustration. The fallback chain above fixes this.

## Pro Promise

- **Mode:** Theme settings › Membership › *Pro Promise visibility* (hidden, editor preview or live). Preview shows "Draft · not visible to shoppers" badges.
- **Compact (hero):** "Pro pays for itself. We promise." and "If your qualifying Pro savings don't cover the cost of your membership, we'll refund the difference." It isn't shown to Pro or Wholesale.
- **State C panel:** one line. "Once finalized, the Pro Promise refunds the difference if your membership doesn't pay for itself."
- **Section:** stitched burgundy card, the seal, the heading, the body with `[fee]`, and "Qualifying savings combine exclusive Pro pricing, Threads Cash earned and shipping savings". The guarantee is based on combined value.
- **Worked example:** $40 + $10 + $15 = $65; fee $79; **refund of the difference $14**. The fee comes from config. The example hides itself if it adds up to the fee or more.
- **Member vs. Pro:** a row is added automatically while the Promise is visible.
- **When hidden:** the section, chip and table row render nothing, so there is no gap. Checked: the section is 0px tall.

## Supporting sections

- **Three benefits:** one big idea per card. There is no stitching; stitching is reserved for the hero and the Promise.
  - 01 Exclusive Pro pricing: burgundy, links to the price comparison.
  - 02 **2%**: cream.
  - 03 **Up to $180/year**: green tint. The copy says "the most you can save, not a guaranteed amount".
- **Threads Cash:** a horizontal three-step process on desktop (numbered seals joined by a dashed line), vertical on mobile.
  - Step 3 says "Once it posts to your account, apply it as store credit at checkout". It never says "next order".
  - While *Terms are final* is off, shoppers see no unfinished-policy notice (the shopper note is blank by default). The editor sees what is still open.
- **Member vs. Pro:** rows marked *Pro difference* are emphasized: pricing, Threads Cash, the shipping credit and the Promise. Shared benefits are quieter. Members show 0% (—) Threads Cash. There is no Wholesale column.
- **FAQ:**
  - The heading and intro sit beside a wide accordion on desktop, so two visible questions don't leave an empty column.
  - Pending answers stay hidden from shoppers and show a "Pending policy" badge in the editor.
  - The answers to unresolved policies are placeholders that describe what is still open; they are not published as answers.
- **Final CTA:** "Make more. Keep more." with the same action logic as the hero and "Become a Pro — [fee]/year".

### Spacing

Each section is wrapped in its own `.shopify-section`. The first version padded every section on both sides, which doubled the gaps. Sections now pad the bottom only (`clamp(40px, 5.6vw, 88px)`), about 30% less space between sections.

## Data contract

### Read today (membership contract §5)

| Key | Used for |
|---|---|
| customer `wagner.tier` (via `at-member-tier`) | State E / F, guest vs Member |
| customer `wagner.savings_ytd` | Fallback figures. Members: `pro_would_save` → pricing line. Pro: `pro_would_save`, `threads_cash`, `shipping_saved`. Current calendar year only (`basis = calendar_ytd`) |
| customer `wagner.threads_cash.balance` | State E available balance |
| customer `wagner.ship_code` (`kind: pro_monthly`) | State E shipping credit status and code |
| customer `wagner.pro_expires` | State E renewal date |
| customer `wagner.favorite_products` | Price comparison, after the customer's own orders |
| shop `wagner.tier_thresholds.pro.fee` | Fee (falls back to the Pro product price, then $79). Not set in the store today |
| `customer.orders` (first 20) | Calculator prefill (last 365 days, merchandise lines) and the price-comparison styles |

With only `savings_ytd`, Members see the pricing line alone, labeled *Potential Pro pricing savings … so far this year*. The Threads Cash and shipping lines are named as not included yet, not shown as $0.

### Proposed: customer `wagner.pro_value` (json)

This needs an owner-approved contract change. It would be one precomputed record per customer, written by Wagner (2C), so every surface reads the same figures and the theme never reconstructs historical pricing. The theme is a presentation layer, not the membership ledger or the guarantee settlement engine.

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

**`kind: "potential"`** (Members) is what their eligible orders in the period would have cost at Pro.
- **Pricing:** net merchandise paid, minus the equivalent Pro price per variant after the same sale and bulk discounts, net of returns and cancellations.
- **`exact: false`:** some Pro prices had to be estimated. The theme labels the figure "Some Pro prices are estimated."
- **Threads Cash:** the Pro rate × equivalent eligible Pro merchandise spend (the Member rate is 0).
- **Shipping:** simulate one credit per calendar month on the first qualifying order (merchandise ≥ minimum, standard shipping, not already free), capped at the credit max and the actual charge.

**`kind: "actual"`** (Pro, `basis: "membership_year"`):
- Incremental savings compared with what the same customer would have paid as a Member at the time.
- Vested Threads Cash earned and shipping credits redeemed.
- `other_savings` covers other Pro-only discounts.
- It excludes unused credits, discounts Members also get, returned or cancelled merchandise, and anything hypothetical. It must not double-count overlapping discounts.

**Guarantee shortfall:** `max(0, fee − total)` on `kind: actual`, settled by Wagner, not the theme.

**Theme behavior:**
- It prefers `pro_value` when present and falls back to `savings_ytd`.
- It uses the record's own `period.basis` for labels.
- It hides any line the record omits.
- No theme change is needed when Wagner starts writing it.

## Purchase flow

- **Signed in, states A–D:**
  - The button posts the Pro variant to `/cart/add` with `return_to=/checkout`, so it goes straight to checkout alongside any merchandise already in the cart.
  - If Pro is already in the cart, the button becomes "Check out".
- **Signed out:** the button opens sign-in and returns to the PDP, because Pro is attached to a customer account or company location.
- **Pro and Wholesale:** no purchase button. They see manage membership or wholesale account.
- **Wording:** Pro is a one-time annual product. The page says "One payment for 12 months of Pro" and never describes automatic renewal or a subscription.

## Known policy conflicts (not resolved in the theme)

These go to membership contract alignment. The theme keeps its current configuration.

- **Member Threads Cash:** Wagner design docs say Members earn 1%; the current strategy (and this page) is 0%.
- **Shipping credit minimum:** Wagner design docs say $40 (and "~$15 of label cost"); this page uses the proposed $100. Wagner's `ship_code.min_subtotal` should match the theme setting.
- **Not live in Wagner:** Pro activation, the Threads Cash ledger, shipping credit issuance and guarantee settlement are not implemented or enabled yet.

## Open policy questions (not published to shoppers)

1. **Pro Promise:**
   - First year or every year.
   - Which benefits qualify.
   - Refund timing and method (money back, not Threads Cash).
   - A formal terms page.
2. **Threads Cash:**
   - When it posts (Wagner design: after the ~30-day return window). Until that is settled the page never says "next order".
   - Expiry (design: 12 months).
   - Excluded products (design: anchor variants, 12% featured deals).
   - Redemption in B2B checkout.
3. **Shipping credit:**
   - $100 minimum vs $40 (see conflicts).
   - The standard-shipping-only rule.
4. **Stacking:** how Pro pricing combines with sales, Member Deals and bulk discounts. This also affects the "at bulk pricing" estimate on price cards.
5. **Activation:** when Pro pricing starts, and whether merchandise bought in the same order as the membership gets Pro pricing. Not promised on the page.
6. **Renewal and cancellation:** auto-renew, grace period, and cancellation and refund terms.
7. **Eligibility:** whether Pro needs a registered business.
8. **Guest purchase:** whether a signed-out shopper may buy Pro at checkout. Today the button asks them to sign in first.
9. **Customer-facing savings percentage:**
   - The page doesn't quote "~14.5%". The calculator and the per-$100 illustration imply it.
   - Confirm that is acceptable, since margins are internal and the page never shows margin targets.

## Decisions made without explicit owner guidance (iteration 2)

1. **One calculator.** I removed the expanded calculator section rather than synchronizing two, and put the Promise in its slot.
2. **C/D future estimate.** It is prefilled from the customer's own average month even when that is below the $500 example. B keeps the "only if larger" rule from the first version.
3. **Price-card sourcing.** Orders (by frequency), then favorites, then staples. Recently viewed is not used, as explained in Price comparison. The template ships 4 staples across categories.
4. **Billing note.** "One payment for 12 months of Pro." replaced the renewal-reminder sentence, because renewal terms aren't settled.
5. **Threads Cash pending note.** Shoppers no longer see "terms will be published before launch". The note is optional and blank by default. The editor sees the open items.
6. **"Pro restock link" setting.** Added so the state E shipping-credit action has somewhere to go. It defaults to all products.
7. **Whole dollars.** Breakdown lines are whole dollars, like the calculator. A breakdown can differ from its rounded total by $1.
8. **Promise chip.** Shown to prospective buyers (A–D) only, not to Pro members.

## Remaining backend work (Wagner / admin)

- A contract change and a writer for `wagner.pro_value` (potential and actual, with `period` and `exact`).
- Populate shop `wagner.tier_thresholds` (fee, rates). Today the theme falls back to settings.
- Pro activation on a paid membership order, renewal, the monthly `ship_code` and the Threads Cash ledger (2C; flags off).
- An optional variant `wagner.pro_price` to replace estimated prices in the price comparison.
- Migrate `sections/at-for-you`, `sections/at-personal-home` and `snippets/at-home-tier-benefits` to `at-pro-value`. They still read `savings_ytd` directly. Do the same for the account dashboard when it is built.
