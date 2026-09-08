'use strict';

const TRACKING_PARAMS = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','trackingid','ref','trk','refid','src','spm','fbclid','gclid','mc_cid','mc_eid','_ga','position','page','sort','euid']);

function canonicalizeUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw, 'https://example.com');
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(k.toLowerCase())) u.searchParams.delete(k);
    }
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
    let path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/') path = u.search ? u.pathname : '';
    const search = u.searchParams.toString();
    return `${u.protocol}//${u.host}${path}${search ? '?' + search : ''}`;
  } catch {
    return raw;
  }
}

function normalizeText(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

module.exports = { canonicalizeUrl, normalizeText, TRACKING_PARAMS };
