# Third-party assets

Every external asset used in this repository is recorded here: source URL, license and attribution.
Update this file in the same PR that adds, replaces or removes an external asset.

| Asset                                                                                                                                                         | Source                          | Version / date                                                                         | License                                                                                                                                                 | Attribution                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Dawn theme (all files under `assets/`, `config/`, `layout/`, `locales/`, `sections/`, `snippets/`, `templates/`, plus `.theme-check.yml`, `.prettierrc.json`) | https://github.com/Shopify/dawn | tag `v16.0.0` (commit `bc39a7d2024f1e5c14c42f855bd3552b4913e204`), imported 2026-10-06 | Dawn license, see [`LICENSE.md`](../LICENSE.md). MIT-style grant restricted to themes that integrate or interoperate with Shopify software or services. | Copyright (c) 2021-present Shopify Inc. |

## Notes

- Dawn's `LICENSE.md` is kept verbatim. The repository's own `LICENSE` covers only original additions (see its header).
- Dawn's own icons, SVGs and `assets/sparkle.gif` ship with the theme and fall under the same Dawn license.
- Demo product data is generated in this repository (see `data/`); product images, logos and any other external media must be added to the table above with a URL, license and attribution before they are committed.

## Changes to Dawn files

Imported files were normalized to LF line endings and are otherwise unchanged except for the following. The comparison point is the import commit (`git diff 303a420 HEAD -- assets config layout locales sections snippets templates`).

| File                                                                                       | Change                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `assets/facets.js`                                                                         | submit handler, focus after chip removal, three race fixes ([facets.md](facets.md))                  |
| `snippets/facets.liquid`                                                                   | no-JavaScript Apply, drawer Apply as a submit button, accessible name and tooltip for swatch filters |
| `snippets/swatch-input.liquid`                                                             | optional `label` for the tooltip                                                                     |
| `sections/main-product.liquid`                                                             | `aria-label` on the quantity input                                                                   |
| `templates/collection.json`                                                                | vertical filter layout, 3 columns, square images                                                     |
| `templates/product.json`                                                                   | adds the "Coffee details" section                                                                    |
| `config/settings_schema.json`, `locales/en.default.json`, `locales/en.default.schema.json` | the "Coffee" settings group and the new strings                                                      |

Files added by this repository (not from Dawn): `sections/product-coffee-specs.liquid`, `sections/main-roaster.liquid`, `snippets/coffee-tokens.liquid`, `templates/metaobject/roaster.json`, `assets/section-product-coffee-specs.css`, `assets/section-main-roaster.css`, `assets/component-coffee-facets.css`.
