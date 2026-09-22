import { Handle, Position } from "@xyflow/react";

const TYPE_LABELS = {
    submachine: "SUB-SM",
    compound: "COMPOUND",
    parallel: "PARALLEL",
};

export default function StateCloneNode({ data = {}, selected = false }) {
    const sourceType = String(data.sourceNodeType || "state");
    const typeLabel = TYPE_LABELS[sourceType] || "STATE";

    return (
        <div
            className={`state-clone-node state-clone-${sourceType} ${
                selected ? "selected-node" : ""
            }`}
        >
            <Handle
                id="transition-target"
                type="target"
                position={Position.Left}
                className="target-handle"
                isConnectableStart={false}
                isConnectableEnd={true}
            />

            <div className="state-clone-header">
                <span className="state-clone-type">{typeLabel}</span>
                <span className="state-clone-badge">CLONE</span>
            </div>

            <div className="state-clone-label">
                {data.label || data.fullSkillName || "State"}
            </div>
        </div>
    );
}
