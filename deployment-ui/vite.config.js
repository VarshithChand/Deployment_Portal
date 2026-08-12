import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ESM has no __dirname (this file runs as a module - see package.json's
// "type": "module").
const __dirname = dirname(fileURLToPath(import.meta.url))

// Cloudflare Workers' static asset host reads a plain-text `_headers` file
// from the deployed output and applies its rules to every matching
// response - the actual place a browser-enforced CSP/Permissions-Policy
// has to live, since DeploymentAPI (the backend) never serves index.html;
// only this frontend does. Written here (not committed as a static
// public/_headers file) so connect-src can include whatever
// VITE_API_BASE_URL this specific build was made with - a wrong/missing
// backend origin in connect-src would silently break every API call, so
// this can't be a guessed, hand-maintained constant.
function writeSecurityHeadersPlugin() {
  return {
    name: 'write-security-headers',
    closeBundle() {
      const apiOrigin = process.env.VITE_API_BASE_URL || ''

      const connectSrc = apiOrigin
        ? `'self' ${apiOrigin}`
        : `'self'`

      const csp = [
        `default-src 'self'`,
        `script-src 'self'`,
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
        `font-src 'self' https://fonts.gstatic.com`,
        `img-src 'self' data: https://avatars.githubusercontent.com`,
        `connect-src ${connectSrc}`,
        `frame-ancestors 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`
      ].join('; ')

      const headers = [
        '/*',
        `  Content-Security-Policy: ${csp}`,
        '  X-Frame-Options: DENY',
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  Permissions-Policy: geolocation=(), camera=(), microphone=()',
        ''
      ].join('\n')

      writeFileSync(resolve(__dirname, 'dist/_headers'), headers)
    }
  }
}

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
  plugins: [react(), writeSecurityHeadersPlugin()],
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
