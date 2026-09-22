import { createContext, useCallback, useEffect, useState } from "react";

import useAuth from "../hooks/useAuth";
import { setOrganizationHeader } from "../api/apiBase";
import { listMyOrganizations, getOrganization } from "../services/organizationService";

export const OrgContext = createContext();

const STORAGE_KEY = "selectedOrganizationId";

// "Which organization is selected" - a sibling to AuthContext ("who is
// logged in"), not merged into it, mirroring the backend's own clean split
// between identity (AuthService/RequireAuth) and org authorization
// (OrgContext.cs/OrgAuthGate). Selection is a plain UI preference
// (localStorage, restored on reload) - the thing the BACKEND actually
// trusts is the X-Organization-Id header apiBase.js stamps onto every
// request (see setOrganizationHeader), validated server-side against real
// membership on every call, never the other way around.
//
// selectedOrgId is always either the literal string "personal" or a real
// organization's GUID - NEVER the Personal organization's own database id,
// even though listMyOrganizations() returns one (see
// OrganizationService.EnsureOwnsPersonalOrganizationAsync). Sending that
// id as X-Organization-Id would make the backend treat it as a REAL
// organization context (it has its own row in organization_members) and
// look for org-scoped credentials that don't exist there - "personal"
// is what backend's OrgContext.ResolveAsync/DeploymentController.Deploy
// etc. specifically special-case as "skip organization resolution
// entirely," so the frontend must send exactly that, not a lookalike id.
export default function OrgProvider({ children }) {

    const { user, oauthStatusChecked } = useAuth();

    const [organizations, setOrganizations] = useState([]);
    const [selectedOrgId, setSelectedOrgId] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) || "personal";
        }
        catch {
            return "personal";
        }
    });
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    const selectOrganization = useCallback(async (id) => {

        const resolvedId = id || "personal";

        setSelectedOrgId(resolvedId);

        try {
            localStorage.setItem(STORAGE_KEY, resolvedId);
        }
        catch {
            // Private-browsing/storage-blocked - selection just won't
            // survive a reload, nothing else depends on this succeeding.
        }

        setOrganizationHeader(resolvedId);

        if (resolvedId === "personal") {
            setPermissions([]);
            return;
        }

        try {
            const detail = await getOrganization(resolvedId);
            setPermissions(detail.permissions || []);
        }
        catch (err) {
            console.error(err);
            setPermissions([]);
        }

    }, []);

    const loadOrganizations = useCallback(async () => {

        setLoading(true);

        try {

            const result = await listMyOrganizations();
            const orgs = result.organizations || [];

            setOrganizations(orgs);

            // A stored selection pointing at an org the caller no longer
            // belongs to (removed, or never existed - e.g. organizations
            // just became unavailable on this deployment) falls back to
            // Personal rather than silently sending a header the backend
            // will 403 on every request.
            const stillValid = selectedOrgId === "personal" || orgs.some((o) => o.id === selectedOrgId);

            await selectOrganization(stillValid ? selectedOrgId : "personal");

        }
        catch (err) {
            console.error(err);
            setOrganizations([]);
        }
        finally {
            setLoading(false);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectOrganization]);

    useEffect(() => {

        if (!oauthStatusChecked) return;

        if (!user) {
            setOrganizations([]);
            setLoading(false);
            return;
        }

        loadOrganizations();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [oauthStatusChecked, user]);

    const selectedOrganization = organizations.find((o) =>
        selectedOrgId === "personal" ? o.accountType === "personal" : o.id === selectedOrgId) || null;

    const value = {
        organizations,
        selectedOrgId,
        selectedOrganization,
        permissions,
        loading,
        isPersonal: selectedOrgId === "personal",
        selectOrganization,
        reloadOrganizations: loadOrganizations
    };

    return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;

}
