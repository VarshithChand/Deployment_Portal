import { useContext } from "react";
import { OrgContext } from "../context/OrgContext";

// The one centralized place org-aware UI checks a permission - mirrors
// useAuth()'s shape. can(key) reads off the CURRENTLY SELECTED
// organization's resolved permission set (see OrgContext's own comment) -
// always false in Personal context, which is correct: Personal-mode UI
// (deploy button, cloud service actions, etc.) doesn't consult this at
// all, it keeps using the pre-existing isAdminSession/role checks
// untouched (see the plan's own "no unification" decision for why this is
// a THIRD, independent gating mechanism, not a rework of the other two).
export default function useOrgPermission() {

    const context = useContext(OrgContext);

    function can(permissionKey) {
        return context.permissions.includes(permissionKey);
    }

    return { ...context, can };

}
