import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
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
        // blob: needed alongside worker-src's own blob: allowance below -
        // worker-src only covers CREATING the worker; the worker's own
        // bootstrap code then calls importScripts() on a second blob: URL
        // to pull in its actual logic (how troika-three-text's bundled
        // worker loads itself), and that nested load is governed by
        // script-src (inherited into the worker's global scope), not
        // worker-src. Without this, the worker is created successfully
        // but immediately fails to initialize ("failed to rehydrate").
        `script-src 'self' blob:`,
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
        `font-src 'self' https://fonts.gstatic.com`,
        // img-src blob: was added for CesiumMan.glb's embedded texture
        // (since removed - Portfolio's operator figure is plain
        // primitives now) and left in place; harmless to keep, avoids
        // re-litigating this if any future feature loads an image via a
        // Blob again.
        `img-src 'self' data: blob: https://avatars.githubusercontent.com`,
        // worker-src blob: - drei's <Text> (troika-three-text, used for
        // every station title/label throughout the Portfolio 3D room)
        // spins up a background Worker from a blob: URL for text layout.
        // With no worker-src directive at all, that falls back to
        // script-src 'self', which doesn't cover blob: - the browser
        // blocks the worker creation, it throws, and with nothing
        // catching it the error crashes the entire Canvas the instant
        // Room tries to render its first label (which happens
        // immediately on mount) - the actual cause of the 3D room
        // rendering as a totally blank canvas on the deployed site,
        // reproducing only there since Vite's dev server never applies
        // these CSP headers at all.
        `worker-src 'self' blob:`,
        `connect-src ${connectSrc}`,
        `frame-ancestors 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`
      ].join('; ')

      // Cache-Control was never set explicitly before this, which left
      // index.html at whatever Cloudflare's/the browser's own default
      // caching behavior happened to be - risking a browser serving a
      // stale index.html (and therefore stale hashed asset references)
      // even after a real, successful redeploy, until something forced a
      // hard refresh. no-cache (NOT no-store) on the HTML entry point
      // means the browser always revalidates with the server - cheap,
      // since index.html is tiny - while /assets/* (Vite's own content-
      // hashed filenames, so a new build never reuses an old one) gets a
      // full year of immutable caching. The more specific /assets/* block
      // must come AFTER /* - Cloudflare merges matching _headers rules,
      // later rules overriding earlier ones for the same header name, so
      // this is what lets hashed assets keep every security header from
      // /* while overriding just Cache-Control.
      const headers = [
        '/*',
        `  Content-Security-Policy: ${csp}`,
        '  X-Frame-Options: DENY',
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  Permissions-Policy: geolocation=(), camera=(), microphone=()',
        // HSTS: safe to add unconditionally - this origin is Cloudflare
        // Workers, always served over HTTPS already, so this only ever
        // stops a future plain-HTTP downgrade, never breaks anything that
        // works today. No `preload` - that's a one-way commitment (every
        // subdomain must support HTTPS forever) this repo can't make on
        // the user's behalf.
        '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
        // COOP/CORP: safe here specifically because GitHub OAuth login is
        // a full-page redirect (see AuthContext.jsx's login(): a plain
        // window.location.href, never window.open) - same-origin COOP
        // would break a popup-based OAuth flow's window.opener
        // communication, but there isn't one to break. CORP same-origin
        // is fine since nothing outside this origin is expected to embed
        // this site's own images/scripts.
        '  Cross-Origin-Opener-Policy: same-origin',
        '  Cross-Origin-Resource-Policy: same-origin',
        '  Cache-Control: no-cache',
        '',
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        ''
      ].join('\n')

      writeFileSync(resolve(__dirname, 'dist/_headers'), headers)
    }
  }
}

// Resolves a bare command name to an absolute path ourselves, rather than
// handing execFileSync "git" and letting the OS search PATH for it
// (SonarCloud javascript:S4036 - PATH is technically an injectable search
// path). This only ever runs at local/CI build time, never in a request
// path, but pinning to a concrete, verified-to-exist file is strictly
// safer than an implicit lookup regardless.
function resolveExecutablePath(name) {
  const pathVar = process.env.PATH || process.env.Path || ''
  const candidateNames = process.platform === 'win32'
    ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`]
    : [name]

  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue

    for (const candidateName of candidateNames) {
      const candidatePath = join(dir, candidateName)
      if (existsSync(candidatePath)) return candidatePath
    }
  }

  return null
}

// Real git state captured at build time, never invented - backs Services
// -> Application Support's frontend version reporting (see
// src/utils/buildInfo.js). Falls back to "unknown" rather than throwing if
// this ever runs outside a git checkout.
function getGitCommit() {
  try {
    const gitPath = resolveExecutablePath('git')
    if (!gitPath) return 'unknown'

    return execFileSync(gitPath, ['rev-parse', '--short', 'HEAD']).toString().trim()
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
