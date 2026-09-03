// Content for the 3D "Command Center" portfolio (see components/portfolio3d/).
// PROJECTS/SKILLS were confirmed directly by the user as real (2026-09-03),
// after an earlier near-identical list turned out to be template content -
// this one was explicitly reconfirmed, not assumed. Keep this the single
// source of truth for that content, same reasoning the flat 2D portfolio
// used for its own data file.

export const PROFILE = {
    name: "Varshith Chand",
    role: "DevOps Engineer — Cloud, CI/CD & Infrastructure Automation",
    email: "v.varshith.2004@gmail.com",
    github: "https://github.com/VarshithChand",
    linkedin: "https://linkedin.com/in/varshith-chand-vuyyuru"
};

export const ABOUT = {
    whoami: [
        { prompt: "$ whoami", lines: ["Varshith Chand", "DevOps Engineer"] },
        { prompt: "", lines: ["Cloud & Infrastructure · CI/CD Automation · Containerization · Test Automation"] },
        { prompt: "", lines: ["Currently: B.Tech in AI & ML"] }
    ]
};

export const SKILL_GROUPS = [
    { key: "cloud", label: "Cloud", items: ["AWS · EC2", "AWS · ECS", "AWS · RDS", "AWS · S3", "AWS · IAM", "AWS · CloudWatch", "Azure"] },
    { key: "cicd", label: "CI/CD", items: ["Azure DevOps Pipelines", "GitHub Actions", "Woodpecker CI"] },
    { key: "containers", label: "Containers & Orchestration", items: ["Docker", "Kubernetes", "Harbor Registry"] },
    { key: "testing", label: "Test Automation", items: ["Playwright", "TypeScript"] },
    { key: "languages", label: "Languages & Frameworks", items: [".NET / ASP.NET Core", "React", "Node.js", "Bash"] },
    { key: "selfhost", label: "Self-Hosting / Tooling", items: ["Forgejo", "Monitoring (Prometheus/Grafana-style)"] }
];

// Flattened once here so the graph station and the dashboard's TECHNOLOGIES
// count both derive from the same real list instead of two hand-typed
// numbers that could drift apart.
export const ALL_SKILLS = SKILL_GROUPS.flatMap((g) => g.items.map((label) => ({ group: g.key, label })));

export const PIPELINE_STAGES = ["CODE", "GITHUB", "BUILD", "DOCKER", "TEST", "DEPLOY", "PRODUCTION"];

export const PROJECTS = [
    {
        id: "deployment-portal",
        title: "Deployment Portal",
        summary: "An internal CI/CD control panel to trigger and manage deployments across many providers/clusters.",
        architecture: ["FRONTEND (React / Vite)", "API (ASP.NET Core)", "PostgreSQL"],
        stack: [".NET 10", "React 19", "Vite", "PostgreSQL", "Render", "Cloudflare Workers"],
        live: "https://deploymentportal.in",
        github: null,
        caseStudy: null
    },
    {
        id: "rxapps360-cicd",
        title: "RxApps360 CI/CD",
        summary: "Build + approval-gated multi-cluster release pipelines for a healthcare platform's APIs (AdminAPI, PMSCoreAPI, SecurityAPI), across Azure DevOps YAML pipelines and GitHub Actions.",
        architecture: ["Build", "Artifact", "Approval Gate", "Multi-cluster Deploy"],
        stack: ["Azure DevOps Pipelines", "GitHub Actions", "YAML", "Multi-cluster"],
        live: null,
        github: null,
        caseStudy: null
    },
    {
        id: "rxapps360-e2e",
        title: "RxApps360 E2E Test Automation",
        summary: "Playwright + TypeScript end-to-end tests for the RxAsset and RxPlan modules.",
        architecture: ["Test Suite", "Playwright Runner", "RxAsset / RxPlan Modules"],
        stack: ["Playwright", "TypeScript"],
        live: null,
        github: null,
        caseStudy: null
    },
    {
        id: "vips-cloud-pms",
        title: "VIPS Cloud PMS / Piccotello API CI/CD",
        summary: "Azure DevOps multi-cluster pipelines for the Piccotello API (VCPMS).",
        architecture: ["Build", "Multi-cluster Deploy", "Piccotello API (VCPMS)"],
        stack: ["Azure DevOps Pipelines", "Multi-cluster"],
        live: null,
        github: null,
        caseStudy: null
    },
    {
        id: "aws-scheduler",
        title: "AWS Schedule Orchestrator",
        summary: "GitHub Actions + bash scheduler that starts/stops AWS ECS services and RDS instances for dev and acceptance environments (cost saving on off-hours).",
        architecture: ["GitHub Actions (schedule)", "Bash Scheduler", "AWS ECS / RDS"],
        stack: ["GitHub Actions", "Bash", "AWS ECS", "AWS RDS"],
        live: null,
        github: null,
        caseStudy: null
    },
    {
        id: "forge-stack",
        title: "Self-Hosted DevOps Platform",
        summary: "A full DevOps stack on a single Ubuntu + Docker server: Forgejo (git), Woodpecker (CI), Harbor (registry), plus monitoring.",
        architecture: ["Forgejo (Git)", "Woodpecker (CI)", "Harbor (Registry)", "Monitoring"],
        stack: ["Docker", "Forgejo", "Woodpecker CI", "Harbor", "Traefik"],
        live: null,
        // Verified against the real repo (see the flat portfolio's own
        // GitHub verification) - its README is explicit this is a
        // reference architecture with working docker-compose configs,
        // not yet run/operated.
        github: "https://github.com/VarshithChand/Open-Source-Infra-Managemanet",
        caseStudy: null
    }
];

export const EXPERIENCE_TIMELINE = [
    { year: "2024", theme: "Development", detail: "Building software foundations - languages, frameworks, and the habits that carry into everything after." },
    { year: "2025", theme: "Cloud → DevOps", detail: "Moved into cloud infrastructure and DevOps practice - AWS, Azure, CI/CD pipelines, and the DevOps with AWS internship at IntelliQ IT Trainings." },
    { year: "2026", theme: "Infrastructure → Deployment Automation", detail: "Building Deployment Portal and the automation/infrastructure work above, while finishing a B.Tech in AI & ML." }
];

// PROJECTS.length and ALL_SKILLS.length are real, derived counts - not
// hand-typed numbers that could silently drift from the actual data above.
// DEPLOYMENTS has no real source to derive from, so it's kept as an
// explicitly-labeled illustrative counter (see WallDashboard.jsx) rather
// than presented as a real metric.
export const DASHBOARD = {
    services: [
        { name: "API", status: "online" },
        { name: "DATABASE", status: "online" },
        { name: "FRONTEND", status: "online" },
        { name: "PIPELINE", status: "ready" }
    ],
    illustrativeDeployments: 127
};

export const CONTACT = {
    email: PROFILE.email,
    github: PROFILE.github,
    linkedin: PROFILE.linkedin
};
