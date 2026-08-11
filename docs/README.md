# GitHub Pages

Static pages served by GitHub Pages once enabled for this repo (**Settings → Pages →
Source: Deploy from a branch → Branch: `master`, folder: `/docs`**).

- [`admin-pipeline.html`](admin-pipeline.html) — a standalone "Release Admin API" trigger
  page. Calls the real `DeploymentAPI` backend directly (same as the Deployment Portal's
  own Deploy page) — no token is ever embedded in this page's own source. Needs
  `https://varshithchand.github.io` added to the backend's `Cors:AllowedOrigins`
  (an env var on Render, not something a page push can set) before it will work — the
  browser blocks the request otherwise. Being a separate origin from the portal itself,
  the first visit here needs its own GitHub token saved (the page prompts for one),
  independent of whatever's already configured on the main portal.
