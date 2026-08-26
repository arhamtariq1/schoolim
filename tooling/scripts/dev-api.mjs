#!/usr/bin/env node
/**
 * Run the API in development: compile on change, and **actually start it**.
 *
 * The `dev` script used to be `tsc --watch` alone, which type-checks forever and
 * never listens on a port. `pnpm dev` therefore brought up two Next apps and no
 * API, and every page that needed data failed in a way that looked like a
 * frontend bug. Compiling is not running.
 *
 * Two processes rather than one: `tsc --watch` emits to `dist`, and
 * `node --watch` restarts when it does. Spawned from Node rather than chained
 * with `&` in a package script, because that operator does not mean the same
 * thing in cmd.exe as it does in sh.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'api');
const entry = join(apiDir, 'dist', 'main.js');

const children = [];

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: apiDir,
    stdio: 'inherit',
    // Required on Windows: tsc and node resolve through the shell's PATHEXT.
    shell: process.platform === 'win32',
    ...options,
  });
  children.push(child);
  return child;
}

function shutdown(code) {
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(0);
  });
}

const compiler = run('tsc', ['-p', 'tsconfig.json', '--watch', '--preserveWatchOutput']);
compiler.on('exit', (code) => {
  console.error(`\nCompiler exited (${String(code)}).`);
  shutdown(code ?? 1);
});

/**
 * `node --watch` on a file that does not exist yet exits immediately, so wait
 * for the first emit rather than racing it.
 */
async function startWhenBuilt() {
  const deadline = Date.now() + 120_000;
  while (!existsSync(entry)) {
    if (Date.now() > deadline) {
      console.error('Timed out waiting for the first compile.');
      shutdown(1);
    }
    await new Promise((wake) => setTimeout(wake, 250));
  }

  const server = run('node', ['--watch', '--watch-preserve-output', 'dist/main.js']);
  server.on('exit', (code) => {
    console.error(`\nAPI exited (${String(code)}).`);
    shutdown(code ?? 1);
  });
}

void startWhenBuilt();
