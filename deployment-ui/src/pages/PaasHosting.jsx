import { useEffect, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import PaasProviderCard from "../components/paas/PaasProviderCard";
import LoadingSpinner from "../components/LoadingSpinner";
import useNavigation from "../hooks/useNavigation";
import { getPaasStatus } from "../services/paasService";

const PROVIDERS = [
    { key: "render", label: "Render" },
    { key: "cloudflare", label: "Cloudflare Pages" },
    { key: "netlify", label: "Netlify" },
    { key: "vercel", label: "Vercel" }
];

// Session-scoped, exactly like the Cloud Services page's AWS/Azure
// credentials (see PortalIdentity) — read-only status here; connecting/
// editing/clearing a provider lives on Settings > Credentials (see
// PaasLoginSection). Only shows a card for a provider that's actually
// configured, rather than four cards with empty connect forms.
export default function PaasHosting() {

    const { setTab } = useNavigation();

    const [configured, setConfigured] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        Promise.all(PROVIDERS.map((p) => getPaasStatus(p.key).catch(() => null))).then((results) => {

            setConfigured(PROVIDERS.filter((p, i) => results[i]?.configured));
            setLoading(false);

        });

    }, []);

    if (loading) {
        return <LoadingSpinner />;
    }

    return (

        <PageLayout title="Hosting Providers">

            {configured.length === 0 ? (

                <div className="card">

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        No hosting providers connected yet. Connect Render, Cloudflare, Netlify,
                        or Vercel from{" "}
                        <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>
                            Settings → Credentials
                        </a>
                        {" "}to see what's actually deployed under each account.
                    </p>

                </div>

            ) : (

                <>

                <p className="field-hint" style={{ marginBottom: "18px" }}>
                    What's actually deployed under your connected accounts. Manage connections
                    from{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>
                        Settings → Credentials
                    </a>.
                </p>

                {configured.map((p) => (

                    <div key={p.key} style={{ marginBottom: "18px" }}>
                        <PaasProviderCard provider={p.key} label={p.label} />
                    </div>

                ))}

                </>

            )}

        </PageLayout>

    );

}
