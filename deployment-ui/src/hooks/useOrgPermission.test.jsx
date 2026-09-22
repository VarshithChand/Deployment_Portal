import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { OrgContext } from "../context/OrgContext";
import useOrgPermission from "./useOrgPermission";

function wrapperWithPermissions(permissions) {
    return function Wrapper({ children }) {
        const value = {
            organizations: [],
            selectedOrgId: "org-1",
            selectedOrganization: null,
            permissions,
            loading: false,
            isPersonal: false,
            selectOrganization: () => {},
            reloadOrganizations: () => {}
        };

        return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
    };
}

describe("useOrgPermission", () => {

    it("can() returns true for a permission the current org grants", () => {

        const { result } = renderHook(() => useOrgPermission(), {
            wrapper: wrapperWithPermissions(["deployments.execute", "credentials.use"])
        });

        expect(result.current.can("deployments.execute")).toBe(true);
        expect(result.current.can("credentials.use")).toBe(true);

    });

    it("can() returns false for a permission the current org does not grant", () => {

        const { result } = renderHook(() => useOrgPermission(), {
            wrapper: wrapperWithPermissions(["deployments.view"])
        });

        expect(result.current.can("credentials.delete")).toBe(false);
        expect(result.current.can("members.manage")).toBe(false);

    });

    it("can() returns false for every permission when the permission list is empty (e.g. Personal context)", () => {

        const { result } = renderHook(() => useOrgPermission(), {
            wrapper: wrapperWithPermissions([])
        });

        expect(result.current.can("organization.manage")).toBe(false);
        expect(result.current.can("deployments.execute")).toBe(false);

    });

    it("exposes the rest of OrgContext's fields alongside can()", () => {

        const { result } = renderHook(() => useOrgPermission(), {
            wrapper: wrapperWithPermissions(["audit_logs.view"])
        });

        expect(result.current.selectedOrgId).toBe("org-1");
        expect(result.current.isPersonal).toBe(false);
        expect(typeof result.current.selectOrganization).toBe("function");

    });

});
