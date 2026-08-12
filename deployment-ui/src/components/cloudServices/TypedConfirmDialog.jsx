import { useEffect, useState } from "react";

// Section 24's "type the resource name to confirm" gate for high-risk
// deletes (EC2 terminate, ECR delete repository) - a plain yes/no
// ConfirmDialog is what every other destructive action in this app uses,
// but these specifically call for the stronger typed-confirmation pattern
// the request asked for, so this is a distinct component rather than a
// new prop bolted onto the existing one.
export default function TypedConfirmDialog({

    open,
    title,
    message,
    resourceName,
    confirmLabel = "Delete",
    loading = false,
    onConfirm,
    onCancel

}) {

    const [typed, setTyped] = useState("");

    useEffect(() => {

        if (open) {
            setTyped("");
        }

    }, [open]);

    useEffect(() => {

        if (!open) return;

        function handleKeyDown(e) {
            if (e.key === "Escape") onCancel();
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);

    }, [open, onCancel]);

    if (!open) {
        return null;
    }

    const matches = typed.length > 0 && typed === resourceName;

    return (

        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >

            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="typed-confirm-title">

                <h2 id="typed-confirm-title">{title}</h2>

                <p>{message}</p>

                <div className="form-group">

                    <label>
                        Type <strong>{resourceName}</strong> to confirm.
                    </label>

                    <input
                        type="text"
                        className="form-control"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoFocus
                        autoComplete="off"
                    />

                </div>

                <div className="button-row">

                    <button
                        type="button"
                        className="btn btn-danger"
                        disabled={!matches || loading}
                        onClick={onConfirm}
                    >
                        {loading ? "Working..." : confirmLabel}
                    </button>

                    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
                        Cancel
                    </button>

                </div>

            </div>

        </div>

    );

}
