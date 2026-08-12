// items: [{ label, onClick? }] - the last item (the current page) has no
// onClick; every earlier one is clickable.
export default function CloudServiceBreadcrumbs({ items }) {

    return (

        <nav className="cloud-service-breadcrumbs" aria-label="Breadcrumb">

            {items.map((item, index) => (

                <span key={index} className="cloud-service-breadcrumb-segment">

                    {index > 0 && <span className="cloud-service-breadcrumb-sep">/</span>}

                    {item.onClick ? (
                        <button type="button" className="cloud-service-breadcrumb-link" onClick={item.onClick}>
                            {item.label}
                        </button>
                    ) : (
                        <span className="cloud-service-breadcrumb-current" aria-current="page">
                            {item.label}
                        </span>
                    )}

                </span>

            ))}

        </nav>

    );

}
