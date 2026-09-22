import useOrgPermission from "../../hooks/useOrgPermission";

// TopBar's organization switcher - same "current context" slot as the
// repo-name/AWS-identity badges already living there (see TopBar.jsx).
// Renders nothing while organizations are still loading, or when the
// caller only has their own Personal org (nothing to switch between yet) -
// a lone "Personal" option would be a dropdown with one dead choice.
// Plain <select> rather than a custom dropdown menu - accessible and
// keyboard-usable for free, no new menu/overlay component introduced for
// this feature.
export default function OrgSwitcher() {

    const { organizations, selectedOrgId, selectOrganization, loading } = useOrgPermission();

    if (loading || organizations.length < 2) return null;

    return (

        <select
            className="form-control"
            style={{ width: "auto", maxWidth: 180, padding: "7px 10px" }}
            value={selectedOrgId}
            onChange={(e) => selectOrganization(e.target.value)}
            title="Current organization"
            aria-label="Current organization"
        >
            {organizations.map((org) => (
                <option key={org.id} value={org.accountType === "personal" ? "personal" : org.id}>
                    {org.accountType === "personal" ? "Personal" : org.name}
                </option>
            ))}
        </select>

    );

}
