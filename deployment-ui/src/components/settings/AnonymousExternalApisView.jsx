import ExternalApisView from "./ExternalApisView";

// The login page's own "External APIs" tool - reachable before signing in,
// on purpose (see LoginSignupPage's tools menu). Just the full Settings
// view (grouping by version/cluster, filters, per-endpoint retry) with
// `anonymous` set - see ExternalApisView's own comment for exactly what
// that changes (no saved-list load/save, checks routed through the
// public/capped endpoint instead of the admin-gated one).
export default function AnonymousExternalApisView() {
    return <ExternalApisView anonymous />;
}
