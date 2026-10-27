# Header and menu hierarchy

The shared header now follows the PDP and cart typography and palette across page types. The existing announcement messages, logo, navigation order, destinations, icons, featured content, account/cart behavior, and menu JavaScript are retained.

- Desktop navigation uses 14px medium text. Menu group headings use 16px semibold text above 14px regular links.
- The logo is 56px high on desktop and 48px on phones. Header controls and announcement arrows have at least 44px targets; mobile navigation rows are at least 48px.
- The mobile Shop/category headings use 22px semibold text. The existing two-column category and brand layouts remain, with 44px link targets.
- Warm separators, pine actions/focus states, and 16px brand-search inputs match the PDP and cart treatment.
- Dropdowns anchor to the bottom of the header's containing block, overriding the old approximate inline position. They cap at 512px while retaining the existing scrolling regions and viewport limits.
- Mobile featured cards fit their existing Shop action instead of clipping it below the card.

`snippets/at-header-styles.liquid` loads `assets/at-header.css` through `layout/theme.liquid`. Palette values come from existing theme settings and styles are scoped to the header group/component. The former product-only header overrides were removed from `assets/at-pdp.css`; its product, breadcrumb, size-guide, and bulk-modal rules remain.

## Validation

- Shopify preview theme: **Header and menu hierarchy preview 2026-10-27** (`191265964307`).
- Reviewed populated storefront rendering at 1440×1000 and 1280×720 desktop, 768×1024 tablet, 390×844 phone, and 320×568 narrow phone, with no horizontal page overflow at the checked sizes.
- Confirmed desktop dropdown/header seams match, dropdowns fit within the viewport, and homepage header sizing/typography matches the PDP.
- Confirmed the mobile close control stays aligned with the menu trigger after the opening animation, category forward/back navigation works, and all 33 T-Shirts category link labels/destinations match the pre-change baseline.
- Narrow-phone brand filtering for Gildan returns the existing Gildan link. The mobile featured Shop action fits fully inside its card after the final sizing adjustment.
- Shopify CLI Theme Check found no findings in the four changed theme files; repository totals were 2,754 existing errors and 39 warnings. The bundled skill validator was attempted but cannot load its missing `@shopify/theme-check-common` dependency.
- Whitespace checked with `git -c core.whitespace=cr-at-eol diff --check` to account for existing tracked CRLF files.

The user approved publication to main after reviewing the preview. Deployment uses the repository's existing Shopify/main integration, preserving the original checkout's unrelated local files.
