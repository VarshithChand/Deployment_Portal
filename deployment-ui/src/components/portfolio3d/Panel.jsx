import { motion } from "framer-motion";
import { X } from "lucide-react";

// Reusable floating 2D content panel - real DOM/text (never baked into a
// texture, per the accessibility requirement), positioned over the 3D
// scene. Every station's content renders through this, so the open/close
// animation and the "back to room" control only exist in one place.
export default function Panel({ title, onClose, children }) {

    return (

        <motion.div
            className="p3d-panel"
            role="dialog"
            aria-label={title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
        >

            <div className="p3d-panel-head">
                <h2>{title}</h2>
                <button type="button" className="p3d-panel-close" onClick={onClose} aria-label="Back to room overview">
                    <X size={16} />
                </button>
            </div>

            <div className="p3d-panel-body">
                {children}
            </div>

        </motion.div>

    );

}
