'use strict';

const SENIOR_TITLES = ['senior', 'sr', 'sr.', 'staff', 'lead', 'principal', 'architect', 'manager', 'director', 'head of'];
const SENIOR_TITLE_RE = /(^|[\s(,])(senior|sr\.?|staff|lead|principal|architect|manager|director|head of|iii|iv)(?=[\s,)\-.]|$)/i;
const ENTRY_SIGNALS = ['intern', 'internship', 'graduate', 'fresh graduate', 'entry level', 'entry-level', 'junior', 'trainee', '0 years', '0 year', 'no experience', 'fresh grad'];

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

function wordsToDigits(s) {
  let out = String(s);
  out = out.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s*(?:to|–|—|-)\s*\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s*years?/gi, (m, a, b) => `${WORD_NUM[a.toLowerCase()]}-${WORD_NUM[b.toLowerCase()]} years`);
  out = out.replace(/(?:at least|minimum(?: of)?|a minimum of)\s*\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (m, a) => `at least ${WORD_NUM[a.toLowerCase()]}`);
  return out;
}

const EXP_PATTERNS = [
  /(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:\+)?\s*years?/g,
  /(\d+)\s*\+\s*years?/g,
  /(\d+)\s*years?(?:\s+of)?\s+experience/g,
  /experience\s*[:\-]?\s*(\d+)\s*years?/g,
  /(?:at least|minimum(?: of)?|a minimum of)\s*(\d+)\s*(?:years?|yrs?)/g,
  /(\d+)\s*(?:years?|yrs?)\s*(?:minimum|or more|and above)/g,
  /(\d+)\s*y\s*(\d+)\s*años/g,
  /(\d+)\s*(?:-|–|—|a|al)\s*(\d+)\s*años/g,
  /(\d+)\s*\+\s*años/g,
  /(\d+)\s*años\s+de\s+experiencia/g,
  /(?:al menos|como mínimo|mínimo(?: de)?)\s*(\d+)\s*años/g,
  /(\d+)\s*(?:-|–|—|a|e)\s*(\d+)\s*anos(?:\s+de\s+experiência)?/g,
  /(\d+)\s*anos\s+de\s+experiência/g,
  /(\d+)\s*anni\s+di\s+esperienza/g,
  /(\d+)\s*(?:-|–|bis)\s*(\d+)\s*jahre/g,
  /(\d+)\s*jahre\s+(berufs)?erfahrung/g,
  /(\d+)\s*(?:-|–|à)\s*(\d+)\s*ans?\s+d.expérience/g,
  /(\d+)\s*ans?\s+d.expérience/g,
];

function parseExperience(text) {
  if (!text) return { min: null, max: null, explicit: false };
  const t = wordsToDigits(String(text).toLowerCase().replace(/\s+/g, ' '));
  let best = null;
  for (const re of EXP_PATTERNS) {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(t))) {
      const a = +m[1];
      const b = m[2] !== undefined ? +m[2] : (/\+/.test(m[0]) || /at least|minimum|mínimo|menos|al menos/.test(m[0]) ? 99 : a);
      if (Number.isNaN(a)) continue;
      const cand = { min: a, max: Number.isNaN(b) ? a : b, explicit: true };
      if (!best || cand.max > best.max || (cand.max === best.max && cand.min > best.min)) best = cand;
    }
  }
  if (best) return best;
  if (/fresh|no experience|entry[\s-]?level|intern|graduate|junior|trainee|0\s*-\s*1|0\s*-\s*2/.test(t)) return { min: 0, max: 2, explicit: true };
  return { min: null, max: null, explicit: false };
}

const SENIORITY_FIELD_RE = /(?:seniority level|nivel de antigüedad|nível de experiência|livello di anzianità|karrierestufe|niveau d'ancienneté)\s*:?\s*([a-záéíóúñâêîôûàèùçäöüß®\/\- ]{2,40})/i;
const SENIORITY_HIGH_RE = /mid-senior|senior(?!.*(?:entry|associate))|intermedio|pleno|sênior|sénior|manager|director|executive|lead|confirm|erfahren|chef/i;
const SENIORITY_LOW_RE = /entry|associate|not applicable|no corresponde|sin experiencia|esperienza minima|berufseinsteiger|débutant|trainee|intern|estagiário|début/i;

function seniorityFieldDecision(hay) {
  const m = hay.match(SENIORITY_FIELD_RE);
  if (!m) return null;
  const v = m[1].toLowerCase().trim();
  if (SENIORITY_LOW_RE.test(v)) return null;
  if (SENIORITY_HIGH_RE.test(v)) return v;
  return null;
}

function experienceDecision(job, maxAllowed = 2, _profile = {}) {
  const hay = [job.title, job.description, job.requirements].filter(Boolean).join('\n').toLowerCase();
  const senField = seniorityFieldDecision(hay);
  if (senField) return { accept: false, reason: `seniority level: ${senField}`, parsed: { min: null, max: null, explicit: true } };
  const parsed = parseExperience(hay);
  const titleLow = String(job.title || '').toLowerCase();
  const seniorHit = SENIOR_TITLE_RE.test(String(job.title || '')) || SENIOR_TITLES.some((s) => new RegExp(`\\b${s.replace('.', '\\.')}\\b`).test(hay.slice(0, 500)));
  if (parsed.explicit && parsed.max !== null && parsed.max > maxAllowed) {
    return { accept: false, reason: `requires up to ${parsed.max} years`, parsed };
  }
  if (/[2-9]\s*\+\s*years/.test(hay) && !/(0\s*-\s*[12]|1\s*-\s*2|up to 2|max.*2)/.test(hay)) return { accept: false, reason: 'requires 2+ years open-ended', parsed };
  if (seniorHit) {
    const juniorMitigator = /junior|intern|entry|graduate|0-2|1-2/.test(hay);
    if (!juniorMitigator) return { accept: false, reason: 'senior-level title', parsed };
  }
  return { accept: true, reason: parsed.explicit ? 'within 0-2' : 'no explicit requirement; keep for review', parsed };
}

module.exports = { parseExperience, experienceDecision, SENIOR_TITLES, ENTRY_SIGNALS };
