// Generated demo catalog: a clean canonical spec (the ground truth) and a deterministic "dirty export" derived from it.
// Everything here is invented for the demo; there is no client data. The export gets synonyms, casing, whitespace,
// decimal formats and units mixed in by index, so the same input always produces the same file.
import { slugify } from './normalize.js';

const SIZE_SETS = [['250 g'], ['250 g', '1 kg'], ['250 g', '500 g', '1 kg']];
const GRIND_SETS = [
  ['Whole bean'],
  ['Whole bean', 'Filter'],
  ['Whole bean', 'Espresso', 'Filter'],
  ['Whole bean', 'Espresso', 'Filter', 'French press'],
];

const BREW_GUIDES = {
  light: [
    'Pour over: 15 g coffee to 250 g water at 94 °C, total time about 3 minutes.',
    'Light roasts reward a slightly finer grind and a longer bloom of 40 seconds.',
  ],
  medium: [
    'Filter: 16 g coffee to 250 g water at 92 °C, total time about 3 minutes 30 seconds.',
    'Works well in a batch brewer; use a medium grind and rinse the paper filter first.',
  ],
  dark: [
    'Espresso: 18 g in, 36 g out in 28 to 30 seconds at 93 °C.',
    'For milk drinks keep the ratio at 1:2 and grind slightly coarser than for a light roast.',
  ],
};

const BREW_GUIDE_BY_ROAST = {
  Light: 'light',
  'Medium-Light': 'light',
  Medium: 'medium',
  'Medium-Dark': 'dark',
  Dark: 'dark',
};

const brewGuideFor = (roast) => BREW_GUIDES[BREW_GUIDE_BY_ROAST[roast]];

// [title, roaster, origin[], process, roast, score, altitude (m), decaf, notes[], varieties[], harvest, price of 250 g]
const ROWS = [
  [
    'Yirgacheffe Kochere',
    'northern-ember',
    ['Ethiopia'],
    'washed',
    'Light',
    87.5,
    1950,
    false,
    ['Jasmine', 'Bergamot', 'Peach'],
    ['Heirloom'],
    2025,
    18.5,
  ],
  [
    'Guji Natural',
    'northern-ember',
    ['Ethiopia'],
    'natural',
    'Light',
    88.25,
    2100,
    false,
    ['Blueberry', 'Strawberry jam', 'Floral'],
    ['Heirloom'],
    2025,
    19.5,
  ],
  [
    'Nyeri Kiambu AA',
    'copper-kettle',
    ['Kenya'],
    'washed',
    'Medium-Light',
    87,
    1750,
    false,
    ['Blackcurrant', 'Grapefruit', 'Brown sugar'],
    ['SL28', 'SL34'],
    2025,
    17.9,
  ],
  [
    'Huila Supremo',
    'copper-kettle',
    ['Colombia'],
    'washed',
    'Medium',
    85.5,
    1650,
    false,
    ['Caramel', 'Red apple', 'Milk chocolate'],
    ['Caturra', 'Castillo'],
    2025,
    14.5,
  ],
  [
    'Huila Pink Bourbon Honey',
    'sunday-bean',
    ['Colombia'],
    'honey',
    'Medium-Light',
    86.75,
    1800,
    false,
    ['Cherry', 'Panela', 'Orange'],
    ['Bourbon'],
    2025,
    18,
  ],
  [
    'Cerrado Mineiro',
    'sunday-bean',
    ['Brazil'],
    'natural',
    'Medium-Dark',
    83.5,
    1100,
    false,
    ['Hazelnut', 'Dark chocolate', 'Toasted almond'],
    ['Bourbon', 'Catuai'],
    2024,
    12.9,
  ],
  [
    'Sul de Minas Honey',
    'harbor-and-hill',
    ['Brazil'],
    'honey',
    'Medium',
    84,
    1050,
    false,
    ['Peanut', 'Caramel', 'Cocoa'],
    ['Catuai'],
    2024,
    13.5,
  ],
  [
    'Antigua Volcan',
    'harbor-and-hill',
    ['Guatemala'],
    'washed',
    'Medium',
    85,
    1600,
    false,
    ['Cocoa', 'Walnut', 'Orange peel'],
    ['Bourbon', 'Caturra', 'Catuai'],
    2025,
    14.9,
  ],
  [
    'Huehuetenango Bella Vista',
    'tiny-drum',
    ['Guatemala'],
    'washed',
    'Medium-Light',
    86,
    1850,
    false,
    ['Plum', 'Panela', 'Lime'],
    ['Caturra', 'Bourbon'],
    2025,
    16.5,
  ],
  [
    'Tarrazu Santa Maria',
    'tiny-drum',
    ['Costa Rica'],
    'honey',
    'Medium',
    86.25,
    1700,
    false,
    ['Honey', 'Apricot', 'Almond'],
    ['Caturra', 'Catuai'],
    2025,
    16,
  ],
  [
    'Rwanda Nyamasheke',
    'alder-roast-lab',
    ['Rwanda'],
    'washed',
    'Medium-Light',
    85.75,
    1800,
    false,
    ['Red grape', 'Hibiscus', 'Cane sugar'],
    ['Bourbon'],
    2025,
    15.9,
  ],
  [
    'Honduras Marcala',
    'alder-roast-lab',
    ['Honduras'],
    'washed',
    'Medium',
    84.5,
    1400,
    false,
    ['Milk chocolate', 'Pear', 'Hazelnut'],
    ['Catuai', 'Caturra'],
    2024,
    13.9,
  ],
  [
    'Peru Cajamarca',
    'northern-ember',
    ['Peru'],
    'washed',
    'Medium',
    84,
    1750,
    false,
    ['Almond', 'Milk chocolate', 'Lemon'],
    ['Typica', 'Bourbon', 'Caturra'],
    2024,
    14.2,
  ],
  [
    'Sumatra Mandheling',
    'copper-kettle',
    ['Indonesia'],
    'wet-hulled',
    'Dark',
    82.5,
    1300,
    false,
    ['Cedar', 'Dark chocolate', 'Tobacco'],
    ['Typica'],
    2024,
    13.2,
  ],
  [
    'Sumatra Lintong',
    'sunday-bean',
    ['Indonesia'],
    'wet-hulled',
    'Medium-Dark',
    83,
    1400,
    false,
    ['Dark chocolate', 'Spice', 'Earth'],
    ['Typica', 'Catuai'],
    2024,
    13.8,
  ],
  [
    'Ethiopia Anaerobic Natural',
    'tiny-drum',
    ['Ethiopia'],
    'anaerobic',
    'Light',
    90,
    2200,
    false,
    ['Tropical fruit', 'Wine', 'Candied lemon'],
    ['Heirloom'],
    2025,
    24,
  ],
  [
    'Colombia Anaerobic Washed',
    'harbor-and-hill',
    ['Colombia'],
    'anaerobic',
    'Medium-Light',
    89.5,
    1900,
    false,
    ['Pineapple', 'Rum', 'Honey'],
    ['Caturra'],
    2025,
    22,
  ],
  [
    'Panama Geisha Reserve',
    'northern-ember',
    ['Panama'],
    'washed',
    'Light',
    91.5,
    1700,
    false,
    ['Jasmine', 'Mandarin', 'Tea rose'],
    ['Geisha'],
    2025,
    38,
  ],
  [
    'Decaf Colombia Sugarcane',
    'copper-kettle',
    ['Colombia'],
    'washed',
    'Medium',
    84,
    1700,
    true,
    ['Brown sugar', 'Cocoa', 'Cherry'],
    ['Caturra', 'Castillo'],
    2025,
    15.5,
  ],
  [
    'Decaf Brazil Water Process',
    'sunday-bean',
    ['Brazil'],
    'natural',
    'Medium-Dark',
    82,
    1000,
    true,
    ['Dark chocolate', 'Nuts', 'Caramel'],
    ['Bourbon'],
    2024,
    14.5,
  ],
  [
    'Decaf Honduras Marcala',
    'alder-roast-lab',
    ['Honduras'],
    'washed',
    'Medium',
    83,
    1450,
    true,
    ['Toffee', 'Apple', 'Cocoa'],
    ['Catuai'],
    2024,
    15,
  ],
  [
    'Espresso Blend No. 1',
    'harbor-and-hill',
    ['Brazil', 'Colombia', 'Guatemala'],
    'washed',
    'Medium-Dark',
    84,
    1400,
    false,
    ['Dark chocolate', 'Caramel', 'Hazelnut'],
    ['Bourbon', 'Caturra', 'Catuai'],
    2025,
    13.5,
  ],
  [
    'Espresso Blend No. 2',
    'tiny-drum',
    ['Brazil', 'Ethiopia'],
    'natural',
    'Medium-Dark',
    85,
    1500,
    false,
    ['Berry', 'Cocoa', 'Brown sugar'],
    ['Bourbon', 'Heirloom'],
    2025,
    14.5,
  ],
  [
    'House Filter Blend',
    'alder-roast-lab',
    ['Colombia', 'Kenya'],
    'washed',
    'Medium-Light',
    85.5,
    1700,
    false,
    ['Red apple', 'Blackcurrant', 'Caramel'],
    ['Caturra', 'SL28'],
    2025,
    14,
  ],
  [
    'Sunrise Breakfast Blend',
    'northern-ember',
    ['Guatemala', 'Costa Rica', 'Honduras'],
    'washed',
    'Medium',
    84,
    1500,
    false,
    ['Milk chocolate', 'Almond', 'Orange'],
    ['Bourbon', 'Caturra'],
    2025,
    12.5,
  ],
  [
    'Honduras Honey Reserve',
    'copper-kettle',
    ['Honduras'],
    'honey',
    'Medium-Light',
    86.5,
    1500,
    false,
    ['Honey', 'Peach', 'Vanilla'],
    ['Pacamara'],
    2025,
    17.5,
  ],
  [
    'Rwanda Natural Lot',
    'sunday-bean',
    ['Rwanda'],
    'natural',
    'Light',
    87.25,
    1900,
    false,
    ['Raspberry', 'Rose', 'Brown sugar'],
    ['Bourbon'],
    2025,
    19,
  ],
  [
    'Kenya Kirinyaga Peaberry',
    'alder-roast-lab',
    ['Kenya'],
    'washed',
    'Light',
    88,
    1800,
    false,
    ['Tomato', 'Blackcurrant', 'Grapefruit'],
    ['SL28', 'SL34'],
    2025,
    20,
  ],
];

/** The ground truth: what normalizing the dirty export must produce. */
export function canonicalCatalog() {
  return ROWS.map(
    (
      [
        title,
        roaster,
        origin,
        process,
        roast_level,
        cupping_score,
        altitude_masl,
        decaf,
        tasting_notes,
        variety,
        harvest_year,
        price,
      ],
      index,
    ) => ({
      handle: slugify(title),
      title,
      brew_guide: brewGuideFor(roast_level),
      roaster,
      origin,
      process,
      roast_level,
      cupping_score,
      altitude_masl,
      decaf,
      tasting_notes,
      variety,
      harvest_year,
      sizes: SIZE_SETS[index % SIZE_SETS.length],
      grinds: title.includes('Espresso') ? GRIND_SETS[3] : GRIND_SETS[index % GRIND_SETS.length],
      price_250g: price.toFixed(2),
    }),
  );
}

// ---- dirtying -------------------------------------------------------------------------------------------------

const CASINGS = [(s) => s, (s) => s.toLowerCase(), (s) => s.toUpperCase(), (s) => s, (s) => s.toLowerCase()];
const SPACINGS = [(s) => s, (s) => ` ${s} `, (s) => s.replace(/ /g, '  '), (s) => `${s}\t`];
const SEPARATORS = [', ', ' / ', '; ', ' & ', ',', ' | '];

/** Deterministic pick: the same (index, salt) always selects the same variant. */
const pick = (options, index, salt) => options[(index + salt) % options.length];

const messy = (text, index, salt) => pick(SPACINGS, index * 3, salt)(pick(CASINGS, index, salt)(text));

const SIZE_FORMATS = {
  '250 g': ['250g', '250 G', '0.25 kg', '250 gr', '8.8 oz'],
  '500 g': ['500g', '0.5kg', '500 GRAMS', '17.6 oz'],
  // No decimal comma here: size cells are comma-separated lists.
  '1 kg': ['1kg', '1000 g', '1 KG', '1.0 kg'],
};

const formatScore = (n, i) =>
  pick([String(n), String(n).replace('.', ','), `${n.toFixed(2)} pts`, `${n}/100`, ` ${n} `], i, 0);

const formatAltitude = (m, i) => {
  const grouped = String(m).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return pick(
    [
      `${m} m`,
      `${m}masl`,
      `${grouped} m`,
      `${grouped.replace(',', '.')} m`,
      `${Math.round(m / 0.3048)} ft`,
      String(m),
      `${m} m.a.s.l.`,
    ],
    i,
    2,
  );
};

const formatPrice = (price, i) => pick([price, `$${price}`, price.replace('.', ','), `${price} USD`], i, 1);

const formatHarvest = (year, i) => pick([String(year), `Crop ${year}`, `${year} harvest`, `${year} crop`], i, 1);

const formatBrewGuide = (paragraphs, i) =>
  pick(
    [
      paragraphs.join('\n\n'),
      paragraphs.join('<br><br>'),
      paragraphs.join('\r\n\r\n'),
      paragraphs.map((p) => `<p>${p}</p>`).join(''),
    ],
    i,
    0,
  );

/** Replaces canonical values with an alias, e.g. a synonym, picked deterministically. */
function aliasOf(canonical, aliases, index, salt) {
  return pick([canonical, ...aliases], index, salt);
}

/**
 * Builds the dirty export from the canonical catalog.
 * @param {ReturnType<typeof canonicalCatalog>} catalog
 * @param {{roasters: object[], processMethods: object[], vocabularies: object}} dictionaries
 */
export function toRawExport(catalog, { roasters, processMethods, vocabularies }) {
  const synonymsOf = (entries, canonical, byHandle = false) =>
    entries.find((entry) => (byHandle ? entry.handle : entry.canonical) === canonical)?.synonyms ?? [];

  return catalog.map((product, i) => {
    const roaster = roasters.find(({ handle }) => handle === product.roaster);
    const process = processMethods.find(({ handle }) => handle === product.process);
    const listOf = (values, dictionary, salt) =>
      values
        .map((value, k) => messy(aliasOf(value, synonymsOf(dictionary, value), i + k, salt), i + k, salt))
        .join(pick(SEPARATORS, i, salt));

    return {
      title: pick(SPACINGS, i, 0)(product.title),
      brand: messy(aliasOf(roaster.title, roaster.synonyms, i, 1), i, 1),
      countries: listOf(product.origin, vocabularies.origins, 2),
      process: messy(aliasOf(process.title, process.synonyms, i, 3), i, 3),
      roast: messy(
        aliasOf(product.roast_level, synonymsOf(vocabularies.roast_levels, product.roast_level), i, 4),
        i,
        4,
      ),
      cupping_score: formatScore(product.cupping_score, i),
      altitude: formatAltitude(product.altitude_masl, i),
      decaf: product.decaf
        ? pick(['yes', 'Y', 'TRUE', '1', 'decaf'], i, 0)
        : pick(['no', 'N', 'false', '0', 'Regular'], i, 0),
      tasting_notes: product.tasting_notes
        .map((note, k) => pick([(s) => s, (s) => s.toLowerCase(), (s) => s.toUpperCase()], i + k, 0)(note))
        .join(
          pick(
            SEPARATORS.filter((s) => !s.includes('&')),
            i,
            1,
          ),
        ),
      variety: listOf(product.variety, vocabularies.varieties, 5),
      harvest: formatHarvest(product.harvest_year, i),
      brew_guide: formatBrewGuide(product.brew_guide, i),
      sizes: product.sizes
        .map((size, k) => pick(SIZE_FORMATS[size], i + k, 0))
        .join(
          pick(
            SEPARATORS.filter((s) => !s.includes('&')),
            i,
            2,
          ),
        ),
      grinds: listOf(product.grinds, vocabularies.grinds, 6),
      price_250g: formatPrice(product.price_250g, i),
    };
  });
}
