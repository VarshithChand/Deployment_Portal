import { Clock, FileText, KeyRound, Rocket, Server, ShieldCheck } from "lucide-react";

// Illustrative only, not live data - the same static run/provider list
// every pre-auth page showing this panel has always used.
const S = { ok: "var(--viz-good)", running: "var(--heading-accent)", warn: "var(--viz-warning)" };

const PROVIDERS = [
    { n: "GitHub", s: "ok" }, { n: "Azure DevOps", s: "ok" }, { n: "AWS", s: "ok" },
    { n: "Azure", s: "ok" }, { n: "GCP", s: "warn" }, { n: "Render", s: "ok" },
    { n: "Cloudflare", s: "ok" }, { n: "Harbor", s: "ok" }, { n: "ECR", s: "ok" },
    { n: "SonarQube", s: "ok" }
];

const PREVIEW_RUNS = [
    { wf: "deploy-api.yml", env: "acpt", sha: "a91f3c7", time: "now", s: "running" },
    { wf: "deploy-ui.yml", env: "prod", sha: "b4a0f91", time: "6h ago", s: "ok" }
];

// The left-hand marketing/showcase panel shown alongside every pre-auth
// page's own card - sign-in/register, every forgot-password step, and
// the MFA verification page. Extracted into its own shared component
// (and its supporting .aw-root/.aw-split/.showcase CSS moved into
// global.css alongside it) specifically because LoginSignupPage.jsx and
// MfaVerifyPage.jsx are mounted as full alternates of each other in
// App.jsx (mfaPending ? <MfaVerifyPage/> : <LoginSignupPage/>) - one
// fully unmounts when the other shows, so anything scoped to either
// page's own inline <style> tag disappears along with it. Before this,
// MfaVerifyPage used a completely different, single-card, no-panel
// layout (.auth-page/.auth-page-card centered alone) - landing on it
// mid-login felt like being redirected to a different template rather
// than staying on the same page, exactly the same problem the forgot-
// password steps had before they got folded into this same panel.
//
// onOpenTool is intentionally the only integration point - the two
// pages that use this have different ideas of what "open a tool" means
// (LoginSignupPage tracks it as client-side state so no page reload
// happens; MfaVerifyPage has no such state and navigates with a real
// URL change instead), so this component only cares that its 3 footer
// links (About/FAQ/Portfolio) can call something with a tool name -
// not how that something gets there.
export default function AuthShowcasePanel({ onOpenTool }) {

    return (

        <aside className="showcase">

            <div className="brand">
                <span className="glyph"><Rocket size={17} strokeWidth={2.4} /></span>
                <span className="brand-name">Deployment Portal</span>
            </div>

            <div className="pitch">
                <h1>Every deployment, one console.</h1>
                <p>
                    Trigger releases, watch runs, and approve promotions across GitHub Actions,
                    AWS, Azure, GCP, and your registries — without hopping between ten dashboards.
                </p>
            </div>

            {/* console preview - illustrative, not live data */}
            <div className="preview" aria-hidden>

                <div className="preview-bar">
                    <span className="live"><span className="live-dot" />What's behind the login</span>
                </div>

                <div className="preview-runs">
                    {PREVIEW_RUNS.map((r, i) => (
                        <div key={i} className="prun">
                            <span className="pdot" style={{ background: S[r.s] }}>
                                {r.s === "running" && <span className="pping" style={{ background: S[r.s] }} />}
                            </span>
                            <span className="mono pwf">{r.wf}</span>
                            <span className={"penv " + r.env}>{r.env}</span>
                            <span className="mono psha">{r.sha}</span>
                            <span className="ptime"><Clock size={10} />{r.time}</span>
                            {r.s === "running" && <span className="pprog"><i /></span>}
                        </div>
                    ))}
                </div>

                <div className="preview-chips">
                    {PROVIDERS.map((p) => (
                        <span key={p.n} className="chip">
                            <span className="cdot" style={{ background: S[p.s] }} />{p.n}
                        </span>
                    ))}
                    <span className="chip more">+20 more</span>
                </div>

            </div>

            <ul className="trust">
                <li><ShieldCheck size={14} /> Multi-factor auth is required for every account</li>
                <li><KeyRound size={14} /> Cloud keys and tokens encrypted at rest</li>
                <li><Server size={14} /> Role-based access, enforced on every request</li>
                <li><FileText size={14} /> Settings changes and admin actions are audit-logged</li>
            </ul>

            <div className="pitch-links">
                <button type="button" onClick={() => onOpenTool("about")}>About</button>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => onOpenTool("faq")}>FAQ</button>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => onOpenTool("portfolio")}>Portfolio</button>
            </div>

        </aside>

    );

}
