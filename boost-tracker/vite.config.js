import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  // Sur GitHub Pages le repo est servi sous /nom-du-repo/
  // Remplace 'boost-tracker' par le nom exact de ton repo GitHub
  base: '/boost-tracker/',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // pas besoin des sourcemaps en prod
  },
});
