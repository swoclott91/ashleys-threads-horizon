# Collection foundation: first implementation batch

Completed October 14, 2026 against Ashley’s Threads production store. Five existing membership rules and eight collection parent references were updated. Four collections were created with draft descriptions and SEO fields and remain unpublished on every channel. No theme code, menus, product facts, product publication, canonical URLs or structured data were changed in this batch.

## Inventory correction

The earlier audit counted 383 collections using an older API. Shopify’s flexible collections are omitted by API versions before 2026-07, sometimes returning null without errors. Reading through Admin API 2026-10 revealed 40 additional pre-existing collections: the store had **423**, and now has **427** after this batch. Future collection audits and mutations must use the modern API/model and verify IDs after every operation.

This corrected inventory includes Youth T-Shirts, Youth Sweatshirts, Youth Polos, Toddler T-Shirts, Baby T-Shirts, Baby/Toddler Sweatshirts and Family & Matching Sets. Reuse those pages before creating audience duplicates. The [current inventory](collection-inventory-2026-10-14.md) supersedes the earlier export.

## Applied membership repairs

Counts below are active products published to the Online Store, not in-stock or market-specific purchasability. Exact member IDs, including all draft products, were checked separately against native category and attribute predicates.

| Existing collection | Before | After | Repair |
| --- | ---: | ---: | --- |
| Sweatshirts & Hoodies | 929 | 1,042 | Include current children’s Hoodie and Sweatshirt category paths |
| Hoodies | 463 | 544 | Include current children’s Hoodie path |
| Long Sleeve T-Shirts | 255 | 331 | Include reviewed children’s and activewear tee paths while retaining native Long sleeve condition |
| Polos | 468 | 488 | Include current children’s Polo path |
| Crewneck Sweatshirts | 28 | 161 | Replace literal `tag:sweatshirts` with reviewed Sweatshirt categories AND native Crew neckline |

The first four repairs retained every existing member. Crewneck added 135 active/published products and removed two incorrectly included T-shirts: CS408 and CS409. Existing collection IDs, handles, titles, descriptions and SEO fields were preserved. Long Sleeve and Crewneck now use flexible grouped conditions; older Admin API reads cannot see those collections, but they retain their identities.

## New unpublished pages and reused destinations

| Destination | Action | Collection ID | All Admin members | Active/Online Store products |
| --- | --- | --- | ---: | ---: |
| Shirts | New draft | 528883876115 | 481 | 434 |
| Dress Shirts | New draft | 528883908883 | 114 | 110 |
| Duffel Bags | New draft | 528883941651 | 72 | 42 |
| Kids’ T-Shirts | New draft; hold for overlap review | 528883482899 | 197 | 187 |
| Youth T-Shirts | Reuse existing | 523281924371 | 204 | 194 |
| Youth Sweatshirts | Reuse existing | 526107771155 | 122 | 102 |
| Youth Polos | Reuse existing | 523281891603 | 28 | 24 |
| Toddler T-Shirts | Reuse existing | 523281039635 | 28 | 25 |

Kids’ T-Shirts was created before the API omission was discovered. It is restricted to native Kids, whereas Youth T-Shirts includes Kids or Teens. Keep the new draft unpublished while selecting the intended audience URL and scope; do not publish two substantially overlapping SEO pages by default. No additional Kids’ Polos, Kids’ Sweatshirts or Toddler T-Shirts duplicates were created.

Toddler T-Shirts includes Toddlers or 1–2 years, explaining its 25 active/published members rather than the 24 from the initial Toddlers-only proposal. Youth Sweatshirts also has sweater category criteria; review its broader intended scope before changing its name or writing fleece-only copy.

Parent references set using the existing merchant-owned `custom.breadcrumb_parent` definition:

- Kids’ T-Shirts, Youth T-Shirts and Toddler T-Shirts → T-Shirts.
- Youth Polos → Polos.
- Youth Sweatshirts and Crewneck Sweatshirts → Sweatshirts & Hoodies.
- Dress Shirts → Shirts.
- Duffel Bags → Bags.

Shirts is a root with no parent. Existing titles supply breadcrumb labels. No per-product breadcrumb fields were populated. The shared PDP rule set was not expanded, so new Shirts/Duffel pages do not yet automatically introduce new PDP breadcrumb families. Progressive attribute links must continue preserving earlier subtype and audience restrictions.

## Verification and remaining rollout

The modern bulk read-back contains 427 collections and 73,942 total collection/product rows. All 13 selected collection member sets exactly match their reviewed native predicates. Eight new parent references were verified; all current parent references are available and acyclic. Admin UI confirms all four new pages are published to **0 channels**. GraphQL create, parent mutation and export/status operations passed schema validation. Before/after exports and exact verification results are saved locally.

The initial implementation session was blocked by the storefront password screen. The subsequent [navigation audit](navigation-audit-2026-10-14.md), using the supplied password, verified the Gildan 5000B, Sport-Tek YST350LS and Gildan 18500B trails; Hoodies, Crewneck and Youth Polos parent links; and empty output on top-level T-Shirts/Hats. The Kids + Unisex Hoodie link retained both filters and returned 71 products, matching the native-fact export. No theme deployment occurred.

Next work:

1. Extend the verified production PDP/PLP cases to broader facet, return-navigation and mobile regression checks before expanding theme rules.
2. Audit publication of the 40 previously omitted pages; select Youth/Kids audience scope and avoid duplicate indexable pages.
3. Review Baby/Toddler Apparel scope, Short Sleeve Polos curation, missing native sleeve/age facts and children’s Hats breadcrumb classification. The fresh Hats root already contains the children’s category, so it was not changed.
4. Stage differentiated SEO briefs for reused roots, subtypes and audience pages; review the four draft descriptions and metadata in their actual templates.
5. Add reviewed breadcrumb families for Polos, Shirts and Bags, then preview/test those theme changes independently. Publish reviewed collection pages and add internal links in a separate explicit rollout.

## Rollback records

Private local files are under `.shopify-verify/collection-foundation/2026-10-14/` and are excluded from Git. Keep this directory with the store’s change record; do not publish signed export URLs.

| File | Purpose |
| --- | --- |
| `collections-before.json` | Original five repair targets’ rule sets, identity, SEO and parent metadata, plus related roots |
| `products-before.jsonl` | All 8,129 product facts, publication flags and legacy-visible memberships before writes |
| `modern-inventory-before.json` | Modern inventory revealing the previously omitted collections, captured after initial repairs/Kids draft |
| `modern-sources-before.json` | Reused audience conditions and original empty parent values before parent writes; repair conditions here are already updated |
| `parent-assignments.json` / `parents-result.json` | Eight applied parent values and mutation result |
| `create-*.json` / `created-*.json` | Three modern draft inputs and returned IDs |
| `planned-inputs.json` | Initial reviewed predicates and Kids’ draft input |
| `collections-after.jsonl` | Complete modern inventory and membership read-back |
| `verification-results.json` | Exact membership comparisons, counts, removals and parent validation |

To roll back membership, translate the original five targets’ `ruleSet` from `collections-before.json` into modern 2026-10 sources on the same IDs, including the original literal Crewneck tag condition if restoring that historical behavior is intended. Recheck exact original member sets. Do not use the after-repair sources as the rule rollback baseline, and do not rely on a legacy API to locate converted collections. Clear the eight newly assigned parents (all were previously empty); retain the four new pages unpublished unless a separately reviewed removal is requested. Theme rollback is unnecessary for this batch.

Source: [Shopify flexible collection migration and older-API visibility](https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/migrate-to-flexible-collections).
