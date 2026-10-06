import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

/**
 * Every production build gets a unique id. It is compiled into the app and written to build.json,
 * which the server reads and sends to every screen. A screen still running an older build (opened
 * before a deploy) notices the mismatch and reloads, so old code never drives a newer server.
 */
function buildId(): Plugin {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: 'bitquiz-build-id',
    config: (_config, { command }) => ({
      define: { __BUILD_ID__: JSON.stringify(command === 'build' ? id : 'dev') },
    }),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ buildId: id }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), buildId()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  optimizeDeps: {
    include: ['papaparse'],
  },
  server: {
    port: 5173,
    // Expose on the LAN so phones can be tested during development.
    host: true,
    proxy: {
      '/api': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 800,
  },
});
