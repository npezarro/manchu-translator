const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let server;
let baseUrl;

// Start the app on a random port for testing
before(async () => {
  const app = require('../server');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) server.close();
});

function fetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch { json = null; }
        resolve({ status: res.statusCode, body, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function multipartUpload(path, fieldName, filename, buffer, contentType) {
  return new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Date.now();
    const url = new URL(path, baseUrl);

    const parts = [];
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`);
    parts.push(`Content-Type: ${contentType}\r\n\r\n`);
    const header = Buffer.from(parts.join(''));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, buffer, footer]);

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = null; }
        resolve({ status: res.statusCode, body: data, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('server', () => {
  describe('GET /manchu/api/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await fetch('/manchu/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.json.status, 'ok');
    });

    it('includes dictionary count', async () => {
      const res = await fetch('/manchu/api/health');
      assert.ok(typeof res.json.dictionary === 'number');
      assert.ok(res.json.dictionary > 100, 'dictionary should have many entries');
    });
  });

  describe('POST /manchu/api/translate', () => {
    it('returns 400 when no image uploaded', async () => {
      const res = await fetch('/manchu/api/translate', { method: 'POST' });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('No image'));
    });

    it('rejects non-image files with safe message', async () => {
      const textBuffer = Buffer.from('not an image');
      const res = await multipartUpload(
        '/manchu/api/translate',
        'image',
        'test.txt',
        textBuffer,
        'text/plain'
      );
      assert.equal(res.status, 400);
      assert.equal(res.json.error, 'Only JPEG, PNG, and WebP images are accepted');
    });

    it('rejects files over 10MB', async () => {
      // Create a buffer just over 10MB
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 0xFF);
      const res = await multipartUpload(
        '/manchu/api/translate',
        'image',
        'huge.jpg',
        largeBuffer,
        'image/jpeg'
      );
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('too large') || res.json.error.includes('File'));
    });
  });

  describe('static files', () => {
    it('serves index.html at /manchu/', async () => {
      const res = await fetch('/manchu/');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/html'));
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown API routes', async () => {
      const res = await fetch('/manchu/api/nonexistent');
      assert.equal(res.status, 404);
    });
  });
});
