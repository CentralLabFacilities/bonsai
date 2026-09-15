import { useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { FiExternalLink, FiLayers } from "react-icons/fi";
import StateActionBadges from "./StateActionBadges";

function SubMachineNode({ id, data }) {
    const isInitial = data.isInitial;
    const mode = data.mode || "both";
    const showEvents = mode === "event" || mode === "both";
    const showSlots = mode === "slots" || mode === "both";

    const inheritedSlotEntries = useMemo(
        () =>
            (data.inheritedSlots || [])
                .map((slot, index) => ({
                    ...slot,
                    index,
                    handleId: slot?.access
                        ? `slot-submachine-${slot.access}-${index}`
                        : null,
                }))
                .filter(
                    (slot) =>
                        slot?.path &&
                        (slot.access === "read" || slot.access === "write")
                ),
        [data.inheritedSlots]
    );

    return (
        <div className={`costum-node submachine-node ${isInitial ? "initial-node" : ""} mode-${mode}`}>
            <StateActionBadges
                onEntry={data.onEntry}
                onExit={data.onExit}
                onEntryClick={() => data.onOpenStateActions?.(id)}
                onExitClick={() => data.onOpenStateActions?.(id)}
            />

            {showEvents && (
                <Handle type="target" position={Position.Left} className="target-handle" />
            )}

            <div className="submachine-header">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <FiLayers color="#c084fc" size={13} />
                    <span className="submachine-badge">Sub-Machine</span>
                </div>
                <button
                    className="open-sub-tab-button"
                    title="Open in tab"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (data.onOpenSubMachine) {
                            data.onOpenSubMachine(data.src, data.label);
                        }
                    }}
                >
                    <FiExternalLink size={12} />
                </button>
            </div>

            <div className="custom-node-label" style={{ fontWeight: "bold", color: "#ffffff" }}>
                {data.label}
                {data.fullSkillName && data.fullSkillName.includes("#") && (
                    <span style={{ marginLeft: "4px", opacity: 0.8, fontSize: "12px" }}>
                        #{data.fullSkillName.split("#")[1]}
                    </span>
                )}
            </div>

            {showEvents && (data.events || []).length > 0 && (
                <div className="event-list" style={{ marginTop: "6px" }}>
                    {(data.events || []).map((event) => (
                        <div className="event-row" key={event.id}>
                            <span className="event-name" style={{ color: "#e2e8f0" }}>{event.id}</span>
                            <Handle
                                id={event.id}
                                type="source"
                                position={Position.Right}
                                className="source-handle"
                            />
                        </div>
                    ))}
                </div>
            )}

            {showSlots && inheritedSlotEntries.length > 0 && (
                <>
                    {showEvents && (data.events || []).length > 0 && (
                        <div className="node-slot-divider" />
                    )}

                    <div className="node-slot-summary">
                        {inheritedSlotEntries.map((slot) => (
                            <div
                                key={`${slot.access}-${slot.index}-${slot.key || slot.path}`}
                                className={`node-slot-row node-slot-row-${slot.access}`}
                            >
                                <span
                                    className="node-slot-entry node-slot-entry-inherited"
                                    title={`${slot.access === "read" ? "Read" : "Write"} inherited slot /${String(slot.path).replace(/^\/+/, "")}`}
                                >
                                    <span className={`node-slot-access node-slot-access-${slot.access}`}>
                                        {slot.access === "read" ? "Read" : "Write"}
                                    </span>
                                    <span className="node-slot-key">
                                        {slot.key || String(slot.path).replace(/^\/+/, "")}
                                    </span>
                                </span>

                                <Handle
                                    id={slot.handleId}
                                    type="source"
                                    position={Position.Right}
                                    className={`source-handle skill-slot-handle slot-skill-${slot.access}-handle`}
                                    isConnectable={false}
                                    title={`${slot.access === "read" ? "Read" : "Write"} inherited slot`}
                                />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default SubMachineNode;
