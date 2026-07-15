const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_IP = 10;
const MAX_PER_DAY = 100;
const SWEEP_INTERVAL_MS = WINDOW_MS; // prune expired IP entries at most once per window

const ipMap = new Map();
let dailyCount = 0;
let dailyReset = Date.now() + 24 * 60 * 60 * 1000;
let lastSweep = Date.now();

// Remove IP entries whose rate-limit window has fully expired. On a long-running
// server ipMap would otherwise only ever grow (one entry per unique IP, kept
// forever), a slow memory leak. Reset happens per-IP on access, so evicting
// expired entries is behaviour-preserving — a returning IP is recreated fresh.
function sweep(now) {
  for (const [ip, entry] of ipMap) {
    if (now - entry.windowStart > WINDOW_MS) ipMap.delete(ip);
  }
  lastSweep = now;
}

function check(ip) {
  const now = Date.now();

  // Opportunistically evict stale entries (gated to at most once per window).
  if (now - lastSweep > SWEEP_INTERVAL_MS) sweep(now);

  // Reset daily counter
  if (now > dailyReset) {
    dailyCount = 0;
    dailyReset = now + 24 * 60 * 60 * 1000;
  }

  if (dailyCount >= MAX_PER_DAY) {
    return { allowed: false, reason: 'Daily limit reached. Try again tomorrow.', retryAfter: Math.ceil((dailyReset - now) / 1000) };
  }

  let entry = ipMap.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    ipMap.set(ip, entry);
  }

  if (entry.count >= MAX_PER_IP) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, reason: `Rate limit: ${MAX_PER_IP} requests per hour. Try again in ${Math.ceil(retryAfter / 60)} minutes.`, retryAfter };
  }

  entry.count++;
  dailyCount++;
  return { allowed: true };
}

// Number of IPs currently tracked. Exposed for monitoring and tests that verify
// stale entries are evicted rather than accumulating.
function size() {
  return ipMap.size;
}

module.exports = { check, size };
