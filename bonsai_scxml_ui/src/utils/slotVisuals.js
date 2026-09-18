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
