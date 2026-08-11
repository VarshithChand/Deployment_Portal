export default function RepositoryCard({ repository }) {

    return (

        <div className="card dashboard-card tilt">

            <h2 className="card-title">

                Repository Information

            </h2>

            <div className="info-row">

                <span>Owner</span>

                <strong>

                    {repository.owner?.login || "-"}

                </strong>

            </div>

            <div className="info-row">

                <span>Repository</span>

                <strong>

                    {repository.name || "-"}

                </strong>

            </div>

            <div className="info-row">

                <span>Default Branch</span>

                <strong>

                    {repository.default_branch || "-"}

                </strong>

            </div>

            <div className="info-row">

                <span>Visibility</span>

                <strong>

                    {repository.visibility || "-"}

                </strong>

            </div>

        </div>

    );

}
