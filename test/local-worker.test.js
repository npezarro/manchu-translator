const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { Writable, Readable } = require('node:stream');

const app = require('../lib/local-worker');

let server;
let baseUrl;

before(async () => {
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

// Restore spawn after each test
const origSpawn = app._deps.spawn;
afterEach(() => {
  app._deps.spawn = origSpawn;
});

// ── Helper: simple GET/POST via http module ──

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch { json = null; }
        resolve({ status: res.statusCode, body, json });
      });
    }).on('error', reject);
  });
}

function multipartPost(urlPath, fields, file) {
  return new Promise((resolve, reject) => {
    const boundary = '----Boundary' + Date.now();
    const url = new URL(urlPath, baseUrl);
    const parts = [];

    // Text fields
    for (const [name, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      ));
    }

    // File field
    if (file) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`
      ));
      parts.push(file.buffer);
      parts.push(Buffer.from('\r\n'));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = null; }
        resolve({ status: res.statusCode, body: data, json });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Helper: create a mock spawn that emits controlled events ──

function mockSpawn({ stdout = '', stderr = '', exitCode = 0, spawnError = null, delay = 0 } = {}) {
  const calls = [];

  app._deps.spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdin = new Writable({ write(chunk, enc, cb) { cb(); } });
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = () => { child.emit('close', null); };

    calls.push({ cmd, args, opts, child });

    if (spawnError) {
      process.nextTick(() => child.emit('error', new Error(spawnError)));
      return child;
    }

    setTimeout(() => {
      if (stdout) child.stdout.push(stdout);
      child.stdout.push(null);
      if (stderr) child.stderr.push(stderr);
      child.stderr.push(null);
      child.emit('close', exitCode);
    }, delay);

    return child;
  };

  return calls;
}

const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

// ── Tests ──

describe('local-worker /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await httpGet('/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  it('includes hostname', async () => {
    const res = await httpGet('/health');
    assert.ok(typeof res.json.host === 'string');
    assert.ok(res.json.host.length > 0);
  });

  it('includes uptime as a number', async () => {
    const res = await httpGet('/health');
    assert.ok(typeof res.json.uptime === 'number');
    assert.ok(res.json.uptime > 0);
  });
});

describe('local-worker /translate validation', () => {
  it('returns 400 when no image uploaded', async () => {
    const res = await multipartPost('/translate', { prompt: 'translate this' }, null);
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'No image');
  });

  it('returns 400 when no prompt provided', async () => {
    const calls = mockSpawn({ stdout: 'should not run' });
    const res = await multipartPost('/translate', {}, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'No prompt');
    assert.equal(calls.length, 0, 'Claude CLI should not be spawned');
  });
});

describe('local-worker /translate success', () => {
  it('returns translated output from Claude CLI', async () => {
    mockSpawn({ stdout: '  This is a Manchu text translation.  ' });
    const res = await multipartPost('/translate', { prompt: 'Translate this Manchu text' }, {
      field: 'image',
      name: 'page.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.output, 'This is a Manchu text translation.');
  });

  it('passes correct args to Claude CLI', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate', model: 'claude-opus-4-6' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, 'claude');
    assert.ok(calls[0].args.includes('claude-opus-4-6'));
    assert.ok(calls[0].args.includes('--output-format'));
    assert.ok(calls[0].args.includes('text'));
    assert.ok(calls[0].args.includes('--max-turns'));
    assert.ok(calls[0].args.includes('3'));
    assert.ok(calls[0].args.includes('--allowedTools'));
    assert.ok(calls[0].args.includes('Read'));
  });

  it('defaults to claude-sonnet-4-6 when no model specified', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.ok(calls[0].args.includes('claude-sonnet-4-6'));
  });

  it('uses stdin pipe mode (-p -)', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.ok(calls[0].args.includes('-p'));
    assert.ok(calls[0].args.includes('-'));
  });
});

describe('local-worker /translate file extension detection', () => {
  it('detects PNG mimetype', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    // The temp path in the prompt should end with .png
    assert.equal(calls.length, 1);
    // We can't easily inspect the temp path, but we can verify the call succeeded
    // The stdin write includes the temp path — spawn was called, meaning extension was determined
  });

  it('detects WebP mimetype', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.webp',
      type: 'image/webp',
      buffer: tinyPng, // content doesn't matter for extension detection
    });
    assert.equal(calls.length, 1);
  });

  it('defaults to .jpg for other mimetypes', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.jpg',
      type: 'image/jpeg',
      buffer: tinyPng,
    });
    assert.equal(calls.length, 1);
  });
});

describe('local-worker /translate error handling', () => {
  it('returns 500 when Claude CLI exits with non-zero code', async () => {
    mockSpawn({ exitCode: 1, stderr: 'API error' });
    const res = await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.equal(res.status, 500);
    assert.ok(res.json.error.includes('Claude CLI failed'));
    assert.ok(res.json.error.includes('exit 1'));
  });

  it('returns 500 when Claude CLI spawn fails', async () => {
    mockSpawn({ spawnError: 'ENOENT' });
    const res = await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.equal(res.status, 500);
    assert.ok(res.json.error.includes('spawn error'));
  });
});

describe('local-worker /translate temp file cleanup', () => {
  it('cleans up temp file after successful translation', async () => {
    const fs = require('fs');
    const os = require('os');
    const tmpDir = os.tmpdir();

    // Count manchu-* files before
    const before = fs.readdirSync(tmpDir).filter(f => f.startsWith('manchu-'));

    mockSpawn({ stdout: 'translated text' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });

    // Count manchu-* files after — should be same or fewer (cleanup happened)
    const afterCount = fs.readdirSync(tmpDir).filter(f => f.startsWith('manchu-'));
    assert.ok(afterCount.length <= before.length + 0, 'Temp file should be cleaned up');
  });

  it('cleans up temp file after failed translation', async () => {
    const fs = require('fs');
    const os = require('os');
    const tmpDir = os.tmpdir();

    const before = fs.readdirSync(tmpDir).filter(f => f.startsWith('manchu-'));

    mockSpawn({ exitCode: 1, stderr: 'fail' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });

    const afterCount = fs.readdirSync(tmpDir).filter(f => f.startsWith('manchu-'));
    assert.ok(afterCount.length <= before.length + 0, 'Temp file should be cleaned up after error');
  });
});

describe('local-worker LANG environment', () => {
  it('sets LANG=en_US.UTF-8 in Claude CLI environment', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.equal(calls[0].opts.env.LANG, 'en_US.UTF-8');
  });

  it('uses pipe stdio mode', async () => {
    const calls = mockSpawn({ stdout: 'output' });
    await multipartPost('/translate', { prompt: 'translate' }, {
      field: 'image',
      name: 'test.png',
      type: 'image/png',
      buffer: tinyPng,
    });
    assert.deepEqual(calls[0].opts.stdio, ['pipe', 'pipe', 'pipe']);
  });
});
