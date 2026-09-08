'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyFile, resolveProfileName } = require('@jobscrapper/config/store');
const { loadEnv } = require('@jobscrapper/config/env');
const { buildConfig, HELP } = require('../apps/cli/index.js');

test('config file merges over defaults', () => {
  const base = { queries: ['a'], sources: { linkedin: { enabled: true, maxPages: 10 } }, experience: { min: 0, max: 2 }, scraping: { maxRetries: 5 } };
  const out = applyFile(base, { sources: { linkedin: { maxPages: 3 }, glassdoor: { enabled: true } }, experience: { max: 1 }, profile: 'strict' });
  assert.equal(out.sources.linkedin.maxPages, 3);
  assert.equal(out.sources.linkedin.enabled, true);
  assert.equal(out.sources.glassdoor.enabled, true);
  assert.equal(out.experience.max, 1);
  assert.equal(out.profileName, 'strict');
  assert.equal(base.sources.linkedin.maxPages, 10);
});

test('profile resolution: cli > file > env > default', () => {
  assert.equal(resolveProfileName(['--profile', 'strict'], {}), 'strict');
  assert.equal(resolveProfileName([], { profileName: 'standard' }), 'standard');
  process.env.JOB_PROFILE = 'remote-strict';
  assert.equal(resolveProfileName([], {}), 'remote-strict');
  delete process.env.JOB_PROFILE;
  assert.equal(resolveProfileName([], {}), 'egypt-junior');
});

test('env loader parses pairs, respects existing vars', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'));
  const fp = path.join(dir, '.env');
  fs.writeFileSync(fp, '# comment\nA=1\nB=\"two\"\nEMPTY=\nBADLINE\n');
  process.env.A = 'keep';
  loadEnv(fp);
  assert.equal(process.env.A, 'keep');
  assert.equal(process.env.B, 'two');
  delete process.env.A; delete process.env.B;
});

test('mailer builds a safe send command', () => {
  const { buildScript } = require('../apps/cli/mailer.js');
  const s = buildScript({ to: 'a@b.c', subject: "Jobs (5 new)", body: "it's attached", attachment: 'C:\\x\\jobs.csv' });
  assert.ok(s.includes('a@b.c') && s.includes('jobs.csv') && s.includes("it''s attached"));
  assert.ok(s.includes('smtp.gmail.com'));
});

test('bare email arg survives npm flag swallowing', () => {
  const { buildConfig } = require('../apps/cli/index.js');
  const c = buildConfig(['user@example.com']);
  assert.equal(c.email.to, 'user@example.com');
  assert.equal(c.email.sendAfterScrape, true);
});

test('export groups country first, then remote, then other', () => {
  const { groupOf, inCountry } = require('../apps/cli/export.js');
  assert.ok(inCountry('Cairo, Egypt', 'Egypt'));
  assert.ok(!inCountry('Berlin, Germany', 'Egypt'));
  assert.equal(groupOf({ location: 'Cairo, Egypt', remote: false }, 'Egypt'), '1-egypt');
  assert.equal(groupOf({ location: 'Cairo, Egypt', remote: true }, 'Egypt'), '1-egypt');
  assert.equal(groupOf({ location: 'Berlin, Germany', remote: true }, 'Egypt'), '2-remote');
  assert.equal(groupOf({ location: 'Berlin, Germany' }, 'Egypt'), '3-other');
  assert.equal(groupOf({ location: 'Berlin, Germany' }, 'Germany'), '1-germany');
  assert.ok(inCountry('القاهرة القاهرة مصر', 'Egypt'));
  assert.equal(groupOf({ location: 'القاهرة القاهرة مصر', remote: true }, 'Egypt'), '1-egypt');
});

test('indeed search honors location filter', () => {
  const { IndeedScraper } = require('../packages/sources/indeed/scraper');
  const u = new IndeedScraper({}).buildSearchUrl('Node.js Developer', 0, 'Egypt', '');
  assert.ok(u.includes('l=Egypt'));
});

test('everything is file-configurable: example file applies cleanly', () => {
  const fs = require('fs');
  const { applyFile } = require('@jobscrapper/config/store');
  const base = require('@jobscrapper/config/config').config;
  const file = JSON.parse(fs.readFileSync('jobscrapper.config.example.json', 'utf8'));
  const out = applyFile(JSON.parse(JSON.stringify(base)), file);
  assert.ok(Array.isArray(out.queries) && out.queries.length > 0);
  assert.equal(out.country, 'Egypt');
  assert.deepEqual(out.export, { ageDays: [1, 7] });
  assert.ok(out.sources.linkedin && out.profiles['egypt-junior'].techAny.includes('express'));
});

test('profile extras: custom senior/mid words and reject patterns', () => {
  const { classify } = require('@jobscrapper/core/classifier');
  const base = { title: 'Node.js Developer', description: 'Node.js Express REST API 0-2 years' };
  assert.equal(classify({ ...base, title: 'Node.js Ninja' }, { extraSeniorTitles: ['ninja'] }).relevance, 'reject');
  assert.equal(classify(base, { extraRejectPatterns: ['^Node\\.js Developer$'] }).relevance, 'reject');
  assert.equal(classify(base, {}).relevance, 'high');
});

test('export age buckets follow config', () => {
  const { ageBucket } = require('../apps/cli/export.js');
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  assert.equal(ageBucket(twoDaysAgo, [1, 7]), '1-week');
  assert.equal(ageBucket(twoDaysAgo, [3, 30]), '1-day');
});

test('cli buildConfig honors flags and help text', () => {
  const cfg = buildConfig(['--source', 'wuzzuf', '--query', 'X', '--max-pages', '2', '--profile', 'strict', '--remote-only', '--max-age-days', '30', '--dry-run']);
  assert.equal(cfg.sources.wuzzuf.enabled, true);
  assert.equal(cfg.sources.linkedin.enabled, false);
  assert.deepEqual(cfg.queries, ['X']);
  assert.equal(cfg.profile.name, 'strict');
  assert.equal(cfg.profile.remoteOnly, true);
  assert.equal(cfg.profile.maxAgeDays, 30);
  assert.equal(cfg.dryRun, true);
  assert.ok(HELP.includes('--profile'));
});
