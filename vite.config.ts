import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

function getNodeModulePackageName(id: string) {
  const [, packagePath] = id.split('/node_modules/').pop()?.match(/^((?:@[^/]+\/)?[^/]+)/) ?? []
  return packagePath
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@/features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@/shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@/pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      '@/routes': fileURLToPath(new URL('./src/routes', import.meta.url)),
      worker_threads: fileURLToPath(new URL('./src/shared/shims/workerThreads.ts', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          const packageName = getNodeModulePackageName(id)

          if (!packageName) {
            return undefined
          }

          if (['react', 'react-dom', 'scheduler'].includes(packageName)) {
            return 'react-vendor'
          }

          if (packageName === 'react-router' || packageName === 'react-router-dom') {
            return 'router'
          }

          if (packageName.startsWith('@mantine/')
            || packageName === '@floating-ui/react'
            || packageName === 'react-number-format'
            || packageName === 'react-remove-scroll'
            || packageName === 'react-transition-group') {
            return 'mantine'
          }

          if (packageName === 'framer-motion') {
            return 'motion'
          }

          if (packageName === '@tabler/icons-react') {
            return 'icons'
          }

          if (packageName === 'lodash' || packageName === 'date-fns') {
            return 'data-utils'
          }

          if (packageName === 'browser-image-compression' || packageName === 'jszip' || packageName === 'react-qr-code') {
            return 'browser-utils'
          }

          if (packageName === '@mediabunny/mp3-encoder') {
            return 'mp3-encoder'
          }

          if (id.includes('/mediabunny/dist/modules/src/isobmff/')) {
            return 'media-isobmff'
          }

          if (id.includes('/mediabunny/dist/modules/src/matroska/')) {
            return 'media-matroska'
          }

          if (id.includes('/mediabunny/dist/modules/src/media-source')
            || id.includes('/mediabunny/dist/modules/src/media-sink')) {
            return 'media-io'
          }

          if (id.includes('/mediabunny/dist/modules/src/conversion')
            || id.includes('/mediabunny/dist/modules/src/codec')
            || id.includes('/mediabunny/dist/modules/src/encode')) {
            return 'media-conversion'
          }

          if (id.includes('/mediabunny/')) {
            return 'media-core'
          }

          return undefined
        }
      }
    }
  },
  server: {
    fs: {
      strict: false
    },
    proxy: {
      '/api/r2-proxy': {
        target: 'https://r2.narratoai.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/r2-proxy/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/api/fish-audio-proxy': {
        target: 'https://api.fish.audio',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fish-audio-proxy/, ''),
      },
      '/api/store-proxy': {
        target: 'https://store.narratoai.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/store-proxy/, ''),
      }
    }
  }
})
