# Ashley’s Threads home page and navigation audit

Checked October 14, 2026. **Several links need correction, although all menu collection references resolve to existing published collections.** This was a read-only audit: no store data, menus, publication, theme settings or code were changed.

## Scope and evidence

The current live theme was verified as **ashleys-threads-horizon/main (#187518812435)**. The storefront was accessed through its password screen using the supplied password; the password is not included in the saved audit.

- Read all 6 live menus: main-menu, footer, customer-account-main-menu, at-brands, at-categories, featured-brands.
- Checked 378 menu items, including 371 collection references covering 328 distinct collections.
- Read all 427 collections with Admin API 2026-10; the publication filter returned 419 published and eight unpublished collections. No menu collection references are missing, unpublished or using an outdated handle.
- Opened all eight desktop primary panels. Spot-checked mobile T-Shirts, Sweatshirts and Brands at 390px; their collection destinations agree with desktop. The viewport override was reset.
- Visually/DOM checked 53 destination URLs, including every distinct collection/directory URL used by the visible home-page promotions, empty brand/category destinations, footer pages and policies, selected subtypes/audiences and three representative PDPs. This is not a browser crawl of all 328 collection pages.
- Pulled the live theme’s index template, header group, menu-data section and settings data into the private audit directory to locate current settings. These reads did not overwrite the working theme checkout.

Membership comparisons use the complete same-day product/publication and modern collection-member exports from the preceding foundation batch, corroborated by fresh collection counts and the visible page counts. These counts measure publication coverage, not in-stock or market-specific purchasability. Some large collection pages loaded slowly and were verified after loading; timeouts were not classified as broken links.

## Corrections and decisions

| Priority | Location | Current destination / observation | Finding | Proposed next action |
| --- | --- | --- | --- | --- |
| High | Home: Shop Sale Items | /collections/all | Opens all 6,702 catalog products instead of the Sale assortment. | Use the existing /collections/sale destination. |
| High | T-Shirts → Collar → Crew | /collections/crewneck-sweatshirts | Opens Crewneck Sweatshirts: all 161 active/published members are outside the T-Shirts root. | Use Crew Neck T-Shirts only after its rules and Online Store publication are reviewed; it is currently unpublished. Keep Crewneck Sweatshirts under Sweatshirts. |
| High | Footer: About Us | /pages/about-us | Returns Page not found / 404 Not Found. Admin has no About page or alternative About handle. | Create a real reviewed About page or remove this menu item; there is no existing valid About destination to substitute. |
| Medium | T-Shirts → Material → Ring-Spun | /collections/combed-ring-spun-cotton-t-shirts | Ring-Spun and Combed Ring-Spun link to the same collection ID. | Use the existing distinct Ring-Spun Cotton T-Shirts page after membership and publication review; it is currently unpublished. |
| Medium | Home: Champion logo | /collections/champion | The promoted brand destination renders 0 items despite 58 Admin product records. | Remove/replace the promotion until the intended Champion assortment is active and published. |
| Medium | Brands A–Z and unused Outerwear submenu | Multiple | 13 brand destinations and Sport Jackets render 0 items. | Hide empty promotional/menu links until assortment is ready; retain collection data. Sport Jackets is in the category data but its Outerwear root is absent from primary navigation. |
| Medium | Home: 100+ Trusted Brands → View all | No link | View all> is a plain paragraph, outside any anchor. Its parent has no links; the live JSON contains only text. | Replace it with a real accessible brand-directory link. |
| Medium | Brands menu: Shop All Brands | /collections/all | The desktop CTA opens all products, not a brand-directory page. Its configured CTA destination is blank, so it falls back to the main-menu Brands URL. | Choose a real directory destination, or rename it Shop All Products / Shop All Brands’ Products if the catalog is intended. |
| Medium | Port & Company: home/featured vs A–Z | /collections/port-company and /collections/port-and-company | The same brand is routed through two different collections with identical 170-member Admin sets (167 active/published products each). | Select one retained route using merchant/SEO evidence; align the three navigation surfaces. Do not delete or redirect either URL during this audit. |
| Medium | Sweatshirts → Style → Sleeveless & Short-Sleeve | /collections/sleeveless-sweatshirts | Opens the narrower Sleeveless Sweatshirts page, showing 5 products. A distinct combined collection exists but is unpublished. | Either label this link Sleeveless, or validate/publish the combined destination before linking to it. |
| Low | T-Shirts → Fit → Women’s | /collections/womens-t-shirts | The same label and destination appear twice. | Remove one duplicate menu item. |
| Low | Home: Shop Popular Blanks | /collections/all | Opens the full catalog, while Popular Styles → View all correctly opens the 99-product Popular collection. | Use /collections/popular if curated popularity is the promise, or rename the hero CTA Shop All Blanks. |
| Review | Home: Shop Fast Shipping | /collections/all | This is a general catalog link, not a shipping-specific assortment. | Keep only if this is the intended storewide promise; shipping speed and eligibility were not audited. |
| Review | Footer social and customer-account links | Access Threads destinations | Facebook and Instagram use Access Threads branding; account links use account.accessthreads.com. | Verify intentional shared/legacy branding. Account/order pages were not opened and no shopper data was inspected. |
| Low | Menu headings and spelling | Various | Tank Tops and Polos put weight options under Fabric Style; Lightweightt, CorssFit/HIIT and PROJET are visible typos. | Use Weight; Lightweight; CrossFit/HIIT; PROJECT. |
| Review | Outerwear navigation | /collections/outerwear-1 | The category menu contains Outerwear and its descendants, but neither desktop nor mobile primary navigation exposes an Outerwear entry. | Add an entry if this assortment is intended for primary navigation, or deliberately keep it outside this menu. |
| Review | Family & Matching Sets page | /pages/family-matching-sets | A separate published page contains only its heading and no shopping links. | The home card currently uses the populated /collections/family-matching-sets collection correctly. Complete or retire the unused page before routing shoppers to it. |
| Review | Mega-menu featured cards: Best Sellers | Family root collections | The featured collection setting is blank and cards labeled Best Sellers link to the family roots. | Use a reviewed best-selling destination/sort if that promise is intended, or use a general family label. |

The unpublished Crew Neck, Ring-Spun and combined sleeve pages are **not** current menu 404s: the menu points to different published pages. Simply changing their links to the intended unpublished pages would create new 404s. Validate and publish the destination first, then switch its menu reference. The four foundation drafts (Kids’ T-Shirts, Shirts, Dress Shirts, Duffel Bags) remain unpublished and are not accidentally linked from the audited menus.

## Empty destinations confirmed in the browser

| Source | Destination | Admin members | Storefront items |
| --- | --- | ---: | ---: |
| at-brands → Alternative Apparel | [Alternative Apparel](https://ashleysthreads.com/collections/alternative-apparel) | 0 | 0 |
| at-brands → Anvil | [Anvil](https://ashleysthreads.com/collections/anvil) | 0 | 0 |
| at-brands → Canvas for Good | [Canvas for Good](https://ashleysthreads.com/collections/canvas-for-good) | 0 | 0 |
| at-brands → HUK | [HUK](https://ashleysthreads.com/collections/huk) | 37 | 0 |
| at-brands → Marmot | [Marmot](https://ashleysthreads.com/collections/marmot) | 51 | 0 |
| at-brands → Nautica | [Nautica](https://ashleysthreads.com/collections/nautica) | 39 | 0 |
| at-brands → Puma Golf | [Puma Golf](https://ashleysthreads.com/collections/puma-golf) | 63 | 0 |
| at-brands → Red House | [Red House](https://ashleysthreads.com/collections/red-house) | 0 | 0 |
| at-brands → Russell Outdoors | [Russell Outdoors](https://ashleysthreads.com/collections/russell-outdoors) | 0 | 0 |
| at-brands → Spyder | [Spyder](https://ashleysthreads.com/collections/spyder) | 74 | 0 |
| at-brands → Volunteer Knitwear | [Volunteer Knitwear](https://ashleysthreads.com/collections/volunteer-knitwear) | 0 | 0 |
| at-brands → Wink | [Wink](https://ashleysthreads.com/collections/wink) | 0 | 0 |
| at-brands → Zero Restriction | [Zero Restriction](https://ashleysthreads.com/collections/zero-restriction) | 6 | 0 |
| at-categories → Outerwear > Category > Sport Jackets | [Sport Jackets](https://ashleysthreads.com/collections/sport-jackets) | 0 | 0 |
| Home brand promotion | [Champion](https://ashleysthreads.com/collections/champion) | 58 | 0 |

Sport Jackets is present in the unused Outerwear category subtree, rather than an exposed primary panel. The other 13 empty menu destinations appear in the exposed Brands A–Z directory. Do not delete products or collections to solve a navigation problem.

## Collection taxonomy follow-up

A child-like menu entry does not always stay within the parent’s current assortment. This table reports active/published members outside the parent set; it does **not** declare every difference a product classification error. Activity-based assortments, intentionally related styles, and garment paths outside a taxonomy branch need explicit merchant rules.

Examples worth addressing before SEO copy:

- Henley T-Shirts contains 11 native Henley Shirts among 15 products; Mock Neck Shirts includes two native Shirts among seven. Decide whether these belong in tee merchandising, the Shirts family, or both with distinct scope.
- V-Neck Sweatshirts includes seven native Sweaters among 13 products. Sweaters & Cardigans is also listed under Sweatshirts; keep sweater/fleece distinctions clear in labels and content.
- The Activewear root excludes all 375 products in its linked Activewear Polos page and all 115 in Activewear Hats, because those products use Polo/Hat garment categories with performance features. Review the merchandising root rule rather than recategorizing every product as generic Activewear.
- The Outerwear root excludes 33 of 37 Youth Outerwear products, principally legitimate children’s outerwear paths, and nine of 11 Track Jackets using the activewear Track Jacket path. These resemble the cross-branch membership gaps repaired for tees/fleece.
- Laptop Bags has four members and Clear Bags two members outside Bags. Review the root’s legitimate bag paths.

| Menu path | Linked collection | Active/published members | Outside current parent |
| --- | --- | ---: | ---: |
| T-Shirts > Collar > Crew | Crewneck Sweatshirts | 161 | 161 |
| T-Shirts > Collar > Henley | Henley T-Shirts | 15 | 11 |
| T-Shirts > Collar > Mock/Turtle | Mock Neck Shirts | 7 | 2 |
| Sweatshirts > Style > Zip-Up | Zip-Up Sweatshirts | 131 | 2 |
| Sweatshirts > Style > Quarter-Zip | Quarter-Zip Sweatshirts | 261 | 5 |
| Sweatshirts > Style > Sweaters & Cardigans | Sweaters & Cardigans | 42 | 42 |
| Sweatshirts > Style > V-Neck | V-Neck Sweatshirts | 13 | 7 |
| Sweatshirts > Fit > Unisex | Unisex Sweatshirts | 603 | 5 |
| Sweatshirts > Fit > Men's | Men's Sweatshirts | 185 | 4 |
| Sweatshirts > Fit > Women's | Women's Sweatshirts | 270 | 6 |
| Sweatshirts > Fit > Oversized | Oversized Sweatshirts | 25 | 1 |
| Sweatshirts > Material > CVC | CVC Sweatshirts | 326 | 2 |
| Sweatshirts > Material > Tri-Blend | Tri-Blend Sweatshirts | 17 | 4 |
| Sweatshirts > Fabric Style > Jersey | Jersey Sweatshirts | 142 | 4 |
| Sweatshirts > Weight > Ultra Heavyweight | Ultra Heavyweight Sweatshirts | 626 | 7 |
| Sweatshirts > Weight > Heavyweight | Heavyweight Sweatshirts | 113 | 2 |
| Hats > Style > Safety | Safety Hats | 14 | 3 |
| Activewear > Category > Polos | Activewear Polos | 375 | 375 |
| Activewear > Category > Hats | Activewear Hats | 115 | 115 |
| Activewear > Category > Jerseys | Activewear Jerseys | 50 | 39 |
| Activewear > Category > Joggers | Joggers | 67 | 7 |
| Activewear > Activity > Running | Running Apparel | 190 | 12 |
| Activewear > Activity > Golf | Golf Apparel | 293 | 293 |
| Activewear > Activity > Basketball | Basketball Apparel | 32 | 31 |
| Activewear > Activity > Baseball/Softball | Baseball/Softball Apparel | 70 | 65 |
| Activewear > Activity > Fishing/Sun | Fishing & Sun Activewear Apparel | 94 | 79 |
| Activewear > Activity > Yoga | Yoga Apparel | 2 | 1 |
| Outerwear > Category > Track Jackets | Track Jackets | 11 | 9 |
| Outerwear > Category > Vests | Vests | 337 | 176 |
| Outerwear > Category > Safety | Safety & High-Visibility Outerwear | 33 | 10 |
| Outerwear > Fit > Unisex | Unisex Outerwear | 306 | 31 |
| Outerwear > Fit > Women's | Women's Outerwear | 154 | 2 |
| Outerwear > Fit > Youth Outerwear | Youth Outerwear | 37 | 33 |
| Bags > Category > Laptop | Laptop Bags | 55 | 4 |
| Bags > Category > Clear Bags | Clear Bags | 18 | 2 |

## Breadcrumb verification now completed

The storefront password no longer blocks the representative visual checks from the foundation batch.

| Product | Rendered ancestor links |
| --- | --- |
| Gildan 5000B | T-Shirts → Short Sleeve → Kids → Unisex |
| Sport-Tek YST350LS | T-Shirts → Long Sleeve → Kids → Unisex |
| Gildan 18500B | Sweatshirts & Hoodies → Hoodies → Kids → Unisex |

The Gildan 18500B Unisex link retains both Kids and Unisex native taxonomy filters on the Hoodies URL. Its storefront count is **71**, matching the exact active/published member count with those attributes; the source product belongs to that filtered set. Hoodies, Crewneck and Youth Polos collection pages show their linked parent, while top-level T-Shirts/Hats pages have no empty breadcrumb row.

## Recommended correction order

1. Correct the Sale CTA, remove/replace the broken About Us link, make the home brand-directory CTA a real link, and remove duplicate Women’s.
2. Review/publish the intended Crew Neck, Ring-Spun and combined sleeve destinations before switching menu references.
3. Hide empty promotional/navigation destinations until assortment is ready; standardize Port & Company’s retained route and clarify Brands/Popular/Best Sellers CTA intent.
4. Resolve root/subcollection scope, expose Outerwear if intended, and fix headings/spelling. Then write SEO content against the agreed assortments.

No corrective write or publication was performed by this audit.

## Evidence files

Private exports are under `.shopify-verify/link-audit/2026-10-14/`: `menus.json`, both modern collection pages, both published collection pages, `publication-review.json`, `home-links.json`, desktop/mobile menu captures, `browser-checks.json`, `pages.json`, `analysis.json`, `progressive-verification.json`, `source-settings.json`, and the read-only live theme pull. The [link inventory](navigation-link-inventory-2026-10-14.md) lists every menu item with its current resolved destination.
