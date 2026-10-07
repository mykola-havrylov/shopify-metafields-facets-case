// Pure normalization of a dirty product export into canonical values.
// No I/O: dictionaries are passed in. Unknown values are never skipped or guessed; they become issues,
// and normalizeCatalogOrThrow() stops the pipeline when there is any.

/** Lookup key: case, accents, punctuation and whitespace are irrelevant ("Med-Light" == "med light"). */
export function lookupKey(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const slugify = (value) => lookupKey(value).replace(/ /g, '-');

export class NormalizationError extends Error {
  constructor(issues) {
    const lines = issues.map(
      ({ product, field, value, reason }) => `${product} / ${field}: ${reason} (${JSON.stringify(value)})`,
    );
    super(`Normalization failed with ${issues.length} issue(s):\n${lines.join('\n')}`);
    this.name = 'NormalizationError';
    this.issues = issues;
  }
}

/** Thrown inside field normalizers; collected into issues by normalizeCatalog. */
class FieldError extends Error {}

const clean = (value) => String(value).replace(/\s+/g, ' ').trim();

function buildLookup(entries, label) {
  const lookup = new Map();
  for (const { canonical, synonyms = [] } of entries) {
    for (const alias of [canonical, ...synonyms]) {
      const key = lookupKey(alias);
      if (lookup.has(key) && lookup.get(key) !== canonical) {
        throw new Error(`Dictionary "${label}": "${alias}" maps to both "${lookup.get(key)}" and "${canonical}".`);
      }
      lookup.set(key, canonical);
    }
  }
  return lookup;
}

/**
 * Turns the dictionary JSON files into lookup tables. Throws on ambiguous synonyms.
 * Roasters and process methods are matched to their handle; everything else to its canonical label.
 */
export function compileDictionaries({ roasters, processMethods, vocabularies }) {
  const byHandle = (entries) =>
    entries.map(({ handle, title, synonyms }) => ({ canonical: handle, synonyms: [title, ...(synonyms ?? [])] }));
  return {
    roaster: buildLookup(byHandle(roasters), 'roasters'),
    process: buildLookup(byHandle(processMethods), 'process methods'),
    origin: buildLookup(vocabularies.origins, 'origins'),
    roast_level: buildLookup(vocabularies.roast_levels, 'roast levels'),
    variety: buildLookup(vocabularies.varieties, 'varieties'),
    grind: buildLookup(vocabularies.grinds, 'grinds'),
    sizes: vocabularies.sizes,
  };
}

function lookup(table, raw, what) {
  const found = table.get(lookupKey(raw));
  if (found === undefined) throw new FieldError(`unknown ${what}`);
  return found;
}

// Multi-value cells use any of these separators.
const splitMulti = (raw) =>
  String(raw)
    .split(/[,;/|&+\n]|\band\b/i)
    .map(clean)
    .filter(Boolean);

const parseNumber = (text) => Number(text.replace(',', '.'));

function parseCuppingScore(raw) {
  const match = /^(\d{1,3}(?:[.,]\d+)?)\s*(?:pts?|points?|\/\s*100)?$/i.exec(clean(raw));
  if (!match) throw new FieldError('unrecognized cupping score format');
  const score = parseNumber(match[1]);
  if (score < 0 || score > 100) throw new FieldError('cupping score outside 0-100');
  if (Math.round(score * 100) / 100 !== score) throw new FieldError('cupping score has more than 2 decimal places');
  return score;
}

const FEET_TO_METERS = 0.3048;

// "1900", "1,900 m", "1.900 masl", "1 900m", "6234 ft". A bare number is metres; the 0-3000 check catches mistakes.
function parseAltitude(raw) {
  const match = /^(\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(m|masl|m\.a\.s\.l\.?|meters?|metres?|ft|feet)?$/i.exec(clean(raw));
  if (!match) throw new FieldError('unrecognized altitude format');
  const amount = Number(match[1].replace(/[.,\s]/g, ''));
  const unit = (match[2] ?? 'm').toLowerCase();
  const meters = unit === 'ft' || unit === 'feet' ? Math.round(amount * FEET_TO_METERS) : amount;
  if (meters > 3000) throw new FieldError('altitude outside 0-3000 m');
  return meters;
}

const TRUE_VALUES = new Set(['yes', 'y', 'true', '1', 'decaf', 'decaffeinated']);
const FALSE_VALUES = new Set(['no', 'n', 'false', '0', 'regular', 'caffeinated']);

function parseDecaf(raw) {
  const key = lookupKey(raw);
  if (TRUE_VALUES.has(key)) return true;
  if (FALSE_VALUES.has(key)) return false;
  throw new FieldError('unrecognized decaf value');
}

function parseHarvestYear(raw) {
  const match = /^(?:crop\s*)?(\d{4})(?:\s*(?:crop|harvest))?$/i.exec(clean(raw));
  if (!match) throw new FieldError('unrecognized harvest year format');
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) throw new FieldError('harvest year outside 2000-2100');
  return year;
}

const sentenceCase = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

function parsePrice(raw) {
  const match = /^(?:\$|usd)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:\$|usd)?$/i.exec(clean(raw));
  if (!match) throw new FieldError('unrecognized price format');
  const price = parseNumber(match[1]);
  if (price <= 0) throw new FieldError('price must be positive');
  return price.toFixed(2);
}

const SIZE_TOLERANCE = 0.015;
const OUNCE_IN_GRAMS = 28.3495;

// Converts to grams and snaps to a canonical size; anything not within 1.5% of one is rejected.
function parseSize(raw, sizes) {
  const match = /^(\d+(?:[.,]\d+)?)\s*(g|gr|gram|grams|kg|oz)$/i.exec(clean(raw));
  if (!match) throw new FieldError('unrecognized size format');
  const factor = { g: 1, gr: 1, gram: 1, grams: 1, kg: 1000, oz: OUNCE_IN_GRAMS }[match[2].toLowerCase()];
  const grams = parseNumber(match[1]) * factor;
  const size = sizes.find((candidate) => Math.abs(grams - candidate.grams) / candidate.grams <= SIZE_TOLERANCE);
  if (!size) throw new FieldError(`size is not one of ${sizes.map(({ canonical }) => canonical).join(', ')}`);
  return size.canonical;
}

// Brew guide cells hold paragraphs separated by blank lines, <br> or <p> tags. Any other markup is rejected.
function parseBrewGuide(raw) {
  const text = String(raw).replace(/<\/?p>|<br\s*\/?>/gi, '\n\n');
  if (/[<>]/.test(text)) throw new FieldError('unsupported markup');
  const paragraphs = text
    .split(/(?:\r?\n){2,}/)
    .map(clean)
    .filter(Boolean);
  if (paragraphs.length === 0) throw new FieldError('empty brew guide');
  return paragraphs;
}

/**
 * Field table. `rawKey` is the column in the export; `kind` says whether a cell is one value or a list;
 * `item` converts one raw value (or one list item). The report builder uses the same table.
 */
export const FIELDS = {
  roaster: { rawKey: 'brand', kind: 'scalar', item: (raw, ctx) => lookup(ctx.roaster, raw, 'roaster') },
  origin: {
    rawKey: 'countries',
    kind: 'list',
    split: splitMulti,
    min: 1,
    max: 6,
    item: (raw, ctx) => lookup(ctx.origin, raw, 'origin'),
  },
  process: { rawKey: 'process', kind: 'scalar', item: (raw, ctx) => lookup(ctx.process, raw, 'process method') },
  roast_level: { rawKey: 'roast', kind: 'scalar', item: (raw, ctx) => lookup(ctx.roast_level, raw, 'roast level') },
  cupping_score: { rawKey: 'cupping_score', kind: 'scalar', item: (raw) => parseCuppingScore(raw) },
  altitude_masl: { rawKey: 'altitude', kind: 'scalar', item: (raw) => parseAltitude(raw) },
  decaf: { rawKey: 'decaf', kind: 'scalar', item: (raw) => parseDecaf(raw) },
  tasting_notes: {
    rawKey: 'tasting_notes',
    kind: 'list',
    split: (raw) =>
      String(raw)
        .split(/[,;/|\n]/)
        .map(clean)
        .filter(Boolean),
    min: 1,
    max: 10,
    item: (raw) => sentenceCase(clean(raw)),
  },
  variety: {
    rawKey: 'variety',
    kind: 'list',
    split: splitMulti,
    min: 1,
    max: 10,
    item: (raw, ctx) => lookup(ctx.variety, raw, 'variety'),
  },
  harvest_year: { rawKey: 'harvest', kind: 'scalar', item: (raw) => parseHarvestYear(raw) },
  sizes: {
    rawKey: 'sizes',
    kind: 'list',
    split: (raw) =>
      String(raw)
        .split(/[,;/|\n]/)
        .map(clean)
        .filter(Boolean),
    min: 1,
    max: 3,
    item: (raw, ctx) => parseSize(raw, ctx.sizes),
  },
  grinds: {
    rawKey: 'grinds',
    kind: 'list',
    split: splitMulti,
    min: 1,
    max: 4,
    item: (raw, ctx) => lookup(ctx.grind, raw, 'grind'),
  },
  price_250g: { rawKey: 'price_250g', kind: 'scalar', item: (raw) => parsePrice(raw) },
};

/** Converts one raw value (or list item) without throwing: `{value}` on success, `{reason}` when rejected. */
export function convertValue(field, raw, ctx) {
  try {
    return { value: field.item(raw, ctx) };
  } catch (error) {
    if (!(error instanceof FieldError)) throw error;
    return { reason: error.message };
  }
}

function normalizeField(field, raw, ctx) {
  if (raw === undefined || raw === null || clean(raw) === '') throw new FieldError('missing value');
  if (field.kind === 'scalar') return field.item(raw, ctx);

  const values = [];
  for (const part of field.split(raw)) {
    const value = field.item(part, ctx);
    if (!values.includes(value)) values.push(value);
  }
  if (values.length < field.min || values.length > field.max) {
    throw new FieldError(`expected ${field.min}-${field.max} values, got ${values.length}`);
  }
  return values;
}

/**
 * Normalizes every raw product. Never throws on bad data: problems are returned as issues so one run reports all of them.
 * @returns {{products: object[], issues: Array<{product: string, field: string, value: unknown, reason: string}>}}
 */
export function normalizeCatalog(rawProducts, ctx) {
  const products = [];
  const issues = [];
  const handles = new Set();

  rawProducts.forEach((raw, index) => {
    const label = clean(raw.title ?? `#${index + 1}`);
    const product = {};
    const attempt = (name, rawValue, convert) => {
      try {
        product[name] = convert(rawValue);
      } catch (error) {
        if (!(error instanceof FieldError)) throw error;
        issues.push({ product: label, field: name, value: rawValue, reason: error.message });
      }
    };

    attempt('title', raw.title, (value) => {
      if (value === undefined || clean(value) === '') throw new FieldError('missing value');
      return clean(value);
    });
    attempt('brew_guide', raw.brew_guide, (value) => {
      if (value === undefined || clean(value) === '') throw new FieldError('missing value');
      return parseBrewGuide(value);
    });
    for (const [name, field] of Object.entries(FIELDS))
      attempt(name, raw[field.rawKey], (value) => normalizeField(field, value, ctx));

    if (product.title) {
      product.handle = slugify(product.title);
      if (handles.has(product.handle)) {
        issues.push({
          product: label,
          field: 'title',
          value: raw.title,
          reason: `duplicate handle "${product.handle}"`,
        });
      }
      handles.add(product.handle);
    }
    products.push(product);
  });

  return { products, issues };
}

/** Same as normalizeCatalog, but any issue stops the pipeline. */
export function normalizeCatalogOrThrow(rawProducts, ctx) {
  const { products, issues } = normalizeCatalog(rawProducts, ctx);
  if (issues.length > 0) throw new NormalizationError(issues);
  return products;
}
