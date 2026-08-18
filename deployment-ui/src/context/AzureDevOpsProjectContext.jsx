import { createContext, useState } from "react";

export const AzureDevOpsProjectContext = createContext();

const STORAGE_KEY = "azureDevOpsProject";

// The one Azure DevOps project a visitor is currently working in - picked
// once on the Dashboard sub-page, then read by every other Azure DevOps
// sub-page that needs a project (Pipelines, Build Artifacts, Pull
// Requests) instead of each asking separately, matching how the real
// Azure DevOps portal's own project picker works. Branches and Package
// Feeds don't use this at all - both are already org-wide (see their own
// view components' comments on why), so there was never a per-page project
// prompt to consolidate there. Persisted to localStorage (same pattern
// Sidebar's own collapsed/expanded state uses) purely so a page reload
// doesn't silently drop back to "no project selected" - this is a UI
// preference, not a credential or anything sensitive, so localStorage (not
// a server-side session field) is the right amount of persistence for it.
function getInitialProject() {

    try {

        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;

    }
    catch {

        return null;

    }

}

export default function AzureDevOpsProjectProvider({ children }) {

    const [project, setProjectState] = useState(getInitialProject);

    function setProject(next) {

        setProjectState(next);

        if (next) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
        else {
            localStorage.removeItem(STORAGE_KEY);
        }

    }

    return (

        <AzureDevOpsProjectContext.Provider value={{ project, setProject }}>

            {children}

        </AzureDevOpsProjectContext.Provider>

    );

}
