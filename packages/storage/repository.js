'use strict';

const fs = require('fs');
const path = require('path');

class Repository {
  constructor({ dbPath = './data/jobs.db', jsonFallback = './data/jobs.json' } = {}) {
    this.dbPath = dbPath; this.jsonPath = jsonFallback;
    this.useSqlite = false; this.db = null; this.store = new Map();
    this.init();
  }
  init() {
    try {
      const { DatabaseSync } = require('node:sqlite');
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, company TEXT, location TEXT, remote INTEGER, employmentType TEXT, experienceMin INTEGER, experienceMax INTEGER, description TEXT, requirements TEXT, technologies TEXT, salary TEXT, source TEXT, sourceJobId TEXT, url TEXT, canonicalUrl TEXT, postedAt TEXT, scrapedAt TEXT, fingerprint TEXT, relevance TEXT, UNIQUE(source, sourceJobId));
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_canonical ON jobs(canonicalUrl);
        CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
        CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(title);
        CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs(postedAt);
        CREATE TABLE IF NOT EXISTS scrape_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, startedAt TEXT, finishedAt TEXT, summary TEXT);
        CREATE TABLE IF NOT EXISTS scrape_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, runId INTEGER, source TEXT, url TEXT, error TEXT, at TEXT);
      `);
      this.useSqlite = true;
    } catch {
      fs.mkdirSync(path.dirname(this.jsonPath), { recursive: true });
      if (fs.existsSync(this.jsonPath)) {
        try { for (const j of JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'))) this.store.set(`${j.source}:${j.sourceJobId || j.canonicalUrl}`, j); } catch {}
      }
    }
  }
  persistJson() {
    if (this.useSqlite) return;
    fs.writeFileSync(this.jsonPath, JSON.stringify([...this.store.values()], null, 2));
  }
  isProcessed(source, idOrUrl) {
    if (this.useSqlite) {
      const r = this.db.prepare('SELECT 1 FROM jobs WHERE source=? AND (sourceJobId=? OR canonicalUrl=? OR url=?) LIMIT 1').get(source, String(idOrUrl), String(idOrUrl), String(idOrUrl));
      return !!r;
    }
    return this.store.has(`${source}:${idOrUrl}`);
  }
  upsert(job) {
    if (this.useSqlite) {
      const existing = this.db.prepare('SELECT * FROM jobs WHERE source=? AND sourceJobId=?').get(job.source, job.sourceJobId)
        || this.db.prepare('SELECT * FROM jobs WHERE canonicalUrl=?').get(job.canonicalUrl);
      if (!existing) {
        this.db.prepare(`INSERT INTO jobs (title,company,location,remote,employmentType,experienceMin,experienceMax,description,requirements,technologies,salary,source,sourceJobId,url,canonicalUrl,postedAt,scrapedAt,fingerprint,relevance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(job.title, job.company, job.location, job.remote ? 1 : 0, job.employmentType, job.experienceMin, job.experienceMax, job.description, job.requirements, JSON.stringify(job.technologies || []), job.salary, job.source, job.sourceJobId, job.url, job.canonicalUrl, job.postedAt, job.scrapedAt, job.fingerprint, job.relevance);
        return 'new';
      }
      if (existing.fingerprint !== job.fingerprint) {
        this.db.prepare('UPDATE jobs SET title=?,company=?,location=?,description=?,requirements=?,technologies=?,salary=?,fingerprint=?,scrapedAt=? WHERE id=?')
          .run(job.title, job.company, job.location, job.description, job.requirements, JSON.stringify(job.technologies || []), job.salary, job.fingerprint, job.scrapedAt, existing.id);
        return 'updated';
      }
      return 'duplicate';
    }
    const key = `${job.source}:${job.sourceJobId || job.canonicalUrl}`;
    const ex = this.store.get(key);
    if (!ex) { this.store.set(key, { ...job }); this.persistJson(); return 'new'; }
    if (ex.fingerprint !== job.fingerprint) { this.store.set(key, { ...ex, ...job }); this.persistJson(); return 'updated'; }
    if (JSON.stringify(ex) !== JSON.stringify({ ...ex, ...job })) { this.store.set(key, { ...ex, ...job }); this.persistJson(); return 'updated'; }
    return 'duplicate';
  }
  remove(source, sourceJobId) {
    if (this.useSqlite) {
      const r = this.db.prepare('DELETE FROM jobs WHERE source=? AND sourceJobId=?').run(source, String(sourceJobId));
      return r.changes > 0;
    }
    const key = `${source}:${sourceJobId}`;
    const ok = this.store.delete(key);
    if (ok) this.persistJson();
    return ok;
  }
  all() {
    if (this.useSqlite) return this.db.prepare('SELECT * FROM jobs ORDER BY scrapedAt DESC').all();
    return [...this.store.values()].map((j) => ({ ...j, technologies: Array.isArray(j.technologies) ? [...j.technologies] : j.technologies }));
  }
  replaceAll(jobs) {
    if (this.useSqlite) {
      this.db.prepare('DELETE FROM jobs').run();
      for (const j of jobs) this.upsert(j);
      return;
    }
    this.store = new Map(jobs.map((j) => [`${j.source}:${j.sourceJobId || j.canonicalUrl}`, { ...j }]));
    this.persistJson();
  }
  close() { if (this.db) this.db.close(); }
}

module.exports = { Repository };
