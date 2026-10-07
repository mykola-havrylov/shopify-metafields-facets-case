# Data model

Source of truth for the schema is [`scripts/definitions/`](../scripts/definitions/). This document explains it; the unit tests in `tests/definitions.test.js` keep the two in sync (11 metafields, exactly 7 filterable, storefront access everywhere).

Admin API version: `2026-10`. Namespace for product metafields: `coffee` (merchant-owned, so the theme and Search & Discovery can read it).

## Metaobjects

### `roaster`

Capabilities: `publishable`, `renderable` (SEO title = `title`, description = `description`) and `onlineStore` (pages at `/pages/roasters/<handle>`). Storefront access: `PUBLIC_READ`. Naming field: `title`.

| Field          | Type                     | Required | Validation         |
| -------------- | ------------------------ | -------- | ------------------ |
| `title`        | `single_line_text_field` | yes      | -                  |
| `country`      | `single_line_text_field` | no       | -                  |
| `founded_year` | `number_integer`         | no       | 1800-2100          |
| `description`  | `multi_line_text_field`  | no       | -                  |
| `logo`         | `file_reference`         | no       | file type: `Image` |

Entries must be `ACTIVE` to be visible on the storefront (`publishable` defaults new entries to `DRAFT`); the seed script (T-06) sets this.

### `process_method`

Storefront access: `PUBLIC_READ`. Naming field: `title`. No capabilities.

| Field         | Type                     | Required | Validation |
| ------------- | ------------------------ | -------- | ---------- |
| `title`       | `single_line_text_field` | yes      | -          |
| `color`       | `color`                  | yes      | -          |
| `description` | `multi_line_text_field`  | no       | -          |

`color` is the **only** color field, and `title` is the naming field: together they are what Search & Discovery needs to render a visual swatch filter for `coffee.process`.

## Product metafields (`coffee.*`)

All eleven definitions have storefront access `PUBLIC_READ`. "Filterable" means: eligible and intended as a Search & Discovery facet **and** `adminFilterable` enabled (needed to query products by this metafield in the Admin API; on `2026-10` filtering by a metafield without it returns an error).

| Key             | Type                          | Filterable | Validation                                              | Purpose                                    |
| --------------- | ----------------------------- | ---------- | ------------------------------------------------------- | ------------------------------------------ |
| `roaster`       | `metaobject_reference`        | yes        | definition = `roaster`                                  | Roaster relation, roaster page             |
| `origin`        | `list.single_line_text_field` | yes        | list min 1                                              | Country of origin; blends can list several |
| `process`       | `metaobject_reference`        | yes        | definition = `process_method`                           | Processing method, visual swatch facet     |
| `roast_level`   | `single_line_text_field`      | yes        | choices: Light, Medium-Light, Medium, Medium-Dark, Dark | Roast scale on the product page and facet  |
| `cupping_score` | `number_decimal`              | yes        | 0-100, max 2 decimal places                             | SCA score, range facet                     |
| `altitude_masl` | `number_integer`              | yes        | 0-3000                                                  | Altitude in meters, range facet            |
| `decaf`         | `boolean`                     | yes        | -                                                       | Boolean facet                              |
| `tasting_notes` | `list.single_line_text_field` | no         | list 1-10                                               | Chips on the product page                  |
| `variety`       | `list.single_line_text_field` | no         | list 1-10                                               | Product page content                       |
| `harvest_year`  | `number_integer`              | no         | 2000-2100                                               | Product page only                          |
| `brew_guide`    | `rich_text_field`             | no         | -                                                       | Product page only                          |

Why four are not facets: `tasting_notes` and `variety` have high-cardinality vocabularies (a facet group is capped at 200 unique values and shows at most 100 to customers), `harvest_year` is not a buying criterion in this catalog, and `rich_text_field` cannot be filtered at all.

`Size` and `Grind` are product options (variants `Size x Grind`), not metafields. A variant-only attribute would have to be a variant metafield.

## Facet eligibility

Checked against [Search & Discovery filters](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters):

- Supported metafield types: single line text (and list), decimal, integer, true or false, metaobject reference (and list). The seven filterable metafields use only these types.
- Metafield definitions and metaobject definitions both need storefront access: all of them have it.
- Visual filter: the metaobject needs a single color (or image) field plus a single-value naming field, and the product metafield must be a metaobject reference to it. `process_method` and `coffee.process` satisfy this.
- Limits: 25 filters per store, 200 unique values per filter group, 1,000 filter groups, and filters are not shown on collections with more than 5,000 products. The 24-30 product catalog stays far below all of them.
- The seven filters are enabled and ordered by hand in the Search & Discovery app (task T-10).

## Definitions are append-only

A metafield definition's `type` cannot change after creation. If a type has to change: delete the definition, recreate it, re-seed the data. That is why the schema is accepted by hand (T-05) before any product data is written.

## Creating the definitions

```sh
npm run definitions:dry-run   # reads the store, prints what would be created, writes nothing
npm run definitions           # creates what is missing
```

- Metaobject definitions are created first, because metafield validations need their ids.
- Re-running is safe: an existing definition is looked up (`metaobjectDefinitionByType`, `metafieldDefinitions`) and compared to the JSON, never recreated.
- Differences (drift) are printed and the script exits with code 1. Existing definitions are never modified automatically.
- Output status per definition: `CREATED`, `WOULD-CREATE` (dry run), `EXISTS`, `DRIFT`.
