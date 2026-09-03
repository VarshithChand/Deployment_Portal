import { useState } from "react";
import { Mail, Copy, Check } from "lucide-react";
import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../fonts";
import { CONTACT } from "../../../data/portfolio3dData";

function GitHubIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

function LinkedInIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M14.82 0H1.18C.53 0 0 .52 0 1.16v13.68C0 15.48.53 16 1.18 16h13.64c.65 0 1.18-.52 1.18-1.16V1.16C16 .52 15.47 0 14.82 0ZM4.75 13.63H2.37V6h2.38v7.63ZM3.56 4.96c-.76 0-1.38-.62-1.38-1.38 0-.76.62-1.38 1.38-1.38.76 0 1.38.62 1.38 1.38 0 .76-.61 1.38-1.38 1.38Zm10.07 8.67h-2.37V9.92c0-.87-.02-1.99-1.21-1.99-1.22 0-1.4.95-1.4 1.93v3.77H6.28V6h2.28v1.04h.03c.32-.6 1.09-1.22 2.24-1.22 2.4 0 2.84 1.58 2.84 3.63v4.18Z" />
        </svg>
    );
}

export function ContactMarker({ onSelect, reducedMotion, dimmed }) {

    return (

        <Hotspot position={[-2.6, 0.9, -0.6]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    <mesh>
                        <cylinderGeometry args={[0.38, 0.44, 0.6, 6]} />
                        <meshStandardMaterial
                            color={hovered ? "#67e8f9" : "#0e3540"}
                            emissive="#22d3ee"
                            emissiveIntensity={hovered ? 1.1 : dimmed ? 0.15 : 0.75}
                            transparent
                            opacity={dimmed ? 0.2 : 1}
                            toneMapped={false}
                        />
                    </mesh>
                    {!dimmed && (
                        <Billboard position={[0, 0.5, 0]}>
                            <Text
                                font={MONO_FONT}
                                fontSize={0.1}
                                color="#67e8f9"
                                outlineWidth={0.006}
                                outlineColor="#031014"
                                anchorX="center"
                                anchorY="bottom"
                            >
                                CONTACT
                            </Text>
                        </Billboard>
                    )}
                </>
            )}
        </Hotspot>

    );

}

// Buttons, not an HTML <form> - per the spec, in case this ends up
// embedded somewhere that blocks forms; mailto: is a plain link action.
export function ContactContent() {

    const [copied, setCopied] = useState(false);

    function copyEmail() {
        navigator.clipboard?.writeText(CONTACT.email).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    }

    return (

        <div className="p3d-contact">

            <p>The fastest way to reach me is email.</p>

            <div className="p3d-contact-actions">

                <button type="button" className="p3d-btn p3d-btn-primary" onClick={copyEmail}>
                    {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> {CONTACT.email}</>}
                </button>

                <a href={`mailto:${CONTACT.email}`} className="p3d-btn">
                    <Mail size={14} /> Email me
                </a>

            </div>

            <div className="p3d-contact-socials">
                <a href={CONTACT.github} target="_blank" rel="noreferrer"><GitHubIcon /> GitHub</a>
                <a href={CONTACT.linkedin} target="_blank" rel="noreferrer"><LinkedInIcon /> LinkedIn</a>
            </div>

        </div>

    );

}
