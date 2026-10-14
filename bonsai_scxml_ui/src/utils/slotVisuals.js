const SLOT_TYPE_VISUALS = Object.freeze({
    string: {
        color: "#38bdf8",
        soft: "rgba(56, 189, 248, 0.15)",
        text: "#bae6fd",
    },
    boolean: {
        color: "#a855f7",
        soft: "rgba(168, 85, 247, 0.15)",
        text: "#e9d5ff",
    },
    integer: {
        color: "#14b8a6",
        soft: "rgba(20, 184, 166, 0.15)",
        text: "#99f6e4",
    },
    double: {
        color: "#f59e0b",
        soft: "rgba(245, 158, 11, 0.15)",
        text: "#fde68a",
    },
    pose: {
        color: "#22c55e",
        soft: "rgba(34, 197, 94, 0.15)",
        text: "#bbf7d0",
    },
    poseList: {
        color: "#10b981",
        soft: "rgba(16, 185, 129, 0.15)",
        text: "#a7f3d0",
    },
    objectShape: {
        color: "#f43f5e",
        soft: "rgba(244, 63, 94, 0.15)",
        text: "#fecdd3",
    },
    other: {
        color: "#64748b",
        soft: "rgba(100, 116, 139, 0.16)",
        text: "#cbd5e1",
    },
});

export function getStateSlotEntries(data = {}, nodeType = "custom") {
    const isSubMachine = nodeType === "submachine";
    const regularSlots = ["read", "write"].flatMap((access) =>
        (data[access === "read" ? "inSlots" : "outSlots"] || []).map((slot, index) => ({
            key: slot?.key,
            path: slot?.path,
            type: slot?.type,
            access,
            index,
            handleId: `slot-skill-${access}-${index}`,
            inherited: isSubMachine
                ? Boolean(slot?.inherited)
                : Boolean(slot?.inherited && (String(slot.path || "").trim() || String(slot.inherited?.xpath || "").trim())),
        }))
    );
    const inheritedSlots = isSubMachine ? (data.inheritedSlots || [])
        .map((slot, index) => ({
            key: slot?.key,
            path: slot?.path,
            type: slot?.type,
            access: slot?.access,
            index,
            handleId: `slot-submachine-${slot?.access}-${index}`,
            inherited: true,
        }))
        .filter((slot) => slot.access === "read" || slot.access === "write") : [];

    // Keep source-array indices: connections refer to these exact handle IDs.
    return [...regularSlots, ...inheritedSlots].filter((slot) =>
        String(slot.key || (isSubMachine && slot.path) || "").trim()
    );
}

// This is presentation feedback, not the authoritative validation. The actual
// connection is still checked by resolveSlotConnection / validateSlotConnection.
// Keep these basic checks aligned with that validation so invalid destinations
// are visible and explain *why* they cannot be used during a drag.
export function getSlotHandleDragFeedback({ drag, nodeId, handleId, access, origin, slotType }) {
    if (!drag?.active) return { status: "idle", className: "", reason: "" };
    if (drag.nodeId === nodeId && drag.handleId === handleId) {
        return { status: "active", className: "slot-handle-compatible slot-handle-active", reason: "" };
    }

    const fail = (reason) => ({
        status: "incompatible",
        className: "slot-handle-incompatible",
        reason,
    });
    const dragIsSlot = drag.origin === "slot";
    const destinationIsSlot = origin === "slot";
    if (dragIsSlot === destinationIsSlot) {
        return fail(dragIsSlot
            ? "Connect a slot node to a skill's requested slot, not to another slot node."
            : "Connect a skill's requested slot to a slot node, not directly to another skill.");
    }
    if (drag.access !== access) {
        return fail(`Access mismatch: ${drag.access === "read" ? "Read" : "Write"} cannot connect to ${access === "read" ? "Read" : "Write"}. Connect Read to Read or Write to Write.`);
    }

    const fromType = String(drag.slotType || "").trim();
    const toType = String(slotType || "").trim();
    if (!fromType || fromType.toLowerCase() === "unknown") {
        return fail("The starting slot has no known data type. Check its skill definition.");
    }
    if (!toType || toType.toLowerCase() === "unknown") {
        return fail("The destination slot has no known data type. Check its slot declaration.");
    }
    if (fromType.toLowerCase() !== toType.toLowerCase()) {
        return fail(`Type mismatch: ${fromType} cannot connect to ${toType}.`);
    }
    return { status: "compatible", className: "slot-handle-compatible", reason: "" };
}

export function getSlotHandleDragClass(options) {
    return getSlotHandleDragFeedback(options).className;
}

// Keep type labels compact in the canvas; the unmodified type remains available
// in a native tooltip. A qualified Java name uses its simple class name.
export const MAX_SLOT_TYPE_BADGE_CHARS = 10;

export function getSlotTypeBadgeLabel(type) {
    const full = String(type || "").trim();
    if (!full) return "Unknown";
    const readable = !/[<>[\]]/.test(full) && full.includes(".")
        ? full.slice(full.lastIndexOf(".") + 1)
        : full;
    return readable.length > MAX_SLOT_TYPE_BADGE_CHARS
        ? `${readable.slice(0, MAX_SLOT_TYPE_BADGE_CHARS - 1)}…`
        : readable;
}

export function getSlotTypeVisual(type) {
    const normalized = String(type || "").trim().toLowerCase();

    // Check the more specific compound types before their base type.
    if (normalized.includes("objectshape")) {
        return SLOT_TYPE_VISUALS.objectShape;
    }

    if (normalized.includes("poselist")) {
        return SLOT_TYPE_VISUALS.poseList;
    }

    if (normalized.includes("boolean") || normalized.includes("bool")) {
        return SLOT_TYPE_VISUALS.boolean;
    }

    if (normalized.includes("integer") || normalized.includes("intslot")) {
        return SLOT_TYPE_VISUALS.integer;
    }

    if (
        normalized.includes("double") ||
        normalized.includes("float") ||
        normalized.includes("decimal")
    ) {
        return SLOT_TYPE_VISUALS.double;
    }

    if (normalized.includes("string") || normalized.includes("text")) {
        return SLOT_TYPE_VISUALS.string;
    }

    if (normalized.includes("pose")) {
        return SLOT_TYPE_VISUALS.pose;
    }

    return SLOT_TYPE_VISUALS.other;
}

export function getSlotTypeStyle(type) {
    const visual = getSlotTypeVisual(type);

    return {
        "--slot-type-color": visual.color,
        "--slot-type-soft": visual.soft,
        "--slot-type-text": visual.text,
    };
}
