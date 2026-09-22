import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { getRolePermissionMatrix } from "../../../services/organizationService";

// Read-only display of the fixed Admin/Contributor/Read -> permission
// matrix (see OrganizationSchema's seeded role_permissions) - identical
// for every organization, since custom per-org roles don't exist yet (see
// the plan's own scope note on this). Fetched rather than hardcoded here
// so this never drifts from the backend's actual seed data.
export default function RolesPermissionsTable() {

    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        getRolePermissionMatrix()
            .then((result) => setMatrix(result.roles || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));

    }, []);

    if (loading) return <p className="field-hint">Loading...</p>;

    if (!matrix || matrix.length === 0) return <p className="empty-state">No roles configured.</p>;

    const allPermissions = [...new Set(matrix.flatMap((r) => r.permissions))].sort();

    return (

        <div className="table-scroll">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Permission</th>
                        {matrix.map((role) => (
                            <th key={role.roleKey} style={{ textAlign: "center" }}>{role.roleDisplayName}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {allPermissions.map((permission) => (
                        <tr key={permission}>
                            <td><code>{permission}</code></td>
                            {matrix.map((role) => (
                                <td key={role.roleKey} style={{ textAlign: "center" }}>
                                    {role.permissions.includes(permission)
                                        ? <Check size={15} style={{ color: "var(--color-success, #16a34a)" }} />
                                        : <span className="field-hint">—</span>}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

    );

}
