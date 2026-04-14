const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_IP = 10;
const MAX_PER_DAY = 100;

const ipMap = new Map();
let dailyCount = 0;
let dailyReset = Date.now() + 24 * 60 * 60 * 1000;

function check(ip) {
  // Reset daily counter
  if (Date.now() > dailyReset) {
    dailyCount = 0;
    dailyReset = Date.now() + 24 * 60 * 60 * 1000;
  }

  if (dailyCount >= MAX_PER_DAY) {
    return { allowed: false, reason: 'Daily limit reached. Try again tomorrow.', retryAfter: Math.ceil((dailyReset - Date.now()) / 1000) };
  }

  const now = Date.now();
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

module.exports = { check };
