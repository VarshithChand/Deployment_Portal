import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import ToastProvider from "./context/ToastContext";
import ThemeProvider from "./context/ThemeContext";
import StyleProvider from "./context/StyleContext";
import AuthProvider from "./context/AuthContext";
import NavigationProvider from "./context/NavigationContext";
import AzureDevOpsProjectProvider from "./context/AzureDevOpsProjectContext";

import "./styles/global.css";

// StrictMode is a development-time bug-detector (it double-invokes
// effects/renders on purpose, to surface missing cleanup) - it's
// documented to no-op that double-invoke behavior in a production
// build, but confirmed via the live site's own Network tab that every
// startup call (bootstrap, mfa/pending, settings/sidebar, the frontend
// heartbeat) was firing twice there regardless, which is exactly what
// a real double-render would produce. Rather than trust the "should be
// a no-op in prod" assumption against direct evidence it wasn't one
// here, StrictMode now only wraps the tree in dev at all - App itself
// still runs completely unwrapped in production either way.
const tree = (

    <ThemeProvider>

        <StyleProvider>

            <ToastProvider>

                <NavigationProvider>

                    <AuthProvider>

                        <AzureDevOpsProjectProvider>

                            <App/>

                        </AzureDevOpsProjectProvider>

                    </AuthProvider>

                </NavigationProvider>

            </ToastProvider>

        </StyleProvider>

    </ThemeProvider>

);

ReactDOM.createRoot(
    document.getElementById("root")
).render(import.meta.env.DEV ? <React.StrictMode>{tree}</React.StrictMode> : tree);