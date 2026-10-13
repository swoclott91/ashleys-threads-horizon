# Main promotion — 2026-10-13

This promotion starts from `origin/main` commit `6dbe973` and retains the current live theme's functionality and styling. It does not merge the dev theme's other changes.

## Verified destinations and backup

- Live theme: `ashleys-threads-horizon/main`, ID `187518812435`, role `MAIN`.
- Unpublished main-based preview: `190736728339`.
- Pristine unpublished backup: `Main backup before AT Breadcrumbs 2026-10-13`, ID `190753505555`.
- The backup's 537 file fingerprints exactly match the live theme before promotion.

## Preserved live baseline

The live theme has `assets/product-title-truncation.js` and `snippets/color-schemes.liquid` that were absent from Git, plus newer `templates/page.brands.json` and `templates/page.services.json`. The first promotion commit copies these existing live files into version control. It introduces no storefront behavior or styling change. Other differences in the audited files are line endings only.

## Feature scope

Five new component files, one section insertion into each default product/collection template, and six translation keys comprise the feature. Existing template values and section order are identical after removing the breadcrumb insertion; existing translations are identical after removing the new keys. Main's global CSS, settings, header, cart, variants, recommendations, galleries, and filter code are preserved. The shared store rules are already populated and require no new data deployment.

The unpublished preview has exactly nine changed/added theme files relative to live, 542 files in total, and no deleted files. Read-back confirms all nine match the tested local source. Documentation, scripts, and test fixtures are repository support only.

## Validation

- Shopify Liquid/Theme Check: all nine feature files pass.
- The four preserved baseline files pass; the existing color-schemes snippet has an unused-snippet warning.
- Resolver and rule audit fixtures pass, including ambiguity, missing facts, unavailable/non-member references, root fallback, and PC380H.
- Nine exported live product fixtures pass without per-product breadcrumb overrides.
- Main preview: Gildan 5000 shows exactly one T-Shirts > Short Sleeve row before the heading on desktop and at 375px mobile width.
- Existing product gallery slide selection, color/variant updates (including the variant URL), and mega-menu expansion work in preview.
- Existing Product JSON-LD is present; no BreadcrumbList is introduced.
- Short Sleeve collection shows T-Shirts alone before its heading; T-Shirts root shows no row.
- The collection's existing Unisex filter updates the URL, selected filter chip, and result count while retaining the breadcrumb.
- Checkout/order submission and cart contents are not changed by these checks. The full regression evidence is the preservation of all non-feature source files plus focused browser checks; this is not a claim of exhaustive testing of every store workflow.

## Promotion and rollback

Merge the reviewed promotion branch into main through GitHub, retaining the existing GitHub-connected live theme identity. Verify the resulting live files and storefront after Shopify synchronization. Reverting the breadcrumb feature commit or disabling the section removes the UI. The pristine backup is available for restoring the full pre-promotion theme. Do not roll back shared store data merely to remove the component.
