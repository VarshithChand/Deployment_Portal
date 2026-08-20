import { useEffect, useState } from "react";

import { getSonarStatus } from "../../services/sonarService";
import useNavigation from "../../hooks/useNavigation";
import { SonarQubeIcon, SonarCloudIcon } from "../layout/SidebarIcons";

const ITEMS = [
    { key: "sonarqube", label: "SonarQube", tab: "codeQuality", Icon: SonarQubeIcon },
    { key: "sonarcloud", label: "SonarCloud", tab: "sonarcloud", Icon: SonarCloudIcon }
];

// Code Quality's own slice of the Dashboard - every other integrated
// area (Cloud Services, PaaS, Container Registry, Observability) already
// gets a "hide if nothing configured" glance card; SonarQube/SonarCloud
// previously only surfaced inside Quick Access, with no dedicated card
// of their own. Same shape as ContainerRegistrySummaryCard.jsx - reuses
// the exact getSonarStatus call QuickAccessCard.jsx already makes per
// provider, no new backend endpoint.
export default function CodeQualitySummaryCard() {

    const { setTab } = useNavigation();

    const [status, setStatus] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        Promise.all([
            getSonarStatus("sonarqube").catch(() => null),
            getSonarStatus("sonarcloud").catch(() => null)
        ]).then(([sonarqube, sonarcloud]) => {

            setStatus({ sonarqube: sonarqube?.configured, sonarcloud: sonarcloud?.configured });
            setLoading(false);

        });

    }, []);

    if (loading) {
        return null;
    }

    const visible = ITEMS.filter((item) => status[item.key]);

    if (visible.length === 0) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">Code Quality</h2>

            <div className="quick-access-grid">

                {visible.map((item) => (

                    <button key={item.tab} type="button" className="quick-access-tile" onClick={() => setTab(item.tab)}>
                        <span className="quick-access-tile-icon"><item.Icon /></span>
                        <span className="quick-access-tile-label">{item.label}</span>
                    </button>

                ))}

            </div>

        </div>

    );

}
