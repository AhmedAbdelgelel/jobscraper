'use strict';

function stripHtml(h) {
  return String(h || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&hellip;|&#8230;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(+n); } catch { return ''; } })
    .replace(/\s+/g, ' ').trim();
}

// Cleans LinkedIn SEO page titles into real job titles (EN/ES/PT/IT/DE/FR).
function sanitizeTitle(raw) {
  let t = stripHtml(raw);
  t = t.split(' | ')[0].split(' — ').slice(0, 1).join('').trim();
  t = t.replace(/\s*[—–-]\s*(United States|United Kingdom|India|España|Espana|Italia|Deutschland|France|Brasil|Portugal|Chile|México|Canada|Ireland|Poland|Ukraine).*/i, '').trim();
  let m;
  if ((m = t.match(/hiring\s+(.+?)\s+in\s+/i))) return m[1].trim();
  if ((m = t.match(/cargo\s+(?:de\s+)?(.+?)\s+en\s+/i))) return m[1].trim();
  if ((m = t.match(/contratando(?:\s+para\s+o\s+cargo\s+de)?\s*(.+?)\s+em:?\s+/i))) return m[1].trim();
  if ((m = t.match(/assumendo:\s*(.+)/i))) return m[1].trim();
  if ((m = t.match(/sucht\s+(.+?)\s+in\s+/i))) return m[1].trim();
  if ((m = t.match(/^(.+?)\s+na empresa\s+.+$/i))) return m[1].trim();
  if ((m = t.match(/^(.+?)\s+en\s+[A-ZÁÉÍÓÚÑÂÊÎÔÛÀÈÙÇÄÖÜ][\w\s.,-]*$/))) {
    if (/developer|engineer|desarrollador|desenvolvedor|développeur|ingegnere|ingeniero|node|backend|javascript|api/i.test(m[1])) return m[1].trim();
  }
  const bidi = t.replace(/[‎‏⁠⁤⁦⁧⁨⁩]/g, '');
  if ((m = bidi.match(/لوظيفة\s*(.+?)\s*في\s+/))) return m[1].trim();
  if ((m = t.match(/が(.+?)を募集中/))) return m[1].trim();
  if ((m = t.match(/^(.+?)\s+bei\s+\S+/i)) && !/developer|engineer|desarrollador/i.test(m[1])) return t;
  if ((m = t.match(/^(.+?)\s+at\s+\S.*$/i))) {
    const cand = m[1].trim();
    if (cand.length >= 4 && /developer|engineer|desarrollador|développeur|sviluppatore|entwickler|javascript|node|backend|api/i.test(cand)) return cand;
  }
  return t;
}

function first(block, res) {
  for (const re of res) {
    const m = block.match(re);
    if (m && stripHtml(m[1])) return stripHtml(m[1]);
  }
  return '';
}

function parseSearchPage(html) {
  const jobs = [];
  const seen = new Set();
  // Current markup: <li> cards with data-entity-urn="urn:li:jobPosting:ID"
  const cards = String(html || '').split(/data-entity-urn="urn:li:jobPosting:/);
  for (let i = 1; i < cards.length; i++) {
    const idM = cards[i].match(/^(\d+)/);
    if (!idM) continue;
    const id = idM[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const block = cards[i].slice(0, 8000);
    const title = first(block, [
      /base-search-card__title[^>]*>([\s\S]{1,300}?)<\/h3>/i,
      /job-card-list__title[^>]*>([\s\S]*?)</i,
      /sr-only[^>]*>([\s\S]{1,200}?)<\/span>/i,
    ]);
    const company = first(block, [
      /base-search-card__subtitle[^>]*>([\s\S]{1,1500}?)<\/h4>/i,
      /job-card-container__primary-description[^>]*>([\s\S]*?)</i,
    ]);
    const location = first(block, [
      /job-search-card__location[^>]*>([\s\S]{1,200}?)<\/span>/i,
      /job-card-container__metadata-item[^>]*>([\s\S]*?)</i,
    ]);
    const postedAt = (block.match(/job-search-card__listdate[^>]*datetime="([^"]+)"/i) || [])[1] || null;
    const href = (block.match(/base-card__full-link[^>]*href="([^"]+)"/i) || block.match(/href="([^"]*\/jobs\/view\/[^"]*)"/i) || [])[1];
    jobs.push({
      sourceJobId: id,
      title, company, location, postedAt,
      url: href ? href.replace(/&amp;/g, '&').split('?')[0].split('&')[0] : `https://www.linkedin.com/jobs/view/${id}/`,
    });
  }
  // Legacy fallback: data-occludable-job-id cards
  if (!jobs.length) {
    const liRe = /<li[\s\S]*?data-occludable-job-id="(\d+)"[\s\S]*?<\/li>/gi;
    let m;
    while ((m = liRe.exec(html))) {
      const block = m[0];
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const title = first(block, [/job-card-list__title[^>]*>([\s\S]*?)</i]);
      const company = first(block, [/job-card-container__primary-description[^>]*>([\s\S]*?)</i]);
      const location = first(block, [/job-card-container__metadata-item[^>]*>([\s\S]*?)</i]);
      const href = (block.match(/href="([^"]*\/jobs\/view\/[^"]*)"/i) || [])[1];
      jobs.push({ sourceJobId: id, title, company, location, postedAt: null, url: href ? href.split('?')[0] : `https://www.linkedin.com/jobs/view/${id}/` });
    }
  }
  // Last resort: any /jobs/view/ links
  if (!jobs.length) {
    const re = /\/jobs\/view\/[a-z0-9-]*?(\d{6,})/gi;
    let x;
    while ((x = re.exec(html))) {
      if (seen.has(x[1])) continue;
      seen.add(x[1]);
      jobs.push({ sourceJobId: x[1], title: '', company: '', location: '', postedAt: null, url: `https://www.linkedin.com/jobs/view/${x[1]}/` });
    }
  }
  return jobs;
}

function parseJobPage(html, url) {
  const get = (re) => stripHtml((html.match(re) || [])[1] || '');
  const rawTitle = get(/job-details-jobs-unified-top-card__job-title[^>]*>([\s\S]*?)<\/h1>/i)
    || get(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i);
  const title = sanitizeTitle(rawTitle || get(/<title>([\s\S]*?)<\/title>/i));
  const company = get(/topcard__org-name-link[^>]*>([\s\S]{1,200}?)<\/a>/i)
    || get(/job-card-container__primary-description[^>]*>([\s\S]*?)</i)
    || get(/jobs-unified-top-card__company-name[^>]*>([\s\S]*?)</i);
  const flavors = [];
  const flRe = /topcard__flavor--bullet[^>]*>([\s\S]{1,200}?)<\//gi;
  let fm;
  while ((fm = flRe.exec(html))) { const v = stripHtml(fm[1]); if (v) flavors.push(v); }
  const location = flavors.join(' · ') || get(/jobs-unified-top-card__bullet[^>]*>([\s\S]*?)</i);
  // Cut page chrome + related-job cards (they pollute classification).
  const cutAt = html.search(/similar-jobs|relatedJobs|jobs-you-may-like|people-also-viewed|show-more-less-html__markup[^>]*>\s*(About the company|About us)|<footer/i);
  const body = cutAt > 0 ? html.slice(0, cutAt) : html;
  // The real description is the longest show-more block (nav/boilerplate is short).
  let desc = '';
  const blocks = [...body.matchAll(/show-more-less-html__markup[^>]*>([\s\S]{1,60000}?)<\/div>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((s) => s.length > 200 && !/Skip to main content|Join or sign in/.test(s));
  if (blocks.length) desc = blocks.sort((a, b) => b.length - a.length)[0].slice(0, 12000);
  if (!desc) {
    const di = body.indexOf('description__text');
    const cand = stripHtml(body.slice(di > 0 ? di : 0, (di > 0 ? di : 0) + 30000)).slice(0, 12000);
    if (!/Skip to main content|Join or sign in/.test(cand)) desc = cand;
  }
  const employmentType = flavors.find((f) => /full[\s-]?time|part[\s-]?time|contract|internship|temporary/i.test(f)) || null;
  const idM = String(url || '').match(/(\d{6,})/);
  return { title, company, location, employmentType, description: cleanDescription(desc), requirements: '', url, sourceJobId: idM ? idM[1] : null };
}

// Removes LinkedIn page chrome (nav, login prompts, similar-jobs, footer)
// from an already-stripped description, in EN/ES/PT/IT/DE/FR/JA/AR.
// Similar-jobs/footer truncate (they always come last); login/nav
// sentences are DELETED (they appear before the real description too).
function cleanDescription(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  const truncates = [
    /empleos similares|similar jobs|vagas semelhantes|offerte di lavoro simili|ähnliche jobs|emplois similaires|ver m[aá]s empleos|show more jobs like this|people also viewed|otros perfiles vistos|altre offerte|weitere jobs|autres offres|as pessoas também visualizaram/i,
    /linkedin ©|referrals increase your chances|las recomendaciones duplican|indica[cç][oõ]es dobram|segnalazioni raddoppiano|empfehlungen verdoppeln/i,
    /similar searches|búsquedas similares|pesquisas semelhantes|ricerche simili|ähnliche suchen|recherches similaires/i,
  ];
  for (const re of truncates) {
    const i = t.search(re);
    if (i >= 0) { t = t.slice(0, i).trim(); }
  }
  const deletes = [
    /(ampliar búsqueda|expand search|expandir pesquisa|espandi ricerca|suche erweitern)[^.]{0,500}\./gi,
    /(pasar al contenido principal|pular para conte[úu]do principal|vai al contenuto principale|weiter zum hauptinhalt|skip to main content|التخطي إلى المحتوى الرئيسي|メインコンテンツにスキップ)\s*(linkedin\s*)?/gi,
    /sign in to (create|save|see|access|evaluate|personalize)[^.]{0,150}\./gi,
    /join (now|or sign in) to (find|save)[^.]{0,150}\./gi,
    /by clicking continue to join or sign in[^.]{0,300}\./gi,
    /new to linkedin\? join now/gi,
    /see who .*? has hired for this role[^.]{0,150}\./gi,
    /inicia sesión para[^.]{0,150}\./gi,
    /únete o inicia sesión para[^.]{0,150}\./gi,
    /al hacer clic en[^.]{0,300}\./gi,
    /descubre a quién[^.]{0,150}\./gi,
    /recibe notificaciones?[^.]{0,150}\./gi,
    /cadastre-se (para|ou)[^.]{0,150}\./gi,
    /ao clicar em continuar[^.]{0,300}\./gi,
    /veja quem[^.]{0,150}\./gi,
    /accedi per[^.]{0,150}\./gi,
    /melde dich an[^.]{0,150}\./gi,
    /wenn sie auf[^.]{0,300}\./gi,
    /werden sie mitglied[^.]{0,150}\./gi,
  ];
  for (const re of deletes) t = t.replace(re, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  const navBits = [/^(pasar al contenido principal|pular para conte[úu]do principal|vai al contenuto principale|weiter zum hauptinhalt|skip to main content|التخطي إلى المحتوى الرئيسي|メインコンテンツにスキップ)\s*/i,
    /(ampliar búsqueda|expandir pesquisa|espandi ricerca|suche erweitern|expand search)[^.]{0,400}?(empleos|vagas|lavoro|jobs|الوظائف|求人)/gi,
    /(borrar texto|limpar texto|cancella testo|text löschen|clear text)(\s*\1)+/gi,
    /(iniciar sesión|entrar|accedi|einloggen|sign in|تسجيل الدخول|サインイン)(\s*\1)+/gi,
    /(unirse ahora|únete ahora|cadastre-se|iscriviti ora|mitglied werden|join now|انضم الآن|今すぐ登録)(\s*\1)+/gi,
    /see who .* has hired for this role|descubre a qui[eé]n .* ha contratado|veja quem .* contratou/i,
  ];
  for (const re of navBits) t = t.replace(re, ' ').replace(/\s+/g, ' ').trim();
  const half = Math.floor(t.length / 2);
  if (half > 500 && t.slice(0, half).trim() === t.slice(half).trim()) t = t.slice(0, half).trim();
  return t;
}

module.exports = { parseSearchPage, parseJobPage, stripHtml, sanitizeTitle, cleanDescription };
