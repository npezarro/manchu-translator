const sharp = require('sharp');

const MAX_CROPS = 50;
const PADDING = 18;
const MAX_CROP_WIDTH = 150;

/**
 * Crop individual character regions from the source image.
 * @param {Buffer} imageBuffer - The source image
 * @param {Array} columns - OCR columns with words containing bbox arrays [x, y, w, h]
 * @returns {Promise<Map<string, string>>} Map of "col-wordIdx" key to base64 data URI
 */
async function cropCharacters(imageBuffer, columns) {
  const crops = new Map();
  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  let count = 0;

  for (const col of columns) {
    for (let wi = 0; wi < (col.words || []).length; wi++) {
      if (count >= MAX_CROPS) break;

      const word = col.words[wi];
      if (!word.bbox || !Array.isArray(word.bbox) || word.bbox.length < 4) continue;

      const [rawX, rawY, rawW, rawH] = word.bbox;

      // Add padding, clamp to image bounds
      const left = Math.max(0, Math.round(rawX - PADDING));
      const top = Math.max(0, Math.round(rawY - PADDING));
      const right = Math.min(imgW, Math.round(rawX + rawW + PADDING));
      const bottom = Math.min(imgH, Math.round(rawY + rawH + PADDING));
      const width = right - left;
      const height = bottom - top;

      if (width < 5 || height < 5) continue;

      try {
        let pipeline = sharp(imageBuffer).extract({ left, top, width, height });

        // Resize if wider than max
        if (width > MAX_CROP_WIDTH) {
          pipeline = pipeline.resize({ width: MAX_CROP_WIDTH, withoutEnlargement: true });
        }

        const buf = await pipeline.png().toBuffer();
        const key = `${col.index}-${wi}`;
        crops.set(key, `data:image/png;base64,${buf.toString('base64')}`);
        count++;
      } catch (err) {
        console.warn(`  Crop failed for ${word.romanization}: ${err.message}`);
      }
    }
    if (count >= MAX_CROPS) break;
  }

  return crops;
}

/**
 * Enhance image for better OCR legibility.
 * Normalizes contrast and sharpens text edges.
 * @param {Buffer} imageBuffer - The source image
 * @returns {Promise<Buffer>} Enhanced PNG buffer
 */
async function enhanceImage(imageBuffer) {
  return sharp(imageBuffer)
    .normalize()          // stretch contrast to full range
    .sharpen({
      sigma: 1.5,         // moderate — good for manuscript text
      m1: 1.0,            // flat areas
      m2: 2.0             // jagged areas (text edges)
    })
    .png()
    .toBuffer();
}

module.exports = { cropCharacters, enhanceImage };
