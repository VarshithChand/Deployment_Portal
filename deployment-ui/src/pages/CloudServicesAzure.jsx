import { useEffect, useMemo, useState } from "react";

import AZURE_SERVICES, { AZURE_CATEGORIES } from "../data/azureServiceCatalog";
import { getMyAzureResources } from "../services/settingsService";
import { getLiveStatusForAzureService } from "../utils/cloudServiceLiveStatus";
import usePolling from "../hooks/usePolling";
import usePagination from "../hooks/usePagination";
import PageLayout from "../components/layout/PageLayout";
import SearchBox from "../components/common/SearchBox";
import Pagination from "../components/common/Pagination";
import CloudServiceCard from "../components/cloudServices/CloudServiceCard";
import AzureServiceDetailPage from "../components/cloudServices/AzureServiceDetailPage";

// Matches CloudServicesAws.jsx's own catalog-grid page size.
const CATALOG_PAGE_SIZE = 9;

function readServiceParam() {
    return new URLSearchParams(window.location.search).get("service");
}

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

// Cloud Services' Azure sub-page - built to the same shape as
// CloudServicesAws.jsx ("Services You're Using" + a searchable/paginated
// "All Azure Services" catalog, click into a service for its own detail
// page), now that Azure has a real account-wide inventory behind it (see
// getMyAzureResources - one ARM call lists every resource in the
// subscription, grouped by resource type, unlike AWS's one-call-per-
// service approach). What's deliberately NOT here yet, matching honestly
// what AWS itself only has for 7 of its ~100 catalog entries: real
// per-service management actions (create/delete/start/stop) - every Azure
// catalog entry falls back to a read-only resource list + a direct link
// out to the real Azure Portal (see AzureServiceDetailPage).
export default function CloudServicesAzure() {

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [selectedServiceId, setSelectedServiceId] = useState(readServiceParam);

    useEffect(() => {

        function handlePopState() {
            setSelectedServiceId(readServiceParam());
        }

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);

    }, []);

    const [inventory, setInventory] = useState(null);
    const [inventoryLoading, setInventoryLoading] = useState(true);

    async function loadInventory() {

        try {
            setInventory(await getMyAzureResources());
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setInventoryLoading(false);
        }

    }

    // Same 45s cadence as CloudServicesAws.jsx.
    usePolling(loadInventory, 45000);

    function navigate(serviceId) {

        const url = new URL(window.location.href);
        url.searchParams.set("tab", "cloudServicesAzure");

        if (serviceId) {
            url.searchParams.set("service", serviceId);
        }
        else {
            url.searchParams.delete("service");
        }

        window.history.pushState(null, "", url);
        setSelectedServiceId(serviceId || null);

    }

    function goBackToCatalog() {
        navigate(null);
    }

    const inUseServices = useMemo(() => {

        if (!inventory?.configured) {
            return [];
        }

        return AZURE_SERVICES.filter((s) => {
            const status = getLiveStatusForAzureService(s, inventory);
            return status && !status.error && status.count > 0;
        });

    }, [inventory]);

    const filtered = useMemo(() => {

        const trimmed = search.trim();

        return AZURE_SERVICES
            .filter((s) => category === "All" || s.category === category)
            .filter((s) => matchesQuery(s, trimmed));

    }, [category, search]);

    const {
        page: catalogPage,
        setPage: setCatalogPage,
        pageCount: catalogPageCount,
        pageItems: catalogPageItems,
        totalCount: catalogTotalCount,
        startIndex: catalogStartIndex,
        endIndex: catalogEndIndex
    } = usePagination(filtered, CATALOG_PAGE_SIZE);

    useEffect(() => {
        setCatalogPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, category]);

    function clearFilters() {
        setSearch("");
        setCategory("All");
    }

    const selectedService = selectedServiceId
        ? AZURE_SERVICES.find((s) => s.id === selectedServiceId)
        : null;

    if (selectedService) {

        return (

            <PageLayout title="Azure Services">

                <AzureServiceDetailPage
                    service={selectedService}
                    inventory={inventory}
                    onBack={goBackToCatalog}
                />

            </PageLayout>

        );

    }

    return (

        <PageLayout title="Azure Services">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Browse and access Azure services available in your subscription.
            </p>

            <div className="card">

                <h2 className="card-title">Services You're Using</h2>

                {inventoryLoading ? (

                    <p className="empty-state">Checking your Azure subscription...</p>

                ) : !inventory?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your Azure credentials (Tenant ID, Client ID, Client Secret, and
                        Subscription ID) in Settings → Credentials → Azure to see which of these
                        services your subscription is actually using.
                    </p>

                ) : inventory.error ? (

                    <p className="error-message">{inventory.error}</p>

                ) : inUseServices.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Nothing detected in your Azure subscription yet.
                    </p>

                ) : (

                    <div className="cloud-service-grid">

                        {inUseServices.map((service) => (

                            <CloudServiceCard
                                key={service.id}
                                service={service}
                                onSelect={() => navigate(service.id)}
                                liveCount={getLiveStatusForAzureService(service, inventory)?.count}
                                consoleLabel="Open Azure Portal →"
                            />

                        ))}

                    </div>

                )}

            </div>

            <br />

            <div className="card">

                <h2 className="card-title">All Azure Services</h2>

                <SearchBox
                    placeholder="Search Azure services..."
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

                    {AZURE_CATEGORIES.map((c) => (

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

                        <p className="empty-state" style={{ padding: 0 }}>No Azure services found</p>

                        <p className="field-hint">
                            Try searching for another service or category.
                        </p>

                        <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                            Clear Search
                        </button>

                    </div>

                ) : (

                    <>

                        <div className="cloud-service-grid">

                            {catalogPageItems.map((service) => (

                                <CloudServiceCard
                                    key={service.id}
                                    service={service}
                                    onSelect={() => navigate(service.id)}
                                    consoleLabel="Open Azure Portal →"
                                />

                            ))}

                        </div>

                        <Pagination
                            page={catalogPage}
                            pageCount={catalogPageCount}
                            totalCount={catalogTotalCount}
                            startIndex={catalogStartIndex}
                            endIndex={catalogEndIndex}
                            onPageChange={setCatalogPage}
                        />

                    </>

                )}

            </div>

        </PageLayout>

    );

}
