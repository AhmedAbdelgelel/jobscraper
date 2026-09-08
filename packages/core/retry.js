'use strict';

const MAX_RETRIES = 5;

function classifyError(err) {
  const msg = String(err && (err.message || err.code || err)).toLowerCase();
  const status = err && (err.status || err.statusCode);
  if (status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) return 'rate-limited';
  if (status === 403 || msg.includes('captcha') || msg.includes('blocked') || msg.includes('forbidden') || msg.includes('access denied')) return 'blocked';
  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('econn') || msg.includes('socket') || msg.includes('network') || msg.includes('fetch failed')) return 'network-error';
  if (msg.includes('parse') || msg.includes('invalid html') || msg.includes('unexpected token')) return 'parsing-error';
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) return 'non-retryable';
  return 'retryable';
}

function backoffMs(attempt, base = 1000, max = 8000) {
  const exp = Math.min(max, base * Math.pow(2, attempt - 1));
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}

async function withRetry(fn, { maxRetries = MAX_RETRIES, baseMs = 1000, maxMs = 8000, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const kind = classifyError(err);
      if (kind === 'non-retryable' || kind === 'blocked' || kind === 'parsing-error') throw Object.assign(err, { kind, attempt });
      if (attempt >= maxRetries) throw Object.assign(err, { kind, attempt });
      const wait = backoffMs(attempt, baseMs, maxMs);
      if (onRetry) onRetry({ attempt, wait, kind, error: err });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function fetchWithTimeout(url, { timeoutMs = 15000, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeoutMs}ms: ${url}`)), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { MAX_RETRIES, classifyError, backoffMs, withRetry, fetchWithTimeout };
