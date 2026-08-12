// A colored initials badge, same idea as AccountAvatar's letter fallback
// but without its hover-reveal wrapper (a service card already shows its
// name as a permanent heading, nothing to reveal) - there's no per-service
// icon set sourced for this catalog, so a consistent monogram stands in
// for one rather than 100+ hand-picked AWS icons.
function ServiceIconBadge({ name }) {

    return (
        <span className="cloud-service-icon" aria-hidden="true">
            {name.slice(0, 2).toUpperCase()}
        </span>
    );

}

// One AWS service in the catalog grid. The card's main body navigates to
// this service's dedicated management page (see CloudServiceDetailPage) -
// the "Open AWS Console" pill is a second, independent way in for anyone
// who already knows what they want and doesn't need the detour through
// the management page first.
//
// liveCount is optional - a resource count from the account-wide AWS
// inventory (see utils/cloudServiceLiveStatus.js), only ever passed for
// the "Services You're Using" overview, where it's already known to be
// > 0. The plain catalog grid below it never passes this, since checking
// every one of ~100 services just to render a badge nobody asked for
// there would be wasted work.
export default function CloudServiceCard({ service, onSelect, liveCount }) {

    return (

        <div className="cloud-service-card">

            <button
                type="button"
                className="cloud-service-card-main"
                onClick={() => onSelect(service)}
            >

                <ServiceIconBadge name={service.name} />

                <div className="cloud-service-card-body">

                    <h3 className="cloud-service-card-name">{service.name}</h3>
                    <p className="cloud-service-card-fullname">{service.fullName}</p>

                    <div className="cloud-service-card-badges">

                        <span className="badge badge-secondary cloud-service-card-category">
                            {service.category}
                        </span>

                        {typeof liveCount === "number" && (
                            <span className="badge badge-success">
                                {liveCount} in use
                            </span>
                        )}

                    </div>

                    <p className="cloud-service-card-description">{service.description}</p>

                </div>

            </button>

            <a
                href={service.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-primary cloud-service-card-console-link"
                onClick={(e) => e.stopPropagation()}
            >
                Open AWS Console →
            </a>

        </div>

    );

}
