import { motion } from "framer-motion";
import { X } from "lucide-react";

// Reusable floating 2D content panel - real DOM/text (never baked into a
// texture, so it stays screen-reader accessible), positioned over the 3D
// scene.
export default function Panel({ title, onClose, children }) {

    return (

        <motion.div
            className="proom-panel"
            role="dialog"
            aria-label={title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
        >

            <div className="proom-panel-head">
                <h2>{title}</h2>
                <button type="button" className="proom-panel-close" onClick={onClose} aria-label="Back to room overview">
                    <X size={16} />
                </button>
            </div>

            <div className="proom-panel-body">
                {children}
            </div>

        </motion.div>

    );

}
