import { useEffect } from "react";

// Pointer-driven 3D tilt for any element carrying both .card and .tilt —
// opt-in per card (Dashboard's three summary tiles, not every card in the
// app; a settings form or a dense table tilting under the cursor while
// someone's trying to click a checkbox would be actively annoying, not
// delightful). Delegated on document rather than per-card refs, so any
// component can opt in just by adding the class, no wiring here.
export default function useCardTilt() {

    useEffect(() => {

        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

        function handleMove(e) {

            const card = e.target.closest?.(".card.tilt");
            if (!card) return;

            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;

            card.style.transform =
                `perspective(800px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg) translateY(-4px)`;
            card.style.borderColor = "rgba(99,102,241,.4)";

        }

        // pointerout bubbles for every child boundary crossed, not just the
        // card's own edge — the relatedTarget check is what turns that into
        // "actually left the card" (mirrors :hover's own boundary logic).
        function handleLeave(e) {

            const card = e.target.closest?.(".card.tilt");
            if (!card || card.contains(e.relatedTarget)) return;

            card.style.transform = "";
            card.style.borderColor = "";

        }

        document.addEventListener("pointermove", handleMove);
        document.addEventListener("pointerout", handleLeave);

        return () => {
            document.removeEventListener("pointermove", handleMove);
            document.removeEventListener("pointerout", handleLeave);
        };

    }, []);

}
