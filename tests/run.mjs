// Dependency-free test runner: esbuild-bundles each tests/*.test.ts (esbuild
// ships with Vite; no test framework installed) then runs them through Node's
// built-in test runner. Usage: `npm test`.
import * as esbuild from 'esbuild';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const TESTS = 'tests';
const BUILD = path.join(TESTS, '.build');
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

const entries = readdirSync(TESTS).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(TESTS, f));
if (entries.length === 0) { console.error('No tests/*.test.ts files found.'); process.exit(1); }

await esbuild.build({
  entryPoints: entries,
  outdir: BUILD,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});

const outputs = readdirSync(BUILD).filter((f) => f.endsWith('.mjs')).map((f) => path.join(BUILD, f));
const res = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit' });
process.exit(res.status ?? 1);
