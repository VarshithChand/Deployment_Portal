import { useEffect, useState } from "react";

import useNavigation from "../hooks/useNavigation";
import LoadingMark from "./common/LoadingMark";

// If a page is still loading after this long, something's probably wrong
// (a stalled request, a dead backend) rather than just being slow — offer
// a way out instead of leaving someone staring at an animation forever.
const SLOW_THRESHOLD_MS = 8000;

export default function LoadingSpinner() {

    const { tab, setTab } = useNavigation();
    const [slow, setSlow] = useState(false);

    useEffect(() => {

        const timer = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);

        return () => clearTimeout(timer);

    }, []);

    return (

        <div className="loading-container">

            <LoadingMark size={56} />

            <p>
                Loading deployment information
                <span className="loading-dots"><span>.</span><span>.</span><span>.</span></span>
            </p>

            <div className="loading-track"></div>

            {slow && (

                <div className="loading-slow">

                    <p className="field-hint">
                        This is taking longer than expected.
                    </p>

                    {tab !== "dashboard" && (

                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setTab("dashboard")}
                        >
                            Go to Dashboard
                        </button>

                    )}

                </div>

            )}

        </div>

    );

}
