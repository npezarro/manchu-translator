# context.md — manchu-translator

Last Updated: 2026-04-15 — Major pipeline restructure: VM offload, structured OCR, character image crops

## Current State
- Translator is **online** via PM2 on VM ([VM_HOST]:3110)
- Claude CLI processing runs on **local WSL machine** (not the VM) via reverse SSH tunnel on port 3111
- If local machine is offline, returns 503 "temporarily unavailable"
- Two-pass pipeline: Structured OCR (Sonnet, JSON with bboxes) → Translation (Sonnet, XML tags)
- Server-side image cropping via sharp using OCR bounding boxes
- Character Map returns structured array with base64 crop images per word
- Dictionary: Norman's Comprehensive Manchu-English Dictionary (20,599 entries)
- Dictionary match rate improved from ~6% to ~52% with clean OCR input
- Rate limiting: 10 requests/IP/hour, 100/day global
- Processing time: ~150 seconds per translation

## Architecture
```
VM (server.js:3110) → reverse tunnel → WSL (local-worker.js:3111) → Claude CLI
```
- `ecosystem.config.js` — VM PM2 config (port 3110, 200MB limit)
- `ecosystem.worker.config.js` — Local PM2 config (port 3111, 500MB limit)
- Tunnel: `~/bin/start-tunnel.sh` with `-R 3111:127.0.0.1:3111`

## Open Work
- Tests in `test/` are outdated — need updating for new parseOcrResponse/parseTranslationResponse APIs
- `gcloud compute` CLI has billing API issue on project [GCP_PROJECT]
- Could add "full image" modal to character map cards
- Bounding box accuracy varies — padding helps but some crops may include neighbors

## Environment Notes
- **Deploy target:** GCP VM ([VM_HOST])
- **Process manager:** PM2 (`manchu-translator` on VM, `manchu-worker` on local)
- **Port:** 3110 (VM server), 3111 (local worker)
- **Web server config:** `/etc/apache2/sites-enabled/wordpress-https.conf` (ProxyPass /manchu/ → 127.0.0.1:3110, ProxyTimeout 660)
- **Base path:** /manchu
- **Database:** none (stateless, dictionary loaded from JSON)
- **Node version:** 22.x

## Active Branch
`main`

Full session closeout: privateContext/deliverables/closeouts/2026-04-15-manchu-pipeline-restructure.md
