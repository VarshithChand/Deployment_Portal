// Exactly 3 public, verified projects - per the owner's own explicit
// decision, this station does NOT list employer/work projects (their
// internal architecture details aren't the owner's to publish on a
// public portfolio). Kept in sync with the flat 2D portfolio's own data.
export const PROJECTS = [
    {
        id: "deployment-portal",
        title: "Deployment Portal",
        summary: "An internal CI/CD control panel to trigger and manage deployments across many providers/clusters.",
        architecture: ["FRONTEND (React / Vite)", "API (ASP.NET Core)", "PostgreSQL"],
        stack: [".NET 10", "React 19", "Vite", "PostgreSQL", "Render", "Cloudflare Workers"],
        live: "https://deploymentportal.in",
        github: null
    },
    {
        id: "eduvault",
        title: "EduVault",
        summary: "A Flask + MongoDB file vault with role-based access: regular users log in to upload and browse their own files, while a superuser dashboard manages every user and every uploaded file across the system.",
        architecture: ["Flask (Python)", "MongoDB Atlas", "Role-based Auth"],
        stack: ["Python", "Flask", "MongoDB", "Werkzeug"],
        live: null,
        github: "https://github.com/VarshithChand/ECHODOCS"
    },
    {
        id: "forge-stack",
        title: "Self-Hosted DevOps Platform",
        summary: "A full DevOps stack on a single Ubuntu + Docker server: Forgejo (git), Woodpecker (CI), Harbor (registry), plus monitoring.",
        architecture: ["Forgejo (Git)", "Woodpecker (CI)", "Harbor (Registry)", "Monitoring"],
        stack: ["Docker", "Forgejo", "Woodpecker CI", "Harbor", "Traefik"],
        live: null,
        github: "https://github.com/VarshithChand/Open-Source-Infra-Managemanet"
    }
];
