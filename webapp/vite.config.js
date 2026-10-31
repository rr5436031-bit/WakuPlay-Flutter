import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const nat = (f) => fileURLToPath(new URL('./src/native/' + f, import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Runtime Capacitor diganti jembatan Flutter/Kotlin (src/native). Kode aplikasi tetap memakai import yang sama.
  resolve: {
    alias: {
      '@capacitor/core': nat('capacitor-core.js'),
      '@capacitor/app': nat('capacitor-app.js'),
      '@capacitor/local-notifications': nat('capacitor-local-notifications.js'),
      '@capgo/capacitor-social-login': nat('social-login.js'),
      'wp-notify': nat('capacitor-core.js'),
      'wp-pip': nat('capacitor-core.js'),
      'wp-pay': nat('capacitor-core.js'),
      'wp-gifurl': nat('capacitor-core.js'),
    },
  },
  esbuild: { drop: ['console', 'debugger'], legalComments: 'none' },
  build: {
    outDir: 'dist', target: 'es2020', reportCompressedSize: false, chunkSizeWarningLimit: 900, modulePreload: { polyfill: false },
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          return undefined
        },
      },
    },
  },
})
