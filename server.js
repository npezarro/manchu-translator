require('dotenv').config();
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const dictionary = require('./lib/dictionary');
const { buildOcrPrompt, buildTranslationPrompt } = require('./lib/prompt-builder');
const { callClaude, parseResponse } = require('./lib/claude-cli');
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
app.get(`${BASE}/api/health`, (req, res) => {
  res.json({ status: 'ok', dictionary: Object.keys(dictionary.load()).length });
});

// Translation endpoint
app.post(`${BASE}/api/translate`, upload.single('image'), async (req, res) => {
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

    // Pass 1: Quick OCR with Haiku
    console.log('  Pass 1: OCR with Haiku...');
    const ocrPrompt = buildOcrPrompt();
    let romanizedText = '';
    try {
      romanizedText = await callClaude(imageBuffer, mimeType, ocrPrompt, 'claude-haiku-4-5-20251001');
      console.log(`  OCR result: ${romanizedText.substring(0, 100)}...`);
    } catch (err) {
      console.warn('  Pass 1 failed, continuing with pass 2 only:', err.message);
    }

    // Look up words in dictionary
    const words = romanizedText
      .replace(/CHINESE:.*$/s, '')
      .split(/[\s,.\-;:]+/)
      .filter(w => w.length > 1);
    const dictEntries = dictionary.lookupWords(words);
    console.log(`  Dictionary matches: ${Object.keys(dictEntries).length} / ${words.length} words`);

    // Pass 2: Full translation with Sonnet
    console.log('  Pass 2: Translation with Sonnet...');
    const translationPrompt = buildTranslationPrompt(romanizedText, dictEntries);
    const rawResponse = await callClaude(imageBuffer, mimeType, translationPrompt, 'claude-sonnet-4-6');

    // Parse structured response
    const result = parseResponse(rawResponse);
    result.dictionaryMatches = Object.keys(dictEntries).length;
    result.wordsFound = words.length;

    console.log(`  Done. Translation length: ${(result.translation || '').length} chars`);
    res.json(result);
  } catch (err) {
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Manchu Translator running on http://127.0.0.1:${PORT}${BASE}`);
});
