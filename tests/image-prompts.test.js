import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, describe, it } from 'node:test';
import { canonicalCatalog } from '../scripts/src/catalog.js';
import { loadDictionaryFiles } from '../scripts/src/dictionaries.js';
import {
  PROCESS_ACCENTS,
  ROAST_BEANS,
  ROASTER_BAGS,
  STYLE,
  buildPromptPack,
  imageAlt,
  imageFilename,
  renderBrief,
} from '../scripts/src/image-prompts.js';

let catalog;
let dictionaries;
let pack;

before(async () => {
  catalog = canonicalCatalog();
  dictionaries = await loadDictionaryFiles();
  pack = buildPromptPack(catalog, dictionaries);
});

describe('image prompt pack', () => {
  it('has one entry per product with a unique file name', () => {
    assert.equal(pack.products.length, catalog.length);
    assert.equal(new Set(pack.products.map(({ filename }) => filename)).size, catalog.length);
    assert.deepEqual(
      pack.products.map(({ filename }) => filename),
      catalog.map(imageFilename),
    );
  });

  it('covers every roaster, process method and roast level in the dictionaries', () => {
    for (const { handle } of dictionaries.roasters) assert.ok(ROASTER_BAGS[handle], handle);
    for (const { handle } of dictionaries.processMethods) assert.ok(PROCESS_ACCENTS[handle], handle);
    for (const { canonical } of dictionaries.vocabularies.roast_levels) assert.ok(ROAST_BEANS[canonical], canonical);
  });

  it('keeps the studio style identical in every prompt', () => {
    for (const { prompt } of pack.products) {
      assert.ok(prompt.includes(STYLE.background), 'background');
      assert.ok(prompt.includes(STYLE.negative), 'negative list');
      assert.match(prompt, /^Product photo of one coffee bag/);
    }
  });

  it('varies the bag by roaster, the band by process and the beans by roast level', () => {
    const roasterOf = (handle) => catalog.find((p) => p.handle === handle).roaster;
    const [a, b] = pack.products.filter(({ handle }) => roasterOf(handle) === 'copper-kettle');
    assert.equal(a.bag, b.bag, 'one roaster, one packaging family');
    assert.notEqual(pack.products[0].bag, pack.products.find((p) => p.roaster === 'Harbor & Hill').bag);

    const light = pack.products.find(({ handle }) => catalog.find((p) => p.handle === handle).roast_level === 'Light');
    const dark = pack.products.find(
      ({ handle }) => catalog.find((p) => p.handle === handle).roast_level === 'Medium-Dark',
    );
    assert.notEqual(light.beans, dark.beans);
    assert.equal(new Set(pack.products.map(({ accent }) => accent)).size >= 5, true);
  });

  it('never gives the model a product or roaster name it could print on the bag', () => {
    for (const product of catalog) {
      const { prompt } = pack.products.find(({ handle }) => handle === product.handle);
      assert.ok(!prompt.includes(product.title), product.title);
    }
    for (const { title } of dictionaries.roasters) {
      for (const { prompt } of pack.products) assert.ok(!prompt.includes(title), title);
    }
  });

  it('discloses the AI origin in the alt text', () => {
    assert.match(
      imageAlt(catalog[0], 'Northern Ember Roasters'),
      /^AI-generated image of a bag of Yirgacheffe Kochere/,
    );
    assert.ok(pack.products.every(({ alt }) => alt.startsWith('AI-generated')));
  });

  it('keeps the committed prompts.json and brief.md in sync with the generator', async () => {
    const json = JSON.parse(await readFile(new URL('../data/images/prompts.json', import.meta.url), 'utf8'));
    assert.deepEqual(json, pack);
    assert.equal(await readFile(new URL('../data/images/brief.md', import.meta.url), 'utf8'), renderBrief(pack));
  });

  it('renders a brief with the output rules and a section per product', () => {
    const brief = renderBrief(pack);
    assert.match(brief, /1200x1200 px, square, JPEG/);
    assert.equal((brief.match(/^### /gm) ?? []).length, catalog.length);
    assert.ok(brief.includes('`yirgacheffe-kochere.jpg`'));
  });
});
