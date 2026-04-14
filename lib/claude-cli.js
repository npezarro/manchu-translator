const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_BIN = 'claude';
const TIMEOUT_MS = 180_000; // 3 minutes

function callClaude(imageBuffer, mimeType, prompt, model = 'claude-sonnet-4-6') {
  return new Promise((resolve, reject) => {
    // Write image to temp file
    const ext = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : '.jpg';
    const tmpPath = path.join(os.tmpdir(), `manchu-${Date.now()}${ext}`);
    fs.writeFileSync(tmpPath, imageBuffer);

    // Prepend instruction to read the image file
    const fullPrompt = `First, use the Read tool to view the image at ${tmpPath}. Then:\n\n${prompt}`;

    const args = [
      '-p', '-',
      '--model', model,
      '--output-format', 'text',
      '--max-turns', '2',
      '--allowedTools', 'Read'
    ];

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(CLAUDE_BIN, args, {
      env: { ...process.env, LANG: 'en_US.UTF-8' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, TIMEOUT_MS);

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      try { fs.unlinkSync(tmpPath); } catch {}

      if (timedOut) {
        return reject(new Error('Claude CLI timed out'));
      }
      if (code !== 0) {
        console.error('Claude CLI exit code:', code);
        if (stderr) console.error('stderr:', stderr.substring(0, 500));
        return reject(new Error(`Claude CLI failed with exit code ${code}`));
      }
      resolve(stdout.trim());
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      try { fs.unlinkSync(tmpPath); } catch {}
      reject(new Error(`Claude CLI spawn error: ${err.message}`));
    });

    // Pipe prompt via stdin
    child.stdin.write(fullPrompt);
    child.stdin.end();
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

  // If no XML tags found, treat entire response as translation
  if (!sections.translation && !sections.ocr) {
    sections.translation = raw;
    sections.notes = 'Response was not in structured format — showing raw output.';
  }

  return sections;
}

module.exports = { callClaude, parseResponse };
