require('dotenv').config();
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const dictionary = require('./lib/dictionary');
const { buildOcrPrompt, buildTranslationPrompt } = require('./lib/prompt-builder');
const { callClaude, parseOcrResponse, parseTranslationResponse, parseCharacterDetail, checkWorkerHealth } = require('./lib/claude-cli');
const { cropCharacters, enhanceImage } = require('./lib/image-cropper');
const rateLimiter = require('./lib/rate-limiter');

const app = express();
const PORT = process.env.PORT || 3110;
const BASE = '/manchu';

// Load dictionary at startup
dictionary.load();

// Trust proxy (behind Apache)
app.set('trust proxy', 1);

// Multer: memory storage, 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are accepted'));
    }
  }
});

// Static files
app.use(BASE, express.static(path.join(__dirname, 'public')));

// Health check
app.get(`${BASE}/api/health`, async (req, res) => {
  const workerUp = await checkWorkerHealth();
  res.json({ status: 'ok', dictionary: Object.keys(dictionary.load()).length, workerAvailable: workerUp });
});

// Translation endpoint
app.post(`${BASE}/api/translate`, upload.single('image'), async (req, res) => {
  req.setTimeout(600_000);
  res.setTimeout(600_000);
  const ip = req.ip;
  const limit = rateLimiter.check(ip);
  if (!limit.allowed) {
    return res.status(429).json({ error: limit.reason, retryAfter: limit.retryAfter });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  try {
    console.log(`[${new Date().toISOString()}] Translation request from ${ip}, ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)}KB)`);

    // Resize if needed (max 2048px on longest edge)
    let imageBuffer = req.file.buffer;
    let mimeType = req.file.mimetype;
    const metadata = await sharp(imageBuffer).metadata();
    if (metadata.width > 2048 || metadata.height > 2048) {
      imageBuffer = await sharp(imageBuffer)
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      mimeType = 'image/png';
      console.log(`  Resized from ${metadata.width}x${metadata.height}`);
    }

    // === IMAGE ENHANCEMENT ===
    const enhance = req.body?.enhance !== 'false'; // default: on
    let ocrImageBuffer = imageBuffer;
    if (enhance) {
      try {
        ocrImageBuffer = await enhanceImage(imageBuffer);
        console.log('  Image enhanced (normalize + sharpen)');
      } catch (err) {
        console.warn('  Enhancement failed, using original:', err.message);
        ocrImageBuffer = imageBuffer;
      }
    }

    // === PASS 1: Structured OCR with Sonnet ===
    console.log('  Pass 1: Structured OCR with Sonnet...');
    const ocrPrompt = buildOcrPrompt();
    let ocrData = null;
    let ocrRaw = '';
    try {
      ocrRaw = await callClaude(ocrImageBuffer, mimeType, ocrPrompt, 'claude-sonnet-4-6');
      ocrData = parseOcrResponse(ocrRaw);
      if (!ocrData) {
        console.log('  OCR parse failed, retrying with stricter prompt...');
        const retryPrompt = 'Your previous response was not valid JSON. Return ONLY a raw JSON object — no markdown fences, no commentary, no text before or after.\n\n' + ocrPrompt;
        ocrRaw = await callClaude(ocrImageBuffer, mimeType, retryPrompt, 'claude-sonnet-4-6');
        ocrData = parseOcrResponse(ocrRaw);
      }
      if (ocrData) {
        console.log(`  OCR: ${ocrData.readingOrder.length} words in ${ocrData.columns.length} columns`);
      } else {
        console.warn('  OCR JSON parse failed after retry, will proceed without structured OCR');
      }
    } catch (err) {
      console.warn('  Pass 1 failed:', err.message);
    }

    // === IMAGE CROPPING ===
    let cropMap = new Map();
    if (ocrData) {
      try {
        console.log('  Cropping character images...');
        cropMap = await cropCharacters(ocrImageBuffer, ocrData.columns);
        console.log(`  Cropped ${cropMap.size} character images`);
      } catch (err) {
        console.warn('  Cropping failed:', err.message);
      }
    }

    // === DICTIONARY LOOKUP on clean romanized words ===
    const words = ocrData
      ? ocrData.readingOrder.filter(w => w && w.length > 1 && !w.endsWith('?'))
      : [];
    const dictEntries = dictionary.lookupWords(words);
    console.log(`  Dictionary matches: ${Object.keys(dictEntries).length} / ${words.length} words`);

    // === PASS 2: Translation with Sonnet ===
    console.log('  Pass 2: Translation with Sonnet...');
    const translationPrompt = buildTranslationPrompt(
      ocrData || { columns: [], readingOrder: [], chineseText: '' },
      dictEntries
    );
    const rawTranslation = await callClaude(imageBuffer, mimeType, translationPrompt, 'claude-sonnet-4-6');
    const translationResult = parseTranslationResponse(rawTranslation);

    // === ASSEMBLE RESPONSE ===
    // Parse character details from Call 2 for Chinese/English meanings
    const charDetail = parseCharacterDetail(translationResult.characterdetail || '');

    // Build structured character map from OCR data + crops + dictionary + Call 2 details
    const charactermap = [];
    if (ocrData) {
      for (const col of ocrData.columns) {
        for (let wi = 0; wi < (col.words || []).length; wi++) {
          const word = col.words[wi];
          const rom = (word.romanization || '').toLowerCase().replace(/\?$/, '');
          const cropKey = `${col.index}-${wi}`;
          const detail = charDetail[rom] || {};
          const dictDef = dictEntries[rom];

          charactermap.push({
            manchu: word.manchu || '',
            romanization: word.romanization || '',
            cropBase64: cropMap.get(cropKey) || null,
            chinese: detail.chinese || '',
            english: detail.english || (dictDef ? dictDef.substring(dictDef.indexOf(' ') + 1).substring(0, 120) : ''),
            confidence: word.confidence || 'medium'
          });
        }
      }
    }

    // Build OCR text and romanization from structured data
    const ocrText = ocrData
      ? ocrData.columns.map(col => {
          const side = col.side ? ` (${col.side})` : '';
          const words2 = (col.words || []).map(w => w.manchu || w.romanization).join(' ');
          return `Column ${col.index}${side}: ${words2}`;
        }).join('\n')
      : '';

    const romanization = ocrData
      ? ocrData.columns.map(col => {
          const side = col.side ? ` (${col.side})` : '';
          const roms = (col.words || []).map(w => w.romanization).join(' ');
          return `Column ${col.index}${side}: ${roms}`;
        }).join('\n')
      : '';

    const result = {
      ocr: ocrText,
      charactermap,
      romanization,
      wordbyword: translationResult.wordbyword || '',
      manchuTranslation: translationResult.manchutranslation || '',
      chineseTranslation: translationResult.chinesetranslation || '',
      viability: translationResult.viabilityassessment || '',
      translation: translationResult.manchutranslation || translationResult.translation || '',
      chinesetext: translationResult.chinesetext || '',
      notes: translationResult.notes || '',
      dictionaryMatches: Object.keys(dictEntries).length,
      wordsFound: words.length
    };

    console.log(`  Done. Translation: ${(result.translation || '').length} chars, CharMap: ${charactermap.length} entries, Crops: ${cropMap.size}`);
    res.json(result);
  } catch (err) {
    if (err.message === 'WORKER_UNAVAILABLE') {
      console.warn('Translation worker unavailable — local machine is offline');
      return res.status(503).json({
        error: 'Translation processing is temporarily unavailable. The processing server is offline. Please try again later.'
      });
    }
    console.error('Translation error:', err);
    res.status(500).json({ error: 'Translation failed. Please try again.' });
  }
});

// Error handler for multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message.includes('Only JPEG')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Manchu Translator running on http://127.0.0.1:${PORT}${BASE}`);
  });
}

module.exports = app;
