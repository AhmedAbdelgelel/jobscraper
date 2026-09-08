'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseExperience, experienceDecision } = require('@jobscrapper/core/experience-filter');
const { classify } = require('@jobscrapper/core/classifier');
const { canonicalizeUrl } = require('@jobscrapper/core/url-normalizer');
const { Deduplicator } = require('@jobscrapper/core/deduplicator');
const { normalize } = require('@jobscrapper/core/normalizer');
const { jobFingerprint } = require('@jobscrapper/core/fingerprint');
const { classifyError } = require('@jobscrapper/core/retry');

test('experience parser accepts 0-2, rejects 3+', () => {
  assert.equal(parseExperience('0-2 years experience').max, 2);
  assert.equal(parseExperience('5+ years required').min, 5);
  assert.equal(experienceDecision({ title: 'Junior Node.js Developer', description: '0-2 years Node.js' }).accept, true);
  assert.equal(experienceDecision({ title: 'Senior Node.js Developer', description: '5+ years experience' }).accept, false);
  assert.equal(experienceDecision({ title: 'Node.js Developer', description: 'no description' }).accept, true);
});

test('classifier high/medium/reject', () => {
  assert.equal(classify({ title: 'Node.js Backend Developer', description: 'Node.js Express REST API' }).relevance, 'high');
  assert.equal(classify({ title: 'Backend Developer', description: 'Node.js Express backend' }).relevance, 'medium');
  assert.equal(classify({ title: 'Frontend Developer', description: 'React only CSS' }).relevance, 'reject');
  assert.equal(classify({ title: 'PHP Developer', description: 'Laravel PHP' }).relevance, 'reject');
});

test('strict filter: mid-level, talent pool, generic titles rejected', () => {
  assert.equal(classify({ title: 'Mid NodeJS Developer', description: 'Node.js 2-4 years' }).relevance, 'reject');
  assert.equal(classify({ title: 'Software Engineer - Mid Level', description: 'Node.js backend' }).relevance, 'reject');
  assert.equal(classify({ title: 'Banco de Talentos Desenvolvedor Node.js', description: 'Node.js' }).relevance, 'reject');
  assert.equal(classify({ title: 'AI-native Software Engineer', description: 'AI platform Python' }).relevance, 'reject');
  assert.equal(experienceDecision({ title: 'Node.js Developer', description: '2+ years experience required' }).accept, false);
  assert.equal(experienceDecision({ title: 'Node.js Developer', description: '2-4 years experience' }).accept, false);
  assert.equal(experienceDecision({ title: 'Junior Node.js Developer', description: '0-2 years experience' }).accept, true);
});

test('url canonicalizer strips tracking', () => {
  assert.equal(canonicalizeUrl('https://example.com/job/123?utm_source=x&trk=abc'), 'https://example.com/job/123');
  assert.equal(canonicalizeUrl('https://example.com/job/123?skills=node'), 'https://example.com/job/123?skills=node');
});

test('deduplicator catches dupes, avoids false merge', () => {
  const d = new Deduplicator();
  const a = normalize({ title: 'Node.js Developer', company: 'Acme', location: 'Cairo', description: 'x'.repeat(300), url: 'https://example.com/j/1?utm_source=x', source: 'wuzzuf', sourceJobId: '1' });
  assert.equal(d.key(a).duplicate, false); d.add(a);
  const b = { ...a };
  assert.equal(d.key(b).duplicate, true);
  const c = { ...a, title: 'Python Developer', description: 'y'.repeat(300), fingerprint: 'diff', sourceJobId: '2', url: 'https://example.com/j/2', canonicalUrl: 'https://example.com/j/2' };
  assert.equal(d.key(c).duplicate, false);
});

test('normalizer schema + fingerprint stable', () => {
  const j = normalize({ title: ' Junior Node.js Developer ', company: 'Acme', location: 'Cairo', description: 'Node.js Express role', url: 'https://example.com/j/1', source: 'indeed', sourceJobId: 'abc' });
  assert.ok(j.id === null && j.title === 'Junior Node.js Developer');
  assert.equal(j.fingerprint, jobFingerprint(j));
  assert.ok(j.canonicalUrl === 'https://example.com/j/1');
});

test('repository persists updates to file', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { Repository } = require('@jobscrapper/storage/repository');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  const r = new Repository({ dbPath: ':memory:', jsonFallback: path.join(dir, 'jobs.json') });
  if (r.useSqlite) { r.close(); return; }
  const { normalize } = require('@jobscrapper/core/normalizer');
  const j = normalize({ title: 'Node.js Developer', company: 'Acme', location: 'Cairo', description: 'Node.js Express role with REST API', url: 'https://example.com/j/9', source: 'indeed', sourceJobId: 'z9' });
  assert.equal(r.upsert(j), 'new');
  const [saved] = r.all();
  saved.title = 'Node.js Developer (Remote)';
  const { jobFingerprint } = require('@jobscrapper/core/fingerprint');
  saved.fingerprint = jobFingerprint(saved);
  assert.equal(r.upsert(saved), 'updated');
  r.close();
  const fromFile = JSON.parse(fs.readFileSync(path.join(dir, 'jobs.json'), 'utf8'));
  assert.equal(fromFile[0].title, 'Node.js Developer (Remote)');
});

test('title prefilter rejects without description, never accepts', () => {
  const { titlePrefilter } = require('../packages/core/gate');
  assert.equal(titlePrefilter('Senior Backend Engineer (Node.js)', {}), 'senior-level title');
  assert.equal(titlePrefilter('Mid Backend Developer', {}), 'mid-level title');
  assert.equal(titlePrefilter('Frontend Developer', {}), 'title not node/backend focused');
  assert.equal(titlePrefilter('Junior Node.js Developer', {}), null);
  assert.equal(titlePrefilter('Backend Developer (Node.js)', {}), null);
});

test('retry classifier', () => {
  assert.equal(classifyError(Object.assign(new Error('timeout'), {})), 'network-error');
  assert.equal(classifyError(Object.assign(new Error('x'), { status: 429 })), 'rate-limited');
  assert.equal(classifyError(Object.assign(new Error('x'), { status: 404 })), 'non-retryable');
});
