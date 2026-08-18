import { useState } from "react";

import AWS_SERVICES from "../../data/awsServiceCatalog";
import CloudServiceBreadcrumbs from "./CloudServiceBreadcrumbs";
import Ec2ManagementPage from "./Ec2ManagementPage";
import EcsManagementPage from "./EcsManagementPage";
import EcrManagementPage from "./EcrManagementPage";
import LambdaManagementPage from "./LambdaManagementPage";
import RdsManagementPage from "./RdsManagementPage";
import S3ManagementPage from "./S3ManagementPage";
import VpcManagementPage from "./VpcManagementPage";
import GenericServiceManagementPage from "./GenericServiceManagementPage";

function buildBreadcrumbs(service, routeParams, onNavigate, onBack) {

    const items = [{ label: "AWS Services", onClick: onBack }];

    const hasDrilldown = !!(routeParams.cluster || routeParams.repo);

    items.push({ label: service.name, onClick: hasDrilldown ? () => onNavigate({ service: service.id }) : undefined });

    if (service.id === "ecs" && routeParams.cluster) {

        items.push({
            label: routeParams.cluster,
            onClick: routeParams.ecsService ? () => onNavigate({ service: "ecs", cluster: routeParams.cluster }) : undefined
        });

        if (routeParams.ecsService) {
            items.push({ label: routeParams.ecsService });
        }

    }

    if (service.id === "ecr" && routeParams.repo) {
        items.push({ label: routeParams.repo });
    }

    return items;

}

// The dedicated per-service management page - replaces the old modal as
// the primary "click a service card" experience (see section 1/2 of the
// request this came from). One shell (breadcrumbs, header, Refresh, Open
// AWS Console) shared by every service; which body renders below it comes
// from a small per-service switch rather than ~100 independent page
// components.
export default function CloudServiceDetailPage({ service, routeParams, inventory, onNavigate, onBack }) {

    const [refreshToken, setRefreshToken] = useState(0);

    const breadcrumbItems = buildBreadcrumbs(service, routeParams, onNavigate, onBack);

    // Common Uses/Related Services are catalog-level context about the
    // service itself - shown once, on the service's own top-level page,
    // not repeated on every drilled-down cluster/service/repository
    // sub-page where it'd just be noise unrelated to what's on screen.
    const showServiceContext = !routeParams.cluster && !routeParams.repo;

    const related = showServiceContext
        ? (service.relatedServices || []).map((id) => AWS_SERVICES.find((s) => s.id === id)).filter(Boolean)
        : [];

    return (

        <>

            <CloudServiceBreadcrumbs items={breadcrumbItems} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <span className="cloud-service-icon cloud-service-icon-lg" aria-hidden="true">
                        {service.name.slice(0, 2).toUpperCase()}
                    </span>

                    <div>
                        <p className="field-hint" style={{ margin: 0 }}>AWS</p>
                        <h1 style={{ margin: "2px 0" }}>{service.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{service.fullName}</p>
                        <p style={{ marginTop: "8px" }}>{service.description}</p>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    <button type="button" className="btn btn-secondary" onClick={() => setRefreshToken((t) => t + 1)}>
                        Refresh
                    </button>

                    <a href={service.consoleUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                        Open AWS Console →
                    </a>

                </div>

            </div>

            {showServiceContext && (service.commonUses?.length > 0 || related.length > 0) && (

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
                                    <button
                                        key={r.id}
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => onNavigate({ service: r.id })}
                                    >
                                        {r.name}
                                    </button>
                                ))}
                            </div>
                        </>

                    )}

                </div>

            )}

            <ServiceBody
                service={service}
                routeParams={routeParams}
                inventory={inventory}
                onNavigate={onNavigate}
                refreshToken={refreshToken}
            />

        </>

    );

}

function ServiceBody({ service, routeParams, inventory, onNavigate, refreshToken }) {

    switch (service.id) {

        case "ec2":
            return <Ec2ManagementPage refreshToken={refreshToken} />;

        case "ecs":
            return <EcsManagementPage routeParams={routeParams} onNavigate={onNavigate} refreshToken={refreshToken} />;

        case "ecr":
            return <EcrManagementPage routeParams={routeParams} onNavigate={onNavigate} refreshToken={refreshToken} />;

        case "lambda":
            return <LambdaManagementPage refreshToken={refreshToken} />;

        case "rds":
            return <RdsManagementPage refreshToken={refreshToken} />;

        case "s3":
            return <S3ManagementPage inventory={inventory} />;

        case "vpc":
            return <VpcManagementPage inventory={inventory} />;

        default:
            return <GenericServiceManagementPage service={service} inventory={inventory} />;

    }

}
