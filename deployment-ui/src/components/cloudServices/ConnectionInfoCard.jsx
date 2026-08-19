import { useState } from "react";

// Section 5/6's SSH/RDP connection info - entirely client-side, built
// from data the detail page already has (PublicIp + OS). No backend call,
// no key material ever crosses the API - a private key or RDP password
// is never retrieved or stored here, only a copyable command template
// with an explicit "use your own credential" disclaimer.
function isWindowsOs(os) {
    return (os || "").toLowerCase().includes("windows");
}

function copy(text, onDone) {
    navigator.clipboard?.writeText(text).then(() => onDone?.());
}

export default function ConnectionInfoCard({ publicIp, os, usernameHint }) {

    const [copied, setCopied] = useState(null);

    if (!publicIp) {

        return (
            <div className="card">
                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Connection</h3>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    No public IP assigned - this resource isn't reachable directly from the internet.
                </p>
            </div>
        );

    }

    const windows = isWindowsOs(os);
    const port = windows ? 3389 : 22;
    const sshCommand = `ssh -i <your-key> ${usernameHint || "<username>"}@${publicIp}`;
    const rdpAddress = `${publicIp}:${port}`;

    function handleCopy(label, text) {
        copy(text, () => {
            setCopied(label);
            setTimeout(() => setCopied(null), 1500);
        });
    }

    return (

        <div className="card">

            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Connection</h3>

            {windows ? (

                <>
                    <p className="field-hint" style={{ marginTop: 0 }}>RDP endpoint</p>
                    <p className="smoke-test-metric-mono" style={{ fontSize: "1.1em" }}>{rdpAddress}</p>

                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCopy("rdp", rdpAddress)}>
                        {copied === "rdp" ? "Copied!" : "Copy RDP Address"}
                    </button>

                    <p className="field-hint" style={{ marginTop: "10px" }}>
                        Use the admin password you set when this VM was created - the Deployment Portal never
                        stores or retrieves it.
                    </p>
                </>

            ) : (

                <>
                    <div className="cloud-service-connection-grid">

                        <div>
                            <p className="field-hint" style={{ marginTop: 0, marginBottom: "2px" }}>Host</p>
                            <p className="smoke-test-metric-mono">{publicIp}</p>
                        </div>

                        <div>
                            <p className="field-hint" style={{ marginTop: 0, marginBottom: "2px" }}>Port</p>
                            <p className="smoke-test-metric-mono">{port}</p>
                        </div>

                        <div>
                            <p className="field-hint" style={{ marginTop: 0, marginBottom: "2px" }}>Username</p>
                            <p className="smoke-test-metric-mono">{usernameHint || "—"}</p>
                        </div>

                    </div>

                    <p className="field-hint" style={{ marginTop: "10px", marginBottom: "2px" }}>Command</p>
                    <p className="smoke-test-metric-mono">{sshCommand}</p>

                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCopy("ssh", sshCommand)} style={{ marginTop: "8px" }}>
                        {copied === "ssh" ? "Copied!" : "Copy SSH Command"}
                    </button>

                    <p className="field-hint" style={{ marginTop: "10px" }}>
                        Replace <code>&lt;your-key&gt;</code> with the path to your own private key - the
                        Deployment Portal never stores or retrieves SSH keys.
                    </p>
                </>

            )}

        </div>

    );

}
