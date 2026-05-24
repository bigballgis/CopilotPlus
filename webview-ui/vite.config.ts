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
    },
  },
  build: {
    outDir: path.resolve(root, '../dist/webview'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(root, 'src/conversation/main.tsx'),
      name: 'CopilotPlusConversation',
      formats: ['iife'],
      fileName: () => 'conversation.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'conversation.[ext]',
      },
    },
    cssCodeSplit: false,
  },
});
