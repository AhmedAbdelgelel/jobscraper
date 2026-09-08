'use strict';
// Sends the export via Gmail SMTP using PowerShell (Windows).
// Credentials come from env (.env): GMAIL_USER + GMAIL_APP_PASS.
// Never throws for missing config — it just skips with a log line.
const { execFile } = require('child_process');
const { log } = require('@jobscrapper/core/logger');

function q(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

function buildScript({ to, subject, body, attachment }) {
  return [
    `$u = $env:GMAIL_USER; $p = $env:GMAIL_APP_PASS`,
    `if (-not $u -or -not $p) { Write-Error 'missing-mail-creds'; exit 3 }`,
    `$c = New-Object PSCredential($u, (ConvertTo-SecureString $p -AsPlainText -Force))`,
    `Send-MailMessage -To ${q(to)} -From $u -Subject ${q(subject)} -Body ${q(body)} -Attachments ${q(attachment)} -SmtpServer 'smtp.gmail.com' -Port 587 -UseSsl -Credential $c`,
  ].join('; ');
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
  });
}

// Single-command UX: `npm run scrape -- --email you@mail.com`.
// If mail credentials are missing, ask for them (terminal only) and
// offer to save to .env so next runs need nothing at all.
async function ensureCreds() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) return true;
  if (!process.stdin.isTTY) {
    console.log('Email skipped: set GMAIL_USER + GMAIL_APP_PASS in .env (see .env.example).');
    return false;
  }
  console.log('To email the file I need a Gmail sender (one time).');
  const user = process.env.GMAIL_USER || await ask('Gmail address: ');
  const pass = process.env.GMAIL_APP_PASS || await ask('Gmail App Password (myaccount.google.com/apppasswords): ');
  if (!user || !pass) return false;
  process.env.GMAIL_USER = user;
  process.env.GMAIL_APP_PASS = pass;
  const save = await ask('Save to .env for next time? [Y/n]: ');
  if (save.toLowerCase() !== 'n') {
    const fs = require('fs');
    let env = '';
    try { env = fs.readFileSync('.env', 'utf8'); } catch {}
    if (!/GMAIL_USER=/.test(env)) env += `\nGMAIL_USER=${user}\n`;
    if (!/GMAIL_APP_PASS=/.test(env)) env += `GMAIL_APP_PASS=${pass}\n`;
    fs.writeFileSync('.env', env);
    console.log('Saved to .env — next run needs only: npm run scrape');
  }
  return true;
}

function sendMail({ to, subject, body, attachment }) {
  return new Promise((resolve) => {
    if (!to) return resolve({ sent: false, reason: 'no-recipient' });
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
      log('EMAIL_SKIPPED', { reason: 'missing GMAIL_USER/GMAIL_APP_PASS' });
      console.log('Email skipped: set GMAIL_USER + GMAIL_APP_PASS in .env (see .env.example).');
      return resolve({ sent: false, reason: 'missing-creds' });
    }
    execFile('powershell', ['-NoProfile', '-Command', buildScript({ to, subject, body, attachment })], { timeout: 90000 }, (err) => {
      if (err) {
        log('EMAIL_FAILED', { error: String((err && err.message) || err) });
        return resolve({ sent: false, reason: 'send-failed' });
      }
      log('EMAIL_SENT', { to });
      resolve({ sent: true });
    });
  });
}

module.exports = { buildScript, sendMail, ensureCreds };
