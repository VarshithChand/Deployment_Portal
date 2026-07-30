import { Component } from "react";

// Catches render/lifecycle errors thrown by whichever page is currently
// mounted, so a bug on one page shows a recoverable message instead of a
// blank white screen. Keyed by tab in App.jsx, so switching tabs remounts
// this fresh and clears any previous error automatically.
export default class ErrorBoundary extends Component {

    state = { hasError: false };

    static getDerivedStateFromError() {

        return { hasError: true };

    }

    componentDidCatch(error, info) {

        console.error("Page crashed:", error, info);

    }

    render() {

        if (this.state.hasError) {

            return (

                <div className="main">

                    <div className="card">

                        <h2 className="card-title">
                            This page ran into a problem
                        </h2>

                        <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                            Something went wrong while rendering this page. You can go back to the
                            Dashboard and try again.
                        </p>

                        <button type="button" className="btn btn-primary" onClick={this.props.onRecover}>
                            Go to Dashboard
                        </button>

                    </div>

                </div>

            );

        }

        return this.props.children;

    }

}
