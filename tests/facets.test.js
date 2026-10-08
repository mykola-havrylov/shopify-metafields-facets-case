import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, it } from 'node:test';
import vm from 'node:vm';

// assets/facets.js is a browser script. It is run here against a minimal stand-in for the DOM, which is enough to check
// the logic that decides what is rendered, without a browser.
const source = await readFile(new URL('../assets/facets.js', import.meta.url), 'utf8');

function loadFacets({ fakeForm } = {}) {
  const defined = {};
  const context = {
    HTMLElement: class {
      querySelector(selector) {
        return selector === 'form' ? fakeForm : null;
      }
    },
    customElements: { define: (name, element) => (defined[name] = element) },
    window: { location: { search: '' }, addEventListener: () => {}, StandardEvents: undefined },
    document: { querySelectorAll: () => [], getElementById: () => null, querySelector: () => null },
    DOMParser: class {
      parseFromString(html) {
        return { getElementById: (id) => (id === 'ProductCount' ? { dataset: { productCount: html } } : null) };
      }
    },
    // The real debounce delays the call; here it never fires, so only the synchronous part of the listener is tested.
    debounce: () => () => {},
    onKeyUpEscape: () => {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { FacetFiltersForm: defined['facet-filters-form'], context };
}

describe('facets.js', () => {
  let FacetFiltersForm;
  beforeEach(() => {
    ({ FacetFiltersForm } = loadFacets());
  });

  it('initialises its static state, so counters never become NaN', () => {
    assert.equal(FacetFiltersForm.inputVersion, 0);
    assert.equal(FacetFiltersForm.focusResultCountAfterRender, false);
    assert.equal(FacetFiltersForm.filterData.length, 0); // created in the vm realm, so compare by length
  });

  it('renders a response that belongs to the latest input', () => {
    const calls = [];
    FacetFiltersForm.renderFilters = () => calls.push('filters');
    FacetFiltersForm.renderProductGridContainer = () => calls.push('grid');
    FacetFiltersForm.renderProductCount = () => calls.push('count');

    FacetFiltersForm.inputVersion = 3;
    FacetFiltersForm.renderSection('<html>', null, undefined, 3);
    assert.deepEqual(calls, ['filters', 'grid', 'count']);
  });

  it('does not render a response that a newer input has overtaken, and still settles the update event', () => {
    const calls = [];
    FacetFiltersForm.renderFilters = () => calls.push('filters');
    FacetFiltersForm.renderProductGridContainer = () => calls.push('grid');
    FacetFiltersForm.renderProductCount = () => calls.push('count');
    const resolved = [];

    FacetFiltersForm.inputVersion = 4;
    FacetFiltersForm.renderSection('12', null, { resolve: (count) => resolved.push(count) }, 3);
    assert.deepEqual(calls, []);
    assert.deepEqual(resolved, [12]);
  });

  it('renders when no version is given (popstate, chips and Remove all)', () => {
    const calls = [];
    FacetFiltersForm.renderFilters = () => calls.push('filters');
    FacetFiltersForm.renderProductGridContainer = () => calls.push('grid');
    FacetFiltersForm.renderProductCount = () => calls.push('count');

    FacetFiltersForm.inputVersion = 9;
    FacetFiltersForm.renderSection('<html>', null, undefined, undefined);
    assert.deepEqual(calls, ['filters', 'grid', 'count']);
  });

  it('moves focus to the result count once after a chip was removed', () => {
    const focused = [];
    FacetFiltersForm.renderFilters = () => {};
    FacetFiltersForm.renderProductGridContainer = () => {};
    FacetFiltersForm.renderProductCount = () => {};
    FacetFiltersForm.focusResultCount = () => focused.push('count');

    FacetFiltersForm.focusResultCountAfterRender = true;
    FacetFiltersForm.renderSection('<html>', null, undefined, undefined);
    FacetFiltersForm.renderSection('<html>', null, undefined, undefined);
    assert.deepEqual(focused, ['count']);
  });

  it('counts every input and remembers the form of the event', () => {
    const handlers = {};
    const fakeForm = { addEventListener: (type, handler) => (handlers[type] = handler) };
    const { FacetFiltersForm: Form } = loadFacets({ fakeForm });
    new Form();

    const form = { id: 'FacetFiltersForm' };
    const event = { target: { closest: (selector) => (selector === 'form' ? form : null) } };
    handlers.input(event);
    assert.equal(Form.inputVersion, 1);
    assert.equal(event.facetForm, form);
    handlers.input({ ...event });
    assert.equal(Form.inputVersion, 2);
    assert.equal(typeof handlers.submit, 'function', 'the form also handles submit');
  });
});
