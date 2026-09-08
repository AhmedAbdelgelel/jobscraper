'use strict';
// Re-applies the active profile's production gate to all stored jobs
// (uses stored full descriptions). Usage: node src/refilter.js [--profile name]
const { Repository } = require('@jobscrapper/storage/repository');
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
    const g = passesFilters(j, profile);
    if (!g.accept) {
      const k = `${g.stage}:${g.reason}`;
      reasons[k] = (reasons[k] || 0) + 1;
      continue;
    }
    j.relevance = g.relevance;
    kept.push(j);
  }
  r.replaceAll(kept);
  console.log(`Refilter [${profile.name}]: kept ${kept.length}/${jobs.length}`, reasons);
  r.close();
}
if (require.main === module) main();
module.exports = { main };
