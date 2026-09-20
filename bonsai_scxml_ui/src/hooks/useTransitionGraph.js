import { useCallback, useState } from "react";
import { addEdge, MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    clearTransientTransitionHighlight,
    normalizeSlotType,
    parseSlotConnectionHandle,
    getSlotPathFromNode,
} from "../utils/editorGraph";
import {
    COMPOUND_PADDING_X,
    canTargetAcrossStateBoundaries,
    getCompoundChildrenRight,
    getCompoundExitGutterWidth,
    getDirectCompoundForNode,
    getLaneForNode,
    getTransitionTargetHandleForNode,
    isCompoundInitialChildCandidate,
} from "../utils/editorGeometry";
import {
    getSkillPackageName,
    getStoredTransitionAssignments,
} from "../utils/editorScxml";

export function useTransitionGraph({
    nodes,
    edges,
    slotNodes,
    slotEdges,
    selectedNodeId,
    setNodes,
    setEdges,
    setSlotNodes,
    setSlotEdges,
    setGlobalDataModel,
    setSelectedNodeId,
    updateNodeInternals,
}) {
    const [slotConnectionDrag, setSlotConnectionDrag] = useState(null);
    const [drawerData, setDrawerData] = useState({
        isOpen: false,
        sourceNodeId: null,
        sourceNodeName: "",
        sourceEventName: "",
        initialTargetId: null,
        initialTransitionId: null,
        candidateTransitions: [],
        availableEvents: [],
        availableTargets: [],
    });

    const openConditionDrawer = (sourceId, sourceHandle = "", initialTargetId = null, customEdges = null) => {
        const sourceNode = nodes.find((node) => node.id === sourceId);
        if (!sourceNode) return;

        const currentEdges = customEdges || edges;
        const outgoingEdges = currentEdges.filter((edge) => edge.source === sourceId);
        const sourceEvents = sourceNode.data.events || [];

        // Edges preserve the SCXML transition order, so they are the primary
        // source for the ordered transition list shown in step 1.
        const transitions = outgoingEdges.map((edge) => {
            const matchingEvent = sourceEvents.find(
                (event) =>
                    event.id === edge.sourceHandle &&
                    event.target === edge.target &&
                    String(event.cond || "") === String(edge.data?.cond || "")
            ) || sourceEvents.find(
                (event) =>
                    event.id === edge.sourceHandle &&
                    event.target === edge.target
            );

            const targetNode = nodes.find((node) => node.id === edge.target);

            return {
                transitionId: edge.id,
                edgeId: edge.id,
                event: edge.sourceHandle || matchingEvent?.id || edge.label || "success",
                target: edge.target,
                targetLabel:
                    targetNode?.data?.label ||
                    matchingEvent?.targetLabel ||
                    edge.target,
                cond: edge.data?.cond || matchingEvent?.cond || "",
                assignments: getStoredTransitionAssignments(
                    edge.data,
                    matchingEvent
                ),
            };
        });

        // Keep transition data that may exist on the node even when an edge is
        // currently missing, without collapsing duplicate conditional paths.
        const representedCounts = new Map();
        transitions.forEach((transition) => {
            const key = `${transition.event}::${transition.target}`;
            representedCounts.set(key, (representedCounts.get(key) || 0) + 1);
        });

        const consumedCounts = new Map();
        sourceEvents
            .filter((event) => event.target)
            .forEach((event, index) => {
                const key = `${event.id}::${event.target}`;
                const consumed = consumedCounts.get(key) || 0;
                const represented = representedCounts.get(key) || 0;

                if (consumed < represented) {
                    consumedCounts.set(key, consumed + 1);
                    return;
                }

                const targetNode = nodes.find((node) => node.id === event.target);
                transitions.push({
                    transitionId: `node-transition-${sourceId}-${index}`,
                    edgeId: null,
                    event: event.id,
                    target: event.target,
                    targetLabel: targetNode?.data?.label || event.target,
                    cond: event.cond || "",
                    assignments: getStoredTransitionAssignments(event),
                });
            });

        const eventMap = new Map();
        sourceEvents.forEach((event) => {
            if (!event?.id || eventMap.has(event.id)) return;
            eventMap.set(event.id, {
                id: event.id,
                description: event.description || "",
            });
        });
        outgoingEdges.forEach((edge) => {
            const eventId = edge.sourceHandle || edge.label;
            if (!eventId || eventMap.has(eventId)) return;
            eventMap.set(eventId, { id: eventId, description: "" });
        });

        const availableTargets = nodes
            .filter((node) =>
                canTargetAcrossStateBoundaries(sourceNode, node, nodes)
            )
            .map((node) => {
                const fullSkillName = node.data?.fullSkillName || "";
                const stateName = fullSkillName.includes("#")
                    ? fullSkillName.split("#").pop()
                    : "";
                const skillName =
                    node.data?.label ||
                    fullSkillName.split(".").pop()?.split("#")[0] ||
                    node.id;
                const displayName =
                    stateName && stateName !== skillName
                        ? `${skillName} (${stateName})`
                        : skillName;

                return {
                    id: node.id,
                    label: node.data?.label || node.id,
                    displayName,
                    skillName,
                    stateName,
                    fullSkillName,
                    packageName: getSkillPackageName(fullSkillName),
                };
            });

        const initialTransition = transitions.find(
            (transition) =>
                (!sourceHandle || transition.event === sourceHandle) &&
                (!initialTargetId || transition.target === initialTargetId)
        ) || transitions.find(
            (transition) => transition.event === sourceHandle
        ) || transitions[0];

        setDrawerData({
            isOpen: true,
            sourceNodeId: sourceId,
            sourceNodeName: sourceNode.data.label,
            sourceEventName: sourceHandle,
            initialTargetId: initialTargetId || initialTransition?.target || "",
            initialTransitionId: initialTransition?.transitionId || null,
            candidateTransitions: transitions,
            availableEvents: [...eventMap.values()],
            availableTargets,
        });
    };

    const isValidConnection = useCallback((connection) => {
        const possibleInitialCompound = nodes.find(
            (node) =>
                node.id === connection.source &&
                node.type === "compound"
        );

        // The compound entry handle is source-only and may only connect
        // inward to an immediate child. It represents the compound's
        // initial state and is never a normal transition.
        if (
            possibleInitialCompound &&
            connection.sourceHandle === "compound-entry"
        ) {
            const targetNode = nodes.find(
                (node) => node.id === connection.target
            );

            return Boolean(
                targetNode &&
                targetNode.parentId === possibleInitialCompound.id &&
                isCompoundInitialChildCandidate(targetNode)
            );
        }

        // The compound entry point is never an incoming endpoint. Loose
        // connection mode would otherwise allow another event handle to use
        // this source handle as a target.
        if (connection.targetHandle === "compound-entry") {
            return false;
        }

        const sourceSlotHandle = parseSlotConnectionHandle(
            connection.sourceHandle
        );
        const targetSlotHandle = parseSlotConnectionHandle(
            connection.targetHandle
        );

        // Slot connections require all three dimensions to match:
        // skill <-> slot node, Read/Write access, and the declared slot type.
        if (sourceSlotHandle || targetSlotHandle) {
            if (
                !sourceSlotHandle ||
                !targetSlotHandle ||
                sourceSlotHandle.access !== targetSlotHandle.access ||
                sourceSlotHandle.origin === targetSlotHandle.origin
            ) {
                return false;
            }

            const sourceIsSkill = sourceSlotHandle.origin === "skill";
            const skillHandle = sourceIsSkill
                ? sourceSlotHandle
                : targetSlotHandle;
            const skillNodeId = sourceIsSkill
                ? connection.source
                : connection.target;
            const slotNodeId = sourceIsSkill
                ? connection.target
                : connection.source;

            const skillNode = nodes.find(
                (node) => node.id === skillNodeId
            );
            const slotNode = slotNodes.find(
                (node) => node.id === slotNodeId
            );

            if (!skillNode || !slotNode) {
                return false;
            }

            const skillSlot =
                skillHandle.access === "read"
                    ? skillNode.data?.inSlots?.[skillHandle.slotIndex]
                    : skillNode.data?.outSlots?.[skillHandle.slotIndex];

            const skillType = normalizeSlotType(skillSlot?.type);
            const slotType = normalizeSlotType(slotNode.data?.slotType);

            return Boolean(
                skillType &&
                slotType &&
                skillType === slotType
            );
        }

        const sourceNode = nodes.find(
            (node) => node.id === connection.source
        );
        const targetNode = nodes.find(
            (node) => node.id === connection.target
        );

        if (
            !sourceNode ||
            !targetNode ||
            !canTargetAcrossStateBoundaries(sourceNode, targetNode, nodes)
        ) {
            return false;
        }

        // Normal transitions are strictly directional even though the canvas
        // stays in ConnectionMode.Loose for bidirectional slot wiring:
        //   event handle (right) -> transition target handle (left)
        // A left transition handle can never start an edge, and an event
        // handle can never receive one.
        const normalTransitionTargetHandles = new Set([
            "transition-target",
            "target",
        ]);

        return Boolean(
            connection.sourceHandle &&
            !normalTransitionTargetHandles.has(connection.sourceHandle) &&
            normalTransitionTargetHandles.has(connection.targetHandle)
        );
    }, [nodes, slotNodes]);

    const handleConnectStart = useCallback((_, params) => {
        const slotHandle = parseSlotConnectionHandle(params?.handleId);

        if (!slotHandle) {
            setSlotConnectionDrag(null);
            return;
        }

        let slotType = "";

        if (slotHandle.origin === "skill") {
            const skillNode = nodes.find(
                (node) => node.id === params.nodeId
            );
            const skillSlot =
                slotHandle.access === "read"
                    ? skillNode?.data?.inSlots?.[slotHandle.slotIndex]
                    : skillNode?.data?.outSlots?.[slotHandle.slotIndex];

            slotType = normalizeSlotType(skillSlot?.type);
        } else {
            const slotNode = slotNodes.find(
                (node) => node.id === params.nodeId
            );
            slotType = normalizeSlotType(slotNode?.data?.slotType);
        }

        setSlotConnectionDrag({
            active: true,
            nodeId: params.nodeId,
            handleId: params.handleId,
            origin: slotHandle.origin,
            access: slotHandle.access,
            slotType,
        });
    }, [nodes, slotNodes]);

    const handleConnectEnd = useCallback(() => {
        setSlotConnectionDrag(null);
    }, []);

    const onConnect = useCallback(
        (params) => {
            const sourceCompoundForInitial = nodes.find(
                (node) =>
                    node.id === params.source &&
                    node.type === "compound"
            );

            if (
                sourceCompoundForInitial &&
                params.sourceHandle === "compound-entry"
            ) {
                const sourceCompound = sourceCompoundForInitial;
                const targetNode = nodes.find(
                    (node) => node.id === params.target
                );

                if (
                    !targetNode ||
                    targetNode.parentId !== sourceCompound.id ||
                    !isCompoundInitialChildCandidate(targetNode)
                ) {
                    return;
                }

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        if (node.id === sourceCompound.id) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    initialChildId: targetNode.id,
                                    // The entry connector is not an exit token/event.
                                    // Clean up stale data from older editor versions.
                                    events: (node.data?.events || []).filter(
                                        (event) =>
                                            String(event?.id || "") !==
                                            "compound-entry"
                                    ),
                                },
                            };
                        }

                        if (node.parentId === sourceCompound.id) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    isInitial: node.id === targetNode.id,
                                },
                            };
                        }

                        return node;
                    })
                );

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceCompound.id);
                    updateNodeInternals(targetNode.id);
                });

                return;
            }

            if (params.targetHandle === "compound-entry") {
                return;
            }

            const sourceSlotHandle = parseSlotConnectionHandle(
                params.sourceHandle
            );
            const targetSlotHandle = parseSlotConnectionHandle(
                params.targetHandle
            );

            if (sourceSlotHandle || targetSlotHandle) {
                if (
                    !sourceSlotHandle ||
                    !targetSlotHandle ||
                    sourceSlotHandle.access !== targetSlotHandle.access ||
                    sourceSlotHandle.origin === targetSlotHandle.origin
                ) {
                    return;
                }

                const sourceIsSkill = sourceSlotHandle.origin === "skill";
                const skillHandle = sourceIsSkill
                    ? sourceSlotHandle
                    : targetSlotHandle;
                const skillNodeId = sourceIsSkill
                    ? params.source
                    : params.target;
                const slotNodeId = sourceIsSkill
                    ? params.target
                    : params.source;

                const skillNode = nodes.find(
                    (node) => node.id === skillNodeId
                );
                const slotNode = slotNodes.find(
                    (node) => node.id === slotNodeId
                );
                const slotIndex = skillHandle.slotIndex;
                const access = skillHandle.access;
                const path = getSlotPathFromNode(slotNode);

                if (!skillNode || !slotNode || !path) {
                    return;
                }

                const skillSlot =
                    access === "read"
                        ? skillNode.data?.inSlots?.[slotIndex]
                        : skillNode.data?.outSlots?.[slotIndex];

                if (!skillSlot) {
                    return;
                }

                const skillType = normalizeSlotType(skillSlot.type);
                const slotType = normalizeSlotType(slotNode.data?.slotType);

                // Never allow a Read/Write endpoint to be connected to a slot
                // node of another datatype, even if onConnect is called
                // programmatically or React Flow's loose mode accepts a drag.
                if (
                    !skillType ||
                    !slotType ||
                    skillType !== slotType
                ) {
                    return;
                }

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        if (node.id !== skillNodeId) return node;

                        if (access === "read") {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    inSlots: (node.data.inSlots || []).map(
                                        (slot, index) =>
                                            index === slotIndex
                                                ? {
                                                    ...slot,
                                                    path: `/${path}`,
                                                    inherited: slotNode.data?.inherited
                                                        ? {
                                                            state:
                                                                slotNode.data?.inheritedFrom ||
                                                                "",
                                                            xpath: `/${path}`,
                                                        }
                                                        : null,
                                                }
                                                : slot
                                    ),
                                },
                            };
                        }

                        return {
                            ...node,
                            data: {
                                ...node.data,
                                outSlots: (node.data.outSlots || []).map(
                                    (slot, index) =>
                                        index === slotIndex
                                            ? {
                                                ...slot,
                                                path: `/${path}`,
                                                inherited: slotNode.data?.inherited
                                                    ? {
                                                        state:
                                                            slotNode.data?.inheritedFrom ||
                                                            "",
                                                        xpath: `/${path}`,
                                                    }
                                                    : null,
                                            }
                                            : slot
                                ),
                            },
                        };
                    })
                );

                setSlotEdges((currentEdges) => {
                    // Every skill slot has exactly one slot edge. Reconnecting
                    // the handle replaces its previous slot connection.
                    const remainingEdges = currentEdges.filter((edge) => {
                        if (edge.data?.edgeKind !== "slot") return true;
                        if (edge.data?.access !== access) return true;

                        const storedSkillNodeId =
                            edge.data?.skillNodeId || edge.source;

                        return !(
                            storedSkillNodeId === skillNodeId &&
                            Number(edge.data?.slotIndex) === slotIndex
                        );
                    });

                    const skillHandleId =
                        access === "read"
                            ? `slot-skill-read-${slotIndex}`
                            : `slot-skill-write-${slotIndex}`;
                    const slotHandleId =
                        access === "read"
                            ? "slot-node-read"
                            : "slot-node-write";

                    // Slot connections are always drawn from the skill slot
                    // handle to the corresponding endpoint on the slot node.
                    const normalizedEdge = {
                        source: skillNodeId,
                        target: slotNodeId,
                        sourceHandle: skillHandleId,
                        targetHandle: slotHandleId,
                    };

                    return [
                        ...remainingEdges,
                        {
                            id: `edge-slot-${access}-${skillNodeId}-${slotIndex}-${crypto.randomUUID()}`,
                            ...normalizedEdge,
                            type: "smartTransition",
                            style: {
                                stroke: SLOT_CONNECTION_COLORS[access],
                                strokeWidth: 1.7,
                                strokeDasharray: "5 5",
                            },
                            markerEnd: {
                                type: MarkerType.ArrowClosed,
                                color: SLOT_CONNECTION_COLORS[access],
                            },
                            data: {
                                edgeKind: "slot",
                                access,
                                slotIndex,
                                path,
                                skillNodeId,
                                slotNodeId,
                            },
                        },
                    ];
                });

                return;
            }

            const sourceNode = nodes.find(
                (n) => n.id === params.source
            );

            const targetNode = nodes.find(
                (n) => n.id === params.target
            );

            if (!sourceNode || !targetNode) {
                return;
            }

            // Do not let a normal transition cross a compound/parallel entry
            // boundary and land directly on an interior state. The external
            // edge must terminate on the container's left entry handle first.
            if (
                !canTargetAcrossStateBoundaries(
                    sourceNode,
                    targetNode,
                    nodes
                )
            ) {
                return;
            }

            // Prüfen, ob Source / Target innerhalb einer Parallel-Lane liegen
            const sourceLane = getLaneForNode(
                sourceNode,
                nodes
            );

            const targetLane = getLaneForNode(
                targetNode,
                nodes
            );

            const leavesParallel =
                sourceLane &&
                (
                    !targetLane ||
                    targetLane.parentId !== sourceLane.parentId
                );

            const alreadyExists = edges.some((edge) => {
                const logicalSource =
                    edge.data?.compoundOriginalSource ||
                    edge.data?.parallelOriginalSource ||
                    edge.source;
                const logicalHandle =
                    edge.data?.compoundOriginalSourceHandle ||
                    edge.sourceHandle;

                return (
                    logicalSource === params.source &&
                    logicalHandle === params.sourceHandle &&
                    edge.target === params.target
                );
            });

            if (alreadyExists) {
                openConditionDrawer(params.source, params.sourceHandle, params.target);
                return;
            }

            const sourceCompound =
                getDirectCompoundForNode(
                    sourceNode,
                    nodes
                );

            const targetCompound =
                getDirectCompoundForNode(
                    targetNode,
                    nodes
                );

            const leavesCompound =
                sourceCompound &&
                (
                    !targetCompound ||
                    targetCompound.id !== sourceCompound.id
                );

            if (leavesCompound) {
                const handleId =
                    params.sourceHandle || "success";

                const baseName =
                    sourceNode.data?.label ||
                    sourceNode.data?.fullSkillName ||
                    "state";

                const exitLabel =
                    `${baseName}.${handleId}`;

                // Compound exit handles must be unique per child state.
                // Two children may both expose e.g. a "success" token.
                const compoundExitId =
                    `${params.source}-${handleId}`;

                const externalEdge = {
                    id:
                        `edge-compound-${params.source}-` +
                        `${handleId}-${params.target}-` +
                        crypto.randomUUID(),

                    source: sourceCompound.id,
                    target: params.target,

                    sourceHandle: compoundExitId,
                    targetHandle: params.targetHandle,

                    label: handleId,

                    type: "smartTransition",

                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },

                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,
                        compoundOriginalSource: params.source,
                        compoundOriginalSourceHandle: handleId,
                        compoundExitId,
                    },
                };

                const internalEdge = {
                    id:
                        `edge-internal-compound-${params.source}-` +
                        `${handleId}-${sourceCompound.id}-` +
                        crypto.randomUUID(),

                    source: params.source,
                    target: sourceCompound.id,
                    sourceHandle: handleId,
                    targetHandle: `target-${compoundExitId}`,
                    type: "smoothstep",
                    selectable: false,
                    focusable: false,

                    style: {
                        strokeDasharray: "4 4",
                        stroke: "#0284c7",
                        strokeWidth: 1.5,
                    },

                    data: {
                        compoundInternalEdge: true,
                        compoundExitId,
                    },
                };

                setEdges((currentEdges) => [
                    ...currentEdges,
                    externalEdge,
                    internalEdge,
                ]);

                setNodes((currentNodes) => {
                    const childRight = getCompoundChildrenRight(
                        sourceCompound.id,
                        currentNodes
                    );

                    return currentNodes.map((node) => {
                        if (node.id !== sourceCompound.id) {
                            return node;
                        }

                        const compoundEvents = (node.data?.events || []).filter(
                            (event) =>
                                String(event?.id || "") !== "compound-entry"
                        );

                        const alreadyExists = compoundEvents.some(
                            (event) =>
                                String(event.id) === String(compoundExitId)
                        );

                        const nextEvents = alreadyExists
                            ? compoundEvents
                            : [
                                ...compoundEvents,
                                {
                                    id: compoundExitId,
                                    name: exitLabel,
                                    rawEvent: exitLabel,
                                    target: params.target,
                                    sourceNodeId: params.source,
                                    transitionHandleId: handleId,
                                },
                            ];

                        const requiredWidth =
                            childRight +
                            COMPOUND_PADDING_X +
                            getCompoundExitGutterWidth(nextEvents);

                        return {
                            ...node,
                            style: {
                                ...node.style,
                                width: Math.max(
                                    Number(node.style?.width) || 320,
                                    requiredWidth
                                ),
                            },
                            data: {
                                ...node.data,
                                events: nextEvents,
                            },
                        };
                    });
                });

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceCompound.id);
                });

                return;
            }

            /*
             * =========================================================
             * TRANSITION VERLÄSST PARALLEL
             * =========================================================
             */
            if (leavesParallel) {
                const handleId =
                    params.sourceHandle || "success";

                /*
                 * Sichtbare äußere Transition:
                 *
                 * Nicht:
                 * State A -> State B
                 *
                 * sondern:
                 * Lane -> State B
                 *
                 * parallelOriginalSource merkt sich,
                 * welcher State eigentlich die Source ist.
                 */
                const externalEdge = {
                    id:
                        `edge-${params.source}-` +
                        `${handleId}-${params.target}-` +
                        crypto.randomUUID(),

                    source: sourceLane.id,
                    target: params.target,

                    sourceHandle: handleId,
                    targetHandle: params.targetHandle,

                    label: handleId,

                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },

                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,

                        // Der tatsächliche State bleibt hier gespeichert
                        parallelOriginalSource:
                        params.source,
                    },
                };

                /*
                 * Interne gestrichelte Verbindung:
                 *
                 * State A -> Lane-Rand
                 */
                const internalEdge = {
                    id:
                        `edge-internal-${params.source}-` +
                        `${handleId}-${sourceLane.id}-` +
                        crypto.randomUUID(),

                    source: params.source,
                    target: sourceLane.id,

                    sourceHandle: handleId,
                    targetHandle: `target-${handleId}`,

                    type: "smoothstep",

                    style: {
                        strokeDasharray: "4 4",
                        stroke: "#0284c7",
                        strokeWidth: 1.5,
                    },
                };

                setEdges((currentEdges) => [
                    ...currentEdges,
                    externalEdge,
                    internalEdge,
                ]);

                /*
                 * Die Lane braucht den Event/Handle ebenfalls,
                 * damit die äußere Transition sauber am Rand
                 * angezeigt werden kann.
                 */
                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        /*
                         * Event am ursprünglichen State ergänzen
                         */
                        if (node.id === params.source) {
                            const events =
                                node.data?.events || [];

                            const existingEvent =
                                events.find(
                                    (event) =>
                                        event.id === handleId
                                );

                            if (existingEvent) {
                                return node;
                            }

                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    events: [
                                        ...events,
                                        {
                                            id: handleId,

                                            selectedPackage:
                                                getSkillPackageName(
                                                    targetNode
                                                        ?.data
                                                        ?.fullSkillName
                                                ),

                                            selectedSkill:
                                                targetNode
                                                    ?.data
                                                    ?.fullSkillName
                                                    ?.split("#")[0] ||
                                                "",

                                            target:
                                            params.target,

                                            cond: "",

                                            assignments: [],

                                            assignLocation: "",
                                            assignExpr: "",
                                        },
                                    ],
                                },
                            };
                        }

                        /*
                         * Passenden Handle/Event an der Lane erzeugen
                         */
                        if (node.id === sourceLane.id) {
                            const laneEvents =
                                node.data?.events || [];

                            const alreadyHasEvent =
                                laneEvents.some(
                                    (event) =>
                                        event.id === handleId
                                );

                            if (alreadyHasEvent) {
                                return node;
                            }

                            const baseName =
                                sourceNode.data?.label ||
                                sourceNode.data
                                    ?.fullSkillName ||
                                "state";

                            return {
                                ...node,
                                data: {
                                    ...node.data,

                                    events: [
                                        ...laneEvents,
                                        {
                                            id: handleId,

                                            name:
                                                `${baseName}.` +
                                                handleId,

                                            rawEvent:
                                                `${baseName}.` +
                                                handleId,

                                            target:
                                            params.target,
                                        },
                                    ],
                                },
                            };
                        }

                        return node;
                    })
                );

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceLane.id);
                });

                /*
                 * Falls mehrere Transitions vom selben Event ausgehen,
                 * Condition Drawer öffnen.
                 */
                const outgoingFromHandle = [
                    ...edges,
                    externalEdge,
                ].filter((edge) => {
                    const logicalSource =
                        edge.data?.parallelOriginalSource ||
                        edge.source;

                    return (
                        logicalSource === params.source &&
                        edge.sourceHandle === handleId
                    );
                });

                if (outgoingFromHandle.length >= 2) {
                    openConditionDrawer(
                        params.source,
                        handleId,
                        params.target,
                        [
                            ...edges,
                            externalEdge,
                            internalEdge,
                        ]
                    );
                }

                return;
            }

            /*
             * =========================================================
             * NORMALE TRANSITION
             * =========================================================
             *
             * Source liegt nicht im Parallel oder Target befindet
             * sich im selben Parallel-State.
             */
            const newEdge = {
                id:
                    `edge-${params.source}-` +
                    `${params.sourceHandle}-` +
                    `${params.target}-` +
                    crypto.randomUUID(),

                source: params.source,
                target: params.target,

                sourceHandle:
                params.sourceHandle,

                targetHandle:
                params.targetHandle,

                label:
                params.sourceHandle,

                type: "smartTransition",
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                },

                data: {
                    cond: "",
                    assignments: [],
                    assign: null,
                },
            };

            const updatedEdges = [
                ...edges,
                newEdge,
            ];

            setEdges(updatedEdges);

            /*
             * Event am Source-State aktualisieren
             */
            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (node.id !== params.source) {
                        return node;
                    }

                    const events =
                        node.data?.events || [];

                    const existingEvent =
                        events.find(
                            (event) =>
                                event.id ===
                                params.sourceHandle
                        );

                    if (existingEvent) {
                        return node;
                    }

                    return {
                        ...node,
                        data: {
                            ...node.data,

                            events: [
                                ...events,
                                {
                                    id:
                                    params.sourceHandle,

                                    selectedPackage:
                                        getSkillPackageName(
                                            targetNode
                                                ?.data
                                                ?.fullSkillName
                                        ),

                                    selectedSkill:
                                        targetNode
                                            ?.data
                                            ?.fullSkillName
                                            ?.split("#")[0] ||
                                        "",

                                    target:
                                    params.target,

                                    cond: "",
                                    assignments: [],
                                    assignLocation: "",
                                    assignExpr: "",
                                },
                            ],
                        },
                    };
                })
            );

            const outgoingFromHandle =
                updatedEdges.filter(
                    (edge) =>
                        edge.source ===
                        params.source &&
                        edge.sourceHandle ===
                        params.sourceHandle
                );

            if (outgoingFromHandle.length >= 2) {
                openConditionDrawer(
                    params.source,
                    params.sourceHandle,
                    params.target,
                    updatedEdges
                );
            }
        },
        [
            edges,
            nodes,
            slotNodes,
            setEdges,
            setNodes,
            setSlotEdges,
            updateNodeInternals,
        ]
    );

    const clearTransitionSelection = useCallback(() => {
        setEdges((currentEdges) =>
            currentEdges.map((edge) => ({
                ...clearTransientTransitionHighlight(edge),
                selected: false,
            }))
        );
    }, [setEdges]);

    const clearSlotEdgeSelection = useCallback(() => {
        setSlotEdges((currentEdges) =>
            currentEdges.map((edge) => ({
                ...edge,
                selected: false,
            }))
        );
    }, [setSlotEdges]);

    const clearAllEdgeSelection = useCallback(() => {
        clearTransitionSelection();
        clearSlotEdgeSelection();
    }, [clearTransitionSelection, clearSlotEdgeSelection]);

    const selectTransitionEdge = useCallback(
        (edgeId) => {
            // Edge and node selection are mutually exclusive. A previously
            // selected skill would otherwise keep all of its connected
            // transitions highlighted in addition to the explicitly selected
            // transition.
            setSelectedNodeId(null);
            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.selected
                        ? { ...node, selected: false }
                        : node
                )
            );
            setSlotNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.selected
                        ? { ...node, selected: false }
                        : node
                )
            );

            clearSlotEdgeSelection();
            setEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...clearTransientTransitionHighlight(edge),
                    selected: edge.id === edgeId,
                }))
            );
        },
        [
            setEdges,
            setNodes,
            setSlotNodes,
            clearSlotEdgeSelection,
        ]
    );

    const selectSlotEdge = useCallback(
        (edgeId) => {
            clearTransitionSelection();
            setSlotEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...edge,
                    selected: edge.id === edgeId,
                }))
            );
        },
        [setSlotEdges, clearTransitionSelection]
    );

    const onEdgeDoubleClick = useCallback(
        (event, edge) => {
            selectTransitionEdge(edge.id);
            openConditionDrawer(edge.source, edge.sourceHandle, edge.target);
        },
        [edges, nodes, selectTransitionEdge]
    );

    const handleConfirmDrawer = ({ updatedTransitions, newGlobalVars = [], newGlobalVar = null }) => {
        const varsToAdd = [
            ...(Array.isArray(newGlobalVars) ? newGlobalVars : []),
            ...(newGlobalVar ? [newGlobalVar] : []),
        ];

        if (varsToAdd.length > 0) {
            setGlobalDataModel((previous) => {
                const existingIds = new Set(previous.map((variable) => variable.id));
                const additions = varsToAdd.filter(
                    (variable) => variable?.id && !existingIds.has(variable.id)
                );
                return [...previous, ...additions];
            });
        }

        const sourceId = drawerData.sourceNodeId;
        if (!sourceId || !Array.isArray(updatedTransitions)) return;

        const sourceNode = nodes.find((node) => node.id === sourceId);
        if (!sourceNode) return;

        const validUpdatedTransitions = updatedTransitions.filter((transition) => {
            const targetNode = nodes.find(
                (node) => node.id === transition.target
            );

            return Boolean(
                targetNode &&
                canTargetAcrossStateBoundaries(sourceNode, targetNode, nodes)
            );
        });

        // Rebuild this state's edges in exactly the order selected in step 1.
        setEdges((currentEdges) => {
            const untouchedEdges = currentEdges.filter(
                (edge) => edge.source !== sourceId
            );
            const existingById = new Map(
                currentEdges.map((edge) => [edge.id, edge])
            );

            const rebuiltEdges = validUpdatedTransitions.map((transition) => {
                const existing = transition.edgeId
                    ? existingById.get(transition.edgeId)
                    : null;
                const eventId = transition.event || "success";
                const hasCondition = Boolean(
                    transition.cond && transition.cond.trim()
                );

                const cleanedExisting = existing
                    ? clearTransientTransitionHighlight(existing)
                    : null;

                return {
                    ...(cleanedExisting || {}),
                    id:
                        cleanedExisting?.id ||
                        `edge-${sourceId}-${eventId}-${transition.target}-${crypto.randomUUID()}`,
                    source: sourceId,
                    target: transition.target,
                    sourceHandle: eventId,
                    targetHandle:
                        getTransitionTargetHandleForNode(
                            nodes.find((node) => node.id === transition.target)
                        ),
                    type: "smartTransition",
                    selected: false,
                    label: hasCondition
                        ? `${eventId} [${transition.cond}]`
                        : eventId,
                    markerEnd:
                        cleanedExisting?.markerEnd || { type: MarkerType.ArrowClosed },
                    data: {
                        ...(cleanedExisting?.data || {}),
                        cond: transition.cond || "",
                        assignments: Array.isArray(transition.assignments)
                            ? transition.assignments.map((assignment) => ({
                                location: assignment.location,
                                expr: assignment.expr,
                            }))
                            : [],
                        // Keep the first assignment in the legacy field for
                        // compatibility with older saved UI state.
                        assign: transition.assignments?.[0]
                            ? {
                                location: transition.assignments[0].location,
                                expr: transition.assignments[0].expr,
                            }
                            : null,
                    },
                };
            });

            return [...untouchedEdges, ...rebuiltEdges];
        });

        setNodes((currentNodes) =>
            currentNodes.map((node) => {
                if (node.id !== sourceId) return node;

                const originalEvents = node.data.events || [];
                const baseEventById = new Map();

                originalEvents.forEach((event) => {
                    if (!event?.id || baseEventById.has(event.id)) return;
                    baseEventById.set(event.id, {
                        ...event,
                        target: null,
                        cond: "",
                        assignments: [],
                        assignLocation: "",
                        assignExpr: "",
                        selectedPackage: "",
                        selectedSkill: "",
                    });
                });

                const usedEventIds = new Set();
                const orderedTransitionEvents = validUpdatedTransitions.map(
                    (transition) => {
                        usedEventIds.add(transition.event);
                        const baseEvent = baseEventById.get(transition.event) || {
                            id: transition.event,
                            description: "",
                        };
                        const targetNode = currentNodes.find(
                            (candidate) => candidate.id === transition.target
                        );

                        return {
                            ...baseEvent,
                            id: transition.event,
                            selectedPackage: getSkillPackageName(
                                targetNode?.data?.fullSkillName
                            ),
                            selectedSkill:
                                targetNode?.data?.fullSkillName?.split("#")[0] ||
                                targetNode?.data?.label ||
                                "",
                            target: transition.target,
                            cond: transition.cond || "",
                            assignments: Array.isArray(transition.assignments)
                                ? transition.assignments.map((assignment) => ({
                                    location: assignment.location,
                                    expr: assignment.expr,
                                }))
                                : [],
                            assignLocation:
                                transition.assignments?.[0]?.location || "",
                            assignExpr:
                                transition.assignments?.[0]?.expr || "",
                        };
                    }
                );

                // Exit tokens without a transition must stay available as handles
                // and as choices for creating a new transition later.
                const unusedEvents = [...baseEventById.entries()]
                    .filter(([eventId]) => !usedEventIds.has(eventId))
                    .map(([, event]) => event);

                return {
                    ...node,
                    data: {
                        ...node.data,
                        events: [...orderedTransitionEvents, ...unusedEvents],
                    },
                };
            })
        );

        setDrawerData((previous) => ({ ...previous, isOpen: false }));
    };

    const updateNodeEvent = (nodeId, eventId, changes) => {
        setNodes((nds) =>
            nds.map((n) =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, events: n.data.events.map((e) => (e.id === eventId ? { ...e, ...changes } : e)) } }
                    : n
            )
        );
    };

    const setExistingTargetForEvent = (event, targetNodeId) => {
        const selectedNode = nodes.find((node) => node.id === selectedNodeId);
        if (!selectedNode || selectedNode.type === "slot" || !targetNodeId) return;

        const targetNode = nodes.find((node) => node.id === targetNodeId);
        if (
            !targetNode ||
            !canTargetAcrossStateBoundaries(
                selectedNode,
                targetNode,
                nodes
            )
        ) {
            return;
        }

        setEdges((currentEdges) => {
            const withoutPreviousDirectTarget = currentEdges.filter((edge) => {
                if (
                    edge.source !== selectedNode.id ||
                    edge.sourceHandle !== event.id
                ) {
                    return true;
                }

                if (!event.target) {
                    return true;
                }

                return edge.target !== event.target;
            });

            const alreadyExists = withoutPreviousDirectTarget.some(
                (edge) =>
                    edge.source === selectedNode.id &&
                    edge.sourceHandle === event.id &&
                    edge.target === targetNodeId
            );

            if (alreadyExists) {
                return withoutPreviousDirectTarget;
            }

            return addEdge(
                {
                    id: `edge-${selectedNode.id}-${event.id}-${targetNodeId}-${crypto.randomUUID()}`,
                    source: selectedNode.id,
                    target: targetNodeId,
                    sourceHandle: event.id,
                    targetHandle: getTransitionTargetHandleForNode(targetNode),
                    label: event.id,
                    type: "smartTransition",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    data: { cond: "", assignments: [], assign: null },
                },
                withoutPreviousDirectTarget
            );
        });

        updateNodeEvent(selectedNode.id, event.id, {
            selectedPackage: getSkillPackageName(
                targetNode.data?.fullSkillName
            ),
            selectedSkill:
                targetNode.data?.fullSkillName?.split("#")[0] ||
                targetNode.data?.label ||
                "",
            target: targetNodeId,
        });
    };

    return {
        drawerData,
        setDrawerData,
        slotConnectionDrag,
        openConditionDrawer,
        isValidConnection,
        handleConnectStart,
        handleConnectEnd,
        onConnect,
        clearTransitionSelection,
        clearSlotEdgeSelection,
        clearAllEdgeSelection,
        selectTransitionEdge,
        selectSlotEdge,
        onEdgeDoubleClick,
        handleConfirmDrawer,
        updateNodeEvent,
        setExistingTargetForEvent,
    };
}
