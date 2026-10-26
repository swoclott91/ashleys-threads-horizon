# Feature Badges

Feature Badges is a theme block that can be added inside Product information → Details, a Group, or an accordion row. The default product template already places it above the product description, replacing the two static icon/text groups.

Each of the five badge slots has a product metafield selector, an optional required value, an existing theme icon, a badge/popup title, and an initially empty rich text popup field. Use Disabled to turn off a slot. Other product metafield accepts a namespace.key identifier, such as `custom.fabric`.

The preset configures these conditions:

| Badge | Metafield | Required value | Icon |
| --- | --- | --- | --- |
| Tear-Away Label | `shopify.clothing-features` | `Tear-Away Label` | Tear-away label |
| Ring-Spun | `custom.cotton_type` | `Ring-Spun` | Ring-spun cotton |
| Open-End Cotton | `custom.cotton_type` | `Open-End` | Open-end cotton |
| Combed Ring-Spun Cotton | `custom.cotton_type` | `Combed Ring-Spun` | Combed ring-spun cotton |
| Sustainable Style | `custom.sustainable_style` | Leave blank | Recycle |

Required values match exactly, ignoring case and outer spaces. Ring-Spun does not match Combed Ring-Spun. Update the values in the editor to match the wording stored on your products. Multiple slots can use Clothing Features to explain different entries independently.

## Garment construction

Garment Construction is available in every slot's Product metafield selector and reads `custom.garment_construction`. Both construction icons are included in the same icon picker as the standard Icon block.

The **Construction Badges** preset configures two mutually exclusive rows:

| Required value | Badge title | Icon |
| --- | --- | --- |
| `Side-Seamed` | Side-Seamed Construction | Side-seam construction |
| `Tubular` | Tubular Construction | Tubular construction |

The default product template includes a second Feature Badges block named Construction Badges, immediately after the existing five-slot block in the Description accordion. It contains editable explanations for both construction types. The existing cotton, tear-away and sustainability settings are retained. Each block still supports up to five rows.

Only the exact matching construction row appears; empty, missing and unrecognized values show neither row. The new preset leaves popup content empty for new placements, with the same dynamic source support. In the theme editor, add **Construction Badges** to place this pair elsewhere, or select Garment Construction in any existing row and set the required value, title, icon and popup content.

Clothing Features checks each referenced entry's `label` field or its `system.handle`; it does not search serialized object data. Other metaobject references use the configurable Other metaobject label field, which defaults to `label`. Text lists compare individual items. A blank required value checks for any populated value; rich text checks its readable text so an empty document does not trigger a badge.

In the theme editor, open each badge's Popup content field to add the explanation or connect a compatible dynamic source. In the default product template, Sustainable Style is already connected to `custom.sustainable_style`. When adding a new Feature Badges block, connect that source using the dynamic source button. The cotton and tear-away explanation fields intentionally start empty; fill them before publishing. Clicking a matching badge always opens its dialog, even if its explanation has not been filled yet.

Popup/drawer behavior, typography, icon size, row spacing, and block padding are editable. The block uses the existing `dialog.js` component and the popup link's shared styles and popover theme settings. Escape, outside click, close button, and scroll locking use the existing dialog behavior.

With no matching rows, the storefront renders no badge container or spacing. The theme editor shows a setup message so the empty block remains selectable. A row without a title is also hidden.

## Validation

`scripts/test-feature-badges.cjs` renders the actual Liquid with LiquidJS to exercise matching and block output. Install LiquidJS in a temporary directory and set `LIQUIDJS_PATH` to its package directory before running `node scripts/test-feature-badges.cjs`. The test fixture supplies Shopify-specific filters; Shopify Theme Check validates the real theme syntax and schemas.

Changes are local until uploaded to a Shopify theme. For a store preview, check a product with multiple Clothing Features, each cotton type, and populated/empty Sustainable Style. Verify the editor's dynamic source connection resolves for different products, and check the popup on desktop and mobile.
