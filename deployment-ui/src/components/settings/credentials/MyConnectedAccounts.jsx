import PaasProviderCard from "../../paas/PaasProviderCard";

// What used to live on the Hosting Providers page's old self-service view -
// "what's actually deployed under YOUR connected account" - now shown right
// next to the form that connects it (PaasLoginSection above this) instead
// of a separate page trip. Hosting Providers itself now shows the portal's
// own fixed production deployment instead (see HostingObservabilityController/
// pages/PaasHosting.jsx), a materially different, portal-wide thing.
// PaasProviderCard is reused completely unchanged - only its caller moved.
export default function MyConnectedAccounts({ provider, label, configured }) {

    if (!configured) return null;

    return (

        <div style={{ marginTop: "18px" }}>
            <PaasProviderCard provider={provider} label={label} />
        </div>

    );

}
