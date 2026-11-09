// Parse-scan every .ts/.tsx/.js/.jsx under frontend/src, test, e2e with oxc-parser.
// Reports syntax errors introduced by translations. Exit code 1 if any errors.
// Usage: node translation/scripts/parse_scan.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const FRONTEND = join(ROOT, 'frontend');
const OUT = join(dirname(HERE), 'parse-errors.txt');

const require2 = createRequire(join(FRONTEND, 'package.json'));
const { parseSync } = require2('oxc-parser');

function sourceFiles(dir) {
  const { readdirSync } = require2('node:fs');
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.[jt]sx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = [
  ...sourceFiles(join(FRONTEND, 'src')),
  ...sourceFiles(join(FRONTEND, 'test')),
  ...sourceFiles(join(FRONTEND, 'e2e')),
].map(p => p.replaceAll('\\', '/')).sort();

const errors = [];
for (const rel of files) {
  const abs = join(FRONTEND, rel);
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { continue; }
  const parsed = parseSync(rel, src);
  for (const e of parsed.errors ?? []) {
    errors.push(`${rel}: ${String(e.message).slice(0, 160)}`);
  }
}
writeFileSync(OUT, errors.join('\n'), 'utf8');
const n = new Set(errors.map(e => e.split(':')[0])).size;
console.log(`files with parse errors: ${n}, total errors: ${errors.length}`);
process.exitCode = errors.length ? 1 : 0;
