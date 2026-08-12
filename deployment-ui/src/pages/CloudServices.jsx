import { useMemo, useState } from "react";

import AWS_SERVICES, { AWS_CATEGORIES } from "../data/awsServiceCatalog";
import PageLayout from "../components/layout/PageLayout";
import SearchBox from "../components/common/SearchBox";
import CloudServiceCard from "../components/cloudServices/CloudServiceCard";
import CloudServiceDetailModal from "../components/cloudServices/CloudServiceDetailModal";

// Only AWS is wired up (see section 12 of the request this page came
// from) - Azure/GCP are listed as disabled options so adding a second
// provider later is a data change (a new provider's services pushed into
// awsServiceCatalog.js, or its own file) plus flipping `enabled: true`
// here, not a rewrite of this page.
const PROVIDERS = [
    { key: "aws", label: "AWS", enabled: true },
    { key: "azure", label: "Azure", enabled: false },
    { key: "gcp", label: "GCP", enabled: false }
];

function matchesQuery(service, query) {

    if (!query) {
        return true;
    }

    const haystack = [
        service.name,
        service.fullName,
        service.category,
        service.description,
        ...(service.keywords || [])
    ].join(" ").toLowerCase();

    return haystack.includes(query.toLowerCase());

}

// The catalog is local, static configuration data (see
// data/awsServiceCatalog.js), never fetched - there's nothing here an API
// call would improve on, and calling AWS for "the list of AWS services"
// on every page load would be both pointless and needlessly rate-limit-
// hungry (see section 19/13 of the request: no AWS credentials touch this
// page at all - every action is a plain link to the AWS Console using
// whatever AWS session the visitor's own browser already has).
export default function CloudServices() {

    const [provider, setProvider] = useState("aws");
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [selectedService, setSelectedService] = useState(null);

    const providerServices = useMemo(
        () => AWS_SERVICES.filter((s) => s.provider === provider),
        [provider]
    );

    const filtered = useMemo(() => {

        const trimmed = search.trim();

        return providerServices
            .filter((s) => category === "All" || s.category === category)
            .filter((s) => matchesQuery(s, trimmed));

    }, [providerServices, category, search]);

    function clearFilters() {
        setSearch("");
        setCategory("All");
    }

    // Related-service buttons inside the modal swap which service the same
    // modal is showing, by id, rather than closing and reopening it.
    function selectServiceById(id) {

        const found = AWS_SERVICES.find((s) => s.id === id);

        if (found) {
            setSelectedService(found);
        }

    }

    return (

        <PageLayout title="Cloud Services">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Browse and access cloud services available in your environment.
            </p>

            <div className="card">

                <div className="form-group cloud-provider-select-group">

                    <label htmlFor="cloud-provider-select">Cloud Provider</label>

                    <select
                        id="cloud-provider-select"
                        className="form-control"
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                    >
                        {PROVIDERS.map((p) => (
                            <option key={p.key} value={p.key} disabled={!p.enabled}>
                                {p.label}{!p.enabled ? " (coming soon)" : ""}
                            </option>
                        ))}
                    </select>

                </div>

                <SearchBox
                    placeholder={`Search ${PROVIDERS.find((p) => p.key === provider)?.label || ""} services...`}
                    value={search}
                    onChange={setSearch}
                />

                <div className="cloud-service-categories" role="group" aria-label="Filter by category">

                    <button
                        type="button"
                        className={`btn btn-sm ${category === "All" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setCategory("All")}
                        aria-pressed={category === "All"}
                    >
                        All
                    </button>

                    {AWS_CATEGORIES.map((c) => (

                        <button
                            key={c}
                            type="button"
                            className={`btn btn-sm ${category === c ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => setCategory(c)}
                            aria-pressed={category === c}
                        >
                            {c}
                        </button>

                    ))}

                </div>

                {filtered.length === 0 ? (

                    <div className="cloud-service-empty">

                        <p className="empty-state" style={{ padding: 0 }}>No AWS services found</p>

                        <p className="field-hint">
                            Try searching for another service or category.
                        </p>

                        <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                            Clear Search
                        </button>

                    </div>

                ) : (

                    <div className="cloud-service-grid">

                        {filtered.map((service) => (

                            <CloudServiceCard
                                key={service.id}
                                service={service}
                                onSelect={setSelectedService}
                            />

                        ))}

                    </div>

                )}

            </div>

            <CloudServiceDetailModal
                service={selectedService}
                onClose={() => setSelectedService(null)}
                onSelectRelated={selectServiceById}
            />

        </PageLayout>

    );

}
