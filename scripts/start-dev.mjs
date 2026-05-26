import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const frontendArgs = ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'];
const backendArgs = ['run', 'backend'];
const frontendUrl = 'http://127.0.0.1:5173/';
const backendHealthUrl = 'http://127.0.0.1:8787/api/health';
const openBrowserEnabled = String(process.env.FCE_OPEN_BROWSER || 'true').toLowerCase() !== 'false';

function spawnService(label, args) {
  const command = isWindows ? 'cmd.exe' : npmCommand;
  const commandArgs = isWindows ? ['/c', npmCommand, ...args] : args;

  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR || '1',
    },
  });

  child.on('error', (error) => {
    console.error(`[${label}] failed to start:`, error);
  });

  return child;
}

const backend = spawnService('backend', backendArgs);
const frontend = spawnService('frontend', frontendArgs);
let browserOpened = false;

let shuttingDown = false;

async function waitForHttpOk(url, timeoutMs = 30000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Keep waiting.
    }
    await wait(intervalMs);
  }
  return false;
}

function openBrowser(url) {
  if (!isWindows) return;
  const child = spawn('cmd.exe', ['/c', 'start', '', url], {
    stdio: 'ignore',
    detached: true,
    shell: false,
    windowsHide: true,
  });
  child.unref();
}

async function openWhenReady() {
  if (!openBrowserEnabled || browserOpened) return;
  const [backendReady, frontendReady] = await Promise.all([
    waitForHttpOk(backendHealthUrl, 30000, 500),
    waitForHttpOk(frontendUrl, 45000, 500),
  ]);

  if (backendReady && frontendReady && !browserOpened && !shuttingDown) {
    browserOpened = true;
    openBrowser(frontendUrl);
    console.log(`[browser] opened ${frontendUrl}`);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of [backend, frontend]) {
    if (child && !child.killed) {
      child.kill(isWindows ? 'SIGTERM' : 'SIGINT');
    }
  }

  setTimeout(() => {
    for (const child of [backend, frontend]) {
      if (child && !child.killed) {
        child.kill('SIGKILL');
      }
    }
    process.exit(code);
  }, 1500).unref();
}

backend.on('close', (code) => {
  console.log(`[backend] exited with code ${code}`);
  shutdown(code ?? 1);
});

frontend.on('close', (code) => {
  console.log(`[frontend] exited with code ${code}`);
  shutdown(code ?? 1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting FCE local stack...');
console.log('Backend:  npm run backend');
console.log('Frontend: npm run dev -- --host 127.0.0.1 --strictPort');
openWhenReady().catch((error) => {
  console.error('[browser] failed to open automatically:', error);
});
