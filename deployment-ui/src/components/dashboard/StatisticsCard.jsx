import CountUp from "../common/CountUp";

export default function StatisticsCard({

    branches,

    artifacts,

    workflows

}) {

    return (

        <div className="card dashboard-card tilt">

            <h2 className="card-title">

                Repository Statistics

            </h2>

            <div className="info-row">

                <span>Branches</span>

                <strong>

                    <CountUp value={branches.length} />

                </strong>

            </div>

            <div className="info-row">

                <span>Artifacts</span>

                <strong>

                    <CountUp value={artifacts.length} />

                </strong>

            </div>

            <div className="info-row">

                <span>Workflows</span>

                <strong>

                    <CountUp value={workflows.length} />

                </strong>

            </div>

            <div className="info-row">

                <span>Status</span>

                <strong>

                    Ready

                </strong>

            </div>

        </div>

    );

}
