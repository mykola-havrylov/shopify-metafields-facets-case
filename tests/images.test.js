import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_BYTES, listImageFiles, planImages, readImageInfo, validateImage } from '../scripts/src/images.js';

/** Minimal JPEG: SOI, one APP0 segment, a SOF0 segment with the size, padding. Enough for header parsing. */
function jpeg(width, height, extra = 0) {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(extra)]);
}

function png(width, height) {
  const bytes = Buffer.alloc(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe('readImageInfo', () => {
  it('reads size and format from JPEG and PNG headers', () => {
    assert.deepEqual(readImageInfo(jpeg(1200, 1200)), { format: 'jpeg', width: 1200, height: 1200 });
    assert.deepEqual(readImageInfo(png(1024, 768)), { format: 'png', width: 1024, height: 768 });
  });

  it('returns null for anything else', () => {
    assert.equal(readImageInfo(Buffer.from('GIF89a......')), null);
    assert.equal(readImageInfo(Buffer.alloc(0)), null);
    assert.equal(readImageInfo(Buffer.from([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])), null);
  });
});

describe('validateImage', () => {
  it('accepts a square 1200px JPEG within the size limit', () => {
    assert.deepEqual(validateImage({ filename: 'a.jpg', bytes: jpeg(1200, 1200) }), []);
    assert.deepEqual(validateImage({ filename: 'a.png', bytes: png(1200, 1200) }), []);
  });

  it('rejects wrong extensions, unreadable files and mismatched content', () => {
    assert.match(validateImage({ filename: 'a.gif', bytes: jpeg(1200, 1200) })[0], /extension must be one of/);
    assert.match(
      validateImage({ filename: 'a.jpg', bytes: Buffer.from('not an image at all') })[0],
      /not a readable JPEG or PNG/,
    );
    assert.match(
      validateImage({ filename: 'a.png', bytes: jpeg(1200, 1200) }).join(),
      /content is jpeg but the extension says otherwise/,
    );
  });

  it('rejects non-square, too small, too large and too heavy images', () => {
    assert.match(validateImage({ filename: 'a.jpg', bytes: jpeg(1200, 900) }).join(), /must be square/);
    assert.match(validateImage({ filename: 'a.jpg', bytes: jpeg(800, 800) }).join(), /800px wide, expected 1000-4000/);
    assert.match(validateImage({ filename: 'a.jpg', bytes: jpeg(5000, 5000) }).join(), /5000px wide/);
    assert.match(
      validateImage({ filename: 'a.jpg', bytes: jpeg(1200, 1200, MAX_BYTES) }).join(),
      /KB, the limit is 800 KB/,
    );
  });
});

describe('planImages', () => {
  const products = [{ handle: 'one' }, { handle: 'two' }, { handle: 'three' }];

  it('pairs files with products by handle and lists missing and unexpected ones', () => {
    const { matches, missing, unexpected } = planImages(products, ['one.jpg', 'two.PNG', 'stray.jpg', 'one.png']);
    assert.deepEqual(
      matches.map(({ product, filename }) => [product.handle, filename]),
      [
        ['one', 'one.jpg'],
        ['two', 'two.PNG'],
      ],
    );
    assert.deepEqual(missing, ['three']);
    assert.deepEqual(unexpected, ['stray.jpg', 'one.png']);
  });

  it('ignores the brief and the prompt file when listing images', () => {
    assert.deepEqual(listImageFiles(['brief.md', 'prompts.json', 'a.jpg', 'b.PNG', 'c.webp', '.gitkeep']), [
      'a.jpg',
      'b.PNG',
      'c.webp',
    ]);
  });
});
