import { Handle, Position } from "@xyflow/react";
import { FiLink2 } from "react-icons/fi";

const TYPE_LABELS = {
    submachine: "SUB-SM",
    compound: "COMPOUND",
    parallel: "PARALLEL",
};

export default function StateCloneNode({ id, data = {}, selected = false }) {
    const referenceId = String(data.editorInstanceId || id || "").trim();
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
                <span className="state-clone-reference-mark" aria-hidden="true">
                    <FiLink2 />
                </span>
                <span className="state-clone-type">{typeLabel}</span>
                <span
                    className="state-clone-badge"
                    title={referenceId ? `Reference ID: ${referenceId}` : "Reference"}
                >
                    {referenceId ? `REF · ${referenceId}` : "REF"}
                </span>
            </div>

            <div className="state-clone-label">
                {data.label || data.fullSkillName || "State"}
            </div>
        </div>
    );
}
