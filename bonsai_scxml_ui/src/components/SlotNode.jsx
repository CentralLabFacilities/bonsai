import { Handle, Position } from "@xyflow/react";
import { FiDatabase } from "react-icons/fi";
import { getSlotTypeStyle } from "../utils/slotVisuals";

const normalizeSlotType = (type) =>
    String(type || "").trim().toLowerCase();

const getSlotHandleDragClass = ({
                                    drag,
                                    nodeId,
                                    handleId,
                                    access,
                                    slotType,
                                }) => {
    if (!drag?.active) return "";

    const isActiveHandle =
        drag.nodeId === nodeId && drag.handleId === handleId;

    if (isActiveHandle) {
        return "slot-handle-compatible slot-handle-active";
    }

    // Only matching access + datatype endpoints stay available.
    const isCompatible =
        drag.origin === "skill" &&
        drag.access === access &&
        Boolean(drag.slotType) &&
        normalizeSlotType(slotType) === drag.slotType;

    return isCompatible
        ? "slot-handle-compatible"
        : "slot-handle-incompatible";
};

function SlotNode({ id, data, selected = false }) {
    const displayPath = data.path || data.label || "Undefined slot";
    const normalizedPath = displayPath.startsWith("/")
        ? displayPath
        : `/${displayPath}`;
    const slotType = data.slotType || "Unknown";

    // Two different inheritance directions must stay visible independently:
    // 1) current workflow declares <inheritSlot> -> inherited from its parent
    // 2) sourced child declares <inheritSlot> -> required by that child
    // `currentMachineInherited` is the authoritative flag when present.
    // This prevents a child machine's inheritSlot metadata from being shown as
    // though the current machine itself declared <inheritSlot>.
    const isInheritedFromParent =
        data.currentMachineInherited !== undefined
            ? Boolean(data.currentMachineInherited)
            : Boolean(data.inherited || data.slotKind === "inheritSlot");
    const childRequirements = Array.isArray(data.requiredByChildren)
        ? data.requiredByChildren
        : [];
    const isRequiredByChild = Boolean(
        data.requiredByChild || childRequirements.length > 0
    );

    const requiredByLabels = [
        ...new Set(
            childRequirements
                .map((entry) => entry?.childLabel)
                .filter(Boolean)
        ),
    ];

    const childRequirementTitle =
        requiredByLabels.length > 0
            ? `Inherited by sub-state machine: ${requiredByLabels.join(", ")}`
            : "Inherited by a sub-state machine.";

    const writeHandleId = "slot-node-write";
    const readHandleId = "slot-node-read";

    return (
        <div
            className={`slot-node ${
                isInheritedFromParent ? "slot-node-inherited" : ""
            } ${
                isRequiredByChild ? "slot-node-child-required" : ""
            } ${selected ? "selected-slot-node" : ""}`}
            style={getSlotTypeStyle(slotType)}
        >
            <Handle
                id={writeHandleId}
                type="target"
                position={Position.Top}
                style={{ left: "35%" }}
                className={`source-handle slot-node-handle slot-node-write-handle ${getSlotHandleDragClass({
                    drag: data.slotConnectionDrag,
                    nodeId: id,
                    handleId: writeHandleId,
                    access: "write",
                    slotType,
                })}`}
                title="Write"
            />

            <Handle
                id={readHandleId}
                type="target"
                position={Position.Top}
                style={{ left: "65%" }}
                className={`source-handle slot-node-handle slot-node-read-handle ${getSlotHandleDragClass({
                    drag: data.slotConnectionDrag,
                    nodeId: id,
                    handleId: readHandleId,
                    access: "read",
                    slotType,
                })}`}
                title="Read"
            />

            <div className="slot-node-header">
                <div className="slot-node-kind">
                    <FiDatabase size={11} aria-hidden="true" />
                    <span>SLOT</span>
                </div>
                <div className="slot-node-type" title={slotType}>
                    {slotType}
                </div>
            </div>

            <div className="slot-node-path" title={normalizedPath}>
                {normalizedPath}
            </div>

            <div className="slot-node-access-guide" aria-hidden="true">
                <div className="slot-node-access slot-node-access-write">
                    <span className="slot-node-access-dot" />
                    <span>Write</span>
                </div>
                <div className="slot-node-access slot-node-access-read">
                    <span className="slot-node-access-dot" />
                    <span>Read</span>
                </div>
            </div>

            {isRequiredByChild && (
                <div className="slot-node-provenance">
                    <div
                        className="slot-node-provenance-badge slot-node-provenance-child"
                        title={childRequirementTitle}
                    >
                        {requiredByLabels.length === 1
                            ? `Inherited by sub-state: ${requiredByLabels[0]}`
                            : requiredByLabels.length > 1
                                ? `Inherited by ${requiredByLabels.length} sub-states`
                                : "Inherited by sub-state"}
                    </div>
                </div>
            )}
        </div>
    );
}

export default SlotNode;
