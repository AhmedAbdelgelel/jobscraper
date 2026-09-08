'use strict';
// One-off: re-sanitize titles, recompute remote/tech/exp from stored full
// descriptions, and re-apply the active profile gate.
const { Repository } = require('@jobscrapper/storage/repository');
const { sanitizeTitle, cleanDescription } = require('@jobscrapper/sources/linkedin/parser');
const { normalize } = require('@jobscrapper/core/normalizer');
const { passesFilters } = require('@jobscrapper/core/gate');
const { loadEnv } = require('@jobscrapper/config/env');
const { resolveActiveProfile } = require('@jobscrapper/config/store');

function main(argv = process.argv.slice(2)) {
  loadEnv();
  const profile = resolveActiveProfile(argv);
  const r = new Repository({});
  const jobs = r.all();
  const reasons = {};
  const kept = [];
  for (const j of jobs) {
    if (j.source === 'linkedin') j.title = sanitizeTitle(j.title);
    if (j.source === 'linkedin' && j.description) j.description = cleanDescription(j.description);
    const n = normalize({ ...j, title: j.title });
    n.descriptionComplete = j.descriptionComplete;
    n.postedAt = j.postedAt || n.postedAt;
    n.scrapedAt = j.scrapedAt || n.scrapedAt;
    const g = passesFilters(n, profile);
    if (!g.accept) {
      const k = `${g.stage}:${g.reason}`;
      reasons[k] = (reasons[k] || 0) + 1;
      continue;
    }
    n.relevance = g.relevance;
    kept.push(n);
  }
  r.replaceAll(kept);
  console.log(`Resanitize [${profile.name}]: kept ${kept.length}/${jobs.length}`, reasons);
  r.close();
}
if (require.main === module) main();
module.exports = { main };
