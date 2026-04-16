/**
 * Local translation worker — runs on WSL, accepts translation requests over HTTP,
 * executes Claude CLI locally instead of on the VM.
 */
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.WORKER_PORT || 3111;
const CLAUDE_BIN = 'claude';
const TIMEOUT_MS = 600_000;

// Overridable dependencies for testing
const _deps = { spawn };

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', host: os.hostname(), uptime: process.uptime() });
});

// Translation endpoint — accepts image + prompt + model
app.post('/translate', upload.single('image'), async (req, res) => {
  req.setTimeout(TIMEOUT_MS);
  res.setTimeout(TIMEOUT_MS);

  if (!req.file) return res.status(400).json({ error: 'No image' });

  const { prompt, model } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt' });

  const useModel = model || 'claude-sonnet-4-6';
  const ext = req.file.mimetype.includes('png') ? '.png' : req.file.mimetype.includes('webp') ? '.webp' : '.jpg';
  const tmpPath = path.join(os.tmpdir(), `manchu-${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tmpPath, req.file.buffer);
    console.log(`[${new Date().toISOString()}] Processing: model=${useModel}, size=${(req.file.size / 1024).toFixed(0)}KB`);

    const result = await runClaude(tmpPath, prompt, useModel);
    console.log(`  Done: ${result.length} chars`);
    res.json({ output: result });
  } catch (err) {
    console.error('Worker error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
});

function runClaude(imagePath, prompt, model) {
  return new Promise((resolve, reject) => {
    const fullPrompt = `First, use the Read tool to view the image at ${imagePath}. Then:\n\n${prompt}`;
    const args = ['-p', '-', '--model', model, '--output-format', 'text', '--max-turns', '3', '--allowedTools', 'Read'];

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = _deps.spawn(CLAUDE_BIN, args, {
      env: { ...process.env, LANG: 'en_US.UTF-8' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, TIMEOUT_MS);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('Claude CLI timed out'));
      if (code !== 0) {
        console.error('Claude CLI exit code:', code, stderr.substring(0, 300));
        return reject(new Error(`Claude CLI failed (exit ${code})`));
      }
      resolve(stdout.trim());
    });

    child.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`Claude CLI spawn error: ${err.message}`));
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Manchu translation worker on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
module.exports._deps = _deps;
