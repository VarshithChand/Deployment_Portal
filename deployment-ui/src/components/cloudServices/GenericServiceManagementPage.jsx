import { getLiveStatusForService } from "../../utils/cloudServiceLiveStatus";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";

const PAGE_SIZE = 10;

// The fallback for every one of the ~90 catalog services that don't have
// a dedicated management page (EC2/ECS/ECR/Lambda/RDS/S3/VPC above do) -
// whatever the account-wide inventory's generic Tagging API scan already
// knows about this service (see utils/cloudServiceLiveStatus.js), plus an
// honest "not implemented" notice rather than fake action buttons
// (section 34 of the request this came from).
export default function GenericServiceManagementPage({ service, inventory }) {

    if (!inventory) {
        return <div className="card"><p className="empty-state">Loading AWS resources...</p></div>;
    }

    if (!inventory.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to see live status here.
                </p>
            </div>
        );

    }

    const status = getLiveStatusForService(service, inventory);

    return (

        <>

            <div className="card">

                <h2 className="card-title">Resources</h2>

                {!status ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        This operation is not currently available in the Deployment Portal. Open AWS
                        Console above for advanced management of {service.name}.
                    </p>

                ) : status.error ? (

                    <>
                        <p className="error-message">Unable to load {service.name} resources.</p>
                        <p className="field-hint">{status.error}</p>
                    </>

                ) : (

                    <GenericResourceTable status={status} />

                )}

            </div>

            <p className="field-hint">
                Management actions for {service.name} aren't implemented in the Deployment Portal yet —
                use <strong>Open AWS Console</strong> above for start/stop/create/delete and deeper
                configuration.
            </p>

        </>

    );

}

function GenericResourceTable({ status }) {

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
                                    <th>Detail</th>
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
