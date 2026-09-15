import { Handle, Position } from "@xyflow/react";

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

function SlotNode({ id, data }) {
    const displayPath = data.path || data.label || "Undefined slot";
    const slotType = data.slotType || "Unknown";

    // Two different inheritance directions must stay visible independently:
    // 1) current workflow declares <inheritSlot> -> inherited from its parent
    // 2) sourced child declares <inheritSlot> -> required by that child
    const isInheritedFromParent = Boolean(
        data.inherited || data.slotKind === "inheritSlot"
    );
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

    const inheritedTitle = data.inheritedFrom
        ? `Inherited from parent (${data.inheritedFrom})`
        : "Inherited from parent";

    const childRequirementTitle =
        requiredByLabels.length > 0
            ? `Required by child: ${requiredByLabels.join(", ")}`
            : "Required by sourced child state machine";

    const writeHandleId = "slot-node-write";
    const readHandleId = "slot-node-read";

    return (
        <div
            className={`slot-node ${
                isInheritedFromParent ? "slot-node-inherited" : ""
            } ${
                isRequiredByChild ? "slot-node-child-required" : ""
            }`}
        >
            {/* Write endpoint: both slot endpoints are on the lower edge. */}
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

            <div className="slot-node-label">
                {displayPath.startsWith("/")
                    ? displayPath
                    : `/${displayPath}`}
            </div>

            <div className="slot-node-type">{slotType}</div>

            {(isInheritedFromParent || isRequiredByChild) && (
                <div className="slot-node-provenance">
                    {isInheritedFromParent && (
                        <div
                            className="slot-node-provenance-badge slot-node-provenance-parent"
                            title={inheritedTitle}
                        >
                            Inherited from parent
                        </div>
                    )}

                    {isRequiredByChild && (
                        <div
                            className="slot-node-provenance-badge slot-node-provenance-child"
                            title={childRequirementTitle}
                        >
                            {requiredByLabels.length === 1
                                ? `Required by ${requiredByLabels[0]}`
                                : requiredByLabels.length > 1
                                    ? `Required by ${requiredByLabels.length} children`
                                    : "Required by child"}
                        </div>
                    )}
                </div>
            )}

            {/* Read endpoint: both slot endpoints are on the lower edge. */}
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
        </div>
    );
}

export default SlotNode;
