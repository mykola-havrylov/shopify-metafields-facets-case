# Quality results

Acceptance pass of 2026-10-08 on the `dev` branch. Everything below was run against the theme served by `shopify theme dev` (the dev store with this repository's code), not against the published storefront. Real-phone and published-site checks are listed at the end as manual items.

## Automated checks

| Check                   | Result                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run format:check`  | clean                                                                                              |
| `npm run lint`          | clean                                                                                              |
| `npm test`              | 120 tests pass (client, definitions, normalization, seed, images, verify, `facets.js` logic)       |
| Theme Check             | 0 errors, 9 warnings; all 9 come from files inherited from Dawn, none from this repository's files |
| Shopify theme validator | accepts every added or changed theme file                                                          |
| `axe-core` 4.10.2       | 0 violations on the collection, two product pages and a roaster page, at 1280 and 375 px           |

## Lighthouse

Lighthouse 13.5.0, headless Chrome 154, default mobile emulation (slow 4G, 4x CPU slowdown) unless noted, against `http://127.0.0.1:9292` (`shopify theme dev`). Collection: three runs and the median.

| Page                         | Performance | Accessibility | Best practices | SEO | LCP    | CLS | TBT    |
| ---------------------------- | ----------- | ------------- | -------------- | --- | ------ | --- | ------ |
| Collection, mobile (median)  | 66          | 97            | 54             | 92  | 5.4 s  | 0   | 120 ms |
| Collection, desktop (1 run)  | 95          | 97            | 54             | 92  | 1.2 s  | 0   | 0 ms   |
| Product, mobile (1 run)      | 57          | 92 (see note) | 54             | 100 | 10.9 s | 0   | 70 ms  |
| Roaster page, mobile (1 run) | 64          | 97            | 54             | 100 | 6.8 s  | 0   | 290 ms |

How to read these numbers:

- **They are a local-server lab measurement, not a field result.** `theme dev` serves the page through a proxy, unminified, and over plain HTTP, which alone costs the "Uses HTTPS" audit.
- **Most of the page weight is not the theme.** The collection page transfers about 4.9 MB, of which about 3.4 MB are Shopify's own checkout and Shop Pay scripts (`/cdn/shopifycloud/checkout-web/...`) that the store injects. The 16 product images together are 144 KB, because they are served with `srcset` at the right sizes. Under mobile throttling those scripts compete with the page for bandwidth, which is why First Contentful Paint is 4.2 s. The theme cannot remove them.
- **Best practices (54)** is dominated by things outside the theme: plain HTTP on localhost, a third-party cookie, and console messages that come from Shopify (`[shopify-account]` menu, `origin_trials` CORS, a 400 from the storefront GraphQL endpoint, the `shop.app` frame policy) plus a missing `favicon.ico`.
- **Accessibility "color contrast" failures were false positives.** Lighthouse measured elements while Dawn's reveal-on-scroll animation had them almost transparent (`#fdfdfd` on `#ffffff`). With the animation forced to finish, the measured contrast is 8.4:1 or better in the product details and the filter sidebar (lowest value 6.99:1), and axe-core reports no violation.
- **SEO 92 on the collection** is the missing meta description: the `coffee` collection has no description. Adding one in the admin (Products, Collections, Coffee) fixes it and also shows the text above the product grid.
- For numbers that represent visitors, run Lighthouse in Chrome DevTools against the published store in an incognito window after entering the storefront password.

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
- **Footer email field focus.** Dawn draws the focus ring of fields as a solid box shadow on the input. A browser screenshot did not clearly show it, so it needs a quick look in a real browser (Tab to the field).
- **Lighthouse numbers** are from the development server as explained above.

## Manual checks still to do

Done by a person, not by the scripts:

- Product, collection (with the filter drawer) and roaster pages on a real phone: touch targets, drawer, keyboard focus return.
- The storefront password and the public link open in a private window (the dev store stays password protected; the password is shown next to the link in the README).
- Lighthouse on the published store in a private window, and a look at the footer email field focus.
