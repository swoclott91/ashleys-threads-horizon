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
6. Migrate `config/settings_data.json` color palette when crossing Horizon v4.0.0+ (see **Horizon v4 color palette**)
7. Commit: `git commit -m "feat: merge upstream Horizon vX.Y.Z"`

### Horizon v4 color palette (v4.0.0+)

Upstream removed global `color_schemes` in favor of `settings.color_palette` (5 slots) plus `palette_*` overrides and per-section `background_color` / `text_color` pickers.

- **Access Threads discount bar:** uses `color-custom-at-discount-progress` + `snippets/contrast-override.liquid` (mapped from former scheme-4: `#2c2c2c` / `#f7f2ea`). Do not use `at_discount_progress_color_scheme` or `color-{{ scheme }}` wrappers.
- **Cart drawer:** lives in `snippets/cart-drawer.liquid` + `sections/cart-drawer-section.liquid`; header trigger is only a button in `snippets/header-actions.liquid`.
- **Product badges:** `snippets/product-card-badge.liquid` uses `color-custom-badge-sale` / `color-custom-badge-sold-out` (not scheme IDs).
- **No `color_scheme` settings:** Horizon v4 removed the global color scheme system. Do not leave `"type": "color_scheme"` in `config/settings_schema.json` or any block/section schema — Shopify will fail theme upload and the editor will 404. Use `background_color` / `text_color` + `contrast-override` (see `blocks/_header-menu.liquid`) or global classes `color-custom-popover` / `color-custom-drawer`.
- **Template JSON cleanup:** Remove stale `color_scheme`, `inherit_color_scheme`, and `home_color_scheme` keys from all `templates/*.json` and `sections/*-group.json`. Script: `scripts/migrate-v4-color-schemes.py`.
- **AT menu block:** `blocks/_at-menu.liquid` mirrors `_header-menu.liquid` color pickers; mobile drawer uses `color-custom-drawer`.

### Core files with AT modifications (conflict-prone)

These core Horizon files contain AT customizations and may need manual conflict resolution during upstream merges:

| File | AT Customization |
|------|-----------------|
| `blocks/_product-details.liquid` | Registers AT blocks (at-popup-link, at-variant-picker, at-buy-buttons) and **size-guide** (product metafield JSON size charts). |
| `sections/footer-utilities.liquid` | `max_blocks` 4, `.utilities--blocks-4` grid CSS, and `at-footer-utility-text` block type in section schema |

### AT Block Capabilities

| Block | Purpose |
|-------|---------|
| `blocks/at-footer-utility-text.liquid` | Optional extra line in the **Policies and links** (`footer-utilities`) row: `richtext` multi-line field (setting id **`line`**, not `text`, so the theme editor does not treat it as the dynamic block title) plus copyright-matched typography. Block name **AT Footer text** in schema (literal, like AT Buy buttons). Section registers `at-footer-utility-text` and four-column layout CSS. |
| `blocks/at-buy-buttons.liquid` | Buy buttons with bulk form support. **`discount_progress_gap`** (theme editor) sets vertical space above the nested discount bar; block uses flex column so the slot stacks cleanly. Enables a "Bulk Add to Cart" secondary button (`at_enable_bulk_popup`) that opens a `dialog-component` containing the AT bulk grid modal. Scripts (`dialog.js`, `at-bulk-grid.js`) and CSS are loaded conditionally. The form's `data-at-bulk-form` and `data-at-bulk-line-items` attributes are set whenever bulk popup OR bulk quantities are enabled. |
| `blocks/at-popup-link.liquid` | Standalone popup/link block. Also supports bulk grid inside the popup. May be deprecated in favour of `at-buy-buttons` bulk popup once migrated. |
| `blocks/at-variant-picker.liquid` | Variant picker that publishes bulk grid config (`script[data-at-bulk-grid-config]`) for `at-bulk-grid.js` to read. |
| `blocks/size-guide.liquid` | PDP-only size guide from **`custom.size_guide`** JSON metafield: **Standalone** (`dialog-component` + trigger, reuses popup-link dialog classes and `settings.popover_color_scheme`) or **Content only** for nesting inside **Popup link**. Snippets: `size-guide-modal.liquid`, `size-guide-section.liquid`, **`size-guide-sanitize-text.liquid`** (strips vendor names from displayed JSON/metafield strings), **`size-guide-suppress-boilerplate-text.liquid`** (hides generic “measurements are provided… may vary” disclaimer notes). |
| `snippets/product-media.liquid` | File reference support for variant metafield gallery images |
| `snippets/product-media-gallery-content.liquid` | Variant metafield gallery logic (custom.variant_gallery_images) |
| `snippets/slideshow-controls.liquid` | File reference support for thumbnail aspect ratios and image sources |
| `templates/product.json` | Uses AT blocks in product information section |
| `snippets/cart-summary.liquid` | Renders checkout totals + note/discount accordion. **`skip_discount_strip: true`** is passed from `_cart-summary` and from `header-actions` so the discount UI is not duplicated: the compact bar lives **beside the cart title** — in the drawer, inside `.cart-drawer__header` > **`.cart-drawer__header-top`**: single **`flex` row** (`flex-wrap: nowrap`, `justify-content: flex-start`, **`column-gap`** before close) **Cart + bubble | strip (`flex: 1 1 0`, `width: auto`, fills between title and close) | close**; strip stacks **status above rail**; on the cart page, in `sections/main-cart.liquid` as `.cart-page__at-dp-strip` between title and line items. In-summary strip uses **`at-dp-condensed-strip--tight`** on the scheme wrap for the same typography as drawer/bulk/PDP. The condensed rail uses **`padding-inline`** on `.at-dp__cart-railwrap` tied to **`--at-dp-cart-node-size`** on **`.cart-page__at-dp-strip .at-dp--cart-condensed` / `.cart-drawer__at-dp-strip .at-dp--cart-condensed`** (cart page `calc(1.45rem + 4px)`, drawer `calc(1.125rem + 4px)`) so milestone `translateX(-50%)` end caps stay inside the drawer; **`.at-dp__cart-node-hit`** uses that size for **equal `width`/`height`**, **`aspect-ratio: 1`**, and **nowrap** on `.at-dp__cart-node-text` so labels cannot stretch circles into ovals. Without `skip_discount_strip`, the bar still renders at the top of this snippet (legacy). Totals + checkout sit in `.cart-summary__scrollfade` so the drawer fade targets only that block. **`snippets/header-actions.liquid`** keeps `.cart-drawer__summary` **outside** `scroll-hint.cart-drawer__content`: `ScrollHint` (`assets/scrolling.js`) sets a scroll-based `mask-image` on its host; when the summary lived inside that host, the discount bar could disappear entirely on fresh load / scroll. |
| `snippets/at-bulk-grid-modal.liquid` | Same wrap + global scheme setting for quick-add bulk dialog. |
| `blocks/at-discount-progress.liquid` | Nested under **AT Buy buttons**: same **condensed** strip + Bulk savings dialog as cart (`data-context="product"`). Wrapper includes **`at-dp-condensed-strip--tight`** + `settings.at_discount_progress_color_scheme`. **`show_discount_bar`** + padding only. |
| `assets/at-bulk-grid.js` | `data-at-bulk-variant-price` on qty inputs for discount-bar pending totals. |

When resolving conflicts, preserve both the upstream changes and the AT customizations.

## Member discount progress bar (`at-discount-progress`)

- **Files:** `snippets/at-discount-progress.liquid`, `assets/at-discount-progress.js`, `assets/at-discount-progress.css`.
- **Settings:** Theme **Cart** — `at_discount_progress_enabled`, `at_non_sale_collection_url`, **`at_discount_progress_color_scheme`**, **`at_discount_progress_empty_track`** (condensed **rail** trough: tinted / scheme tokens — applied to **`.at-dp__cart-line`** via `at-dp-empty-track--*`). **Product PDP:** **`blocks/at-discount-progress`** (`show_discount_bar`, padding); **`at-dp-condensed-strip--tight`** on block wrapper for strip typography.
- **Behavior:** Logged-out customers see a login prompt plus **`shopify-account`** (card on cart page; **`layout: drawer_header`** inline “Get member discounts” + Log in in cart drawer and bulk modals). Logged-in: **`cart:update`**, **`discount:update`**, `/cart.js` when payload omits subtotal. **Product** context: **`projected = cart subtotal + pending line`** (qty × variant price); condensed status + nodes use **projected**; **`variant:update`**, **`quantity-selector:update`**. **Bulk** context: grid qty × `data-at-bulk-variant-price` via `findBulkDiscountHost()`.
- **UI:** **One layout everywhere** — condensed status + rail + milestone nodes; tap opens **Bulk savings** `<dialog>` (disclaimer + qualify link in footer). **`at-dp-condensed-strip--tight`** on drawer strip, bulk modals (`at-bulk-grid-modal`, `at-buy-buttons`, `at-popup-link`), **PDP** (`blocks/at-discount-progress`), and cart page strip (`main-cart` `.cart-page__at-dp-strip`). Drawer: **`header-actions`** header row **Cart | strip | close**.
- **Cart drawer “empty” styling:** Do not use a dialog class like `cart-drawer--empty` that is only set in Liquid at first paint. AJAX cart updates use **hydration** morph on `[data-hydration-key="cart-drawer-inner"]` only; the `<dialog>` does not re-render, so an “empty” class on it stayed wrong after add-to-cart and **empty-state flex centering** (`height: 100dvh`, etc.) could hide the drawer header and condensed discount bar after close/reopen. Tie empty-only rules to real inner DOM, e.g. **`.cart-drawer__dialog:has(.cart-drawer__empty-message)`** (see `snippets/header-actions.liquid`). Drawer header uses **`snippets/cart-drawer-header.liquid`**: cart icon + count (not “Cart” text), center column for discount strip or inline “Get member discounts” + Log in, close on the right.
- **Morph + `<at-discount-progress-bar>`:** Section re-renders compare the live bar to **SSR**, which is an **empty** custom element. `morph`’s `updateChildren` then **removes** all JS-rendered children. Use **`data-skip-subtree-update`** on the host (in `snippets/at-discount-progress.liquid`; server HTML must include it too) and **`attributeChangedCallback`** in `assets/at-discount-progress.js` to re-parse `data-subtotal` / `data-milestones` / etc. and call `render()` when attributes copy over.
- **Colors (scheme):** Shell / rail / nodes per `assets/at-discount-progress.css` file header. Login control: **Primary button** tokens. Tier copy: **`at_discount_progress.achievement_none`**, **`tier_unlocked`**, **`max_tier_reached`**. Disclaimer + qualifying link: **Bulk savings** dialog only (no separate PDP info popover).

## AT menu (`at-brands-panel`)

- **Focus-out handling:** Do not close the mega panel when `focusout` has `relatedTarget === null` (common on click-to-focus). Defer with `setTimeout(0)` and only close if `document.activeElement` is not inside the host.
- **Pointer-leave delay:** After the hover close delay, skip closing if focus is still inside the panel (keyboard users who moved the pointer away).
- **Brand search listeners:** Prefer `capture: true` on the dropdown `ref="panel"` for `input` / clear `click` so filtering still runs reliably.
- **Sidebar category hover:** `mouseenter` does not bubble, so declarative `on:mouseenter` on category buttons is unreliable. Use a bubbling `pointerover` listener on `refs.panel` gated with `(hover: hover) and (pointer: fine)`; keep `on:click` for keyboard and touch.
- **Transparent header + AT mega panel:** Solid top-row/underlay styling is tied to `#header-component:hover` / `:focus-within`. The fixed `.at-brands-panel__dropdown` can leave a vertical gap over the hero; the pointer then leaves the header while the panel stays open. Mirror hover rules with `#header-component:has(.at-brands-panel[data-open])` in `sections/header.liquid` (AT CUSTOM blocks).
- **Transparent header + popup nav items:** `.header[transparent]` defaults `--closed-underlay-height: 0px`. Only `:has(.menu-list__link:not([aria-haspopup]):hover)` set it to `100%` (plain links). Items with `aria-haspopup` matched the mega-menu `:has()` block without `--closed-underlay-height`, so the bar stayed visually transparent until Horizon’s `header-menu` JS set `--full-open-header-height` — which **AT Products** never triggers. Add `--closed-underlay-height: 100%` to that mega-menu `:has()` group in `header.liquid`.
- **AT mega panel `top`:** `Math.min(#header-component.bottom, max visible .header__row bottom)`; subtract **`at-brands-panel::after`** bridge (or `--header-padding`); when the announcement bar stacks above the header (`header.top` not flush to viewport top, bar ends at/above `header.top`), subtract **`padding-top + padding-bottom`** on **`#header-group .announcement-bar`**. Skip that inset when **`header.top < ~4px`** (sticky flush). Else **`Math.min(nav, row, trigger)`** fallback. Re-run **`#updatePanelTop`** after layout changes. Seam overlap **`max(2, 1 + borderBottomWidth)`**. Dropdown **`z-index: calc(var(--layer-header-menu) + 1)`**.
- **Products / dropdown chevron:** There is no `icon-chevron-down.svg` in Horizon assets; `snippets/icon.liquid` has no `chevron-down` case. Use **`icon-caret.svg`** with `inline_asset_content` inside **`svg-wrapper`** (same as `sections/header.liquid` localization). Open state: rotate the wrapper **`180deg`** (not 90°), matching `dropdown-localization`.
- **AT nav + `menu-list__link`:** In the header block, links use both classes. **`blocks/_header-menu.liquid`** sets `.menu-list__link { flex-direction: column }` for the mega-menu bridge; override with **`.menu-list__link.at-menu__nav-link { flex-direction: row }`** in `at-menu.css` so titles and carets stay inline.

## Troubleshooting: Dev theme missing JSON templates (e.g. product)

If **Online Store → Themes → … → Edit code** on a development theme shows no `templates/product.json` (or other JSON templates) but **`main` and `dev` branches both contain them in Git**, the store copy is stale or was created from an incomplete source. **Fix:** From this repo root, push the full theme (or at least `templates/`) to that theme, for example with Shopify CLI: `shopify theme push` and select the dev theme, or `shopify theme push --only templates/product.json templates/product.access-threads.json` to upload the product templates only. Avoid habitually using `--only` for unrelated paths, which can leave the remote theme missing folders that exist in Git. If the theme is connected to GitHub in Admin, confirm the connected branch is the one that includes `templates/` and trigger a sync or reconnect.
