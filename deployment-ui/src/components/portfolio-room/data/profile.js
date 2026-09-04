// Real, verified content (see the previous build's own verification notes -
// PROJECTS/SKILLS/dates were confirmed directly by the user, not assumed).
// Carried forward unchanged into this rewrite - the library/architecture
// changed, the facts about the person didn't.
export const PROFILE = {
    name: "Varshith Chand",
    role: "DevOps Engineer",
    tagline: "Cloud & Infrastructure · CI/CD Automation · Containerization · Test Automation",
    email: "v.varshith.2004@gmail.com",
    github: "https://github.com/VarshithChand",
    linkedin: "https://linkedin.com/in/varshith-chand-vuyyuru",
    // Served straight from /public, so it's just a static file - place
    // the real PDF at deployment-ui/public/resume.pdf. Referenced from
    // both the resume paper's viewer panel and its download link (see
    // ui/sections/Resume.jsx) so there's one place to change the path.
    resumeUrl: "/resume.pdf"
};

export const ABOUT = {
    whoami: [
        { prompt: "$ whoami", lines: ["Varshith Chand", "DevOps Engineer"] },
        { prompt: "", lines: [PROFILE.tagline] },
        { prompt: "", lines: ["B.Tech in AI & ML (2022-2026)"] }
    ]
};

export const CONTACT = {
    email: PROFILE.email,
    github: PROFILE.github,
    linkedin: PROFILE.linkedin
};
