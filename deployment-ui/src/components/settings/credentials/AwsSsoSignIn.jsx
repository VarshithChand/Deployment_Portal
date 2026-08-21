import { useEffect, useRef, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { startAwsSso, pollAwsSso, getAwsSsoAccounts, selectAwsSsoAccount } from "../../../services/awsSsoService";

const STORAGE_KEY = "awsSsoStartUrl";

// The real "Sign in with AWS" flow for orgs on IAM Identity Center (AWS
// SSO) - opens AWS's own login page in a new tab (your actual username,
// password, and MFA happen there, never in this app), then polls until
// you've approved it, then lets you pick which account/role/region to
// connect as. See AwsSsoController/AwsSsoService for the device-
// authorization mechanics (the same one `aws sso login` uses).
export default function AwsSsoSignIn({ onConnected }) {

    const toast = useToast();

    const [startUrl, setStartUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
    const [ssoRegion, setSsoRegion] = useState("us-east-1");
    const [region, setRegion] = useState("");

    // "idle" | "waiting" | "picking" | "connecting"
    const [phase, setPhase] = useState("idle");
    const [pendingId, setPendingId] = useState(null);
    const [userCode, setUserCode] = useState(null);
    const [verificationUrl, setVerificationUrl] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState("");
    const [selectedRole, setSelectedRole] = useState("");

    const pollHandle = useRef(null);
    const deadline = useRef(null);

    useEffect(() => () => stopPolling(), []);

    function stopPolling() {

        if (pollHandle.current) {
            clearInterval(pollHandle.current);
            pollHandle.current = null;
        }

    }

    function resetToIdle() {

        stopPolling();
        setPhase("idle");
        setPendingId(null);
        setUserCode(null);
        setVerificationUrl(null);

    }

    async function handleSignIn() {

        if (!startUrl.trim()) {
            toast.show("Enter your AWS SSO start URL first.", "error");
            return;
        }

        localStorage.setItem(STORAGE_KEY, startUrl.trim());

        try {

            const result = await startAwsSso(startUrl.trim(), ssoRegion.trim() || "us-east-1");

            setPendingId(result.pendingId);
            setUserCode(result.userCode);
            setVerificationUrl(result.verificationUriComplete);
            setPhase("waiting");

            window.open(result.verificationUriComplete, "_blank", "noopener,noreferrer");

            deadline.current = Date.now() + result.expiresInSeconds * 1000;

            pollHandle.current = setInterval(
                () => checkApproval(result.pendingId),
                result.intervalSeconds * 1000
            );

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to start AWS sign-in.", "error");

        }

    }

    async function checkApproval(id) {

        if (Date.now() > deadline.current) {

            stopPolling();
            toast.show("AWS sign-in timed out — try again.", "error");
            resetToIdle();
            return;

        }

        const result = await pollAwsSso(id);

        if (result.status === "success") {

            stopPolling();

            const accountList = await getAwsSsoAccounts(id);

            if (!accountList || accountList.length === 0) {
                toast.show("Signed in, but no AWS accounts are available to this user.", "error");
                resetToIdle();
                return;
            }

            setAccounts(accountList);
            setSelectedAccountId(accountList[0].accountId);
            setSelectedRole(accountList[0].roles[0] || "");
            setPhase("picking");

        }
        else if (result.status === "denied") {

            stopPolling();
            toast.show("Sign-in was denied.", "error");
            resetToIdle();

        }
        else if (result.status === "expired") {

            stopPolling();
            toast.show("Sign-in request expired — try again.", "error");
            resetToIdle();

        }
        else if (result.status === "error") {

            stopPolling();
            toast.show(result.error || "AWS sign-in failed.", "error");
            resetToIdle();

        }
        // "pending" - keep polling

    }

    const selectedAccount = accounts.find((a) => a.accountId === selectedAccountId);

    async function handleConnect() {

        setPhase("connecting");

        try {

            const result = await selectAwsSsoAccount(pendingId, selectedAccountId, selectedRole, region.trim());

            toast.show(`Connected to ${result.accountName} as ${result.roleName}.`, "success");
            resetToIdle();
            onConnected?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to connect to that account.", "error");
            setPhase("picking");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">Sign in with AWS</h3>

            {phase === "idle" && (

                <>

                <div className="form-group">
                    <label htmlFor="aws-sso-start-url">AWS SSO Start URL</label>
                    <ClearableInput
                        id="aws-sso-start-url"
                        placeholder="https://your-company.awsapps.com/start"
                        value={startUrl}
                        onChange={(e) => setStartUrl(e.target.value)}
                        onClear={() => setStartUrl("")}
                        autoComplete="off"
                        name="aws-sso-start-url"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="aws-sso-region">SSO Region</label>
                    <ClearableInput
                        id="aws-sso-region"
                        placeholder="us-east-1"
                        value={ssoRegion}
                        onChange={(e) => setSsoRegion(e.target.value)}
                        onClear={() => setSsoRegion("")}
                        autoComplete="off"
                        name="aws-sso-region"
                    />
                </div>

                <button type="button" className="btn btn-primary" onClick={handleSignIn}>
                    Sign In with AWS
                </button>

                </>

            )}

            {phase === "waiting" && (

                <>

                <p className="field-hint">
                    A new tab opened to AWS's sign-in page. Sign in there with your username,
                    password, and MFA, then approve this request.
                </p>

                <p className="field-hint">
                    If the tab didn't open, go to{" "}
                    <a href={verificationUrl} target="_blank" rel="noreferrer" className="token-help-link">
                        {verificationUrl}
                    </a>
                    {" "}and enter code <strong>{userCode}</strong>.
                </p>

                <button type="button" className="btn btn-danger" onClick={resetToIdle}>
                    Cancel
                </button>

                </>

            )}

            {(phase === "picking" || phase === "connecting") && (

                <>

                <div className="form-group">
                    <label htmlFor="aws-sso-account">AWS Account</label>
                    <select
                        id="aws-sso-account"
                        className="form-control"
                        value={selectedAccountId}
                        onChange={(e) => {

                            setSelectedAccountId(e.target.value);
                            const account = accounts.find((a) => a.accountId === e.target.value);
                            setSelectedRole(account?.roles[0] || "");

                        }}
                    >
                        {accounts.map((a) => (
                            <option key={a.accountId} value={a.accountId}>
                                {a.accountName} ({a.accountId})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="aws-sso-role">Role</label>
                    <select
                        id="aws-sso-role"
                        className="form-control"
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                    >
                        {selectedAccount?.roles.map((role) => (
                            <option key={role} value={role}>{role}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="aws-sso-connect-region">Region</label>
                    <ClearableInput
                        id="aws-sso-connect-region"
                        placeholder="us-east-1"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        onClear={() => setRegion("")}
                        autoComplete="off"
                        name="aws-sso-target-region"
                    />
                </div>

                <div className="button-row">

                    <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={phase === "connecting"}>
                        {phase === "connecting" ? "Connecting..." : "Connect"}
                    </button>

                    <button type="button" className="btn" onClick={resetToIdle} disabled={phase === "connecting"}>
                        Cancel
                    </button>

                </div>

                </>

            )}

        </div>

    );

}
