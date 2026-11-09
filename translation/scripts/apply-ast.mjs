// AST-exact application of zh→en maps to frontend sources.
// Replaces ONLY string literals / template literals / JSX text (S spans) and
// comment spans (C spans) whose raw slice matches a map key byte-for-byte.
// Never touches import sources, property keys, or other code positions.
//
// Usage: node translation/scripts/apply-ast.mjs map.json [map2.json ...] [--exclude rel/path ...] [--scan]
//   --scan   do not write; only report per-file remaining CJK spans and counts
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRANSLATION = dirname(HERE);
const ROOT = dirname(TRANSLATION);
const FRONTEND = join(ROOT, 'frontend');
const require2 = createRequire(join(FRONTEND, 'package.json'));
const { parseSync } = require2('oxc-parser');

const CJKP = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff01-\uff20\uff3b-\uff40\uff5b-\uff65\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00b7]/;

const args = process.argv.slice(2);
const maps = [];
const excludes = new Set();
let scan = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--exclude') { excludes.add(args[++i]); continue; }
  if (args[i] === '--scan') { scan = true; continue; }
  maps.push(JSON.parse(readFileSync(args[i], 'utf8')));
}
const map = Object.assign({}, ...maps);

function* walk(node, parent, key) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) yield* walk(item, parent, key); return; }
  const machine = (parent?.type === 'ImportDeclaration' || parent?.type?.startsWith('Export')) && key === 'source'
    || key === 'key' && !parent?.computed;
  if (!machine && node.type === 'Literal' && typeof node.value === 'string') yield { type: 'S', start: node.start, end: node.end };
  if (node.type === 'TemplateLiteral') yield { type: 'S', start: node.start, end: node.end };
  if (node.type === 'JSXText' && node.value.trim()) yield { type: 'S', start: node.start, end: node.end };
  for (const [childKey, child] of Object.entries(node)) {
    if (childKey === 'comments') continue;
    yield* walk(child, node, childKey);
  }
}

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

const report = { replaced: 0, files: {}, remaining: {}, excluded: {} };
for (const abs of files) {
  const rel = abs.slice(FRONTEND.length + 1);
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { continue; }
  if (!CJKP.test(src)) continue;
  if (excludes.has(rel)) { report.excluded[rel] = 'kept as-is'; continue; }
  const parsed = parseSync(rel, src);
  if (parsed.errors?.length) throw new Error(`parse errors in ${rel}: ${JSON.stringify(parsed.errors).slice(0, 300)}`);
  const spans = [];
  for (const item of walk(parsed.program, null, null)) spans.push([item.start, item.end, item.type]);
  const kept = spans.filter(([a, b]) => !spans.some(([c, d]) => (c < a && b <= d) || (c <= a && b < d)));
  const comments = (parsed.comments ?? [])
    .filter(c => !kept.some(([a, b]) => c.start >= a && c.start < b))
    .map(c => [c.start, c.end, 'C']);
  const targets = [...kept, ...comments];
  const edits = [];
  const remain = [];
  for (const [a, b, type] of targets) {
    const raw = src.slice(a, b);
    if (!CJKP.test(raw)) continue;
    if (raw in map) edits.push([a, b, map[raw]]);
    else remain.push(raw);
  }
  if (remain.length) report.remaining[rel] = remain;
  if (scan || !edits.length) continue;
  let out = src;
  for (const [a, b, en] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + en + out.slice(b);
  writeFileSync(abs, out, 'utf8');
  report.files[rel] = edits.length;
  report.replaced += edits.length;
}
const outPath = join(TRANSLATION, 'apply-ast-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 1), 'utf8');
console.log(`files changed: ${Object.keys(report.files).length}, replacements: ${report.replaced}`);
console.log(`files with remaining CJK spans: ${Object.keys(report.remaining).length}`);
console.log(`excluded: ${Object.keys(report.excluded).length}`);
console.log(`report -> ${outPath}`);
