'use strict';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

class RateLimiter {
  constructor({ delayMs = 1200, minMs = 500, maxMs = 5000 } = {}) {
    this.delay = delayMs; this.min = minMs; this.max = maxMs; this.last = 0;
  }
  async wait() {
    const now = Date.now();
    const elapsed = now - this.last;
    const jitter = Math.floor(Math.random() * 300);
    const waitFor = Math.max(0, this.delay + jitter - elapsed);
    if (waitFor > 0) await sleep(waitFor);
    this.last = Date.now();
  }
  backoff() { this.delay = Math.min(this.max, this.delay * 2); }
  relax() { this.delay = Math.max(this.min, Math.floor(this.delay * 0.9)); }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

module.exports = { RateLimiter, mapPool, sleep };
