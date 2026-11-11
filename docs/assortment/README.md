# Reviewed garment families

`families.json` is the reviewed mapping for nine canonical garment families. It records collection references, native category IDs, the Henley construction rule, excluded Track Jacket classification, the Shirts exclusion of T-Shirts, audience facets, and eligible subtypes. Activewear is a separate merchandising assortment spanning those garment families.

Run `node scripts/build-at-breadcrumb-families.cjs` to generate `breadcrumb-rules.json`. Run `node scripts/test-at-breadcrumb-families.cjs` to check the generated configuration and resolver behavior. The configuration under `docs/breadcrumbs/rules.json` remains the earlier, eight-rule fixture snapshot; it is superseded for deployment by this directory's version 4 configuration.

The compiler writes a review artifact. It does not write to Shopify. Deploy a reviewed change by updating the merchant-owned `at_breadcrumb_rule` metaobjects and shop `custom.breadcrumb_rules` references, after validating destination publication, actual membership, collection parents and the collection eligibility predicates in this manifest. Reconcile the collection rules and mapping together. No product breadcrumb fields were populated for this rollout.

The Liquid resolver requires a native category match and actual membership in an accessible destination. Category ancestry can overlap: native Henley Shirts can represent tee and non-tee constructions. The reviewed T-Shirts collection accepts the verified tee construction; Shirts excludes that collection. An inaccessible or non-member candidate must not manufacture a family conflict. Conflicting accessible member families still suppress the row. Subtypes take precedence over audience filters, which preserve prior restrictions. Missing facts do not imply Short Sleeve or Adults.

Use Admin API **2026-07 or newer** for these flexible collections; this rollout used **2026-10**. Earlier API versions can omit collections using multiple sources, exclusions or subcollections. They must not interpret an omitted collection as a deleted record. The Online Store and Liquid use the native collections normally. See Shopify's [new collections model documentation](https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/use-new-collections-model).

See [the deployment record](deployment-2026-10-14.md) for member-set validation, production examples, reports and rollback.
