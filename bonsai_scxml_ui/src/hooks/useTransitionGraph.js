import { useCallback, useRef, useState } from "react";
import { MarkerType } from "@xyflow/react";
import {
    COMPOUND_PADDING_X,
    getCompoundChildrenRight,
    getCompoundExitGutterWidth,
    getDirectCompoundForNode,
    getLaneForNode,
    getTransitionTargetHandleForNode,
    isCompoundInitialChildCandidate,
} from "../utils/editorGeometry";
import { getSkillPackageName } from "../utils/editorScxml";
import {
    canTargetVisualNode,
    getLogicalEdgeSourceHandle,
    getLogicalEdgeSourceId,
    getSemanticTransitionTarget,
    makeSelfLoopControlPoints,
} from "../utils/transitionSemantics";
import { rebuildBoundaryTransitionsIncremental } from "../utils/boundaryTransitions";
import {
    getBoundarySourceEvent,
    getExitedBoundarySteps,
} from "./transitionGraph/boundaryRouting";
import {
    buildConditionDrawerData,
    createClosedConditionDrawerState,
} from "./transitionGraph/conditionDrawer";
import { useSlotConnections } from "./transitionGraph/useSlotConnections";
import { createTransitionDrawerCommitHandler } from "./transitionGraph/drawerCommit";

export function useTransitionGraph({
    nodes,
    edges,
    slotNodes,
    slotEdges,
    setNodes,
    setEdges,
    setSlotEdges,
    setGlobalDataModel,
    setSelectedNodeId,
    updateNodeInternals,
    selectTransitionEdge,
    syncTransitionsForSource,
    checkSlotConnection,
    syncSlotsAfterCommit,
    onSkillSlotConnectionApplied,
}) {
    const reconnectingEdgeRef = useRef(null);
    const [drawerData, setDrawerData] = useState(
        createClosedConditionDrawerState
    );
    const {
        slotConnectionDrag,
        setSlotConnectionDrag,
        validateSlotConnection,
        handleConnectStart,
        handleConnectEnd,
        handleFlowSlotConnect,
        handleSlotReconnect,
    } = useSlotConnections({
        nodes,
        slotNodes,
        slotEdges,
        setNodes,
        setSlotEdges,
        setSelectedNodeId,
        checkSlotConnection,
        syncSlotsAfterCommit,
        onSkillSlotConnectionApplied,
    });

    const openConditionDrawer = useCallback(
        (
            sourceId,
            sourceHandle = "",
            initialTargetId = null,
            customEdges = null,
            options = null
        ) => {
            const nextDrawerData = buildConditionDrawerData({
                sourceId,
                sourceHandle,
                initialTargetId,
                customEdges,
                options,
                nodes,
                edges,
            });
            if (nextDrawerData) {
                setDrawerData(nextDrawerData);
            }
        },
        [nodes, edges]
    );

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

        const slotValidation = validateSlotConnection(connection);
        if (slotValidation !== null) {
            return slotValidation;
        }

        const reconnectingEdge = reconnectingEdgeRef.current;
        if (reconnectingEdge) {
            const destinationNode = nodes.find(
                (node) => node.id === connection.target
            );
            const logicalSourceNode = nodes.find(
                (node) => node.id === getLogicalEdgeSourceId(reconnectingEdge)
            );

            return Boolean(
                destinationNode &&
                logicalSourceNode &&
                ["transition-target", "target"].includes(connection.targetHandle) &&
                canTargetVisualNode(logicalSourceNode, destinationNode, nodes)
            );
        }

        const sourceNode = nodes.find(
            (node) => node.id === connection.source
        );
        const targetNode = nodes.find(
            (node) => node.id === connection.target
        );

        const boundarySource = getBoundarySourceEvent(
            sourceNode,
            connection.sourceHandle,
            nodes
        );
        const semanticSourceNode =
            boundarySource?.logicalSourceNode || sourceNode;

        if (
            !sourceNode ||
            !semanticSourceNode ||
            !targetNode ||
            (semanticSourceNode.data?.isSkillClone || semanticSourceNode.data?.isStateClone) ||
            !canTargetVisualNode(semanticSourceNode, targetNode, nodes)
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
    }, [nodes, validateSlotConnection]);

    const handleReconnectStart = useCallback((_, edge) => {
        // Only target-end transition reconnects are exposed. React Flow reports
        // the fixed opposite handle here, so keep the edge itself regardless
        // of that handleType value for validation during the drag.
        reconnectingEdgeRef.current = edge;
        setSlotConnectionDrag(null);
    }, [setSlotConnectionDrag]);

    const handleReconnectEnd = useCallback(() => {
        reconnectingEdgeRef.current = null;
    }, []);

    const onReconnect = useCallback(
        (oldEdge, connection) => {
            reconnectingEdgeRef.current = null;

            if (handleSlotReconnect(oldEdge, connection)) {
                return;
            }

            const existingEdge = edges.find((edge) => edge.id === oldEdge?.id);
            if (
                !existingEdge ||
                existingEdge.data?.boundaryInternalEdge ||
                existingEdge.data?.compoundInternalEdge ||
                existingEdge.data?.parallelInternalEdge ||
                existingEdge.data?.compoundInitialEdge ||
                existingEdge.data?.parallelEntryEdge
            ) {
                return;
            }

            // Only an edge entering a state with exactly one semantic incoming
            // transition may be re-targeted. This mirrors the visible reconnect
            // handle configured by useEditorDisplay.
            const incomingEdges = edges.filter(
                (edge) =>
                    edge.target === existingEdge.target &&
                    !edge.data?.boundaryInternalEdge &&
                    !edge.data?.compoundInternalEdge &&
                    !edge.data?.parallelInternalEdge &&
                    !edge.data?.compoundInitialEdge &&
                    !edge.data?.parallelEntryEdge
            );
            if (incomingEdges.length !== 1 || incomingEdges[0].id !== existingEdge.id) {
                return;
            }

            const destinationNode = nodes.find(
                (node) => node.id === connection.target
            );
            const logicalSourceId = getLogicalEdgeSourceId(existingEdge);
            const logicalSourceHandle = getLogicalEdgeSourceHandle(existingEdge);
            const logicalSourceNode = nodes.find(
                (node) => node.id === logicalSourceId
            );

            if (
                !destinationNode ||
                !logicalSourceNode ||
                !["transition-target", "target"].includes(
                    connection.targetHandle || getTransitionTargetHandleForNode(destinationNode)
                ) ||
                !canTargetVisualNode(logicalSourceNode, destinationNode, nodes)
            ) {
                return;
            }

            let updatedMatchingEvent = false;
            const nextNodes = nodes.map((node) => {
                if (node.id !== logicalSourceId) return node;

                const events = (node.data?.events || []).map((event) => {
                    const matchesEvent =
                        String(event?.id || "") === String(logicalSourceHandle);
                    const matchesOldTarget =
                        !event.target || String(event.target) === String(existingEdge.target || "");

                    if (updatedMatchingEvent || !matchesEvent || !matchesOldTarget) {
                        return event;
                    }

                    updatedMatchingEvent = true;
                    return {
                        ...event,
                        target: destinationNode.id,
                        selectedPackage: getSkillPackageName(
                            destinationNode.data?.fullSkillName
                        ),
                        selectedSkill:
                            destinationNode.data?.fullSkillName?.split("#")[0] ||
                            destinationNode.data?.label ||
                            "",
                    };
                });

                return updatedMatchingEvent
                    ? { ...node, data: { ...node.data, events } }
                    : node;
            });

            const nextEdges = edges.map((edge) =>
                edge.id === existingEdge.id
                    ? {
                          ...edge,
                          target: destinationNode.id,
                          targetHandle:
                              connection.targetHandle ||
                              getTransitionTargetHandleForNode(destinationNode),
                          data: {
                              ...(edge.data || {}),
                              editorTargetInstanceId:
                                  destinationNode.data?.editorInstanceId || "",
                          },
                      }
                    : edge
            );

            const normalized = rebuildBoundaryTransitionsIncremental(
                nextNodes,
                nextEdges,
                {
                    previousEdges: edges,
                    sourceKeys: [
                        {
                            sourceId: logicalSourceId,
                            sourceHandle: logicalSourceHandle,
                        },
                    ],
                }
            );

            setNodes(normalized.nodes);
            setEdges(normalized.edges);
            (normalized.affectedNodeIds || []).forEach((nodeId) =>
                requestAnimationFrame(() => updateNodeInternals(nodeId))
            );
            requestAnimationFrame(() => updateNodeInternals(destinationNode.id));
            void syncTransitionsForSource?.(logicalSourceId);
        },
        [
            edges,
            nodes,
            setEdges,
            setNodes,
            updateNodeInternals,
            syncTransitionsForSource,
            handleSlotReconnect,
        ]
    );

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

            if (handleFlowSlotConnect(params)) {
                return;
            }

            const sourceNode = nodes.find(
                (n) => n.id === params.source
            );

            const targetNode = nodes.find(
                (n) => n.id === params.target
            );

            if (
                !sourceNode ||
                !targetNode ||
                sourceNode.data?.isSkillClone ||
                sourceNode.data?.isStateClone
            ) {
                return;
            }

            // Do not let a normal transition cross a compound/parallel entry
            // boundary and land directly on an interior state. The external
            // edge must terminate on the container's left entry handle first.
            if (
                !canTargetVisualNode(
                    sourceNode,
                    targetNode,
                    nodes
                )
            ) {
                return;
            }

            const semanticTargetNode = getSemanticTransitionTarget(
                targetNode,
                nodes
            );

            const boundarySource = getBoundarySourceEvent(
                sourceNode,
                params.sourceHandle,
                nodes
            );
            const logicalSourceNode =
                boundarySource?.logicalSourceNode || sourceNode;
            const logicalSourceId = logicalSourceNode.id;
            const logicalSourceHandle = String(
                boundarySource?.logicalHandle ||
                params.sourceHandle ||
                "success"
            );

            const exitedBoundarySteps = getExitedBoundarySteps(
                logicalSourceNode,
                semanticTargetNode,
                nodes
            );
            const currentBoundaryIndex = boundarySource
                ? exitedBoundarySteps.findIndex(
                    (step) => step.anchor.id === sourceNode.id
                )
                : -1;
            const boundaryStepsToCreate =
                currentBoundaryIndex >= 0
                    ? exitedBoundarySteps.slice(currentBoundaryIndex + 1)
                    : exitedBoundarySteps;

            const logicalDuplicate = edges.some((edge) =>
                !edge.data?.boundaryInternalEdge &&
                !edge.data?.compoundInternalEdge &&
                !edge.data?.parallelInternalEdge &&
                getLogicalEdgeSourceId(edge) === logicalSourceId &&
                String(getLogicalEdgeSourceHandle(edge)) === logicalSourceHandle &&
                edge.target === params.target
            );

            if (logicalDuplicate) {
                openConditionDrawer(
                    logicalSourceId,
                    logicalSourceHandle,
                    params.target
                );
                return;
            }

            // Any transition that crosses a Compound/Parallel boundary is
            // represented as a chain of display-only helper edges. The final
            // external edge keeps the original skill + exit token in metadata,
            // so drawing onward from a border point preserves skill.event.
            if (boundarySource || boundaryStepsToCreate.length > 0) {
                const baseName =
                    logicalSourceNode.data?.label ||
                    String(logicalSourceNode.data?.fullSkillName || "state")
                        .split("#")[0]
                        .split(".")
                        .pop();
                const exitLabel = `${baseName}.${logicalSourceHandle}`;
                const sharedExitId = String(
                    boundarySource?.event?.id ||
                    `${logicalSourceId}-${logicalSourceHandle}`
                );

                let currentVisualSourceId = sourceNode.id;
                let currentVisualSourceHandle =
                    params.sourceHandle || logicalSourceHandle;
                const helperEdges = [];
                const anchorUpdates = new Map();
                const crossedKinds = new Set();

                boundaryStepsToCreate.forEach((step) => {
                    crossedKinds.add(step.kind);
                    const exitId = sharedExitId;

                    helperEdges.push({
                        id:
                            `edge-internal-boundary-${logicalSourceId}-` +
                            `${logicalSourceHandle}-${step.anchor.id}-${crypto.randomUUID()}`,
                        source: currentVisualSourceId,
                        target: step.anchor.id,
                        sourceHandle: currentVisualSourceHandle,
                        targetHandle: `target-${exitId}`,
                        type: "smoothstep",
                        selectable: false,
                        focusable: false,
                        style: {
                            strokeDasharray: "4 4",
                            stroke: "#0284c7",
                            strokeWidth: 1.5,
                        },
                        data: {
                            boundaryInternalEdge: true,
                            boundaryKind: step.kind,
                            boundaryExitId: exitId,
                            boundaryOriginalSource: logicalSourceId,
                            boundaryOriginalSourceHandle: logicalSourceHandle,
                            ...(step.kind === "compound"
                                ? {
                                    compoundInternalEdge: true,
                                    compoundExitId: exitId,
                                }
                                : {
                                    parallelInternalEdge: true,
                                    parallelExitId: exitId,
                                }),
                        },
                    });

                    anchorUpdates.set(step.anchor.id, {
                        kind: step.kind,
                        exitId,
                    });
                    currentVisualSourceId = step.anchor.id;
                    currentVisualSourceHandle = exitId;
                });

                // If the drag started from an already existing border point,
                // preserve which kinds of boundary have already been crossed.
                exitedBoundarySteps
                    .slice(0, Math.max(0, currentBoundaryIndex + 1))
                    .forEach((step) => crossedKinds.add(step.kind));

                const externalEdge = {
                    id:
                        `edge-${logicalSourceId}-${logicalSourceHandle}-` +
                        `${params.target}-${crypto.randomUUID()}`,
                    source: currentVisualSourceId,
                    target: params.target,
                    sourceHandle: currentVisualSourceHandle,
                    targetHandle: params.targetHandle,
                    label: logicalSourceHandle,
                    type: "smartTransition",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,
                        boundaryOriginalSource: logicalSourceId,
                        boundaryOriginalSourceHandle: logicalSourceHandle,
                        boundaryExitId: sharedExitId,
                        ...(crossedKinds.has("compound") || sourceNode.type === "compound"
                            ? {
                                compoundOriginalSource: logicalSourceId,
                                compoundOriginalSourceHandle: logicalSourceHandle,
                                compoundExitId: sharedExitId,
                            }
                            : {}),
                        ...(crossedKinds.has("parallel") || sourceNode.type === "parallelLane"
                            ? {
                                parallelOriginalSource: logicalSourceId,
                                parallelOriginalSourceHandle: logicalSourceHandle,
                                parallelExitId: sharedExitId,
                            }
                            : {}),
                    },
                };

                const nextEdges = [...edges, externalEdge, ...helperEdges];
                setEdges(nextEdges);

                setNodes((currentNodes) => {
                    const childRightByCompound = new Map();
                    return currentNodes.map((node) => {
                        if (node.id === logicalSourceId) {
                            const events = node.data?.events || [];
                            if (events.some((event) => String(event.id) === logicalSourceHandle)) {
                                return node;
                            }
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    events: [
                                        ...events,
                                        {
                                            id: logicalSourceHandle,
                                            selectedPackage: getSkillPackageName(
                                                targetNode?.data?.fullSkillName
                                            ),
                                            selectedSkill:
                                                targetNode?.data?.fullSkillName?.split("#")[0] || "",
                                            target: params.target,
                                            cond: "",
                                            assignments: [],
                                            assignLocation: "",
                                            assignExpr: "",
                                        },
                                    ],
                                },
                            };
                        }

                        const update = anchorUpdates.get(node.id);
                        if (!update) return node;

                        const currentEvents = (node.data?.events || []).filter(
                            (event) => String(event?.id || "") !== "compound-entry"
                        );
                        const existingIndex = currentEvents.findIndex(
                            (event) => String(event.id) === String(update.exitId)
                        );
                        const boundaryEvent = {
                            ...(existingIndex >= 0 ? currentEvents[existingIndex] : {}),
                            id: update.exitId,
                            name: exitLabel,
                            rawEvent: exitLabel,
                            target: params.target,
                            sourceNodeId: logicalSourceId,
                            transitionHandleId: logicalSourceHandle,
                        };
                        const nextEvents = existingIndex >= 0
                            ? currentEvents.map((event, index) =>
                                index === existingIndex ? boundaryEvent : event
                            )
                            : [...currentEvents, boundaryEvent];

                        if (node.type !== "compound") {
                            return {
                                ...node,
                                data: { ...node.data, events: nextEvents },
                            };
                        }

                        let childRight = childRightByCompound.get(node.id);
                        if (childRight === undefined) {
                            childRight = getCompoundChildrenRight(
                                node.id,
                                currentNodes
                            );
                            childRightByCompound.set(node.id, childRight);
                        }
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
                            data: { ...node.data, events: nextEvents },
                        };
                    });
                });

                requestAnimationFrame(() => {
                    anchorUpdates.forEach((_, nodeId) =>
                        updateNodeInternals(nodeId)
                    );
                });

                const outgoingFromHandle = nextEdges.filter(
                    (edge) =>
                        !edge.data?.boundaryInternalEdge &&
                        getLogicalEdgeSourceId(edge) === logicalSourceId &&
                        String(getLogicalEdgeSourceHandle(edge)) === logicalSourceHandle
                );
                if (outgoingFromHandle.length >= 2) {
                    openConditionDrawer(
                        logicalSourceId,
                        logicalSourceHandle,
                        params.target,
                        nextEdges
                    );
                }
                void syncTransitionsForSource?.(logicalSourceId);
                return;
            }

            // Container/lane semantics follow the real target. A skill clone
            // is only a visual endpoint and must not make a transition appear
            // to enter or leave a state boundary that its original does not.
            const sourceLane = getLaneForNode(
                sourceNode,
                nodes
            );

            const targetLane = getLaneForNode(
                semanticTargetNode,
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
                    semanticTargetNode,
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

                void syncTransitionsForSource?.(params.source);
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

                void syncTransitionsForSource?.(params.source);
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
                    ...(params.source === params.target
                        ? { controlPoints: makeSelfLoopControlPoints() }
                        : {}),
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
            void syncTransitionsForSource?.(params.source);
        },
        [
            edges,
            nodes,
            setEdges,
            setNodes,
            updateNodeInternals,
            syncTransitionsForSource,
            handleFlowSlotConnect,
            openConditionDrawer,
        ]
    );

    const onEdgeDoubleClick = useCallback(
        (event, edge) => {
            selectTransitionEdge(edge.id);
            openConditionDrawer(
                getLogicalEdgeSourceId(edge),
                getLogicalEdgeSourceHandle(edge),
                edge.target
            );
        },
        [openConditionDrawer, selectTransitionEdge]
    );

    const handleConfirmDrawer = createTransitionDrawerCommitHandler({
        drawerData,
        edges,
        nodes,
        setGlobalDataModel,
        setNodes,
        setEdges,
        updateNodeInternals,
        syncTransitionsForSource,
        setDrawerData,
    });


    return {
        drawerData,
        setDrawerData,
        slotConnectionDrag,
        openConditionDrawer,
        isValidConnection,
        handleConnectStart,
        handleConnectEnd,
        handleReconnectStart,
        handleReconnectEnd,
        onReconnect,
        onConnect,
        onEdgeDoubleClick,
        handleConfirmDrawer,
    };
}
