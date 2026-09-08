'use strict';

const { BaseScraper } = require('@jobscrapper/core/base-scraper');
const { queryTokens, itemMatches, mapItem } = require('./parser');
const { normalize } = require('@jobscrapper/core/normalizer');
const { withRetry, fetchWithTimeout } = require('@jobscrapper/core/retry');
const { RateLimiter } = require('@jobscrapper/core/rate-limiter');
const { log } = require('@jobscrapper/core/logger');

class ArbeitnowScraper extends BaseScraper {
  constructor(cfg = {}) {
    super('arbeitnow', cfg);
    this.limiter = new RateLimiter({ delayMs: cfg.requestDelayMs || 1000 });
    this.ua = cfg.userAgent;
    this._cache = null;
  }
  buildSearchUrl() { return 'https://www.arbeitnow.com/api/job-board-api'; }
  async pool(maxPages) {
    if (this._cache) return this._cache;
    const all = [];
    let url = 'https://www.arbeitnow.com/api/job-board-api';
    for (let p = 0; p < (maxPages || 5) && url; p++) {
      await this.limiter.wait();
      const page = await withRetry(async () => {
        const res = await fetchWithTimeout(url, { timeoutMs: this.cfg.timeoutMs || 15000, headers: { 'User-Agent': this.ua, Accept: 'application/json' } });
        if (!res.ok) { const e = new Error(`http ${res.status}`); e.status = res.status; throw e; }
        return res.json();
      }, { maxRetries: this.cfg.maxRetries || 5, onRetry: (r) => log('RETRY', { source: 'arbeitnow', ...r, error: String(r.error && r.error.message) }) });
      if (Array.isArray(page.data)) all.push(...page.data);
      url = page.links && page.links.next ? page.links.next : null;
    }
    this._cache = all;
    return all;
  }
  async search(query, { page = 0 } = {}) {
    if (page > 0) return [];
    const tokens = queryTokens(query);
    const limit = this.cfg.maxJobsPerQuery || 50;
    return (await this.pool(this.cfg.maxPages)).filter((j) => itemMatches(j, tokens)).slice(0, limit)
      .map((j) => ({ ...mapItem(j), source: 'arbeitnow' }));
  }
  async scrapeJob(url) {
    const pool = await this.pool(this.cfg.maxPages);
    const hit = pool.find((j) => mapItem(j).url === url);
    if (hit) return { ...mapItem(hit), source: 'arbeitnow', url };
    return { title: '', company: '', location: '', description: '', url, sourceJobId: url, source: 'arbeitnow' };
  }
  normalize(rawJob) { return normalize({ ...rawJob, source: 'arbeitnow' }); }
}

module.exports = { ArbeitnowScraper };
