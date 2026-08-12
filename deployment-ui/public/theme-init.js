// Read the persisted theme + style synchronously, before first paint, so
// the boot loader doesn't flash the wrong look for a split second
// (ThemeProvider/StyleProvider do the same read again once React mounts).
// Pulled out of index.html's own inline <script> so the frontend's CSP
// (see public/_headers, written by vite.config.js) can use a strict
// script-src 'self' with no 'unsafe-inline' - an external file needs no
// hash/nonce allowance the way an inline script would.
(function () {

    try {
        var stored = localStorage.getItem('theme');
        var systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        var theme = stored === 'light' || stored === 'dark' ? stored : systemTheme;
        document.documentElement.dataset.theme = theme;
    }
    catch (e) {
        console.warn('Unable to read persisted theme preference', e);
    }

    try {
        var storedStyle = localStorage.getItem('appStyle');
        var validStyles = ['glass', 'brutal', 'minimal', 'neon', 'clay', 'midnight', 'sunset', 'mono'];
        if (validStyles.indexOf(storedStyle) !== -1) {
            document.documentElement.dataset.style = storedStyle;
        }
    }
    catch (e) {
        console.warn('Unable to read persisted style preference', e);
    }

})();
