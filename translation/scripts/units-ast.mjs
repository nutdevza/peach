// AST-exact translation units: whole template literals (outermost), literals, JSX text.
// Extracts all CJK-bearing units from frontend sources for translation.
// Usage: node translation/scripts/units-ast.mjs  (writes translation/units.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));          // translation/scripts
const TRANSLATION = dirname(HERE);                              // translation/
const ROOT = dirname(TRANSLATION);                              // repo root
const FRONTEND = join(ROOT, 'frontend');
const OUT = join(TRANSLATION, 'units.json');

const require2 = createRequire(join(FRONTEND, 'package.json'));
const { parseSync } = require2('oxc-parser');

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const CJKP = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff01-\uff20\uff3b-\uff40\uff5b-\uff65\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00b7]/;

// discover source files: all .ts/.tsx/.js/.jsx under frontend/src, test, e2e
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

const unitsS = new Map();
const unitsC = new Map();
let parseErrors = 0;

for (const abs of files) {
  const rel = abs.slice(FRONTEND.length + 1);
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { continue; }
  const parsed = parseSync(rel, src);
  if (parsed.errors?.length) { parseErrors++; }
  const spans = [];
  for (const item of walk(parsed.program, null, null)) {
    const raw = src.slice(item.start, item.end);
    if (!CJKP.test(raw)) continue;
    spans.push([item.start, item.end]);
    if (!unitsS.has(raw)) unitsS.set(raw, new Set());
    unitsS.get(raw).add(rel);
  }
  // drop spans fully contained in another span (nested templates)
  const kept = spans.filter(([a, b]) => !spans.some(([c, d]) => (c < a && b <= d) || (c <= a && b < d)));
  for (const [a, b] of kept) {
    const raw = src.slice(a, b);
    if (!CJKP.test(raw)) continue;
    if (!unitsS.has(raw)) unitsS.set(raw, new Set());
    unitsS.get(raw).add(rel);
  }
  for (const c of parsed.comments ?? []) {
    const raw = src.slice(c.start, c.end);
    if (!CJKP.test(raw)) continue;
    if (spans.some(([a, b]) => c.start >= a && c.start < b)) continue;
    if (!unitsC.has(raw)) unitsC.set(raw, new Set());
    unitsC.get(raw).add(rel);
  }
}

const payload = [];
for (const [u, set] of unitsS) payload.push({ u, type: 'S', files: [...set].sort() });
for (const [u, set] of unitsC) payload.push({ u, type: 'C', files: [...set].sort() });
payload.sort((a, b) => b.u.length - a.u.length);
writeFileSync(OUT, JSON.stringify(payload), 'utf8');
console.log(`files=${files.length} parseErrors=${parseErrors} S=${unitsS.size} C=${unitsC.size} -> ${OUT}`);
