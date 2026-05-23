const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const ctx = esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
});

if (watch) {
  ctx.then(c => c.watch()).then(() => console.log('[esbuild] watching...'));
} else {
  ctx.then(c => c.rebuild()).then(() => {
    console.log('[esbuild] build complete');
    return ctx.then(c => c.dispose());
  });
}
