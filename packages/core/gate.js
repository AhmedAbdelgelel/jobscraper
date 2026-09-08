'use strict';

// Single production gate: every job passes relevance + experience + profile
// rules here, using the FULL description when available.
const { classify } = require('./classifier');
const { experienceDecision } = require('./experience-filter');

// Title-only pre-check: rejects jobs that fail on title alone, WITHOUT
// needing the full description. Lets the crawler skip expensive detail
// fetches for obvious rejects. Never accepts — only rejects.
function titlePrefilter(title, profile = {}) {
  const p = { rejectSeniorTitles: true, rejectMidTitles: true, rejectTalentPools: true, titleScope: 'node-backend', ...profile };
  const t = String(title || '');
  const low = t.toLowerCase();
  if (!/\b(junior|jr\.?|intern|entry|graduate|trainee)\b/.test(low)) {
    const SENIOR_RE = /\b(senior|sênior|sénior|sr\.?|staff|lead|principal|architect|manager|director|head of|sme|subject matter expert|iii|iv)\b/i;
    if (p.rejectSeniorTitles !== false && SENIOR_RE.test(t)) return 'senior-level title';
  }
  const MID_RE = /\b(mid([\s-]?level|[\s-]?senior)?|middle|intermediate|intermedio|pleno|semi[\s-]?senior|semi[\s-]?sr)\b/i;
  if (p.rejectMidTitles !== false && MID_RE.test(t) && !/\b(intern|internship|entry|graduate|trainee)\b/.test(low)) return 'mid-level title';
  const TALENT_POOL_RE = /talent pool|talent network|banco de talentos|future opportunit|join our (talent|team|pool)|evergreen|general application|jobs at$/i;
  if (p.rejectTalentPools !== false && TALENT_POOL_RE.test(t)) return 'talent-pool/generic post';
  if (p.titleScope === 'node-backend' && !/node(\.?js)?|express|nestjs/.test(low) && !/backend|back[\s-]?end|\bapi\b|javascript/.test(low)) {
    return 'title not node/backend focused';
  }
  return null;
}

function passesFilters(job, profile = {}) {
  const p = {
    experience: { min: 0, max: 2 },
    requireFullDescription: false,
    remoteOnly: false,
    ...profile,
  };
  const cls = classify(job, p);
  if (cls.relevance === 'reject') return { accept: false, reason: cls.reason, stage: 'relevance' };
  const exp = experienceDecision(job, p.experience.max, p);
  if (!exp.accept) return { accept: false, reason: exp.reason, stage: 'experience' };
  if (p.requireFullDescription && job.descriptionComplete !== true) {
    return { accept: false, reason: 'description not fully verified', stage: 'verification' };
  }
  if (p.maxAgeDays && job.postedAt) {
    const t = Date.parse(job.postedAt);
    if (!Number.isNaN(t) && (Date.now() - t) / 86400000 > p.maxAgeDays) {
      return { accept: false, reason: `posted over ${p.maxAgeDays} days ago`, stage: 'recency' };
    }
  }
  if (p.remoteOnly && job.remote !== true) return { accept: false, reason: 'not remote', stage: 'location' };
  return { accept: true, reason: `${cls.relevance} + within ${p.experience.min}-${p.experience.max}y`, stage: 'ok', relevance: cls.relevance };
}

module.exports = { passesFilters, titlePrefilter };
