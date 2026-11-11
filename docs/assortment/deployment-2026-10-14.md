# Item 7: garment family and assortment alignment

Implemented October 14, 2026 on Ashley's Threads' existing live main theme, ID `187518812435`. Preview theme `190811308307` was reused. All six approved decisions (7A–7F) are handled through collection rules, shared references and two focused Liquid changes. No product facts, individual product breadcrumb fields, product publication, prices, inventory, handles or redirects were changed. No new collections were created.

## Assortments and navigation

Counts below are active products published to Online Store, not stock or market-specific purchasability.

| Destination | Before | After | Change |
| --- | ---: | ---: | --- |
| Activewear | 1,081 | 1,617 | Retain the native Activewear branch and inherit the 14 reviewed garment assortments in its Category menu. Two subcollection sources respect Shopify's ten-reference limit per source. Actual Polos/Hats performance attributes and existing garment assortment rules remain authoritative. Activity links are labelled Related Sport Assortments rather than being presented as narrowing garment children. |
| Outerwear | 625 | 843 | Add children's outerwear, activewear jackets/vests and the activewear Track Jackets path. Expose the existing root in desktop and mobile primary navigation. |
| Bags | 353 | 397 | Include Handbags descendants and the reviewed carry bags/cases currently classified under Motorcycle Bags & Panniers. Preserve those native categories for a separate classification correction. |
| Vests | 337 | 183 | Remove the broad Activewear Vests & Jackets category from the Vests rule; retain actual vest paths. The 154 active jackets removed from Vests remain available in Outerwear. |
| T-Shirts | 1,247 | 1,256 | Add native Henley Shirts with the reviewed existing T-Shirts product type. Their descriptions substantiate tee construction. Native categories are retained. |
| Shirts | 434 | 425 | Exclude the T-Shirts root dynamically so the nine reviewed Henley tees have one canonical garment family. Publish the existing reviewed Shirts draft to Online Store and add primary navigation. |
| Sweatshirts & Hoodies | 1,042 | 1,033 | Route the nine active native Track Jackets through Outerwear. Exclude sweaters and track jackets from sweatshirt-specific collections. Preserve other construction, audience, material and variant conditions. |
| Sweaters & Cardigans | 42 | 42 | Expose as its own garment family and remove the misleading link from sweatshirt Style. Retain Sweaters and Cardigans as distinct subtypes. Remove the unused Pet Sweaters criterion from the human sweater rules. |
| Henley T-Shirts | 15 | 13 | Retain reviewed tee constructions and exclude five non-tee Admin records, two of which are active. Other Henleys remain available in Shirts. |
| Mock Neck Shirts | 7 | 2 | Exclude T-Shirts, move its menu link to Shirts and assign Shirts as parent. Preserve the other five products in T-Shirts; do not manufacture a separate subtype link for them. |

The existing Track Jackets collection now includes the children's Track Jacket path. Tee sleeve collections also accept verified Henley tees with the matching native sleeve value. None of the newly included Henleys currently supplies that usable sleeve value, so their trails correctly remain broader.

The Safety Hats destination includes three hard-hat accessories. Its menu link is under Related Safety Accessories, and its title is now Safety Hats & Accessories. It has no fabricated canonical Hats parent. The empty Sport Jackets menu entry was removed before exposing Outerwear; its collection record remains intact.

## Shared breadcrumb mapping

The merchant-owned shop list now references **26 rules across nine garment families**: T-Shirts, Sweatshirts & Hoodies, Hats, Polos, Tank Tops, Outerwear, Bags, Sweaters & Cardigans and Shirts. Activewear is a cross-family shopping route and does not override canonical garment identity.

The central mapping and generated configuration are [families.json](families.json) and [breadcrumb-rules.json](breadcrumb-rules.json). The shared configuration replaces bulk product-level breadcrumb assignments. Collection references provide current URLs.

There are **179 verified canonical collection-parent relationships**, including existing assignments. This batch wrote **170 parent values and two concise labels**. Every assigned child is a subset of its intended parent in the fresh member export. There are no parent cycles and no product overlaps between the nine canonical roots. Parents for activity-based related assortments were not invented.

Only two theme files changed:

- `snippets/at-breadcrumb-rule-destination.liquid`: accessible, verified member destinations participate in family conflict detection. A native category ancestor shared with a non-member family no longer hides a valid trail. Actual conflicting member families still suppress output.
- `snippets/at-menu-products-category-body.liquid`: when the featured card falls back to the family root, its default Best Sellers label becomes the category title. Explicit featured collections and merchant-defined titles retain their behavior. Desktop and mobile use the same component.

No CSS or JavaScript was changed. Existing product templates, prices, variant controls and Product structured data were retained. The header section settings were left unchanged; the new primary items come from the merchant menus.

## Verification

A fresh Admin API 2026-10 export covered 8,129 products. A separate Online Store publication read found 6,702 active published products. Complete before/after membership comparisons passed exactly for all **49 collection-rule updates**, with no missing or extra members. The Safety Hats title update is separate from those rule updates.

Final API reads verified all 26 active rule objects and their fields, both edited menus, all 179 parent assignments, both labels and unchanged remaining four menus. Shirts publication was independently confirmed through the modern API. There are now 421 published collections; Kids' T-Shirts, Dress Shirts, Duffel Bags and the other unrelated drafts remain unpublished.

Both changed Liquid files passed Theme Check. The 12 new classification/membership fixtures, existing resolver and placement fixtures, historical live fixtures and progressive attribute fixtures passed. The live source files matched the captured baseline during preflight. Changes were previewed and pushed with a two-file `--only` selection and `--nodelete` to the existing live theme.

Live browser checks included:

| Product | Rendered trail |
| --- | --- |
| District DT145 | T-Shirts → Unisex; no inferred sleeve |
| Port Authority K321 | Shirts → Mock Neck → Adults → Unisex |
| Sport-Tek YST90 | Outerwear → Track Jackets → Kids → Unisex |
| Port Authority LSW2850 | Sweaters & Cardigans → Sweaters → Adults → Female |
| Port & Company KP55Y | Polos → Kids → Unisex |
| Rabbit Skins 4451 | Hats → Babies → Unisex; no subtype inferred from the title |
| Mercer+Mettle MMB200 | Bags; native classification remains flagged |
| Gildan 18500B | Sweatshirts & Hoodies → Hoodies → Kids → Unisex |
| Gildan 2200 | Tank Tops → Adults → Unisex |

YST90's Unisex link retains both Kids and Unisex on the Track Jackets URL. It returned two matching products, including the source PDP; browser Back restored the PDP. Product JSON-LD remained present. Live Activewear, Bags, Shirts and Vests page counts matched the export; top-level roots showed no empty breadcrumb row and Vests linked to Outerwear.

Navigation was reviewed on desktop and at a 390px mobile viewport, including the newly loaded Sweaters & Cardigans panel. The temporary viewport override was reset. These are focused checks, not a full cart/checkout regression suite.

## Reports and remaining work

The nine roots cover **5,347 active Online Store products**. All of them have a matching native category in the shared mapping. The **1,355 products outside these reviewed families** are exported for follow-up; no generic default route was assigned. This is not a claim that the entire catalog now has canonical breadcrumb coverage.

The 35 carry bags/cases in Motorcycle Bags & Panniers are exported for native classification correction. Missing sleeve or audience facts remain explicit; no Adults, Short Sleeve or precise age defaults were assigned. The previously identified Ring-Spun and Jersey collection count discrepancies remain separate issues. Ring-Spun stays unpublished and hidden from the T-Shirts menu.

Baby/Toddler scope, additional collection launches and SEO copy remain follow-on work. Search indexing or performance improvements are not claimed by this rollout.

Modern API compatibility is required: Shopify documents that API versions before 2026-07 can omit flexible collections. Merchant integrations should use 2026-07 or newer; this implementation uses 2026-10. Do not treat an older connector's missing result as a deleted collection. See [Shopify's collections model](https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/use-new-collections-model) and [Liquid metafield references](https://shopify.dev/docs/api/liquid/objects/metafield).

## Rollback

The private bundle is `.shopify-verify/assortment-repair/2026-10-14/`, excluded from Git. It contains the fresh product and collection exports, exact predicted sets, actual after-memberships, source IDs, saved API responses, rule and parent read-backs, menu preflight/after data, browser checks and live screenshot.

Theme rollback restores the two original snippets from `before-theme` to the verified live theme. Data rollback uses the saved `rollback-<collection-handle>.json` files to remove added sources/exclusions or restore category values without replacing unaffected conditions. The separate Safety Hats title rollback restores its original title. Restore the two menu inputs from `rollback-menu-*.json`; IDs of deleted items were removed so they can be recreated.

Restore prior metafield values or remove newly created fields according to `rollback-metafields.json`. Restore the shop's original eight-rule reference list and original rule fields from `navigation-before.json`; the 18 added metaobjects may remain unlinked. Remove Shirts from Online Store if reversing this publication change. Do not delete collection or product records. Review current merchant edits before replaying any rollback; theme and data changes are separate operations.
