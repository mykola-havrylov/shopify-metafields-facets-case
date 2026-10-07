import { readFile } from 'node:fs/promises';
import { compileDictionaries } from './normalize.js';

const DICTIONARIES_DIR = new URL('../dictionaries/', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, DICTIONARIES_DIR), 'utf8'));

/** Raw dictionary files, as seeded and as used to generate the dirty export. */
export async function loadDictionaryFiles() {
  return {
    roasters: await readJson('roasters.json'),
    processMethods: await readJson('process-methods.json'),
    vocabularies: await readJson('vocabularies.json'),
  };
}

/** Dictionary files compiled into lookup tables for normalizeCatalog. */
export async function loadDictionaries() {
  return compileDictionaries(await loadDictionaryFiles());
}
