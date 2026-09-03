// Chrome (and other Chromium browsers) can speculatively prerender a page
// you haven't navigated to yet - typing a familiar URL into the address
// bar is a common trigger. The whole app mounts and runs in the
// background during that prerender; if it activates (you actually land
// on it), every mount effect that already fired once during the
// prerender does NOT re-fire on activation - but if anything skipped
// this guard and fired a real network call during the prerender itself,
// that call already happened for a page the user may never even have
// looked at, and (depending on timing) can show up alongside a second,
// genuine call if the prerender was still resolving when the real
// navigation completed. This is the documented cause of exactly this
// symptom - startup API calls (bootstrap, mfa/pending, the frontend
// heartbeat) appearing to fire twice with no duplicate call site
// anywhere in the code, StrictMode already ruled out, and no way to
// reproduce it locally (Vite's dev server is never a prerender target).
//
// document.prerendering + the prerenderingchange event are the
// standard, documented way to detect this and defer exactly the kind
// of side-effecting work these calls are: run immediately if this
// isn't a prerender, otherwise wait for prerendering to actually end.
export function runAfterPrerender(fn) {

    if (typeof document !== "undefined" && document.prerendering) {
        document.addEventListener("prerenderingchange", () => fn(), { once: true });
    }
    else {
        fn();
    }

}
