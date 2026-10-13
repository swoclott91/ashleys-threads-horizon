# Category-first breadcrumb order

Deployed to the published Ashley's theme on 2026-10-13 in commit 70d78e0. This supersedes the ordering examples in attribute-deployment.md; that document remains a historical deployment record.

The trail now places the garment root and verified subtype before audience filters. PC78H renders Sweatshirts & Hoodies > Hoodies > Unisex. YST350 renders T-Shirts > Short Sleeve > Kids > Unisex. The subtype link opens its unfiltered collection; each audience link narrows that same subtype collection, preserving earlier audience filters. Without a verified subtype, filtering still uses the validated root. Missing or ambiguous audience values, editorial overrides, and membership/visibility safeguards retain their previous behavior.

Only snippets/at-breadcrumb-facets.liquid changed in the production theme. Shopify read-back matches the approved source. The published theme remains 187518812435, ashleys-threads-horizon/main, role MAIN, with 545 files. Every other theme file checksum is unchanged and no files were removed. No shared metadata, product assignments, templates, styling, or JavaScript changed.

Validation passed: attribute resolver fixtures for six real products and invalid/missing/ambiguous values, the original resolver/mapping/section checks, nine legacy live-data fixtures, and Shopify Theme Check for the changed snippet. Preview and published browser visits confirmed PC78H and YST350 link order. Following YST350's final link retained Kids and Unisex within Short Sleeve T-Shirts, showing 49 results. At a 375px preview viewport, YST350's complete four-link trail fit on one line; the final destination retained both filters. The viewport override was reset.

Preview theme: 190771298579, copied from current production before the change. Git rollback tag: main-before-category-first-breadcrumbs-2026-10-13 (66e7f0f). Revert commit 70d78e0 to restore the previous order. The before-update source and file checksums were also saved locally under .shopify-verify/breadcrumbs/category-first-before.json.
