import { useEffect, useRef } from "react";

export default function ConfirmDialog({

    open,

    title,

    message,

    confirmLabel = "Confirm",

    cancelLabel = "Cancel",

    // Destructive actions (delete, remove, clear) get the red confirm
    // button and default focus on Cancel instead of Confirm — a safer
    // default than a keyboard Enter accidentally triggering something
    // irreversible.
    danger = false,

    onConfirm,

    onCancel

}){

    const cancelRef = useRef(null);
    const confirmRef = useRef(null);

    useEffect(() => {

        if (!open) return;

        (danger ? cancelRef : confirmRef).current?.focus();

        function handleKeyDown(e) {
            if (e.key === "Escape") onCancel();
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);

    }, [open, danger, onCancel]);

    if(!open)

        return null;

    return(

        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
            onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        >

            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">

                <h2 id="confirm-dialog-title">

                    {title}

                </h2>

                <p>

                    {message}

                </p>

                <div>

                    <button
                        ref={confirmRef}
                        className={`btn ${danger ? "btn-danger" : "btn-success"}`}
                        onClick={onConfirm}
                    >

                        {confirmLabel}

                    </button>

                    <button
                        ref={cancelRef}
                        className="btn btn-secondary"
                        onClick={onCancel}
                    >

                        {cancelLabel}

                    </button>

                </div>

            </div>

        </div>

    );

}
