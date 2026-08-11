import { useState } from "react";

import SwitchRepositoryModal from "./SwitchRepositoryModal";
import useAuth from "../../hooks/useAuth";

export default function QuickActions({

    refresh,
    repository

}) {

    const { githubTokenConfigured } = useAuth();
    const [switchOpen, setSwitchOpen] = useState(false);

    return (

        <div className="card dashboard-card tilt">

            <h2 className="card-title">

                Quick Actions

            </h2>

            <div className="quick-actions-buttons">

                <button
                    type="button"

                    className="btn btn-primary"

                    onClick={refresh}

                >

                    Refresh Dashboard

                </button>

                {repository?.html_url && (

                    <a

                        href={repository.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-primary"

                    >

                        View Repository

                    </a>

                )}

                {githubTokenConfigured && (

                    <button
                        type="button"

                        className="btn btn-primary"
                        onClick={() => setSwitchOpen(true)}

                    >

                        Switch Repository

                    </button>

                )}

            </div>

            <SwitchRepositoryModal

                open={switchOpen}
                currentOwner={repository?.owner?.login}
                currentRepository={repository?.name}
                onClose={() => setSwitchOpen(false)}

            />

        </div>

    );

}
