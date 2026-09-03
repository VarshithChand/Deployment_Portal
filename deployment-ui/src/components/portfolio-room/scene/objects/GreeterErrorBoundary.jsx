import { Component } from "react";

// A Suspense boundary only catches thrown promises (the loading state) -
// an actual thrown Error (a rejected GLB load: bad CSP, network hiccup,
// missing file) needs a real error boundary, or it crashes the whole
// Canvas - Room, desk, every station - since nothing else in the tree
// catches render errors. This limits the blast radius to just the
// greeter: if it fails, the room still renders normally, just without it.
export default class GreeterErrorBoundary extends Component {

    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        // eslint-disable-next-line no-console
        console.error("Greeter avatar failed to load - hiding it, rest of the room is unaffected.", error);
    }

    render() {
        if (this.state.failed) return null;
        return this.props.children;
    }

}
