# Faceted filtering

Filtering uses Shopify's native storefront filtering (Search & Discovery) rendered by Dawn's facets code. This repository adds only what Dawn lacks: a working no-JavaScript path, focus handling and an accessible name for swatch filters.

## Setup in the Search & Discovery app (manual)

The seven filters are enabled by hand; the theme only renders what the app returns.

1. Open **Apps → Search & Discovery → Filters → Add filter → Product metafield**.
2. Add, in this order: `coffee.roaster`, `coffee.origin`, `coffee.process`, `coffee.roast_level`, `coffee.cupping_score`, `coffee.altitude_masl`, `coffee.decaf`. A metafield only appears in the list when its definition has storefront access.
3. For `coffee.process` set the display type to **Visual**: Shopify then uses the `color` field of the `process_method` entry as the swatch and its `title` as the label.
4. Leave Availability and Price if they are wanted.

## URLs

Every state is a URL: `/collections/coffee?filter.p.m.coffee.roast_level=Light&filter.p.m.coffee.decaf=false`. Per the [storefront filtering docs](https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering), filters are combined with AND and several values of one filter with OR, either as repeated parameters or comma separated. A metaobject reference filter (`coffee.roaster`, `coffee.process`) takes the entry's global id (`gid://shopify/Metaobject/...`) as its value. A shared URL reproduces the state, and the browser Back button restores the previous one (`popstate` in `facets.js`).

Observed on the live theme (browser QA, 2026-10-07):

| Filter                   | Parameter and value                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Roaster, Process         | `filter.p.m.coffee.roaster=gid://shopify/Metaobject/<id>`, `filter.p.m.coffee.process=gid://shopify/Metaobject/<id>`   |
| Origin, Roast level      | plain strings: `filter.p.m.coffee.origin=Ethiopia`, `filter.p.m.coffee.roast_level=Medium-Light`                       |
| Cupping score, Altitude  | one parameter per value, **no ranges**: `filter.p.m.coffee.cupping_score=84.0`, `filter.p.m.coffee.altitude_masl=1700` |
| Decaf                    | `filter.p.m.coffee.decaf=1` (yes) and `=0` (no)                                                                        |
| Price, Availability      | `filter.v.price.gte=20`, `filter.v.availability=1`                                                                     |
| Two values of one filter | the key is repeated: `...roaster=<gid A>&...roaster=<gid B>` (OR)                                                      |

Numeric metafields are listed value by value (Cupping score has 21 values) until they are merged into labelled groups with **Create group** on the filter page. The demo store uses groups, which is how range-like facets are built without a slider:

- Cupping score: `82–83.5`, `84–85`, `85.5–86.5`, `86.75–88.25`, `89 and above`.
- Altitude: `Up to 1,200 m`, `1,300–1,500 m`, `1,600–1,750 m`, `1,800–1,950 m`, `2,100 m and above`.

A grouped value is **not** a range in the URL: the parameter carries the group's own id, `filter.p.m.coffee.cupping_score=gid://shopify/FilterSettingGroup/<id>`, and the chip shows the group label (`Cupping score: 89 and above`). The ids belong to this store and to the current groups: if the groups are recreated in the app the ids change, so saved or hard-coded filter URLs stop working. Every group contains at least two products and together they cover all 28; several groups of one filter combine with OR, as other values do.

## Layout

`templates/collection.json` uses the **vertical** filter layout: a sidebar from 750 px up and a drawer on phones, with active filter chips, a "Remove all" link, sorting and a live result count. The grid is 3 columns on desktop with square images.

## Without JavaScript

The filter panel is a plain GET form, so it works without scripts:

- the sidebar has an **Apply** button and a "Remove all" link inside `<noscript>`, so JavaScript users never see them;
- the phone drawer opens with the native `<details>` element and its **Apply** button is a real submit button;
- sorting is part of the same form, and the active chips and "Remove all" are ordinary links.

With JavaScript the same forms update the grid in place through the Section Rendering API (`?section_id=...`) and `history.pushState`. Dawn's `facets.js` does that; this repository adds a `submit` handler so Apply and Enter in a price field apply the filters without a full reload.

## Keyboard and screen readers

- The result count is a `role="status"` live region, so every update is announced.
- After a checkbox is toggled focus returns to it (Dawn). After a chip or "Remove all" is activated, the element disappears, so focus moves to the result count (added here); it is the live region as well.
- Filter groups are `<details>` disclosures with `<fieldset>` and `<legend>`; the drawer is closed with Escape.
- **Swatch filters:** Dawn rendered the swatch checkbox with a label that contained only a decorative colored circle, so it had no accessible name. The label now includes the value name as visually hidden text; the visible text next to the swatch is unchanged.

## What changed in Dawn files

| File                                 | Change                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `snippets/facets.liquid`             | `<noscript>` Apply and clear links; mobile Apply is a submit button; accessible name for swatches; loads the stylesheet below |
| `assets/facets.js`                   | `submit` handler; focus moves to the result count after a chip is removed; three fixes for races in Dawn's code (below)       |
| `assets/component-coffee-facets.css` | Layout of the no-JS actions (new file)                                                                                        |
| `templates/collection.json`          | Vertical layout, 3 columns, square images                                                                                     |

Facet limits to keep in mind: 25 filters per store, 200 unique values per filter group, 1,000 filter groups, and no filters on collections of more than 5,000 products. The demo catalog (28 products, at most 21 values in a group) is far below all of them.

## Races fixed in `facets.js`

Three problems found by browser QA, all present in the original Dawn file:

1. The debounced handler used `event.target.closest('form')` after a re-render had detached the target, which threw a `TypeError`. The form is now remembered when the input happens.
2. A response that arrived after the user had changed another filter replaced the sidebar and wiped that change, so the second tick was silently lost (pauses of about 0.8 to 1.4 s). Every input now bumps a counter; a response that a newer input has overtaken is not rendered, and the newer change sends the up to date request.
3. After a re-render Dawn moved focus back to the toggled checkbox even when the user had moved on or had closed the drawer with Apply, which dropped focus on the page. Focus is now only restored when the re-render lost it.

`tests/facets.test.js` runs the file against a stand-in for the DOM and guards the counter, the stale-response rule and the focus rule.

## Verification

Browser QA against `shopify theme dev` (Playwright, desktop 1280 px and phone 375 px):

- single and combined filters (OR within a filter, AND across filters), numeric and swatch filters, price and availability;
- every change updates the URL and the grid without a reload; a filtered URL opened fresh reproduces checkboxes, chips and count; Back and Forward restore the state; pagination keeps the parameters;
- chips and "Remove all" move focus to the result count; toggling a checkbox with the keyboard keeps focus on it; Enter in the price field applies without a reload;
- the phone drawer applies with the button, closes with Escape and returns focus to its opener;
- with JavaScript disabled in the browser context, ticking boxes and pressing **Apply** loads the filtered page from the server, and "Remove all" resets it;
- 138 filter checkboxes, none without an accessible name; no console errors from the theme.

## Known limitations

- In the phone drawer, opening a filter submenu leaves keyboard focus on the page and the first Escape inside a submenu only moves focus to its back button (a second Escape closes it). This is Dawn's drawer behavior and is left as is.
- In the phone drawer, pressing the **submenu's own** Apply button applies the filter correctly but leaves focus on the page; the main drawer Apply returns focus to the "Filter and sort" button.
- A hand-written `filter.p.m.coffee.decaf=true` filters correctly but does not tick the Decaf box, because the control values are `1` and `0`. Links generated by the theme always use those.
- The no-JS Apply button of the phone drawer is confirmed in the markup (`type="submit"`) but was not exercised in a no-JS browser run.
