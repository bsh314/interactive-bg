import { defineConfig } from 'vite';

/** The package's import paths (see "exports" in package.json) and their source files. */
export const entries = {
  index: 'src/index.ts',
  'topo/index': 'src/topo/index.ts',
  'topo/webgl': 'src/topo/webgl.ts',
  'topo/canvas2d': 'src/topo/canvas2d.ts',
  'dots/index': 'src/dots/index.ts',
  'dots/webgl': 'src/dots/webgl.ts',
  'dots/canvas2d': 'src/dots/canvas2d.ts',
  'plus/index': 'src/plus/index.ts',
  'plus/webgl': 'src/plus/webgl.ts',
  'plus/canvas2d': 'src/plus/canvas2d.ts',
};

// `npm run dev` serves index.html (the demo). `npm run build` builds the library twice:
// - ESM + CJS, one output file per source module, so every import path only pulls in what it uses;
// - `--mode umd`: everything in one file for <script> tags and CDNs.
// `npm run build:demo` (`--mode demo`) builds the demo page into site/ for GitHub Pages.
export default defineConfig(({ mode }) => {
  if (mode === 'demo') {
    // Relative URLs, so the page works at any path, e.g. https://<user>.github.io/<repo>/.
    return { base: './', publicDir: false, build: { outDir: 'site', emptyOutDir: true } };
  }
  const umd = mode === 'umd';
  return {
    publicDir: false,
    build: {
      lib: umd
        ? { entry: 'src/index.ts', name: 'InteractiveBg', formats: ['umd'], fileName: () => 'index.umd.js' }
        : {
            entry: entries,
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${entryName}.${format === 'cjs' ? 'cjs' : 'js'}`,
          },
      rolldownOptions: umd
        ? {}
        : {
            output: { preserveModules: true, preserveModulesRoot: 'src' },
          },
      sourcemap: true,
      // The ESM/CJS files are left readable: the app's bundler minifies them.
      minify: umd,
      emptyOutDir: !umd,
      target: 'es2020',
    },
  };
});
