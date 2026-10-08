# Theme presentation

The theme is [Dawn](https://github.com/Shopify/dawn) `v16.0.0` (see [third-party-assets.md](third-party-assets.md)). Everything below is what this repository adds on top of it. The Dawn files that were changed are listed in [third-party-assets.md](third-party-assets.md#changes-to-dawn-files).

## What was added

| File                                                                         | Purpose                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sections/product-coffee-specs.liquid`                                       | "Coffee details" on the product page: the `coffee.*` metafields as a spec list              |
| `sections/main-roaster.liquid`, `templates/metaobject/roaster.json`          | The roaster page, rendered by Shopify for each `roaster` entry (`/pages/roasters/<handle>`) |
| `snippets/coffee-tokens.liquid`                                              | Design tokens as CSS custom properties, fed by theme settings                               |
| `assets/section-product-coffee-specs.css`, `assets/section-main-roaster.css` | Component styles                                                                            |
| `config/settings_schema.json` (group "Coffee")                               | Roast scale color and tasting-note corner radius                                            |

## Product page

The section sits right after the main product section in `templates/product.json` and reads `product.metafields.coffee`:

- A spec list (`<dl>`): roaster (linked to its page), origin, process (color swatch + name), roast level (text, 5-step scale and a screen-reader "2 of 5"), cupping score, altitude, decaf, variety, harvest year, tasting notes (chips).
- The brew guide (rich text) under its own heading, with a setting to hide it.
- **No empty blocks:** every row is rendered only when its metafield has a value, and the whole section renders nothing when the product has none. `decaf` is compared with `nil`, because `false` counts as blank in Liquid and a decaf "No" would disappear.

## Roaster page

`templates/metaobject/<type>.json` is the template Shopify uses for metaobject pages of that type. The section shows the name, country, founding year, description and, when a logo exists, the logo. Below it, the coffees of this roaster: products of a collection (default handle `coffee`, configurable) whose `coffee.roaster` reference points at this entry, rendered with Dawn's `card-product`. The block is hidden when there are none. The grid reads `collection.products` without pagination, so it sees a single page of at most 50 products ([`paginate`](https://shopify.dev/docs/api/liquid/objects/collection) caps a page at 50). Under it a link, "All coffees from <roaster>", opens the source collection filtered by this roaster (`?filter.p.m.coffee.roaster=gid://shopify/Metaobject/<id>`, URL-encoded); that filtered collection is the complete list. The id comes from [`metaobject.system.id`](https://shopify.dev/docs/api/liquid/objects/metaobject_system), which is the number in the metaobject's global id.

## Design tokens

Tokens are CSS custom properties in `snippets/coffee-tokens.liquid`, set from `settings_schema.json`:

| Token                  | Setting                    | Default   |
| ---------------------- | -------------------------- | --------- |
| `--coffee-roast-fill`  | `coffee_roast_scale_color` | `#6b4226` |
| `--coffee-chip-radius` | `coffee_chip_radius`       | `20px`    |

`--coffee-swatch-size` is a plain constant in the component stylesheet. Everything else reuses Dawn's own variables (`--color-foreground`, color schemes, spacing), so the components follow the store's color scheme and typography.

## Images

- Product images are **AI-generated** (a bag of coffee on a grey background), not photographs; see [product-images.md](product-images.md) and [ai-assets.md](ai-assets.md). Their alt text says so. Roasters have **no logos** in this demo; Dawn's placeholders cover any product without an image.
- The roaster logo is rendered with `image_url` + `image_tag` (`srcset` from `widths`, `sizes`, dimensions and `loading="lazy"`), so a logo works responsively as soon as one exists and is recorded in [third-party-assets.md](third-party-assets.md) or [ai-assets.md](ai-assets.md).
- No hardcoded `cdn.shopify.com` URLs were added.

## Strings

All visible text is in `locales/en.default.json` (`coffee.*`) and the editor labels in `locales/en.default.schema.json`. Option values from the data (for example roast level names) come from the metafields themselves and are not translated.

## Accessibility

- Semantic markup: `dl/dt/dd` for specs and facts, `ul` for chips and the product grid, one `h1` on the roaster page, headings in order.
- The swatch and the roast scale are decorative (`aria-hidden`); the process name and the roast level are always present as text, and the scale position is announced in visually hidden text.
- Color is never the only carrier of meaning, and links use Dawn's focus styles. The roast scale color setting notes that it needs to stay contrasting against the section background (WCAG 1.4.11 non-text contrast).
- Layout collapses to one column below 750px.

## Checks

- Theme Check: 0 errors; no new warnings from these files.
- Browser QA against `shopify theme dev` (3 product pages, 2 roaster pages; 375, 768 and 1280 px): no horizontal overflow, spec rows stack below 750px, one `h1` with ordered headings, decorative swatch and roast bar are `aria-hidden` with the text equivalents present, the roaster link and card links take keyboard focus with a visible indicator, switching variants leaves the section intact, no console errors from the theme code.
