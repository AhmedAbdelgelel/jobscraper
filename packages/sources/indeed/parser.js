'use strict';

function stripHtml(h) {
  return String(h || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function first(html, res) {
  for (const re of res) {
    const m = html.match(re);
    if (m && stripHtml(m[1])) return stripHtml(m[1]);
  }
  return '';
}

function parseSearchPage(html) {
  const jobs = [];
  const seen = new Set();
  const parts = String(html || '').split(/data-jk="/);
  for (let i = 1; i < parts.length; i++) {
    const jk = parts[i].slice(0, 20).match(/^[a-zA-Z0-9]+/);
    if (!jk) continue;
    const id = jk[0];
    if (seen.has(id)) continue;
    seen.add(id);
    const card = parts[i].slice(0, 12000);
    const title = first(card, [
      /aria-label="([^"]{3,150})"/i,
      /class="[^"]*jcs-JobTitle[^"]*"[^>]*>([\s\S]{1,300}?)<\/a>/i,
      /jobTitle[^>]*>([\s\S]{1,200}?)<\//i,
      /title="([^"]{3,150})"/i,
    ]);
    const company = first(card, [
      /data-testid="company-name"[^>]*>([\s\S]{1,150}?)<\//i,
      /companyName[^>]*>([\s\S]{1,150}?)<\//i,
      /company_location[^>]*>([\s\S]{1,150}?)</i,
    ]);
    const location = first(card, [
      /data-testid="text-location"[^>]*>([\s\S]{1,150}?)<\//i,
      /companyLocation[^>]*>([\s\S]{1,150}?)<\//i,
      /location[^>]*>([\s\S]{1,120}?)<\//i,
    ]);
    const salary = first(card, [
      /salary-snippet[^>]*>([\s\S]{1,150}?)<\//i,
      /attribute_snippet[^>]*>([\s\S]{1,150}?)<\//i,
      /pay[^>]*>([\s\S]{1,120}?)<\//i,
    ]);
    const snippet = first(card, [
      /job-snippet[^>]*>([\s\S]{1,2000}?)<\/div>/i,
      /underShelfFooter[^>]*>([\s\S]{1,1000}?)<\/div>/i,
    ]);
    const cleanTitle = title.replace(/^full details of\s+/i, '').trim();
    jobs.push({ sourceJobId: id, title: cleanTitle, company, location, salary: salary || null, description: snippet || `${cleanTitle} ${company} ${location}`, url: `https://www.indeed.com/viewjob?jk=${id}` });
  }
  return jobs;
}

function parseJobPage(html, url) {
  const get = (re) => stripHtml((html.match(re) || [])[1] || '');
  const title = get(/jobsearch-JobInfoHeader-title[^>]*>([\s\S]*?)<\//i) || get(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const company = get(/companyName[^>]*>([\s\S]*?)<\//i);
  const desc = get(/jobsearch-jobDescriptionText[^>]*>([\s\S]*?)<\/div>/i) || stripHtml(html).slice(0, 8000);
  const jk = (String(url).match(/jk=([a-zA-Z0-9]+)/) || [])[1] || null;
  return { title, company, location: '', description: desc, requirements: '', url, sourceJobId: jk || url };
}

module.exports = { parseSearchPage, parseJobPage, stripHtml };
