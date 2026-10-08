# Seeding the catalog and verifying it

Prerequisites, in this order: definitions (`npm run definitions`, see [data-model.md](data-model.md)), then reference entries (`npm run seed:metaobjects`, see [normalization.md](normalization.md)).

## Seeding

```sh
npm run seed:catalog:pilot -- --dry-run   # reads only, shows what the pilot would do
npm run seed:catalog:pilot                # 5 products + the collection, published to the Online Store
npm run verify:pilot                      # checks those 5
# look at the collection on the storefront, then:
npm run seed:catalog                      # all products
npm run verify                            # checks everything
```

The source is `data/source/products.raw.json`, normalized in memory by the same code as `npm run normalize`; an unknown value stops the run before anything is written.

What a run does:

- Finds the **Online Store** publication (needs `read_publications`), the `roaster` / `process_method` entries and the manual collection `coffee`, creating and publishing the collection when it is missing.
- Writes each product with `productSet`, matched by handle: title, vendor (the roaster), product type `Coffee`, description, the `Size` x `Grind` options and variants, the 11 `coffee.*` metafields, collection membership. Metaobject references are resolved to entry ids.
- Publishes each product to the Online Store if it is not already published.

A repeat run does not duplicate anything: existing products are updated in place (`SYNCED`), the collection is reused, and already published products are not published again.

Pilot products are `yirgacheffe-kochere`, `huila-supremo`, `cerrado-mineiro`, `sumatra-mandheling` and `decaf-colombia-sugarcane`: four roast levels, three processes and a decaf.

## Generated content

- Variant prices come from the 250 g price: 500 g x 1.8, 1 kg x 3.2, rounded to cents.
- Variant SKUs are `<handle>-<size>-<grind>` slugs.
- Descriptions are one generated sentence per product (title, roaster, roast, process, origin, tasting notes), HTML-escaped.
- The seed does not upload images; see [product-images.md](product-images.md). Inventory is not tracked, so every variant can be bought.

## What `verify` checks

Against the normalized source, for the products in scope:

| Check                                                                               | Fails with                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Product exists, is `ACTIVE`, published to the Online Store, in `coffee`             | `missing product`, `status is`, `not published`, `not in the "coffee" collection` |
| Product in the store that is not in the catalog (e.g. handle `x-1`)                 | `unexpected product`                                                              |
| All 11 `coffee.*` metafields present and non-empty                                  | `missing metafield`                                                               |
| `origin`, `roast_level`, `variety`, `roaster`, `process` are dictionary values      | `is outside the dictionary`                                                       |
| Decoded values equal the source                                                     | `is ..., expected ...`                                                            |
| Product has an image in status `READY` (see [product-images.md](product-images.md)) | `no product image in status READY`                                                |
| `Size` x `Grind` variants complete with the right prices and SKUs                   | `missing variant`, `costs`, `has SKU`                                             |
| No facet group above 200 unique values                                              | `has N unique values, the limit is 200`                                           |
| Filter queries on the seven filterable metafields return the expected counts        | `filter ...: N products, expected M`                                              |
| Filter queries on the four non-filterable metafields are rejected                   | `the Admin API accepted it, but 2026-10 should reject ...`                        |

Duplicate handles in the source are caught earlier, by normalization. In the store Shopify keeps handles unique by appending a number, which `unexpected product` catches.

The filter checks use the Admin API (`productsCount` with `metafields.coffee.<key>:...`). Metafield search can lag a little behind writes, so a count mismatch is retried up to 4 times, 2 seconds apart, before it counts as a failure. `--pilot` expects only the pilot products to exist, but filter counts are computed over every catalog product present in the store.

`verify` cannot see the storefront (the dev store is password protected and no storefront token is used); that part is checked by hand: the pilot products in their collection on the storefront, and the filters in the browser (see [facets.md](facets.md)).
