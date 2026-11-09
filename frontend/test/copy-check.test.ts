import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { scanSource, sourceFiles } from '../scripts/copy-check.mjs';

describe('Source copy parsing', () => {
  it('Variables, attribute keys, and module paths are not prose', () => {
    expect(scanSource('sample.ts', `import previously from 'used to';
      const formerly = { 'previously': 1 }; void formerly; void previously;`)).toEqual([]);
  });
  it('Reads comments, strings, templates, and JSX text', () => {
    for (const source of [
      '// The old implementation used to live here\nconst x = 1;',
      'const x = "the old implementation used to live here";',
      'const x = `this used to be the old implementation ${value}`;',
      'const x = <p>The old implementation used to live here</p>;',
    ]) {
      expect(scanSource('sample.tsx', source).some(item => item.severity === 'error')).toBe(false);
    }
  });
  it('Keep per line exemptions and report syntax errors', () => {
    const source = '// The old implementation used to live here // copy-lint-disable-line\n// The old implementation used to live here';
    expect(scanSource('sample.ts', source).map(item => item.line)).toEqual([2]);
    expect(scanSource('sample.ts', 'const = ;').some(item => item.severity === 'error')).toBe(true);
  });
  it('Condition action notes only prompt verification', () => {
    const found = scanSource('sample.ts', '// If a proxy was configured before, double-check the address.');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(item => item.severity === 'warning')).toBe(true);
  });
  it('Collects actual source code and supports current TypeScript and JSX syntax', () => {
    expect(sourceFiles(resolve('src')).length).toBeGreaterThan(0);
    expect(scanSource('sample.tsx', 'type Pair = [symbol: string, value: number]; const a = <a href="/?x=1&thumb=0" />;')).toEqual([]);
  });
});
