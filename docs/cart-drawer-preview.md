# Cart drawer hierarchy preview

Branch: `codex/cart-drawer-hierarchy-preview`

Unpublished Shopify theme: **Cart drawer hierarchy preview 2026-10-27** (`191263965459`).

[Open the preview](https://ashleysthreads.com/products/gildan-64000-softstyle-t-shirt?preview_theme_id=191263965459), then open Cart. Shopify may require the existing storefront password or a staff session.

## Changes

- Show the existing translated Cart heading beside the existing cart icon/count. Move the existing savings progress strip onto a full-width row below it.
- Use the existing theme fonts and palette. Item titles are 16px/500, line totals 16px/600, supporting unit prices 13px, and estimated total 24px desktop / 22px mobile.
- Standardize quantity controls and close controls at 44px. Give checkout and the empty-cart shopping button a 52px height and the theme's pine palette.
- Tighten item and footer spacing, with warm divider colors consistent with the PDP and modals.
- Keep the header and checkout visible while products scroll. Replace the two nested product scroll-hint wrappers with one scroll region, removing the fade that made adjacent items appear disabled. Allow unusually tall totals content to scroll without losing checkout.

All changes are scoped to the drawer. Existing text, item markup, discount progress/icons/details, calculations, cart update code, and checkout behavior are retained. The cart page and PDP styles are unchanged.

## Verification

- Populated drawer reviewed at 1440×1000, 768×1024, 390×844, and 320×568.
- Opening and focusing Discount keeps the header at the top and checkout inside the viewport, including on the smallest phone size. Keyboard focus can reach the last cart item through the product scroll region without scrolling the outer dialog.
- Existing savings details open and return to the cart; Escape closes the drawer and the header trigger reopens it.
- The existing signed-in cart retained six lines, 85 items, and its $366.83 USD total throughout the read-only layout checks.
- Empty state reviewed separately at mobile width; its existing content and shopping destination are retained.
- In the separate initially empty browser session, adding one test item opened and hydrated the drawer, increasing quantity recalculated the total from $3.59 to $7.18, and removing the test line restored the empty state. The updated 13px unit-price styling persisted after the cart rerender. No checkout was submitted.
- `git diff --check` passes. Shopify CLI Theme Check matches the branch baseline: 2,754 existing errors and 40 warnings, with no new findings; modified snippets have zero errors and one pre-existing scoped-class warning.
- The Shopify skill validator was attempted but cannot load its bundled `@shopify/theme-check-common` dependency. Shopify CLI Theme Check and actual storefront preview rendering were used for validation.

The preview was cloned from the live theme and overlaid with only the four cart theme files. Main and the live Shopify theme have not been updated. The original checkout's unrelated uncommitted PDP work was preserved. Merge and publication are reserved for review.
