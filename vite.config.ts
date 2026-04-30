import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // skipWaiting + clientsClaim: when a new build deploys, the new
      // service worker takes over open tabs immediately instead of
      // waiting for every tab to close. Without this, users keep running
      // old bundled JS even after refreshing — symptoms include "stuck on
      // Verifying…", buttons that need multiple clicks, and skeleton
      // screens that never resolve, because the in-flight bundle predates
      // the bug fix.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Van Lavino Staff',
        short_name: 'VanLavino',
        description: 'Van Lavino staff & admin console',
        theme_color: '#c17820',
        background_color: '#0a0908',
        display: 'standalone',
        start_url: '/staff',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
