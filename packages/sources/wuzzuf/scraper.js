'use strict';

const { BaseScraper } = require('@jobscrapper/core/base-scraper');
const { parseSearchPage, parseJobPage } = require('./parser');
const { normalize } = require('@jobscrapper/core/normalizer');
const { withRetry, fetchWithTimeout } = require('@jobscrapper/core/retry');
const { RateLimiter } = require('@jobscrapper/core/rate-limiter');
const { log } = require('@jobscrapper/core/logger');

class WuzzufScraper extends BaseScraper {
  constructor(cfg = {}) {
    super('wuzzuf', cfg);
    this.limiter = new RateLimiter({ delayMs: cfg.requestDelayMs || 1200 });
    this.ua = cfg.userAgent;
  }
  buildSearchUrl(query, page = 0) {
    // NOTE: /search/jobs/ answers 403 to automated clients (documented
    // limitation — no bypass attempted). Discovery uses public browse pages;
    // strict relevance/experience filtering still applies per job.
    return 'https://wuzzuf.net/jobs/egypt';
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
    }, { maxRetries: this.cfg.maxRetries || 5, onRetry: (r) => log('RETRY', { source: 'wuzzuf', url, ...r, error: String(r.error && r.error.message) }) });
  }
  async sitemapUrls() {
    if (this._sitemapCache) return this._sitemapCache;
    const { SITEMAPS } = require('./parser');
    const urls = [];
    for (const sm of SITEMAPS) {
      try {
        await this.limiter.wait();
        const xml = await withRetry(async () => {
          const res = await fetchWithTimeout(sm, { timeoutMs: this.cfg.timeoutMs || 15000, headers: { 'User-Agent': this.ua } });
          if (!res.ok) { const e = new Error(`http ${res.status}`); e.status = res.status; throw e; }
          return res.text();
        }, { maxRetries: 3 });
        for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1]);
      } catch (e) {
        log('SCRAPE_FAILED', { source: 'wuzzuf', url: sm, error: String(e && e.message) });
      }
    }
    this._sitemapCache = urls;
    return urls;
  }
  async search(query, { page = 0 } = {}) {
    if (page > 0) return [];
    const { filterSitemapUrls } = require('./parser');
    const limit = this.cfg.maxJobsPerQuery || 50;
    try {
      const urls = await this.sitemapUrls();
      const hits = filterSitemapUrls(urls, query, limit);
      if (hits.length) return hits.map((j) => ({ ...j, source: 'wuzzuf' }));
    } catch (e) {
      log('SCRAPE_FAILED', { source: 'wuzzuf', query, error: String(e && e.message) });
    }
    const url = this.buildSearchUrl(query, page);
    const html = await this.fetchHtml(url);
    return parseSearchPage(html).map((j) => ({ ...j, source: 'wuzzuf' }));
  }
  async scrapeJob(url) {
    const html = await this.fetchHtml(url);
    return { ...parseJobPage(html, url), source: 'wuzzuf' };
  }
  normalize(rawJob) { return normalize({ ...rawJob, source: 'wuzzuf' }); }
}

module.exports = { WuzzufScraper };
