import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' → works on GitHub Pages under /<repo>/ as well as at the root.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
