import { spawn } from 'node:child_process';

const projectRoot = new URL('../', import.meta.url);
const server = spawn(
  process.execPath,
  [
    './node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ],
  { cwd: projectRoot, stdio: 'inherit', windowsHide: true },
);

function waitForExit(child) {
  return new Promise((resolve) => child.once('exit', resolve));
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error('Preview server exited before startup.');
    try {
      const response = await fetch('http://127.0.0.1:4173/');
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the preview server.');
}

async function stopServer() {
  if (server.exitCode !== null) return;
  const exited = waitForExit(server);
  server.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await exited;
  }
}

let exitCode;
try {
  await waitForServer();
  const tests = spawn(
    process.execPath,
    ['./node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    {
      cwd: projectRoot,
      env: { ...process.env, HAND_CRICKET_E2E_SERVER: 'external' },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  exitCode = await waitForExit(tests);
} finally {
  await stopServer();
}

process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
