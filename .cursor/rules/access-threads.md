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

- **Access Threads discount bar:** inherits parent surface colors (drawer / cart / product). Do not reintroduce a fixed `color-custom-at-discount-progress` / `contrast-override` palette or `at_discount_progress_color_scheme`.
- **Cart drawer:** lives in `snippets/cart-drawer.liquid` + `sections/cart-drawer-section.liquid`; header trigger is only a button in `snippets/header-actions.liquid`.
- **Product badges:** `snippets/product-card-badge.liquid` uses `color-custom-badge-sale` / `color-custom-badge-sold-out` (not scheme IDs).
- **No `color_scheme` settings:** Horizon v4 removed the global color scheme system. Do not leave `"type": "color_scheme"` in `config/settings_schema.json` or any block/section schema — Shopify will fail theme upload and the editor will 404. Use `background_color` / `text_color` + `contrast-override` (see `blocks/_header-menu.liquid`) or global classes `color-custom-popover` / `color-custom-drawer`.
- **Template JSON cleanup:** Remove stale `color_scheme`, `inherit_color_scheme`, and `home_color_scheme` keys from all `templates/*.json` and `sections/*-group.json`. Script: `scripts/migrate-v4-color-schemes.py`.
- **AT menu block:** `blocks/_at-menu.liquid` mirrors `_header-menu.liquid` color pickers; mobile drawer uses `color-custom-drawer`.
- **GitHub theme sync upload order:** Shopify's GitHub integration can validate files before their dependencies finish uploading. Common failures:
  - Template JSON before section liquid (`Section type 'section' does not refer to an existing section file`)
  - Section liquid before block liquid (`invalid block type "email-signup": undefined block type`)
  - Parent block preset before child block schema updates (`invalid block type "at-discount-progress": undefined setting 'style_class'`) — GitHub sync validated `at-buy-buttons` against the **already-deployed** child schema. Fix: push child blocks first (`blocks/at-discount-progress.liquid`, `blocks/at-bulk-add-to-cart.liquid`, `blocks/_at-buy-buttons-form.liquid`), then `blocks/at-buy-buttons.liquid`; or re-push the parent alone after the child succeeded. Prefer omitting new setting keys from parent presets when the child already has a schema `default`.
  **Workaround:** push in ordered commits — (1) `blocks/*.liquid` dependencies, (2) `sections/*.liquid`, (3) template/group `.json`. Or use Shopify CLI 4.x with `shopify.theme.toml` (always `-e ashleys` in this repo):

  ```bash
  shopify theme push -e ashleys --only "config/*"
  shopify theme push -e ashleys --only "blocks/*"
  shopify theme push -e ashleys --only "sections/*" --only "snippets/*" --only "layout/*"
  shopify theme push -e ashleys --only "templates/*" --only "assets/*" --only "locales/*"
  shopify theme push -e ashleys
  ```

  Config must go first — block schemas use `{{ settings.color_palette.* }}` defaults that require `color_palette` in `settings_schema.json`.

- **Mixed v3/v4 on live theme:** GitHub sync can leave **v4 config** (`color_palette` in `settings_data` / `settings_schema`) while **some block files stay on v3** (still declare `"type": "color_scheme"`). Shopify then shows *"color schemes must be defined in settings_data and settings_schema"* and the theme editor 404s. Known stale files on Ashley's main (2026-06): `blocks/email-signup.liquid`, `blocks/_search-input.liquid`. Fix: push v4 blocks via CLI (`shopify theme push -e ashleys-main --only "blocks/*" --allow-live`) or re-sync blocks after config.

- **CLI store targeting:** Ashley's Threads is `ashleys-threads-3.myshopify.com` (live main `#187518812435`, dev-v4-upgrade `#187741045011`). Access Threads is a separate store — never run bare `shopify theme push` without `-e ashleys` or `-e ashleys-main`. See root `shopify.theme.toml`.

- **Horizon v4 theme events (breaking):** Upstream removed `CartAddEvent`, `CartUpdateEvent`, `VariantUpdateEvent`, and `ThemeEvents.cartUpdate` / `variantUpdate` / `discountUpdate` from `assets/events.js`. Cart/product listeners must use `@shopify/events` (`CartLinesUpdateEvent`, `ProductSelectEvent`, `StandardEvents.cartLinesUpdate`, etc. — see `product-form.js` / `cart-icon.js`). AT scripts that still imported the old names (`at-bulk-grid.js`, `at-discount-progress.js`, `wagner-fe.js`) **failed to load as ES modules**, so the bulk modal opened (Liquid + `dialog.js`) but the grid never rendered. After fixing imports, bump the `?v=` cache-buster on `at-bulk-grid.js` script tags.

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
| `blocks/at-buy-buttons.liquid` | Buy buttons **container**. Nested reorderable blocks via `{% content_for 'blocks' %}`: **`at-bulk-add-to-cart`**, **`_at-buy-buttons-form`** (quantity / ATC / accelerated), **`at-discount-progress`**. **`discount_progress_gap`** sets margin above the discount bar. Pickup availability stays on the parent. |
| `blocks/at-bulk-add-to-cart.liquid` | Bulk Add to Cart trigger + dialog (bulk grid). Button **style** mirrors the theme button block (`button` / `button-secondary` / `button-unstyled` / `button-custom` + custom colors). Label + modal/drawer behavior. Scripts (`dialog.js`, `at-bulk-grid.js`) and CSS load here. |
| `blocks/_at-buy-buttons-form.liquid` | Private form row: quantity, add-to-cart, accelerated-checkout (static children). Always sets `data-at-bulk-form` + bulk line-items hidden input for the AT bulk grid. Stacking + gift card settings live here. |
| `blocks/at-popup-link.liquid` | Standalone popup/link block. Also supports bulk grid inside the popup. May be deprecated in favour of `at-buy-buttons` bulk popup once migrated. |
| `blocks/at-variant-picker.liquid` | Variant picker that publishes bulk grid config (`script[data-at-bulk-grid-config]`) for `at-bulk-grid.js` to read. |
| `blocks/size-guide.liquid` | PDP-only size guide from **`custom.size_guide`** JSON metafield: **Standalone** (`dialog-component` + trigger, reuses popup-link dialog classes and `settings.popover_color_scheme`) or **Content only** for nesting inside **Popup link**. Snippets: `size-guide-modal.liquid`, `size-guide-section.liquid`, **`size-guide-sanitize-text.liquid`** (strips vendor names from displayed JSON/metafield strings), **`size-guide-suppress-boilerplate-text.liquid`** (hides generic “measurements are provided… may vary” disclaimer notes). |
| `snippets/product-media.liquid` | File reference support for variant metafield gallery images |
| `snippets/product-media-gallery-content.liquid` | Variant metafield gallery logic (custom.variant_gallery_images) |
| `snippets/slideshow-controls.liquid` | File reference support for thumbnail aspect ratios and image sources |
| `templates/product.json` | Uses AT blocks in product information section |
| `snippets/cart-summary.liquid` | Renders checkout totals + note/discount accordion. **`skip_discount_strip: true`** is passed from `_cart-summary` and from `header-actions` so the discount UI is not duplicated: the compact bar lives **beside the cart title** — in the drawer, inside `.cart-drawer__header` > **`.cart-drawer__header-top`**: single **`flex` row** (`flex-wrap: nowrap`, `justify-content: flex-start`, **`column-gap`** before close) **Cart + bubble | strip (`flex: 1 1 0`, `width: auto`, fills between title and close) | close**; strip stacks **status above rail**; on the cart page, in `sections/main-cart.liquid` as `.cart-page__at-dp-strip` between title and line items. In-summary strip uses **`at-dp-condensed-strip--tight`** on the scheme wrap for the same typography as drawer/bulk/PDP. The rail is a **continuous fill** with milestone **text labels under the bar** (`.at-dp__cart-labels`), so there is no longer a `--at-dp-cart-node-size` / railwrap `padding-inline` inset; labels edge-align via `--first`/`--last` and shrink per context (compact for drawer/tight, larger for the bulk modal). Without `skip_discount_strip`, the bar still renders at the top of this snippet (legacy). Totals + checkout sit in `.cart-summary__scrollfade` so the drawer fade targets only that block. **`snippets/header-actions.liquid`** keeps `.cart-drawer__summary` **outside** `scroll-hint.cart-drawer__content`: `ScrollHint` (`assets/scrolling.js`) sets a scroll-based `mask-image` on its host; when the summary lived inside that host, the discount bar could disappear entirely on fresh load / scroll. |
| `snippets/at-bulk-grid-modal.liquid` | Same wrap + global scheme setting for quick-add bulk dialog. |
| `blocks/at-discount-progress.liquid` | Nested under **AT Buy buttons** (reorderable): same **condensed** strip + Bulk savings dialog as cart (`data-context="product"`). Wrapper includes **`at-dp-condensed-strip--tight`**. **`show_discount_bar`**, padding, and **Log in button style** (`style_class` primary / secondary / link / custom — mirrors button block). |
| `snippets/at-apply-button-styles.liquid` | Applies custom / link button CSS when style comes from theme settings or explicit params (used by discount progress Log in on cart / drawer / bulk). |
| `assets/at-bulk-grid.js` | Bulk grid UI + cart add. Uses `@shopify/events` `CartLinesUpdateEvent` (not removed `CartAddEvent`). `data-at-bulk-variant-price` on qty inputs for discount-bar pending totals. **Enriched footer** via `updateBulkSummary()` (shared `BULK_GRID_ACTIONS_MARKUP`): item count • subtotal (`formatBulkMoney`) • projected discount % (highest reached non-shipping milestone read from the sibling `at-discount-progress-bar[data-milestones]` via `findBulkDiscountBar`, basis = its `data-subtotal` + grid selection). CTA reads “Add N items” and disables at 0. Marks qty inputs `--active`, mobile size rows `--selected`, and per-color counts (`data-at-bulk-color-count`) when qty > 0. Bump the `?v=` cache-buster on all four loaders when editing (`blocks/at-variant-picker`, `blocks/at-bulk-add-to-cart`, `snippets/at-bulk-grid-modal`, `blocks/at-popup-link`). |
| `snippets/at-bulk-grid-header.liquid` | Visible bulk modal header (title + subtitle). Rendered above the discount strip in each shell (quick-add, buy-buttons, popup-link); its `h2` is the dialog `aria-labelledby` target (replaced the old `visually-hidden` h2). `at_bulk_grid_surface` tints the desktop table header/color column + accordion headers-with-selections. |

When resolving conflicts, preserve both the upstream changes and the AT customizations.

## Member discount progress bar (`at-discount-progress`)

- **Files:** `snippets/at-discount-progress.liquid`, `assets/at-discount-progress.js`, `assets/at-discount-progress.css`.
- **Settings:** Theme **Cart** — `at_discount_progress_enabled`, `at_non_sale_collection_url`, **`at_discount_progress_empty_track`**, **`at_discount_progress_login_style`** (+ custom / link colors) for logged-out Log in on cart / drawer / bulk modals. **Palette-linked colors (tie to Color Palette):** **`at_discount_progress_accent`** (default `color_palette.foreground`), **`at_discount_progress_track`** (optional; blank falls back to the empty-track select), **`at_discount_progress_label`** (optional), **`at_bulk_grid_surface`** (default `color_palette.background`). These emit **`--at-dp-accent` / `--at-dp-track` / `--at-dp-label` / `--at-bulk-surface`** on **`:root` in `snippets/color-palette.liquid`** (global so both the strip and the sibling bulk grid inherit — do NOT put them only on the discount host). **Product PDP:** **`blocks/at-discount-progress`** (`show_discount_bar`, Log in **style_class**, padding); **`at-dp-condensed-strip--tight`** on block wrapper for strip typography. Site header account control stays the stock icon/text treatment in **`snippets/header-actions.liquid`**.
- **Behavior:** Logged-out customers see a compact **banner row** (person-in-circle icon + **`at_discount_progress.log_in_prompt`** + underlined **Log in**). The **entire banner** is the login hit target (`signed-out-avatar` slot on **`shopify-account`**, or a full-row `<a>` when accounts are disabled) on PDP/cart and in **`layout: drawer_header`** (cart drawer + bulk modals). Logged-in: **`cart:update`**, **`discount:update`**, `/cart.js` when payload omits subtotal. **Product** context: **`projected = cart subtotal + pending line`** (qty × variant price); condensed status + nodes use **projected**; **`variant:update`**, **`quantity-selector:update`**. **Bulk** context: grid qty × `data-at-bulk-variant-price` via `findBulkDiscountHost()`.
- **UI:** **One layout everywhere** — condensed status line + **continuous filled rail** + **milestone text labels UNDER the bar** (`.at-dp__cart-labels` > `.at-dp__cart-label`, positioned by `--at-dp-node-left`; first/last edge-align via `--first`/`--last`). Reached discount labels read “{{ label }} applied” (**`at_discount_progress.node_applied`**); shipping shows the tier name; future tiers show the short benefit label. **No more circular on-rail nodes** (`.at-dp__cart-node*` removed). Tap opens **Bulk savings** `<dialog>` (disclaimer + qualify link in footer; the dialog still uses truck/icon mounts). **`at-dp-condensed-strip--tight`** on drawer strip, bulk modals (`at-bulk-grid-modal`, `at-bulk-add-to-cart`, `at-popup-link`), **PDP** (`blocks/at-discount-progress`), and cart page strip (`main-cart` `.cart-page__at-dp-strip`). Drawer: **`header-actions`** header row **Cart | strip | close**.
- **AT Buy buttons order:** Merchants drag **Bulk Add to Cart**, **Quantity / add to cart**, and **Discount progress** in the theme editor under AT Buy buttons (`block_order`).
- **Cart drawer “empty” styling:** Do not use a dialog class like `cart-drawer--empty` that is only set in Liquid at first paint. AJAX cart updates use **hydration** morph on `[data-hydration-key="cart-drawer-inner"]` only; the `<dialog>` does not re-render, so an “empty” class on it stayed wrong after add-to-cart and **empty-state flex centering** (`height: 100dvh`, etc.) could hide the drawer header and condensed discount bar after close/reopen. Tie empty-only rules to real inner DOM, e.g. **`.cart-drawer__dialog:has(.cart-drawer__empty-message)`** (see `snippets/header-actions.liquid`). Drawer header uses **`snippets/cart-drawer-header.liquid`**: cart icon + count (not “Cart” text), center column for discount strip or inline “Get member discounts” + Log in, close on the right.
- **Cart drawer close control:** Close must target **`#cart-drawer/close`** (`<theme-drawer id="cart-drawer">`), not `cart-drawer-component/close` — `CartDrawerComponent` has no `close()` (lifecycle lives on `theme-drawer`). Style with **`theme-drawer__close-button`**, not base **`.close-button`** (that class is `position: fixed` + `--icon-size-xs` for modal overlays and makes a tiny non-layout X in the drawer header).
- **Morph + `<at-discount-progress-bar>`:** Section re-renders compare the live bar to **SSR**, which is an **empty** custom element. `morph`’s `updateChildren` then **removes** all JS-rendered children. Use **`data-skip-subtree-update`** on the host (in `snippets/at-discount-progress.liquid`; server HTML must include it too) and **`attributeChangedCallback`** in `assets/at-discount-progress.js` to re-parse `data-subtotal` / `data-milestones` / etc. and call `render()` when attributes copy over.
- **Colors:** Inherit parent surface tokens by default; rail fill + reached labels use **`--at-dp-accent`** (fallback `--color-selected-variant-background`), empty rail uses **`--at-dp-track`** (else the `at_discount_progress_empty_track` select), inactive labels use **`--at-dp-label`** (else subdued foreground). Set via the palette-linked Cart settings above. Login control: theme Log in button style setting (or PDP block). Tier copy: **`at_discount_progress.achievement_none`**, **`tier_unlocked`**, **`max_tier_reached`**. Disclaimer + qualifying link: **Bulk savings** dialog only (no separate PDP info popover).

## AT menu (`at-brands-panel`)

- **Focus-out handling:** Do not close the mega panel when `focusout` has `relatedTarget === null` (common on click-to-focus). Defer with `setTimeout(0)` and only close if `document.activeElement` is not inside the host.
- **Pointer-leave delay:** After the hover close delay, skip closing if focus is still inside the panel (keyboard users who moved the pointer away).
- **Brand search listeners:** Prefer `capture: true` on the dropdown `ref="panel"` for `input` / clear `click` so filtering still runs reliably.
- **Sidebar category hover:** `mouseenter` does not bubble, so declarative `on:mouseenter` on category buttons is unreliable. Use a bubbling `pointerover` listener on `refs.panel` gated with `(hover: hover) and (pointer: fine)`; keep `on:click` for keyboard and touch.
- **Transparent header + AT mega panel:** Solid top-row/underlay styling is tied to `#header-component:hover` / `:focus-within`. The fixed `.at-brands-panel__dropdown` can leave a vertical gap over the hero; the pointer then leaves the header while the panel stays open. Mirror hover rules with `#header-component:has(.at-brands-panel[data-open])` in `sections/header.liquid` (AT CUSTOM blocks).
- **Transparent header + popup nav items:** `.header[transparent]` defaults `--closed-underlay-height: 0px`. Only `:has(.menu-list__link:not([aria-haspopup]):hover)` set it to `100%` (plain links). Items with `aria-haspopup` matched the mega-menu `:has()` block without `--closed-underlay-height`, so the bar stayed visually transparent until Horizon’s `header-menu` JS set `--full-open-header-height` — which **AT Products** never triggers. Add `--closed-underlay-height: 100%` to that mega-menu `:has()` group in `header.liquid`.
- **AT mega panel `top`:** `Math.min(#header-component.bottom, max visible .header__row bottom)`; subtract **`at-brands-panel::after`** bridge (or `--header-padding`); when the announcement bar stacks above the header (`header.top` not flush to viewport top, bar ends at/above `header.top`), subtract **`padding-top + padding-bottom`** on **`#header-group .announcement-bar`**. Skip that inset when **`header.top < ~4px`** (sticky flush). Else **`Math.min(nav, row, trigger)`** fallback. Re-run **`#updatePanelTop`** after layout changes. Seam overlap **`max(2, 1 + borderBottomWidth)`**. Dropdown **`z-index: calc(var(--layer-header-menu) + 1)`**.
- **Products / dropdown chevron:** There is no `icon-chevron-down.svg` in Horizon assets; `snippets/icon.liquid` has no `chevron-down` case. Use **`icon-caret.svg`** with `inline_asset_content` inside **`svg-wrapper`** (same as `sections/header.liquid` localization). Open state: rotate the wrapper **`180deg`** (not 90°), matching `dropdown-localization`.
- **Custom theme icons:** Adding a picker option requires all of: **`snippets/icon.liquid`** (`when` case + paths), **`snippets/icon-or-image.liquid`** (non-`0 0 20 20` viewBox if paths exceed 20×20), **`blocks/icon.liquid`** and **`blocks/_accordion-row.liquid`** schema options, and **`locales/en.default.schema.json`** → `options.fast_truck` (use `t:options.<key>` with no spaces). Edits under **`.shopify-remote-main/`** are not deployed — change the repo root files.
- **AT nav + `menu-list__link`:** In the header block, links use both classes. **`blocks/_header-menu.liquid`** sets `.menu-list__link { flex-direction: column }` for the mega-menu bridge; override with **`.menu-list__link.at-menu__nav-link { flex-direction: row }`** in `at-menu.css` so titles and carets stay inline.

## Troubleshooting: Dev theme missing JSON templates (e.g. product)

If **Online Store → Themes → … → Edit code** on a development theme shows no `templates/product.json` (or other JSON templates) but **`main` and `dev` branches both contain them in Git**, the store copy is stale or was created from an incomplete source. **Fix:** From this repo root, push the full theme (or at least `templates/`) to that theme, for example with Shopify CLI: `shopify theme push` and select the dev theme, or `shopify theme push --only templates/product.json templates/product.access-threads.json` to upload the product templates only. Avoid habitually using `--only` for unrelated paths, which can leave the remote theme missing folders that exist in Git. If the theme is connected to GitHub in Admin, confirm the connected branch is the one that includes `templates/` and trigger a sync or reconnect.
