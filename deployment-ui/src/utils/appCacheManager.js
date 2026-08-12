const VERSION_KEY = "appVersion";

export function getLocalAppVersion() {
    return localStorage.getItem(VERSION_KEY);
}

export function setLocalAppVersion(version) {
    localStorage.setItem(VERSION_KEY, String(version));
}

// This app doesn't register a service worker or use the Cache Storage API
// itself (Vite's own content-hashed asset filenames already make stale
// JS/CSS a non-issue once index.html itself is fresh - Cloudflare's static
// asset hosting serves index.html with a short/no-cache lifetime and the
// hashed files as long-lived/immutable). Both are still cleared
// defensively here in case that ever changes - harmless no-ops otherwise.
export async function clearBrowserCaches() {

    if ("caches" in window) {

        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));

    }

    if ("serviceWorker" in navigator) {

        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

    }

}

// Records the version this browser is now on, then does a real navigation
// reload - that's what actually fetches the current index.html, which in
// turn references whatever the new build's hashed asset filenames are.
export async function applyUpdateAndReload(newVersion) {

    await clearBrowserCaches();
    setLocalAppVersion(newVersion);
    window.location.reload();

}
