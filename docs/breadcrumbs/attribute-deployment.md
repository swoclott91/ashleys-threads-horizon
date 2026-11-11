# Progressive attribute breadcrumbs

Production work starts from main commit cc4e279; dev and its pending color-option work are untouched. Five theme files implement the change: two new scoped snippets, the existing resolver and section, and editor translations. Templates, CSS, cart, variants, menus, and collection filter scripts are unchanged.

The merchant-owned at_breadcrumb_rule definition gained one optional list.single_line_text_field, breadcrumb_facets. The three reviewed root rules enable age-group, then target-gender. Both native filter parameters were verified in each root's actual collection rendering. Root and subtype destinations still use existing collection references and reviewed membership. Existing classification fields and other rules were retained.

YST350 now renders T-Shirts > Kids > Unisex > Short Sleeve. Each audience link adds one native taxonomy filter. The final Short Sleeve collection retains both filters; the actual preview shows both selected and 49 results. No sleeve filter was enabled or invented. YST350LS lacks verified Long Sleeve collection membership, so the sleeve link remains omitted. Missing, multiple, or invalid native audience values are skipped. Valid editorial overrides retain their explicit paths.

The rule audit, resolver suite, nine original live fixtures, and six new real product fixtures pass. Theme Check passes for the five theme files. Actual YST350 preview checks cover desktop placement, mobile collapse, filtered destination, and browser Back. These checks do not submit orders or alter cart contents.

Deployed to main in commit 5ed3576 through the existing authenticated Git connection. The published theme retains identity 187518812435 and MAIN role. Live read-back matches all five approved files; the theme grows from 543 to 545 files with no removals, and every other file fingerprint is unchanged. Actual main visits confirm YST350's four-step trail and CP90's Hats > Unisex > Beanies trail. See attribute-live-verification.json.

Pristine pre-update theme backup: 190769594643. Preview: 190769135891. Git rollback tag: main-before-attribute-breadcrumbs-2026-10-13. Roll back by disabling Narrow links by product attributes, clearing breadcrumb_facets on the reviewed roots, or reverting the component commit. Original metadata and current read-backs are exported alongside this document. Removing the optional definition is unnecessary for a UI rollback.

An empty diagnostic section remains on the unpublished preview because the connector blocks theme-file deletion as destructive. It is not tracked in Git, is not assigned to a template, and will not be deployed to main.
