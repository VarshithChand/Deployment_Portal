import { useState } from "react";

import useAuth from "../../hooks/useAuth";
import PageAdminAccessModal from "../PageAdminAccessModal";

// Dropped into PageLayout's `actions` slot on every page that has its own
// admin-gated actions (see SettingsService.GrantablePageKeys) — lets a full
// admin hand a specific PAT user admin authority for just this page. Only
// full admins can grant/revoke (see AdminGate's pageKey check requiring a
// login already on the allowlist, or already granted, elsewhere in the
// SettingsController endpoints this button calls), so it's hidden entirely
// for anyone else — a page-scoped grantee never sees their own grant button.
export default function PageAdminAccessButton({ pageKey, pageLabel }) {

    const { isAdminSession } = useAuth();
    const [open, setOpen] = useState(false);

    if (!isAdminSession) return null;

    return (

        <>

            <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
                Page Access
            </button>

            {open && (
                <PageAdminAccessModal
                    pageKey={pageKey}
                    pageLabel={pageLabel}
                    onClose={() => setOpen(false)}
                />
            )}

        </>

    );

}
