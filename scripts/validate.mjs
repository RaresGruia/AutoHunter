import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Finite validation only. Never await `api`, `expo start`, or a watcher here.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = process.argv.slice(2);
if (flags.some(flag => flag !== '--core')) throw new Error('Usage: npm run validate -- [--core]');
const coreOnly = flags.includes('--core');
const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const logDir = resolve(root, 'validation', coreOnly ? 'core' : '.');
await mkdir(logDir, { recursive: true });
const steps = [
  { name: 'backend-tests', cwd: root, args: [npmCli, 'test'], seconds: 60 },
  { name: 'backend-build', cwd: root, args: [npmCli, 'run', 'build'], seconds: 60 },
  { name: 'backend-typecheck', cwd: root, args: [npmCli, 'run', 'typecheck'], seconds: 60 },
  { name: 'mobile-tests', cwd: resolve(root, 'mobile'), args: [npmCli, 'test'], seconds: 60 },
  { name: 'mobile-typecheck', cwd: resolve(root, 'mobile'), args: [npmCli, 'run', 'typecheck'], seconds: 60 },
  { name: 'expo-export', cwd: resolve(root, 'mobile'), args: ['node_modules/expo/bin/cli', 'export', '--platform', 'android', '--platform', 'web'], seconds: 120 },
  { name: 'cli-fixture', cwd: root, args: [npmCli, 'run', 'search', '--', '--fixture'], seconds: 45 },
  { name: 'http-smoke', cwd: root, args: ['scripts/api-smoke.mjs'], seconds: 30 },
  { name: 'demo-api', cwd: root, args: ['scripts/demo-api-smoke.mjs'], seconds: 30 },
].filter(step => !coreOnly || step.name.startsWith('backend-') || step.name.startsWith('mobile-'));
function stopTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Only the PID spawned by this validator and its children; no existing user servers.
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
  } else child.kill('SIGKILL');
}
async function run(step) {
  console.log(`${step.name}: start (limit ${step.seconds}s)`);
  const started = Date.now();
  let output = '', timedOut = false;
  const child = spawn(process.execPath, step.args, { cwd: step.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', CI: '1' } });
  const capture = chunk => { output += chunk.toString(); };
  child.stdout.on('data', capture); child.stderr.on('data', capture);
  let hardStop;
  const code = await new Promise(resolveExit => {
    const timer = setTimeout(() => {
      timedOut = true; stopTree(child);
      hardStop = setTimeout(() => resolveExit(124), 5000);
    }, step.seconds * 1000);
    child.once('error', error => { output += String(error); clearTimeout(timer); resolveExit(1); });
    child.once('close', exit => { clearTimeout(timer); clearTimeout(hardStop); resolveExit(timedOut ? 124 : exit ?? 1); });
  });
  await writeFile(resolve(logDir, `${step.name}.log`), output);
  const result = { step: step.name, code, timedOut, durationMs: Date.now() - started };
  console.log(`${step.name}: ${code === 0 ? 'PASS' : 'FAIL'} (${result.durationMs}ms)`);
  if (code !== 0 || step.name.endsWith('tests') || step.name === 'http-smoke') console.log(output.trim().split(/\r?\n/).slice(-12).join('\n'));
  return result;
}
const results = [];
for (const step of steps) {
  const result = await run(step); results.push(result);
  if (result.code !== 0) { process.exitCode = result.code; break; }
}
await writeFile(resolve(logDir, 'summary.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log(`Validation ${results.length === steps.length && results.every(result => result.code === 0) ? 'complete' : 'failed'}. Logs: ${logDir}`);
