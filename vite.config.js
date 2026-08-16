import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
  },
  preview: {
    host: '127.0.0.1',
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    css: true,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
