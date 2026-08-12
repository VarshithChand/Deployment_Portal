import { useEffect } from "react";

import AWS_SERVICES from "../../data/awsServiceCatalog";

// Section 9's "most important functionality" gate - clicking a service
// card lands here first, not straight at the AWS Console, so there's a
// chance to see what it actually is before leaving the portal.
export default function CloudServiceDetailModal({ service, onClose, onSelectRelated }) {

    useEffect(() => {

        if (!service) return;

        function handleKeyDown(e) {
            if (e.key === "Escape") onClose();
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);

    }, [service, onClose]);

    if (!service) {
        return null;
    }

    const related = (service.relatedServices || [])
        .map((id) => AWS_SERVICES.find((s) => s.id === id))
        .filter(Boolean);

    return (

        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >

            <div
                className="dialog dialog-wide cloud-service-detail"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cloud-service-detail-title"
            >

                <div className="cloud-service-detail-header">

                    <span className="cloud-service-icon cloud-service-icon-lg" aria-hidden="true">
                        {service.name.slice(0, 2).toUpperCase()}
                    </span>

                    <div>
                        <p className="field-hint" style={{ margin: 0 }}>AWS</p>
                        <h2 id="cloud-service-detail-title" style={{ margin: "2px 0" }}>{service.name}</h2>
                        <p className="field-hint" style={{ margin: 0 }}>{service.fullName}</p>
                    </div>

                </div>

                <span className="badge badge-info" style={{ marginTop: "12px" }}>
                    {service.category}
                </span>

                <p style={{ marginTop: "12px" }}>{service.description}</p>

                {service.commonUses?.length > 0 && (

                    <>
                        <h3 className="settings-subhead">Common Uses</h3>
                        <ul className="cloud-service-detail-list">
                            {service.commonUses.map((use) => <li key={use}>{use}</li>)}
                        </ul>
                    </>

                )}

                {related.length > 0 && (

                    <>
                        <h3 className="settings-subhead">Related Services</h3>
                        <div className="button-row">
                            {related.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => onSelectRelated(r.id)}
                                >
                                    {r.name}
                                </button>
                            ))}
                        </div>
                    </>

                )}

                <div className="button-row" style={{ marginTop: "18px" }}>

                    <a
                        href={service.consoleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-primary"
                    >
                        Open AWS Console
                    </a>

                    <a
                        href={service.documentationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                    >
                        AWS Documentation
                    </a>

                    <button type="button" className="btn" onClick={onClose}>
                        Close
                    </button>

                </div>

            </div>

        </div>

    );

}
