'use strict';

// Adding a source? Implement BaseScraper (see @jobscrapper/core/base-scraper),
// put it in packages/sources/<name>/{scraper,parser,selectors}.js,
// register it here with parser fixtures + tests. Done.
const { LinkedInScraper } = require('./linkedin/scraper');
const { WuzzufScraper } = require('./wuzzuf/scraper');
const { IndeedScraper } = require('./indeed/scraper');
const { GlassdoorScraper } = require('./glassdoor/scraper');
const { RemoteokScraper } = require('./remoteok/scraper');
const { ArbeitnowScraper } = require('./arbeitnow/scraper');
const { RemotiveScraper } = require('./remotive/scraper');

const SOURCES = [
  { key: 'linkedin', name: 'LinkedIn', type: 'html', loginRequired: false, factory: (cfg) => new LinkedInScraper(cfg) },
  { key: 'wuzzuf', name: 'Wuzzuf', type: 'html+sitemap', loginRequired: false, factory: (cfg) => new WuzzufScraper(cfg) },
  { key: 'indeed', name: 'Indeed', type: 'html', loginRequired: false, factory: (cfg) => new IndeedScraper(cfg) },
  { key: 'glassdoor', name: 'Glassdoor', type: 'html', loginRequired: false, factory: (cfg) => new GlassdoorScraper(cfg) },
  { key: 'remoteok', name: 'RemoteOK', type: 'api', loginRequired: false, factory: (cfg) => new RemoteokScraper(cfg) },
  { key: 'arbeitnow', name: 'Arbeitnow', type: 'api', loginRequired: false, factory: (cfg) => new ArbeitnowScraper(cfg) },
  { key: 'remotive', name: 'Remotive', type: 'api', loginRequired: false, factory: (cfg) => new RemotiveScraper(cfg) },
];

function buildScrapers(cfg) {
  return SOURCES
    .filter((s) => !cfg.sources || !cfg.sources[s.key] || cfg.sources[s.key].enabled !== false)
    .map((s) => ({ meta: s, scraper: s.factory({ ...(cfg.sources && cfg.sources[s.key]), ...cfg.scraping }) }));
}

module.exports = { SOURCES, buildScrapers };
