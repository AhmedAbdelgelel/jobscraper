'use strict';

class BaseScraper {
  constructor(source, cfg = {}) {
    this.source = source;
    this.cfg = cfg;
  }
  buildSearchUrl(query, page) { throw new Error('not implemented'); }
  async search(query, options) { throw new Error('not implemented'); }
  async scrapeJob(url) { throw new Error('not implemented'); }
  normalize(rawJob) { throw new Error('not implemented'); }
}

module.exports = { BaseScraper };
