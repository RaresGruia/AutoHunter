import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';

// Prints locations and rule names only, never a matched credential or raw patch.
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const configured = [];
for (const file of ['.env', 'mobile/.env'])
  if (existsSync(file)) {
    const values = parseEnv(readFileSync(file, 'utf8'));
    for (const [name, value] of Object.entries(values))
      if (
        /KEY|TOKEN|SECRET|PASSWORD/.test(name) &&
        value.length >= 20 &&
        !/your[-_ ]|placeholder|replace[-_ ]/i.test(value)
      )
        configured.push(value);
  }
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['brave-key', /\bBSA[A-Za-z0-9_-]{25,}\b/],
  ['aws-key', /\bAKIA[A-Z0-9]{16}\b/],
  ['personal-windows-path', /[A-Z]:[\\/]Users[\\/][^\\/\s\"']+/i],
  ['marketplace-photo-cdn', /olxcdn\.com/i],
];
const findings = [];
const scan = (label, buffer) => {
  for (const secret of configured)
    if (buffer.includes(secret)) findings.push({ file: label, rule: 'configured-secret' });
  for (const [name, pattern] of rules) if (pattern.test(buffer)) findings.push({ file: label, rule: name });
};
const files = [
  ...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)),
];
const forbiddenRaw =
  /^(?:API_LIVE_(?:RESPONSE|HEALTH)\.json|detail-probe\.html|truth-.*-probe\.html|truth-live-examples\.json)$/i;
for (const file of files) if (forbiddenRaw.test(file)) findings.push({ file, rule: 'raw-publisher-capture' });
let historicalPaths = '';
try {
  historicalPaths = git('log', '--all', '--name-only', '--format=');
} catch (error) {
  if (error.status !== 128) throw error;
}
for (const file of historicalPaths
  .split('\n')
  .map((name) => name.trim())
  .filter(Boolean))
  if (forbiddenRaw.test(file)) findings.push({ file, rule: 'raw-capture-in-history' });
let scanned = 0;
for (const file of files) {
  if (
    !existsSync(file) ||
    !/\.(?:[cm]?[jt]sx?|json|md|ya?ml|html|txt|example)$|(?:^|\/)\.gitignore$/.test(file)
  )
    continue;
  scan(file, readFileSync(file, 'utf8'));
  scanned++;
}
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
for (const file of tracked)
  if (/(?:^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith('.env.example'))
    findings.push({ file, rule: 'tracked-local-environment' });
scan('Git history', git('log', '--all', '--format=', '--patch'));
let remotes = '';
try {
  remotes = git('config', '--get-regexp', 'remote\..*\.url');
} catch (error) {
  if (error.status !== 1) throw Error('Could not inspect Git remotes');
}
if (/https?:\/\/[^\s/@]+:[^\s/@]+@/.test(remotes))
  findings.push({ file: '.git/config', rule: 'credential-in-remote-url' });
function artifacts(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) artifacts(file);
    else if (/\.(?:js|hbc|json|html)$/.test(file)) {
      const bytes = readFileSync(file);
      for (const secret of configured)
        if (bytes.includes(Buffer.from(secret))) findings.push({ file, rule: 'secret-in-build' });
    }
  }
}
artifacts('mobile/dist-demo-images');
artifacts('mobile/dist-android');
console.log(
  JSON.stringify(
    {
      scannedPublicFiles: scanned,
      historyScanned: true,
      configuredSecretsChecked: configured.length,
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
