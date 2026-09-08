'use strict';

// Per-user filter profiles. Each person picks a profile (--profile <name>
// or JOB_PROFILE env) to control what counts as "their" job.
// Copy + edit to make your own.
const NODE_STACK = ['node.js', 'nodejs', 'express', 'nestjs', 'nest.js', 'fastify', 'koa', 'hapijs', 'hapi'];

const PROFILES = {
  // This user's setup: junior Node backend, remote first, Egypt on-site ok.
  'egypt-junior': {
    experience: { min: 0, max: 2 },
    rejectSeniorTitles: true,
    rejectMidTitles: true,
    rejectTalentPools: true,
    titleScope: 'node-backend',
    techAny: NODE_STACK,
    requireFullDescription: false,
    remoteOnly: false,
    maxAgeDays: 90,
  },
  standard: {
    experience: { min: 0, max: 2 },
    rejectSeniorTitles: true,
    rejectMidTitles: false,
    rejectTalentPools: true,
    titleScope: 'node-backend',
    techAny: NODE_STACK,
    requireFullDescription: false,
    remoteOnly: false,
  },
  strict: {
    experience: { min: 0, max: 2 },
    rejectSeniorTitles: true,
    rejectMidTitles: true,
    rejectTalentPools: true,
    titleScope: 'node-backend',
    techAny: NODE_STACK,
    requireFullDescription: true,
    remoteOnly: false,
  },
  'remote-strict': {
    experience: { min: 0, max: 2 },
    rejectSeniorTitles: true,
    rejectMidTitles: true,
    rejectTalentPools: true,
    titleScope: 'node-backend',
    techAny: NODE_STACK,
    requireFullDescription: true,
    remoteOnly: true,
  },
};

const DEFAULT_PROFILE = 'egypt-junior';

function activeProfileName(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--profile');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  if (process.env.JOB_PROFILE) return process.env.JOB_PROFILE;
  return DEFAULT_PROFILE;
}

function getProfile(name, extra = {}) {
  const base = PROFILES[name];
  if (!base && !extra._custom) throw new Error(`unknown profile "${name}" (available: ${Object.keys(PROFILES).join(', ')})`);
  return { name, ...(base || PROFILES[DEFAULT_PROFILE]), ...extra };
}

module.exports = { PROFILES, DEFAULT_PROFILE, activeProfileName, getProfile, NODE_STACK };
