import { useEffect, useMemo, useState } from "react";

import AWS_SERVICES, { AWS_CATEGORIES } from "../data/awsServiceCatalog";
import AWS_REGIONS from "../data/awsRegions";
import { getMyAwsResources } from "../services/settingsService";
import { getLiveStatusForService } from "../utils/cloudServiceLiveStatus";
import usePolling from "../hooks/usePolling";
import usePagination from "../hooks/usePagination";
import useNavigation from "../hooks/useNavigation";
import PageLayout from "../components/layout/PageLayout";
import SearchBox from "../components/common/SearchBox";
import ComboBox from "../components/common/ComboBox";
import Pagination from "../components/common/Pagination";
import CloudServiceCard from "../components/cloudServices/CloudServiceCard";
import CloudServiceDetailPage from "../components/cloudServices/CloudServiceDetailPage";

// Matches the repo-picker grids' own convention (SwitchRepositoryModal,
// AllRepositoriesCard both use 6-9) rather than the 10-per-page default
// for plain tables - this is a card grid, same shape of UI.
const CATALOG_PAGE_SIZE = 9;

// Cloud Services' AWS sub-page (see Sidebar.jsx's "cloudServicesGroup" -
// Azure/GCP are real, separate, visible "not built yet" pages instead of
// living inside this same page behind a provider switcher, which is what
// this page used to have before the Sidebar grew nested groups. Every
// AWS_SERVICES entry still carries its own `provider` field (kept, not
// stripped, in case a real Azure/GCP catalog is pushed into this same data
// file later) - only the user-facing provider picker itself was removed,
// since there was never more than one real option behind it.
const SERVICE_PARAM_KEYS = ["service", "cluster", "ecsService", "repo"];

function readRouteParams() {

    const params = new URLSearchParams(window.location.search);

    return {
        service: params.get("service"),
        cluster: params.get("cluster"),
        ecsService: params.get("ecsService"),
        repo: params.get("repo")
    };

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

// The catalog is local, static configuration data (see
// data/awsServiceCatalog.js), never fetched - there's nothing here an API
// call would improve on. Live resource data (running instances, cluster
// task counts, etc.) is fetched separately, only once a specific service
// page is actually open - see the individual *ManagementPage components.
export default function CloudServicesAws() {

    const { pendingCloudService, setPendingCloudService } = useNavigation();

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [routeParams, setRouteParams] = useState(readRouteParams);

    // The browser's own Back/Forward buttons change the URL without
    // calling navigate() below - this is what keeps this component's
    // state in sync when that happens (section 32).
    useEffect(() => {

        function handlePopState() {
            setRouteParams(readRouteParams());
        }

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);

    }, []);

    // The account-wide inventory (see Dashboard's AWS Services card, same
    // data source) - reused here rather than fetched twice, and it's what
    // powers "which services am I actually using" below without hitting
    // AWS once per catalog entry.
    const [inventory, setInventory] = useState(null);
    const [inventoryLoading, setInventoryLoading] = useState(true);

    // null = "use whatever region is saved with the AWS credential" (the
    // backend's own default, see CloudStatusService) - only becomes a real
    // value once the region picker below is touched, so nothing changes
    // for anyone who never uses it.
    const [selectedRegion, setSelectedRegion] = useState(null);

    async function loadInventory(region) {

        try {
            setInventory(await getMyAwsResources(region ?? selectedRegion));
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setInventoryLoading(false);
        }

    }

    // 45s - this already rides the same 20s server-side cache the
    // Dashboard's own AWS Services card shares, so polling here doesn't
    // add extra AWS calls beyond whichever card asks first.
    usePolling(loadInventory, 45000);

    function handleRegionChange(region) {

        setSelectedRegion(region || null);
        setInventoryLoading(true);
        loadInventory(region || null);

    }

    // Pushes a new history entry (real Back/Forward support) with
    // whichever of service/cluster/ecsService/repo the caller passes -
    // any key it omits is cleared, so e.g. navigate({ service: "ecs" })
    // from a service-detail page correctly drops the stale cluster/
    // ecsService params rather than leaving them dangling.
    function navigate(next) {

        const url = new URL(window.location.href);
        url.searchParams.set("tab", "cloudServicesAws");

        SERVICE_PARAM_KEYS.forEach((key) => {

            if (next[key]) {
                url.searchParams.set(key, next[key]);
            }
            else {
                url.searchParams.delete(key);
            }

        });

        window.history.pushState(null, "", url);

        setRouteParams({
            service: next.service || null,
            cluster: next.cluster || null,
            ecsService: next.ecsService || null,
            repo: next.repo || null
        });

    }

    // Landed here from the Dashboard's AWS Services card - open straight
    // into that service's own management page (same "pendingX" hand-off as
    // Environments' pendingEnvironmentName) rather than the catalog, then
    // consume it so navigating away and back doesn't reopen it unexpectedly.
    useEffect(() => {

        if (pendingCloudService) {

            navigate({ service: pendingCloudService });
            setPendingCloudService(null);

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingCloudService]);

    function goBackToCatalog() {
        navigate({});
    }

    const providerServices = useMemo(
        () => AWS_SERVICES.filter((s) => s.provider === "aws"),
        []
    );

    const inUseServices = useMemo(() => {

        if (!inventory?.configured) {
            return [];
        }

        return providerServices.filter((s) => {
            const status = getLiveStatusForService(s, inventory);
            return status && !status.error && status.count > 0;
        });

    }, [providerServices, inventory]);

    const filtered = useMemo(() => {

        const trimmed = search.trim();

        return providerServices
            .filter((s) => category === "All" || s.category === category)
            .filter((s) => matchesQuery(s, trimmed));

    }, [providerServices, category, search]);

    // "All AWS Services" is the full catalog (~100 entries for AWS alone) -
    // exactly the kind of growing/large grid the project's pagination
    // policy requires, unlike "Services You're Using" above (bounded by
    // what an account actually has running, realistically always small).
    const {
        page: catalogPage,
        setPage: setCatalogPage,
        pageCount: catalogPageCount,
        pageItems: catalogPageItems,
        totalCount: catalogTotalCount,
        startIndex: catalogStartIndex,
        endIndex: catalogEndIndex
    } = usePagination(filtered, CATALOG_PAGE_SIZE);

    // usePagination only snaps back when the current page no longer exists
    // (pageCount shrinks past it) - a search/category change can produce a
    // same-or-larger pageCount while still being a completely different
    // result set, so this resets explicitly rather than potentially
    // leaving page 3 of "EC2" showing page 3 of "database" instead.
    useEffect(() => {
        setCatalogPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, category]);

    function clearFilters() {
        setSearch("");
        setCategory("All");
    }

    const selectedService = routeParams.service
        ? AWS_SERVICES.find((s) => s.id === routeParams.service)
        : null;

    // Section 2's "primary click" behavior - a service card now navigates
    // to its dedicated management page instead of opening a modal (the
    // old CloudServiceDetailModal is gone). "Open AWS Console" on the
    // card itself is untouched - that's still a direct link, unaffected
    // by this.
    function goToService(id) {
        navigate({ service: id });
    }

    if (selectedService) {

        return (

            <PageLayout title="AWS Services">

                <CloudServiceDetailPage
                    service={selectedService}
                    routeParams={routeParams}
                    inventory={inventory}
                    onNavigate={navigate}
                    onBack={goBackToCatalog}
                />

            </PageLayout>

        );

    }

    // routeParams.service pointed at an id no longer in the catalog (or a
    // stale/hand-edited URL) - fall back to the catalog rather than a
    // blank page.

    return (

        <PageLayout title="AWS Services">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Browse and access AWS services available in your environment.
            </p>

            <div className="card">

                <h2 className="card-title">Services You're Using</h2>

                {inventory?.configured && (

                    <div className="form-group cloud-provider-select-group">

                        <label>Region</label>

                        <ComboBox
                            options={AWS_REGIONS}
                            value={selectedRegion || inventory.region || ""}
                            onChange={handleRegionChange}
                            placeholder={inventory.region || "us-east-1"}
                        />

                    </div>

                )}

                {inventoryLoading ? (

                    <p className="empty-state">Checking your AWS account...</p>

                ) : !inventory?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your AWS credentials in Settings → Credentials → AWS to see which of
                        these services your account is actually using.
                    </p>

                ) : inUseServices.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Nothing detected running in {inventory.region || "your AWS account"} yet.
                    </p>

                ) : (

                    <div className="cloud-service-grid">

                        {inUseServices.map((service) => (

                            <CloudServiceCard
                                key={service.id}
                                service={service}
                                onSelect={() => goToService(service.id)}
                                liveCount={getLiveStatusForService(service, inventory)?.count}
                            />

                        ))}

                    </div>

                )}

            </div>

            <br />

            <div className="card">

                <h2 className="card-title">All AWS Services</h2>

                <SearchBox
                    placeholder="Search AWS services..."
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

                    <>

                        <div className="cloud-service-grid">

                            {catalogPageItems.map((service) => (

                                <CloudServiceCard
                                    key={service.id}
                                    service={service}
                                    onSelect={() => goToService(service.id)}
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
