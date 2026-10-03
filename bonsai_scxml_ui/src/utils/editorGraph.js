export const createEditorNodeIndex = (nodes = []) => {
    const nodeList = Array.isArray(nodes) ? nodes : [];
    const byId = new Map();
    const childrenByParent = new Map();
    let hasDuplicateIds = false;

    nodeList.forEach((node) => {
        if (!node?.id) return;
        if (byId.has(node.id)) hasDuplicateIds = true;
        byId.set(node.id, node);

        if (node.parentId) {
            if (!childrenByParent.has(node.parentId)) {
                childrenByParent.set(node.parentId, []);
            }
            childrenByParent.get(node.parentId).push(node);
        }
    });

    const ancestorIdsByNode = new Map();
    const absolutePositionByNode = new Map();
    const nestingDepthByNode = new Map();

    const resolveNode = (nodeOrId) =>
        typeof nodeOrId === "string" ? byId.get(nodeOrId) : nodeOrId;

    const getChildren = (parentId) =>
        childrenByParent.get(parentId) || [];

    const getAncestorIds = (nodeOrId) => {
        const node = resolveNode(nodeOrId);
        if (!node?.id) return new Set();

        const cached = ancestorIdsByNode.get(node.id);
        if (cached) return cached;

        const ancestorIds = new Set();
        const visited = new Set();
        let parentId = node.parentId;

        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            ancestorIds.add(parentId);
            const parent = byId.get(parentId);
            if (!parent) break;
            parentId = parent.parentId;
        }

        ancestorIdsByNode.set(node.id, ancestorIds);
        return ancestorIds;
    };

    const findAncestor = (nodeOrId, predicate) => {
        const node = resolveNode(nodeOrId);
        if (!node || typeof predicate !== "function") return null;

        const visited = new Set();
        let parentId = node.parentId;

        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            const parent = byId.get(parentId);
            if (!parent) break;
            if (predicate(parent)) return parent;
            parentId = parent.parentId;
        }

        return null;
    };

    const getNestingDepth = (nodeOrId) => {
        const node = resolveNode(nodeOrId);
        if (!node) return 0;
        if (nestingDepthByNode.has(node)) return nestingDepthByNode.get(node);

        let depth = 0;
        let parentId = node.parentId;
        const visited = new Set();

        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            const parent = byId.get(parentId);
            if (!parent) break;
            depth += 1;
            parentId = parent.parentId;
        }

        nestingDepthByNode.set(node, depth);
        return depth;
    };

    const getAbsolutePosition = (nodeOrId) => {
        const node = resolveNode(nodeOrId);
        if (!node?.id) return { x: 0, y: 0 };

        const cached = absolutePositionByNode.get(node.id);
        if (cached) return cached;

        let x = Number(node.position?.x || 0);
        let y = Number(node.position?.y || 0);
        const visited = new Set();
        let parentId = node.parentId;

        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            const parent = byId.get(parentId);
            if (!parent) break;
            x += Number(parent.position?.x || 0);
            y += Number(parent.position?.y || 0);
            parentId = parent.parentId;
        }

        const absolute = { x, y };
        absolutePositionByNode.set(node.id, absolute);
        return absolute;
    };

    return {
        nodes: nodeList,
        byId,
        hasDuplicateIds,
        getChildren,
        getAncestorIds,
        findAncestor,
        getNestingDepth,
        getAbsolutePosition,
    };
};

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
    const usageByKey = new Map();

    const addUsage = (slot, access, node, subMachinePath = []) => {
        const path = normalizeSlotPath(slot?.inherited?.xpath || slot?.path);
        if (!path) return;

        const nestedPath = Array.isArray(slot?.subMachinePath)
            ? slot.subMachinePath.filter(Boolean)
            : [];
        const hierarchyPath = [...subMachinePath, ...nestedPath];
        const resolvedAccess = access || slot?.access || null;
        const usageKey = [
            resolvedAccess || "inherit",
            path,
            slot?.key || "",
            slot?.type || "Unknown",
            hierarchyPath.join("/"),
        ].join("|");

        let usage = usageByKey.get(usageKey);
        if (!usage) {
            usage = {
                key: slot?.key || "",
                state: slot?.inherited?.state || slot?.state || "",
                path,
                access: resolvedAccess,
                type: slot?.type || "Unknown",
                description: slot?.description || "",
                subMachinePath: hierarchyPath,
                skillAccesses: [],
            };
            usageByKey.set(usageKey, usage);
            usages.push(usage);
        }

        const concreteSkillAccesses = Array.isArray(slot?.skillAccesses)
            ? slot.skillAccesses
            : [];
        const nodeSkillNodeId = String(node?.id || slot?.skillNodeId || "").trim();
        const nodeSkillName = String(
            node?.data?.fullSkillName ||
            node?.data?.label ||
            slot?.skillName ||
            nodeSkillNodeId ||
            ""
        ).trim();

        const candidates = concreteSkillAccesses.length > 0
            ? concreteSkillAccesses
            : nodeSkillName
                ? [{
                    skillNodeId: nodeSkillNodeId || null,
                    skillName: nodeSkillName,
                    description: slot?.description || "",
                }]
                : [];

        candidates.forEach((candidate) => {
            const skillNodeId = String(candidate?.skillNodeId || "").trim();
            const skillName = String(candidate?.skillName || "").trim();
            if (!skillName) return;

            const duplicate = usage.skillAccesses.some(
                (entry) =>
                    entry.skillNodeId === (skillNodeId || null) &&
                    entry.skillName === skillName
            );
            if (duplicate) return;

            usage.skillAccesses.push({
                skillNodeId: skillNodeId || null,
                skillName,
                description:
                    candidate?.description || slot?.description || "",
            });
            if (!usage.state) usage.state = skillName;
        });
    };

    (parsedNodes || []).forEach((node) => {
        (node.data?.inSlots || []).forEach((slot) => {
            if (slot?.inherited) addUsage(slot, "read", node);
        });

        (node.data?.outSlots || []).forEach((slot) => {
            if (slot?.inherited) addUsage(slot, "write", node);
        });

        // Hydrated nested Sub-SMs already expose their descendant consumers.
        // Bubble those up without creating one visual inherited-slot edge per
        // skill: concrete consumers live in skillAccesses on the usage.
        if (node.type === "submachine") {
            const subMachineLabel =
                node.data?.label ||
                node.data?.fullSkillName ||
                node.data?.src ||
                "Sub-state machine";

            (node.data?.inheritedSlots || []).forEach((slot) => {
                addUsage(slot, slot?.access || null, null, [subMachineLabel]);
            });
        }
    });

    // Keep an inherited slot visible even when its concrete read/write usage
    // cannot be resolved (for example because skill metadata is unavailable).
    (declaredSlots || []).forEach((slot) => {
        const path = normalizeSlotPath(slot?.xpath || slot?.path);
        if (!path) return;

        const alreadyRepresented = usages.some(
            (usage) => usage.path === path
        );
        if (alreadyRepresented) return;

        usages.push({
            ...slot,
            path,
            access: null,
            type: slot?.type || "Unknown",
            subMachinePath: [],
            skillAccesses: [],
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
