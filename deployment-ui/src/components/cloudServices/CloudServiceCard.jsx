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

// One AWS service in the catalog grid. The card's main body opens the
// details modal (see CloudServiceDetailModal) - the "Open AWS Console"
// pill is a second, independent way in for anyone who already knows what
// they want and doesn't need the detour through details first.
export default function CloudServiceCard({ service, onSelect }) {

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

                    <span className="badge badge-secondary cloud-service-card-category">
                        {service.category}
                    </span>

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
