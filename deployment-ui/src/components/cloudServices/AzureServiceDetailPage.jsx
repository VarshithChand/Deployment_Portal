import AZURE_SERVICES from "../../data/azureServiceCatalog";
import { getLiveStatusForAzureService } from "../../utils/cloudServiceLiveStatus";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import CloudServiceBreadcrumbs from "./CloudServiceBreadcrumbs";

const PAGE_SIZE = 10;

// Azure's own service detail page - the Azure equivalent of
// CloudServiceDetailPage.jsx, but deliberately simpler: none of Azure's
// catalog entries have a dedicated per-service management page the way
// AWS's EC2/ECS/ECR/Lambda/RDS/S3/VPC do (real start/stop/create/delete
// actions against a live AWS API) - building that same depth for Azure
// would mean a from-scratch Compute/Storage/SQL/etc. management
// integration per service, not just a catalog page. This is the honest
// version: every entry gets the same generic body - whatever the
// account-wide ARM resource inventory already knows about that resource
// type (see settingsService.getMyAzureResources), plus a direct link out
// to the real Azure Portal for anything requiring an actual action.
export default function AzureServiceDetailPage({ service, inventory, onBack }) {

    const related = (service.relatedServices || [])
        .map((id) => AZURE_SERVICES.find((s) => s.id === id))
        .filter(Boolean);

    const status = getLiveStatusForAzureService(service, inventory);

    return (

        <>

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

                    <AzureResourceTable status={status} />

                )}

            </div>

            <p className="field-hint">
                Management actions for {service.name} aren't implemented in the Deployment Portal -
                use <strong>Open Azure Portal</strong> above for create/delete and deeper configuration.
            </p>

        </>

    );

}

function AzureResourceTable({ status }) {

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

                                    <tr key={startIndex + index}>
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
