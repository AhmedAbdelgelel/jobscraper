'use strict';

const { BaseScraper } = require('@jobscrapper/core/base-scraper');
const { parseSearchPage, parseJobPage } = require('./parser');
const { normalize } = require('@jobscrapper/core/normalizer');
const { withRetry, fetchWithTimeout } = require('@jobscrapper/core/retry');
const { RateLimiter } = require('@jobscrapper/core/rate-limiter');
const { log } = require('@jobscrapper/core/logger');

class IndeedScraper extends BaseScraper {
  constructor(cfg = {}) {
    super('indeed', cfg);
    this.limiter = new RateLimiter({ delayMs: cfg.requestDelayMs || 1500 });
    this.ua = cfg.userAgent;
  }
  buildSearchUrl(query, page = 0, location = '', workType = '') {
    const loc = location ? `&l=${encodeURIComponent(location)}` : '';
    return `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}${loc}&start=${page * 10}`;
  }
  async fetchHtml(url) {
    await this.limiter.wait();
    return withRetry(async () => {
      const res = await fetchWithTimeout(url, { timeoutMs: this.cfg.timeoutMs || 15000, headers: { 'User-Agent': this.ua, Accept: 'text/html' } });
      if (res.status === 429) { this.limiter.backoff(); const e = new Error('rate limited 429'); e.status = 429; throw e; }
      if (res.status === 403) { const e = new Error('blocked 403'); e.status = 403; throw e; }
      if (!res.ok) { const e = new Error(`http ${res.status}`); e.status = res.status; throw e; }
      this.limiter.relax();
      return res.text();
    }, { maxRetries: this.cfg.maxRetries || 5, onRetry: (r) => log('RETRY', { source: 'indeed', url, ...r, error: String(r.error && r.error.message) }) });
  }
  async search(query, { page = 0, location = '', workType = '' } = {}) {
    const url = this.buildSearchUrl(query, page, location, workType);
    const html = await this.fetchHtml(url);
    return parseSearchPage(html).map((j) => ({ ...j, source: 'indeed' }));
  }
  async scrapeJob(url) {
    const html = await this.fetchHtml(url);
    return { ...parseJobPage(html, url), source: 'indeed' };
  }
  normalize(rawJob) { return normalize({ ...rawJob, source: 'indeed' }); }
}

module.exports = { IndeedScraper };
