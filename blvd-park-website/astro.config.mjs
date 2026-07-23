import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    tailwind()
  ],
  site: 'https://blvdpark.com',
  build: {
    inlineStylesheets: 'auto',
    assets: 'assets',
    splitting: true
  },
  resolve: {
    alias: {
      '@components': '/src/components',
      '@layouts': '/src/layouts',
      '@scripts': '/src/scripts'
    }
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Separate chunks for better caching
            if (id.includes('node_modules')) {
              return 'vendor';
            }
            if (id.includes('/components/')) {
              return 'components';
            }
          }
        }
      }
    }
  },
  compressHTML: true
});
