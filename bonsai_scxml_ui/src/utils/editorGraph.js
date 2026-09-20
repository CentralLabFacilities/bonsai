import { isCompoundInitialChildCandidate } from "./editorGeometry";

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

export const highlightSelectedTransitions = (transitionEdges, selectedNodeIds) =>
    transitionEdges.map((rawEdge) => {
        // Selection/highlight styling is display-only. Strip a previously
        // persisted semantic highlight before deciding whether this edge is
        // currently selected. This prevents edited edges from staying coloured
        // after React Flow has deselected them.
        const edge = clearTransientTransitionHighlight(rawEdge);
        const isConnectedToSelection =
            selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
        const isEdgeSelected = Boolean(edge.selected);

        if (!isConnectedToSelection && !isEdgeSelected) {
            return edge;
        }

        const color = getTransitionHighlightColor(edge.sourceHandle || edge.label);

        // Keep the same geometry. Connected transitions animate while a skill
        // is selected, and directly selected transitions use the same semantic
        // success/error/fatal colour.
        return {
            ...edge,
            animated: isConnectedToSelection ? true : edge.animated,
            style: {
                ...(edge.style || {}),
                stroke: color,
            },
            markerEnd: edge.markerEnd
                ? { ...edge.markerEnd, color }
                : edge.markerEnd,
        };
    });


export const normalizeSlotPath = (path) =>
    String(path || "").trim().replace(/^\/+/, "");

export const normalizeSlotType = (type) =>
    String(type || "").trim().toLowerCase();

export const getAncestorSlotSourcesByPath = (
    tabList = [],
    activeTabId = null,
    activeSnapshot = null
) => {
    const result = new Map();
    const tabsById = new Map((tabList || []).map((tab) => [tab.id, tab]));

    // The active tab stored in `tabs` is only synchronized when changing tabs.
    // Merge in the live editor state so newly edited inheritSlots participate in
    // the hierarchy immediately.
    if (activeTabId && activeSnapshot) {
        const storedActiveTab = tabsById.get(activeTabId) || { id: activeTabId };
        tabsById.set(activeTabId, {
            ...storedActiveTab,
            ...activeSnapshot,
            id: activeTabId,
            parentTabId:
                activeSnapshot.parentTabId ?? storedActiveTab.parentTabId ?? null,
        });
    }

    const currentTab = tabsById.get(activeTabId);
    if (!currentTab?.parentTabId) {
        return result;
    }

    const inheritedDeclarationsForPath = (tab, path) => {
        const declarations = [];
        const addDeclaration = (declaration) => {
            if (!declaration) return;
            declarations.push(declaration);
        };

        (tab?.manualSlots || []).forEach((slot) => {
            const slotPath = normalizeSlotPath(slot?.inherited?.xpath || slot?.path);
            const inherited =
                slot?.slotKind === "inheritSlot" || Boolean(slot?.inherited);
            if (inherited && slotPath === path) {
                addDeclaration({
                    type: slot?.type || "Unknown",
                    description: slot?.description || "",
                    key: slot?.key || "inheritSlot",
                    source: "manual",
                });
            }
        });

        (tab?.slotNodes || []).forEach((slotNode) => {
            const slotPath = normalizeSlotPath(
                slotNode?.data?.path || slotNode?.data?.label
            );
            if (
                slotPath === path &&
                Boolean(slotNode?.data?.currentMachineInherited)
            ) {
                addDeclaration({
                    type: slotNode?.data?.slotType || "Unknown",
                    description: slotNode?.data?.description || "",
                    key: slotNode?.data?.key || "inheritSlot",
                    source: "slotNode",
                });
            }
        });

        (tab?.nodes || []).forEach((node) => {
            [...(node.data?.inSlots || []), ...(node.data?.outSlots || [])].forEach(
                (slot) => {
                    const slotPath = normalizeSlotPath(
                        slot?.inherited?.xpath || slot?.path
                    );
                    if (slotPath !== path || !slot?.inherited) return;

                    addDeclaration({
                        type: slot?.type || "Unknown",
                        description: slot?.description || "",
                        key: slot?.key || "inheritSlot",
                        source: "skillSlot",
                        nodeId: node.id,
                    });
                }
            );
        });

        return declarations;
    };

    const collectInheritedPaths = (tab) => {
        const paths = new Set();
        const addPath = (value) => {
            const path = normalizeSlotPath(value);
            if (path) paths.add(path);
        };

        (tab?.manualSlots || []).forEach((slot) => {
            if (slot?.slotKind === "inheritSlot" || slot?.inherited) {
                addPath(slot?.inherited?.xpath || slot?.path);
            }
        });

        (tab?.slotNodes || []).forEach((slotNode) => {
            if (slotNode?.data?.currentMachineInherited) {
                addPath(slotNode?.data?.path || slotNode?.data?.label);
            }
        });

        (tab?.nodes || []).forEach((node) => {
            [...(node.data?.inSlots || []), ...(node.data?.outSlots || [])].forEach(
                (slot) => {
                    if (slot?.inherited) {
                        addPath(slot?.inherited?.xpath || slot?.path);
                    }
                }
            );
        });

        return paths;
    };

    // Build the open sourcing hierarchy from the direct parent up to the root.
    const ancestors = [];
    const seenTabIds = new Set();
    let parentTabId = currentTab.parentTabId;
    let depth = 1;

    while (parentTabId && !seenTabIds.has(parentTabId)) {
        seenTabIds.add(parentTabId);
        const parentTab = tabsById.get(parentTabId);
        if (!parentTab) break;

        ancestors.push({ tab: parentTab, depth });
        parentTabId = parentTab.parentTabId;
        depth += 1;
    }

    // We only need ancestry for paths that are inherited by the current state
    // machine. This avoids unrelated parent slots appearing in Slot Details.
    const candidatePaths = collectInheritedPaths(currentTab);

    candidatePaths.forEach((path) => {
        const entries = [];

        for (const { tab: parentTab, depth: ancestorDepth } of ancestors) {
            const parentMachineName =
                parentTab.title || parentTab.fileName || "Parent state machine";
            const inheritedDeclarations = inheritedDeclarationsForPath(
                parentTab,
                path
            );
            const isInheritedDeclaration = inheritedDeclarations.length > 0;

            const writers = [];
            const writerKeys = new Set();
            const registerWriter = (writer) => {
                const dedupeKey = [
                    writer.nodeId || "",
                    writer.key || "",
                    writer.slotIndex ?? "",
                    writer.sourceKind || "skill",
                ].join("|");
                if (writerKeys.has(dedupeKey)) return;
                writerKeys.add(dedupeKey);

                const entry = {
                    ...writer,
                    path: `/${path}`,
                    parentTabId: parentTab.id,
                    parentMachineName,
                    ancestorDepth,
                    sourceKind: writer.sourceKind || "skill",
                    hierarchyKind: "writer",
                };
                writers.push(entry);
                entries.push(entry);
            };

            (parentTab.nodes || []).forEach((node) => {
                const skillName =
                    node.data?.fullSkillName || node.data?.label || node.id;

                (node.data?.outSlots || []).forEach((slot, slotIndex) => {
                    if (normalizeSlotPath(slot?.path) !== path) return;

                    registerWriter({
                        nodeId: node.id,
                        skillName,
                        key: slot?.key || `output ${slotIndex + 1}`,
                        type: slot?.type || "Unknown",
                        description: slot?.description || "",
                        access: "write",
                        slotIndex,
                        sourceKind: "skill",
                    });
                });

                // A nested sub-state-machine that exposes a write inheritSlot is
                // also a writer of the parent machine's slot.
                if (node.type === "submachine") {
                    (node.data?.inheritedSlots || []).forEach((slot, slotIndex) => {
                        if (
                            slot?.access !== "write" ||
                            normalizeSlotPath(slot?.path) !== path
                        ) {
                            return;
                        }

                        registerWriter({
                            nodeId: node.id,
                            skillName,
                            key: slot?.key || `inheritSlot ${slotIndex + 1}`,
                            type: slot?.type || "Unknown",
                            description: slot?.description || "",
                            access: "write",
                            slotIndex,
                            sourceKind: "submachine",
                        });
                    });
                }
            });

            if (isInheritedDeclaration) {
                const declaration = inheritedDeclarations[0];
                entries.push({
                    nodeId: declaration.nodeId || null,
                    skillName: "inheritSlot",
                    key: declaration.key || "inheritSlot",
                    type: declaration.type || "Unknown",
                    description: declaration.description || "",
                    access: "inherit",
                    slotIndex: null,
                    sourceKind: "inheritSlot",
                    hierarchyKind: "inherit",
                    path: `/${path}`,
                    parentTabId: parentTab.id,
                    parentMachineName,
                    ancestorDepth,
                });
            }

            // The slot may cross another state-machine boundary only when that
            // parent declares the same path as inheritSlot. A writer in a
            // non-inheriting parent is the root source for this chain.
            if (!isInheritedDeclaration) {
                break;
            }
        }

        if (entries.length > 0) {
            // Root-most source first, then move down toward the current machine.
            entries.sort((a, b) => {
                const depthDifference =
                    (b.ancestorDepth || 0) - (a.ancestorDepth || 0);
                if (depthDifference !== 0) return depthDifference;

                if (a.hierarchyKind !== b.hierarchyKind) {
                    return a.hierarchyKind === "writer" ? -1 : 1;
                }
                return String(a.skillName || "").localeCompare(
                    String(b.skillName || "")
                );
            });
            result.set(path, entries);
        }
    });

    return result;
};

export const extractInheritedSlotsFromScxml = (xmlText) => {
    if (!xmlText) return [];

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        if (xmlDoc.getElementsByTagName("parsererror")[0]) {
            return [];
        }

        const slotData = Array.from(
            xmlDoc.getElementsByTagName("*")
        ).find(
            (element) =>
                element.localName === "data" &&
                element.getAttribute("id") === "#_SLOTS"
        );

        if (!slotData) return [];

        const seenPaths = new Set();

        return Array.from(slotData.getElementsByTagName("*"))
            .filter((element) => element.localName === "inheritSlot")
            .map((element) => ({
                key: element.getAttribute("key") || "",
                state: element.getAttribute("state") || "",
                path: normalizeSlotPath(element.getAttribute("xpath") || ""),
            }))
            .filter((slot) => {
                if (!slot.path || seenPaths.has(slot.path)) return false;
                seenPaths.add(slot.path);
                return true;
            });
    } catch (error) {
        console.warn("Could not parse inheritSlot declarations:", error);
        return [];
    }
};

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

export const getBehaviorSourceKey = (src) => {
    const match = String(src || "")
        .trim()
        .match(/^\$\{([^}]+)\}(?:[\\/]|$)/);

    return match
        ? match[1].trim().toUpperCase()
        : null;
};

export const buildEditorProblems = (
    nodes,
    edges,
    globalDataModel,
    behaviorDirectories,
    isBehaviorWorkflow = false,
    manualSlots = [],
    ancestorSlotSourcesByPath = new Map(),
    currentSlotNodes = []
) => {
    const problems = [];
    const nodeMap = new Map((nodes || []).map((node) => [node.id, node]));

    const nodeLabel = (node) =>
        node?.data?.label ||
        node?.data?.fullSkillName ||
        node?.id ||
        "Unknown state";

    const baseNodeName = (node) =>
        String(
            node?.data?.fullSkillName ||
            node?.data?.label ||
            ""
        )
            .split("#")[0]
            .split(".")
            .pop()
            .toLowerCase();

    const isValidBehaviorTerminal = (node) => {
        const name = baseNodeName(node);

        return (
            Boolean(node?.data?.isFinal) ||
            Boolean(node?.data?.isBehaviorExit) ||
            name === "end" ||
            name === "fatal"
        );
    };

    const addProblem = (problem) => {
        problems.push({
            severity: "error",
            category: "Workflow",
            focusNodeIds: problem.nodeId ? [problem.nodeId] : [],
            ...problem,
        });
    };

    // Workflow
    const rootNodes = (nodes || []).filter(
        (node) =>
            !node.parentId &&
            node.type !== "slot" &&
            node.type !== "parallelLane"
    );

    if (rootNodes.length > 0) {
        const initialNodes = rootNodes.filter((node) => node.data?.isInitial);

        if (initialNodes.length === 0) {
            addProblem({
                id: "workflow-no-initial",
                severity: "warning",
                category: "Workflow",
                title: "No initial state",
                message: "No root state is marked as initial.",
            });
        } else if (initialNodes.length > 1) {
            initialNodes.forEach((node) => {
                addProblem({
                    id: `workflow-multiple-initial-${node.id}`,
                    category: "Workflow",
                    title: "Multiple initial states",
                    message: `${nodeLabel(node)} is one of multiple initial states.`,
                    nodeId: node.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
            });
        }
    }

    // Every compound state requires exactly one immediate initial child.
    (nodes || [])
        .filter(
            (node) => node.type === "compound" && !node.data?.isCollapsed
        )
        .forEach((compound) => {
            const children = (nodes || []).filter(
                (node) =>
                    node.parentId === compound.id &&
                    isCompoundInitialChildCandidate(node)
            );
            const initialChildren = children.filter(
                (node) => node.data?.isInitial
            );

            if (children.length === 0) {
                addProblem({
                    id: `compound-empty-${compound.id}`,
                    category: "Workflow",
                    title: "Compound needs an initial state",
                    message: `${nodeLabel(compound)} does not contain a state that can be initial.`,
                    nodeId: compound.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
                return;
            }

            if (initialChildren.length !== 1) {
                addProblem({
                    id: `compound-initial-${compound.id}`,
                    category: "Workflow",
                    title: "Compound needs one initial state",
                    message: `${nodeLabel(compound)} must have exactly one initial child state.`,
                    nodeId: compound.id,
                    detailTab: "allgemein",
                    mode: "event",
                    focusNodeIds: [
                        compound.id,
                        ...initialChildren.map(
                            (node) => node.id
                        ),
                    ],
                });
            }
        });

    // Datamodel
    const ids = new Map();
    (globalDataModel || []).forEach((entry) => {
        const id = String(entry?.id || "").trim();
        if (!id) return;
        ids.set(id, (ids.get(id) || 0) + 1);
    });

    ids.forEach((count, id) => {
        if (count > 1) {
            addProblem({
                id: `datamodel-duplicate-${id}`,
                category: "Datamodel",
                title: "Duplicate datamodel ID",
                message: `${id} is defined ${count} times.`,
            });
        }
    });

    // Transitions
    (edges || []).forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        const eventName = edge.sourceHandle || edge.label || "transition";

        if (!source) {
            addProblem({
                id: `transition-missing-source-${edge.id}`,
                category: "Transitions",
                title: "Missing transition source",
                message: `${eventName} starts from a state that no longer exists.`,
                edgeId: edge.id,
                mode: "event",
                focusNodeIds: target ? [target.id] : [],
            });
            return;
        }

        if (!target) {
            addProblem({
                id: `transition-missing-target-${edge.id}`,
                category: "Transitions",
                title: "Missing transition target",
                message: `${nodeLabel(source)}.${eventName} points to a state that no longer exists.`,
                nodeId: source.id,
                edgeId: edge.id,
                detailTab: "allgemein",
                mode: "event",
            });
        }

        if (
            edge.sourceHandle &&
            !(source.data?.events || []).some(
                (event) => event?.id === edge.sourceHandle
            )
        ) {
            addProblem({
                id: `transition-unknown-event-${edge.id}`,
                severity: "warning",
                category: "Transitions",
                title: "Unknown exit token",
                message: `${nodeLabel(source)} does not expose ${edge.sourceHandle}.`,
                nodeId: source.id,
                edgeId: edge.id,
                detailTab: "allgemein",
                mode: "event",
                focusNodeIds: target
                    ? [source.id, target.id]
                    : [source.id],
            });
        }
    });

    // Missing transitions / exit-token coverage.
    // Every exposed event must have an outgoing transition. A connected "*"
    // handle is a catch-all and therefore covers every possible event.
    (nodes || []).forEach((node) => {
        if (isValidBehaviorTerminal(node)) return;

        const exposedEventIds = [
            ...new Set(
                (node.data?.events || [])
                    .map((event) => String(event?.id || "").trim())
                    .filter(Boolean)
            ),
        ];

        if (exposedEventIds.length === 0) return;

        const outgoingEventIds = new Set(
            (edges || [])
                .filter((edge) => edge.source === node.id)
                .map((edge) =>
                    String(edge.sourceHandle || edge.label || "").trim()
                )
                .filter(Boolean)
        );

        // A wildcard transition handles every event emitted by this state.
        if (outgoingEventIds.has("*")) return;

        exposedEventIds
            .filter((eventId) => eventId !== "*")
            .forEach((eventId) => {
                if (outgoingEventIds.has(eventId)) return;

                addProblem({
                    id: `transition-missing-${node.id}-${eventId}`,
                    category: "Transitions",
                    title: "Missing transition",
                    message: `${nodeLabel(node)}.${eventId} has no transition.`,
                    nodeId: node.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
            });
    });

    // Required parameters
    (nodes || []).forEach((node) => {
        (node.data?.params || []).forEach((parameter, index) => {
            if (!parameter?.required) return;

            const value = String(parameter.expr ?? "").trim();
            const defaultValue = String(parameter.default ?? "").trim();

            if (!value && !defaultValue) {
                addProblem({
                    id: `parameter-required-${node.id}-${index}`,
                    category: "Parameters",
                    title: "Required parameter is missing",
                    message: `${nodeLabel(node)}.${parameter.key || `parameter ${index + 1}`} needs a value.`,
                    nodeId: node.id,
                    detailTab: "parameter",
                    mode: "event",
                });
            }
        });
    });

    // Behavior Library source validation.
    const configuredBehaviorKeys = new Set(
        (behaviorDirectories || [])
            .map((directory) =>
                String(directory?.key || "")
                    .trim()
                    .toUpperCase()
            )
            .filter(Boolean)
    );

    (nodes || []).forEach((node) => {
        if (node.type !== "submachine") return;

        const src = String(node.data?.src || "").trim();
        if (!src) return;

        const sourceKey = getBehaviorSourceKey(src);
        if (!sourceKey) return;

        if (!configuredBehaviorKeys.has(sourceKey)) {
            addProblem({
                id: `behavior-library-key-${node.id}-${sourceKey}`,
                severity: "warning",
                category: "Behavior Library",
                title: "Behavior Library key is not configured",
                message: `${nodeLabel(node)} sources ${src}, but ${sourceKey} is not defined in the Behavior Library.`,
                nodeId: node.id,
                detailTab: "allgemein",
                mode: "event",
            });
        }
    });

    // A sourced behavior must have a way to leave the state machine.
    // Valid terminals are End, Fatal, or a Nop forwarding node that sends
    // an event outside the sub-state-machine.
    if (isBehaviorWorkflow) {
        const stateNodes = (nodes || []).filter(
            (node) =>
                node.type !== "slot" &&
                node.type !== "parallelLane"
        );

        const hasValidTerminal = stateNodes.some(
            isValidBehaviorTerminal
        );

        if (stateNodes.length > 0 && !hasValidTerminal) {
            addProblem({
                id: "behavior-exit-missing",
                severity: "warning",
                category: "Behavior exits",
                title: "State machine has no exit",
                message:
                    "A sourced state machine must send an event outward through Nop or end in End/Fatal.",
            });
        }

        const childrenByParent = new Map();
        stateNodes.forEach((node) => {
            if (!node.parentId) return;
            if (!childrenByParent.has(node.parentId)) {
                childrenByParent.set(node.parentId, []);
            }
            childrenByParent.get(node.parentId).push(node.id);
        });

        stateNodes.forEach((node) => {
            // Containers terminate through their children.
            if ((childrenByParent.get(node.id) || []).length > 0) {
                return;
            }

            if (isValidBehaviorTerminal(node)) {
                return;
            }

            const hasOutgoingTransition = (edges || []).some(
                (edge) => edge.source === node.id
            );

            if (!hasOutgoingTransition) {
                addProblem({
                    id: `behavior-dead-end-${node.id}`,
                    severity: "warning",
                    category: "Behavior exits",
                    title: "State machine can stop without an exit",
                    message: `${nodeLabel(node)} has no outgoing transition. Use a Nop forwarding exit or End/Fatal if this path should leave the state machine.`,
                    nodeId: node.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
            }
        });
    }

    // Slots
    const readers = new Map();
    const writers = new Map();

    const registerSlot = (map, path, value) => {
        if (!map.has(path)) map.set(path, []);
        map.get(path).push(value);
    };

    (nodes || []).forEach((node) => {
        (node.data?.inSlots || []).forEach((slot, index) => {
            const path = normalizeSlotPath(slot.path);

            if (!path) {
                addProblem({
                    id: `slot-input-empty-${node.id}-${index}`,
                    severity: "warning",
                    category: "Slots",
                    title: "Input slot is not connected",
                    message: `${nodeLabel(node)}.${slot.key || `input ${index + 1}`} has no slot path.`,
                    nodeId: node.id,
                    detailTab: "slots",
                    mode: "overview",
                });
                return;
            }

            registerSlot(readers, path, { node, slot, index });
        });

        (node.data?.outSlots || []).forEach((slot, index) => {
            const path = normalizeSlotPath(slot.path);

            if (!path) {
                addProblem({
                    id: `slot-output-empty-${node.id}-${index}`,
                    severity: "warning",
                    category: "Slots",
                    title: "Output slot is not connected",
                    message: `${nodeLabel(node)}.${slot.key || `output ${index + 1}`} has no slot path.`,
                    nodeId: node.id,
                    detailTab: "slots",
                    mode: "overview",
                });
                return;
            }

            registerSlot(writers, path, { node, slot, index });
        });
    });

    // A current-machine inheritSlot can come from several representations:
    // manual declarations, imported skill slot metadata, or the generated
    // visual slot node. Problems validation must recognize all of them, just
    // like Slot Details does, otherwise an upstream writer is found but the
    // path is still incorrectly treated as an ordinary local slot.
    const inheritedPaths = new Set();
    const registerInheritedPath = (value) => {
        const path = normalizeSlotPath(value);
        if (path) inheritedPaths.add(path);
    };

    (manualSlots || []).forEach((slot) => {
        if (slot?.slotKind === "inheritSlot" || Boolean(slot?.inherited)) {
            registerInheritedPath(slot?.inherited?.xpath || slot?.path);
        }
    });

    (nodes || []).forEach((node) => {
        [...(node.data?.inSlots || []), ...(node.data?.outSlots || [])].forEach(
            (slot) => {
                if (slot?.inherited) {
                    registerInheritedPath(slot?.inherited?.xpath || slot?.path);
                }
            }
        );
    });

    (currentSlotNodes || []).forEach((slotNode) => {
        if (slotNode?.data?.currentMachineInherited) {
            registerInheritedPath(
                slotNode?.data?.path || slotNode?.data?.label
            );
        }
    });

    const paths = new Set([...readers.keys(), ...writers.keys()]);

    paths.forEach((path) => {
        const pathReaders = readers.get(path) || [];
        const pathWriters = writers.get(path) || [];

        pathReaders.forEach((reader) => {
            pathWriters.forEach((writer) => {
                const inputType = normalizeSlotType(reader.slot?.type);
                const outputType = normalizeSlotType(writer.slot?.type);

                if (
                    inputType &&
                    outputType &&
                    inputType !== outputType
                ) {
                    addProblem({
                        id: `slot-type-${path}-${reader.node.id}-${reader.index}-${writer.node.id}-${writer.index}`,
                        category: "Slots",
                        title: "Slot type mismatch",
                        message: `/${path}: ${nodeLabel(writer.node)}.${writer.slot?.key} (${writer.slot?.type}) → ${nodeLabel(reader.node)}.${reader.slot?.key} (${reader.slot?.type}).`,
                        nodeId: reader.node.id,
                        detailTab: "slots",
                        mode: "overview",
                        focusNodeIds: [writer.node.id, reader.node.id],
                    });
                }
            });
        });

        if (pathReaders.length > 0 && pathWriters.length === 0) {
            const isInheritedPath = inheritedPaths.has(path);
            const ancestorSources = ancestorSlotSourcesByPath.get(path) || [];
            const hasAncestorWriter = ancestorSources.some(
                (entry) => entry?.hierarchyKind === "writer"
            );

            // An inheritSlot may be supplied through multiple parent state
            // machines. It is valid when a writer is reachable through the
            // complete inheritSlot chain, even if there is no local writer.
            if (isInheritedPath && hasAncestorWriter) {
                return;
            }

            pathReaders.forEach((reader) => {
                addProblem({
                    id: `slot-no-writer-${path}-${reader.node.id}-${reader.index}`,
                    severity: "warning",
                    category: "Slots",
                    title: "Slot has no writer",
                    message: `/${path} is read by ${nodeLabel(reader.node)}, but no skill writes to it.`,
                    nodeId: reader.node.id,
                    detailTab: "slots",
                    mode: "overview",
                });
            });
        }

    });

    const severityOrder = { error: 0, warning: 1, info: 2 };

    return problems.sort(
        (a, b) =>
            (severityOrder[a.severity] ?? 99) -
            (severityOrder[b.severity] ?? 99) ||
            String(a.category).localeCompare(String(b.category)) ||
            String(a.title).localeCompare(String(b.title))
    );
};

