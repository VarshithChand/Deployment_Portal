import { useEffect, useRef, useState } from "react";

import { getSettings } from "../../services/settingsService";
import { sendCopilotMessage } from "../../services/aiService";
import useNavigation from "../../hooks/useNavigation";
import useAuth from "../../hooks/useAuth";
import CopilotMarkdown from "./CopilotMarkdown";

const DEFAULT_SUGGESTIONS = [
    "Why did my latest deployment fail?",
    "Show my running workflows.",
    "How many EC2 instances are running?",
    "What ECS services are stopped?",
    "Where can I check my database health?"
];

const GITHUB_TAB_SUGGESTIONS = [
    "Why did my latest workflow fail?",
    "Show failed workflows.",
    "What deployments are running?",
    "What pull requests are open?"
];

const CLOUD_SERVICES_SUGGESTIONS = [
    "How many EC2 instances are running?",
    "Which ECS services are stopped?",
    "Show my ECR repositories.",
    "What AWS services am I using?"
];

const GITHUB_CONTEXT_TABS = new Set(["deploy", "approvals", "pullRequests", "history", "storage", "timeline"]);

function suggestionsForTab(tab) {

    if (tab === "cloudServices") return CLOUD_SERVICES_SUGGESTIONS;
    if (GITHUB_CONTEXT_TABS.has(tab)) return GITHUB_TAB_SUGGESTIONS;

    return DEFAULT_SUGGESTIONS;

}

// Read straight off the current URL rather than threaded through new
// context plumbing - CloudServices/Settings/Database already sync exactly
// this state into query params (service/cluster/ecsService/repo/table/
// view), so this needs no changes to those pages at all (section 16/17).
function readPageContext(tab) {

    const params = new URLSearchParams(window.location.search);

    return {
        currentTab: tab,
        currentView: params.get("view") || null,
        selectedService: params.get("service") || null,
        selectedCluster: params.get("cluster") || null,
        selectedEcsService: params.get("ecsService") || null,
        selectedRepo: params.get("repo") || null,
        selectedTable: params.get("table") || null
    };

}

// The floating "✨ Copilot" trigger plus the right-side chat drawer it
// opens - mounted once at the app shell level (see App.jsx), same as
// PeriodicSignOutMonitor/GlobalLogoutMonitor, so it's reachable from every
// tab including the pre-login/setup screens (someone stuck at "connect
// your GitHub repo" is exactly who'd want to ask "how do I configure
// GitHub credentials?").
export default function DeploymentCopilot() {

    const { tab } = useNavigation();
    const { isAdminSession } = useAuth();

    const [open, setOpen] = useState(false);
    const [configured, setConfigured] = useState(null);
    const [checkingConfig, setCheckingConfig] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);

    const scrollRef = useRef(null);
    const checkedOnce = useRef(false);

    // Lazy - only checked the first time someone actually opens the panel,
    // not on every page load for visitors who never touch it.
    useEffect(() => {

        if (!open || checkedOnce.current) return;

        checkedOnce.current = true;
        setCheckingConfig(true);

        getSettings()
            .then((data) => setConfigured(!!data.aiApiKeyConfigured))
            .catch((err) => {
                console.error(err);
                setConfigured(false);
            })
            .finally(() => setCheckingConfig(false));

    }, [open]);

    useEffect(() => {

        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }

    }, [messages, sending]);

    useEffect(() => {

        if (!open) return;

        function handleKeyDown(e) {
            if (e.key === "Escape") setOpen(false);
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);

    }, [open]);

    async function handleSend(question) {

        const text = (question ?? input).trim();

        // Also blocked while sending - concurrent submissions aren't
        // supported yet (section 29), so the input/button are disabled
        // below, but a suggested-question click could still race a
        // just-started send without this.
        if (!text || sending) return;

        setInput("");

        const nextMessages = [...messages, { role: "user", content: text }];
        setMessages(nextMessages);
        setSending(true);

        try {

            const result = await sendCopilotMessage(nextMessages, readPageContext(tab));

            setMessages((prev) => [...prev, { role: "model", content: result.reply }]);

        }
        catch (err) {

            console.error(err);

            const message = err.response?.data?.message
                || "Deployment Copilot couldn't reach the server right now. Please try again.";

            setMessages((prev) => [...prev, { role: "model", content: message }]);

        }
        finally {

            setSending(false);

        }

    }

    function handleSubmit(e) {
        e.preventDefault();
        handleSend();
    }

    // Admin-only, no delegation (see AiController.Chat) - the floating
    // widget simply doesn't render for a non-admin session, same
    // self-guarding pattern PageAdminAccessButton already uses, rather
    // than rendering and then failing on the first message sent.
    if (!isAdminSession) {
        return null;
    }

    return (

        <>

            <button
                type="button"
                className="copilot-trigger"
                onClick={() => setOpen(true)}
                aria-label="Open Deployment Copilot"
            >
                ✨ Copilot
            </button>

            {open && (

                <div className="copilot-drawer-backdrop" role="presentation" onClick={() => setOpen(false)}>

                    <div
                        className="copilot-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="copilot-title"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >

                        <div className="copilot-drawer-header">

                            <h2 id="copilot-title">✨ Deployment Copilot</h2>

                            <button type="button" className="copilot-close" onClick={() => setOpen(false)} aria-label="Close">
                                ×
                            </button>

                        </div>

                        <div className="copilot-drawer-body" ref={scrollRef}>

                            {checkingConfig ? (

                                <p className="empty-state">Checking availability...</p>

                            ) : configured === false ? (

                                <div className="copilot-message copilot-message-model">
                                    <p style={{ margin: 0 }}>
                                        Deployment Copilot isn't configured yet. An administrator can add a Gemini
                                        API key and model in Settings → Credentials → AI Assistant.
                                    </p>
                                </div>

                            ) : messages.length === 0 ? (

                                <>

                                    <div className="copilot-message copilot-message-model">
                                        <p style={{ marginTop: 0 }}>Hi! I'm Deployment Copilot.</p>
                                        <p style={{ marginBottom: 0 }}>
                                            I can help you understand your deployments, workflows, GitHub
                                            repositories, cloud resources, and this portal itself.
                                        </p>
                                    </div>

                                    <p className="field-hint" style={{ margin: "16px 0 8px" }}>Try asking:</p>

                                    <div className="copilot-suggestions">

                                        {suggestionsForTab(tab).map((q) => (

                                            <button
                                                key={q}
                                                type="button"
                                                className="copilot-suggestion"
                                                onClick={() => handleSend(q)}
                                            >
                                                {q}
                                            </button>

                                        ))}

                                    </div>

                                </>

                            ) : (

                                messages.map((m, index) => (

                                    <div
                                        key={index}
                                        className={`copilot-message ${m.role === "user" ? "copilot-message-user" : "copilot-message-model"}`}
                                    >
                                        <span className="copilot-message-role">
                                            {m.role === "user" ? "You" : "Deployment Copilot"}
                                        </span>
                                        {m.role === "user"
                                            ? <p style={{ margin: 0 }}>{m.content}</p>
                                            : <CopilotMarkdown text={m.content} />}
                                    </div>

                                ))

                            )}

                            {sending && (

                                <div className="copilot-message copilot-message-model copilot-message-loading">
                                    <span className="copilot-message-role">Deployment Copilot</span>
                                    <p style={{ margin: 0 }}>Analyzing portal data...</p>
                                </div>

                            )}

                        </div>

                        <form className="copilot-drawer-footer" onSubmit={handleSubmit}>

                            <input
                                type="text"
                                className="form-control"
                                placeholder="Ask Deployment Copilot..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={sending || configured === false}
                                autoComplete="off"
                            />

                            <button
                                type="submit"
                                className="copilot-send"
                                disabled={sending || !input.trim() || configured === false}
                                aria-label="Send"
                            >
                                ➤
                            </button>

                        </form>

                    </div>

                </div>

            )}

        </>

    );

}
