import PageLayout from "../components/layout/PageLayout";
import PaasProviderCard from "../components/paas/PaasProviderCard";

const PROVIDERS = [
    { key: "render", label: "Render", hasAccountId: false, helpText: "Backend hosting — web services, background workers, cron jobs." },
    { key: "cloudflare", label: "Cloudflare Pages", hasAccountId: true, helpText: "Frontend hosting — Pages projects and Worker scripts. Needs an API Token plus your Account ID." },
    { key: "netlify", label: "Netlify", hasAccountId: false, helpText: "Frontend hosting — sites and their deploy status." },
    { key: "vercel", label: "Vercel", hasAccountId: false, helpText: "Frontend hosting — projects and their production deployment status." }
];

// Session-scoped, exactly like the Cloud Services page's AWS/Azure
// credentials (see PortalIdentity) — every token here is kept only for
// this browser, never portal-wide, cleared on sign-out. Read-only: this
// page never modifies anything in your Render/Cloudflare/Netlify/Vercel
// account, it only shows what's already there.
export default function PaasHosting() {

    return (

        <PageLayout title="Hosting Providers">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Connect your own Render, Cloudflare, Netlify, or Vercel account to see what's
                actually deployed under it. Tokens are kept only for this browser's session.
            </p>

            {PROVIDERS.map((p) => (

                <div key={p.key} style={{ marginBottom: "18px" }}>
                    <PaasProviderCard provider={p.key} label={p.label} hasAccountId={p.hasAccountId} helpText={p.helpText} />
                </div>

            ))}

        </PageLayout>

    );

}
