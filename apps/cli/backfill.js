'use strict';
// Re-fetches full descriptions for stored jobs whose description is
// short or page-chrome junk, then re-applies the active profile gate.
const { Repository } = require('@jobscrapper/storage/repository');
const { LinkedInScraper } = require('@jobscrapper/sources/linkedin/scraper');
const { passesFilters } = require('@jobscrapper/core/gate');
const { loadEnv } = require('@jobscrapper/config/env');
const { resolveActiveProfile } = require('@jobscrapper/config/store');
const { log } = require('@jobscrapper/core/logger');

function isJunk(d) {
  const s = String(d || '');
  return s.length < 800 || /Skip to main content|Join or sign in|Join now/.test(s);
}

async function main(argv = process.argv.slice(2)) {
  loadEnv();
  const profile = resolveActiveProfile(argv);
  const cfg = require('@jobscrapper/config/config').config;
  const r = new Repository({});
  const jobs = r.all();
  const refreshAll = argv.includes('--refresh');
  const targets = jobs.filter((j) => j.source === 'linkedin' && (refreshAll || isJunk(j.description)));
  console.log(`Backfill: ${targets.length}/${jobs.length} to (re)fetch`);
  const scraper = new LinkedInScraper({ ...cfg.sources.linkedin, ...cfg.scraping });
  const kept = [];
  const reasons = {};
  let refetched = 0;
  for (const j of jobs) {
    if (j.source === 'linkedin' && (refreshAll || isJunk(j.description))) {
      try {
        const raw = await scraper.scrapeJob(j.url);
        const nd = String(raw.description || '');
        if (nd.length > 500 && !isJunk(nd)) {
          j.description = nd;
          j.descriptionComplete = true;
          if (raw.title) j.title = raw.title;
          if (raw.company) j.company = raw.company;
          if (raw.location) j.location = raw.location;
          if (raw.employmentType) j.employmentType = raw.employmentType;
          refetched++;
        }
      } catch (e) {
        log('SCRAPE_FAILED', { source: 'linkedin', url: j.url, error: String(e && e.message) });
      }
    }
    const { normalize } = require('@jobscrapper/core/normalizer');
    const n = normalize(j);
    n.descriptionComplete = j.descriptionComplete;
    n.postedAt = j.postedAt || n.postedAt;
    n.scrapedAt = j.scrapedAt || n.scrapedAt;
    const g = passesFilters(n, profile);
    if (!g.accept) {
      const k = `${g.stage}:${g.reason}`;
      reasons[k] = (reasons[k] || 0) + 1;
      continue;
    }
    n.relevance = g.relevance;
    kept.push(n);
  }
  r.replaceAll(kept);
  console.log(`Backfill [${profile.name}]: refetched ${refetched}, kept ${kept.length}/${jobs.length}`, reasons);
  r.close();
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { main, isJunk };
