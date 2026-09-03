// drei's <Text> (troika-three-text) needs an actual font file to
// rasterize glyphs from. Its own default font is fetched from an
// external CDN at runtime, which this app's CSP blocks outright
// (connect-src is locked to same-origin + the API only, see
// vite.config.js's writeSecurityHeadersPlugin). Self-hosted under
// /public instead, so every 3D text label's font load is a same-origin
// request the existing CSP already allows.
export const MONO_FONT = "/fonts/JetBrainsMono-Medium.ttf";
