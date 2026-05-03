# context.md — manchu-translator

Last Updated: 2026-04-15 — Translation breakout, OCR reliability, image enhancement

## Current State
- Translator is **online** via PM2 on VM ([VM_HOST]:3110)
- Claude CLI processing runs on **local WSL machine** (not the VM) via reverse SSH tunnel on port 3111
- If local machine is offline, returns 503 "temporarily unavailable"
- Two-pass pipeline: Structured OCR (Sonnet, JSON with bboxes) → Translation (Sonnet, XML tags)
- Translation tab now shows **separate Manchu and Chinese translations** with viability badge (HIGH/MEDIUM/LOW)
- Image enhancement pipeline (normalize + sharpen) applied before OCR, toggle in UI
- OCR prompt includes valid Mollendorf character reference, concrete examples, auto-retry on parse failure
- Post-parse romanization validation: lowercase enforcement, invalid char stripping, confidence downgrade
- Server-side image cropping via sharp using OCR bounding boxes
- Character Map returns structured array with base64 crop images per word
- Dictionary: Norman's Comprehensive Manchu-English Dictionary (20,599 entries)
- Dictionary match rate improved from ~6% to ~52% with clean OCR input
- Rate limiting: 10 requests/IP/hour, 100/day global
- Processing time: ~150 seconds per translation

## Architecture
```
VM (server) → reverse tunnel → WSL (local-worker) → Claude CLI
```
- `ecosystem.config.js` — VM PM2 config
- `ecosystem.worker.config.js` — Local PM2 config
- Tunnel: `~/bin/start-tunnel.sh`

## Open Work
- Bounding box accuracy varies — padding (18px) helps but some crops may include neighbors
- 75 tests passing (claude-cli, dictionary, image-cropper, prompt-builder, rate-limiter, server)

## Environment Notes
- **Deploy details:** see privateContext/infrastructure.md
- **Base path:** /manchu
- **Database:** none (stateless, dictionary loaded from JSON)
- **Node version:** 22.x

## Active Branch
`main`

Full session closeouts: see privateContext/deliverables/closeouts/
