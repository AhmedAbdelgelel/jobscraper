'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { getProfile } = require('@jobscrapper/config/profiles');
const { passesFilters } = require('@jobscrapper/core/gate');
const { normalize } = require('@jobscrapper/core/normalizer');

const P = getProfile('egypt-junior');
function job(o) {
  return normalize({ source: 'linkedin', sourceJobId: String(Math.random()), url: 'https://example.com/j/' + Math.random(), descriptionComplete: true, ...o });
}

test('production gate: 4-6 years full description rejected', () => {
  const j = job({ title: 'Backend Developer', company: 'Acme', description: 'Node.js Express REST API. Experience: 4-6 years of professional software engineering experience.' });
  const g = passesFilters(j, P);
  assert.equal(g.accept, false);
  assert.equal(g.stage, 'experience');
});

test('production gate: word-number ranges rejected', () => {
  const j = job({ title: 'Node.js Developer', company: 'Acme', description: 'Requires three to five years of backend experience with Node.js.' });
  assert.equal(passesFilters(j, P).accept, false);
  const k = job({ title: 'Node.js Developer', company: 'Acme', description: 'At least 3 years of Node.js experience required.' });
  assert.equal(passesFilters(k, P).accept, false);
});

test('production gate: junior 0-2 with node stack accepted', () => {
  const j = job({ title: 'Junior Node.js Developer', company: 'Acme', location: 'Remote', remote: true, description: 'Node.js Express role. 0-2 years experience. Junior welcome.' });
  const g = passesFilters(j, P);
  assert.equal(g.accept, true);
});

test('production gate: strict profile drops snippet-only jobs', () => {
  const S = getProfile('strict');
  const j = job({ title: 'Node.js Developer', company: 'Acme', description: 'Node.js role', descriptionComplete: false });
  assert.equal(passesFilters(j, S).accept, false);
  assert.equal(passesFilters(j, P).accept, true);
});

test('data-quality: mitigator loophole closed, mid/sme, medium strength', () => {
  const grad = job({ title: 'Backend Developer', company: 'Acme', description: 'Node.js role. 3+ years experience. Fresh graduates welcome.' });
  assert.equal(passesFilters(grad, P).accept, false);
  const mid = job({ title: 'Junior Strong/Middle Full Stack (Node+React)', company: 'Acme', description: 'Node.js React. 0-2 years.' });
  assert.equal(passesFilters(mid, P).accept, false);
  const sme = job({ title: 'Node.js Developer SME', company: 'Acme', description: 'Node.js expert role. 0-2 years.' });
  assert.equal(passesFilters(sme, P).accept, false);
  const go = job({ title: 'Backend Developer (Go/NodeJS/TypeScript)', company: 'Acme', description: 'Go primary, some NodeJS.' });
  assert.equal(passesFilters(go, P).accept, false);
  const be = job({ title: 'Backend Developer', company: 'Acme', description: 'Node.js Express REST API backend. 1-2 years.' });
  assert.equal(passesFilters(be, P).accept, true);
});

test('data-quality: stale jobs rejected by maxAgeDays', () => {
  const old = job({ title: 'Node.js Developer', company: 'Acme', description: 'Node.js Express. 0-2 years.', postedAt: '2025-09-30' });
  assert.equal(passesFilters(old, P).accept, false);
  const fresh = job({ title: 'Node.js Developer', company: 'Acme', description: 'Node.js Express. 0-2 years.', postedAt: new Date().toISOString().slice(0, 10) });
  assert.equal(passesFilters(fresh, P).accept, true);
});

test('data-quality: remote detection is strict', () => {
  const { normalize: n } = require('@jobscrapper/core/normalizer');
  const nyc = n({ title: 'Backend Engineer', company: 'Rain', location: 'New York, NY', description: 'Join our remote team dinners. Must work on-site in NYC.', url: 'https://example.com/a', source: 'linkedin', sourceJobId: 'ra1' });
  assert.equal(nyc.remote, false);
  const rem = n({ title: 'Backend Engineer', company: 'X', location: 'Remote in USA', description: 'Fully remote role.', url: 'https://example.com/b', source: 'linkedin', sourceJobId: 'rb1' });
  assert.equal(rem.remote, true);
  const vague = n({ title: 'Backend Engineer', company: 'Y', location: 'United States', description: 'Great team, no mention.', url: 'https://example.com/c', source: 'linkedin', sourceJobId: 'rc1' });
  assert.equal(vague.remote, null);
});

test('data-quality: linkedin SEO titles sanitized', () => {
  const { sanitizeTitle } = require('@jobscrapper/sources/linkedin/parser');
  assert.equal(sanitizeTitle('Node.JS Developer at Stealth iT Consulting — United Kingdom | LinkedIn Jobs'), 'Node.JS Developer');
  assert.equal(sanitizeTitle('Motion Recruitment hiring Back End Engineer in New York, NY | LinkedIn'), 'Back End Engineer');
  assert.equal(sanitizeTitle('Clidrive busca personal para el cargo de Backend Developer en España | LinkedIn'), 'Backend Developer');
  assert.equal(sanitizeTitle('smartclip sucht Software Engineer API (f/m/d) - Node.js, SQL in Berlin, Deutschland | LinkedIn'), 'Software Engineer API (f/m/d) - Node.js, SQL');
});

test('data-quality: detail description excludes related-job pollution', () => {
  const { parseJobPage } = require('@jobscrapper/sources/linkedin/parser');
  const html = `<h1>Backend Developer</h1><a class="topcard__org-name-link">Acme</a>`
    + `<div class="show-more-less-html__markup"><p>Node.js Express role. 0-2 years.</p></div>`
    + `<section class="similar-jobs"><div class="show-more-less-html__markup"><p>Senior Java Architect needed. 10+ years.</p><p>${'x'.repeat(600)}</p></div></section>`;
  const p = parseJobPage(html, 'https://www.linkedin.com/jobs/view/backend-developer-at-acme-123456789');
  assert.ok(!/Senior Java Architect/.test(p.description), 'related-job text leaked: ' + p.description.slice(0, 120));
  assert.ok(/Node\.js Express/.test(p.description));
});

test('multilingual: spanish/portuguese requirements rejected', () => {
  const es = job({ title: 'Backend Developer Node.js', company: 'BETWEEN', description: 'Requisitos: Experiencia de entre 4 y 5 años en desarrollo backend con Node.js.' });
  assert.equal(passesFilters(es, P).accept, false);
  const es2 = job({ title: 'Backend Developer', company: 'Clidrive', description: 'Buscamos un Backend Developer con al menos 5 años de experiencia real. Node.js y NestJS.' });
  assert.equal(passesFilters(es2, P).accept, false);
  const pt = job({ title: 'Desenvolvedor Node.js', company: 'X', description: 'Requisito: 3 anos de experiência com Node.js backend.' });
  assert.equal(passesFilters(pt, P).accept, false);
});

test('multilingual: seniority-level field rejected', () => {
  const s = job({ title: 'Node.JS Developer', company: 'Stealth', description: 'Node.js Express role. Show more Show less Seniority level Mid-Senior level Employment type Full-time' });
  assert.equal(passesFilters(s, P).accept, false);
  const e = job({ title: 'Node.JS Developer', company: 'Y', description: 'Node.js Express role. Seniority level Entry level Employment type Full-time' });
  assert.equal(passesFilters(e, P).accept, true);
});

test('multi-match: highest requirement wins (Photon case)', () => {
  const j = job({ title: 'Node JS Developer', company: 'Photon', description: 'Proficient in REST API development with Node.js, with recent experience in the last 1-2 years. 5-7 years of Typescript experience.' });
  assert.equal(passesFilters(j, P).accept, false);
});

test('cleaning: applicants stripped, titles deduped', () => {
  const { normalize: n } = require('@jobscrapper/core/normalizer');
  const j = n({ title: 'Junior Software Engineer (Node.js)', company: 'F24', location: 'Zagreb, Zagreb, Croatia · 48 applicants', description: 'Node.js role 0-2 years', url: 'https://example.com/d', source: 'linkedin', sourceJobId: 'ld1' });
  assert.equal(j.location, 'Zagreb, Zagreb, Croatia');
  const { sanitizeTitle, cleanDescription } = require('@jobscrapper/sources/linkedin/parser');
  assert.equal(sanitizeTitle('Desenvolvedor Node.js na empresa Jobbol — Belo Horizonte, MG | LinkedIn Jobs'), 'Desenvolvedor Node.js');
  const Ui = 'EMPLEOS SIMILARES Backend Developer Clidrive';
  assert.ok(!/EMPLEOS SIMILARES/.test(cleanDescription('Real Node.js desc here. ' + Ui)));
});

test('profiles registry is valid', () => {
  for (const name of ['egypt-junior', 'standard', 'strict', 'remote-strict']) {
    const p = getProfile(name);
    assert.ok(p.experience.max === 2 && Array.isArray(p.techAny) && p.techAny.includes('express'));
  }
  assert.throws(() => getProfile('nope'), /unknown profile/);
});
