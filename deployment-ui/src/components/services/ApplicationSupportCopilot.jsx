import { useEffect, useRef, useState } from "react";

import { sendApplicationSupportMessage } from "../../services/applicationSupportService";
import CopilotMarkdown from "../copilot/CopilotMarkdown";

const SUGGESTIONS = [
    "What version is currently deployed?",
    "Is the application healthy?",
    "Why is a user seeing an old version?",
    "What was the latest deployment?"
];

// Services -> Application Support -> Deployment Support Copilot. An
// inline panel (not the floating Deployment Copilot drawer - see
// components/copilot/DeploymentCopilot.jsx) since this lives embedded in
// an admin page, not globally across the portal. Reuses CopilotMarkdown
// (safe, no dangerouslySetInnerHTML) for rendering replies - same
// rendering, different backend endpoint/tool set/system instruction (see
// ApplicationSupportController vs AiController).
export default function ApplicationSupportCopilot() {

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);

    const scrollRef = useRef(null);

    useEffect(() => {

        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }

    }, [messages, sending]);

    async function handleSend(question) {

        const text = (question ?? input).trim();

        if (!text || sending) return;

        setInput("");

        const nextMessages = [...messages, { role: "user", content: text }];
        setMessages(nextMessages);
        setSending(true);

        try {

            const result = await sendApplicationSupportMessage(nextMessages, null);

            setMessages((prev) => [...prev, { role: "model", content: result.reply }]);

        }
        catch (err) {

            console.error(err);

            const message = err.response?.data?.message
                || "Deployment Support Copilot couldn't reach the server right now. Please try again.";

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

    return (

        <div className="card">

            <h3 className="settings-subhead" style={{ marginTop: 0 }}>✨ Deployment Support Copilot</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Ask about the application version, deployments, health, or why a specific user might
                be seeing an old build.
            </p>

            <div className="copilot-inline-body" ref={scrollRef}>

                {messages.length === 0 ? (

                    <div className="copilot-suggestions">

                        {SUGGESTIONS.map((q) => (

                            <button key={q} type="button" className="copilot-suggestion" onClick={() => handleSend(q)}>
                                {q}
                            </button>

                        ))}

                    </div>

                ) : (

                    messages.map((m, index) => (

                        <div
                            key={index}
                            className={`copilot-message ${m.role === "user" ? "copilot-message-user" : "copilot-message-model"}`}
                        >
                            <span className="copilot-message-role">
                                {m.role === "user" ? "You" : "Deployment Support Copilot"}
                            </span>
                            {m.role === "user"
                                ? <p style={{ margin: 0 }}>{m.content}</p>
                                : <CopilotMarkdown text={m.content} />}
                        </div>

                    ))

                )}

                {sending && (

                    <div className="copilot-message copilot-message-model copilot-message-loading">
                        <span className="copilot-message-role">Deployment Support Copilot</span>
                        <p style={{ margin: 0 }}>Analyzing application data...</p>
                    </div>

                )}

            </div>

            <form className="copilot-inline-footer" onSubmit={handleSubmit}>

                <input
                    type="text"
                    className="form-control"
                    placeholder="Ask Deployment Support Copilot..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={sending}
                    autoComplete="off"
                />

                <button type="submit" className="copilot-send" disabled={sending || !input.trim()} aria-label="Send">
                    ➤
                </button>

            </form>

        </div>

    );

}
