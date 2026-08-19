import { useState } from "react";

import AZURE_SERVICES from "../../data/azureServiceCatalog";
import { getLiveStatusForAzureService } from "../../utils/cloudServiceLiveStatus";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import CloudServiceBreadcrumbs from "./CloudServiceBreadcrumbs";
import AzureResourceDetailDialog from "./AzureResourceDetailDialog";
import AzureVmManagementPage from "./AzureVmManagementPage";
import AzureContainerAppsManagementPage from "./AzureContainerAppsManagementPage";
import AzureAppServiceManagementPage from "../paas/AzureAppServiceManagementPage";

const PAGE_SIZE = 10;

// Azure's own service detail page - the Azure equivalent of
// CloudServiceDetailPage.jsx. One shell (breadcrumbs, header, Refresh,
// Open Azure Portal) shared by every service; which body renders below it
// comes from a small per-service switch, same shape as AWS's own
// ServiceBody. Virtual Machines are the one catalog entry with a real
// management page (list + start/stop/restart/delete/create - see
// AzureVmManagementPage.jsx); every other entry falls back to the generic
// body below - a click into any one resource opens
// AzureResourceDetailDialog for real view/read (ARM's own full property
// bag, not just the inventory list's name+location), plus a direct link
// out to the real Azure Portal for anything requiring an actual create/
// edit/delete action (deliberately not built per resource type - see
// Round 78's own scoping note).
export default function AzureServiceDetailPage({ service, inventory, onBack }) {

    const [refreshToken, setRefreshToken] = useState(0);
    const [detailItem, setDetailItem] = useState(null);

    const related = (service.relatedServices || [])
        .map((id) => AZURE_SERVICES.find((s) => s.id === id))
        .filter(Boolean);

    const status = getLiveStatusForAzureService(service, inventory);

    return (

        <>

            <AzureResourceDetailDialog
                resourceId={detailItem?.resourceId}
                resourceType={service.resourceType}
                onClose={() => setDetailItem(null)}
            />

            <CloudServiceBreadcrumbs items={[{ label: "Azure Services", onClick: onBack }, { label: service.name }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <span className="cloud-service-icon cloud-service-icon-lg" aria-hidden="true">
                        {service.name.slice(0, 2).toUpperCase()}
                    </span>

                    <div>
                        <p className="field-hint" style={{ margin: 0 }}>Azure</p>
                        <h1 style={{ margin: "2px 0" }}>{service.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{service.fullName}</p>
                        <p style={{ marginTop: "8px" }}>{service.description}</p>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    {service.id === "virtual-machines" && (
                        <button type="button" className="btn btn-secondary" onClick={() => setRefreshToken((t) => t + 1)}>
                            Refresh
                        </button>
                    )}

                    <a href={service.consoleUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                        Open Azure Portal →
                    </a>

                </div>

            </div>

            {(service.commonUses?.length > 0 || related.length > 0) && (

                <div className="card">

                    {service.commonUses?.length > 0 && (

                        <>
                            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Common Uses</h3>
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
                                    <span key={r.id} className="badge badge-secondary">{r.name}</span>
                                ))}
                            </div>
                        </>

                    )}

                </div>

            )}

            {service.id === "virtual-machines" ? (

                <AzureVmManagementPage refreshToken={refreshToken} />

            ) : service.id === "container-apps" ? (

                <AzureContainerAppsManagementPage />

            ) : service.id === "app-service" ? (

                <AzureAppServiceManagementPage />

            ) : (

                <>

                    <div className="card">

                        <h2 className="card-title">Resources</h2>

                        {!inventory ? (

                            <p className="empty-state">Loading Azure resources...</p>

                        ) : !inventory.configured ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>
                                Enter your Azure credentials (including a Subscription ID) in Settings → Credentials → Azure
                                to see live status here.
                            </p>

                        ) : inventory.error ? (

                            <>
                                <p className="error-message">Unable to load Azure resources.</p>
                                <p className="field-hint">{inventory.error}</p>
                            </>

                        ) : !status ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>
                                {service.resourceType
                                    ? `Nothing of this type found in your subscription. Open Azure Portal above for advanced management of ${service.name}.`
                                    : `${service.name} isn't a single trackable resource type - open Azure Portal above to manage it.`}
                            </p>

                        ) : (

                            <AzureResourceTable status={status} onSelect={setDetailItem} />

                        )}

                    </div>

                    <p className="field-hint">
                        Click a resource above to view its full detail. Create/edit/delete for {service.name}{" "}
                        isn't implemented in the Deployment Portal yet - use <strong>Open Azure Portal</strong>{" "}
                        above for that.
                    </p>

                </>

            )}

        </>

    );

}

function AzureResourceTable({ status, onSelect }) {

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(status.items || [], PAGE_SIZE);

    return (

        <>

            <p className="field-hint" style={{ margin: "0 0 12px" }}>
                <strong>{status.count}</strong> found
            </p>

            {status.items?.length === 0 ? (

                <p className="empty-state">None found.</p>

            ) : (

                <>

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Resource</th>
                                    <th>Location</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((item, index) => (

                                    <tr
                                        key={startIndex + index}
                                        className={item.resourceId ? "table-row-clickable" : ""}
                                        onClick={item.resourceId ? () => onSelect(item) : undefined}
                                    >
                                        <td>{item.name}</td>
                                        <td className="field-hint">{item.detail || "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                    <Pagination
                        page={page}
                        pageCount={pageCount}
                        totalCount={totalCount}
                        startIndex={startIndex}
                        endIndex={endIndex}
                        onPageChange={setPage}
                    />

                </>

            )}

        </>

    );

}
