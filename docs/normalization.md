# Normalization

The demo catalog is generated, not exported from a real store: `scripts/src/catalog.js` holds a clean canonical catalog of 28 products and derives a deliberately dirty export from it (`data/source/products.raw.json`, committed). `scripts/src/normalize.js` is a pure function that turns that export back into canonical values. A test asserts the round trip is exact, so the dictionaries and parsers are checked against a known ground truth.

```sh
npm run generate-source   # rewrite data/source/products.raw.json (deterministic)
npm run normalize         # normalize it and write data/reports/normalization-report.{md,json}
```

`data/reports/` is git-ignored: the report is regenerated, not versioned. Exit code 1 means a value could not be normalized.

## Policy: unknown values fail

A value that is not in a dictionary, or does not match a documented format, is never skipped, defaulted or guessed. It becomes an issue, `normalizeCatalogOrThrow()` stops the pipeline with a `NormalizationError`, and one run lists every issue. The fix is always to extend a dictionary or correct the source, in a reviewed change.

## Dictionaries (`scripts/dictionaries/`)

Matching ignores case, accents, punctuation and whitespace (`Med-Light` = `med light`). A synonym that maps to two different canonical values fails when the dictionaries are compiled.

| File                   | Content                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `roasters.json`        | 6 fictional roasters: handle, title, country, founded year, description, synonyms. Also the seed source. |
| `process-methods.json` | 5 processing methods with swatch `color`. Also the seed source.                                          |
| `vocabularies.json`    | Origins, roast levels, varieties, grinds (with synonyms) and the canonical sizes.                        |

## Field rules

| Field           | Accepted raw forms                                                             | Canonical                             |
| --------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| `roaster`       | title, handle or synonym                                                       | roaster handle                        |
| `origin`        | list separated by `, ; / & + \|` or `and`; synonyms and misspellings           | canonical country names, deduplicated |
| `process`       | title, handle or synonym                                                       | process method handle                 |
| `roast_level`   | synonyms such as `City+`, `Full City`, `Nordic`                                | one of the five roast levels          |
| `cupping_score` | `86.5`, `86,5`, `86.50 pts`, `86.5/100`                                        | number, 0-100, at most 2 decimals     |
| `altitude_masl` | `1950`, `1,950 m`, `1.950 masl`, `1 950 m.a.s.l.`, `6398 ft`                   | integer metres, 0-3000                |
| `decaf`         | `yes/y/true/1/decaf`, `no/n/false/0/regular`                                   | boolean                               |
| `tasting_notes` | list separated by `, ; / \|`                                                   | sentence case, deduplicated, 1-10     |
| `variety`       | list, dictionary with synonyms (`SL-28`, `Gesha`)                              | canonical variety, 1-10               |
| `harvest_year`  | `2025`, `Crop 2025`, `2025 harvest`                                            | integer, 2000-2100                    |
| `brew_guide`    | paragraphs split by blank lines, `<br>` or `<p>`; any other markup rejected    | array of paragraphs                   |
| `sizes`         | `250g`, `0.25 kg`, `8.8 oz`, `1000 g`; snapped to a canonical size within 1.5% | `250 g`, `500 g`, `1 kg`              |
| `grinds`        | list, dictionary with synonyms                                                 | canonical grind                       |
| `price_250g`    | `18.5`, `$18.50`, `18,50`, `18.50 USD`                                         | string with 2 decimals                |

Two rules worth knowing:

- A bare altitude with no unit is metres. The 0-3000 check catches the usual mistake (feet written without a unit).
- Thousands separators are read only as exactly three digits (`1.950` is 1950), so `1.5 m` is rejected instead of being misread.

Ranges are not guessed: a value outside a metafield's validation (for example altitude above 3000 m) fails here, before it could fail in the Admin API.

## Report

`data/reports/normalization-report.md` shows, for each field, distinct raw values, canonical values, how many were merged and which were rejected, then every canonical value with the raw spellings that map to it. With the shipped data: 341 distinct raw values become 162 canonical ones, 179 merged, 0 rejected.

## Seeding the reference entries

```sh
npm run seed:metaobjects:dry-run   # reads the store, prints what would change
npm run seed:metaobjects           # creates or updates roaster and process_method entries
```

- Entries are matched by `type` + handle through `metaobjectUpsert`, so a repeat run never duplicates; unchanged entries are not written.
- `roaster` entries are set to `ACTIVE` (the definition is publishable; draft entries are invisible on the storefront). `process_method` has no publishable capability, so its entries have no status and are always visible.
- Logos: none are shipped. A roaster `logo` needs `file`, `kind` (`own`, `third-party` or `ai`), `source`, `license` and `date`, and has to be recorded in `docs/third-party-assets.md` or `docs/ai-assets.md`. The seed refuses incomplete provenance. Uploading logo files is not implemented yet.
