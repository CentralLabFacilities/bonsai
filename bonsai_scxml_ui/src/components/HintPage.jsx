import { useEffect } from "react";
import { FiX } from "react-icons/fi";
import addSkillGif from "../assets/help/add-skill.gif";
import transitionGif from "../assets/help/transition.gif";
import containersGif from "../assets/help/containers.gif";
import subSmFocusGif from "../assets/help/subsm-focus.gif";
import boundaryExitsGif from "../assets/help/boundary-exits.gif";

const HINTS = [
    {
        title: "Add skills",
        media: addSkillGif,
        text: "Drag a skill from the library onto the canvas. Copies get a new instance ID; visual clones are inbound-only aliases.",
    },
    {
        title: "Create transitions",
        media: transitionGif,
        text: "Drag from an exit token to a target node. Select an edge to add or move control points.",
    },
    {
        title: "Compound and Parallel states",
        media: containersGif,
        text: "Drag a skill into a highlighted container. Moving it just beyond the border keeps it inside; drag farther to move it out.",
    },
    {
        title: "Boundary exit points",
        media: boundaryExitsGif,
        text: "Transitions leaving a Compound or Parallel appear as skill.event at the border. Continue drawing from that border point to keep the original event.",
    },
    {
        title: "Sub-state-machines and focus history",
        media: subSmFocusGif,
        text: "Double-click a Sub-SM to open it. Use the back/forward buttons or Alt + Left / Alt + Right to revisit focused nodes and workflows.",
    },
];

export default function HintPage({ onClose }) {
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onClose?.();
        };
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [onClose]);

    return (
        <div className="hint-page-overlay nodrag nopan" role="dialog" aria-modal="true" aria-label="Bonsai UI hints">
            <div className="hint-page">
                <div className="hint-page-header">
                    <div>
                        <h2>Bonsai UI — Quick Guide</h2>
                        <p>Short visual examples of the main editor interactions.</p>
                    </div>
                    <button type="button" className="hint-page-close" onClick={onClose} aria-label="Close hints">
                        <FiX />
                    </button>
                </div>

                <div className="hint-page-grid">
                    {HINTS.map((hint, index) => (
                        <section className="hint-card" key={hint.title}>
                            <div className="hint-card-number">{index + 1}</div>
                            <img src={hint.media} alt={`Animated guide: ${hint.title}`} className="hint-card-media" />
                            <div className="hint-card-copy">
                                <h3>{hint.title}</h3>
                                <p>{hint.text}</p>
                            </div>
                        </section>
                    ))}
                </div>

                <div className="hint-page-footer">
                    <span>Keyboard navigation:</span>
                    <kbd>Alt + Left</kbd>
                    <span>back</span>
                    <kbd>Alt + Right</kbd>
                    <span>forward</span>
                </div>
            </div>
        </div>
    );
}
