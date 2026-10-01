
export const withSmartTransitionRouting = (transitionEdges) =>
    transitionEdges.map((edge) => ({
        ...edge,
        type: "smartTransition",
    }));

export const TRANSITION_HIGHLIGHT_COLORS = {
    success: "#22c55e",
    error: "#f59e0b",
    fatal: "#ef4444",
    other: "#38bdf8",
};

// Slot connections intentionally use a separate palette from transition
// semantics so Read/Write stay visually distinct from success/error/fatal.
export const SLOT_CONNECTION_COLORS = {
    read: "#6366f1",
    write: "#d946ef",
};

export const EDITOR_SHORTCUTS = [
    { keys: "Ctrl + F", action: "Find skill or slot" },
    { keys: "Ctrl + S", action: "Save workflow" },
    { keys: "Ctrl + Shift + S", action: "Save workflow as…" },
    { keys: "Ctrl + Tab", action: "Next workflow tab" },
    { keys: "Ctrl + Shift + Tab", action: "Previous workflow tab" },
    { keys: "Alt + Left / ←", action: "Previous focus" },
    { keys: "Alt + Right / →", action: "Next focus" },
    { keys: "Ctrl + Z", action: "Undo" },
    { keys: "Ctrl + Y", action: "Redo" },
    { keys: "Ctrl + C", action: "Copy selected nodes" },
    { keys: "Ctrl + V", action: "Paste copied nodes" },
    { keys: "Ctrl + D", action: "Duplicate selected nodes" },
    { keys: "Ctrl + A", action: "Select all nodes" },
    { keys: "Ctrl + N", action: "New workflow tab" },
    { keys: "Ctrl + W", action: "Close workflow tab" },
    { keys: "Esc", action: "Close overlay / clear selection" },
    { keys: "F", action: "Fit workflow to view" },
    { keys: "Shift + F", action: "Fit selection to view" },
    { keys: "Ctrl + 1", action: "Event mode" },
    { keys: "Ctrl + 2", action: "Slot mode" },
    { keys: "Ctrl + 3", action: "Overview mode" },
];

export const FIND_SHORTCUTS = [
    { keys: "↑ / ↓", action: "Move through search results" },
    { keys: "Enter", action: "Focus selected result" },
    { keys: "Esc", action: "Close search" },
];

export const getCollapsedTransitionSource = (edge, nodeById) => {
    if (!edge || !nodeById) return null;

    let current = nodeById.get(edge.source);
    let collapsedAncestor = null;
    const visited = new Set();

    while (current?.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = nodeById.get(current.parentId);
        if (!parent) break;

        if (
            (parent.type === "compound" || parent.type === "parallel") &&
            parent.data?.isCollapsed
        ) {
            // When collapsed containers are nested, only the outermost one is
            // visible and can own the temporary transition handle.
            collapsedAncestor = parent;
        }

        current = parent;
    }

    if (!collapsedAncestor) return null;

    const logicalSourceId =
        edge.data?.boundaryOriginalSource ||
        edge.data?.compoundOriginalSource ||
        edge.data?.parallelOriginalSource ||
        edge.source;
    const logicalHandle = String(
        edge.data?.boundaryOriginalSourceHandle ||
        edge.data?.compoundOriginalSourceHandle ||
        edge.data?.parallelOriginalSourceHandle ||
        edge.sourceHandle ||
        edge.label ||
        "success"
    );
    const visualSourceNode = nodeById.get(edge.source);
    const existingBoundaryHandle =
        visualSourceNode?.type === "parallelLane" ||
        visualSourceNode?.type === "compound"
            ? String(edge.sourceHandle || "").trim()
            : "";
    const sourceHandle =
        existingBoundaryHandle || `${logicalSourceId}-${logicalHandle}`;

    return {
        nodeId: collapsedAncestor.id,
        sourceHandle,
        logicalSourceId,
        logicalHandle,
        label: String(edge.label || logicalHandle || sourceHandle),
    };
};

export const getTransitionHighlightColor = (sourceHandle) => {
    const parts = String(sourceHandle || "")
        .trim()
        .toLowerCase()
        .split(".")
        .filter(Boolean);

    const mainType = parts.find((part) =>
        part === "success" || part === "error" || part === "fatal"
    );

    return TRANSITION_HIGHLIGHT_COLORS[mainType || "other"];
};

export const TRANSITION_HIGHLIGHT_COLOR_VALUES = new Set(
    Object.values(TRANSITION_HIGHLIGHT_COLORS)
);

export const clearTransientTransitionHighlight = (edge) => {
    const hadTransientStroke = TRANSITION_HIGHLIGHT_COLOR_VALUES.has(
        edge.style?.stroke
    );
    const hadTransientMarker = Boolean(
        edge.markerEnd &&
        TRANSITION_HIGHLIGHT_COLOR_VALUES.has(edge.markerEnd.color)
    );

    // Preserve object identity for the common case. Recreating every edge on
    // every hover defeats React Flow memoization even when nothing about that
    // edge changed.
    if (!hadTransientStroke && !hadTransientMarker) {
        return edge;
    }

    const style = { ...(edge.style || {}) };
    const markerEnd = edge.markerEnd
        ? { ...edge.markerEnd }
        : edge.markerEnd;

    if (hadTransientStroke) {
        delete style.stroke;
    }

    if (hadTransientMarker) {
        delete markerEnd.color;
    }

    return {
        ...edge,
        animated: false,
        style,
        markerEnd,
    };
};

export const normalizeSlotPath = (path) =>
    String(path || "").trim().replace(/^\/+/, "");

export const normalizeSlotType = (type) =>
    String(type || "").trim().toLowerCase();


export const collectInheritedSlotUsages = (parsedNodes, declaredSlots = []) => {
    const usages = [];
    const seen = new Set();

    const addUsage = (slot, access, node) => {
        const path = normalizeSlotPath(slot?.path);
        if (!path) return;

        const key = [access || "inherit", path, slot?.key || "", slot?.type || "Unknown"].join("|");
        if (seen.has(key)) return;
        seen.add(key);

        usages.push({
            key: slot?.key || "",
            state:
                slot?.inherited?.state ||
                node?.data?.fullSkillName ||
                node?.data?.label ||
                "",
            path,
            access,
            type: slot?.type || "Unknown",
        });
    };

    (parsedNodes || []).forEach((node) => {
        (node.data?.inSlots || []).forEach((slot) => {
            if (slot?.inherited) addUsage(slot, "read", node);
        });

        (node.data?.outSlots || []).forEach((slot) => {
            if (slot?.inherited) addUsage(slot, "write", node);
        });
    });

    // Keep an inherited slot visible even when its concrete read/write usage
    // cannot be resolved (for example because skill metadata is unavailable).
    (declaredSlots || []).forEach((slot) => {
        const path = normalizeSlotPath(slot?.path);
        if (!path) return;

        const alreadyRepresented = usages.some(
            (usage) => usage.path === path
        );
        if (alreadyRepresented) return;

        usages.push({
            ...slot,
            path,
            access: null,
            type: "Unknown",
        });
    });

    return usages;
};

export const isSlotEdge = (edge) =>
    edge?.data?.edgeKind === "slot" ||
    String(edge?.id || "").startsWith("edge-read-") ||
    String(edge?.id || "").startsWith("edge-write-");

export const getSlotPathFromNode = (slotNode) =>
    normalizeSlotPath(slotNode?.data?.path || slotNode?.data?.label || "");

export const parseSlotConnectionHandle = (handleId) => {
    const value = String(handleId || "");

    const skillRead = value.match(/^slot-skill-read-(\d+)$/);
    if (skillRead) {
        return {
            origin: "skill",
            access: "read",
            slotIndex: Number(skillRead[1]),
        };
    }

    const skillWrite = value.match(/^slot-skill-write-(\d+)$/);
    if (skillWrite) {
        return {
            origin: "skill",
            access: "write",
            slotIndex: Number(skillWrite[1]),
        };
    }

    if (value === "slot-node-read") {
        return { origin: "slot", access: "read", slotIndex: null };
    }

    if (value === "slot-node-write") {
        return { origin: "slot", access: "write", slotIndex: null };
    }

    return null;
};
