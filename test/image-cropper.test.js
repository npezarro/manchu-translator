const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { cropCharacters } = require('../lib/image-cropper');

// Create a test image buffer (100x100 red square)
async function makeTestImage(width = 100, height = 100) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 150, b: 100 } } }).png().toBuffer();
}

describe('image-cropper', () => {
  it('crops characters from bounding boxes', async () => {
    const img = await makeTestImage(200, 200);
    const columns = [
      { index: 0, words: [
        { romanization: 'hafan', bbox: [10, 10, 40, 60], confidence: 'high' },
        { romanization: 'dorgi', bbox: [60, 10, 40, 60], confidence: 'medium' }
      ]}
    ];
    const crops = await cropCharacters(img, columns);
    assert.equal(crops.size, 2);
    assert.ok(crops.get('0-0').startsWith('data:image/png;base64,'));
    assert.ok(crops.get('0-1').startsWith('data:image/png;base64,'));
  });

  it('skips words without bbox', async () => {
    const img = await makeTestImage();
    const columns = [
      { index: 0, words: [
        { romanization: 'hafan', bbox: [5, 5, 30, 40] },
        { romanization: 'no-bbox' }
      ]}
    ];
    const crops = await cropCharacters(img, columns);
    assert.equal(crops.size, 1);
  });

  it('skips words with invalid bbox', async () => {
    const img = await makeTestImage();
    const columns = [
      { index: 0, words: [
        { romanization: 'bad', bbox: [10, 10] },
        { romanization: 'good', bbox: [5, 5, 30, 40] }
      ]}
    ];
    const crops = await cropCharacters(img, columns);
    assert.equal(crops.size, 1);
  });

  it('clamps bbox to image bounds', async () => {
    const img = await makeTestImage(50, 50);
    const columns = [
      { index: 0, words: [
        { romanization: 'overflow', bbox: [30, 30, 100, 100] }
      ]}
    ];
    const crops = await cropCharacters(img, columns);
    assert.equal(crops.size, 1);
  });

  it('returns empty map for empty columns', async () => {
    const img = await makeTestImage();
    const crops = await cropCharacters(img, []);
    assert.equal(crops.size, 0);
  });

  it('respects 50 crop limit', async () => {
    const img = await makeTestImage(500, 500);
    const words = Array.from({ length: 60 }, (_, i) => ({
      romanization: `word${i}`,
      bbox: [(i % 10) * 40, Math.floor(i / 10) * 40, 30, 30]
    }));
    const columns = [{ index: 0, words }];
    const crops = await cropCharacters(img, columns);
    assert.ok(crops.size <= 50);
  });

  it('handles columns with missing words array', async () => {
    const img = await makeTestImage();
    const columns = [{ index: 0 }];
    const crops = await cropCharacters(img, columns);
    assert.equal(crops.size, 0);
  });
});
