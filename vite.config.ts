import { defineConfig } from 'vite';

// Vite config. `base: './'` makes the built game work from any folder
// (e.g. opening dist/ on itch.io or GitHub Pages).
export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  // Phaser itself is ~1.4 MB, so raise the warning limit to keep build output clean.
  build: { chunkSizeWarningLimit: 2000 },
});
