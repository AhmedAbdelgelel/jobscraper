'use strict';

const crypto = require('crypto');
const { normalizeText } = require('./url-normalizer');

function jobFingerprint({ title, company, location, description, requirements, salary }) {
  const parts = [title, company, location, description, requirements, salary].map((x) => normalizeText(x || ''));
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function descriptionFingerprint(description) {
  return crypto.createHash('sha256').update(normalizeText(description || '').slice(0, 4000)).digest('hex');
}

module.exports = { jobFingerprint, descriptionFingerprint };
