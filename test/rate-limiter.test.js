const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// rate-limiter uses module-level state (ipMap, dailyCount, dailyReset).
// We need a fresh module for each test suite to avoid cross-contamination.
function freshRequire() {
  const modPath = require.resolve('../lib/rate-limiter');
  delete require.cache[modPath];
  return require(modPath);
}

describe('rate-limiter', () => {
  describe('basic allow/deny', () => {
    it('allows first request', () => {
      const rl = freshRequire();
      const result = rl.check('1.2.3.4');
      assert.equal(result.allowed, true);
    });

    it('allows up to 10 requests from the same IP', () => {
      const rl = freshRequire();
      for (let i = 0; i < 10; i++) {
        const result = rl.check('1.2.3.4');
        assert.equal(result.allowed, true, `request ${i + 1} should be allowed`);
      }
    });

    it('blocks 11th request from the same IP', () => {
      const rl = freshRequire();
      for (let i = 0; i < 10; i++) rl.check('1.2.3.4');
      const result = rl.check('1.2.3.4');
      assert.equal(result.allowed, false);
      assert.ok(result.reason.includes('Rate limit'));
      assert.ok(typeof result.retryAfter === 'number');
      assert.ok(result.retryAfter > 0);
    });
  });

  describe('per-IP isolation', () => {
    it('tracks IPs independently', () => {
      const rl = freshRequire();
      for (let i = 0; i < 10; i++) rl.check('1.1.1.1');
      // 1.1.1.1 is exhausted, but 2.2.2.2 should still be allowed
      assert.equal(rl.check('1.1.1.1').allowed, false);
      assert.equal(rl.check('2.2.2.2').allowed, true);
    });
  });

  describe('daily limit', () => {
    it('blocks after 100 total requests across all IPs', () => {
      const rl = freshRequire();
      // Use 10 different IPs, 10 requests each = 100
      for (let ip = 0; ip < 10; ip++) {
        for (let req = 0; req < 10; req++) {
          const r = rl.check(`10.0.0.${ip}`);
          assert.equal(r.allowed, true, `ip=${ip} req=${req} should be allowed`);
        }
      }
      // 101st request from a new IP should be blocked by daily limit
      const blocked = rl.check('10.0.1.0');
      assert.equal(blocked.allowed, false);
      assert.ok(blocked.reason.includes('Daily limit'));
      assert.ok(typeof blocked.retryAfter === 'number');
    });
  });

  describe('retryAfter', () => {
    it('returns positive retryAfter on IP rate limit', () => {
      const rl = freshRequire();
      for (let i = 0; i < 10; i++) rl.check('5.5.5.5');
      const result = rl.check('5.5.5.5');
      assert.equal(result.allowed, false);
      // retryAfter should be roughly 3600 seconds (1 hour window)
      assert.ok(result.retryAfter > 3500);
      assert.ok(result.retryAfter <= 3600);
    });
  });
});
