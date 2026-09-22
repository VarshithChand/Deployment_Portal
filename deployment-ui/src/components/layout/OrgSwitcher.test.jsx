import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { OrgContext } from "../../context/OrgContext";
import OrgSwitcher from "./OrgSwitcher";

function renderWithOrgContext(value) {
    const fullValue = {
        organizations: [],
        selectedOrgId: "personal",
        selectedOrganization: null,
        permissions: [],
        loading: false,
        isPersonal: true,
        selectOrganization: () => {},
        reloadOrganizations: () => {},
        ...value
    };

    return render(
        <OrgContext.Provider value={fullValue}>
            <OrgSwitcher />
        </OrgContext.Provider>
    );
}

describe("OrgSwitcher", () => {

    it("renders nothing while organizations are still loading", () => {

        const { container } = renderWithOrgContext({ loading: true });

        expect(container).toBeEmptyDOMElement();

    });

    it("renders nothing when the caller only has their own Personal org", () => {

        const { container } = renderWithOrgContext({
            organizations: [{ id: "personal-org-id", name: "Personal", accountType: "personal", roleDisplayName: "Admin" }]
        });

        expect(container).toBeEmptyDOMElement();

    });

    it("renders a switcher once a second, real organization exists", () => {

        renderWithOrgContext({
            organizations: [
                { id: "personal-org-id", name: "Personal", accountType: "personal", roleDisplayName: "Admin" },
                { id: "real-org-id", name: "Acme Organization", accountType: "organization", roleDisplayName: "Admin" }
            ]
        });

        expect(screen.getByRole("combobox", { name: "Current organization" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Personal" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Acme Organization" })).toBeInTheDocument();

    });

    it("uses the literal string \"personal\" as the Personal option's value, never the Personal org's own database id", () => {

        // See OrgContext.jsx's own comment on why this specific detail
        // matters: sending the Personal org's real GUID as
        // X-Organization-Id would make the backend treat it as a real
        // organization context instead of skipping org resolution
        // entirely.
        renderWithOrgContext({
            organizations: [
                { id: "some-real-guid-1234", name: "Personal", accountType: "personal", roleDisplayName: "Admin" },
                { id: "real-org-id", name: "Acme Organization", accountType: "organization", roleDisplayName: "Admin" }
            ]
        });

        const personalOption = screen.getByRole("option", { name: "Personal" });

        expect(personalOption.value).toBe("personal");
        expect(personalOption.value).not.toBe("some-real-guid-1234");

    });

});
