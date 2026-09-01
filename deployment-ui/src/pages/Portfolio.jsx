import { useEffect, useState } from "react";
import {
  Mail, ArrowUpRight, MapPin, GraduationCap,
  Terminal, FileText, Copy, Check
} from "lucide-react";

// GitHub/LinkedIn brand marks aren't in this app's installed lucide-react
// version (dropped upstream) - same gap Dashboard.jsx/LoginSignupPage.jsx
// already hit, same fix: the plain octocat/LinkedIn "in" SVG paths inline,
// not a lucide import.
function GitHubIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function LinkedInIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M14.82 0H1.18C.53 0 0 .52 0 1.16v13.68C0 15.48.53 16 1.18 16h13.64c.65 0 1.18-.52 1.18-1.16V1.16C16 .52 15.47 0 14.82 0ZM4.75 13.63H2.37V6h2.38v7.63ZM3.56 4.96c-.76 0-1.38-.62-1.38-1.38 0-.76.62-1.38 1.38-1.38.76 0 1.38.62 1.38 1.38 0 .76-.61 1.38-1.38 1.38Zm10.07 8.67h-2.37V9.92c0-.87-.02-1.99-1.21-1.99-1.22 0-1.4.95-1.4 1.93v3.77H6.28V6h2.28v1.04h.03c.32-.6 1.09-1.22 2.24-1.22 2.4 0 2.84 1.58 2.84 3.63v4.18Z" />
    </svg>
  );
}

/* ============================================================
   Varshith Chand Vuyyuru's real profile - the PROJECTS/STACK below are
   the user's own supplied content, verbatim (not resume-derived - this
   is broader than the resume: real production work at VIPS/RxApps360
   plus a self-hosted DevOps platform). Only name/links/résumé were
   templated when this component was handed over; those are filled in
   with the same facts already established elsewhere on this login page
   (data/portfolioData.js's PROFILE, before this replaced it).
   ============================================================ */
const PROFILE = {
  name: "Varshith Chand Vuyyuru",
  role: "Test automation & platform engineering",
  headline: "I build the pipelines and tools that ship other people's code.",
  blurb:
    "I make software ship safely and repeatedly — end-to-end tests that catch real regressions, CI/CD that deploys across clusters without drama, and internal tools that put all of it in one place.",
  location: "Hyderabad, India",
  education: "B.Tech, AI & ML",
  focus: "Deployment Portal",
  availability: "Open to platform / DevOps / SDET roles",
  email: "v.varshith.2004@gmail.com",
  github: "https://github.com/VarshithChand",
  linkedin: "https://linkedin.com/in/varshith-chand-vuyyuru",
};

const PROJECTS = [
  {
    title: "Deployment Portal",
    kind: "Internal",
    role: "Designed & built end to end",
    desc: "One control panel to trigger, watch and approve deployments across GitHub Actions, AWS, Azure, GCP and a dozen registries — instead of hopping between every provider's console. ~380 endpoints behind a single API, with mandatory MFA, three sign-in methods and role-gated access.",
    stack: [".NET 10", "React 19", "Vite", "Postgres", "Render", "Cloudflare"],
    link: "https://deploymentportal.in",
    linkLabel: "deploymentportal.in",
  },
  {
    title: "Self-hosted DevOps platform",
    kind: "Self-hosted",
    role: "Architecture & setup",
    desc: "A full DevOps stack on a single Ubuntu + Docker box: Forgejo for git, Woodpecker for CI, Harbor for images, plus Traefik, Postgres, Redis, MinIO and a Prometheus/Grafana/Loki monitoring stack — with docs so anyone can connect and onboard.",
    stack: ["Docker", "Forgejo", "Woodpecker", "Harbor", "Traefik", "Grafana"],
  },
  {
    title: "RxApps360 release automation",
    kind: "Production",
    role: "CI/CD ownership",
    desc: "GitHub Actions pipelines for three .NET APIs on a healthcare platform. One run builds, tests, publishes, rotates the stored artifacts, and takes the release through Stage → RC → three clusters — every step gated by environment approvals.",
    stack: ["GitHub Actions", ".NET 8", "Multi-cluster", "Approval gates"],
  },
  {
    title: "RxApps360 E2E testing",
    kind: "Production",
    role: "Test automation lead",
    desc: "Playwright + TypeScript end-to-end suites for the RxAsset and RxPlan modules. Factory-function page objects, MFA-based login, and data-driven checks that capture form values and verify them against details across 14 tabs — with API responses intercepted to confirm the data's real, and every failure rolled into one report.",
    stack: ["Playwright", "TypeScript", "POM", "API interception"],
  },
  {
    title: "VIPS Cloud PMS pipelines",
    kind: "Production",
    role: "Pipeline engineering",
    desc: "Azure DevOps CI/CD for ~18 APIs behind the Piccotello property-management system. Sprint/patch artifact naming, a searchable build picker at deploy time, per-API selective builds, multi-cluster targets, and post-deploy smoke tests that hit each service's health endpoint.",
    stack: ["Azure DevOps", "YAML", "Smoke tests", "Multi-cluster"],
  },
  {
    title: "AWS Schedule Orchestrator",
    kind: "Production",
    role: "Built solo",
    desc: "Pure bash + jq + AWS CLI, driven by GitHub Actions and Issues — no Lambda. Starts and stops ECS services and RDS instances twice a day across dev and acpt to cut idle cost. State lives in git, and operators file issues to schedule one-offs or place holds.",
    stack: ["Bash", "AWS CLI", "GitHub Actions", "ECS", "RDS"],
  },
];

const STACK = [
  { group: "Languages", items: ["C# / .NET", "TypeScript", "Bash", "SQL", "Python"] },
  { group: "CI/CD", items: ["GitHub Actions", "Azure DevOps", "Woodpecker CI"] },
  { group: "Cloud & hosting", items: ["AWS", "Azure", "GCP", "Render", "Cloudflare"] },
  { group: "Containers & registries", items: ["Docker", "Kubernetes", "Harbor", "ECR", "GHCR"] },
  { group: "Testing & quality", items: ["Playwright", "SonarQube", "CodeQL", "ESLint"] },
  { group: "Data & observability", items: ["PostgreSQL", "Redis", "MinIO", "Prometheus", "Grafana", "Loki"] },
];

const KIND_COLOR = { Production: "#3ee08f", Internal: "#37d5cf", "Self-hosted": "#f5b44e" };

function PipelineGraph() {
  return (
    <svg className="pipe" viewBox="0 0 440 300" role="img"
      aria-label="A CI/CD pipeline: commit, build, test, then deploy to three clusters">
      <defs>
        <linearGradient id="flow" x1="0" x2="1">
          <stop offset="0" stopColor="#37d5cf" stopOpacity="0" />
          <stop offset="1" stopColor="#37d5cf" />
        </linearGradient>
      </defs>

      {/* connectors */}
      <path className="wire" d="M70 150 H150" />
      <path className="wire live" d="M180 150 H260" />
      <path className="wire" d="M290 150 C320 150 320 70 355 70" />
      <path className="wire" d="M290 150 H355" />
      <path className="wire" d="M290 150 C320 150 320 230 355 230" />

      {/* nodes */}
      <g className="node">
        <rect x="18" y="132" width="52" height="36" rx="9" />
        <text x="44" y="154">commit</text>
      </g>
      <g className="node">
        <rect x="112" y="132" width="56" height="36" rx="9" />
        <text x="140" y="154">build</text>
      </g>
      <g className="node active">
        <rect x="222" y="132" width="56" height="36" rx="9" />
        <text x="250" y="154">test</text>
        <circle className="pulse" cx="250" cy="127" r="3.5" />
      </g>

      {[70, 150, 230].map((y, i) => (
        <g className="node cluster" key={i}>
          <rect x="355" y={y - 16} width="70" height="32" rx="9" />
          <circle cx="367" cy={y} r="3.5" fill="#3ee08f" />
          <text x="378" y={y + 4} textAnchor="start">cluster 0{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Portfolio() {
  const [copied, setCopied] = useState(false);

  const copyEmail = () => {
    navigator.clipboard?.writeText(PROFILE.email).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // SEO for a page with no real URL/route of its own (this app has no
  // router - see NavigationContext) - the best available approximation
  // is updating document.title/meta while this component is mounted, and
  // restoring whatever the login page had before on unmount.
  useEffect(() => {

    const prevTitle = document.title;
    document.title = `${PROFILE.name} | ${PROFILE.role}`;

    let meta = document.querySelector('meta[name="description"]');
    const prevDescription = meta?.getAttribute("content") ?? null;
    const createdMeta = !meta;

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }

    meta.setAttribute("content", PROFILE.blurb);

    return () => {
      document.title = prevTitle;
      if (createdMeta) meta.remove();
      else if (prevDescription !== null) meta.setAttribute("content", prevDescription);
    };

  }, []);

  // No PDF-generation toolchain/dependency in this app - opens the
  // browser's own print dialog against the print-only resume block below
  // (.pf-print-resume, hidden everywhere except @media print), which
  // every modern browser can save as a real PDF. Built from this exact
  // component's own PROFILE/PROJECTS/STACK, not a separately maintained copy.
  function handleDownloadResume() {
    window.print();
  }

  return (
    <div className="pf-root">
      <style>{CSS}</style>

      {/* ---------------- nav ---------------- */}
      <nav className="nav">
        <a href="#top" className="mark"><Terminal size={15} />{PROFILE.name}</a>
        <div className="nav-links">
          <a href="#work">Work</a>
          <a href="#stack">Stack</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </div>
        <button type="button" className="resume" onClick={handleDownloadResume}>
          <FileText size={14} /> Résumé
        </button>
      </nav>

      {/* ---------------- hero ---------------- */}
      <header id="top" className="hero">
        <div className="hero-text">
          <span className="role">{PROFILE.role}</span>
          <h1>{PROFILE.headline}</h1>
          <p className="blurb">{PROFILE.blurb}</p>

          <div className="readout mono">
            <span><i>focus</i>{PROFILE.focus}</span>
            <span><i>based</i>{PROFILE.location}</span>
            <span><i>learning</i>{PROFILE.education}</span>
            <span className="avail"><span className="adot" />{PROFILE.availability}</span>
          </div>

          <div className="hero-cta">
            <a href="#work" className="btn primary">See my work</a>
            <a href="#contact" className="btn ghost">Get in touch</a>
          </div>
        </div>
        <div className="hero-art"><PipelineGraph /></div>
      </header>

      {/* ---------------- work ---------------- */}
      <section id="work" className="section">
        <div className="sec-head">
          <h2>Selected work</h2>
          <span className="sec-meta mono">{PROJECTS.length} shipped systems</span>
        </div>

        <ol className="log">
          {PROJECTS.map((p, i) => (
            <li key={i} className="entry">
              <span className="spine-node" style={{ background: KIND_COLOR[p.kind] }} />
              <div className="entry-meta">
                <span className="kind" style={{ color: KIND_COLOR[p.kind] }}>
                  <span className="kdot" style={{ background: KIND_COLOR[p.kind] }} />{p.kind}
                </span>
                <span className="erole">{p.role}</span>
              </div>
              <div className="entry-body">
                <div className="entry-title">
                  <h3>{p.title}</h3>
                  {p.link && (
                    <a href={p.link} className="entry-link mono" target="_blank" rel="noreferrer"
                       onClick={e => { if (p.link.startsWith("#")) e.preventDefault(); }}>
                      {p.linkLabel}<ArrowUpRight size={13} />
                    </a>
                  )}
                </div>
                <p>{p.desc}</p>
                <div className="tags">
                  {p.stack.map(t => <span key={t} className="tag mono">{t}</span>)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- stack ---------------- */}
      <section id="stack" className="section">
        <div className="sec-head"><h2>Toolbox</h2></div>
        <div className="stack-grid">
          {STACK.map(g => (
            <div key={g.group} className="stack-group">
              <h4>{g.group}</h4>
              <div className="tags">
                {g.items.map(t => <span key={t} className="tag mono">{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- about ---------------- */}
      <section id="about" className="section about">
        <div className="sec-head"><h2>About</h2></div>
        <div className="about-grid">
          <div className="about-text">
            <p>
              I'm a test automation and platform engineer working mostly in the .NET and
              cloud world. Day to day that means Playwright suites that verify real behaviour,
              Azure DevOps and GitHub Actions pipelines that deploy across clusters, and the
              occasional internal tool when the existing consoles get in the way.
            </p>
            <p>
              I like problems where the answer is "make this boring and reliable" — repeatable
              releases, honest health checks, and automation that a teammate can pick up without
              a handover call. Right now I'm building the Deployment Portal and finishing a
              B.Tech in AI & ML.
            </p>
          </div>
          <ul className="about-facts mono">
            <li><MapPin size={14} />{PROFILE.location}</li>
            <li><GraduationCap size={14} />{PROFILE.education}</li>
            <li><Terminal size={14} />Currently: {PROFILE.focus}</li>
          </ul>
        </div>
      </section>

      {/* ---------------- contact ---------------- */}
      <section id="contact" className="section contact">
        <div className="contact-inner">
          <h2>Let's talk.</h2>
          <p>{PROFILE.availability}. The fastest way to reach me is email.</p>
          <div className="contact-actions">
            <button className="btn primary" onClick={copyEmail}>
              {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> {PROFILE.email}</>}
            </button>
            <a href={`mailto:${PROFILE.email}`} className="btn ghost"><Mail size={15} /> Email me</a>
          </div>
          <div className="socials">
            <a href={PROFILE.github} target="_blank" rel="noreferrer"><GitHubIcon size={16} /> GitHub</a>
            <a href={PROFILE.linkedin} target="_blank" rel="noreferrer"><LinkedInIcon size={16} /> LinkedIn</a>
          </div>
        </div>
      </section>

      <footer className="pf-footer">
        <span className="mono">© {new Date().getFullYear()} {PROFILE.name}</span>
        <span className="mono">Built by hand · no template</span>
      </footer>

      {/* ---------------- print-only resume ---------------- */}
      <div className="pf-print-resume" aria-hidden="true">
        <h1>{PROFILE.name}</h1>
        <p>{PROFILE.role}</p>
        <p>
          {PROFILE.email} | {PROFILE.location}<br />
          {PROFILE.github.replace("https://", "")} | {PROFILE.linkedin.replace("https://", "")}
        </p>
        <p>{PROFILE.blurb}</p>

        <h2>Selected Work</h2>
        {PROJECTS.map((p) => (
          <div key={p.title}>
            <p><strong>{p.title}</strong> ({p.kind}) — {p.role}</p>
            <p>{p.desc}</p>
            <p><em>{p.stack.join(", ")}</em></p>
          </div>
        ))}

        <h2>Toolbox</h2>
        <ul>
          {STACK.map((g) => (
            <li key={g.group}><strong>{g.group}:</strong> {g.items.join(", ")}</li>
          ))}
        </ul>

        <h2>Education</h2>
        <p>{PROFILE.education}</p>
      </div>

    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.pf-root{
  --bg:#0b0e13; --panel:#141a23; --panel2:#10161e; --line:#232d3b; --line2:#2c3948;
  --text:#e6edf5; --muted:#8b98ab; --faint:#5a6675; --teal:#37d5cf;
  font-family:'Space Grotesk',system-ui,sans-serif; color:var(--text);
  background:
    radial-gradient(1000px 620px at 78% -10%, #16303048, transparent),
    var(--bg);
  -webkit-font-smoothing:antialiased; scroll-behavior:smooth;
}
.pf-root *{box-sizing:border-box;}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;}
.pf-root a{color:inherit; text-decoration:none;}
.pf-root button{font-family:inherit; cursor:pointer;}
:focus-visible{outline:2px solid var(--teal); outline-offset:3px; border-radius:6px;}
.section, .hero, .nav{max-width:940px; margin:0 auto; padding-left:28px; padding-right:28px;}

/* nav */
.nav{display:flex; align-items:center; gap:22px; padding-top:22px; padding-bottom:22px;
  position:sticky; top:0; z-index:10; backdrop-filter:blur(10px);
  background:linear-gradient(180deg,#0b0e13ee,#0b0e1300);}
.mark{display:flex; align-items:center; gap:9px; font-weight:600; font-size:14px; letter-spacing:-.01em;}
.mark svg{color:var(--teal);}
.nav-links{display:flex; gap:22px; margin-left:auto; font-size:13.5px; color:var(--muted);}
.nav-links a{position:relative; padding:3px 0;}
.nav-links a:hover{color:var(--text);}
.nav-links a::after{content:""; position:absolute; left:0; right:0; bottom:-2px; height:1.5px; background:var(--teal);
  transform:scaleX(0); transform-origin:left; transition:transform .2s;}
.nav-links a:hover::after{transform:scaleX(1);}
.resume{display:flex; align-items:center; gap:7px; font-size:13px; color:var(--muted);
  border:1px solid var(--line2); padding:7px 12px; border-radius:9px; transition:.15s; background:transparent;}
.resume:hover{border-color:var(--teal); color:var(--teal);}

/* hero */
.hero{display:grid; grid-template-columns:1.15fr .85fr; gap:40px; align-items:center;
  padding-top:64px; padding-bottom:80px;}
.role{font-size:13px; color:var(--teal); font-family:'JetBrains Mono',monospace;}
.hero h1{margin:18px 0 0; font-size:44px; line-height:1.06; font-weight:600; letter-spacing:-.035em; max-width:15ch;}
.blurb{margin:20px 0 0; font-size:15.5px; line-height:1.6; color:var(--muted); max-width:52ch;}
.readout{display:flex; flex-direction:column; gap:8px; margin:26px 0 0; font-size:12.5px; color:var(--muted);}
.readout span{display:flex; align-items:center; gap:10px;}
.readout i{font-style:normal; color:var(--faint); width:64px; display:inline-block;}
.avail{color:var(--text) !important;}
.adot{width:8px; height:8px; border-radius:50%; background:#3ee08f; box-shadow:0 0 0 3px #3ee08f22; animation:blink 2s infinite;}
@keyframes blink{50%{opacity:.4}}
.hero-cta{display:flex; gap:12px; margin-top:32px;}
.btn{display:inline-flex; align-items:center; gap:8px; font-size:14px; font-weight:600; padding:11px 20px; border-radius:11px; transition:.15s; border:1px solid transparent;}
.btn.primary{background:var(--teal); color:#04211f;}
.btn.primary:hover{filter:brightness(1.08);}
.btn.ghost{border-color:var(--line2); color:var(--text);}
.btn.ghost:hover{border-color:var(--teal); color:var(--teal);}

.hero-art{display:flex; justify-content:center;}
.pipe{width:100%; max-width:400px;}
.pipe .wire{fill:none; stroke:var(--line2); stroke-width:1.5;}
.pipe .wire.live{stroke:url(#flow); stroke-width:2; stroke-dasharray:6 6; animation:flow 1.2s linear infinite;}
@keyframes flow{to{stroke-dashoffset:-24;}}
.pipe .node rect{fill:#10161e; stroke:var(--line2); stroke-width:1.5;}
.pipe .node text{fill:var(--muted); font-family:'JetBrains Mono',monospace; font-size:11px; text-anchor:middle;}
.pipe .node.active rect{stroke:var(--teal);}
.pipe .node.active text{fill:var(--teal);}
.pipe .node.cluster text{fill:var(--muted);}
.pipe .pulse{fill:var(--teal); animation:pp 1.6s ease-in-out infinite;}
@keyframes pp{0%,100%{opacity:.3; r:3}50%{opacity:1; r:4.5}}

/* section shells */
.section{padding-top:56px; padding-bottom:56px; border-top:1px solid var(--line);}
.sec-head{display:flex; align-items:baseline; justify-content:space-between; margin-bottom:34px;}
.sec-head h2{margin:0; font-size:15px; font-weight:600; color:var(--muted); letter-spacing:.01em;}
.sec-meta{font-size:12px; color:var(--faint);}

/* work — build log */
.log{list-style:none; margin:0; padding:0 0 0 4px; position:relative;}
.log::before{content:""; position:absolute; left:5px; top:6px; bottom:6px; width:1.5px; background:var(--line);}
.entry{position:relative; display:grid; grid-template-columns:170px 1fr; gap:32px; padding:0 0 42px 34px;}
.entry:last-child{padding-bottom:4px;}
.spine-node{position:absolute; left:0; top:6px; width:12px; height:12px; border-radius:50%; border:3px solid var(--bg);}
.entry-meta{display:flex; flex-direction:column; gap:7px; padding-top:2px;}
.kind{display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600;}
.kdot{width:7px; height:7px; border-radius:50%;}
.erole{font-size:12.5px; color:var(--faint);}
.entry-body h3{margin:0; font-size:20px; font-weight:600; letter-spacing:-.02em; transition:color .15s;}
.entry:hover .entry-body h3{color:var(--teal);}
.entry-title{display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:10px;}
.entry-link{display:inline-flex; align-items:center; gap:3px; font-size:12px; color:var(--teal);}
.entry-link:hover{text-decoration:underline;}
.entry-body p{margin:0 0 14px; font-size:14.5px; line-height:1.6; color:var(--muted); max-width:60ch;}
.tags{display:flex; flex-wrap:wrap; gap:7px;}
.tag{font-size:11.5px; color:var(--muted); background:var(--panel2); border:1px solid var(--line);
  border-radius:7px; padding:4px 9px;}

/* stack */
.stack-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:28px 40px;}
.stack-group h4{margin:0 0 12px; font-size:13px; font-weight:600; color:var(--text);}

/* about */
.about-grid{display:grid; grid-template-columns:1.6fr 1fr; gap:44px;}
.about-text p{margin:0 0 16px; font-size:15px; line-height:1.65; color:var(--muted); max-width:58ch;}
.about-text p:last-child{margin-bottom:0;}
.about-facts{list-style:none; margin:0; padding:20px; background:var(--panel2); border:1px solid var(--line);
  border-radius:14px; display:flex; flex-direction:column; gap:14px; font-size:13px; color:var(--muted); height:fit-content;}
.about-facts li{display:flex; align-items:center; gap:11px;}
.about-facts svg{color:var(--teal); flex:0 0 auto;}

/* contact */
.contact{border-top:1px solid var(--line);}
.contact-inner{text-align:center; padding:20px 0;}
.contact-inner h2{margin:0; font-size:38px; font-weight:600; letter-spacing:-.03em; color:var(--text);}
.contact-inner > p{margin:14px auto 0; font-size:15px; color:var(--muted); max-width:46ch;}
.contact-actions{display:flex; gap:12px; justify-content:center; margin-top:28px; flex-wrap:wrap;}
.contact-actions .primary{font-family:'JetBrains Mono',monospace; font-size:13px;}
.socials{display:flex; gap:26px; justify-content:center; margin-top:26px; font-size:13.5px; color:var(--muted);}
.socials a{display:flex; align-items:center; gap:8px;}
.socials a:hover{color:var(--teal);}

.pf-footer{max-width:940px; margin:0 auto; padding:26px 28px 40px; display:flex; justify-content:space-between;
  border-top:1px solid var(--line); font-size:11.5px; color:var(--faint);}

.pf-print-resume{display:none;}

@media (max-width:820px){
  .hero{grid-template-columns:1fr; gap:28px; padding-top:44px; padding-bottom:56px;}
  .hero-art{order:-1; justify-content:flex-start;}
  .hero h1{font-size:34px;}
  .entry{grid-template-columns:1fr; gap:12px;}
  .entry-meta{flex-direction:row; gap:16px; align-items:center;}
  .stack-grid, .about-grid{grid-template-columns:1fr; gap:24px;}
  .nav-links{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .pipe .wire.live,.pipe .pulse,.adot{animation:none !important;}
  .pf-root{scroll-behavior:auto;}
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
