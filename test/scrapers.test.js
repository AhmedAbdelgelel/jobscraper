'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { parseSearchPage: liSearch, parseJobPage: liJob } = require('@jobscrapper/sources/linkedin/parser');
const { parseSearchPage: wuSearch } = require('@jobscrapper/sources/wuzzuf/parser');
const { parseSearchPage: inSearch } = require('@jobscrapper/sources/indeed/parser');
const { LinkedInScraper } = require('@jobscrapper/sources/linkedin/scraper');
const { WuzzufScraper } = require('@jobscrapper/sources/wuzzuf/scraper');
const { IndeedScraper } = require('@jobscrapper/sources/indeed/scraper');
const { crawlSource } = require('@jobscrapper/core/crawler');
const { Repository } = require('@jobscrapper/storage/repository');

test('linkedin parser fixture', () => {
  const html = `<li data-occludable-job-id="12345"><div class="job-card-list__title">Node.js Developer</div><div class="job-card-container__primary-description">Acme</div><a href="https://www.linkedin.com/jobs/view/12345/?trk=x">v</a></li>`;
  const jobs = liSearch(html);
  assert.equal(jobs.length, 1); assert.equal(jobs[0].sourceJobId, '12345');
});

test('wuzzuf + indeed parser fixtures', () => {
  const wu = wuSearch(`<a href="/jobs/p/12345-Junior-Node-JS">Junior Node</a>`);
  assert.ok(wu.length >= 1);
  const ind = inSearch(`<div data-jk="abc123"><span class="jobTitle">Node Developer</span></div>`);
  assert.equal(ind[0].sourceJobId, 'abc123');
});

test('scrapers share interface + build urls + pagination', () => {
  for (const S of [LinkedInScraper, IndeedScraper]) {
    const s = new S({ requestDelayMs: 1 });
    assert.ok(typeof s.search === 'function' && typeof s.scrapeJob === 'function' && typeof s.normalize === 'function');
    const u0 = s.buildSearchUrl('Node.js Developer', 0);
    const u1 = s.buildSearchUrl('Node.js Developer', 1);
    assert.ok(u0.includes('Node')); assert.notEqual(u0, u1);
  }
  const { GlassdoorScraper } = require('@jobscrapper/sources/glassdoor/scraper');
  for (const S of [WuzzufScraper, GlassdoorScraper]) {
    const s = new S({ requestDelayMs: 1 });
    assert.ok(typeof s.search === 'function' && typeof s.scrapeJob === 'function' && typeof s.normalize === 'function');
    assert.ok(s.buildSearchUrl('Node.js Developer', 0).startsWith('http'));
  }
});

test('pipeline integration with fake scraper: filter/dedupe/persist/incremental', async () => {
  const repo = new Repository({ dbPath: ':memory:', jsonFallback: './data/test-jobs.json' });
  if (!repo.useSqlite) { try { fs.unlinkSync('./data/test-jobs.json'); } catch {} }
  class Fake {
    constructor() { this.source = 'fake'; }
    async search() { return [{ sourceJobId: '1', title: 'Junior Node.js Developer', company: 'Acme', location: 'Cairo', url: 'https://example.com/j/1' }, { sourceJobId: '2', title: 'Senior Java Developer', company: 'Big', location: 'Cairo', url: 'https://example.com/j/2', description: '5+ years Java Spring' }]; }
    async scrapeJob(u) { const id = u.endsWith('/1') ? '1' : '2'; return id === '1' ? { title: 'Junior Node.js Developer', company: 'Acme', location: 'Cairo', description: 'Node.js Express REST API 0-2 years', url: u, sourceJobId: id, source: 'fake' } : { title: 'Senior Java Developer', company: 'Big', location: 'Cairo', description: '5+ years Java Spring required', url: u, sourceJobId: id, source: 'fake' }; }
    normalize(r) { return require('@jobscrapper/core/normalizer').normalize({ ...r, source: 'fake' }); }
  }
  const r1 = await crawlSource(new Fake(), ['Node.js Developer'], { maxPages: 1, concurrency: 2, repository: repo });
  assert.equal(r1.relevant, 1); assert.equal(r1.saved, 1);
  const r2 = await crawlSource(new Fake(), ['Node.js Developer'], { maxPages: 1, concurrency: 2, repository: repo });
  assert.equal(r2.saved, 0);
  assert.ok(repo.all().length >= 1);
  repo.close();
  try { fs.unlinkSync('./data/test-jobs.json'); } catch {}
});

test('glassdoor parser fixture', () => {
  const { parseSearchPage, ageToDate } = require('@jobscrapper/sources/glassdoor/parser');
  const html = `<div data-jobid="101" data-test="jobListing"><a class="JobCard_jobTitle__x" data-test="job-title" href="/job-listing/node-developer-foo-JV_IC123.htm?jl=101">Node Developer</a><span class="EmployerProfile_compactEmployerName__x">Acme</span><div class="JobCard_location__x" data-test="emp-location">Remote</div><div class="JobCard_listingAge__x" data-test="job-age">3d</div></div>`;
  const jobs = parseSearchPage(html);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sourceJobId, '101');
  assert.equal(jobs[0].title, 'Node Developer');
  assert.equal(jobs[0].company, 'Acme');
  assert.ok(jobs[0].url.includes('glassdoor.com'));
  assert.ok(ageToDate('3d') !== null && ageToDate(null) === null);
});

test('wuzzuf browse parser fixture', () => {
  const { parseSearchPage } = require('@jobscrapper/sources/wuzzuf/parser');
  const html = `<a href="/jobs/p/abc123-node-developer-cairo-egypt">Node Developer</a>`;
  const jobs = parseSearchPage(html);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sourceJobId, 'abc123');
  assert.ok(jobs[0].url.startsWith('https://wuzzuf.net'));
});

test('wuzzuf sitemap filter matches node slugs only', () => {
  const { filterSitemapUrls } = require('@jobscrapper/sources/wuzzuf/parser');
  const urls = [
    'https://wuzzuf.net/jobs/p/kbvwtk120cfc-backend-engineer-nodejs-nestjs-typescript-tech-technology-cairo-egypt',
    'https://wuzzuf.net/jobs/p/47u9nlz6z0ak-talent-acquisition-specialist-infinity-clinic-pharma-cairo-egypt',
    'https://wuzzuf.net/jobs/p/2lo3xrgzxqyf-senior-customs-clearance-specialist-future-express-cairo-egypt',
  ];
  const hits = filterSitemapUrls(urls, 'Node.js Backend Developer', 50);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].title.toLowerCase().includes('backend'));
});

test('linkedin worldwide-remote url uses f_WT=2', () => {
  const { LinkedInScraper } = require('@jobscrapper/sources/linkedin/scraper');
  const s = new LinkedInScraper({});
  const u = s.buildSearchUrl('Node.js Developer', 0, '', '2');
  assert.ok(u.includes('f_WT=2'));
});

test('recall battery: junior node variants all pass the gate', () => {
  const { passesFilters } = require('@jobscrapper/core/gate');
  const { getProfile } = require('@jobscrapper/config/profiles');
  const { normalize } = require('@jobscrapper/core/normalizer');
  const P = getProfile('egypt-junior');
  const titles = ['Junior Node.js Developer', 'Node.js Backend Developer', 'Backend Developer (Node.js)', 'Junior Backend Developer (NestJS)', 'Node.js API Developer', 'Graduate Backend Engineer (Node)', 'Entry-Level JavaScript Backend Developer', 'Junior Express.js Developer'];
  for (const title of titles) {
    const j = normalize({ title, company: 'Acme', location: 'Remote', description: 'Node.js Express REST API. 0-2 years experience. Fully remote role.', url: 'https://example.com/' + encodeURIComponent(title), source: 'linkedin', sourceJobId: title, descriptionComplete: true });
    assert.equal(passesFilters(j, P).accept, true, title);
  }
});

test('api source mappers (fixtures, no network)', () => {
  const rok = require('../packages/sources/remoteok/parser');
  const item = { id: 1, position: 'Junior Backend Developer', company: 'Acme', location: 'Worldwide', tags: ['nodejs', 'express'], description: '<p>Node role 0-2 years</p>', date: '2026-09-01T00:00:00', url: 'https://remoteok.com/jobs/1' };
  assert.ok(rok.itemMatches(item, rok.queryTokens('Node.js Backend Developer')));
  assert.ok(!rok.itemMatches({ position: 'Accountant', company: 'X', tags: [] }, rok.queryTokens('Node.js Developer')));
  assert.equal(rok.mapItem(item).postedAt, '2026-09-01');
  const arb = require('../packages/sources/arbeitnow/parser');
  const aj = { slug: 'x', title: 'Node.js Developer', company_name: 'Acme', location: 'Berlin', job_types: ['full-time'], description: '<p>hi</p>', created_at: '2026-08-01T10:00:00Z' };
  assert.ok(arb.itemMatches(aj, arb.queryTokens('Node.js Developer')));
  assert.equal(arb.mapItem(aj).url, 'https://www.arbeitnow.com/jobs/x');
  assert.equal(arb.mapItem({ ...aj, created_at: 1788892227 }).postedAt, '2026-09-08');
  const rem = require('../packages/sources/remotive/parser');
  const rj = { id: 9, title: 'Backend Engineer', company_name: 'Acme', candidate_required_location: 'Worldwide', job_type: 'full_time', description: '<p>Node</p>', publication_date: '2026-07-01T00:00:00', url: 'https://remotive.com/x' };
  assert.equal(rem.mapItem(rj).location, 'Worldwide');
  assert.ok(Array.isArray(rem.mapItem(rj).technologies));
});

test('registry exposes all sources with working interface', () => {
  const { SOURCES, buildScrapers } = require('../packages/sources/registry');
  assert.ok(SOURCES.length >= 7);
  const cfg = require('../packages/config/config').config;
  for (const { scraper } of buildScrapers(cfg)) {
    assert.ok(typeof scraper.search === 'function' && typeof scraper.scrapeJob === 'function' && typeof scraper.normalize === 'function');
  }
});

test('error isolation: one failing job does not stop pipeline', async () => {
  class Flaky {
    constructor() { this.source = 'flaky'; }
    async search() { return [{ sourceJobId: 'a', url: 'https://example.com/a' }, { sourceJobId: 'b', url: 'https://example.com/b' }]; }
    async scrapeJob(u) { if (u.endsWith('/a')) throw new Error('invalid HTML'); return { title: 'x', company: '', url: u, sourceJobId: 'b', source: 'flaky' }; }
    normalize(r) { return require('@jobscrapper/core/normalizer').normalize({ ...r, source: 'flaky' }); }
  }
  const r = await crawlSource(new Flaky(), ['q'], { maxPages: 1, concurrency: 2, repository: null, dryRun: true });
  assert.ok(r.found === 2);
});
