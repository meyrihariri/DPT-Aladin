import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: [
          'pwa-512x512.png',
          'pwa-192x192.png',
          'pwa-maskable-512x512.png',
          'icon.svg',
          'apple-touch-icon.png',
          'favicon.ico',
          'desktop-screenshot.png',
          'mobile-screenshot.png'
        ],
        manifest: {
          id: '/',
          name: 'DPT-AlaDin - Manajemen Pekerjaan & Honor Teknisi',
          short_name: 'DPT-AlaDin',
          description: 'Aplikasi Manajemen Pekerjaan & Honor Teknisi RT/RW Net',
          theme_color: '#800020',
          background_color: '#0F172A',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          start_url: '/',
          scope: '/',
          categories: ['business', 'productivity', 'utilities'],
          icons: [
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml'
            }
          ],
          screenshots: [
            {
              src: '/desktop-screenshot.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'DPT AlaDin Desktop Dashboard'
            },
            {
              src: '/mobile-screenshot.png',
              sizes: '640x1136',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'DPT AlaDin Mobile Teknisi'
            }
          ],
          shortcuts: [
            {
              name: 'Dashboard Utama',
              short_name: 'Dashboard',
              description: 'Buka Dashboard Pemantauan Presensi dan Pekerjaan',
              url: '/',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
            },
            {
              name: 'Approval Presensi',
              short_name: 'Presensi',
              description: 'Buka Approval Presensi Teknisi Harian',
              url: '/?tab=approval',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
            },
            {
              name: 'Daftar Pekerjaan',
              short_name: 'Pekerjaan',
              description: 'Buka Manajemen Daftar Pekerjaan Teknisi',
              url: '/?tab=pekerjaan',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
            },
            {
              name: 'Rekap Honor & Slip',
              short_name: 'Rekap Honor',
              description: 'Buka Rekapitulasi Honor & Cetak Slip Gaji',
              url: '/?tab=rekap',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6MB
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 3000,
    },
    server: {
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/server_data/**', '**/public/**', '**/.git/**']
      },
    },
  };
});
