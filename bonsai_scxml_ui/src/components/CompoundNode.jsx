import { Handle, NodeResizer, Position } from "@xyflow/react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";

function CompoundNode({ id, data = {}, selected = false }) {
    const events = Array.isArray(data.events) ? data.events : [];
    const isCollapsed = Boolean(data.isCollapsed);
    const isParallelLaneWrapper = Boolean(data.autoParallelLaneCompound);

    const uniqueEvents = [];
    const seen = new Set();

    events.forEach((event) => {
        const id = String(event?.id || "").trim();
        // Compound events without a target are retained by the transition
        // editor as reusable event choices after their last transition is
        // deleted. They are not real visual exits, so do not render a border
        // label/source handle for them. Boundary exits and real compound-level
        // transitions always carry a target.
        if (
            !id ||
            id === "compound-entry" ||
            !event?.target ||
            seen.has(id)
        ) {
            return;
        }
        seen.add(id);
        uniqueEvents.push({ ...event, id });
    });

    return (
        <div
            className={`compound-frame-node ${
                isParallelLaneWrapper ? "parallel-lane-auto-compound" : ""
            } ${
                data.isInitial ? "initial-compound" : ""
            } ${selected ? "selected-compound" : ""} ${
                data.isDropTarget ? "compound-drop-target" : ""
            } ${isCollapsed ? "collapsed-container" : ""}`}
        >
            <NodeResizer
                isVisible={selected && !isCollapsed && !isParallelLaneWrapper}
                minWidth={220}
                minHeight={120}
                color="#475569"
                handleStyle={{ pointerEvents: "all" }}
                lineStyle={{ pointerEvents: "all" }}
            />

            {/*
             * The only user-connectable handle on the left side of a compound
             * is its normal incoming transition target. It can receive edges,
             * but it can never start one.
             */}
            <Handle
                id="transition-target"
                type="target"
                position={Position.Left}
                className="target-handle"
                isConnectableStart={false}
                isConnectableEnd={true}
            />

            {/*
             * Invisible display anchor for the compound's initial-child arrow.
             * Existing helper edges can still originate at the left boundary,
             * but users cannot drag a connection from this anchor.
             */}
            <Handle
                id="compound-entry"
                type="source"
                position={Position.Right}
                className="compound-frame-entry-handle"
                style={{
                    top: "50%",
                    left: "-5px",
                    right: "auto",
                    opacity: 0,
                    pointerEvents: "none",
                }}
                isConnectableStart={false}
                isConnectableEnd={false}
            />

            <div className="compound-frame-header">
                <button
                    type="button"
                    className="container-collapse-btn nodrag nopan"
                    title={isCollapsed ? "Expand compound" : "Collapse compound"}
                    aria-label={isCollapsed ? "Expand compound" : "Collapse compound"}
                    onClick={(event) => {
                        event.stopPropagation();
                        data.onToggleCollapse?.(id);
                    }}
                >
                    {isCollapsed ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
                </button>
                {data.isInitial && !isParallelLaneWrapper && (
                    <span className="initial-state-badge initial-state-badge-inline">INITIAL</span>
                )}
                <span className="compound-frame-badge">COMPOUND</span>
                <strong className="compound-frame-title">
                    {data.label || "Compound"}
                </strong>
            </div>

            {!isCollapsed && uniqueEvents.length > 0 && (
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
                                    isConnectableStart={false}
                                    isConnectableEnd={false}
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
                                    isConnectableStart={true}
                                    isConnectableEnd={false}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
            {isCollapsed && uniqueEvents.map((event) => (
                <Handle
                    key={`collapsed-source-${event.id}`}
                    id={event.id}
                    type="source"
                    position={Position.Right}
                    className="compound-frame-source-handle compound-collapsed-source-handle"
                    isConnectableStart={true}
                    isConnectableEnd={false}
                />
            ))}
        </div>
    );
}

export default CompoundNode;
