'use strict';
// Minimal .env loader (no dependencies). Only fills missing vars.
const fs = require('fs');

function loadEnv(file = '.env') {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  const out = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !(k in process.env)) { process.env[k] = v; out[k] = v; }
  }
  return out;
}

module.exports = { loadEnv };
