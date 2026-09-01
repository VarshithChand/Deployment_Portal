import { useEffect, useState } from "react";
import {
    Mail, Phone, MapPin, ExternalLink, GraduationCap, Briefcase,
    Award, Sparkles, Code, Cloud, GitBranch, Box,
    FileCode, Activity, Database, Workflow, Download, ChevronDown,
    Printer, Info, ShieldCheck, Network
} from "lucide-react";

import FlowDiagram from "../components/portfolio/FlowDiagram";
import GitHubPanel from "../components/portfolio/GitHubPanel";
import {
    PROFILE, HERO_STACK, ABOUT_STACK, ABOUT_PARAGRAPHS, SKILL_CATEGORIES,
    CAPABILITIES, ENGINEERING_FOCUS, CURRENTLY_BUILDING, DEPLOYMENT_PORTAL,
    EDUVAULT, DEVOPS_LIFECYCLE_FLOW, CICD_FLOW, IAC_FLOW, AUTOMATION_FLOW,
    AUTOMATION_AREAS, CLOUD_PROVIDERS, SECURITY_ITEMS,
    DEPLOYMENT_PORTAL_SECURITY_HIGHLIGHTS, MONITORING_ITEMS, EXPERIENCE,
    TRAINING, EDUCATION, SOFT_SKILLS, ATS_KEYWORDS
} from "../data/portfolioData";

// The login page's third no-login tool (see LoginSignupPage's toolsMenu) -
// a static, 100% client-side page built entirely from Varshith Chand
// Vuyyuru's own resume (see data/portfolioData.js - that file is the
// single source of truth; nothing here invents a company, certification,
// metric, or technology). The one live network call this page makes is
// GitHubPanel's own read-only fetch straight to GitHub's public API - no
// backend of this app is involved either way. Scoped under .pf-root and
// built from this app's own theme tokens (var(--card-bg)/--heading-
// accent/etc), so it matches the rest of the app and follows the light/
// dark toggle rather than being a disconnected fixed-palette page.
const ICONS = {
    Cloud, GitBranch, Box, FileCode, Activity, Code, Database, Workflow, ShieldCheck
};

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

const DP_TABS = ["Overview", "Architecture", "Features", "Security", "CI/CD", "Challenges"];

function DeploymentPortalProject() {

    const [tab, setTab] = useState("Overview");
    const p = DEPLOYMENT_PORTAL;

    return (

        <article className="pf-featured-project">

            <div className="pf-featured-head">

                <div>
                    <span className="pf-eyebrow">Featured Project</span>
                    <h3>{p.name}</h3>
                    <p className="pf-featured-tagline">{p.tagline}</p>
                </div>

                <div className="pf-project-links">
                    {p.github && (
                        <a className="pf-link-btn" href={p.github} target="_blank" rel="noreferrer">
                            <GitHubIcon /> GitHub <ExternalLink size={12} />
                        </a>
                    )}
                    <a className="pf-link-btn" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                        <ChevronDown size={14} style={{ transform: "rotate(180deg)" }} /> Back to Top
                    </a>
                </div>

            </div>

            <div className="pf-skill-tags" style={{ marginBottom: 18 }}>
                {p.stack.map((tech) => <span key={tech} className="pf-tag pf-tag-accent">{tech}</span>)}
            </div>

            <div className="pf-tabs-row" role="tablist">
                {DP_TABS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        className={`pf-tab-btn${tab === t ? " on" : ""}`}
                        onClick={() => setTab(t)}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="pf-tab-panel">

                {tab === "Overview" && (
                    <>
                        <p>{p.overview}</p>
                        <p className="pf-live-note">
                            <ShieldCheck size={13} /> This portfolio is itself served from the Deployment
                            Portal's own login page — the app you're looking at right now is the live one.
                        </p>
                    </>
                )}

                {tab === "Architecture" && (

                    <>
                        <p style={{ marginBottom: 16 }}>{p.architecture.summary}</p>

                        <div className="pf-arch">

                            <div className="pf-arch-node pf-arch-node-wide">
                                <strong>{p.architecture.nodes[0].label}</strong>
                                <span>{p.architecture.nodes[0].detail}</span>
                            </div>

                            <ChevronDown className="pf-arch-arrow" size={16} aria-hidden="true" />

                            <div className="pf-arch-node pf-arch-node-wide">
                                <strong>{p.architecture.nodes[1].label}</strong>
                                <span>{p.architecture.nodes[1].detail}</span>
                            </div>

                            <ChevronDown className="pf-arch-arrow" size={16} aria-hidden="true" />

                            <div className="pf-arch-branch">
                                {p.architecture.nodes.slice(2, 5).map((n) => (
                                    <div className="pf-arch-node" key={n.id}>
                                        <strong>{n.label}</strong>
                                        <span>{n.detail}</span>
                                    </div>
                                ))}
                            </div>

                            <ChevronDown className="pf-arch-arrow" size={16} aria-hidden="true" />

                            <div className="pf-arch-node pf-arch-node-wide pf-arch-node-accent">
                                <strong>{p.architecture.nodes[5].label}</strong>
                                <span>{p.architecture.nodes[5].detail}</span>
                            </div>

                        </div>
                    </>

                )}

                {tab === "Features" && (
                    <ul className="pf-project-points">
                        {p.features.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                )}

                {tab === "Security" && (

                    <>
                        <ul className="pf-project-points" style={{ marginBottom: 14 }}>
                            {p.security.map((s) => <li key={s}>{s}</li>)}
                        </ul>
                        <div className="pf-skill-tags">
                            {DEPLOYMENT_PORTAL_SECURITY_HIGHLIGHTS.map((s) => (
                                <span key={s} className="pf-tag pf-tag-accent">{s}</span>
                            ))}
                        </div>
                    </>

                )}

                {tab === "CI/CD" && (
                    <ul className="pf-project-points">
                        {p.cicd.map((c) => <li key={c}>{c}</li>)}
                        <li>{p.deployment}</li>
                    </ul>
                )}

                {tab === "Challenges" && (
                    <ul className="pf-project-points">
                        {p.challenges.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                )}

            </div>

        </article>

    );

}

function EduVaultProject() {

    const p = EDUVAULT;

    return (

        <article className="pf-project-card">

            <div className="pf-project-head">
                <h3>{p.name}</h3>
                <span className="pf-project-year">{p.year}</span>
            </div>

            <p className="pf-project-stack">{p.tagline}</p>

            <div className="pf-skill-tags" style={{ margin: "10px 0 14px" }}>
                {p.stack.map((tech) => <span key={tech} className="pf-tag">{tech}</span>)}
            </div>

            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>{p.overview}</p>

            <ul className="pf-project-points" style={{ marginBottom: 16 }}>
                {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>

            <p className="pf-mini-arch-label">{p.infrastructure.summary}</p>

            <div className="pf-mini-flow">
                {p.infrastructure.nodes.map((n, i) => (
                    <span key={n.id} className="pf-mini-flow-item">
                        <span className="pf-mini-flow-node">{n.label}</span>
                        {i < p.infrastructure.nodes.length - 1 && <span className="pf-mini-flow-arrow">→</span>}
                    </span>
                ))}
            </div>

        </article>

    );

}

function Section({ id, title, icon: Icon, note, children, className = "" }) {
    return (
        <section id={id} className={`pf-section ${className}`}>
            <h2 className="pf-section-title">
                {Icon && <Icon size={17} />}
                {title}
            </h2>
            {note && <p className="pf-section-note"><Info size={12} /> {note}</p>}
            {children}
        </section>
    );
}

export default function Portfolio() {

    // SEO for a page that has no real URL/route of its own (this app has
    // no router - see NavigationContext) - the best available approximation
    // is updating document.title/meta while this component is mounted, and
    // restoring whatever the login page had before on unmount, so leaving
    // this tool doesn't leave a stale title behind.
    useEffect(() => {

        const prevTitle = document.title;
        document.title = `${PROFILE.name} | DevOps Engineer`;

        let meta = document.querySelector('meta[name="description"]');
        const prevDescription = meta?.getAttribute("content") ?? null;
        const createdMeta = !meta;

        if (!meta) {
            meta = document.createElement("meta");
            meta.setAttribute("name", "description");
            document.head.appendChild(meta);
        }

        meta.setAttribute(
            "content",
            "DevOps and Cloud Engineer portfolio showcasing AWS, Azure, GCP, Kubernetes, Docker, Terraform, CI/CD, automation, and cloud projects."
        );

        return () => {
            document.title = prevTitle;
            if (createdMeta) meta.remove();
            else if (prevDescription !== null) meta.setAttribute("content", prevDescription);
        };

    }, []);

    function handleDownloadResume() {
        // No PDF-generation toolchain/dependency in this app - this opens
        // the browser's own print dialog against the print-only resume
        // block below (.pf-print-resume, hidden everywhere except
        // @media print), which every modern browser can save as a real
        // PDF. Content is the exact same portfolioData as the rest of
        // this page, not a separate hand-maintained copy.
        window.print();
    }

    return (

        <div className="pf-root" id="top">
            <style>{CSS}</style>

            {/* ---------------- hero ---------------- */}
            <section className="pf-hero">

                <span className="pf-eyebrow">Portfolio</span>

                <h1>{PROFILE.name}</h1>
                <p className="pf-title">{PROFILE.tagline}</p>
                <p className="pf-tagline">{PROFILE.positioning} {PROFILE.summary}</p>

                <div className="pf-hero-stack" aria-hidden="true">
                    {HERO_STACK.map((t) => <span key={t} className="pf-hero-stack-item">{t}</span>)}
                </div>

                <div className="pf-link-row">
                    <a className="pf-link-btn pf-link-btn-primary" href="#projects" onClick={(e) => { e.preventDefault(); document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" }); }}>
                        View Projects
                    </a>
                    <a className="pf-link-btn" href={PROFILE.github} target="_blank" rel="noreferrer">
                        <GitHubIcon /> GitHub
                    </a>
                    <a className="pf-link-btn" href={PROFILE.linkedin} target="_blank" rel="noreferrer">
                        <LinkedInIcon /> LinkedIn
                    </a>
                    <button type="button" className="pf-link-btn" onClick={handleDownloadResume}>
                        <Download size={14} /> Download Resume
                    </button>
                    <a className="pf-link-btn" href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}>
                        <Mail size={14} /> Contact Me
                    </a>
                </div>

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

            </section>

            {/* ---------------- about ---------------- */}
            <Section title="About">
                {ABOUT_PARAGRAPHS.map((para) => <p key={para} className="pf-about-para">{para}</p>)}
                <div className="pf-skill-tags" style={{ marginTop: 12 }}>
                    {ABOUT_STACK.map((t) => <span key={t} className="pf-tag">{t}</span>)}
                </div>
            </Section>

            {/* ---------------- engineering focus ---------------- */}
            <Section title="Engineering Focus" icon={ShieldCheck}>
                <div className="pf-skill-tags">
                    {ENGINEERING_FOCUS.map((t) => <span key={t} className="pf-tag pf-tag-accent">{t}</span>)}
                </div>
            </Section>

            {/* ---------------- skills ---------------- */}
            <Section title="Technical Skills" icon={Code}>
                <div className="pf-skills-grid">
                    {SKILL_CATEGORIES.map((group) => {
                        const GroupIcon = ICONS[group.icon] || Code;
                        return (
                            <div key={group.key} className="pf-skill-card">
                                <div className="pf-skill-head">
                                    <GroupIcon size={15} />
                                    <span>{group.label}</span>
                                </div>
                                <div className="pf-skill-tags">
                                    {group.items.map((item) => <span key={item} className="pf-tag">{item}</span>)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Section>

            {/* ---------------- what i build ---------------- */}
            <Section title="What I Build" icon={Workflow}>
                <div className="pf-capabilities-grid">
                    {CAPABILITIES.map((cap) => {
                        const CapIcon = ICONS[cap.icon] || Code;
                        return (
                            <div key={cap.key} className="pf-capability-card">
                                <div className="pf-skill-head"><CapIcon size={16} /><span>{cap.title}</span></div>
                                <p>{cap.description}</p>
                                <div className="pf-mini-flow">
                                    {cap.flow.map((step, i) => (
                                        <span key={step} className="pf-mini-flow-item">
                                            <span className="pf-mini-flow-node">{step}</span>
                                            {i < cap.flow.length - 1 && <span className="pf-mini-flow-arrow">→</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Section>

            {/* ---------------- projects ---------------- */}
            <section id="projects" className="pf-section">
                <h2 className="pf-section-title"><Briefcase size={17} /> Featured Projects</h2>
                <DeploymentPortalProject />
                <div style={{ height: 18 }} />
                <EduVaultProject />
            </section>

            {/* ---------------- devops architecture ---------------- */}
            <Section title="DevOps Architecture" icon={Network}>
                <FlowDiagram steps={DEVOPS_LIFECYCLE_FLOW} />
            </Section>

            {/* ---------------- cloud ---------------- */}
            <Section title="Cloud" icon={Cloud}>
                <div className="pf-cloud-grid">
                    {CLOUD_PROVIDERS.map((provider) => (
                        <div key={provider.key} className="pf-skill-card">
                            <div className="pf-skill-head"><Cloud size={15} /><span>{provider.label}</span></div>
                            {provider.services.length > 0 ? (
                                <div className="pf-skill-tags">
                                    {provider.services.map((s) => <span key={s} className="pf-tag">{s}</span>)}
                                </div>
                            ) : (
                                <p className="pf-muted-note">Working knowledge — no specific managed services to list yet.</p>
                            )}
                        </div>
                    ))}
                </div>
            </Section>

            {/* ---------------- ci/cd ---------------- */}
            <Section title="CI/CD" icon={GitBranch}>
                <FlowDiagram steps={CICD_FLOW} />
                <div className="pf-skill-tags" style={{ marginTop: 16 }}>
                    {["GitHub Actions", "Jenkins", "Azure DevOps", "Maven", "Docker"].map((t) => (
                        <span key={t} className="pf-tag pf-tag-accent">{t}</span>
                    ))}
                </div>
            </Section>

            {/* ---------------- infrastructure as code ---------------- */}
            <Section title="Infrastructure as Code" icon={FileCode}>
                <p className="pf-about-para">
                    Terraform and Ansible for provisioning and configuring infrastructure as code
                    instead of hand-configuring it, with YAML as the format tying pipelines and
                    configuration together.
                </p>
                <FlowDiagram steps={IAC_FLOW} dense />
            </Section>

            {/* ---------------- security ---------------- */}
            <Section title="Security & Authentication" icon={ShieldCheck}>
                <p className="pf-about-para">
                    Security is part of the architecture in my projects, not a bolt-on — the
                    Deployment Portal's own auth layer is JWT sessions behind Google/GitHub OAuth,
                    mandatory TOTP MFA, and server-enforced role-based access.
                </p>
                <div className="pf-skill-tags" style={{ marginBottom: 16 }}>
                    {SECURITY_ITEMS.map((t) => <span key={t} className="pf-tag">{t}</span>)}
                </div>
                <div className="pf-skill-card">
                    <div className="pf-skill-head"><ShieldCheck size={15} /><span>In Deployment Portal specifically</span></div>
                    <div className="pf-skill-tags">
                        {DEPLOYMENT_PORTAL_SECURITY_HIGHLIGHTS.map((t) => <span key={t} className="pf-tag pf-tag-accent">{t}</span>)}
                    </div>
                </div>
            </Section>

            {/* ---------------- monitoring ---------------- */}
            <Section
                title="Monitoring & Observability"
                icon={Activity}
                note="Illustrative — this is a portfolio visualization of the monitoring stack I use, not a live production dashboard."
            >
                <div className="pf-skill-tags">
                    {MONITORING_ITEMS.map((t) => <span key={t} className="pf-tag">{t}</span>)}
                </div>
            </Section>

            {/* ---------------- automation ---------------- */}
            <Section title="Automation" icon={Workflow}>
                <FlowDiagram steps={AUTOMATION_FLOW} />
                <div className="pf-skill-tags" style={{ marginTop: 16 }}>
                    {AUTOMATION_AREAS.map((t) => <span key={t} className="pf-tag pf-tag-accent">{t}</span>)}
                </div>
            </Section>

            {/* ---------------- experience ---------------- */}
            <Section title="Experience" icon={Briefcase}>
                <div className="pf-cert-list">
                    {EXPERIENCE.map((item) => (
                        <div key={item.title} className="pf-cert-item">
                            <Briefcase size={15} className="pf-cert-icon" />
                            <div>
                                <span className="pf-kind-badge">Internship</span>
                                <strong> {item.title}</strong> — {item.org}
                                <div className="pf-skill-tags" style={{ marginTop: 6 }}>
                                    {item.skills.map((s) => <span key={s} className="pf-tag">{s}</span>)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ---------------- education ---------------- */}
            <Section title="Education" icon={GraduationCap}>
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
            </Section>

            {/* ---------------- certifications & training ---------------- */}
            <Section
                title="Certifications & Training"
                icon={Award}
                note="No formal (exam-issued) certifications yet — shown below as training, distinct from that."
            >
                <div className="pf-cert-list">
                    {TRAINING.map((item) => (
                        <div key={item.title} className="pf-cert-item">
                            <Award size={15} className="pf-cert-icon" />
                            <div>
                                <span className="pf-kind-badge pf-kind-badge-training">Training</span>
                                <strong> {item.title}</strong> — {item.org}
                                <div className="pf-skill-tags" style={{ marginTop: 6 }}>
                                    {item.skills.map((s) => <span key={s} className="pf-tag">{s}</span>)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ---------------- github ---------------- */}
            <Section title="GitHub" icon={Code}>
                <p className="pf-about-para">
                    <a href={PROFILE.github} target="_blank" rel="noreferrer" className="pf-inline-link">
                        <GitHubIcon /> {PROFILE.githubUsername}
                    </a> — repositories below are pulled live from GitHub, not hand-listed.
                </p>
                <GitHubPanel username={PROFILE.githubUsername} profileUrl={PROFILE.github} />
            </Section>

            {/* ---------------- currently building ---------------- */}
            <Section title="Currently Building" icon={Sparkles}>
                <ul className="pf-project-points">
                    {CURRENTLY_BUILDING.map((item) => <li key={item}>{item}</li>)}
                </ul>
            </Section>

            {/* ---------------- soft skills ---------------- */}
            <Section title="Soft Skills">
                <div className="pf-skill-tags">
                    {SOFT_SKILLS.map((skill) => <span key={skill} className="pf-tag pf-tag-accent">{skill}</span>)}
                </div>
            </Section>

            {/* ---------------- contact ---------------- */}
            <Section id="contact" title="Contact" icon={Mail}>
                <p className="pf-about-para">
                    Reachable directly — no contact form here, since one that doesn't actually
                    send anywhere isn't worth pretending to work.
                </p>
                <div className="pf-link-row">
                    <a className="pf-link-btn pf-link-btn-primary" href={`mailto:${PROFILE.email}`}>
                        <Mail size={14} /> {PROFILE.email}
                    </a>
                    <a className="pf-link-btn" href={PROFILE.linkedin} target="_blank" rel="noreferrer">
                        <LinkedInIcon /> LinkedIn
                    </a>
                    <a className="pf-link-btn" href={PROFILE.github} target="_blank" rel="noreferrer">
                        <GitHubIcon /> GitHub
                    </a>
                    <button type="button" className="pf-link-btn" onClick={handleDownloadResume}>
                        <Printer size={14} /> Download Resume
                    </button>
                </div>
            </Section>

            {/* ---------------- footer / ats keywords ---------------- */}
            <footer className="pf-footer">
                <div className="pf-skill-tags">
                    {ATS_KEYWORDS.map((k) => <span key={k} className="pf-tag">{k}</span>)}
                </div>
            </footer>

            {/* ---------------- print-only resume ---------------- */}
            <div className="pf-print-resume" aria-hidden="true">

                <h1>{PROFILE.name}</h1>
                <p>
                    {PROFILE.phone} | {PROFILE.email} | {PROFILE.location}<br />
                    {PROFILE.linkedin.replace("https://", "")} | {PROFILE.github.replace("https://", "")}
                </p>
                <p>{PROFILE.summary}</p>

                <h2>Education</h2>
                <ul>
                    {EDUCATION.map((e) => (
                        <li key={e.school}>{e.school} — {e.detail} ({e.meta}), {e.year}</li>
                    ))}
                </ul>

                <h2>Technical Skills</h2>
                <ul>
                    {SKILL_CATEGORIES.map((g) => (
                        <li key={g.key}><strong>{g.label}:</strong> {g.items.join(", ")}</li>
                    ))}
                </ul>

                <h2>Projects</h2>
                <p><strong>{DEPLOYMENT_PORTAL.name}</strong> ({DEPLOYMENT_PORTAL.year}) — {DEPLOYMENT_PORTAL.stack.join(", ")}</p>
                <ul>
                    {DEPLOYMENT_PORTAL.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <p><strong>{EDUVAULT.name} — {EDUVAULT.tagline}</strong> ({EDUVAULT.year}) — {EDUVAULT.stack.join(", ")}</p>
                <ul>
                    {EDUVAULT.features.map((f) => <li key={f}>{f}</li>)}
                </ul>

                <h2>Experience</h2>
                <ul>
                    {EXPERIENCE.map((e) => (
                        <li key={e.title}><strong>{e.title} (Internship)</strong> — {e.org}: {e.skills.join(", ")}</li>
                    ))}
                </ul>

                <h2>Training</h2>
                <ul>
                    {TRAINING.map((e) => (
                        <li key={e.title}><strong>{e.title}</strong> — {e.org}: {e.skills.join(", ")}</li>
                    ))}
                </ul>

                <h2>Soft Skills</h2>
                <p>{SOFT_SKILLS.join(" · ")}</p>

            </div>

        </div>

    );

}

const CSS = `
.pf-root{--pf-gap:22px; font-family:inherit; color:var(--text); max-width:1400px; margin:0 auto;}
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
.pf-tagline{margin:12px 0 0; font-size:13.5px; line-height:1.6; color:var(--text-muted); max-width:70ch;}

.pf-hero-stack{display:flex; flex-wrap:wrap; gap:8px; margin-top:18px;}
.pf-hero-stack-item{
  font-size:11px; font-weight:600; padding:5px 10px; border-radius:7px; color:var(--text-muted);
  background:var(--card-bg-strong); border:1px solid var(--border); font-family:'JetBrains Mono',ui-monospace,monospace;
}

.pf-contact-row{display:flex; flex-wrap:wrap; gap:8px; margin-top:18px;}
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
  cursor:pointer; font-family:inherit;
}
.pf-link-btn:hover{border-color:var(--heading-accent); background:var(--table-row-hover); transform:translateY(-1px);}
.pf-link-btn-primary{background:var(--heading-accent); border-color:var(--heading-accent); color:#fff;}
.pf-link-btn-primary:hover{background:var(--heading-accent); filter:brightness(1.08); color:#fff;}

.pf-section{
  padding:26px 30px; margin-bottom:var(--pf-gap);
  background:var(--card-bg); border:1px solid var(--stroke); border-radius:18px;
  box-shadow:var(--card-shadow); backdrop-filter:blur(22px) saturate(160%);
  scroll-margin-top:20px;
}
.pf-section-title{
  display:flex; align-items:center; gap:8px; margin:0 0 14px; font-size:15px; font-weight:700;
  letter-spacing:-.01em; color:var(--text);
}
.pf-section-title svg{color:var(--heading-accent);}
.pf-section-note{
  display:flex; align-items:center; gap:6px; margin:-6px 0 16px; font-size:11.5px; color:var(--text-muted);
  font-style:italic;
}
.pf-about-para{margin:0 0 10px; font-size:13px; line-height:1.65; color:var(--text-muted); max-width:80ch;}
.pf-muted-note{font-size:12px; color:var(--text-muted); font-style:italic; margin:0;}

.pf-skills-grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:14px;}
.pf-skill-card{padding:16px; border:1px solid var(--stroke); border-radius:12px; background:var(--card-bg-strong);}
.pf-skill-head{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; color:var(--heading-accent); margin-bottom:10px;}
.pf-skill-tags{display:flex; flex-wrap:wrap; gap:6px;}
.pf-tag{
  font-size:11.5px; padding:5px 9px; border-radius:7px; color:var(--text-muted);
  background:var(--table-row-hover); border:1px solid var(--border);
}
.pf-tag-accent{color:var(--heading-accent); border-color:color-mix(in srgb, var(--heading-accent) 30%, transparent);}

.pf-capabilities-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px;}
.pf-capability-card{padding:16px; border:1px solid var(--stroke); border-radius:12px; background:var(--card-bg-strong);}
.pf-capability-card p{margin:0 0 12px; font-size:12px; line-height:1.5; color:var(--text-muted);}

.pf-mini-flow{display:flex; flex-wrap:wrap; align-items:center; gap:4px;}
.pf-mini-flow-item{display:inline-flex; align-items:center; gap:4px;}
.pf-mini-flow-node{
  font-size:11px; font-weight:600; padding:4px 8px; border-radius:6px; color:var(--text);
  background:var(--table-row-hover); border:1px solid var(--border); font-family:'JetBrains Mono',ui-monospace,monospace;
}
.pf-mini-flow-arrow{color:var(--text-muted); font-size:12px;}
.pf-mini-arch-label{font-size:11.5px; color:var(--text-muted); margin:0 0 8px; font-style:italic;}

.pf-flow{display:flex; flex-wrap:wrap; align-items:stretch; gap:0;}
.pf-flow-step-wrap{display:flex; align-items:center;}
.pf-flow-step{
  padding:10px 14px; border-radius:9px; background:var(--card-bg-strong); border:1px solid var(--stroke);
  font-size:12.5px; font-weight:600; color:var(--text); white-space:nowrap;
}
.pf-flow-dense .pf-flow-step{background:color-mix(in srgb, var(--heading-accent) 8%, var(--card-bg-strong));}
.pf-flow-arrow{color:var(--heading-accent); display:flex; align-items:center; margin:0 6px; flex:0 0 auto;}
@media (max-width:720px){
  .pf-flow{flex-direction:column; align-items:flex-start;}
  .pf-flow-step-wrap{flex-direction:column; align-items:flex-start; width:100%;}
  .pf-flow-arrow{transform:rotate(90deg); margin:4px 0 4px 14px;}
}

.pf-cloud-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;}

.pf-featured-project{padding:20px; border:1px solid var(--stroke); border-radius:14px; background:var(--card-bg-strong);}
.pf-featured-head{display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px;}
.pf-featured-head h3{margin:6px 0 4px; font-size:19px; font-weight:700; color:var(--text);}
.pf-featured-tagline{margin:0; font-size:12.5px; color:var(--text-muted); max-width:60ch;}
.pf-project-links{display:flex; gap:8px; flex-wrap:wrap;}

.pf-tabs-row{display:flex; flex-wrap:wrap; gap:6px; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:16px;}
.pf-tab-btn{
  padding:7px 12px; border-radius:8px; border:1px solid transparent; background:transparent;
  color:var(--text-muted); font-size:12px; font-weight:600; font-family:inherit; cursor:pointer;
}
.pf-tab-btn:hover{color:var(--text);}
.pf-tab-btn.on{background:var(--card-bg); border-color:var(--stroke); color:var(--heading-accent);}
.pf-tab-panel p{margin:0; font-size:13px; line-height:1.6; color:var(--text-muted);}
.pf-live-note{
  display:flex; align-items:center; gap:6px; margin-top:10px !important; font-size:11.5px !important;
  color:var(--viz-good) !important;
}
.pf-project-points{margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px;}
.pf-project-points li{font-size:12.5px; line-height:1.55; color:var(--text-muted);}

.pf-arch{display:flex; flex-direction:column; align-items:center; gap:6px;}
.pf-arch-node{
  display:flex; flex-direction:column; align-items:center; gap:2px; padding:12px 16px; min-width:150px;
  border:1px solid var(--stroke); border-radius:10px; background:var(--card-bg); text-align:center;
}
.pf-arch-node strong{font-size:12.5px; color:var(--text);}
.pf-arch-node span{font-size:10.5px; color:var(--text-muted);}
.pf-arch-node-wide{min-width:220px;}
.pf-arch-node-accent{border-color:var(--heading-accent); background:color-mix(in srgb, var(--heading-accent) 10%, var(--card-bg));}
.pf-arch-arrow{color:var(--heading-accent);}
.pf-arch-branch{display:flex; flex-wrap:wrap; justify-content:center; gap:10px;}

.pf-projects-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;}
.pf-project-card{padding:18px; border:1px solid var(--stroke); border-radius:12px; background:var(--card-bg-strong);}
.pf-project-head{display:flex; align-items:baseline; justify-content:space-between; gap:10px;}
.pf-project-head h3{margin:0; font-size:14.5px; font-weight:700; color:var(--text);}
.pf-project-year{font-size:11.5px; color:var(--text-muted); flex:0 0 auto;}
.pf-project-stack{margin:6px 0 4px; font-size:12px; color:var(--text-muted);}

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

.pf-cert-list{display:flex; flex-direction:column; gap:16px;}
.pf-cert-item{display:flex; gap:12px; align-items:flex-start;}
.pf-cert-icon{color:var(--heading-accent); flex:0 0 auto; margin-top:2px;}
.pf-cert-item strong{font-size:13px; color:var(--text);}
.pf-kind-badge{
  display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;
  padding:2px 7px; border-radius:5px; background:var(--table-row-hover); color:var(--text-muted); margin-right:2px;
}
.pf-kind-badge-training{color:var(--heading-accent); background:color-mix(in srgb, var(--heading-accent) 14%, transparent);}

.pf-github-panel{margin-top:4px;}
.pf-github-head{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;}
.pf-github-note{margin:0; font-size:11px; color:var(--text-muted); font-style:italic;}
.pf-spin{animation:pf-spin 0.9s linear infinite;}
@keyframes pf-spin{to{transform:rotate(360deg);}}
.pf-github-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px;}
.pf-github-card{
  display:block; padding:14px; border:1px solid var(--stroke); border-radius:10px; background:var(--card-bg-strong);
  text-decoration:none; color:var(--text); transition:border-color .15s ease, transform .15s ease;
}
.pf-github-card:hover{border-color:var(--heading-accent); transform:translateY(-1px);}
.pf-github-card-head{display:flex; align-items:center; justify-content:space-between; gap:8px;}
.pf-github-name{font-size:13px; font-weight:700; color:var(--heading-accent); font-family:'JetBrains Mono',ui-monospace,monospace;}
.pf-github-card-head svg{color:var(--text-muted); flex:0 0 auto;}
.pf-github-desc{margin:8px 0 10px; font-size:11.5px; color:var(--text-muted); line-height:1.5;}
.pf-github-meta{display:flex; flex-wrap:wrap; gap:10px; font-size:10.5px; color:var(--text-muted);}
.pf-github-meta span{display:inline-flex; align-items:center; gap:3px;}

.pf-inline-link{display:inline-flex; align-items:center; gap:6px; color:var(--heading-accent); font-weight:600; text-decoration:none;}
.pf-inline-link:hover{text-decoration:underline;}

.pf-footer{padding:20px 30px; text-align:center;}
.pf-footer .pf-skill-tags{justify-content:center;}

.pf-print-resume{display:none;}

@media (max-width:640px){
  .pf-hero{padding:28px 22px;}
  .pf-section{padding:20px 18px;}
  .pf-hero h1{font-size:26px;}
  .pf-featured-head{flex-direction:column;}
}

@media print{
  .pf-root > *:not(.pf-print-resume){display:none !important;}
  .pf-print-resume{
    display:block !important; color:#000; background:#fff; font-family:Georgia, 'Times New Roman', serif;
    max-width:700px; margin:0 auto; padding:20px;
  }
  .pf-print-resume h1{font-size:22px; margin:0 0 4px;}
  .pf-print-resume h2{font-size:14px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid #000; margin:16px 0 6px; padding-bottom:2px;}
  .pf-print-resume p, .pf-print-resume li{font-size:11.5px; line-height:1.5;}
  .pf-print-resume ul{margin:0 0 6px; padding-left:18px;}
}
`;
