import { Handle, Position } from "@xyflow/react";

function CompoundNode({ data = {}, selected = false }) {
    const events = Array.isArray(data.events) ? data.events : [];

    const uniqueEvents = [];
    const seen = new Set();

    events.forEach((event) => {
        const id = String(event?.id || "").trim();
        if (!id || id === "compound-entry" || seen.has(id)) return;
        seen.add(id);
        uniqueEvents.push({ ...event, id });
    });

    return (
        <div
            className={`compound-frame-node ${
                data.isInitial ? "initial-compound" : ""
            } ${selected ? "selected-compound" : ""} ${
                data.isDropTarget ? "compound-drop-target" : ""
            }`}
        >
            {/*
             * Dedicated compound entry connector. This handle is SOURCE-ONLY:
             * it may only point inward to exactly one immediate child state.
             * App.jsx interprets this connection as the compound's initial state,
             * not as a normal SCXML transition.
             *
             * Keep the target-handle CSS class so compounds embedded invisibly
             * inside parallel lanes retain the existing hide behaviour.
             */}
            <Handle
                id="compound-entry"
                type="source"
                // Position.Right tells React Flow that this connection travels
                // inward. The inline left override keeps the point physically
                // on the compound's left border.
                position={Position.Right}
                className="target-handle compound-frame-entry-handle"
                style={{
                    top: "50%",
                    left: "-5px",
                    right: "auto",
                }}
                title="Drag inward to the compound's initial child state"
            />

            <div className="compound-frame-header">
                <span className="compound-frame-title">
                    {data.label || "Compound"}
                </span>
            </div>

            {uniqueEvents.length > 0 && (
                <div className="compound-frame-exits">
                    {uniqueEvents.map((event) => {
                        const label =
                            event.name ||
                            event.rawEvent ||
                            event.id;

                        return (
                            <div
                                className="compound-frame-exit-item"
                                key={event.id}
                            >
                                {/*
                                 * Restore the original compact exit geometry:
                                 * the internal helper edge arrives on the left
                                 * side of the event label, while the external
                                 * transition leaves from the right side, which
                                 * is anchored to the compound border.
                                 */}
                                <Handle
                                    id={`target-${event.id}`}
                                    type="target"
                                    position={Position.Left}
                                    className="compound-frame-exit-target-handle"
                                    style={{
                                        opacity: 0,
                                        pointerEvents: "none",
                                    }}
                                />

                                <span
                                    className="compound-frame-exit-label"
                                    title={label}
                                >
                                    {label}
                                </span>

                                <Handle
                                    id={event.id}
                                    type="source"
                                    position={Position.Right}
                                    className="compound-frame-source-handle"
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default CompoundNode;
