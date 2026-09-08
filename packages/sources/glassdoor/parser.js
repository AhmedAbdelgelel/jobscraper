'use strict';

function stripHtml(h) {
  return String(h || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function first(card, res) {
  for (const re of res) {
    const m = card.match(re);
    if (m && stripHtml(m[1])) return { text: stripHtml(m[1]), raw: m[1] };
  }
  return { text: '', raw: '' };
}

function ageToDate(age) {
  if (!age) return null;
  const now = Date.now();
  let m = String(age).match(/(\d+)\s*h/);
  if (m) return new Date(now - (+m[1]) * 3600000).toISOString().slice(0, 10);
  m = String(age).match(/(\d+)\s*d/);
  if (m) return new Date(now - (+m[1]) * 86400000).toISOString().slice(0, 10);
  return null;
}

function parseSearchPage(html) {
  const jobs = [];
  const seen = new Set();
  const parts = String(html || '').split('data-jobid="');
  for (let i = 1; i < parts.length; i++) {
    const idM = parts[i].match(/^(\d+)/);
    if (!idM) continue;
    const id = idM[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const card = parts[i].slice(0, 15000);
    const hrefM = card.match(/JobCard_jobTitle__[^>]*href="([^"]+)"/);
    const title = first(card, [/JobCard_jobTitle__[^>]*>([^<]{1,200}?)<\//, /aria-label="([^"]{3,150})"/]);
    const titleText = title.text;
    const company = first(card, [/compactEmployerName__[^>]*>([^<]{1,150}?)<\//]);
    const location = first(card, [/JobCard_location__[^>]*>([^<]{1,150}?)<\//]);
    const salary = first(card, [/detailSalary[^>]*>([\s\S]{1,300}?)<\/div>/]);
    const snippet = first(card, [/jobDescriptionSnippet__[^>]*>([\s\S]{1,4000}?)<\/div>\s*<a/]);
    const age = first(card, [/JobCard_listingAge__[^>]*>([^<]{1,20})<\//]);
    const url = hrefM ? 'https://www.glassdoor.com' + hrefM[1].split('?')[0] + '?jl=' + id : `https://www.glassdoor.com/job-listing/?jl=${id}`;
    jobs.push({
      sourceJobId: id,
      title: titleText.replace(/^full details of\s+/i, '').trim(),
      company: company.text, location: location.text,
      salary: salary.text || null,
      description: snippet.text || `${titleText} ${company.text} ${location.text}`,
      postedAt: ageToDate(age.text),
      url,
    });
  }
  return jobs;
}

function parseJobPage(html, url) {
  const text = stripHtml(html).slice(0, 10000);
  const title = stripHtml((html.match(/<title>([\s\S]{0,200}?)<\/title>/) || [])[1] || '').split('|')[0].split('-')[0].trim();
  const idM = String(url || '').match(/(\d{6,})/);
  return { title, company: '', location: '', description: text, requirements: '', url, sourceJobId: idM ? idM[1] : url };
}

module.exports = { parseSearchPage, parseJobPage, stripHtml, ageToDate };
