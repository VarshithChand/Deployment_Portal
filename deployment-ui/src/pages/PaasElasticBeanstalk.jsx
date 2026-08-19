import { useEffect, useState } from "react";

import { getEbEnvironments } from "../services/elasticBeanstalkService";
import usePagination from "../hooks/usePagination";
import PageLayout from "../components/layout/PageLayout";
import Pagination from "../components/common/Pagination";
import SearchBox from "../components/common/SearchBox";
import StateBadge from "../components/cloudServices/StateBadge";
import ElasticBeanstalkEnvironmentDetailPage from "../components/paas/ElasticBeanstalkEnvironmentDetailPage";

const PAGE_SIZE = 10;

// Section 2's main application list, AWS Elastic Beanstalk slice - one
// GetEnvironmentsAsync call covers every application's environments at
// once (section 36's aggregation principle). "Latest Version" isn't
// shown in this list - fetching every environment's own application
// version history up front would be the exact N+1-request pattern
// section 36 warns against; it's shown on the detail page instead,
// fetched only once a specific environment is actually open.
export default function PaasElasticBeanstalk() {

    const [environments, setEnvironments] = useState(null);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);

    function load() {

        getEbEnvironments().then(setEnvironments).catch((err) => {
            console.error(err);
            setEnvironments({ configured: false, error: "Unable to reach the Deployment API." });
        });

    }

    useEffect(load, []);

    const list = environments?.environments || [];

    const filtered = list.filter((e) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [e.environmentName, e.applicationName, e.versionLabel, e.status, e.url]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    if (selected) {

        return (
            <PageLayout title="Elastic Beanstalk">
                <ElasticBeanstalkEnvironmentDetailPage
                    environmentName={selected}
                    onBack={() => { setSelected(null); load(); }}
                />
            </PageLayout>
        );

    }

    return (

        <PageLayout title="Elastic Beanstalk">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Applications and environments for this session's connected AWS account.
            </p>

            <div className="card">

                <h2 className="card-title">Environments</h2>

                {!environments ? (

                    <p className="empty-state">Loading Elastic Beanstalk environments...</p>

                ) : !environments.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your AWS credentials in Settings → Credentials → AWS to manage Elastic
                        Beanstalk.
                    </p>

                ) : environments.error ? (

                    <>
                        <p className="error-message">Unable to load Elastic Beanstalk environments.</p>
                        <p className="field-hint">{environments.error}</p>
                        <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
                    </>

                ) : (

                    <>

                        <SearchBox placeholder="Search application, environment, version, status, or URL..." value={search} onChange={setSearch} />

                        {filtered.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                                {list.length === 0 ? "No Elastic Beanstalk environments found." : `No environments match "${search}".`}
                            </p>

                        ) : (

                            <>

                                <div className="table-scroll" style={{ marginTop: "12px" }}>

                                    <table className="table">

                                        <thead>
                                            <tr>
                                                <th>Application</th>
                                                <th>Environment</th>
                                                <th>Status</th>
                                                <th>Health</th>
                                                <th>Version</th>
                                                <th>URL</th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            {pageItems.map((e) => (

                                                <tr key={e.environmentId || e.environmentName} className="table-row-clickable" onClick={() => setSelected(e.environmentName)}>
                                                    <td>{e.applicationName}</td>
                                                    <td>{e.environmentName}</td>
                                                    <td><StateBadge state={e.status} /></td>
                                                    <td>{e.health || "—"}</td>
                                                    <td className="smoke-test-metric-mono">{e.versionLabel || "—"}</td>
                                                    <td>{e.url || "—"}</td>
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

                )}

            </div>

        </PageLayout>

    );

}
