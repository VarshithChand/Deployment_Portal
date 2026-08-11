# AdminAPI

One of the sample ASP.NET Core services this portal deploys (see the repo root
[README](../../README.md) for the full picture) — a small Users/Roles API used to
exercise the Deployment Portal's CI/CD pipeline against something real.

## Running it locally

```bash
cd src/AdminAPI
dotnet restore
dotnet run
```

Listens on `http://localhost:5274`. `docker compose up --build` from the repo root
brings it up alongside the portal instead, on `:8090`.

## The pipeline

Two separate workflows, in order:

1. **[`Admin API CI`](../../.github/workflows/admin.yml)** — builds, tests, and
   publishes AdminAPI, then zips the output into `artifacts/AdminAPI/New/` (rotating
   the previous two builds into `Old1`/`Old2`) on the `artifacts` branch. Runs
   automatically on every push to `master` that touches `src/AdminAPI/**` or
   `config/patch.config` — no manual step needed to build a new artifact.

2. **[`Release Admin API`](../../.github/workflows/release-admin.yml)** — takes
   whatever is currently in `artifacts/AdminAPI/New/` and deploys it. This one only
   ever runs manually (`workflow_dispatch`), since deploying is a deliberate action,
   not something that should happen on every push.

## Run it

A README can't run code or hold a live form — GitHub strips scripts and interactive
HTML out of rendered Markdown, so nothing below can dispatch a workflow by itself.
These buttons instead jump straight to the real, working control for each one — no
extra searching through the Actions tab.

[![Run Release Admin API](https://img.shields.io/badge/GitHub_Actions-Run_Release_Admin_API-2ea44f?style=for-the-badge&logo=github)](https://github.com/VarshithChand/yaml/actions/workflows/release-admin.yml)
[![Run Admin API CI](https://img.shields.io/badge/GitHub_Actions-Run_Admin_API_CI-0366d6?style=for-the-badge&logo=github)](https://github.com/VarshithChand/yaml/actions/workflows/admin.yml)
[![Open in Deployment Portal](https://img.shields.io/badge/Deployment_Portal-Deploy_Release_Admin_API-6f42c1?style=for-the-badge)](https://yaml.v-varshith-2004.workers.dev/?tab=deploy&workflow=release-admin.yml)
[![Standalone Pipeline Page](https://img.shields.io/badge/GitHub_Pages-Standalone_Pipeline_Page-24292e?style=for-the-badge&logo=github)](https://varshithchand.github.io/yaml/admin-pipeline.html)

Each GitHub button lands on that workflow's Actions page — click **Run workflow**
(top right) there to open its real branch picker and inputs. The portal button opens
the Deploy page with **Release Admin API** and its four checkboxes already
pre-selected — just pick a branch and click **Deploy**. The GitHub Pages button opens
[`docs/admin-pipeline.html`](../../docs/admin-pipeline.html) — a standalone form with
its own Build/Release toggle, branch field, and (for Release) the four deploy-target
checkboxes; clicking **Run Pipeline** dispatches the workflow immediately, from the
page itself, the same way the portal's own Deploy page does. See
[`docs/README.md`](../../docs/README.md) for the one-time CORS setup this page needs
on the backend before it'll work.

<details>
<summary><strong>Release Admin API — inputs (click to expand)</strong></summary>

<br>

Four checkboxes, all default **on** — each is an independent job, so unchecking one
leaves the other three untouched:

| Input | Deploys to |
|---|---|
| `deploy_rc` | RC |
| `deploy_cluster01` | Cluster01 (Production) |
| `deploy_cluster02` | Cluster02 (Production) |
| `deploy_cluster03` | Cluster03 (Production) |

For example, an RC-only run is `deploy_rc` checked with the other three cleared.

</details>

### Through the Deployment Portal

Requires an admin session — either a GitHub OAuth login with the Admin role, or a
Personal Access Token (**Settings → GitHub**) belonging to a username on the admin
allowlist (**Settings → Credentials → Admin Allowlist**). Otherwise the portal
rejects the request before it ever reaches GitHub.

### Directly on GitHub

Needs write access to the repo (or Actions-trigger permission) — same requirement as
running any other workflow manually from GitHub's own UI, no portal involved at all.

### Confirming it worked

Either path lands the same place: the **Actions** tab shows the run, and the portal's
**History**/**Timeline** pages (and the Deploy page's own "Previous Run" panel) reflect
it once GitHub reports it complete.
