'use strict';

const { createJob } = require('./job');
const { canonicalizeUrl, normalizeText } = require('./url-normalizer');
const { jobFingerprint } = require('./fingerprint');
const { parseExperience } = require('./experience-filter');
const { classify } = require('./classifier');

const TECH_PATTERNS = ['node.js', 'nodejs', 'express', 'nestjs', 'fastify', 'koa', 'typescript', 'javascript', 'mongodb', 'postgresql', 'mysql', 'redis', 'graphql', 'rest', 'docker', 'aws', 'microservices'];

function extractTechnologies(text) {
  const low = String(text || '').toLowerCase();
  const found = [];
  for (const t of TECH_PATTERNS) if (low.includes(t)) found.push(t === 'nodejs' ? 'node.js' : t);
  return [...new Set(found)];
}

function detectRemote(location, description) {
  const loc = String(location || '').toLowerCase();
  if (/hybrid|on[\s-]?site|in[\s-]?office|in person/.test(loc)) return false;
  if (/\bremote\b/.test(loc)) return true;
  const hay = String(description || '').toLowerCase();
  const onsite = /must (work|be) on[\s-]?site|on[\s-]?site (role|position|job|work|only|required|presence)|required in[-\s]?office|work from (the )?office|\d+\s*days?[^.]{0,30}in[-\s]?office/.test(hay);
  if (onsite) return false;
  const strong = /fully remote|remote[\s-]?first|remote work|remote position|remote role|remote job|remote opportunit|remote employee|remote option|work(ing)? remotely|work from home|\bwfh\b|location independent|work from anywhere|\/remote|remote\/|\(remote|remote\)|remote-friendly|remote_ok/.test(hay);
  if (strong) return true;
  return null;
}

function cleanLocation(loc) {
  return String(loc || '')
    .replace(/\s*[·•|]\s*[\d٠-٩]+[\d.,٠-٩]*\s*(applicants?|bewerbungen?|bewerber|candidaturas?|candidatures?|candidati|candidatos?|kandidaten|postulantes?|sollicitantes?|من المتقدمين|متقدم)/gi, '')
    .replace(/\s+/g, ' ').trim() || null;
}

function normalize(raw) {
  const exp = parseExperience([raw.title, raw.description, raw.requirements].filter(Boolean).join('\n'));
  const job = createJob({
    title: (raw.title || '').trim() || null,
    company: (raw.company || '').trim() || null,
    location: cleanLocation(raw.location),
    remote: raw.remote ?? detectRemote(raw.location, (raw.description || '') + '\n' + (raw.requirements || '')),
    employmentType: raw.employmentType || null,
    experienceMin: raw.experienceMin ?? exp.min,
    experienceMax: raw.experienceMax ?? exp.max,
    description: raw.description || null,
    requirements: raw.requirements || null,
    technologies: raw.technologies && raw.technologies.length ? raw.technologies : extractTechnologies((raw.description || '') + '\n' + (raw.requirements || '')),
    salary: raw.salary || null,
    source: raw.source || null,
    sourceJobId: raw.sourceJobId ? String(raw.sourceJobId) : null,
    url: raw.url || null,
    canonicalUrl: canonicalizeUrl(raw.url),
    postedAt: raw.postedAt || null,
    scrapedAt: new Date().toISOString(),
  });
  job.fingerprint = jobFingerprint(job);
  job.relevance = classify(job).relevance;
  if (raw.descriptionComplete !== undefined) job.descriptionComplete = raw.descriptionComplete;
  void normalizeText;
  return job;
}

module.exports = { normalize, extractTechnologies };
