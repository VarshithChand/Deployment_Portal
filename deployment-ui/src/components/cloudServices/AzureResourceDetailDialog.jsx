import { useEffect, useState } from "react";

import { getAzureResourceDetail } from "../../services/cloudServicesService";
import CopyButton from "../common/CopyButton";

// Renders one ARM property value - primitives print directly, nested
// objects/arrays fall back to formatted JSON (ARM's own property shape is
// different for every resource type - see AzureResourceDetailDto's own
// comment - so there's no per-type layout to build here, just a readable
// generic one).
function PropertyValue({ value }) {

    if (value === null || value === undefined) {
        return <span className="field-hint">—</span>;
    }

    if (typeof value === "object") {
        return <pre className="cloud-service-detail-json">{JSON.stringify(value, null, 2)}</pre>;
    }

    return <span>{String(value)}</span>;

}

// Cloud Services' Azure page's "click into any resource" panel - real
// view/read for every resource type the account-wide inventory surfaces,
// not just VMs (which get their own full management page instead - see
// AzureVmManagementPage.jsx). Fetches ARM's own full property bag for
// this one resource on open, rather than the inventory list's own
// name+location summary. Rendered as a sibling of .card by the caller,
// not nested inside one - see AzureDevOpsPipelinesView's own dialog
// placement fix for why.
export default function AzureResourceDetailDialog({ resourceId, resourceType, onClose }) {

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        if (!resourceId) {
            setDetail(null);
            return;
        }

        setLoading(true);

        getAzureResourceDetail(resourceId, resourceType).then((data) => {
            setDetail(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }, [resourceId, resourceType]);

    if (!resourceId) {
        return null;
    }

    return (

        <div className="dialog-backdrop" role="presentation" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>

            <div className="dialog" role="presentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ maxWidth: "640px" }}>

                {loading ? (

                    <p className="empty-state">Loading resource detail...</p>

                ) : !detail?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your Azure credentials in Settings → Credentials → Azure to see this.
                    </p>

                ) : detail.error ? (

                    <>
                        <p className="error-message">Unable to load this resource.</p>
                        <p className="field-hint">{detail.error}</p>
                    </>

                ) : (

                    <>

                        <h2>{detail.name}</h2>

                        <div className="info-row">
                            <span>Type</span>
                            <strong>{detail.type}</strong>
                        </div>

                        <div className="info-row">
                            <span>Location</span>
                            <strong>{detail.location || "—"}</strong>
                        </div>

                        {detail.resourceGroup && (
                            <div className="info-row">
                                <span>Resource Group</span>
                                <strong>{detail.resourceGroup}</strong>
                            </div>
                        )}

                        {detail.tags && Object.keys(detail.tags).length > 0 && (

                            <div className="info-row">
                                <span>Tags</span>
                                <strong>{Object.entries(detail.tags).map(([k, v]) => `${k}=${v}`).join(", ")}</strong>
                            </div>

                        )}

                        {Object.keys(detail.properties || {}).length > 0 && (

                            <>
                                <h3 className="settings-subhead" style={{ marginTop: "16px" }}>Properties</h3>

                                {Object.entries(detail.properties).map(([key, value]) => (

                                    <div className="info-row" key={key}>
                                        <span>{key}</span>
                                        <PropertyValue value={value} />
                                    </div>

                                ))}
                            </>

                        )}

                        <div className="button-row" style={{ marginTop: "16px" }}>

                            {detail.portalUrl && (
                                <a href={detail.portalUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                                    Open in Azure Portal →
                                </a>
                            )}

                            {resourceId && <CopyButton value={resourceId} label="Copy resource ID" />}

                            <button type="button" className="btn" onClick={onClose}>Close</button>

                        </div>

                    </>

                )}

            </div>

        </div>

    );

}
