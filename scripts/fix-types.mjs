// After `tsc` has written dist/**/*.d.ts: make the declarations resolve under every
// TypeScript module setting, not just "bundler".
// - .d.ts (ESM, "type": "module"): relative imports get their `.js` extension.
// - .d.cts copies for `require` users, with relative imports pointing at `.cjs`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const relative = /((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"]+?)(['"])/g;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.d.ts')) fix(path);
  }
}

function fix(path) {
  const source = readFileSync(path, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/, '');
  const withExtension = (extension) => source.replace(relative, (_, head, specifier, tail) => `${head}${specifier}${extension}${tail}`);
  writeFileSync(path, withExtension('.js'));
  writeFileSync(path.replace(/\.d\.ts$/, '.d.cts'), withExtension('.cjs'));
}

walk(new URL('../dist', import.meta.url).pathname);
