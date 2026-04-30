import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // RETIRING THE PWA. The previous SW was serving stale precached
      // bundles to users for hours after each deploy — every "stuck on
      // Verifying…", "sign-out doesn't work", "menu skeleton frozen"
      // bug report traced back to old JS being served from the SW
      // cache. selfDestroying: true tells vite-plugin-pwa to emit a SW
      // whose only job is to unregister itself and delete every cache
      // it finds. After every active client has hit this build once,
      // there are no SWs left and the site behaves like a normal web
      // app: every page load fetches fresh JS from the server.
      selfDestroying: true,
      registerType: 'autoUpdate',
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
