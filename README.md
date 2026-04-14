# Manchu Document Translator

AI-powered OCR and translation tool for historical Manchu manuscripts. Upload a document image and get structured output: character-by-character breakdown, romanization, word-by-word analysis, and full English translation.

**Live demo available** — see the hosted instance for a working example.

## How It Works

The tool uses a two-pass Claude CLI pipeline to process Manchu document images:

### Pass 1 — OCR (Claude Haiku)
The uploaded image is written to a temp file on the server. The app shells out to `claude -p` (Claude Code CLI in print mode) with `--allowedTools Read`, instructing the model to read the image via the Read tool and extract all Manchu text as Möllendorf romanization. Haiku is used here for speed — this pass takes ~20-30 seconds.

### Dictionary Lookup
The romanized words from Pass 1 are matched against Jerry Norman's *Comprehensive Manchu-English Dictionary* (20,599 entries, pre-parsed to JSON). A suffix-stripping algorithm removes known Manchu grammatical suffixes (-mbi, -me, -fi, -ha, -be, -de, -ci, -ngge, etc.) to find root word matches, since Manchu is agglutinative.

### Pass 2 — Translation (Claude Sonnet)
The image is sent again, this time with a rich prompt containing:
- Manchu grammar reference (case system, verb morphology, SOV word order)
- Matched dictionary entries from the Norman Dictionary
- The Pass 1 OCR output as a reference
- Instructions for structured output with XML tags

Sonnet produces: OCR text, character-by-character mapping (Manchu → romanization → Chinese → English), full romanization, word-by-word analysis, English translation, Chinese text transcription, and confidence notes.

### No API Key Required
The backend uses `claude -p` (Claude Code CLI) with OAuth session auth, not the Anthropic SDK. This means it runs on an existing Claude Max subscription with no separate API key setup.

## Architecture

```
Browser → Apache (SSL/proxy) → Express.js (port 3110) → Claude CLI → stdout → JSON response
```

- **Express.js** server with multer for image upload (10MB max)
- **sharp** for image resizing (caps at 2048px before sending to Claude)
- **Claude CLI** spawned via `child_process.spawn`, prompt piped via stdin
- **PM2** process manager with 200MB memory limit
- **Apache** reverse proxy with 5-minute ProxyTimeout for long translations
- **Rate limiting**: 10 requests/IP/hour, 100/day global (in-memory)
- No database, no sessions, no auth — stateless public tool

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS, dark theme, drag-and-drop upload |
| Backend | Node.js + Express |
| AI | Claude CLI (`claude -p`) — Haiku for OCR, Sonnet for translation |
| Dictionary | Norman Manchu-English Dictionary (20,599 entries, JSON) |
| Hosting | GCP VM (Debian), Apache reverse proxy, PM2, Let's Encrypt SSL |
| Font | Noto Sans Mongolian (Google Fonts) for Manchu script rendering |

## Project Structure

```
server.js                  Express app, /manchu basePath
ecosystem.config.js        PM2 config
lib/
  claude-cli.js            Spawns claude CLI, pipes prompt via stdin, parses XML response
  dictionary.js            Loads Norman Dictionary JSON, suffix-stripping word lookup
  prompt-builder.js        Assembles OCR and translation prompts with grammar context
  rate-limiter.js          IP-based + global daily cap
data/
  norman-dictionary.json   Pre-processed dictionary (parsed from Jerry_Norman_Dict.txt)
public/
  index.html               Single-page app with upload zone and tabbed results
  style.css                Dark theme, responsive, character map table styling
  app.js                   Upload handling, example loading, result rendering
  examples/                Two sample Manchu-Chinese bilingual manuscript pages
```

## Running Locally

```bash
npm install
cp .env.example .env
node server.js
# Visit http://localhost:3110/manchu/
```

Requires `claude` CLI installed and authenticated.

## Resources

This project builds on:
- [Norman Manchu-English Dictionary](https://github.com/purobaburi/manchu-resources) — lexical data
- [ManchuAI-OCR](https://github.com/mic7ch1/ManchuAI-OCR) — research on fine-tuned VLMs for Manchu OCR
- [Manchu In-Context MT (ACL 2025)](https://github.com/cisnlp/manchu-in-context-mt) — prompt design for Manchu translation
- [HKUST Manchu OCR Project](https://digitalhumanities.hkust.edu.hk/manchu-ocr-and-translation-ai/) — ongoing academic OCR+translation pipeline
