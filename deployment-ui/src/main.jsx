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

ReactDOM.createRoot(
    document.getElementById("root")
).render(

    <React.StrictMode>

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

    </React.StrictMode>

);