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

// Aliases may disappear without deleting the declaration. Canonical inherited
// slots and fixed child requirements must keep their path in the parent.
export const isSlotDeletionProtected = (node, model = {}) => {
    if (node?.type !== "slot" || (node.data?.isSlotClone && node.data?.cloneOfNodeId)) return false;
    const data = node.data || {};
    if (data.currentMachineInherited || data.inherited || data.slotKind === "inheritSlot" ||
        data.requiredByChild || data.requiredByChildren?.length) return true;
    const path = getSlotPathFromNode(node);
    if (!path) return false;
    return (model.manualSlots || []).some((slot) =>
        normalizeSlotPath(slot?.inherited?.xpath || slot?.path) === path &&
        (slot?.slotKind === "inheritSlot" || slot?.inherited)) ||
        (model.nodes || []).some((child) => child.type === "submachine" && child.data?.src &&
            !child.data?.isStateClone && !child.data?.isSkillClone &&
            (child.data?.inheritedSlots || []).some((slot) =>
                normalizeSlotPath(slot?.path || slot?.inherited?.xpath) === path));
};

export const parseSlotConnectionHandle = (handleId) => {
    const value = String(handleId || "");

    const inherited = value.match(/^slot-submachine-(read|write)-(\d+)$/);
    if (inherited) {
        return {
            origin: "submachine",
            access: inherited[1],
            inheritIndex: Number(inherited[2]),
        };
    }

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

export const isKnownSlotType = (type) => {
    const normalized = normalizeSlotType(type);
    return Boolean(normalized && normalized !== "unknown");
};

export const getSlotConnectionEndpoint = (nodeId, handleId, model) => {
    const handle = parseSlotConnectionHandle(handleId);
    if (!handle) return null;
    const node = (handle.origin === "slot" ? model.slotNodes : model.nodes)
        ?.find((candidate) => candidate.id === nodeId);
    if (!node || node.data?.isSkillClone || node.data?.isStateClone) return null;
    let slot;
    if (handle.origin === "slot") {
        if (node.type !== "slot" || !getSlotPathFromNode(node)) return null;
        const canonicalId = node.data?.cloneOfNodeId || node.id;
        const canonical = model.slotNodes?.find((candidate) => candidate.id === canonicalId);
        if (!canonical || getSlotPathFromNode(canonical) !== getSlotPathFromNode(node)) return null;
        slot = { type: canonical.data?.slotType, path: canonical.data?.path };
    } else if (handle.origin === "submachine") {
        if (node.type !== "submachine" || !node.data?.src) return null;
        slot = node.data?.inheritedSlots?.[handle.inheritIndex];
        if (slot?.access !== handle.access || !normalizeSlotPath(slot?.path)) return null;
    } else {
        if (!["custom", "submachine"].includes(node.type)) return null;
        slot = node.data?.[handle.access === "read" ? "inSlots" : "outSlots"]?.[handle.slotIndex];
    }
    if (!slot || !isKnownSlotType(slot.type)) return null;
    return { ...handle, node, slot, nodeId, handleId, slotType: normalizeSlotType(slot.type) };
};

export const resolveSlotConnection = (connection, model) => {
    const source = getSlotConnectionEndpoint(connection?.source, connection?.sourceHandle, model);
    const target = getSlotConnectionEndpoint(connection?.target, connection?.targetHandle, model);
    if (!source || !target || source.access !== target.access || source.slotType !== target.slotType
        || (source.origin === "slot") === (target.origin === "slot")) return null;
    return source.origin === "slot"
        ? { consumer: target, slot: source }
        : { consumer: source, slot: target };
};

export const getSlotEdgeEndpoints = (consumerId, slotNodeId, access, consumerHandleId) =>
    access === "read"
        ? { source: slotNodeId, target: consumerId, sourceHandle: "slot-node-read", targetHandle: consumerHandleId }
        : { source: consumerId, target: slotNodeId, sourceHandle: consumerHandleId, targetHandle: "slot-node-write" };

export const getDefaultSlotPath = (model) => {
    const paths = new Set();
    const add = (slot) => {
        for (const path of [slot?.path, slot?.inherited?.xpath]) {
            const normalized = normalizeSlotPath(path);
            if (normalized) paths.add(normalized);
        }
    };
    (model.nodes || []).forEach((node) => {
        [...(node.data?.inSlots || []), ...(node.data?.outSlots || []), ...(node.data?.inheritedSlots || [])].forEach(add);
    });
    (model.manualSlots || []).forEach(add);
    (model.slotNodes || []).forEach((node) => add(node.data));
    let index = 1;
    while (paths.has(index === 1 ? "defaultslot" : `defaultslot${index}`)) index += 1;
    return index === 1 ? "defaultslot" : `defaultslot${index}`;
};

const slotMatchesPath = (slot, path) =>
    normalizeSlotPath(slot?.path) === path || normalizeSlotPath(slot?.inherited?.xpath) === path;

// The fixed child declaration is a requirement, not a writable child binding.
// Only an unbound derived placeholder may be replaced by the renamed parent.
export const planInheritedSlotRename = (model, consumer, slotEndpoint) => {
    const oldPath = getSlotPathFromNode(slotEndpoint.node);
    const newPath = normalizeSlotPath(consumer.slot.path);
    const canonicalId = slotEndpoint.node.data?.cloneOfNodeId || slotEndpoint.node.id;
    const canonical = model.slotNodes?.find((node) => node.id === canonicalId);
    const bindings = [];
    const declarations = [];
    const coalescedDeclarations = [];
    const requirements = [];
    let error = "";
    (model.nodes || []).forEach((node) => {
        for (const [key, access] of [["inSlots", "read"], ["outSlots", "write"]]) {
            (node.data?.[key] || []).forEach((slot, index) => {
                if (oldPath !== newPath && slotMatchesPath(slot, newPath)) error = `/${newPath} already has a parent binding.`;
                if (!slotMatchesPath(slot, oldPath)) return;
                if (!isKnownSlotType(slot.type) || normalizeSlotType(slot.type) !== consumer.slotType) {
                    error = "The parent slot has incompatible binding types.";
                }
                bindings.push({ nodeId: node.id, nodeLabel: node.data?.label || node.id, key: slot.key || "", access, index, slot });
            });
        }
        (node.data?.inheritedSlots || []).forEach((slot, index) => {
            if (!slotMatchesPath(slot, oldPath) && !slotMatchesPath(slot, newPath)) return;
            requirements.push({ nodeId: node.id, src: node.data?.src || "", index, slot });
            if (normalizeSlotPath(slot.path) === oldPath && oldPath !== newPath) {
                error = "The parent slot is required at its current path by another child declaration.";
            }
            if (normalizeSlotPath(slot.path) === newPath && node.id !== consumer.nodeId && oldPath !== newPath) {
                error = `/${newPath} is already required by another child.`;
            }
            if (isKnownSlotType(slot.type) && normalizeSlotType(slot.type) !== consumer.slotType) {
                error = "Child requirements have incompatible slot types.";
            }
        });
    });
    (model.manualSlots || []).forEach((slot, index) => {
        if (oldPath !== newPath && slotMatchesPath(slot, newPath)) {
            // Only the automatic, otherwise-unbound requirement declaration may
            // be coalesced by this explicit confirmation. Real manual slots,
            // parent inheritance, bindings, aliases and other children still veto.
            if (slot.createdForChildRequirements === true && slot.slotKind === "slot" && !slot.inherited && !slot.key && !slot.state &&
                (!isKnownSlotType(slot.type) || normalizeSlotType(slot.type) === consumer.slotType)) {
                coalescedDeclarations.push({ index, id: slot.id, slot });
            } else error = `/${newPath} is already declared in the parent workflow.`;
        }
        if (!slotMatchesPath(slot, oldPath)) return;
        if (isKnownSlotType(slot.type) && normalizeSlotType(slot.type) !== consumer.slotType) {
            error = "The parent declaration has an incompatible slot type.";
        }
        declarations.push({ index, id: slot.id, key: slot.key || "", state: slot.inherited?.state || slot.state || "", slot });
    });
    const clones = (model.slotNodes || []).filter((node) => node.data?.isSlotClone && node.data?.cloneOfNodeId === canonicalId);
    const placeholders = (model.slotNodes || []).filter((node) => getSlotPathFromNode(node) === newPath && node.id !== canonicalId);
    if (oldPath !== newPath && placeholders.some((node) => node.data?.isSlotClone || !node.data?.requiredByChild)) {
        error = `/${newPath} already exists; slots cannot be merged.`;
    }
    if (!canonical || !oldPath || !newPath) error = "The parent slot or child requirement no longer exists.";
    return {
        oldPath, newPath, canonicalId, newCanonicalId: `slot-${newPath}`, bindings, declarations, coalescedDeclarations, clones, placeholders, error,
        signature: JSON.stringify({
            oldPath, newPath, canonicalId, type: canonical?.data?.slotType,
            inherited: canonical?.data?.inherited, inheritedFrom: canonical?.data?.inheritedFrom,
            bindings, declarations, coalescedDeclarations, requirements,
            clones: clones.map((node) => [node.id, node.data?.cloneOfNodeId, getSlotPathFromNode(node)]),
            placeholders: placeholders.map((node) => [node.id, node.data?.slotType, node.data?.requiredByChildren]),
        }),
    };
};

export const renameParentSlot = (model, plan) => {
    const update = (slot) => {
        if (!slotMatchesPath(slot, plan.oldPath)) return slot;
        return {
            ...slot, path: `/${plan.newPath}`,
            ...(slot.inherited ? { inherited: { ...slot.inherited, xpath: `/${plan.newPath}` } } : {}),
        };
    };
    const nodes = model.nodes.map((node) => {
        let data = node.data;
        for (const key of ["inSlots", "outSlots"]) {
            const before = node.data?.[key];
            if (!before?.some((slot) => slotMatchesPath(slot, plan.oldPath))) continue;
            data = { ...data, [key]: before.map(update) };
        }
        return data === node.data ? node : { ...node, data };
    });
    const manualSlots = (model.manualSlots || []).filter((_slot, index) =>
        !plan.coalescedDeclarations?.some((entry) => entry.index === index)).map(update);
    const slotNodes = model.slotNodes.filter((node) => !plan.placeholders.some((placeholder) => placeholder.id === node.id)).map((node) => {
        const canonical = node.id === plan.canonicalId;
        const clone = node.data?.isSlotClone && node.data?.cloneOfNodeId === plan.canonicalId;
        if (!canonical && !clone) return node;
        return {
            ...node, id: canonical ? plan.newCanonicalId : node.id,
            data: { ...node.data, path: `/${plan.newPath}`, label: `/${plan.newPath}`,
                ...(clone ? { cloneOfNodeId: plan.newCanonicalId } : {}) },
        };
    });
    const slotEdges = (model.slotEdges || []).map((edge) => {
        if (edge.data?.canonicalSlotNodeId !== plan.canonicalId && !slotMatchesPath(edge.data, plan.oldPath)) return edge;
        return {
            ...edge,
            source: edge.source === plan.canonicalId ? plan.newCanonicalId : edge.source,
            target: edge.target === plan.canonicalId ? plan.newCanonicalId : edge.target,
            data: { ...edge.data, path: plan.newPath, canonicalSlotNodeId: plan.newCanonicalId,
                slotNodeId: edge.data?.slotNodeId === plan.canonicalId ? plan.newCanonicalId : edge.data?.slotNodeId },
        };
    });
    return { ...model, nodes, manualSlots, slotNodes, slotEdges };
};
