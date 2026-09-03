export const SKILL_GROUPS = [
    { key: "cloud", label: "Cloud", items: ["AWS · EC2", "AWS · ECS", "AWS · RDS", "AWS · S3", "AWS · IAM", "AWS · CloudWatch", "Azure"] },
    { key: "cicd", label: "CI/CD", items: ["Azure DevOps Pipelines", "GitHub Actions", "Woodpecker CI"] },
    { key: "containers", label: "Containers & Orchestration", items: ["Docker", "Kubernetes", "Harbor Registry"] },
    { key: "testing", label: "Test Automation", items: ["Playwright", "TypeScript"] },
    { key: "languages", label: "Languages & Frameworks", items: [".NET / ASP.NET Core", "React", "Node.js", "Bash"] },
    { key: "selfhost", label: "Self-Hosting / Tooling", items: ["Forgejo", "Monitoring (Prometheus/Grafana-style)"] }
];

// Flattened once so the ceiling-light node graph and the dashboard's
// TECHNOLOGIES count both derive from the same real list.
export const ALL_SKILLS = SKILL_GROUPS.flatMap((g) => g.items.map((label) => ({ group: g.key, label })));
