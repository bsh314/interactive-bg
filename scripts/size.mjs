// Bundle size per import path, as an app would get it: each scenario is a tiny
// app that imports from the built package (dist/), bundled, tree-shaken and
// minified by Rolldown (Vite's bundler). Run `npm run build` first.
//
// Usage: node scripts/size.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (path) => JSON.stringify(join(root, 'dist', `${path}.js`));
const work = join(root, 'node_modules', '.cache', 'size');
mkdirSync(work, { recursive: true });

const scenarios = [
  ['engine only', `export { createBackground } from ${dist('index')};`],
  ['everything (root, all styles)', `export * from ${dist('index')};`],
];
for (const style of ['topo', 'dots', 'plus']) {
  scenarios.push(
    [`${style} via root import`, `export { createBackground, ${style} } from ${dist('index')};`],
    ...['index', 'webgl', 'canvas2d'].map((variant) => [
      `${style}${variant === 'index' ? '' : `/${variant}`}`,
      `export { createBackground } from ${dist('index')};\nexport { ${style} } from ${dist(`${style}/${variant}`)};`,
    ]),
  );
}

const rows = [];
for (const [name, source] of scenarios) {
  const entry = join(work, `${name.replace(/\W+/g, '-')}.js`);
  writeFileSync(entry, source);
  const bundle = await rolldown({ input: entry, logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'es', minify: true });
  await bundle.close();
  const code = output.map((chunk) => chunk.code ?? '').join('');
  rows.push({ name, min: code.length, gzip: gzipSync(code).length });
}

const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`.padStart(8);
console.log(`${'import'.padEnd(32)}${'min'.padStart(8)}${'gzip'.padStart(8)}`);
for (const { name, min, gzip } of rows) console.log(`${name.padEnd(32)}${kB(min)}${kB(gzip)}`);
