import { Handle, Position } from "@xyflow/react";

function SlotNode({ data }) {
    const displayPath = data.path || data.label || "Undefined slot";

    return (
        <div className="slot-node">
            <Handle
                id="write-target"
                type="target"
                position={Position.Left}
                className="slot-write-handle"
            />

            <div className="slot-node-label">
                {displayPath.startsWith("/") ? displayPath : `/${displayPath}`}
            </div>

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