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

## Triggering a deployment

`Release Admin API` takes four inputs, each a checkbox, all default **on**:

| Input | Deploys to |
|---|---|
| `deploy_rc` | RC |
| `deploy_cluster01` | Cluster01 (Production) |
| `deploy_cluster02` | Cluster02 (Production) |
| `deploy_cluster03` | Cluster03 (Production) |

Uncheck whichever targets you don't want touched this run — each one is an
independent job, so e.g. RC-only is just `deploy_rc` checked and the other three
cleared.

### Option A — through the Deployment Portal

1. Open the portal, go to **Deploy**.
2. Pick the branch you want deployed.
3. Pick **Release Admin API** from the workflow dropdown.
4. Toggle `deploy_rc` / `deploy_cluster01` / `deploy_cluster02` / `deploy_cluster03`
   as needed.
5. Click **Deploy**.

Triggering this way requires an admin session — either a GitHub OAuth login with the
Admin role, or a Personal Access Token (configured in **Settings → GitHub**) that
belongs to a username on the admin allowlist (**Settings → Credentials → Admin
Allowlist**). Otherwise the portal rejects the request before it ever reaches GitHub.

### Option B — directly on GitHub

1. Go to the repo's **Actions** tab → **Release Admin API** in the left sidebar.
2. Click **Run workflow**, pick the branch.
3. Set the four checkboxes.
4. Click **Run workflow** to confirm.

This needs write access to the repo (or Actions-trigger permission), same as running
any other workflow manually from GitHub's own UI — no portal involved at all.

### Confirming it worked

Either path lands the same place: the **Actions** tab shows the run, and the portal's
**History**/**Timeline** pages (and the Deploy page's own "Previous Run" panel) reflect
it once GitHub reports it complete.
