const STORAGE_KEY = "portalLocked";

// Whether the screen-lock (see PinLockScreen/PeriodicSignOutMonitor) is
// currently engaged, persisted outside React state entirely. A lock that
// only lived in component state disappeared on any hard refresh (Ctrl+
// Shift+R, or just closing and reopening the tab) since that state resets
// to its initial value on remount — reading this from localStorage before
// anything else renders is what makes the lock survive that.
export function isPortalLocked() {
    return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setPortalLocked() {
    localStorage.setItem(STORAGE_KEY, "1");
}

// Called on a correct PIN, or as part of performSelfClear's full wipe -
// either way the lock is actually resolved, not just hidden until the
// next reload brings it back.
export function clearPortalLocked() {
    localStorage.removeItem(STORAGE_KEY);
}
