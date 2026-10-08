# Quality results

Acceptance pass of 2026-10-08 on the `dev` branch. The browser checks below were run against the theme served by `shopify theme dev` (the dev store with this repository's code).

## Automated checks

| Check                  | Result                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run format:check` | clean                                                                                              |
| `npm run lint`         | clean                                                                                              |
| `npm test`             | 130 tests pass (client, definitions, normalization, seed, images, verify, `facets.js` logic)       |
| Theme Check            | 0 errors, 9 warnings; all 9 come from files inherited from Dawn, none from this repository's files |
| `axe-core` 4.10.2      | 0 violations on the collection, two product pages and a roaster page, at 1280 and 375 px           |

## Lighthouse

Measured on 2026-10-08 on the published store (the theme connected to `main`), not on the local server. Lighthouse 13.4.1 in Chrome DevTools, mobile emulation with simulated throttling (150 ms round trip, 1.6 Mbps, 4x CPU slowdown), all four categories, three runs per page. The table shows the median; the range of the three Performance scores is in brackets.

| Page                                   | Performance   | Accessibility | Best Practices | SEO | FCP   | LCP   | TBT   | CLS | Speed Index |
| -------------------------------------- | ------------- | ------------- | -------------- | --- | ----- | ----- | ----- | --- | ----------- |
| Collection `/collections/coffee`       | 97 (97 to 98) | 97            | 100            | 100 | 1.9 s | 2.1 s | 78 ms | 0   | 2.4 s       |
| Product `/products/rwanda-natural-lot` | 93 (88 to 96) | 97            | 100            | 100 | 2.3 s | 2.8 s | 26 ms | 0   | 2.8 s       |
| Roaster `/pages/roasters/sunday-bean`  | 89 (88 to 97) | 97            | 100            | 100 | 1.9 s | 3.5 s | 51 ms | 0   | 2.2 s       |

What the numbers do and do not say:

- **Accessibility 97 comes from one audit, color contrast.** Axe reports `#fdfdfd` text on white (1.01:1) for 31 elements on the collection, 28 on the product page and 3 on the roaster page. On the collection and roaster pages every one of them is below the first screen (product card titles and prices, the newsletter block in the footer), and that is where Dawn's reveal-on-scroll animation starts elements almost transparent. The contrast measured with the animation finished is in the section below and passes. The most likely explanation is a snapshot taken mid-fade-in, but the run was not repeated with the animation turned off, so this is not confirmed.
- **The roaster page LCP varies from 2.3 to 3.7 s.** The largest element there is the image of the first product card, which is lazy-loaded and has no `fetchpriority`, so its download starts 180 to 300 ms after it is discovered. On the product page the main image is eager but also has no `fetchpriority="high"`. Neither was changed after these runs.
- **Page weight is mostly Shopify's own code.** The 1.6 to 1.8 MB and 340 to 360 requests per page are dominated by scripts the platform injects (checkout preloads, web pixels, shop-js, analytics), which a theme cannot remove. Product images are 25 to 145 KB per page, served as WebP through `image_url`. The long tasks Lighthouse lists all belong to those scripts.
- Best Practices and SEO are 100 on all three pages; CLS is 0.

## Contrast

Text contrast was measured on the rendered colors with Dawn's reveal-on-scroll animation finished: 8.4:1 or better in the product details and the roaster page, and 6.99:1 or better in the filter sidebar (the lowest value is the result count). The focus ring is a 2 px outline of the text color at 50% opacity plus a white halo, about 3.5:1 against white, which meets the 3:1 requirement for interface components.

## What the review found and fixed

| Finding                                                                             | Where                                                    | Fix                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| The product quantity field had no accessible name (its label text is `aria-hidden`) | `sections/main-product.liquid`                           | `aria-label` on the input                          |
| Swatch filter checkboxes had no accessible name and a raw id as tooltip             | `snippets/facets.liquid`, `snippets/swatch-input.liquid` | visually hidden label, `label` for the tooltip     |
| Filters did not work without JavaScript (no submit control)                         | `snippets/facets.liquid`, `assets/facets.js`             | `noscript` Apply, submit button in the drawer      |
| A second filter tick could be lost, and focus fell to the page after Apply          | `assets/facets.js`                                       | see [facets.md](facets.md#races-fixed-in-facetsjs) |

## Keyboard, no-JavaScript and responsive review

Browser run on the collection, two product pages and a roaster page (1280, 768, 375 px):

- Skip link is the first stop and works; every interactive element is reachable in a logical order with a visible focus indicator; no keyboard traps.
- Filters: groups open with Enter or Space, a checkbox toggled with Space keeps focus after the update, chips and "Remove all" move focus to the result count.
- Phone drawer: focus stays inside while it is open, Escape closes it and returns focus to the opener.
- Without JavaScript: product and roaster pages render completely, filters apply with the Apply button and reset with "Remove all".
- 200% zoom equivalent (640 px viewport) reflows without horizontal scroll; `prefers-reduced-motion` leaves nothing hidden.

## Known limitations

- **Header at 200% text size on a 375 px screen.** The long shop name wraps one letter per line and the cart icon moves off-screen, so horizontal scrolling appears. This is Dawn's header layout combined with the demo shop's long name; a shorter store name avoids it.
- **Phone filter drawer** has no `role="dialog"` or accessible name, and focus stays on its opener when it opens. It is Dawn's drawer pattern; Escape and focus return work.
- **Numeric filters** (cupping score, altitude) list discrete values or merged groups; there is no range slider.
