import {
    Mail, Phone, MapPin, ExternalLink, GraduationCap, Briefcase,
    Award, Sparkles, Code, Cloud, Terminal, Layers
} from "lucide-react";

// The login page's third no-login tool (see LoginSignupPage's toolsMenu) -
// a static, 100% client-side page built from Varshith Chand Vuyyuru's own
// resume content, same "nothing sent anywhere" shape as Template Tester.
// Scoped under .pf-root and built entirely from this app's own theme
// tokens (var(--card-bg)/--text/--heading-accent/etc - the same ones
// LoginSignupPage's .aw-root and Dashboard's .dp-root already draw from),
// so it matches the rest of the app and follows the light/dark toggle
// rather than being a disconnected fixed-palette page.
const PROFILE = {
    name: "Varshith Chand Vuyyuru",
    title: "Aspiring DevOps Engineer",
    tagline: "Strong foundation in cloud infrastructure, containerization, CI/CD, and automation - building scalable and secure systems using AWS, Docker, Kubernetes, and Jenkins.",
    email: "v.varshith.2004@gmail.com",
    phone: "+91-6300706438",
    location: "Bapatla, Andhra Pradesh",
    linkedin: "https://linkedin.com/in/varshith-chand-vuyyuru",
    github: "https://github.com/VarshithChand"
};

const SKILLS = [
    { label: "Languages", icon: Code, items: ["Python", "C#", "JavaScript", "YAML"] },
    { label: "Backend", icon: Terminal, items: ["ASP.NET Core", "Flask", "Django", "REST APIs", "JWT & OAuth 2.0"] },
    { label: "Frontend", icon: Layers, items: ["React", "HTML", "CSS"] },
    { label: "Cloud", icon: Cloud, items: ["AWS (EC2, S3, IAM, VPC, EKS, Route 53, ECR)", "Azure (App Service, DevOps)", "GCP"] },
    { label: "DevOps & CI/CD", icon: Sparkles, items: ["Jenkins", "GitHub Actions", "Azure DevOps Pipelines", "Docker", "Kubernetes", "Ansible", "Terraform", "Prometheus", "Grafana"] },
    { label: "Data & Hosting", icon: Cloud, items: ["PostgreSQL", "Render", "Cloudflare Workers"] },
    { label: "Tools & OS", icon: Terminal, items: ["Git", "GitHub", "Maven", "Linux", "Windows"] }
];

const PROJECTS = [
    {
        name: "Deployment Portal",
        year: "2026",
        stack: "React, ASP.NET Core, PostgreSQL, GitHub Actions, AWS/Azure/GCP, Docker",
        points: [
            "Built a full-stack internal CI/CD deployment portal (React 19 + Vite, ASP.NET Core) to trigger, monitor, and approve GitHub Actions workflows across environments.",
            "Implemented email/password signup, Google & GitHub OAuth 2.0, JWT sessions, and mandatory TOTP multi-factor authentication.",
            "Integrated AWS, Azure, and GCP cloud service management, container registries, and Docker-based deployments directly into the portal.",
            "Designed role-based (Admin/Viewer) access with an audit log and granular per-page permissions; deployed via Cloudflare Workers, Render, and PostgreSQL."
        ]
    },
    {
        name: "EduVault — Cloud-Based Document Management System",
        year: "2026",
        stack: "Flask, AWS EC2, Docker, Git, Linux",
        points: [
            "Built and deployed a role-based document management platform on AWS EC2 (Linux) with Docker containerization for consistent runtime environments.",
            "Configured a Jenkins CI/CD pipeline for automated testing and deployment, with Linux hardening for reliability and security."
        ]
    }
];

const EDUCATION = [
    { school: "NRI Institute of Technology", detail: "B.Tech in Artificial Intelligence & Machine Learning", meta: "GPA: 8.0 / 10", year: "2026" },
    { school: "Sri Chaitanya Junior College", detail: "Intermediate Education (MPC)", meta: "GPA: 6.0 / 10", year: "2022" },
    { school: "Sri Chaitanya Techno School", detail: "SSC Board of Education", meta: "GPA: 9.8 / 10", year: "2020" }
];

const CERTIFICATIONS = [
    { title: "DevOps with AWS (Internship)", org: "IntelliQ IT Trainings, Hyderabad", detail: "Git, Jenkins, Docker, Kubernetes, Ansible, Terraform, AWS, Prometheus, Maven, Python" },
    { title: "Generative AI Internship", org: "NRI Institute of Technology", detail: "Prompt engineering, integrating AI APIs with Flask" },
    { title: "AWS Cloud Foundations", org: "Udemy", detail: "EC2, IAM, VPC configuration" }
];

const SOFT_SKILLS = ["Collaboration with teams", "Troubleshooting & root-cause analysis", "Documentation", "Adaptability", "Continuous learning"];

function GitHubIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

function LinkedInIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M14.82 0H1.18C.53 0 0 .52 0 1.16v13.68C0 15.48.53 16 1.18 16h13.64c.65 0 1.18-.52 1.18-1.16V1.16C16 .52 15.47 0 14.82 0ZM4.75 13.63H2.37V6h2.38v7.63ZM3.56 4.96c-.76 0-1.38-.62-1.38-1.38 0-.76.62-1.38 1.38-1.38.76 0 1.38.62 1.38 1.38 0 .76-.61 1.38-1.38 1.38Zm10.07 8.67h-2.37V9.92c0-.87-.02-1.99-1.21-1.99-1.22 0-1.4.95-1.4 1.93v3.77H6.28V6h2.28v1.04h.03c.32-.6 1.09-1.22 2.24-1.22 2.4 0 2.84 1.58 2.84 3.63v4.18Z" />
        </svg>
    );
}

export default function Portfolio() {

    return (

        <div className="pf-root">
            <style>{CSS}</style>

            {/* ---------------- hero ---------------- */}
            <section className="pf-hero">

                <span className="pf-eyebrow">Portfolio</span>

                <h1>{PROFILE.name}</h1>
                <p className="pf-title">{PROFILE.title}</p>
                <p className="pf-tagline">{PROFILE.tagline}</p>

                <div className="pf-contact-row">
                    <a className="pf-contact-chip" href={`mailto:${PROFILE.email}`}>
                        <Mail size={13} /> {PROFILE.email}
                    </a>
                    <a className="pf-contact-chip" href={`tel:${PROFILE.phone}`}>
                        <Phone size={13} /> {PROFILE.phone}
                    </a>
                    <span className="pf-contact-chip pf-contact-chip-static">
                        <MapPin size={13} /> {PROFILE.location}
                    </span>
                </div>

                <div className="pf-link-row">
                    <a className="pf-link-btn" href={PROFILE.github} target="_blank" rel="noreferrer">
                        <GitHubIcon /> GitHub <ExternalLink size={12} />
                    </a>
                    <a className="pf-link-btn" href={PROFILE.linkedin} target="_blank" rel="noreferrer">
                        <LinkedInIcon /> LinkedIn <ExternalLink size={12} />
                    </a>
                </div>

            </section>

            {/* ---------------- skills ---------------- */}
            <section className="pf-section">

                <h2 className="pf-section-title">Technical Skills</h2>

                <div className="pf-skills-grid">
                    {SKILLS.map((group) => (

                        <div key={group.label} className="pf-skill-card">

                            <div className="pf-skill-head">
                                <group.icon size={15} />
                                <span>{group.label}</span>
                            </div>

                            <div className="pf-skill-tags">
                                {group.items.map((item) => (
                                    <span key={item} className="pf-tag">{item}</span>
                                ))}
                            </div>

                        </div>

                    ))}
                </div>

            </section>

            {/* ---------------- projects ---------------- */}
            <section className="pf-section">

                <h2 className="pf-section-title">Projects</h2>

                <div className="pf-projects-grid">
                    {PROJECTS.map((project) => (

                        <article key={project.name} className="pf-project-card">

                            <div className="pf-project-head">
                                <h3>{project.name}</h3>
                                <span className="pf-project-year">{project.year}</span>
                            </div>

                            <p className="pf-project-stack">{project.stack}</p>

                            <ul className="pf-project-points">
                                {project.points.map((point) => (
                                    <li key={point}>{point}</li>
                                ))}
                            </ul>

                        </article>

                    ))}
                </div>

            </section>

            {/* ---------------- education ---------------- */}
            <section className="pf-section">

                <h2 className="pf-section-title"><GraduationCap size={17} /> Education</h2>

                <div className="pf-timeline">
                    {EDUCATION.map((entry) => (

                        <div key={entry.school} className="pf-timeline-item">

                            <div className="pf-timeline-dot" />

                            <div className="pf-timeline-body">
                                <div className="pf-timeline-row">
                                    <strong>{entry.school}</strong>
                                    <span className="pf-timeline-year">{entry.year}</span>
                                </div>
                                <p>{entry.detail}</p>
                                <span className="pf-timeline-meta">{entry.meta}</span>
                            </div>

                        </div>

                    ))}
                </div>

            </section>

            {/* ---------------- internships & certifications ---------------- */}
            <section className="pf-section">

                <h2 className="pf-section-title"><Briefcase size={17} /> Internships &amp; Certifications</h2>

                <div className="pf-cert-list">
                    {CERTIFICATIONS.map((cert) => (

                        <div key={cert.title} className="pf-cert-item">
                            <Award size={15} className="pf-cert-icon" />
                            <div>
                                <strong>{cert.title}</strong> — {cert.org}
                                <p>{cert.detail}</p>
                            </div>
                        </div>

                    ))}
                </div>

            </section>

            {/* ---------------- soft skills ---------------- */}
            <section className="pf-section pf-section-last">

                <h2 className="pf-section-title">Soft Skills</h2>

                <div className="pf-skill-tags">
                    {SOFT_SKILLS.map((skill) => (
                        <span key={skill} className="pf-tag pf-tag-accent">{skill}</span>
                    ))}
                </div>

            </section>

        </div>

    );

}

const CSS = `
.pf-root{--pf-gap:22px; font-family:inherit; color:var(--text);}
.pf-root *{box-sizing:border-box;}

.pf-hero{
  padding:38px 34px; margin-bottom:var(--pf-gap);
  background:var(--card-bg); border:1px solid var(--stroke); border-radius:18px;
  box-shadow:var(--card-shadow); backdrop-filter:blur(22px) saturate(160%);
}
.pf-eyebrow{
  display:inline-block; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:var(--heading-accent); background:color-mix(in srgb, var(--heading-accent) 14%, transparent);
  border:1px solid color-mix(in srgb, var(--heading-accent) 30%, transparent);
  padding:4px 10px; border-radius:999px; margin-bottom:14px;
}
.pf-hero h1{margin:0; font-size:32px; font-weight:700; letter-spacing:-.02em; color:var(--text);}
.pf-title{margin:6px 0 0; font-size:15px; font-weight:600; color:var(--heading-accent);}
.pf-tagline{margin:12px 0 0; font-size:13.5px; line-height:1.6; color:var(--text-muted); max-width:62ch;}

.pf-contact-row{display:flex; flex-wrap:wrap; gap:8px; margin-top:20px;}
.pf-contact-chip{
  display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:9px;
  border:1px solid var(--stroke); background:var(--card-bg-strong); color:var(--text); font-size:12.5px;
  text-decoration:none; transition:border-color .15s ease, color .15s ease;
}
a.pf-contact-chip:hover{border-color:var(--heading-accent); color:var(--heading-accent);}
.pf-contact-chip svg{color:var(--text-muted); flex:0 0 auto;}
.pf-contact-chip-static{cursor:default;}

.pf-link-row{display:flex; flex-wrap:wrap; gap:10px; margin-top:16px;}
.pf-link-btn{
  display:inline-flex; align-items:center; gap:8px; padding:9px 14px; border-radius:9px;
  border:1px solid var(--stroke); background:var(--card-bg-strong); color:var(--text); font-size:13px; font-weight:600;
  text-decoration:none; transition:border-color .15s ease, background .15s ease, transform .15s ease;
}
.pf-link-btn:hover{border-color:var(--heading-accent); background:var(--table-row-hover); transform:translateY(-1px);}
.pf-link-btn svg:last-child{color:var(--text-muted);}

.pf-section{
  padding:26px 30px; margin-bottom:var(--pf-gap);
  background:var(--card-bg); border:1px solid var(--stroke); border-radius:18px;
  box-shadow:var(--card-shadow); backdrop-filter:blur(22px) saturate(160%);
}
.pf-section-last{margin-bottom:0;}
.pf-section-title{
  display:flex; align-items:center; gap:8px; margin:0 0 18px; font-size:15px; font-weight:700;
  letter-spacing:-.01em; color:var(--text);
}
.pf-section-title svg{color:var(--heading-accent);}

.pf-skills-grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:14px;}
.pf-skill-card{
  padding:16px; border:1px solid var(--stroke); border-radius:12px; background:var(--card-bg-strong);
}
.pf-skill-head{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; color:var(--heading-accent); margin-bottom:10px;}
.pf-skill-tags{display:flex; flex-wrap:wrap; gap:6px;}
.pf-tag{
  font-size:11.5px; padding:5px 9px; border-radius:7px; color:var(--text-muted);
  background:var(--table-row-hover); border:1px solid var(--border);
}
.pf-tag-accent{color:var(--heading-accent); border-color:color-mix(in srgb, var(--heading-accent) 30%, transparent);}

.pf-projects-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;}
.pf-project-card{padding:18px; border:1px solid var(--stroke); border-radius:12px; background:var(--card-bg-strong);}
.pf-project-head{display:flex; align-items:baseline; justify-content:space-between; gap:10px;}
.pf-project-head h3{margin:0; font-size:14.5px; font-weight:700; color:var(--text);}
.pf-project-year{font-size:11.5px; color:var(--text-muted); flex:0 0 auto;}
.pf-project-stack{margin:6px 0 12px; font-size:11.5px; color:var(--heading-accent); font-weight:600;}
.pf-project-points{margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px;}
.pf-project-points li{font-size:12.5px; line-height:1.55; color:var(--text-muted);}

.pf-timeline{display:flex; flex-direction:column; gap:0;}
.pf-timeline-item{display:flex; gap:14px; padding:12px 0; border-top:1px solid var(--border);}
.pf-timeline-item:first-child{border-top:0; padding-top:0;}
.pf-timeline-dot{width:8px; height:8px; border-radius:50%; background:var(--heading-accent); margin-top:6px; flex:0 0 auto;}
.pf-timeline-body{flex:1; min-width:0;}
.pf-timeline-row{display:flex; align-items:baseline; justify-content:space-between; gap:10px;}
.pf-timeline-row strong{font-size:13.5px; color:var(--text);}
.pf-timeline-year{font-size:11.5px; color:var(--text-muted); flex:0 0 auto;}
.pf-timeline-body p{margin:4px 0 0; font-size:12.5px; color:var(--text-muted);}
.pf-timeline-meta{display:inline-block; margin-top:4px; font-size:11px; color:var(--heading-accent);}

.pf-cert-list{display:flex; flex-direction:column; gap:14px;}
.pf-cert-item{display:flex; gap:12px; align-items:flex-start;}
.pf-cert-icon{color:var(--heading-accent); flex:0 0 auto; margin-top:2px;}
.pf-cert-item strong{font-size:13px; color:var(--text);}
.pf-cert-item p{margin:4px 0 0; font-size:12px; color:var(--text-muted); line-height:1.5;}

@media (max-width:640px){
  .pf-hero{padding:28px 22px;}
  .pf-section{padding:20px 18px;}
  .pf-hero h1{font-size:26px;}
}
`;
