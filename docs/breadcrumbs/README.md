# AT Breadcrumbs development increment

Implemented locally on `dev`. This increment provides the canonical ancestor component and a data preparation audit. This implementation has made no store mutations or theme pushes. The component remains hidden until reviewed references are populated.

## Frontend behavior

`sections/at-breadcrumbs.liquid` precedes the existing heading section in the default product and collection templates. The section resolves the assigned collection and its parent through `snippets/at-breadcrumbs.liquid`. It renders at most two links and excludes Home and the current page. A collection without a parent produces no markup or spacing. Labels come from `custom.breadcrumb_label`, falling back to the current collection title; URLs come directly from collection objects.

Product links require membership in `product.collections`, a publication date, and a nonempty collection URL. An inaccessible or non-member subtype can fall back to its accessible member parent. A missing/deleted reference with no resolvable parent hides the row. Membership order never selects a destination. Self-parent IDs are deduplicated. Parent cycles and excessive depth are rejected during data preparation.

The optional `assets/at-breadcrumbs.js` only measures layout. Desktop displays both ancestors; mobile displays both when their measured width fits, otherwise the immediate parent with a decorative back chevron. With scripts unavailable, mobile shows the immediate parent; the server-rendered links still work. Very long immediate-parent labels receive an ellipsis instead of wrapping or shrinking the font. The section exposes enable/disable, width, alignment, vertical spacing, and automatic/immediate-parent mobile display.

`collection.brand.json` is unchanged because no brand parent is established. `product.access-threads.json` is unchanged because its Ashley's assignment has not been audited. The PC380H sample uses the default product template, but that does not establish assignments for the rest of the catalog. Product cards, quick add, menus, variants, recommendations, and existing Product structured data are untouched. No BreadcrumbList JSON-LD is emitted.

## Read-only store audit

`readiness-before.json` records the existing field definitions and eight destination IDs. All eight destinations were confirmed published to the Online Store on October 13, 2026 UTC. This confirms destinations, not product eligibility or purchasable assortment. The Short Sleeve collection ID is `gid://shopify/Collection/525843595539`; its copied handle remains unchanged.

No product collection-reference definition exists in any namespace. Collections currently define `custom.brand` and `custom.pretty_title`; neither supplies the required parent relationship. The proposed `custom.breadcrumb_collection`, `custom.breadcrumb_parent`, and `custom.breadcrumb_label` definitions are absent. `destinations.json` defines their proposed contract and the initial destination graph. It also records the three menu issues from the supplied plan; those issues have not been independently re-audited or edited in this increment.

PC380H is present as `gid://shopify/Product/10426119618835` with a description identifying a shirt-weight polyester performance hooded tee. The initial native category was Hoodies and its memberships excluded T-Shirts, producing an ambiguity. The merchant subsequently confirmed that it belongs under Activewear Tops > T-Shirts. A fresh read already showed that correction applied: category `aa-1-1-2-2`, product type T-Shirts, memberships in T-Shirts and Activewear T-Shirts, and no hoodie/sweatshirt memberships. No product update mutation was needed. Its reviewed canonical breadcrumb destination is now the T-Shirts root, with no fabricated subtype.

`exception-before.json` preserves the earlier evidence; `initial-audit-input.json` and `initial-audit-report.json` preserve the original ambiguity. `pc380h-category-after.json` records the corrected live category and memberships. `reviewed-audit-input.json` and `reviewed-audit-report.json` propose the validated root assignment after merchant review. These are preparation reports, not applied breadcrumb metafields.

## Data preparation and rollout order

1. Refresh the read-only definition, product fact, membership, and Online Store publication exports. Preserve the current metafield IDs, values, and compare digests before any write. The saved readiness file is an initial audit, not a complete product rollback export.
2. Create or reuse the three merchant-owned definitions from `destinations.json`; use storefront-readable access. Definitions must precede values. Recheck equivalent definitions at execution time to avoid duplicates.
3. Review representative product evidence. Normalize native category and verified facts into the audit input below. Garment subtype takes priority over wearer/material/weight/finish/performance attributes. Conflicting subtypes require review. Avoid title/handle guessing and menu column relationships.
4. Run the audit, review every issue, and export the proposed before/after changes. The auditor writes reports only; it makes no API requests or store mutations. Populate reviewed collection parents/labels, then representative product collection references by ID. Use compare digests when writing to protect concurrent merchant edits. Read back and preserve the actual after export.
5. Verify the current Ashley's store and unpublished theme identity immediately before a selective theme push; environment IDs alone are insufficient. Preview actual populated PDPs/PLPs, including theme-editor behavior, before extending to bulk assignments or alternate templates.
6. Implement the separate collection return-context enhancement after the canonical component has been reviewed. Filter/sort/page preservation, infinite-scroll anchors, desktop `.page-wrapper` scrolling, browser Back, stale state, and modified/new-tab navigation remain pending. No source-context storage or card-navigation patch is included yet.

Refresh references when category facts, membership, or publication change. Disabling/removing the AT Breadcrumbs section rolls back this UI. Data rollback requires the separate actual before export; removing theme code cannot restore store metafields.

## Audit input and commands

Input format (category/fact names are normalized by the reviewer, never inferred in Liquid):

```json
{
  "store": "ashleys-threads-3.myshopify.com",
  "collections": [
    {
      "id": "gid://shopify/Collection/523280777491",
      "onlineStorePublished": true,
      "parentId": null,
      "label": null
    }
  ],
  "products": [
    {
      "id": "gid://shopify/Product/REPLACE_WITH_REVIEWED_ID",
      "styleCode": "REVIEWED_STYLE",
      "membershipComplete": true,
      "collectionIds": ["COMPLETE_EXPORTED_COLLECTION_IDS"],
      "breadcrumbCollectionId": null,
      "evidence": {
        "verified": true,
        "source": "Dated native category and verified product fact export",
        "categoryId": "EXPORTED_NATIVE_CATEGORY_ID",
        "families": ["tee"],
        "facts": { "sleeve": ["short"] }
      }
    }
  ]
}
```

Supply every configured destination in `collections`. Families supported in the first release are `tee`, `sweatshirt`, and `hat`. Facts are arrays; supported subtype values are sleeve `short`/`long`, construction `fleece_hoodie`, and style `trucker`/`beanie`. Other verified attributes do not determine the trail. Unknown families, missing evidence, inaccessible destinations, cycles, and conflicting facts are reported. A non-member subtype can produce a proposed root fallback, but the issue still blocks a clean rollout report. `ready` must be true before population; resolve issues and rerun rather than deploying only the successful subset silently.

```powershell
npm install --prefix .shopify-verify/breadcrumbs --no-save --package-lock=false liquidjs @shopify/theme-check-common @shopify/theme-check-node @shopify/theme-check-docs-updater
node scripts/test-at-breadcrumbs.cjs
node scripts/audit-at-breadcrumbs.cjs reviewed-export.json reviewed-report.json
```

The audit exits nonzero when issues exist. To use another LiquidJS installation, set `LIQUIDJS_PATH` to its absolute package path. The ignored `.shopify-verify/` directory holds temporary dependencies, copied validator, and local preview fixtures. The bundled validator was restored by copying `shopify-liquid/scripts/validate.mjs` beside these dependencies; run it with an absolute `--theme-path` and the seven changed theme files via `--files`.

Validation completed: Liquid rendering and section/template fixtures; preparation fixtures covering roots, subtype priority, ambiguity, missing evidence, non-membership, publication, cycles, excessive depth, and PC380H; Theme Check for all seven changed theme files; desktop and mobile local fixture review, including a narrow container fallback and script-free mobile links. These fixture checks do not replace an unpublished Shopify theme preview with live populated metadata. The collection return-flow and deployment checks are still pending.

Shopify references: [collection-reference metafield values](https://shopify.dev/docs/api/liquid/objects/metafield) and [Online Store product collection membership](https://shopify.dev/docs/api/liquid/objects/product#product-collections).
