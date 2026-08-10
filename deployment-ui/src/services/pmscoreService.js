import api from "../api/pmscoreApi";

// The real, admin-managed environment list (same data Settings >
// Environments uses) - see PmsCoreProjectsController for why this is
// read-only; editing already lives there.
export const getProjects = async () => await api.get("/projects");
