const http = require('http');

// Worker URL — tunnel port 3111 on VM maps to local WSL worker
const WORKER_HOST = process.env.WORKER_HOST || '127.0.0.1';
const WORKER_PORT = parseInt(process.env.WORKER_PORT || '3111', 10);
const WORKER_TIMEOUT_MS = 600_000;

/**
 * Check if the local worker is reachable via /health
 */
function checkWorkerHealth() {
  return new Promise(resolve => {
    const req = http.get({ host: WORKER_HOST, port: WORKER_PORT, path: '/health', timeout: 3000 }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Send translation work to the local worker.
 * Returns the Claude output text, or throws if worker is unavailable.
 */
function callClaude(imageBuffer, mimeType, prompt, model = 'claude-sonnet-4-6') {
  return new Promise(async (resolve, reject) => {
    const healthy = await checkWorkerHealth();
    if (!healthy) {
      return reject(new Error('WORKER_UNAVAILABLE'));
    }

    const boundary = `----ManchuBoundary${Date.now()}`;
    const ext = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : '.jpg';
    const filename = `image${ext}`;

    const parts = [];

    // Image part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    );
    parts.push(imageBuffer);
    parts.push('\r\n');

    // Prompt part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
      `${prompt}\r\n`
    );

    // Model part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${model}\r\n`
    );

    parts.push(`--${boundary}--\r\n`);

    let contentLength = 0;
    const buffers = parts.map(p => {
      const buf = Buffer.isBuffer(p) ? p : Buffer.from(p, 'utf-8');
      contentLength += buf.length;
      return buf;
    });
    const body = Buffer.concat(buffers, contentLength);

    const options = {
      host: WORKER_HOST,
      port: WORKER_PORT,
      path: '/translate',
      method: 'POST',
      timeout: WORKER_TIMEOUT_MS,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.output) {
            resolve(parsed.output);
          } else {
            reject(new Error(parsed.error || `Worker returned ${res.statusCode}`));
          }
        } catch {
          reject(new Error(`Invalid worker response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', err => reject(new Error(`Worker connection error: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Worker request timed out')); });

    req.write(body);
    req.end();
  });
}

function parseResponse(raw) {
  const sections = {};
  const tags = ['OCR', 'CharacterMap', 'Romanization', 'WordByWord', 'Translation', 'ChineseText', 'Notes'];

  for (const tag of tags) {
    const regex = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i');
    const match = raw.match(regex);
    sections[tag.toLowerCase()] = match ? match[1].trim() : '';
  }

  if (!sections.translation && !sections.ocr) {
    sections.translation = raw;
    sections.notes = 'Response was not in structured format — showing raw output.';
  }

  return sections;
}

module.exports = { callClaude, parseResponse, checkWorkerHealth };
