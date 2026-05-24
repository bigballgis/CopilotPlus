import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(root, '../src/shared'),
      '@ui': path.resolve(root, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(root, '../dist/webview'),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(root, 'src/tabWorkspace/main.tsx'),
      name: 'CopilotPlusTabWorkspace',
      formats: ['iife'],
      fileName: () => 'tabWorkspace.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'tabWorkspace.[ext]',
      },
    },
    cssCodeSplit: false,
  },
});
