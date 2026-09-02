import { Handle, Position } from "@xyflow/react";
import { FiExternalLink, FiLayers } from "react-icons/fi";

function SubMachineNode({ data }) {
    const isInitial = data.isInitial;

    return (
        <div className={`costum-node submachine-node ${isInitial ? "initial-node" : ""}`}>
            <Handle type="target" position={Position.Left} className="target-handle" />

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
            </div>

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
        </div>
    );
}

export default SubMachineNode;