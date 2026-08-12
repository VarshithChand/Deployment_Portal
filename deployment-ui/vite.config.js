import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Real git state captured at build time, never invented - backs Services
// -> Application Support's frontend version reporting (see
// src/utils/buildInfo.js). Falls back to "unknown" rather than throwing if
// this ever runs outside a git checkout.
function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  }
  catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(getGitCommit()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // Optional - only set if VITE_APP_VERSION is exported in the shell
    // running `npm run build` (e.g. VITE_APP_VERSION=2.8.4 npm run build).
    // Never fabricated when unset (see utils/buildInfo.js).
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || null)
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5279',
        changeOrigin: true
      },
      // The three sample services this portal deploys — proxied under
      // their own path prefix (stripped before forwarding, since each
      // service's own routes already start with /api/...) so the browser
      // never makes a cross-origin request and none of them need CORS
      // configured, same reasoning as the main /api proxy above.
      '/admin-api': {
        target: 'http://localhost:5274',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/admin-api/, '')
      },
      '/pmscore-api': {
        target: 'http://localhost:5116',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pmscore-api/, '')
      },
      '/security-api': {
        target: 'http://localhost:5159',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/security-api/, '')
      }
    }
  }
})
