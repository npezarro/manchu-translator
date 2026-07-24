// Regression test for the OCR-pass Content-Type mismatch.
//
// server.js enhances the OCR image with enhanceImage(), which ALWAYS re-encodes
// to PNG. The bug: the enhance branch updated the buffer but not `mimeType`, so
// Pass 1 shipped PNG bytes labelled with the ORIGINAL upload type (image/jpeg,
// image/webp). local-worker.js then derives the temp-file extension from that
// mimetype and writes the PNG bytes to e.g. `manchu-*.jpg`, which Claude's Read
// tool interprets by extension — a format/label mismatch on the primary OCR pass.
//
// This test stands up a fake worker that records the Content-Type multer sees and
// the magic bytes of the buffer it receives, then asserts the two agree.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

// Records one entry per /translate call the app makes to the worker.
const calls = [];
let fakeWorker;
let server;
let baseUrl;

// Return the true image format implied by a buffer's magic bytes.
function sniff(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'unknown';
}

// A small JPEG built from varied raw pixels (so normalize/sharpen have real range).
async function makeJpeg() {
  const w = 120, h = 120;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 256;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

function uploadImage(buffer, contentType, filename, fields = {}) {
  return new Promise((resolve, reject) => {
    const boundary = '----EnhTest' + Math.random().toString(16).slice(2);
    const url = new URL('/manchu/api/translate', baseUrl);
    const parts = [];
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    ));
    parts.push(buffer);
    parts.push(Buffer.from('\r\n'));
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${k}"\r\n\r\n` +
        `${v}\r\n`
      ));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

before(async () => {
  // Fake worker: capture what each /translate call actually receives.
  const app = express();
  const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.post('/translate', up.single('image'), (req, res) => {
    calls.push({
      declaredType: req.file && req.file.mimetype,
      actualType: sniff(req.file && req.file.buffer),
      prompt: (req.body.prompt || '').slice(0, 80),
    });
    // First call is OCR (expects JSON), later calls are translation (expects XML tags).
    if (calls.length === 1) {
      res.json({ output: JSON.stringify({
        columns: [{ index: 0, side: 'right', words: [{ manchu: 'x', romanization: 'ara', bbox: [0, 0, 10, 10], confidence: 'high' }] }],
        chineseText: '',
        readingOrder: ['ara'],
      }) });
    } else {
      res.json({ output: '<ManchuTranslation>ok</ManchuTranslation>' });
    }
  });
  await new Promise((resolve) => { fakeWorker = app.listen(0, '127.0.0.1', resolve); });

  // Point the app's worker client at the fake worker BEFORE requiring server.js
  // (claude-cli.js reads WORKER_PORT once at module load).
  process.env.WORKER_HOST = '127.0.0.1';
  process.env.WORKER_PORT = String(fakeWorker.address().port);

  const serverApp = require('../server');
  await new Promise((resolve) => {
    server = serverApp.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) server.close();
  if (fakeWorker) fakeWorker.close();
});

beforeEach(() => { calls.length = 0; });

describe('OCR pass image Content-Type', () => {
  it('labels the enhanced OCR image as PNG (its true encoding), not the original JPEG type', async () => {
    const jpeg = await makeJpeg();
    const res = await uploadImage(jpeg, 'image/jpeg', 'scan.jpg'); // enhance defaults on
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    assert.ok(calls.length >= 1, 'worker should have received the OCR call');

    const ocr = calls[0];
    // enhanceImage() re-encoded to PNG, so the bytes ARE png...
    assert.equal(ocr.actualType, 'image/png', 'OCR bytes should be the enhanced PNG');
    // ...and the declared Content-Type must match those bytes (the fix).
    assert.equal(ocr.declaredType, 'image/png', 'OCR Content-Type must match the PNG bytes');
    assert.equal(ocr.declaredType, ocr.actualType, 'declared type must match actual bytes');
  });

  it('leaves the translation pass carrying the original image unchanged', async () => {
    const jpeg = await makeJpeg();
    await uploadImage(jpeg, 'image/jpeg', 'scan.jpg');
    assert.ok(calls.length >= 2, 'worker should have received the translation call too');

    const translation = calls[1];
    // Pass 2 sends the original (un-enhanced) buffer, so it stays JPEG both ways.
    assert.equal(translation.actualType, 'image/jpeg', 'translation bytes should be the original JPEG');
    assert.equal(translation.declaredType, 'image/jpeg', 'translation Content-Type should stay JPEG');
  });

  it('does not relabel when enhancement is disabled (no-regression)', async () => {
    const jpeg = await makeJpeg();
    const res = await uploadImage(jpeg, 'image/jpeg', 'scan.jpg', { enhance: 'false' });
    assert.equal(res.status, 200);
    const ocr = calls[0];
    // No enhancement → original JPEG bytes → JPEG label. Declared must match actual.
    assert.equal(ocr.actualType, 'image/jpeg', 'without enhancement the OCR bytes stay JPEG');
    assert.equal(ocr.declaredType, 'image/jpeg', 'without enhancement the label stays JPEG');
    assert.equal(ocr.declaredType, ocr.actualType, 'declared type must match actual bytes');
  });
});
