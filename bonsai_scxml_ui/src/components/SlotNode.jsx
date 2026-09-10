import { Handle, Position } from "@xyflow/react";

function SlotNode({ data }) {
    const displayPath = data.path || data.label || "Undefined slot";
    const slotType = data.slotType || "Unknown";
    const isInherited = data.inherited || data.slotKind === "inheritSlot";

    return (
        <div className={`slot-node ${isInherited ? "slot-node-inherited" : ""}`}>
            <Handle
                id="write-target"
                type="target"
                position={Position.Left}
                className="slot-write-handle"
            />

            <div className="slot-node-label">
                {displayPath.startsWith("/") ? displayPath : `/${displayPath}`}
            </div>

            <div className="slot-node-type">
                {slotType}
            </div>

            {isInherited && (
                            <div className="slot-node-inherited-label">
                                inherited
                            </div>
            )}

            <Handle
                id="read-source"
                type="source"
                position={Position.Right}
                className="slot-read-handle"
            />
        </div>
    );
}

export default SlotNode;