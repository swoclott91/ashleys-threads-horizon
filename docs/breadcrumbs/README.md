# AT Breadcrumbs

The current implementation derives product trails from Shopify's native category and existing attributes. Products do not need an individual breadcrumb assignment. A small merchant-owned rule list maps classifications to collection references; collection parent and label metadata are retained for rendering. The first release covers T-Shirts, Sweatshirts & Hoodies, and Hats.

## Shared rules and maintenance

The store metafield `custom.breadcrumb_rules` contains a `list.metaobject_reference` of eight `at_breadcrumb_rule` entries. The definition and shop field have storefront PUBLIC_READ access. Merchants and other installed apps can maintain the mapping; it is not app-owned. Edit entries under Content > Metaobjects > AT breadcrumb rule and maintain the selected list under the store's custom data. The initial configuration is versioned in `rules.json`.

| Rule | Classification | Destination |
| --- | --- | --- |
| T-Shirts root | Reviewed native tee category IDs, including activewear, youth and maternity tees | T-Shirts |
| Short sleeve tees | Tee category plus native sleeve-length-type taxonomy value 169 | Short Sleeve |
| Long sleeve tees | Tee category plus native sleeve-length-type taxonomy value 17094 | Long Sleeve |
| Sweatshirts root | Native sweatshirt and hoodie category IDs | Sweatshirts & Hoodies |
| Hoodies | Native hoodie category IDs | Hoodies |
| Hats root | Native Hats category or descendant | Hats |
| Trucker hats | Native Trucker Hats category | Trucker Hats |
| Beanies | Native Beanies category | Beanies |

Each entry holds a name, garment family, native category GIDs, optional attribute namespace/key and accepted values, destination collection reference, and numeric priority. A priority of 0 defines the family root; the initial subtypes use 10. Rule list order and product collection order do not determine the trail. Native category ancestors are matched by GID, so localized display names do not affect classification. Attribute references match stable taxonomy value GIDs or metaobject GIDs; text designations match exactly. Reviewed audience filters now add Age group and Target gender between the category and verified sleeve subtype. Material, weight, finish, color and size remain outside this trail.

Changes to an existing product's native category or sleeve/style data take effect on its next page render. New products use the same rules without breadcrumb-field population. Additional families and designations can be added as reviewed rules with published destination references and collection parent metadata. Keep one root per family, at most 32 rules, at most 32 category IDs per rule, and at most 16 accepted attribute values. Run the graph audit before changing the live mapping. Initial rules do not cover tanks, polos, bags, or other families yet.

## Progressive audience links

The optional merchant-owned at_breadcrumb_rule field breadcrumb_facets is a list.single_line_text_field on root rules. The three reviewed roots (T-Shirts, Sweatshirts & Hoodies, Hats) list age-group, then target-gender. The theme reads one unambiguous native taxonomy value per approved key and preserves previous filters in each subsequent URL. The verified sleeve subtype remains the final link, with both audience filters retained. No per-product assignments, collection creation, or filter-settings changes are needed. Further category roots retain their existing trails until their filters are reviewed and enabled.

Collection filter objects are not populated on a PDP. The root policy therefore records the two native filters verified in actual collection rendering. Review this short policy when Search & Discovery filter settings change; removing a key disables that step. Supported keys are age-group and target-gender, at most two distinct keys per root. Missing, multi-valued, or non-taxonomy data is skipped. Valid editorial overrides retain their explicit paths.

The sleeve filter is not currently enabled on the T-Shirts root. Short/Long Sleeve links continue to require reviewed classification, visibility, and actual subtype collection membership. For example, YST350LS currently lacks verified Long Sleeve collection membership, so its trail ends at Unisex until that membership is corrected.

## Resolution and safeguards

`snippets/at-breadcrumb-rule-matches.liquid` matches category and optional attribute facts. `snippets/at-breadcrumb-rule-destination.liquid` selects the highest-priority matching destination; equal-priority conflicts fall back to the valid family root. Conflicting families hide the automatic row. Missing facts never imply a subtype. Unknown categories hide the row until a rule or editorial override is reviewed.

Destination links require publication, a current URL, and actual membership in `product.collections`, which excludes Online Store-inaccessible collections. Non-member, unavailable, or deleted subtypes fall back to a valid member root. Root membership is checked separately: a valid subtype may be displayed alone when its parent is not a visible member. This intentionally exposes no fabricated links and does not correct catalog membership automatically.

The product field `custom.breadcrumb_collection` is now an optional editorial override. A valid member reference wins over rules; an invalid reference falls back to the rules. Do not bulk-populate this field. The five assignments from the earlier pilot were removed after dev verification; their exact before values remain in the dev branch rollback exports. PC380H automatically routes to T-Shirts from its corrected Activewear Tops > T-Shirts category. Its hood does not create a fleece route, and missing sleeve facts leave it at the root.

The retained collection fields are `custom.breadcrumb_parent` (`collection_reference`) and `custom.breadcrumb_label` (optional `single_line_text_field`). Root parents are empty. The Short Sleeve collection remains ID `525843595539` with copied handle `long-sleeve-t-shirts-copy`; neither URLs nor classification are inferred from its handle. Current destination URLs come from collection objects. Labels fall back to current collection titles.

## Frontend

The AT Breadcrumbs section precedes the existing heading section in default product/collection templates. It emits a labelled navigation landmark, ordered list, linked ancestors only, escaped labels, and decorative separators. It excludes Home and the current product/collection, emits at most four links when reviewed audience filters are enabled, and adds no BreadcrumbList structured data. A collection with no parent has no empty row. The existing Product structured data is unchanged.

The optional layout script measures whether the full trail fits on mobile. If not, it shows the immediate parent with a decorative back chevron. With scripts unavailable, server-rendered links still work and mobile shows the immediate parent. Settings include enable/disable, audience-filter enable/disable, width, alignment, spacing, and mobile display.

`collection.brand.json` and `product.access-threads.json` are unchanged because their parent/assignment scope has not been established. Featured products, cards, quick add, recommendations, menus, variants and cart navigation are untouched. The separate source-collection return enhancement remains pending.

## Validation and rollback

Install liquidjs in an ignored verification directory or set LIQUIDJS_PATH to an existing installation. Then run:

```powershell
node scripts/test-at-breadcrumbs.cjs
node scripts/test-at-breadcrumb-live-fixtures.cjs
node scripts/test-at-breadcrumb-attributes.cjs
node scripts/audit-at-breadcrumb-rules.cjs docs/breadcrumbs/rules.json docs/breadcrumbs/rules-collections-before.json
```

The live-fixture test uses native category/attribute and membership exports for nine products, omits all individual breadcrumb fields, and verifies the resulting links. The graph audit rejects missing/unpublished destinations, conflicting families, malformed attribute rules, missing roots, incorrect subtype parents, cycles and depth greater than two. `scripts/audit-at-breadcrumbs.cjs` and the original pilot reports are historical assignment-preparation tools, not a requirement for maintaining ordinary products.

Theme Check and the resolver/live-fixture tests pass on the main-based promotion. See main-promotion.md for the verified theme identities, preserved baseline, preview checks, backup, and deployment details. The initial data exports included here support repeatable fixtures; complete historical seed and pilot rollback exports remain on the dev branch.

Rollback the visible feature by disabling/removing the AT Breadcrumbs section or reverting the feature commit. The shared store rules do not need to change. Restore the pristine main backup for a full theme rollback if required. Store data is shared across themes; theme and data rollback remain separate actions.

The original menu issues recorded in destinations.json remain unchanged. Source-collection return context is a separate pending enhancement.

Shopify references: [native product category and visible collection membership](https://shopify.dev/docs/api/liquid/objects/product), [category ancestors and GIDs](https://shopify.dev/docs/api/liquid/objects/taxonomy_category), and [reference metafield values](https://shopify.dev/docs/api/liquid/objects/metafield).
