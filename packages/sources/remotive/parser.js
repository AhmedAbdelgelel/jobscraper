'use strict';

function stripHtml(h) {
  return String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function mapItem(item) {
  return {
    sourceJobId: String(item.id),
    title: item.title || '',
    company: item.company_name || '',
    location: item.candidate_required_location || 'Remote',
    employmentType: item.job_type || null,
    description: stripHtml(item.description).slice(0, 12000),
    requirements: '',
    technologies: Array.isArray(item.tags) ? item.tags : [],
    postedAt: item.publication_date ? String(item.publication_date).slice(0, 10) : null,
    url: item.url || '',
  };
}

module.exports = { stripHtml, mapItem };
