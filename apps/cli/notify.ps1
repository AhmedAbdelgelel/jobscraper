# Sends latest export via Gmail SMTP.
# Setup:
# 1. Create Gmail App Password: myaccount.google.com/apppasswords
# 2. Copy .env.example to .env and fill GMAIL_USER + GMAIL_APP_PASS
#    (or $env:GMAIL_USER / $env:GMAIL_APP_PASS), and set email.to in
#    jobscrapper.config.json (see jobscrapper.config.example.json)
# 3. powershell -File apps/cli/notify.ps1 [-To someone@mail.com]
param([string]$To = "")
if (-not $To -and (Test-Path "jobscrapper.config.json")) {
  try { $To = (Get-Content "jobscrapper.config.json" | ConvertFrom-Json).email.to } catch {}
}
if (-not $To) { $To = $env:JOBS_EMAIL_TO }
if (-not $To) { throw "No recipient: pass -To, set email.to in jobscrapper.config.json, or set JOBS_EMAIL_TO" }
if (-not $env:GMAIL_USER -and (Test-Path ".env")) {
  Get-Content ".env" | ForEach-Object { if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)\s*$') { $k = $Matches[1].Trim(); $v = $Matches[2].Trim().Trim('"', "'"); if (-not (Get-Item "env:$k" -ErrorAction SilentlyContinue)) { Set-Item "env:$k" $v } } }
}
node apps/cli/index.js --max-pages 2
node apps/cli/export.js
$csv = Get-ChildItem exports/*.csv | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Send-MailMessage -To $To -From $env:GMAIL_USER -Subject "Jobs digest $($csv.LastWriteTime)" -Body "Latest scrape attached. File: $($csv.Name)" -Attachments $csv.FullName -SmtpServer "smtp.gmail.com" -Port 587 -UseSsl -Credential (New-Object PSCredential($env:GMAIL_USER, (ConvertTo-SecureString $env:GMAIL_APP_PASS -AsPlainText -Force)))
