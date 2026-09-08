'use strict';
const fs = require('fs');
const path = require('path');
const { Repository } = require('@jobscrapper/storage/repository');

const EGYPT_RE = /egypt|cairo|giza|alexandria|mansoura|luxor|aswan|tanta|zagazig|ismailia|port said| suez|assiut|fayoum|beni suef|minya|sohag|qena|sharqia|gharbia|monufia|beheira|kafr|damietta|matrouh|sinai|red sea|new valley|qalyubia|مصر|القاهرة|الجيزة|الإسكندرية/i;

function activeCountry() {
  try {
    const { findConfigFile, loadConfigFile } = require('@jobscrapper/config/store');
    const p = findConfigFile();
    if (p) {
      const f = loadConfigFile(p);
      if (f.country) return f.country;
    }
  } catch {}
  try {
    const { config } = require('@jobscrapper/config/config');
    if (config.country) return config.country;
  } catch {}
  return 'Egypt';
}

function inCountry(location, country) {
  const loc = String(location || '');
  if (/^egypt$/i.test(String(country || ''))) return EGYPT_RE.test(loc);
  return new RegExp(country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(loc);
}

function groupOf(j, country = 'Egypt') {
  if (inCountry(j.location, country)) return `1-${String(country).toLowerCase()}`;
  if (j.remote === true) return '2-remote';
  return '3-other';
}

function ageBucket(postedAt, breaks = [1, 7]) {
  const [fresh = 1, week = 7] = breaks;
  if (!postedAt) return 'unknown';
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return 'unknown';
  const days = (Date.now() - t) / 86400000;
  if (days <= fresh) return '1-day';
  if (days <= week) return '1-week';
  return 'older';
}

function exportSettings() {
  try {
    const { findConfigFile, loadConfigFile } = require('@jobscrapper/config/store');
    const p = findConfigFile();
    if (p) {
      const f = loadConfigFile(p);
      if (f.export) return f.export;
    }
  } catch {}
  return {};
}

function esc(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

function main() {
  const country = activeCountry();
  const breaks = exportSettings().ageDays || [1, 7];
  const r = new Repository({});
  const jobs = r.all().map((j) => ({ ...j, group: groupOf(j, country), ageBucket: ageBucket(j.postedAt, breaks) }));
  r.close();
  const ts = (j) => { const t = Date.parse(j.postedAt); return Number.isNaN(t) ? -1 : t; };
  jobs.sort((a, b) => a.group.localeCompare(b.group) || ts(b) - ts(a) || String(a.title).localeCompare(String(b.title)));
  const dir = path.join(process.cwd(), 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const cols = ['group', 'ageBucket', 'title', 'company', 'location', 'remote', 'postedAt', 'experienceMin', 'experienceMax', 'employmentType', 'technologies', 'salary', 'source', 'relevance', 'descriptionComplete', 'url', 'scrapedAt', 'description'];
  const lines = [cols.join(',')];
  for (const j of jobs) lines.push(cols.map((c) => esc(Array.isArray(j[c]) ? j[c].join('; ') : j[c])).join(','));
  const csv = path.join(dir, `jobs-${stamp}.csv`);
  fs.writeFileSync(csv, '﻿' + lines.join('\n'), 'utf8');
  const groupLabel = (g) => g === '2-remote' ? 'REMOTE (WORLDWIDE)' : g === '3-other' ? 'OTHER LOCATIONS' : g.replace(/^1-/, '').toUpperCase() + ' — ALL MATCHING JOBS';
  let lastGroup = '';
  const rows = jobs.map((j) => {
    const h = j.group !== lastGroup ? `<tr><th colspan="${cols.length}" style="background:#eee">${groupLabel(j.group)}</th></tr>` : '';
    lastGroup = j.group;
    return h + `<tr>${cols.map((c) => `<td>${String(Array.isArray(j[c]) ? j[c].join(', ') : (j[c] ?? '')).replace(/</g, '&lt;').slice(0, 2000)}</td>`).join('')}</tr>`;
  }).join('');
  const html = `<html><head><meta charset="utf-8"><title>Jobs ${stamp}</title><style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px;font-size:12px}</style></head><body><h1>Scraped Jobs (${jobs.length}) — ${stamp}</h1><p>Order: ${country} first (newest first) → remote worldwide → other. Print to PDF from browser for PDF.</p><table><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>${rows}</table></body></html>`;
  const htmlPath = path.join(dir, `jobs-${stamp}.html`);
  fs.writeFileSync(htmlPath, html);
  const counts = {};
  for (const j of jobs) counts[j.group + '/' + j.ageBucket] = (counts[j.group + '/' + j.ageBucket] || 0) + 1;
  console.log(`Exported ${jobs.length} jobs:\n${csv}\n${htmlPath}`, counts);
}
if (require.main === module) main();
module.exports = { main, groupOf, ageBucket, inCountry, activeCountry };
