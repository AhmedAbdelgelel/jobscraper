# jobscrapper

Finds **junior Node.js backend jobs (0–2 years)** across LinkedIn, Wuzzuf,
Indeed, Glassdoor, RemoteOK, Arbeitnow and Remotive — then filters, dedupes
and exports them to Excel. Zero runtime dependencies (Node 18+).

```bash
npm install     # link workspaces (no external packages)
npm test        # 45 checks — keep green
npm run scrape  # run it (add --email you@mail.com to get the file)
```

---

## 1. Configure it for you (no code)

### Step 1 — create your config file

```bash
cp jobscrapper.config.example.json jobscrapper.config.json
```

```jsonc
{
  "profile": "egypt-junior",   // which filter set to use (see §3)
  "country": "Egypt",          // your country: searched + listed first
  "locations": ["Egypt"],      // extra location rounds (per query, LinkedIn/Indeed)
  "queries": ["Node.js Backend Developer", "Junior Node.js Developer" /* … */],
  "remoteQueries": ["Remote Node.js Developer" /* … */],
  "profiles": {                // override/extend any profile, per user
    "egypt-junior": {
      "maxAgeDays": 90, "remoteOnly": false,
      "extraSeniorTitles": [], "extraMidTitles": [], "extraRejectPatterns": []
    }
  },
  "sources": {                 // enable + tune each site independently
    "linkedin":  { "enabled": true,  "maxPages": 3 },
    "wuzzuf":    { "enabled": true,  "maxPages": 1 },
    "indeed":    { "enabled": true,  "maxPages": 1 },
    "glassdoor": { "enabled": false },   // burst rate-limits; enable occasionally
    "remoteok":  { "enabled": false },   // feed currently degraded
    "arbeitnow": { "enabled": true,  "maxPages": 5 },
    "remotive":  { "enabled": true,  "maxPages": 1 }
  },
  "experience": { "min": 0, "max": 2 },
  "export": { "ageDays": [1, 7] },       // recency buckets: ≤1d, ≤1w, older
  "email": { "to": "you@mail.com", "sendAfterScrape": true },
  "schedule": { "everyHours": 4 }
}
```

Only include keys you want to change — everything else falls back to
built-ins (`packages/config/config.js`). **Every** behavior is file-driven:
`queries`, `remoteQueries`, `country`, `locations`, per-profile
`experience`/`maxAgeDays`/`remoteOnly`/`requireFullDescription`/
`titleScope`/`techAny`/`rejectSeniorTitles`/`rejectMidTitles`/
`rejectTalentPools`/`extraSeniorTitles`/`extraMidTitles`/
`extraRejectPatterns`, per-source `enabled`/`maxPages`/`maxJobsPerQuery`/
`concurrency`/`requestDelayMs`/`timeoutMs`/`maxRetries`, `scraping`,
`storage`, `export.ageDays`, `email`, `schedule`.
See `jobscrapper.config.example.json` — it shows all of them with values.

> **Email:** easiest is one command — `npm run scrape -- --email you@mail.com`
> (the `--` matters: without it npm eats the flag; a bare address still
> works as fallback). Watch for the `Email → …` line at startup — if it
> says off, no mail will come.
> First time without mail credentials, it asks for them in the terminal and
> offers to save to `.env`, so later runs need nothing extra. Or set it
> permanently: `"email": { "to": "you@mail.com", "sendAfterScrape": true }`
> in the config + `GMAIL_USER`/`GMAIL_APP_PASS` in `.env`.
> For a digest every 4h on Windows, schedule it:
> `schtasks /create /tn JobScraper /tr "powershell -File <path>\apps\cli\notify.ps1" /sc hourly /mo 4`.

### Step 2 — secrets (never in the config file)

```bash
cp .env.example .env   # then fill in:
```

```bash
GMAIL_USER=you@gmail.com                 # sender (needs an App Password)
GMAIL_APP_PASS=xxxx xxxx xxxx xxxx       # myaccount.google.com/apppasswords
JOB_PROFILE=egypt-junior                 # default profile if --profile omitted
CONFIG_PATH=./jobscrapper.config.json    # only if stored elsewhere
```

### Step 3 — run

```bash
npm run scrape                                            # everything, your profile
npm run scrape -- --email you@mail.com                    # scrape + file to inbox
npm run scrape -- --profile strict --max-pages 3
npm run scrape -- --source linkedin --query "NestJS Developer"
npm run scrape -- --remote-only --max-age-days 30 --dry-run
node apps/cli/index.js --help                             # all flags
```

**Precedence:** built-ins `< jobscrapper.config.json < CLI flags / env`.

| flag | what it does |
|---|---|
| `--source <name>` (repeatable) | run only these sites |
| `--query "..."` (repeatable) | replace the 14 built-in + 6 remote queries |
| `--max-pages N` | pages per query per site |
| `--profile <name>` | `egypt-junior` (default) \| `standard` \| `strict` \| `remote-strict` |
| `--email <address>` | send the file to this inbox when done |
| `--config <path>` | use a different config file |
| `--remote-only` | remote jobs only (overrides profile) |
| `--max-age-days N` | drop posts older than N days |
| `--max-exp N` | experience ceiling (default 2) |
| `--require-full-desc` | drop jobs whose full text couldn't be fetched |
| `--dry-run` | scrape + filter, save nothing |

---

## 2. How it works (the pipeline)

```text
queries (14 general + 6 remote + per-country rounds, per-source search/filter)
  → fetch with retry (exponential backoff + jitter, per-source rate limits)
  → parse (source-specific, isolated per site)
  → normalize to ONE schema (null when unknown, never invented)
  → title prefilter (obvious rejects skip the expensive detail fetch)
  → GATE (relevance → experience → verification → recency, §3)
  → deduplicate (run seen-set → source+id → canonical URL →
     company+title+location → fingerprint)
  → SQLite (+ JSON fallback), fingerprint detects edits, repeats skipped
  → export, ordered: YOUR COUNTRY first → remote worldwide → other
     (each newest-first: ≤1 day, ≤1 week, older)
```

One failing job/page/source never stops the rest (bounded worker pools,
per-source error isolation, structured JSON logs).

## 3. The filters (what “relevant” means)

Every job must pass `passesFilters()` (`packages/core/gate.js`):

1. **Relevance** — title must carry Node/Express/NestJS **or**
   backend/API/JavaScript **plus** node-stack tech
   (`node.js, express, nestjs, fastify, koa, hapi` — your `techAny` list)
   in the text. Rejected: `senior/sr/staff/lead/principal/architect/
   manager/SME` (incl. `sênior/sénior`), `mid/middle/pleno/intermediate`,
   talent-pools, Go/PHP/Java/Python-first roles — plus anything matching
   your `extraSeniorTitles` / `extraMidTitles` / `extraRejectPatterns`.
   A title-only prefilter applies the cheap checks before detail fetches.
2. **Experience** — *every* number in the **full** description is checked:
   ranges (`4-6 years`), `N+ years`, `at least/minimum N`, word forms
   (“three to five years”), in **EN/ES/PT/IT/DE/FR**
   (`4 y 5 años`, `al menos 5 años`, `3 anos de experiência`,
   `5 anni di esperienza`, `3 Jahre Erfahrung`, `2 ans d'expérience`).
   The **strictest** value wins; anything above your max is out.
   LinkedIn `Seniority level: Mid-Senior`-style fields are enforced too.
3. **Verification** — `strict`/`remote-strict` drop jobs whose full page
   couldn't be fetched (Indeed/Wuzzuf often 403 details); otherwise they're
   kept but flagged `descriptionComplete: FALSE` so you can see it.
4. **Recency/location** — `maxAgeDays` (default 90) drops stale posts;
   `remoteOnly` keeps remote roles; `country`/`locations` add
   location-targeted rounds so your country's on-site jobs surface.

## 4. Sources — honest status

| site | method | reality |
|---|---|---|
| LinkedIn | public guest API + detail pages (incl. `f_WT=2` worldwide-remote round) | ✅ works, full text |
| Wuzzuf | `/search` is bot-blocked; discovery via public sitemap + detail pages | ⚠️ partial (Egypt Node pool is small) |
| Indeed | cards work; details + deep pages often 403 | ⚠️ snippets only |
| Glassdoor | search parses, but burst 403s | ❌ off by default |
| RemoteOK | public API, feed currently non-tech | ❌ off by default |
| Arbeitnow / Remotive | public APIs, full text | ✅ work — but carry ~zero junior Node roles |

No CAPTCHA/auth/ToS bypasses, ever. Blocked sources log and continue.

## 5. Contribute (monorepo)

```text
apps/cli            scrape / export / refilter / backfill / resanitize / notify / mailer
packages/config     defaults, profiles, config file, .env, flag merging
packages/core       gate, classifier, experience-filter, normalizer,
                    deduplicator, crawler, retry, rate-limit, logger
packages/sources    one folder per site: scraper + parser + selectors
packages/storage    SQLite (node:sqlite) + JSON fallback, fingerprints
test/               node:test suites, fixtures only (no live calls)
```

**New source in 4 steps:** implement `BaseScraper`
(`search(query,{page})`, `scrapeJob(url)`, `normalize(raw)`)
→ tolerant `parser.js` + fixtures → register in
`packages/sources/registry.js` → defaults in `packages/config/config.js`.
Keep site logic out of `core/`, keep `npm test` green.
