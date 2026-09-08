'use strict';

function stripHtml(h) {
  return String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function toDate(v) {
  if (!v) return null;
  if (typeof v === 'number' || /^\d{9,10}$/.test(String(v).trim())) {
    const ms = Number(v) * 1000;
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).slice(0, 10);
  return /\d{4}-\d{2}-\d{2}/.test(s) ? s : null;
}

function queryTokens(query) {
  return String(query || '').toLowerCase().split(/[^a-z+#]+/).filter((t) => t.length > 2);
}

function itemMatches(item, tokens) {
  const hay = [item.title, item.company_name, (item.job_types || []).join(' '), item.location].filter(Boolean).join(' ').toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

function mapItem(item) {
  const types = Array.isArray(item.job_types) ? item.job_types.join(', ') : (item.job_types || null);
  return {
    sourceJobId: item.slug ? String(item.slug) : String(item.title),
    title: item.title || '',
    company: item.company_name || '',
    location: item.location || '',
    employmentType: types,
    description: stripHtml(item.description).slice(0, 12000),
    requirements: '',
    postedAt: toDate(item.created_at),
    technologies: Array.isArray(item.tags) ? item.tags : [],
    url: item.slug ? `https://www.arbeitnow.com/jobs/${item.slug}` : 'https://www.arbeitnow.com',
  };
}

module.exports = { stripHtml, queryTokens, itemMatches, mapItem };
