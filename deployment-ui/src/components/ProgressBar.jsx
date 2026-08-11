import LoadingMark from "./common/LoadingMark";

// Shown for the gap between clicking Deploy/Run and GitHub actually
// registering a run (see DeploymentForm's `deploying && !runId`) — once a
// runId exists, DeploymentProgress takes over with the real GitHub status.
// This is purely "your request is in flight," so it uses the same
// LoadingMark as every other loading state in the app rather than a
// bespoke spinner just for this one moment.
export default function ProgressBar({

    visible,
    label = "Deploying"

}){

    if(!visible)

        return null;

    return(

        <div className="card loading-container">

            <LoadingMark size={48} />

            <p>
                {label}
                <span className="loading-dots"><span>.</span><span>.</span><span>.</span></span>
            </p>

            <div className="loading-track"></div>

        </div>

    );

}
