import { Download, ExternalLink } from "lucide-react";
import { PROFILE } from "../../data/profile";

// Shared by the desktop resume panel (opened by clicking the paper on
// the desk - Resume.jsx in scene/objects) and MobileFallback's own
// Resume section, so there's one place that knows the file path and
// renders the preview/download actions.
export default function Resume() {

    return (

        <div className="proom-resume">

            <div className="proom-resume-preview">
                <iframe src={PROFILE.resumeUrl} title={`${PROFILE.name} resume`} />
            </div>

            <div className="proom-contact-actions">

                <a href={PROFILE.resumeUrl} download className="proom-btn proom-btn-primary">
                    <Download size={14} /> Download
                </a>

                <a href={PROFILE.resumeUrl} target="_blank" rel="noreferrer" className="proom-btn">
                    <ExternalLink size={14} /> Open in new tab
                </a>

            </div>

        </div>

    );

}
