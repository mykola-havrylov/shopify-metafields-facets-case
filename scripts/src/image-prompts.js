// Prompts for the AI-generated product images, derived from the catalog so they never drift from the product data.
// Same studio, background and framing for every product; the bag design follows the roaster, the accent band follows
// the process method (same color as its swatch) and the scattered beans follow the roast level.
import { descriptionText } from './catalog-seed.js';

export const IMAGE_SIZE = 1200;

export const STYLE = {
  background: 'seamless light grey studio background (#E8E8E8), no visible horizon',
  light: 'soft diffused light from the upper left, a gentle soft shadow under the bag',
  framing: `square 1:1 composition (${IMAGE_SIZE}x${IMAGE_SIZE} px), front view with the camera slightly above, one bag centered, filling about 60% of the frame height`,
  bag: 'a matte stand-up coffee pouch with a plain blank label area',
  mood: 'clean, minimal e-commerce catalog photograph, realistic materials, natural proportions',
  negative:
    'No text, no letters, no numbers, no logos, no watermarks, no barcodes, no hands, no people, no other bags, no props besides the coffee beans',
};

// One packaging family per roaster; the motifs are abstract shapes, never lettering.
export const ROASTER_BAGS = {
  'northern-ember': 'matte charcoal black with an abstract copper-orange pattern of flame-like triangles',
  'copper-kettle': 'warm copper brown with a cream label area and a large abstract arc motif',
  'sunday-bean': 'soft butter yellow with a white label area and a simple abstract sun-circle motif',
  'harbor-and-hill': 'deep navy blue with thin white wave lines and an abstract hill silhouette',
  'tiny-drum': 'forest green with a cream round abstract drum-shaped circle motif',
  'alder-roast-lab': 'off-white with thin black grid lines, like graph paper',
};

// Color names are used because image models follow them better than hex codes; the hex matches the swatch in the theme.
export const PROCESS_ACCENTS = {
  washed: 'a thin blue band',
  natural: 'a thin red band',
  honey: 'a thin amber band',
  anaerobic: 'a thin purple band',
  'wet-hulled': 'a thin olive green band',
};

export const ROAST_BEANS = {
  Light: 'pale golden brown',
  'Medium-Light': 'light caramel brown',
  Medium: 'medium chestnut brown',
  'Medium-Dark': 'dark chocolate brown',
  Dark: 'very dark, almost black, with a slight oily sheen',
};

export const imageFilename = (product) => `${product.handle}.jpg`;

/** Alt text that discloses the image is AI-generated. */
export const imageAlt = (product, roasterTitle) =>
  `AI-generated image of a bag of ${product.title} coffee by ${roasterTitle}`;

function pick(table, key, what) {
  const value = table[key];
  if (!value) throw new Error(`No ${what} defined for "${key}".`);
  return value;
}

export function buildPrompt(product, { processMethod }) {
  const bag = pick(ROASTER_BAGS, product.roaster, 'bag design');
  const accent = pick(PROCESS_ACCENTS, product.process, 'accent band');
  const beans = pick(ROAST_BEANS, product.roast_level, 'bean color');
  // The product and roaster names are left out on purpose: models tend to print any name they are given.
  const context = `${product.roast_level.toLowerCase()} roast, ${processMethod.title.toLowerCase()} process coffee from ${product.origin.join(' and ')}, flavor notes of ${product.tasting_notes.join(', ').toLowerCase()}`;

  return [
    `Product photo of one coffee bag on a ${STYLE.background}, ${STYLE.light}.`,
    `${STYLE.framing[0].toUpperCase()}${STYLE.framing.slice(1)}.`,
    `The bag is ${STYLE.bag}, in ${bag}, with ${accent} across the lower part of the bag.`,
    `Next to the bag lies a small scatter of whole coffee beans in a ${beans} roast color.`,
    `Style: ${STYLE.mood}.`,
    `Mood reference only, never to be written on the image: ${context}.`,
    `${STYLE.negative}.`,
  ].join(' ');
}

/** Everything the image brief needs, one entry per product. */
export function buildPromptPack(catalog, { roasters, processMethods }) {
  const products = catalog.map((product) => {
    const roaster = roasters.find(({ handle }) => handle === product.roaster);
    const processMethod = processMethods.find(({ handle }) => handle === product.process);
    return {
      handle: product.handle,
      title: product.title,
      filename: imageFilename(product),
      alt: imageAlt(product, roaster.title),
      description: descriptionText(product, { roasterTitle: roaster.title, processTitle: processMethod.title }),
      roaster: roaster.title,
      bag: pick(ROASTER_BAGS, product.roaster, 'bag design'),
      accent: `${pick(PROCESS_ACCENTS, product.process, 'accent band')} (${processMethod.title}, ${processMethod.color})`,
      beans: pick(ROAST_BEANS, product.roast_level, 'bean color'),
      prompt: buildPrompt(product, { processMethod }),
    };
  });
  return { size: IMAGE_SIZE, format: 'JPEG', style: STYLE, products };
}

/** The brief handed to whoever (or whatever) generates the images. */
export function renderBrief(pack) {
  const { style } = pack;
  const lines = [
    '# Product image brief',
    '',
    `Generate one image per product below. ${pack.products.length} images in total.`,
    '',
    '## Output',
    '',
    `- ${pack.size}x${pack.size} px, square, ${pack.format}, under 800 KB each (compress if needed).`,
    '- File name exactly as given in `filename` (the product handle), saved to `data/images/`.',
    '- One image per product. Do not add text, letters, numbers, logos, barcodes or watermarks to any image.',
    '- Product and roaster names, descriptions and alt texts below are for reference only. Never write them on the image.',
    '',
    '## Style shared by all images',
    '',
    `- Background: ${style.background}.`,
    `- Light: ${style.light}.`,
    `- Framing: ${style.framing}.`,
    `- Bag: ${style.bag}.`,
    `- Mood: ${style.mood}.`,
    `- Always: ${style.negative}.`,
    '',
    '## What changes between products',
    '',
    '- The bag design belongs to the roaster, so every coffee of one roaster looks like one product line.',
    '- The thin accent band across the bag has the color of the processing method.',
    '- The scattered beans next to the bag have the color of the roast level.',
    '',
    '## Products',
  ];
  for (const product of pack.products) {
    lines.push(
      '',
      `### ${product.title} (\`${product.filename}\`)`,
      '',
      `- Description: ${product.description}`,
      `- Roaster: ${product.roaster}: ${product.bag}`,
      `- Accent: ${product.accent}`,
      `- Beans: ${product.beans}`,
      `- Alt text: ${product.alt}`,
      '',
      'Prompt:',
      '',
      `> ${product.prompt}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
