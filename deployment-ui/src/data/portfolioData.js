// All content for the login page's Portfolio tool (see pages/Portfolio.jsx)
// lives here, not hardcoded in the component - the point is a future edit
// (a new project, a new cert, an updated "currently building" list) means
// touching one data file, not hunting through JSX.
//
// Source of truth: Varshith Chand Vuyyuru's own resume. Nothing below
// invents a company, a certification, a metric, or a technology that
// wasn't already in that source - where the resume only shows exposure
// to something (GCP, for instance) rather than specific hands-on
// services, this file deliberately stays that vague too instead of
// filling in plausible-sounding detail.

export const PROFILE = {
    name: "Varshith Chand Vuyyuru",
    role: "Aspiring DevOps Engineer",
    positioning: "I build and automate cloud infrastructure, CI/CD pipelines, containerized applications, and secure deployment platforms.",
    tagline: "DevOps Engineer building automated, scalable cloud infrastructure.",
    summary: "Aspiring DevOps Engineer with a strong foundation in cloud infrastructure, containerization, CI/CD, and automation — building scalable and secure systems using AWS, Docker, Kubernetes, and Jenkins.",
    email: "v.varshith.2004@gmail.com",
    phone: "+91-6300706438",
    location: "Bapatla, Andhra Pradesh",
    linkedin: "https://linkedin.com/in/varshith-chand-vuyyuru",
    github: "https://github.com/VarshithChand",
    githubUsername: "VarshithChand"
};

// Shown in the hero as a quiet marquee of the stack, not a claim of
// mastery in each - the Skills section below is where depth is actually
// asserted (and even there, capped at what the resume lists).
export const HERO_STACK = ["AWS", "Docker", "Kubernetes", "Terraform", "GitHub Actions", "Linux"];

export const ABOUT_STACK = [
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible",
    "Jenkins", "GitHub Actions", "Linux", "ASP.NET Core", "React", "PostgreSQL"
];

export const ABOUT_PARAGRAPHS = [
    "I'm an aspiring DevOps/Cloud Engineer with hands-on experience building deployment automation, cloud infrastructure, CI/CD pipelines, containerized applications, and the authentication and monitoring systems that sit around them.",
    "My own Deployment Portal project is where most of this comes together in one place: I use GitHub Actions and Azure DevOps Pipelines to automate the build-test-deploy lifecycle, Docker to containerize and standardize how services run, and AWS/Azure/GCP for the cloud infrastructure those deployments target. Terraform and Ansible are the infrastructure-as-code and configuration tools I use to keep that infrastructure repeatable rather than hand-configured. On the application side, I build the backend and auth layer itself in ASP.NET Core and Flask/Django — including JWT/OAuth 2.0 sessions and multi-factor authentication — with React on the frontend and PostgreSQL as the data layer, and Prometheus/Grafana for monitoring what's running."
];

// Category order here IS the display order in the Skills section.
export const SKILL_CATEGORIES = [
    {
        key: "cloud",
        label: "Cloud",
        icon: "Cloud",
        items: ["AWS", "EC2", "S3", "IAM", "VPC", "EKS", "ECR", "Route 53", "Azure App Service", "Azure DevOps", "GCP"]
    },
    {
        key: "cicd",
        label: "CI/CD",
        icon: "GitBranch",
        items: ["GitHub Actions", "Jenkins", "Azure DevOps Pipelines", "Maven", "Automated Deployment", "Workflow Automation"]
    },
    {
        key: "containers",
        label: "Containers & Orchestration",
        icon: "Box",
        items: ["Docker", "Kubernetes", "EKS", "Container Registries"]
    },
    {
        key: "iac",
        label: "Infrastructure as Code",
        icon: "FileCode",
        items: ["Terraform", "Ansible", "YAML"]
    },
    {
        key: "monitoring",
        label: "Monitoring",
        icon: "Activity",
        items: ["Prometheus", "Grafana", "Application Monitoring", "Infrastructure Monitoring"]
    },
    {
        key: "development",
        label: "Development",
        icon: "Code",
        items: ["Python", "C#", "JavaScript", "ASP.NET Core", "Flask", "Django", "React", "REST APIs", "JWT", "OAuth 2.0"]
    },
    {
        key: "platforms",
        label: "Databases & Platforms",
        icon: "Database",
        items: ["PostgreSQL", "Render", "Cloudflare Workers", "Linux", "Windows", "Git", "GitHub"]
    }
];

// "What I Build" - capability cards. Deliberately worded as what the
// resume's own project evidence supports, not a generic skills restate -
// each maps back to something actually built in Deployment Portal/EduVault.
export const CAPABILITIES = [
    {
        key: "cicd-automation",
        icon: "GitBranch",
        title: "CI/CD Automation",
        description: "Designing automated pipelines that carry a change from commit through to a deployed, monitored service.",
        flow: ["Build", "Test", "Package", "Deploy", "Monitor"]
    },
    {
        key: "cloud-infrastructure",
        icon: "Cloud",
        title: "Cloud Infrastructure",
        description: "Deploying and managing applications across AWS, Azure, and GCP.",
        flow: ["AWS", "Azure", "GCP"]
    },
    {
        key: "containerization",
        icon: "Box",
        title: "Containerization",
        description: "Building reproducible runtime environments with Docker and Kubernetes.",
        flow: ["Docker", "Kubernetes", "EKS", "ECR"]
    },
    {
        key: "iac",
        icon: "FileCode",
        title: "Infrastructure as Code",
        description: "Automating infrastructure provisioning with Terraform and Ansible instead of hand-configuring it.",
        flow: ["Terraform", "Ansible", "YAML"]
    },
    {
        key: "cloud-automation",
        icon: "Workflow",
        title: "Cloud Automation",
        description: "Automating cloud resources and the operational workflows around them.",
        flow: ["Provision", "Configure", "Operate"]
    },
    {
        key: "security",
        icon: "ShieldCheck",
        title: "Security",
        description: "Applying IAM, JWT/OAuth 2.0, MFA, role-based access control, and secrets management as part of the architecture, not an afterthought.",
        flow: ["IAM", "JWT / OAuth 2.0", "MFA", "RBAC", "Secrets"]
    },
    {
        key: "monitoring",
        icon: "Activity",
        title: "Monitoring",
        description: "Watching what's running with Prometheus/Grafana, logs, and health checks.",
        flow: ["Prometheus", "Grafana", "Logs", "Health Checks"]
    }
];

export const ENGINEERING_FOCUS = [
    "Cloud Infrastructure", "CI/CD Automation", "Containerization", "Kubernetes",
    "Infrastructure as Code", "Cloud Security", "Monitoring & Observability",
    "Developer Productivity", "Deployment Automation"
];

// Update this list yourself as things change - it's intentionally a plain
// array of strings so a new entry is a one-line edit, not a JSX change.
// Left with exactly one item: the one thing verifiably true right now
// (this project is under active, ongoing development). Add to it as new
// work actually starts - nothing here should say "building" unless it is.
export const CURRENTLY_BUILDING = [
    "Deployment Portal — actively adding features (auth flows, MFA, admin tooling, CI/CD orchestration)"
];

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export const DEPLOYMENT_PORTAL = {
    name: "Deployment Portal",
    tagline: "An internal CI/CD deployment console for triggering, monitoring, and approving GitHub Actions workflows across environments.",
    year: "2026",
    featured: true,
    github: "https://github.com/VarshithChand/Deployment_Portal",
    // Set to a real, currently-reachable URL only - never a placeholder.
    // This portfolio is itself served from the Deployment Portal's own
    // login page, so "live" here means exactly that: the same app this
    // page is running inside of.
    live: null,
    stack: [
        "React 19", "Vite", "ASP.NET Core", "PostgreSQL", "GitHub Actions",
        "AWS", "Azure", "GCP", "Docker", "Cloudflare Workers", "Render"
    ],
    overview: "A full-stack internal CI/CD deployment portal built to trigger, monitor, and approve GitHub Actions workflows across environments from one console, instead of switching between GitHub, cloud consoles, and registry dashboards separately.",
    architecture: {
        summary: "React (Vite) frontend deployed on Cloudflare Workers, talking to an ASP.NET Core Web API on Render, backed by PostgreSQL — with GitHub Actions as the workflow engine being orchestrated and OAuth/MFA guarding every session.",
        nodes: [
            { id: "frontend", label: "React Frontend", detail: "Cloudflare Workers" },
            { id: "api", label: "ASP.NET Core Web API", detail: "Render" },
            { id: "db", label: "PostgreSQL", detail: "Persistence" },
            { id: "actions", label: "GitHub Actions", detail: "Workflow engine" },
            { id: "auth", label: "Auth", detail: "OAuth / MFA" },
            { id: "cloud", label: "Cloud Deployment", detail: "AWS / Azure / GCP" }
        ]
    },
    features: [
        "Trigger and monitor GitHub Actions workflows across environments from one console",
        "Approval workflows for gated deployments",
        "Multi-cloud service management across AWS, Azure, and GCP",
        "Docker-based deployment integration and container registry management",
        "Role-based Admin/Viewer access with granular per-page permissions",
        "Audit logging of settings changes and admin actions"
    ],
    security: [
        "Email/password signup with hashed passwords, plus Google and GitHub OAuth 2.0",
        "JWT-based sessions",
        "Mandatory TOTP multi-factor authentication",
        "Role-based (Admin/Viewer) access control enforced server-side on every request",
        "Audit log of security-relevant actions"
    ],
    cicd: [
        "GitHub Actions workflows are the thing being orchestrated, not just the CI for this repo itself",
        "Azure DevOps Pipelines integration alongside GitHub Actions",
        "Docker-based deployment steps"
    ],
    deployment: "React/Vite frontend deployed via Cloudflare Workers; ASP.NET Core API deployed on Render; PostgreSQL as the persistence layer.",
    challenges: [
        "Coordinating one consistent auth/session model across three different login methods (password, Google OAuth, GitHub OAuth) that all still need to converge on the same MFA gate.",
        "Keeping cloud credentials (AWS/Azure/GCP) and registry tokens isolated per session while still centralizing the operations that use them."
    ]
};

export const EDUVAULT = {
    name: "EduVault",
    tagline: "Cloud-Based Document Management System",
    year: "2026",
    featured: false,
    github: null,
    live: null,
    stack: ["Flask", "AWS EC2", "Docker", "Git", "Linux", "Jenkins"],
    overview: "A role-based document management platform deployed on AWS EC2, containerized with Docker for consistent runtime environments across deploys.",
    features: [
        "Role-based document management",
        "AWS EC2 deployment on a hardened Linux environment",
        "Docker containerization for consistent runtime environments",
        "Jenkins CI/CD pipeline for automated testing and deployment"
    ],
    infrastructure: {
        summary: "Jenkins builds and tests the app, packages it into a Docker image, and deploys it to a Linux-hardened AWS EC2 instance.",
        nodes: [
            { id: "git", label: "Git", detail: "Source" },
            { id: "jenkins", label: "Jenkins", detail: "CI/CD" },
            { id: "docker", label: "Docker", detail: "Container image" },
            { id: "ec2", label: "AWS EC2", detail: "Linux, hardened" }
        ]
    }
};

// ---------------------------------------------------------------------
// Diagrams / flows (used by FlowDiagram)
// ---------------------------------------------------------------------

export const DEVOPS_LIFECYCLE_FLOW = [
    "Developer", "Git / GitHub", "CI Pipeline", "Build", "Test",
    "Docker", "Container Registry", "Deployment", "AWS / Azure / GCP", "Monitoring", "Logs / Metrics"
];

export const CICD_FLOW = [
    "Code Commit", "GitHub", "Pipeline Trigger", "Build", "Test",
    "Docker Build", "Registry", "Deployment", "Health Check"
];

export const IAC_FLOW = ["Infrastructure Code", "Plan", "Review", "Apply", "Cloud Infrastructure"];

export const AUTOMATION_FLOW = ["Manual Task", "Script / Pipeline", "Automation", "Repeatable Deployment"];

export const AUTOMATION_AREAS = [
    "Cloud Automation", "Deployment Automation", "CI/CD Automation",
    "Infrastructure Automation", "Container Automation", "Workflow Automation", "Operational Automation"
];

// ---------------------------------------------------------------------
// Cloud
// ---------------------------------------------------------------------

export const CLOUD_PROVIDERS = [
    { key: "aws", label: "AWS", services: ["EC2", "S3", "IAM", "VPC", "EKS", "ECR", "Route 53"] },
    { key: "azure", label: "Azure", services: ["App Service", "Azure DevOps"] },
    // GCP: resume lists no specific services - deliberately shown without
    // inventing any, per the "don't fabricate services I haven't used" rule.
    { key: "gcp", label: "GCP", services: [] }
];

// ---------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------

export const SECURITY_ITEMS = [
    "JWT", "OAuth 2.0", "Google OAuth", "GitHub OAuth", "MFA / TOTP",
    "Role-Based Access Control", "IAM", "Audit Logging", "Secrets Management"
];

export const DEPLOYMENT_PORTAL_SECURITY_HIGHLIGHTS = [
    "Admin / Viewer roles", "Page-level permissions", "OAuth authentication", "MFA", "Audit logs"
];

// ---------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------

export const MONITORING_ITEMS = [
    "Prometheus", "Grafana", "Application Logs", "Health Checks",
    "Infrastructure Monitoring", "Deployment Monitoring"
];

// ---------------------------------------------------------------------
// Experience / Education / Certifications
// ---------------------------------------------------------------------

// `kind` distinguishes an Internship from Training from a real
// Certification - the resume contains no formal certification (an exam-
// issued credential), only training and internships, so nothing here is
// tagged "certification".
export const EXPERIENCE = [
    {
        kind: "internship",
        title: "DevOps with AWS",
        org: "IntelliQ IT Trainings, Hyderabad",
        skills: ["Git", "Jenkins", "Docker", "Kubernetes", "Ansible", "Terraform", "AWS", "Prometheus", "Maven", "Python"]
    },
    {
        kind: "internship",
        title: "Generative AI Internship",
        org: "NRI Institute of Technology",
        skills: ["Prompt Engineering", "AI APIs", "Flask"]
    }
];

export const TRAINING = [
    {
        kind: "training",
        title: "AWS Cloud Foundations",
        org: "Udemy",
        skills: ["EC2", "IAM", "VPC configuration"]
    }
];

export const EDUCATION = [
    { school: "NRI Institute of Technology", detail: "B.Tech in Artificial Intelligence & Machine Learning", meta: "GPA: 8.0 / 10", year: "2026" },
    { school: "Sri Chaitanya Junior College", detail: "Intermediate Education (MPC)", meta: "GPA: 6.0 / 10", year: "2022" },
    { school: "Sri Chaitanya Techno School", detail: "SSC Board of Education", meta: "GPA: 9.8 / 10", year: "2020" }
];

export const SOFT_SKILLS = [
    "Collaboration with teams", "Troubleshooting & root-cause analysis",
    "Documentation", "Adaptability", "Continuous learning"
];

// Every exact string a recruiter's keyword search is likely to run - kept
// as one visible chip row (Engineering Focus / Skills already surface
// most of these individually; this is the deliberate superset) rather
// than hidden/stuffed text, which would be bad SEO practice as well as
// dishonest.
export const ATS_KEYWORDS = [
    "DevOps", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible",
    "Jenkins", "GitHub Actions", "CI/CD", "Linux", "Python", "C#", "ASP.NET Core",
    "React", "PostgreSQL", "Prometheus", "Grafana"
];
