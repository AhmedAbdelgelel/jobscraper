'use strict';

const { normalizeText, canonicalizeUrl } = require('./url-normalizer');
const { descriptionFingerprint } = require('./fingerprint');

class Deduplicator {
  constructor() {
    this.bySourceId = new Set();
    this.byUrl = new Set();
    this.byTriple = new Set();
    this.byDesc = new Set();
  }
  key(job) {
    if (job.source && job.sourceJobId) {
      const k = `${job.source}:${job.sourceJobId}`;
      if (this.bySourceId.has(k)) return { duplicate: true, via: 'source+id' };
    }
    const cu = canonicalizeUrl(job.canonicalUrl || job.url);
    if (cu) {
      if (this.byUrl.has(cu)) return { duplicate: true, via: 'url' };
    }
    const triple = [normalizeText(job.company), normalizeText(job.title), normalizeText(job.location)].join('|');
    if (triple.replace(/\|/g, '') && this.byTriple.has(triple)) return { duplicate: true, via: 'triple' };
    const df = descriptionFingerprint(job.description || '');
    if ((job.description || '').length > 200 && this.byDesc.has(df)) return { duplicate: true, via: 'fingerprint' };
    return { duplicate: false };
  }
  add(job) {
    if (job.source && job.sourceJobId) this.bySourceId.add(`${job.source}:${job.sourceJobId}`);
    const cu = canonicalizeUrl(job.canonicalUrl || job.url);
    if (cu) this.byUrl.add(cu);
    const triple = [normalizeText(job.company), normalizeText(job.title), normalizeText(job.location)].join('|');
    if (triple.replace(/\|/g, '')) this.byTriple.add(triple);
    if ((job.description || '').length > 200) this.byDesc.add(descriptionFingerprint(job.description));
  }
}

module.exports = { Deduplicator };
