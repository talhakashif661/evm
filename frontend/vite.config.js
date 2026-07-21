import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    // Opt-in only (npm run build:analyze), not on every build — dist/ is
    // what actually gets deployed (Vercel serves it as-is), so an
    // unconditional analyzer would mean this internal dev artifact is
    // sitting at yoursite.com/bundle-analysis.html in production. Same job
    // as webpack-bundle-analyzer (an interactive treemap of what's actually
    // taking up space), just via the Rollup ecosystem, since that's what
    // Vite builds with — webpack-bundle-analyzer itself can't attach to a
    // non-Webpack build regardless of preference.
    ...(process.env.ANALYZE === 'true' ? [visualizer({
      filename: 'dist/bundle-analysis.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    })] : []),
  ],
  server: {
    port: 3000,
    // Dev proxy: the client calls same-origin relative paths (/api, /socket.io)
    // and Vite forwards them to the backend on :5000. This means no CORS in
    // local dev and no backend URL baked into the bundle. In production you set
    // VITE_API_URL to the deployed backend's absolute URL and this proxy is
    // irrelevant (the built app calls that URL directly). Override the target
    // with the BACKEND_ORIGIN env var if your backend runs on a different port.
    proxy: {
      '/api': {
        target: process.env.BACKEND_ORIGIN || 'http://localhost:5000',
        changeOrigin: true,
      },
      // Socket.IO powers the live auction/bid updates. ws:true is required so
      // the WebSocket upgrade is proxied too, not just the initial HTTP polls.
      '/socket.io': {
        target: process.env.BACKEND_ORIGIN || 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // React/router/redux change far less often than app code — splitting
        // them into their own chunk means a deploy that only touches app
        // code doesn't bust the browser's cache of this (larger) vendor chunk.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux'],
        }
      }
    }
  }
})
