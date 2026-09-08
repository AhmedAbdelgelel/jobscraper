'use strict';

function stripHtml(h) {
  return String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function queryTokens(query) {
  return String(query || '').toLowerCase().split(/[^a-z+#]+/).filter((t) => t.length > 2);
}

function itemMatches(item, tokens) {
  const hay = [item.position, item.company, (item.tags || []).join(' '), item.location].filter(Boolean).join(' ').toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

function mapItem(item) {
  const salary = item.salary_min || item.salary_max ? `${item.salary_min || '?'}-${item.salary_max || '?'}` : null;
  return {
    sourceJobId: String(item.id),
    title: item.position || '',
    company: item.company || '',
    location: item.location || 'Remote',
    salary,
    description: stripHtml(item.description).slice(0, 12000),
    requirements: '',
    technologies: Array.isArray(item.tags) ? item.tags : [],
    postedAt: item.date ? String(item.date).slice(0, 10) : null,
    url: item.url && item.url.startsWith('http') ? item.url : `https://remoteok.com${item.url || ''}`,
  };
}

module.exports = { stripHtml, queryTokens, itemMatches, mapItem };
