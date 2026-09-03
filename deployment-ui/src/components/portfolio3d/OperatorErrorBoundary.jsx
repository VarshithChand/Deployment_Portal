import { Component } from "react";

// A Suspense boundary only catches THROWN PROMISES (the loading state) -
// it does nothing for an actual thrown Error, which is exactly what a
// rejected useGLTF load surfaces as. Without this, a failed operator
// asset load (a bad CSP directive, a network hiccup, a browser that
// doesn't support something the loader needs) crashes the entire Canvas
// - Room, walls, every station - since nothing else in the tree catches
// render errors. This limits the blast radius to just the figure: if it
// fails, the room still renders normally, just without it.
export default class OperatorErrorBoundary extends Component {

    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        // eslint-disable-next-line no-console
        console.error("Operator figure failed to load - hiding it, rest of the room is unaffected.", error);
    }

    render() {
        if (this.state.failed) return null;
        return this.props.children;
    }

}
