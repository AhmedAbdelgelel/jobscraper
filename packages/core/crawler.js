'use strict';

const { log } = require('./logger');
const { Deduplicator } = require('./deduplicator');
const { passesFilters, titlePrefilter } = require('./gate');
const { mapPool } = require('./rate-limiter');

async function crawlSource(scraper, queries, { maxPages = 10, maxJobsPerQuery = 50, concurrency = 3, repository = null, dryRun = false, maxExp = 2, remoteQueries = [], remoteLocation = 'Remote', locations = [], profile = {} } = {}) {
  const stats = { source: scraper.source, queries: queries.length, found: 0, relevant: 0, saved: 0, duplicates: 0, failed: 0, filtered: 0 };
  const dedup = new Deduplicator();
  const seenInRun = new Set();
  const rounds = [{ queries, location: '', workType: '' }];
  if (remoteQueries.length) rounds.push({ queries: remoteQueries, location: '', workType: '2' });
  for (const loc of locations) rounds.push({ queries, location: loc, workType: '' });
  log('SCRAPE_STARTED', { source: scraper.source, queries: queries.length, remoteQueries: remoteQueries.length });
  for (const round of rounds) {
  for (const query of round.queries) {
    log('SEARCH_STARTED', { source: scraper.source, query, location: round.location, workType: round.workType });
    let collected = [];
    for (let page = 0; page < maxPages; page++) {
      let items;
      try {
        items = await scraper.search(query, { page, location: round.location, workType: round.workType });
        log('PAGE_FETCHED', { source: scraper.source, query, page, count: items.length });
      } catch (err) {
        log('SCRAPE_FAILED', { source: scraper.source, query, page, error: String(err && err.message) });
        stats.failed++;
        break;
      }
      if (!items.length) break;
      collected.push(...items);
      if (collected.length >= maxJobsPerQuery) { collected = collected.slice(0, maxJobsPerQuery); break; }
      if (items.length < 5) break;
    }
    stats.found += collected.length;
    await mapPool(collected, concurrency, async (item) => {
      try {
        if (repository && repository.isProcessed && repository.isProcessed(scraper.source, item.sourceJobId || item.url)) { stats.duplicates++; log('JOB_DUPLICATE', { source: scraper.source, url: item.url }); return; }
        const { canonicalizeUrl: _cu } = require('./url-normalizer');
        const runKey = `${scraper.source}:${item.sourceJobId ? String(item.sourceJobId) : _cu(item.url)}`;
        if (seenInRun.has(runKey)) { stats.duplicates++; log('JOB_DUPLICATE', { source: scraper.source, url: item.url }); return; }
        seenInRun.add(runKey);
        if (item.title && item.title.trim().length >= 4) {
          const preReason = titlePrefilter(item.title, profile);
          if (preReason) { stats.filtered++; log('JOB_FILTERED', { source: scraper.source, url: item.url, reason: preReason, stage: 'title' }); return; }
        }
        let raw;
        let fullDesc = false;
        try { raw = await scraper.scrapeJob(item.url); fullDesc = !!(raw && raw.description && raw.description.length > 500); }
        catch { raw = item; }
        raw.title = raw.title || item.title; raw.company = raw.company || item.company; raw.location = raw.location || item.location;
        raw.postedAt = raw.postedAt || item.postedAt || null; raw.salary = raw.salary || item.salary || null;
        const job = scraper.normalize({ ...raw, url: raw.url || item.url });
        job.descriptionComplete = fullDesc;
        const dup = dedup.key(job);
        if (dup.duplicate) { stats.duplicates++; log('JOB_DUPLICATE', { source: scraper.source, url: job.url }); return; }
        dedup.add(job);
        const gate = passesFilters(job, { ...profile, experience: { min: 0, max: maxExp, ...(profile.experience || {}) } });
        if (!gate.accept) { stats.filtered++; log('JOB_FILTERED', { source: scraper.source, url: job.url, reason: gate.reason, stage: gate.stage }); return; }
        job.relevance = gate.relevance || job.relevance;
        stats.relevant++;
        if (!dryRun && repository) {
          const r = repository.upsert(job);
          if (r === 'new' || r === 'updated') { stats.saved++; log('JOB_SAVED', { source: scraper.source, url: job.url }); }
          else { stats.duplicates++; log('JOB_DUPLICATE', { source: scraper.source, url: job.url }); }
        } else if (dryRun) { stats.saved++; }
      } catch (err) {
        stats.failed++;
        log('SCRAPE_FAILED', { source: scraper.source, url: item.url, error: String(err && err.message) });
      }
    });
  }
  }
  log('SCRAPE_COMPLETED', { source: scraper.source, ...stats });
  return stats;
}

async function crawlAll(scrapers, cfg, repository) {
  const results = [];
  for (const s of scrapers) {
    const sc = cfg.sources[s.source];
    if (sc && sc.enabled === false) continue;
    try {
      const locations = cfg.locations || (cfg.country ? [cfg.country] : []);
      const r = await crawlSource(s, cfg.queries, { maxPages: sc.maxPages, maxJobsPerQuery: sc.maxJobsPerQuery, concurrency: sc.concurrency, repository, dryRun: cfg.dryRun, maxExp: (cfg.profile && cfg.profile.experience && cfg.profile.experience.max) || cfg.experience.max, profile: cfg.profile || {}, remoteQueries: cfg.remoteQueries || [], remoteLocation: cfg.remoteLocation || 'Remote', locations });
      results.push(r);
    } catch (err) {
      log('SCRAPE_FAILED', { source: s.source, error: String(err && err.message) });
      results.push({ source: s.source, queries: 0, found: 0, relevant: 0, saved: 0, duplicates: 0, failed: 1, filtered: 0, disabled: true });
    }
  }
  return results;
}

module.exports = { crawlSource, crawlAll };
