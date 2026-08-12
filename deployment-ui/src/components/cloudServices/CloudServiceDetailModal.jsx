import { useEffect, useState } from "react";

import AWS_SERVICES from "../../data/awsServiceCatalog";
import { getMyAwsEc2Detail, getMyAwsEcsDetail } from "../../services/settingsService";
import { getLiveStatusForService } from "../../utils/cloudServiceLiveStatus";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";

const RESOURCE_PAGE_SIZE = 10;

function StateBadge({ state }) {

    const value = (state || "").toLowerCase();
    const className = value === "running" || value === "active"
        ? "badge badge-success"
        : value === "stopped" || value === "inactive"
            ? "badge badge-secondary"
            : "badge badge-warning";

    return <span className={className}>{state}</span>;

}

// EC2's own richer live view - both running AND stopped instances, unlike
// the account-wide inventory's EC2 tile (deliberately running-only).
function Ec2LiveStatus() {

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        let cancelled = false;

        getMyAwsEc2Detail()
            .then((result) => { if (!cancelled) setDetail(result); })
            .catch((err) => { console.error(err); if (!cancelled) setDetail({ configured: false }); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };

    }, []);

    if (loading) {
        return <p className="field-hint">Checking your AWS account...</p>;
    }

    if (!detail?.configured) {
        return (
            <p className="field-hint" style={{ textAlign: "left" }}>
                Enter your AWS credentials in Settings → Credentials → AWS to see live instance status.
            </p>
        );
    }

    if (detail.error) {
        return <p className="field-hint field-hint-bad">{detail.error}</p>;
    }

    return (

        <>

            <div className="cloud-service-live-stats">
                <span><strong>{detail.runningCount}</strong> running</span>
                <span><strong>{detail.stoppedCount}</strong> stopped</span>
            </div>

            {detail.instances.length > 0 && <Ec2InstanceList instances={detail.instances} />}

        </>

    );

}

// A growing collection (more instances get launched over time) - its own
// pagination, independent of anything else in this modal.
function Ec2InstanceList({ instances }) {

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(instances, RESOURCE_PAGE_SIZE);

    return (

        <>

            <ul className="cloud-service-detail-list cloud-service-detail-list-plain">
                {pageItems.map((i) => (
                    <li key={i.instanceId}>
                        <StateBadge state={i.state} />
                        <span>{i.name}</span>
                        <span className="field-hint" style={{ margin: 0 }}>{i.instanceType}</span>
                    </li>
                ))}
            </ul>

            <Pagination
                page={page}
                pageCount={pageCount}
                totalCount={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setPage}
            />

        </>

    );

}

// ECS's own richer live view - per-cluster, per-service running/desired
// task counts, which the account-wide inventory's generic tag scan can't
// answer (a tag scan sees "an ECS resource exists," not "3 of 5 tasks
// running").
function EcsLiveStatus() {

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        let cancelled = false;

        getMyAwsEcsDetail()
            .then((result) => { if (!cancelled) setDetail(result); })
            .catch((err) => { console.error(err); if (!cancelled) setDetail({ configured: false }); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };

    }, []);

    if (loading) {
        return <p className="field-hint">Checking your AWS account...</p>;
    }

    if (!detail?.configured) {
        return (
            <p className="field-hint" style={{ textAlign: "left" }}>
                Enter your AWS credentials in Settings → Credentials → AWS to see live cluster status.
            </p>
        );
    }

    if (detail.error) {
        return <p className="field-hint field-hint-bad">{detail.error}</p>;
    }

    if (detail.clusters.length === 0) {
        return <p className="field-hint">No ECS clusters found in this region.</p>;
    }

    return <EcsClusterList clusters={detail.clusters} />;

}

// The cluster list itself is paginated (an account can have many clusters)
// - each individually-shown cluster's service list gets its OWN pagination
// below, evaluated independently rather than assumed to be covered by
// paginating the cluster list.
function EcsClusterList({ clusters }) {

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(clusters, RESOURCE_PAGE_SIZE);

    return (

        <>

            {pageItems.map((cluster) => (

                <div key={cluster.clusterName} className="cloud-service-ecs-cluster">

                    <p className="field-hint" style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--text)" }}>
                        {cluster.clusterName}
                    </p>

                    {cluster.services.length === 0 ? (

                        <p className="field-hint" style={{ margin: "0 0 8px" }}>No services in this cluster.</p>

                    ) : (

                        <EcsServiceList services={cluster.services} />

                    )}

                </div>

            ))}

            <Pagination
                page={page}
                pageCount={pageCount}
                totalCount={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setPage}
            />

        </>

    );

}

function EcsServiceList({ services }) {

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(services, RESOURCE_PAGE_SIZE);

    return (

        <>

            <ul className="cloud-service-detail-list cloud-service-detail-list-plain">
                {pageItems.map((s) => (
                    <li key={s.serviceName}>
                        <StateBadge state={s.runningCount > 0 ? "running" : "stopped"} />
                        <span>{s.serviceName}</span>
                        <span className="field-hint" style={{ margin: 0 }}>
                            {s.runningCount} / {s.desiredCount} tasks
                        </span>
                    </li>
                ))}
            </ul>

            <Pagination
                page={page}
                pageCount={pageCount}
                totalCount={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setPage}
            />

        </>

    );

}

// Every other service - whatever the account-wide inventory (see
// utils/cloudServiceLiveStatus.js) already knows, which is a best-effort
// match, not guaranteed for all ~100 catalog entries.
function GenericLiveStatus({ service, inventory }) {

    if (!inventory) {
        return <p className="field-hint">Checking your AWS account...</p>;
    }

    if (!inventory.configured) {
        return (
            <p className="field-hint" style={{ textAlign: "left" }}>
                Enter your AWS credentials in Settings → Credentials → AWS to see live status here.
            </p>
        );
    }

    const status = getLiveStatusForService(service, inventory);

    if (!status) {
        return (
            <p className="field-hint">
                No live status available for this service yet - use the console link below.
            </p>
        );
    }

    if (status.error) {
        return <p className="field-hint field-hint-bad">{status.error}</p>;
    }

    return (

        <>

            <div className="cloud-service-live-stats">
                <span><strong>{status.count}</strong> found</span>
            </div>

            {status.items?.length > 0 && <GenericResourceList items={status.items} />}

        </>

    );

}

function GenericResourceList({ items }) {

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(items, RESOURCE_PAGE_SIZE);

    return (

        <>

            <ul className="cloud-service-detail-list cloud-service-detail-list-plain">
                {pageItems.map((item, index) => (
                    <li key={startIndex + index}>
                        <span>{item.name}</span>
                        {item.detail && <span className="field-hint" style={{ margin: 0 }}>{item.detail}</span>}
                    </li>
                ))}
            </ul>

            <Pagination
                page={page}
                pageCount={pageCount}
                totalCount={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setPage}
            />

        </>

    );

}

function LiveStatus({ service, inventory }) {

    if (service.id === "ec2") return <Ec2LiveStatus />;
    if (service.id === "ecs") return <EcsLiveStatus />;

    return <GenericLiveStatus service={service} inventory={inventory} />;

}

// Section 9's "most important functionality" gate - clicking a service
// card lands here first, not straight at the AWS Console, so there's a
// chance to see what it actually is (and, where available, what's
// actually running) before leaving the portal.
export default function CloudServiceDetailModal({ service, onClose, onSelectRelated, inventory }) {

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

                <h3 className="settings-subhead">Live Status</h3>

                {/* Re-mounted per service (key=service.id) so switching to a
                    related service via onSelectRelated re-fetches instead of
                    showing the previous service's stale EC2/ECS detail. */}
                <LiveStatus key={service.id} service={service} inventory={inventory} />

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
