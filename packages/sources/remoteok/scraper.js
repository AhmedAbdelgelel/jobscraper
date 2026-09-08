'use strict';

const { BaseScraper } = require('@jobscrapper/core/base-scraper');
const { queryTokens, itemMatches, mapItem } = require('./parser');
const { normalize } = require('@jobscrapper/core/normalizer');
const { withRetry, fetchWithTimeout } = require('@jobscrapper/core/retry');
const { RateLimiter } = require('@jobscrapper/core/rate-limiter');
const { log } = require('@jobscrapper/core/logger');

class RemoteokScraper extends BaseScraper {
  constructor(cfg = {}) {
    super('remoteok', cfg);
    this.limiter = new RateLimiter({ delayMs: cfg.requestDelayMs || 1000 });
    this.ua = cfg.userAgent;
    this._cache = null;
  }
  buildSearchUrl() { return 'https://remoteok.com/api'; }
  async pool() {
    if (this._cache) return this._cache;
    await this.limiter.wait();
    const items = await withRetry(async () => {
      const res = await fetchWithTimeout('https://remoteok.com/api', { timeoutMs: this.cfg.timeoutMs || 15000, headers: { 'User-Agent': this.ua, Accept: 'application/json' } });
      if (!res.ok) { const e = new Error(`http ${res.status}`); e.status = res.status; throw e; }
      return res.json();
    }, { maxRetries: this.cfg.maxRetries || 5, onRetry: (r) => log('RETRY', { source: 'remoteok', ...r, error: String(r.error && r.error.message) }) });
    this._cache = (Array.isArray(items) ? items : []).filter((j) => j && j.id && j.position);
    return this._cache;
  }
  async search(query, { page = 0 } = {}) {
    if (page > 0) return [];
    const tokens = queryTokens(query);
    const limit = this.cfg.maxJobsPerQuery || 50;
    return (await this.pool()).filter((j) => itemMatches(j, tokens)).slice(0, limit)
      .map((j) => ({ ...mapItem(j), source: 'remoteok', remote: true }));
  }
  async scrapeJob(url) {
    const pool = await this.pool();
    const hit = pool.find((j) => { const m = mapItem(j); return m.url === url; });
    if (hit) return { ...mapItem(hit), source: 'remoteok', remote: true, url };
    return { title: '', company: '', location: 'Remote', description: '', url, sourceJobId: url, source: 'remoteok', remote: true };
  }
  normalize(rawJob) { return normalize({ ...rawJob, source: 'remoteok', remote: rawJob.remote ?? true }); }
}

module.exports = { RemoteokScraper };
