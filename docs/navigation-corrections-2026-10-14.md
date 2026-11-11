# Navigation corrections — October 14, 2026

Decisions 1–6 are deployed to the existing live theme `ashleys-threads-horizon/main` (ID `187518812435`). Decision 7, parent assortment and category coverage, is deferred. The live identity was verified before deployment. The eight theme files were previewed on unpublished theme `190811308307`, then pushed individually with `--nodelete`. Shopify synced those changes to GitHub main in commit `986ccbf`.

## Completed decisions

| Decision | Result |
| --- | --- |
| 1. Correct home and category navigation | Home Shop Sale Items links to Sale. Removed the duplicate Women's item under T-Shirts. Corrected Lightweight, CrossFit/HIIT and PROJECT spelling; renamed Tank Tops and Polos weight groups to Weight. Sweatshirts' Sleeveless & Short-Sleeve entry is now Sleeveless. |
| 2. Validate Crew Neck and Ring-Spun | Crew Neck T-Shirts passed validation and was published to Online Store only; the T-Shirts Crew link now targets it. Ring-Spun failed the count reconciliation gate and remains unpublished; its misleading menu entry was removed. Combed Ring-Spun remains available. |
| 3. Remove broken About Us link | Removed the footer link temporarily. No replacement merchant story or page was created. |
| 4. Hide empty brand destinations | The desktop and mobile directories, featured brand links and brand count exclude collection links with no Online Store products. Removed the empty Champion promotion from the home page. Collection and product records remain intact. |
| 5. Add Brands directory | Published `/pages/brands`, using the existing `at-brands` menu and shared alphabetical renderer. Home View all, main Brands and Shop All Brands now lead to it. |
| 6. Standardize Port & Company | Updated the brand menu reference to collection `523158814995`, handle `port-company`. Preserved the alternate collection and URL. |

The visibility rule uses the collection object's `all_products_count`, independent of active storefront filters. It measures Online Store product availability, not inventory stock. The directory currently displays 103 of the 116 menu entries; empty collections can reappear automatically when their Online Store assortment is populated.

## Data validation

Crew Neck T-Shirts (`525879378195`) reported 983 Admin members, and pagination returned 983 distinct products. Every member passed the reviewed tee category, native Crew neckline and T-Shirts root membership checks. Existing collection rules were preserved. Publication was saved and confirmed through a fresh API read; the live mobile menu link opened its populated collection page.

Ring-Spun Cotton T-Shirts (`525962412307`) reported 167 members, but its exhausted product connection returned 163. All returned members passed the reviewed rules and root membership checks. The unresolved discrepancy prevented publication. No product recategorization or collection rule changes were made to resolve it.

The Brands page (`203228938515`) is published with template suffix `brands`. Four menus were updated: `main-menu`, `at-categories`, `at-brands` and `footer`. Exact read-back matched the reviewed inputs. `featured-brands` and `customer-account-main-menu` were verified unchanged.

## Theme verification

All eight changed theme files passed the Shopify Liquid/Theme Check validator. The directory width correction also passed validation. `git diff --check` passed. The six existing files matched the freshly downloaded live baseline before editing and again in the deployment preflight.

Browser verification covered the live home Sale and View all links, removed Champion promotion and About Us link, corrected heading, desktop category and Brands menus, 103-link Brands directory, Port & Company destination, brand search and Clear behavior. Mobile verification covered directory layout and search in preview, corrected category menu content on live, and actual navigation to Crew Neck T-Shirts. The temporary mobile viewport override was reset afterward.

No JavaScript, cart, variant, product, breadcrumb or Product structured-data code was changed. This was focused navigation verification, not a full checkout or variant regression suite.

## Rollback

The private evidence and rollback bundle is under `.shopify-verify/navigation-fix/2026-10-14/` (excluded from Git). It includes the complete `before-theme` snapshot, before/after menu and page exports, reviewed inputs, destination member pages, publication confirmation, file manifest and live directory screenshot.

For a theme rollback, restore the six original files from `before-theme` using a targeted push to the verified live theme. The two added Liquid files may remain unreferenced. Restore the original menu inputs from `menu-*-rollback.json`; IDs of removed entries have been omitted so Shopify can recreate them. Unpublish the new Brands page and remove Crew Neck T-Shirts from Online Store if reverting these publication changes. Keep the collection and product records. Theme restoration and data restoration are separate operations and should both be reviewed against current merchant edits before execution.

The eight changed theme paths are `templates/index.json`, `sections/header-group.json`, `templates/page.brands.json`, `sections/at-brand-directory.liquid`, `snippets/at-menu-brand-count.liquid`, `snippets/at-menu-brands-alpha-columns.liquid`, `snippets/at-menu-brands-directory.liquid` and `snippets/at-menu-mobile-drawer.liquid`.
