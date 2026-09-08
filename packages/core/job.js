'use strict';

function createJob(o = {}) {
  return {
    id: o.id ?? null,
    title: o.title ?? null,
    company: o.company ?? null,
    location: o.location ?? null,
    remote: o.remote ?? null,
    employmentType: o.employmentType ?? null,
    experienceMin: o.experienceMin ?? null,
    experienceMax: o.experienceMax ?? null,
    description: o.description ?? null,
    requirements: o.requirements ?? null,
    technologies: Array.isArray(o.technologies) ? o.technologies : [],
    salary: o.salary ?? null,
    source: o.source ?? null,
    sourceJobId: o.sourceJobId ? String(o.sourceJobId) : null,
    url: o.url ?? null,
    canonicalUrl: o.canonicalUrl ?? o.url ?? null,
    postedAt: o.postedAt ?? null,
    scrapedAt: o.scrapedAt ?? new Date().toISOString(),
    fingerprint: o.fingerprint ?? null,
    relevance: o.relevance ?? null,
    descriptionComplete: o.descriptionComplete ?? null,
  };
}

function validateJob(job) {
  if (!job.title || !job.company) return false;
  if (!job.url) return false;
  try { new URL(job.url); } catch { return false; }
  return true;
}

module.exports = { createJob, validateJob };
