import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import viteTsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Base path za GitHub Pages - koristi ime repoa da assets loadaju ispravno (riješava bijelu stranicu/404 error)
  base: '/topola-viewer-2025/',
  plugins: [react(), viteTsconfigPaths()],
  server: {
    // this ensures that the browser opens upon server start
    open: true,
    // this sets a default port to 3000
    port: 3000,
  },
});
