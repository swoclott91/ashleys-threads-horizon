# Access Threads – Theme Development Rules

This repository is a fork of Shopify’s Horizon theme.
The goal is to remain updateable with upstream Horizon releases
while adding Access Threads–specific UI and behavior.

## Core Principles

- Prefer adding new files over modifying existing Horizon core files.
- Keep diffs against upstream Horizon minimal and easy to rebase.
- All Access Threads customizations must be clearly identifiable.

## Custom Code Location Rules

All Access Threads–specific code must follow these conventions:

- **Sections**: `sections/at-*.liquid`
- **Snippets**: `snippets/at-*.liquid`
- **Assets**:
  - `assets/at-*.js`
  - `assets/at-*.css`
- **Templates**:
  - Custom JSON templates such as:
    - `product.access-threads.json`
    - `page.access-threads-*.json`

Do not place Access Threads logic directly inside core Horizon sections unless explicitly instructed.

## Editing Existing Horizon Files

If modification of an existing Horizon file is required:

- Keep changes minimal and localized.
- Surround custom logic with clear comments:

```liquid
{%- comment -%} AT CUSTOM: description of change {%- endcomment -%}
...
{%- comment -%} /AT CUSTOM {%- endcomment -%}
```

## Upstream Update Process

The upstream Shopify Horizon repo is configured as the `upstream` remote:

```
upstream  https://github.com/Shopify/horizon.git
```

### How to merge a new Horizon release

1. Fetch upstream: `git fetch upstream --tags`
2. Check upstream version: `git log upstream/main --oneline -5`
3. Create a backup branch: `git branch dev-backup-pre-vX.Y.Z`
4. Merge: `git merge upstream/main --no-commit`
5. Resolve conflicts in AT-modified core files (see below)
6. Commit: `git commit -m "Merge upstream Horizon vX.Y.Z"`

### Core files with AT modifications (conflict-prone)

These core Horizon files contain AT customizations and may need manual conflict resolution during upstream merges:

| File | AT Customization |
|------|-----------------|
| `blocks/_product-details.liquid` | Registers AT blocks (at-popup-link, at-variant-picker, at-buy-buttons) |
| `sections/footer-utilities.liquid` | `max_blocks` 4, `.utilities--blocks-4` grid CSS, and `at-footer-utility-text` block type in section schema |

### AT Block Capabilities

| Block | Purpose |
|-------|---------|
| `blocks/at-footer-utility-text.liquid` | Optional extra line in the **Policies and links** (`footer-utilities`) row: `inline_richtext` (setting id **`line`**, not `text`, so the theme editor does not treat it as the dynamic block title) plus copyright-matched typography. Block name **AT Footer text** in schema (literal, like AT Buy buttons). Section registers `at-footer-utility-text` and four-column layout CSS. |
| `blocks/at-buy-buttons.liquid` | Buy buttons with bulk form support. **`discount_progress_gap`** (theme editor) sets vertical space above the nested discount bar; block uses flex column so the slot stacks cleanly. Enables a "Bulk Add to Cart" secondary button (`at_enable_bulk_popup`) that opens a `dialog-component` containing the AT bulk grid modal. Scripts (`dialog.js`, `at-bulk-grid.js`) and CSS are loaded conditionally. The form's `data-at-bulk-form` and `data-at-bulk-line-items` attributes are set whenever bulk popup OR bulk quantities are enabled. |
| `blocks/at-popup-link.liquid` | Standalone popup/link block. Also supports bulk grid inside the popup. May be deprecated in favour of `at-buy-buttons` bulk popup once migrated. |
| `blocks/at-variant-picker.liquid` | Variant picker that publishes bulk grid config (`script[data-at-bulk-grid-config]`) for `at-bulk-grid.js` to read. |
| `snippets/product-media.liquid` | File reference support for variant metafield gallery images |
| `snippets/product-media-gallery-content.liquid` | Variant metafield gallery logic (custom.variant_gallery_images) |
| `snippets/slideshow-controls.liquid` | File reference support for thumbnail aspect ratios and image sources |
| `templates/product.json` | Uses AT blocks in product information section |
| `snippets/cart-summary.liquid` | Renders `at-discount-progress` when theme setting enabled (cart page + drawer). Wrapped in `at-discount-progress-scheme-wrap color-{{ settings.at_discount_progress_color_scheme }}` so cart matches theme-scoped scheme tokens. Totals + checkout sit in `.cart-summary__scrollfade` so the drawer CSS fade targets only that block. **`snippets/header-actions.liquid`** keeps `.cart-drawer__summary` **outside** `scroll-hint.cart-drawer__content`: `ScrollHint` (`assets/scrolling.js`) sets a scroll-based `mask-image` on its host; when the summary lived inside that host, the discount bar could disappear entirely on fresh load / scroll. |
| `snippets/at-bulk-grid-modal.liquid` | Same wrap + global scheme setting for quick-add bulk dialog. |
| `blocks/at-discount-progress.liquid` | Nested block under **AT Buy buttons**: PDP discount bar (`show_discount_bar`, padding). **Color scheme** is theme-only: `settings.at_discount_progress_color_scheme` (Cart settings). |
| `assets/at-bulk-grid.js` | `data-at-bulk-variant-price` on qty inputs for discount-bar pending totals. |

When resolving conflicts, preserve both the upstream changes and the AT customizations.

## Member discount progress bar (`at-discount-progress`)

- **Files:** `snippets/at-discount-progress.liquid`, `assets/at-discount-progress.js`, `assets/at-discount-progress.css`.
- **Settings:** Theme **Cart** — `at_discount_progress_enabled`, `at_non_sale_collection_url`, **`at_discount_progress_color_scheme`** (single scheme for PDP bar, cart, drawer, bulk modals), **`at_discount_progress_empty_track`** (empty bar trough: tinted mix default vs scheme background / variant / input tokens — tooltip panel stays on scheme Background). **Product PDP:** **`blocks/at-discount-progress`** nested under AT Buy buttons (static id `discount-progress`) controls visibility + padding only.
- **Behavior:** Logged-out customers see a login prompt plus **`shopify-account`** (same web component as `snippets/header-actions.liquid`): icon + button-style label opens Speedy/Shop customer login without leaving the page (fallback: legacy link + same icon when Customer Accounts are off). Logged-in customers see tier milestones (cart `items_subtotal_price`). Listens for `cart:update`, `discount:update`, and fetches `/cart.js` when the event payload omits `items_subtotal_price`. **Product** context: pending bar = current line total (`qty × variant price`, including default qty so empty-cart preview works); `projected = cart subtotal + line`; top “add more” and tier copy use **projected** so the next milestone updates after crossing a tier pre-checkout; listens for `variant:update` and `quantity-selector:update`. **Bulk** context: sum of `qty × data-at-bulk-variant-price` when any qty &gt; 0; host wrapper resolved via `findBulkDiscountHost()` (`at-bulk-grid-modal__inner`, `at-buy-buttons__bulk-dialog-inner`, `popup-link__inner`).
- **UI:** Top line = “add more” toward next tier; bottom line = current discount message.
- **Info panel DOM:** The tooltip is a block-level `<div>`. The achievement row must be a `<div>` (not `<p>`), and the icon + panel wrapper must be a `<div>` (not `<span>`). Block nodes inside `<p>` or `<span>` are invalid HTML; parsers hoist them so `position: absolute` / `top: 100%` on `.at-dp__panel--sup` resolves against a tall ancestor instead of `.at-dp__info-wrap--sup`.
- **Colors (scheme):** Bar shell uses **Inputs** (background, border); empty track uses scheme **Background**; fills use **Selected variants** (achieved) and **Variants hover** (pending preview); copy uses **Input text** (top nudge) / **Selected variant text** (achievement row); login control stays **Primary button** tokens (`assets/at-discount-progress.css` file comment). Below threshold, baseline copy is **`at_discount_progress.achievement_none`** (“10% Member Discount”). Unlocked tiers use **`tier_unlocked`** (`{{ tier }}` only, e.g. “18% Bulk Discount”) and **`max_tier_reached`** for the top tier; detail copy lives in the info tooltip. Non-sale disclaimer + collection link live in a **low-contrast superscript** info control (`.at-dp__info-ref`) on that bottom line, not in the header.

## AT menu (`at-brands-panel`)

- **Focus-out handling:** Do not close the mega panel when `focusout` has `relatedTarget === null` (common on click-to-focus). Defer with `setTimeout(0)` and only close if `document.activeElement` is not inside the host.
- **Pointer-leave delay:** After the hover close delay, skip closing if focus is still inside the panel (keyboard users who moved the pointer away).
- **Brand search listeners:** Prefer `capture: true` on the dropdown `ref="panel"` for `input` / clear `click` so filtering still runs reliably.
- **Sidebar category hover:** `mouseenter` does not bubble, so declarative `on:mouseenter` on category buttons is unreliable. Use a bubbling `pointerover` listener on `refs.panel` gated with `(hover: hover) and (pointer: fine)`; keep `on:click` for keyboard and touch.
- **Transparent header + AT mega panel:** Solid top-row/underlay styling is tied to `#header-component:hover` / `:focus-within`. The fixed `.at-brands-panel__dropdown` can leave a vertical gap over the hero; the pointer then leaves the header while the panel stays open. Mirror hover rules with `#header-component:has(.at-brands-panel[data-open])` in `sections/header.liquid` (AT CUSTOM blocks).
- **Transparent header + popup nav items:** `.header[transparent]` defaults `--closed-underlay-height: 0px`. Only `:has(.menu-list__link:not([aria-haspopup]):hover)` set it to `100%` (plain links). Items with `aria-haspopup` matched the mega-menu `:has()` block without `--closed-underlay-height`, so the bar stayed visually transparent until Horizon’s `header-menu` JS set `--full-open-header-height` — which **AT Products** never triggers. Add `--closed-underlay-height: 100%` to that mega-menu `:has()` group in `header.liquid`.
- **AT mega panel `top`:** For triggers inside **`#header-component`**, use **`getBoundingClientRect().bottom`**, then **subtract the `at-brands-panel::after` bridge height** (computed `::after` height, else resolved **`--header-padding`**). The dropdown is **`position: fixed`** (out of flow) but the **`::after`** bridge stays in flow (`at-menu.css`), so the header’s layout bottom sits **one bridge height** below the visible white bar without this adjustment. Else **`Math.min(nav, row, trigger)`** fallback. Re-run **`#updatePanelTop`** after layout changes. Seam overlap **`max(2, 1 + borderBottomWidth)`**. Dropdown **`z-index: calc(var(--layer-header-menu) + 1)`**.
- **Products / dropdown chevron:** There is no `icon-chevron-down.svg` in Horizon assets; `snippets/icon.liquid` has no `chevron-down` case. Use **`icon-caret.svg`** with `inline_asset_content` inside **`svg-wrapper`** (same as `sections/header.liquid` localization). Open state: rotate the wrapper **`180deg`** (not 90°), matching `dropdown-localization`.
- **AT nav + `menu-list__link`:** In the header block, links use both classes. **`blocks/_header-menu.liquid`** sets `.menu-list__link { flex-direction: column }` for the mega-menu bridge; override with **`.menu-list__link.at-menu__nav-link { flex-direction: row }`** in `at-menu.css` so titles and carets stay inline.

## Troubleshooting: Dev theme missing JSON templates (e.g. product)

If **Online Store → Themes → … → Edit code** on a development theme shows no `templates/product.json` (or other JSON templates) but **`main` and `dev` branches both contain them in Git**, the store copy is stale or was created from an incomplete source. **Fix:** From this repo root, push the full theme (or at least `templates/`) to that theme, for example with Shopify CLI: `shopify theme push` and select the dev theme, or `shopify theme push --only templates/product.json templates/product.access-threads.json` to upload the product templates only. Avoid habitually using `--only` for unrelated paths, which can leave the remote theme missing folders that exist in Git. If the theme is connected to GitHub in Admin, confirm the connected branch is the one that includes `templates/` and trigger a sync or reconnect.
