# context.md — manchu-translator

Last Updated: 2026-04-14 — Increased Claude CLI timeout to 10 minutes, Apache ProxyTimeout to 660s

## Current State
- Translator is **online** via PM2
- Two-pass pipeline: OCR (Haiku) → Translation (Sonnet) via Claude CLI
- Dictionary: Norman's Comprehensive Manchu-English Dictionary (20,599 entries)
- Rate limiting: 10 requests/IP/hour, 100/day global
- Recent fix: timeout was 3 minutes, causing Sonnet translation pass to fail on large manuscript images. Now 10 minutes.

## Open Work
- Monitor whether 10-minute timeout is sufficient for very large images
- One user request returned only 28 chars — may need prompt tuning for certain image types
- No automated tests

## Environment Notes
- **Deploy target:** GCP VM
- **SSH user / host:** see privateContext
- **Process manager:** PM2 (`manchu-translator`)
- **Port:** 3110
- **Web server config:** `/etc/apache2/sites-enabled/wordpress-https.conf` (ProxyPass /manchu/ → 127.0.0.1:3110, ProxyTimeout 660)
- **Base path:** /manchu
- **Database:** none (stateless, dictionary loaded from JSON)
- **Node version:** 22.x

## Active Branch
`main`

Full session closeout: privateContext/deliverables/closeouts/2026-04-14-manchu-timeout-fix.md
