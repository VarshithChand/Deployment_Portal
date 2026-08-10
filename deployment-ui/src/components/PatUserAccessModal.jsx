import { useEffect, useState } from "react";

import { getUserSidebarAccess, saveUserSidebarAccess, clearUserSidebarAccess } from "../services/settingsService";
import { SIDEBAR_TABS } from "../constants/sidebarAccess";
import SidebarStateToggle from "./common/SidebarStateToggle";
import useToast from "../hooks/useToast";

// The Services page's "click a PAT owner's name" popup — the same
// per-tab Locked/Hidden control Settings > Sidebar Access already has for
// that user (see SettingsService.SaveSidebarAccessAsync), just reachable
// without a trip to Settings. Self-contained: fetches/saves its own
// sidebar access map rather than sharing Settings.jsx's state machinery.
export default function PatUserAccessModal({ patUserKey, patUserLabel, onClose, onSaved }) {

    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [accessMap, setAccessMap] = useState({});
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => {

        let cancelled = false;

        setLoading(true);

        getUserSidebarAccess(patUserKey)
            .then((data) => {
                if (!cancelled) setAccessMap(data || {});
            })
            .catch((err) => {

                console.error(err);
                if (!cancelled) toast.show("Failed to load this user's sidebar access.", "error");

            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patUserKey]);

    function setTabState(key, state) {
        setAccessMap((prev) => ({ ...prev, [key]: state }));
    }

    async function handleSave() {

        try {

            setSaving(true);

            const saved = await saveUserSidebarAccess(patUserKey, accessMap);
            setAccessMap(saved || {});

            toast.show("Sidebar access saved.", "success");
            onSaved?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save sidebar access.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            setClearing(true);

            await clearUserSidebarAccess(patUserKey);
            setAccessMap({});

            toast.show("Reset to fully visible.", "success");
            onSaved?.();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to reset sidebar access.", "error");

        }
        finally {

            setClearing(false);

        }

    }

    return (

        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={onClose}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >

            <div
                className="dialog dialog-wide"
                role="presentation"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >

                <h2>Sidebar Access — {patUserLabel}</h2>

                {loading ? (

                    <p className="field-hint">Loading this user's sidebar access...</p>

                ) : (

                    <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Section</th>
                                <th>Access</th>
                            </tr>
                        </thead>

                        <tbody>

                            {SIDEBAR_TABS.map(({ key, label }) => (

                                <tr key={key}>
                                    <td>{label}</td>
                                    <td>
                                        <SidebarStateToggle
                                            value={accessMap[key]}
                                            onChange={(state) => setTabState(key, state)}
                                        />
                                    </td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                    </div>

                )}

                <div>

                    <button type="button" className="btn btn-success" onClick={handleSave} disabled={saving || loading}>
                        {saving ? "Saving..." : "Save Sidebar Access"}
                    </button>

                    <button type="button" className="btn btn-danger" onClick={handleClear} disabled={clearing || loading}>
                        {clearing ? "Resetting..." : "Reset To Visible"}
                    </button>

                    <button type="button" className="btn" onClick={onClose}>
                        Close
                    </button>

                </div>

            </div>

        </div>

    );

}
