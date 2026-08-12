// __APP_COMMIT__/__APP_BUILD_TIME__/__APP_VERSION__ are injected at build
// time by vite.config.js's `define` block - real git state captured the
// moment `npm run build` ran, never fabricated. The typeof guards are what
// let this file (and anything importing it) still run correctly under a
// plain `vite dev` or any context where the define block didn't apply.
export const APP_COMMIT = typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : "unknown";

export const APP_BUILD_TIME = typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : null;

// Only set if an admin exported VITE_APP_VERSION before running the build
// - never invented otherwise (see Services -> Application Support, which
// shows "not set" rather than a made-up number).
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;

// Vite's own built-in mode ("production" for a real `vite build`,
// "development" under `vite dev`) - not a separate concept to configure.
export const APP_ENVIRONMENT = import.meta.env.MODE;
