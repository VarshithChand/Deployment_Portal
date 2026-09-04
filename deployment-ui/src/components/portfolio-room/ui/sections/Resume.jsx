import { Download, ExternalLink } from "lucide-react";
import { PROFILE } from "../../data/profile";

// Shared by the desktop resume panel (opened by clicking the paper on
// the desk - Resume.jsx in scene/objects) and MobileFallback's own
// Resume section, so there's one place that knows the file path and
// renders the preview/download actions.
export default function Resume() {

    return (

        <div className="proom-resume">

            {/* buttons come BEFORE the preview, not after - the preview
                below is a full Letter-page iframe, taller than a lot of
                real viewports even at its own capped height, so anything
                placed after it risked sitting below the fold with no
                visible hint to scroll for it. Putting the actions first
                guarantees they're on screen the instant the panel opens,
                with no dependency on viewport height or scroll position. */}
            <div className="proom-contact-actions">

                <a href={PROFILE.resumeUrl} download className="proom-btn proom-btn-primary">
                    <Download size={14} /> Download
                </a>

                <a href={PROFILE.resumeUrl} target="_blank" rel="noreferrer" className="proom-btn">
                    <ExternalLink size={14} /> Open in new tab
                </a>

            </div>

            <div className="proom-resume-preview">
                <iframe src={PROFILE.resumeUrl} title={`${PROFILE.name} resume`} />
            </div>

        </div>

    );

}
