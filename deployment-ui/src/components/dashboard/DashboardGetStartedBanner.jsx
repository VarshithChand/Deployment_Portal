import useNavigation from "../../hooks/useNavigation";

// Shown instead of a page full of "Not Connected"/"0" tiles and empty
// panels when literally nothing is connected yet (a brand new account, or
// - as happened once this session - a database swap that wiped every
// saved credential). One clear next action instead of the same "nothing
// here" message repeated across a dozen cards.
export default function DashboardGetStartedBanner() {

    const { setTab } = useNavigation();

    return (

        <div className="card dash-get-started">

            <h2 className="card-title">Nothing connected yet</h2>

            <p className="empty-state" style={{ margin: "0 0 18px", padding: 0, textAlign: "left" }}>
                This account has no GitHub, cloud provider, or hosting credentials saved, so the
                panels below have nothing to show. Connect GitHub first, then a cloud provider, to
                start seeing real runs, resources, and health data here.
            </p>

            <div className="button-row">
                <button type="button" className="btn btn-primary" onClick={() => setTab("settings")}>
                    Connect an integration
                </button>
            </div>

        </div>

    );

}
