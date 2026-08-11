# GitHub Pages

Static pages served by GitHub Pages once enabled for this repo (**Settings → Pages →
Source: Deploy from a branch → Branch: `master`, folder: `/docs`**).

- [`admin-pipeline.html`](admin-pipeline.html) — a real, interactive trigger form for
  the AdminAPI pipelines. Pick **Build** (runs `admin.yml`) or **Release** (runs
  `release-admin.yml`), a branch, and — for Release — which of the four deploy
  targets (RC / Cluster01 / Cluster02 / Cluster03) to include, then **Run Pipeline**
  dispatches the workflow immediately, without leaving the page.

  It does this by calling the same `DeploymentAPI` backend the portal itself uses
  (`https://deployment-portal-sec0.onrender.com`) — the page holds no GitHub token
  itself; a token is saved once (first visit) via the backend's own settings
  endpoint, same as the portal's Settings page, then reused for every run from this
  page's own session.

  **One-time setup required before this page will work:** this page's own origin
  (`https://<your-username>.github.io`) must be added to the backend's CORS allow
  list, or every request from it will be blocked by the browser. On Render, open the
  `DeploymentAPI` service → **Environment** → add
  `Cors__AllowedOrigins__<nextIndex>` = `https://<your-username>.github.io` (use the
  next unused index after whatever's already configured) → save, which triggers a
  redeploy. Until that's done, the page will show a CORS/network error instead of
  loading your session.
