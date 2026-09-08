'use strict';

const NODE_STACK = ['node.js', 'nodejs', 'express', 'nestjs', 'nest.js', 'fastify', 'koa', 'hapijs', 'hapi'];
const BACKEND_CTX = ['backend', 'back-end', 'back end', 'rest api', 'restful', 'graphql', 'microservice', 'server-side', 'server side', 'api developer', 'api engineer'];
const SENIOR_WORDS = ['senior', 'sênior', 'sénior', 'sr\\.?', 'staff', 'lead', 'principal', 'architect', 'manager', 'director', 'head of', 'sme', 'subject matter expert', 'iii', 'iv'];
const SENIOR_RE = new RegExp(`\\b(${SENIOR_WORDS.join('|')})\\b`, 'i');
const TALENT_POOL_RE = /talent pool|talent network|banco de talentos|future opportunit|join our (talent|team|pool)|evergreen|general application|jobs at$/i;
const MID_WORDS = ['mid([\\s-]?level|[\\s-]?senior)?', 'middle', 'intermediate', 'intermedio', 'pleno', 'semi[\\s-]?senior', 'semi[\\s-]?sr'];
const MID_RE = new RegExp(`\\b(${MID_WORDS.join('|')})\\b`, 'i');

function escRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordsRe(baseWords, extra) {
  const all = [...baseWords, ...[...(extra || [])].map((w) => escRx(String(w).trim())).filter(Boolean)];
  return new RegExp(`\\b(${all.join('|')})\\b`, 'i');
}

function classify(job, profile = {}) {
  const p = { rejectSeniorTitles: true, rejectMidTitles: true, rejectTalentPools: true, titleScope: 'node-backend', techAny: NODE_STACK, extraSeniorTitles: [], extraMidTitles: [], extraRejectPatterns: [], ...profile };
  const seniorRe = wordsRe(SENIOR_WORDS, p.extraSeniorTitles);
  const midRe = wordsRe(MID_WORDS, p.extraMidTitles);
  const extraRes = (p.extraRejectPatterns || []).map((s) => { try { return new RegExp(s, 'i'); } catch { return null; } }).filter(Boolean);
  const stack = Array.isArray(p.techAny) && p.techAny.length ? p.techAny : NODE_STACK;
  const title = String(job.title || '');
  const low = title.toLowerCase();
  const desc = String((job.description || '') + '\n' + (job.requirements || '')).toLowerCase();
  const hay = low + '\n' + desc;
  const hasNode = /node(\.?js)?/.test(hay);
  const stackHits = stack.filter((t) => hay.includes(t));
  const backendCtx = BACKEND_CTX.some((t) => hay.includes(t));
  if (!/\b(junior|jr\.?|intern|entry|graduate|trainee)\b/.test(low)) {
    if (p.rejectSeniorTitles !== false && seniorRe.test(title)) return { relevance: 'reject', reason: 'senior-level title', tech: stackHits };
  }
  if (p.rejectMidTitles !== false && midRe.test(title) && !/\b(intern|internship|entry|graduate|trainee)\b/.test(low)) {
    return { relevance: 'reject', reason: 'mid-level title', tech: stackHits };
  }
  if (p.rejectTalentPools !== false && TALENT_POOL_RE.test(title)) return { relevance: 'reject', reason: 'talent-pool/generic post', tech: stackHits };
  const extraHit = extraRes.find((re) => re.test(title));
  if (extraHit) return { relevance: 'reject', reason: `custom reject pattern ${extraHit.source}`, tech: stackHits };
  const titleNode = /node(\.?js)?|express|nestjs/.test(low);
  const titleRole = /backend|back[\s-]?end|\bapi\b|javascript/.test(low);
  if (p.titleScope === 'node-backend' && !titleNode && !titleRole) return { relevance: 'reject', reason: 'title not node/backend focused', tech: stackHits };
  const leadTitle = low.split(/[(,|/]/)[0];
  const OTHER_STACK_RE = /golang|\bgo\/|\/go\b|\bphp\b|\bpython\b|(?<!\.)\bjava\b(?!script)|\.net\b|\bruby on rails\b|\bdjango\b|\blaravel\b|\bspring\b/i;
  if (titleNode && !/node(\.?js)?|express|nestjs/.test(leadTitle) && OTHER_STACK_RE.test(low) && stackHits.length < 2) {
    return { relevance: 'reject', reason: 'primarily non-node stack', tech: stackHits };
  }
  if (titleNode && (stackHits.length > 0 || backendCtx || /developer|engineer|programmer/.test(low))) {
    return { relevance: 'high', reason: 'node-stack title + backend context', tech: stackHits };
  }
  if (titleRole && (stackHits.length >= 2 || (hasNode && backendCtx))) {
    return { relevance: 'medium', reason: 'backend/js title with strong node-stack tech', tech: stackHits };
  }
  if (titleRole) return { relevance: 'reject', reason: 'weak node signal for backend/js title', tech: stackHits };
  return { relevance: 'reject', reason: 'no node/express/nestjs backend signal', tech: stackHits };
}

function isRelevant(job) {
  return classify(job).relevance !== 'reject';
}

module.exports = { classify, isRelevant, BACKEND_TECH: NODE_STACK };
