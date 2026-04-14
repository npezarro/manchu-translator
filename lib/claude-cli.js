const { execFile } = require('child_process');
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
      '-p', fullPrompt,
      '--model', model,
      '--output-format', 'text',
      '--max-turns', '2',
      '--allowedTools', 'Read'
    ];

    execFile(CLAUDE_BIN, args, {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 5, // 5MB output buffer
      env: { ...process.env, LANG: 'en_US.UTF-8' }
    }, (err, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpPath); } catch {}

      if (err) {
        console.error('Claude CLI error:', err.message);
        if (stderr) console.error('stderr:', stderr.substring(0, 500));
        return reject(new Error(`Claude CLI failed: ${err.message}`));
      }
      resolve(stdout.trim());
    });
  });
}

function parseResponse(raw) {
  const sections = {};
  const tags = ['OCR', 'Romanization', 'WordByWord', 'Translation', 'ChineseText', 'Notes'];

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
