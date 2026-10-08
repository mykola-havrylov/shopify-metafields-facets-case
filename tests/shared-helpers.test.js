import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadEnv } from '../scripts/src/env.js';
import { assertNoUserErrors } from '../scripts/src/user-errors.js';

describe('assertNoUserErrors', () => {
  it('does nothing when there are no user errors', () => {
    assert.doesNotThrow(() => assertNoUserErrors('Saving', []));
  });

  it('formats field path, message and code', () => {
    assert.throws(
      () =>
        assertNoUserErrors('Saving product', [{ field: ['input', 'variants'], message: 'Too many', code: 'INVALID' }]),
      { message: 'Saving product failed: input.variants: Too many (INVALID)' },
    );
  });

  it('leaves out the code when the error has none, and copes with a missing field', () => {
    assert.throws(() => assertNoUserErrors('Uploading', [{ field: null, message: 'Bad mime type' }]), {
      message: 'Uploading failed: : Bad mime type',
    });
  });

  it('joins several errors', () => {
    assert.throws(
      () =>
        assertNoUserErrors('Creating', [
          { field: ['a'], message: 'One', code: 'X' },
          { field: ['b', 'c'], message: 'Two' },
        ]),
      { message: 'Creating failed: a: One (X); b.c: Two' },
    );
  });
});

describe('loadEnv', () => {
  it('ignores a missing .env file', () => {
    assert.doesNotThrow(() => loadEnv('this-file-does-not-exist.env'));
  });

  it('does not hide other errors', () => {
    assert.throws(
      () => loadEnv('tests'),
      (error) => error.code !== 'ENOENT',
    );
  });
});
