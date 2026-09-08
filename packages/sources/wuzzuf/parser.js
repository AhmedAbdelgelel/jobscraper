'use strict';
// Wuzzuf keyword search is bot-blocked (403); discovery uses public
// browse pages, details are fetched per job (200, parseable).

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

const SITEMAPS = ['https://wuzzuf.net/sitemap-job-1.xml'];
const STOPWORDS = new Set(['and', 'the', 'for', 'with']);

function slugOf(url) {
  const m = String(url).match(/\/p\/[a-z0-9]+-(.+?)\/?$/i);
  return (m ? m[1] : String(url)).toLowerCase();
}

function humanizeSlug(url) {
  return slugOf(url).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 120);
}

// Matches sitemap URLs against a free-text query using slug tokens.
function filterSitemapUrls(urls, query, limit = 50) {
  const tokens = String(query || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  const out = [];
  const seen = new Set();
  for (const url of urls) {
    const parts = slugOf(url).split('-');
    const hits = tokens.filter((t) => parts.some((p) => p.length > 2 && (p.includes(t) || t.includes(p))));
    if (hits.length >= 2) {
      const idM = String(url).match(/\/p\/([a-z0-9]+)/i);
      const id = idM ? idM[1] : url;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ sourceJobId: id, title: humanizeSlug(url), company: '', location: /saudi/i.test(url) ? 'Saudi Arabia' : 'Egypt', url: String(url).split('?')[0] });
      if (out.length >= limit) break;
    }
  }
  return out;
}

function parseSearchPage(html) {
  const jobs = [];
  const seen = new Set();
  // 1) Embedded page data (Next.js) often holds the full listing.
  const nextData = html.match(/__NEXT_DATA__[^>]*>([\s\S]{1,2000000}?)<\/script>/);
  if (nextData) {
    const re = /\{"title":"([^"\\]{3,150})"[^}]{0,800}?"companyName":"([^"\\]{1,100})"[^}]{0,800}?"url":"([^"\\]+)"[^}]{0,800}?"location":"([^"\\]{1,100})"/g;
    let m;
    while ((m = re.exec(nextData[1]))) {
      const url = m[3].startsWith('http') ? m[3] : 'https://wuzzuf.net' + m[3];
      const idM = url.match(/\/p\/([a-z0-9]+)/i);
      const id = idM ? idM[1] : url;
      if (seen.has(id)) continue;
      seen.add(id);
      jobs.push({ sourceJobId: id, title: m[1], company: m[2], location: m[4], url: url.split('?')[0] });
    }
    if (jobs.length) return jobs;
  }
  // 2) Anchor fallback: /jobs/p/ links with link text as title.
  const re = /<a[^>]+href="((?:\/jobs\/p\/[^"]+|https:\/\/wuzzuf\.net\/jobs\/p\/[^"]+))"[^>]*>([\s\S]{1,300}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    if (href.startsWith('/')) href = 'https://wuzzuf.net' + href;
    href = href.split('?')[0].split('#')[0];
    const idM = href.match(/\/p\/([a-z0-9]+)/i);
    const id = idM ? idM[1] : href;
    if (seen.has(id)) continue;
    seen.add(id);
    const slugLoc = (href.match(/-([a-z]+-egypt)\/?$/i) || [])[1];
    jobs.push({ sourceJobId: id, title: stripHtml(m[2]).slice(0, 200), company: '', location: slugLoc ? slugLoc.replace(/-/g, ' ') : 'Egypt', url: href });
  }
  return jobs;
}

function parseJobPage(html, url) {
  const get = (re) => stripHtml((html.match(re) || [])[1] || '');
  const og = (prop) => stripHtml((html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']{1,500})`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+property=["']og:${prop}["']`, 'i')) || [])[1] || '');
  const title = get(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i) || og('title');
  const company = first(html, [/company[^>]{0,200}?>([\s\S]{1,150}?)<\//i, /employer[^>]*>([\s\S]{1,150}?)<\//i]);
  const locM = String(url || '').match(/-([a-z]+(?:-[a-z]+)*-(?:egypt|saudi-arabia|uae|qatar|kuwait))\/?$/i);
  const location = locM ? locM[1].replace(/-/g, ' ') : (get(/location[^>]*>([\s\S]{1,120}?)<\//i) || 'Egypt');
  let desc = og('description');
  if (!desc || desc.length < 300) {
    const blocks = [...html.matchAll(/job-(?:description|requirements|details)[^>]*>([\s\S]{1,30000}?)<\/div>/gi)].map((m) => stripHtml(m[1])).filter((s) => s.length > 200);
    if (blocks.length) desc = blocks.sort((a, b) => b.length - a.length)[0].slice(0, 12000);
  }
  if (!desc) desc = stripHtml(html).slice(0, 8000);
  const idM = String(url || '').match(/\/p\/([a-z0-9]+)/i);
  return { title, company, location, description: desc, requirements: '', url, sourceJobId: idM ? idM[1] : url };
}

module.exports = { parseSearchPage, parseJobPage, stripHtml, filterSitemapUrls, slugOf, SITEMAPS };
