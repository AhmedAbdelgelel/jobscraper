'use strict';

const { BaseScraper } = require('@jobscrapper/core/base-scraper');
const { mapItem } = require('./parser');
const { normalize } = require('@jobscrapper/core/normalizer');
const { withRetry, fetchWithTimeout } = require('@jobscrapper/core/retry');
const { RateLimiter } = require('@jobscrapper/core/rate-limiter');
const { log } = require('@jobscrapper/core/logger');

class RemotiveScraper extends BaseScraper {
  constructor(cfg = {}) {
    super('remotive', cfg);
    this.limiter = new RateLimiter({ delayMs: cfg.requestDelayMs || 1000 });
    this.ua = cfg.userAgent;
    this._cache = new Map();
  }
  buildSearchUrl(query) {
    return `https://remotive.com/api/remote-jobs?category=software-dev&search=${encodeURIComponent(query)}&limit=50`;
  }
  async search(query, { page = 0 } = {}) {
    if (page > 0) return [];
    await this.limiter.wait();
    const url = this.buildSearchUrl(query);
    const body = await withRetry(async () => {
      const res = await fetchWithTimeout(url, { timeoutMs: this.cfg.timeoutMs || 15000, headers: { 'User-Agent': this.ua, Accept: 'application/json' } });
      if (!res.ok) { const e = new Error(`http ${res.status}`); e.status = res.status; throw e; }
      return res.json();
    }, { maxRetries: this.cfg.maxRetries || 5, onRetry: (r) => log('RETRY', { source: 'remotive', url, ...r, error: String(r.error && r.error.message) }) });
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    const limit = this.cfg.maxJobsPerQuery || 50;
    return jobs.slice(0, limit).map((j) => {
      const m = { ...mapItem(j), source: 'remotive', remote: true };
      this._cache.set(m.url, m);
      return m;
    });
  }
  async scrapeJob(url) {
    if (this._cache.has(url)) return { ...this._cache.get(url), url };
    return { title: '', company: '', location: 'Remote', description: '', url, sourceJobId: url, source: 'remotive', remote: true };
  }
  normalize(rawJob) { return normalize({ ...rawJob, source: 'remotive', remote: rawJob.remote ?? true }); }
}

module.exports = { RemotiveScraper };
