'use strict';
// User config file: jobscrapper.config.json (see jobscrapper.config.example.json).
// Precedence: built-in defaults < config file < CLI flags / env.
const fs = require('fs');

const CANDIDATES = ['jobscrapper.config.json', 'config.json', 'config/jobscrapper.json'];

function findConfigFile(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--config');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  if (process.env.CONFIG_PATH && fs.existsSync(process.env.CONFIG_PATH)) return process.env.CONFIG_PATH;
  for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

function loadConfigFile(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read config file "${path}": ${e.message}`);
  }
}

function applyFile(cfg, file = {}) {
  const out = { ...cfg };
  if (file.queries) out.queries = file.queries;
  if (file.remoteQueries) out.remoteQueries = file.remoteQueries;
  if (file.experience) out.experience = { ...out.experience, ...file.experience };
  if (file.country) out.country = file.country;
  if (file.locations) out.locations = file.locations;
  if (file.scraping) out.scraping = { ...out.scraping, ...file.scraping };
  if (file.sources) {
    out.sources = { ...out.sources };
    for (const [k, v] of Object.entries(file.sources)) out.sources[k] = { ...(out.sources[k] || {}), ...v };
  }
  if (file.profiles) {
    out.profiles = { ...(out.profiles || {}) };
    for (const [k, v] of Object.entries(file.profiles)) out.profiles[k] = { ...((out.profiles || {})[k] || {}), ...v };
  }
  if (file.profile) out.profileName = file.profile;
  if (file.email) out.email = { ...(out.email || {}), ...file.email };
  if (file.schedule) out.schedule = { ...(out.schedule || {}), ...file.schedule };
  if (file.export) out.export = { ...(out.export || {}), ...file.export };
  if (file.storage) out.storage = { ...(out.storage || {}), ...file.storage };
  return out;
}

function resolveProfileName(argv = process.argv.slice(2), cfg = {}) {
  const i = argv.indexOf('--profile');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  if (cfg.profileName) return cfg.profileName;
  if (process.env.JOB_PROFILE) return process.env.JOB_PROFILE;
  const { DEFAULT_PROFILE } = require('./profiles');
  return DEFAULT_PROFILE;
}

function resolveActiveProfile(argv = process.argv.slice(2), cfg = {}) {
  const { PROFILES, getProfile } = require('./profiles');
  let file = {};
  const p = findConfigFile(argv);
  if (p) { try { file = loadConfigFile(p); } catch (e) { console.error(e.message); } }
  const name = resolveProfileName(argv, { ...cfg, profileName: file.profile });
  const fileProfile = (file.profiles && file.profiles[name]) || {};
  return getProfile(name, { ...(PROFILES[name] || {}), ...fileProfile });
}

module.exports = { findConfigFile, loadConfigFile, applyFile, resolveProfileName, resolveActiveProfile };
