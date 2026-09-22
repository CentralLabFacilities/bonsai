import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    getTransitionHighlightColor,
    highlightSelectedTransitions,
    withSmartTransitionRouting,
} from "../utils/editorGraph";
import {
    getAbsoluteNodePosition,
    getNodeSize,
    isAutoParallelLaneCompound,
} from "../utils/editorGeometry";

const SLOT_EDGE_INACTIVE_COLOR = "#64748b";
const HOVER_INACTIVE_EDGE_COLOR = "#94a3b8";

const pointInsideRect = (point, rect) =>
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom;

const segmentIntersectsRect = (start, end, rect) => {
    if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) {
        return true;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let tMin = 0;
    let tMax = 1;

    const clip = (p, q) => {
        if (p === 0) return q >= 0;
        const ratio = q / p;
        if (p < 0) {
            if (ratio > tMax) return false;
            if (ratio > tMin) tMin = ratio;
        } else {
            if (ratio < tMin) return false;
            if (ratio < tMax) tMax = ratio;
        }
        return true;
    };

    return (
        clip(-dx, start.x - rect.left) &&
        clip(dx, rect.right - start.x) &&
        clip(-dy, start.y - rect.top) &&
        clip(dy, rect.bottom - start.y) &&
        tMin <= tMax
    );
};

export function useEditorDisplay({
    hoveredEditorNodeId,
    hoveredEditorEdgeId,
    selectedNodes,
    selectedNodeId,
    edges,
    nodeById,
    slotNodeIdSet,
    slotEdges,
    updatePersistentEdgeControlPoints,
    hoveredSlotAccessNodeId,
    semanticNodes,
    semanticChildrenByParent,
    nodes,
    childIdsByParent,
    activeMode,
    injectedNodes,
    injectedSlotNodes,
    isDraggingNode,
    hiddenNodeIds,
    parallelDropTargetId,
    compoundDropTargetId,
}) {
    // Dragging should stay on the cheapest possible render path. Hover/focus
    // dimming is useful while inspecting the graph, but forcing every node and
    // edge through that styling pass on each drag frame is unnecessary.
    const activeCanvasFocusNodeId = isDraggingNode ? null : hoveredEditorNodeId;
    const activeHoveredEditorEdgeId = isDraggingNode
        ? null
        : hoveredEditorEdgeId;

    const selectedTransitionNodeIdKey = useMemo(
        () =>
            [
                ...new Set([
                    ...selectedNodes.map((node) => node.id),
                    ...(selectedNodeId ? [selectedNodeId] : []),
                    ...(activeCanvasFocusNodeId ? [activeCanvasFocusNodeId] : []),
                ]),
            ]
                .sort()
                .join("\u0001"),
        [selectedNodes, selectedNodeId, activeCanvasFocusNodeId]
    );

    // Keep true editor selection visually independent from hover focus. A
    // hovered node may dim unrelated context, but it must never fade nodes the
    // user has explicitly selected (including Ctrl/Meta multi-selection).
    const selectedNodeIdSet = useMemo(
        () =>
            new Set([
                ...selectedNodes.map((node) => node.id),
                ...(selectedNodeId ? [selectedNodeId] : []),
            ]),
        [selectedNodes, selectedNodeId]
    );

    const cloneGroupByNodeId = useMemo(() => {
        const clonesByOriginalId = new Map();

        (nodes || []).forEach((node) => {
            if (!node.data?.isSkillClone || !node.data?.cloneOfNodeId) return;
            const originalId = node.data.cloneOfNodeId;
            if (!clonesByOriginalId.has(originalId)) {
                clonesByOriginalId.set(originalId, []);
            }
            clonesByOriginalId.get(originalId).push(node.id);
        });

        const groups = new Map();
        clonesByOriginalId.forEach((cloneIds, originalId) => {
            const group = new Set([originalId, ...cloneIds]);
            group.forEach((nodeId) => groups.set(nodeId, group));
        });

        return groups;
    }, [nodes]);

    const selectedVisualNodeIdSet = useMemo(() => {
        const ids = new Set(selectedNodeIdSet);
        selectedNodeIdSet.forEach((nodeId) => {
            cloneGroupByNodeId.get(nodeId)?.forEach((linkedId) => ids.add(linkedId));
        });
        return ids;
    }, [cloneGroupByNodeId, selectedNodeIdSet]);

    const cloneLinkedHighlightIds = useMemo(() => {
        const ids = new Set();
        selectedNodeIdSet.forEach((nodeId) => {
            cloneGroupByNodeId.get(nodeId)?.forEach((linkedId) => {
                if (linkedId !== nodeId) ids.add(linkedId);
            });
        });

        if (activeCanvasFocusNodeId) {
            cloneGroupByNodeId
                .get(activeCanvasFocusNodeId)
                ?.forEach((linkedId) => ids.add(linkedId));
        }

        return ids;
    }, [activeCanvasFocusNodeId, cloneGroupByNodeId, selectedNodeIdSet]);

    const normalizedTransitionEdges = useMemo(
        () =>
            edges.map((edge) => {
                let normalizedEdge = edge;

                if (!normalizedEdge.targetHandle) {
                    const targetNode = nodeById.get(normalizedEdge.target);

                    if (
                        targetNode &&
                        targetNode.type !== "compound" &&
                        targetNode.type !== "parallel" &&
                        targetNode.type !== "parallelLane"
                    ) {
                        normalizedEdge = {
                            ...normalizedEdge,
                            targetHandle: "transition-target",
                        };
                    }
                }

                // Loaded/older self loops may not have editor control points.
                // Give them a deterministic two-point route so they visibly
                // leave the node and return around its top edge.
                if (
                    normalizedEdge.source === normalizedEdge.target &&
                    !(
                        Array.isArray(normalizedEdge.data?.controlPoints) &&
                        normalizedEdge.data.controlPoints.length >= 2
                    )
                ) {
                    normalizedEdge = {
                        ...normalizedEdge,
                        data: {
                            ...(normalizedEdge.data || {}),
                            controlPoints: [
                                {
                                    id: `${normalizedEdge.id}-self-source`,
                                    anchor: "source",
                                    dx: 76,
                                    dy: -92,
                                },
                                {
                                    id: `${normalizedEdge.id}-self-target`,
                                    anchor: "target",
                                    dx: -76,
                                    dy: -92,
                                },
                            ],
                        },
                    };
                }

                return normalizedEdge;
            }),
        [edges, nodeById]
    );

    const compoundAvoidanceCacheRef = useRef(new Map());
    const compoundAvoidanceNodesDependency = isDraggingNode ? null : nodes;
    const compoundAvoidanceByEdgeId = useMemo(() => {
        if (!compoundAvoidanceNodesDependency) {
            return compoundAvoidanceCacheRef.current;
        }

        const liveNodes = compoundAvoidanceNodesDependency;
        const liveNodeById = new Map(
            liveNodes.map((node) => [node.id, node])
        );
        const compounds = liveNodes.filter(
            (node) => node.type === "compound" && !node.hidden
        );
        const ancestorIdsByNodeId = new Map();
        const getAncestorIds = (node) => {
            if (!node) return new Set();
            const cached = ancestorIdsByNodeId.get(node.id);
            if (cached) return cached;

            const ancestors = new Set();
            const visited = new Set();
            let parentId = node.parentId;

            while (parentId && !visited.has(parentId)) {
                visited.add(parentId);
                ancestors.add(parentId);
                parentId = liveNodeById.get(parentId)?.parentId;
            }

            ancestorIdsByNodeId.set(node.id, ancestors);
            return ancestors;
        };
        const next = new Map();

        normalizedTransitionEdges.forEach((edge) => {
            if (
                edge.data?.boundaryInternalEdge ||
                edge.data?.compoundInternalEdge ||
                edge.data?.parallelEntryEdge ||
                edge.data?.compoundInitialEdge
            ) {
                return;
            }

            const sourceNode = liveNodeById.get(edge.source);
            const targetNode = liveNodeById.get(edge.target);
            if (!sourceNode || !targetNode) return;

            const sourcePosition = getAbsoluteNodePosition(
                sourceNode,
                liveNodes
            );
            const targetPosition = getAbsoluteNodePosition(
                targetNode,
                liveNodes
            );
            const sourceSize = getNodeSize(sourceNode);
            const targetSize = getNodeSize(targetNode);
            const start = {
                x: sourcePosition.x + sourceSize.width / 2,
                y: sourcePosition.y + sourceSize.height / 2,
            };
            const end = {
                x: targetPosition.x + targetSize.width / 2,
                y: targetPosition.y + targetSize.height / 2,
            };

            const sourceAncestorIds = getAncestorIds(sourceNode);
            const targetAncestorIds = getAncestorIds(targetNode);

            const crossesCompound = compounds.some((compound) => {
                if (
                    compound.id === sourceNode.id ||
                    compound.id === targetNode.id ||
                    sourceAncestorIds.has(compound.id) ||
                    targetAncestorIds.has(compound.id)
                ) {
                    return false;
                }

                const position = getAbsoluteNodePosition(compound, liveNodes);
                const size = getNodeSize(compound);
                const padding = 18;
                const rect = {
                    left: position.x - padding,
                    right: position.x + size.width + padding,
                    top: position.y - padding,
                    bottom: position.y + size.height + padding,
                };

                return segmentIntersectsRect(start, end, rect);
            });

            if (crossesCompound) {
                next.set(edge.id, true);
            }
        });

        compoundAvoidanceCacheRef.current = next;
        return next;
    }, [compoundAvoidanceNodesDependency, normalizedTransitionEdges]);

    const smartTransitionEdges = useMemo(
        () =>
            withSmartTransitionRouting(normalizedTransitionEdges).map(
                (edge) => ({
                    ...edge,
                    data: {
                        ...(edge.data || {}),
                        ...(compoundAvoidanceByEdgeId.has(edge.id)
                            ? { forceObstacleRouting: true }
                            : {}),
                        onControlPointsChange: (controlPoints) =>
                            updatePersistentEdgeControlPoints(
                                edge.id,
                                controlPoints,
                                "transition"
                            ),
                    },
                })
            ),
        [
            normalizedTransitionEdges,
            compoundAvoidanceByEdgeId,
            updatePersistentEdgeControlPoints,
        ]
    );

    const highlightedTransitionEdges = useMemo(
        () =>
            highlightSelectedTransitions(
                smartTransitionEdges,
                new Set(
                    selectedTransitionNodeIdKey
                        ? selectedTransitionNodeIdKey.split("\u0001")
                        : []
                )
            ),
        [smartTransitionEdges, selectedTransitionNodeIdKey]
    );

    const selectedSlotContextId = activeCanvasFocusNodeId || selectedNodeId;
    const hasSelectedSlotContext = Boolean(
        selectedSlotContextId &&
            (nodeById.has(selectedSlotContextId) ||
                slotNodeIdSet.has(selectedSlotContextId))
    );
    const isSlotDetailsConnectionPreview = Boolean(
        hoveredSlotAccessNodeId &&
            selectedNodeId &&
            slotNodeIdSet.has(selectedNodeId)
    );

    const inactiveSlotEdgeCacheRef = useRef(new WeakMap());
    const hoveredSlotEdgeCacheRef = useRef(new WeakMap());

    const routedSlotEdges = useMemo(
        () =>
            slotEdges.map((edge) => {
                const access = edge.data?.access === "write" ? "write" : "read";

                return {
                    ...edge,
                    type: "smartTransition",
                    data: {
                        ...(edge.data || {}),
                        access,
                        onControlPointsChange: (controlPoints) =>
                            updatePersistentEdgeControlPoints(
                                edge.id,
                                controlPoints,
                                "slot"
                            ),
                    },
                };
            }),
        [slotEdges, updatePersistentEdgeControlPoints]
    );

    const editableSlotEdges = useMemo(() => {
        if (!hasSelectedSlotContext && !isSlotDetailsConnectionPreview) {
            return routedSlotEdges;
        }

        return routedSlotEdges.map((edge) => {
            const access = edge.data?.access === "write" ? "write" : "read";
            const semanticColor = SLOT_CONNECTION_COLORS[access];

            const skillNodeId = edge.data?.skillNodeId || edge.source;
            const slotNodeId = edge.data?.slotNodeId || edge.target;
            const isHoveredSlotDetailsConnection =
                isSlotDetailsConnectionPreview &&
                (skillNodeId === hoveredSlotAccessNodeId ||
                    edge.source === hoveredSlotAccessNodeId ||
                    edge.target === hoveredSlotAccessNodeId) &&
                (slotNodeId === selectedNodeId ||
                    edge.source === selectedNodeId ||
                    edge.target === selectedNodeId);

            const isConnectedToSelection = isSlotDetailsConnectionPreview
                ? isHoveredSlotDetailsConnection
                : skillNodeId === selectedSlotContextId ||
                  slotNodeId === selectedSlotContextId ||
                  edge.source === selectedSlotContextId ||
                  edge.target === selectedSlotContextId;

            if (isConnectedToSelection && !isHoveredSlotDetailsConnection) {
                return edge;
            }

            if (isHoveredSlotDetailsConnection) {
                const cachedHovered = hoveredSlotEdgeCacheRef.current.get(edge);
                if (cachedHovered) return cachedHovered;

                const hoveredEdge = {
                    ...edge,
                    style: {
                        ...(edge.style || {}),
                        stroke: semanticColor,
                        strokeWidth: 3,
                        strokeDasharray: edge.style?.strokeDasharray || "5 5",
                        opacity: 1,
                    },
                    markerEnd: {
                        ...(edge.markerEnd || {}),
                        type: edge.markerEnd?.type || MarkerType.ArrowClosed,
                        color: semanticColor,
                    },
                };
                hoveredSlotEdgeCacheRef.current.set(edge, hoveredEdge);
                return hoveredEdge;
            }

            const cachedInactive = inactiveSlotEdgeCacheRef.current.get(edge);
            if (cachedInactive) return cachedInactive;

            const inactiveEdge = {
                ...edge,
                style: {
                    ...(edge.style || {}),
                    stroke: SLOT_EDGE_INACTIVE_COLOR,
                    strokeWidth: 1.35,
                    strokeDasharray: edge.style?.strokeDasharray || "5 5",
                    opacity: 0.3,
                },
                markerEnd: {
                    ...(edge.markerEnd || {}),
                    type: edge.markerEnd?.type || MarkerType.ArrowClosed,
                    color: SLOT_EDGE_INACTIVE_COLOR,
                },
            };
            inactiveSlotEdgeCacheRef.current.set(edge, inactiveEdge);
            return inactiveEdge;
        });
    }, [
        routedSlotEdges,
        isSlotDetailsConnectionPreview,
        hoveredSlotAccessNodeId,
        selectedNodeId,
        hasSelectedSlotContext,
        selectedSlotContextId,
    ]);

    const compoundInitialEdges = useMemo(
        () =>
            semanticNodes
                .filter(
                    (node) =>
                        node.type === "compound" && !node.data?.isCollapsed
                )
                .map((compound) => {
                    const directChildren =
                        semanticChildrenByParent.get(compound.id) || [];
                    const initialChild = directChildren.find(
                        (node) =>
                            node.id === compound.data?.initialChildId ||
                            (!compound.data?.initialChildId &&
                                node.data?.isInitial)
                    );

                    if (!initialChild) return null;

                    const initialTargetHandle =
                        initialChild.type === "parallel"
                            ? "target"
                            : initialChild.type === "compound"
                              ? "compound-entry"
                              : "transition-target";

                    return {
                        id: `edge-compound-initial-${compound.id}-${initialChild.id}`,
                        source: compound.id,
                        target: initialChild.id,
                        sourceHandle: "compound-entry",
                        targetHandle: initialTargetHandle,
                        label: "",
                        type: "straight",
                        selectable: false,
                        focusable: false,
                        deletable: false,
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: "#111827",
                        },
                        style: {
                            stroke: "#111827",
                            strokeWidth: 1.6,
                        },
                        data: {
                            compoundInitialEdge: true,
                            displayOnly: true,
                        },
                    };
                })
                .filter(Boolean),
        [semanticNodes, semanticChildrenByParent]
    );

    const parallelEntryEdgesCacheRef = useRef([]);
    const parallelEntryNodesDependency = isDraggingNode ? null : nodes;
    const parallelEntryEdges = useMemo(() => {
        if (!parallelEntryNodesDependency) {
            return parallelEntryEdgesCacheRef.current;
        }

        const liveNodeById = new Map(
            parallelEntryNodesDependency.map((node) => [node.id, node])
        );
        const next = parallelEntryNodesDependency
            .filter(
                (node) =>
                    node.type === "parallel" && !node.data?.isCollapsed
            )
            .flatMap((parallel) => {
                const lanes = (childIdsByParent.get(parallel.id) || [])
                    .map((id) => liveNodeById.get(id))
                    .filter((node) => node?.type === "parallelLane");

                return lanes
                    .map((lane) => {
                        const directChildren = (childIdsByParent.get(lane.id) || [])
                            .map((id) => liveNodeById.get(id))
                            .filter(Boolean);

                        const candidates = directChildren.filter(
                            (node) =>
                                node.type !== "slot" &&
                                node.type !== "parallelLane"
                        );

                        if (candidates.length === 0) return null;

                        const sortedCandidates = [...candidates].sort((a, b) => {
                            const ax = Number(a.position?.x || 0);
                            const bx = Number(b.position?.x || 0);
                            if (ax !== bx) return ax - bx;

                            const ay = Number(a.position?.y || 0);
                            const by = Number(b.position?.y || 0);
                            return ay - by;
                        });

                        const target =
                            candidates.find(isAutoParallelLaneCompound) ||
                            candidates.find((node) => node.data?.isInitial) ||
                            sortedCandidates[0];

                        const targetHandle =
                            target.type === "compound"
                                ? "compound-entry"
                                : target.type === "parallel"
                                  ? "target"
                                  : "transition-target";

                        return {
                            id: `edge-parallel-entry-${parallel.id}-${lane.id}-${target.id}`,
                            source: lane.id,
                            target: target.id,
                            sourceHandle: "parallel-entry",
                            targetHandle,
                            label: "",
                            type: "straight",
                            selectable: false,
                            focusable: false,
                            deletable: false,
                            markerEnd: {
                                type: MarkerType.ArrowClosed,
                                color: "#0284c7",
                            },
                            style: {
                                stroke: "#0284c7",
                                strokeWidth: 1.5,
                            },
                            data: {
                                parallelEntryEdge: true,
                                parallelLaneId: lane.id,
                                displayOnly: true,
                            },
                        };
                    })
                    .filter(Boolean);
            });

        parallelEntryEdgesCacheRef.current = next;
        return next;
    }, [parallelEntryNodesDependency, childIdsByParent]);

    const baseVisibleNodes = useMemo(
        () =>
            activeMode === "slots" || activeMode === "overview"
                ? [...injectedNodes, ...injectedSlotNodes]
                : injectedNodes,
        [activeMode, injectedNodes, injectedSlotNodes]
    );

    const [smartRoutingNodes, setSmartRoutingNodes] = useState(baseVisibleNodes);
    const smartRoutingNodesDependency = isDraggingNode ? null : baseVisibleNodes;

    useEffect(() => {
        // Smart-edge obstacle routing is one of the most expensive parts of a
        // large graph. Keep the provider snapshot fixed while the pointer is
        // moving and refresh it once the drag finishes. Connected edge
        // endpoints still follow React Flow's live node position; only the
        // obstacle map waits until drop.
        if (!smartRoutingNodesDependency) return;

        setSmartRoutingNodes((current) =>
            current === smartRoutingNodesDependency
                ? current
                : smartRoutingNodesDependency
        );
    }, [smartRoutingNodesDependency]);

    const dimmedHoverEdgeCacheRef = useRef(new WeakMap());
    const dimmedHoverNodeCacheRef = useRef(new WeakMap());
    const highlightedHoverNodeCacheRef = useRef(new WeakMap());

    const isSlotDetailsFocus = Boolean(
        hoveredSlotAccessNodeId &&
            selectedNodeId &&
            slotNodeIdSet.has(selectedNodeId)
    );

    const visibleEdges = useMemo(() => {
        let nextVisibleEdges = [
            ...highlightedTransitionEdges,
            ...compoundInitialEdges,
            ...parallelEntryEdges,
        ];

        if (activeMode === "slots") {
            const hoveredTransitionEdges = activeCanvasFocusNodeId
                ? highlightedTransitionEdges.filter(
                      (edge) =>
                          edge.source === activeCanvasFocusNodeId ||
                          edge.target === activeCanvasFocusNodeId
                  )
                : [];

            nextVisibleEdges = [...hoveredTransitionEdges, ...editableSlotEdges];
        } else if (activeMode === "overview") {
            nextVisibleEdges = [
                ...highlightedTransitionEdges,
                ...compoundInitialEdges,
                ...parallelEntryEdges,
                ...editableSlotEdges,
            ];
        }

        // This pass now runs once when dragging starts/stops instead of once per
        // node position update because it no longer shares a memo with nodes.
        if (isDraggingNode) {
            nextVisibleEdges = nextVisibleEdges.map((edge) =>
                edge.animated ? { ...edge, animated: false } : edge
            );
        }

        if (hiddenNodeIds.size > 0) {
            nextVisibleEdges = nextVisibleEdges.filter(
                (edge) =>
                    !hiddenNodeIds.has(edge.source) &&
                    !hiddenNodeIds.has(edge.target)
            );
        }

        const hoveredEditorEdge = activeHoveredEditorEdgeId
            ? nextVisibleEdges.find(
                  (edge) => edge.id === activeHoveredEditorEdgeId
              )
            : null;
        const hasHoverFocus = Boolean(
            activeCanvasFocusNodeId || hoveredEditorEdge || isSlotDetailsFocus
        );

        if (!hasHoverFocus) {
            return nextVisibleEdges;
        }

        return nextVisibleEdges.map((edge) => {
            const isCanvasHoverConnection = Boolean(
                activeCanvasFocusNodeId &&
                    (edge.source === activeCanvasFocusNodeId ||
                        edge.target === activeCanvasFocusNodeId)
            );
            const isHoveredEditorEdge = Boolean(
                activeHoveredEditorEdgeId &&
                    edge.id === activeHoveredEditorEdgeId
            );
            const isSlotDetailsConnection = Boolean(
                isSlotDetailsFocus &&
                    ((edge.source === hoveredSlotAccessNodeId &&
                        edge.target === selectedNodeId) ||
                        (edge.target === hoveredSlotAccessNodeId &&
                            edge.source === selectedNodeId))
            );
            const isSelectedTransition = Boolean(
                edge.selected && edge.data?.edgeKind !== "slot"
            );

            // Hover focus is additive to real transition selection. A hovered
            // transition gets the same semantic colour + flow emphasis as a
            // selected transition, while already-selected transitions remain
            // highlighted independently.
            if (isHoveredEditorEdge && edge.data?.edgeKind !== "slot") {
                const color = getTransitionHighlightColor(
                    edge.data?.semanticSourceHandle ||
                        edge.data?.originalSourceHandle ||
                        edge.sourceHandle ||
                        edge.label
                );

                return {
                    ...edge,
                    animated: true,
                    style: {
                        ...(edge.style || {}),
                        stroke: color,
                        opacity: 1,
                    },
                    markerEnd: edge.markerEnd
                        ? { ...edge.markerEnd, color }
                        : edge.markerEnd,
                    labelStyle: {
                        ...(edge.labelStyle || {}),
                        opacity: 1,
                    },
                };
            }

            if (
                isSelectedTransition ||
                isCanvasHoverConnection ||
                isHoveredEditorEdge ||
                isSlotDetailsConnection
            ) {
                return edge;
            }

            const existingOpacity = Number(edge.style?.opacity);
            const dimmedOpacity = Number.isFinite(existingOpacity)
                ? Math.min(existingOpacity, 0.22)
                : 0.22;

            const cachedDimmedEdge = dimmedHoverEdgeCacheRef.current.get(edge);
            if (cachedDimmedEdge) return cachedDimmedEdge;

            const dimmedEdge = {
                ...edge,
                animated: false,
                style: {
                    ...(edge.style || {}),
                    stroke: HOVER_INACTIVE_EDGE_COLOR,
                    opacity: dimmedOpacity,
                },
                markerEnd: edge.markerEnd
                    ? {
                          ...edge.markerEnd,
                          color: HOVER_INACTIVE_EDGE_COLOR,
                      }
                    : edge.markerEnd,
                labelStyle: {
                    ...(edge.labelStyle || {}),
                    opacity: 0.42,
                },
            };
            dimmedHoverEdgeCacheRef.current.set(edge, dimmedEdge);
            return dimmedEdge;
        });
    }, [
        highlightedTransitionEdges,
        compoundInitialEdges,
        parallelEntryEdges,
        activeMode,
        activeCanvasFocusNodeId,
        editableSlotEdges,
        isDraggingNode,
        hiddenNodeIds,
        activeHoveredEditorEdgeId,
        isSlotDetailsFocus,
        hoveredSlotAccessNodeId,
        selectedNodeId,
    ]);

    const hoveredEditorEdge = useMemo(
        () =>
            activeHoveredEditorEdgeId
                ? visibleEdges.find(
                      (edge) => edge.id === activeHoveredEditorEdgeId
                  ) || null
                : null,
        [activeHoveredEditorEdgeId, visibleEdges]
    );

    const hasHoverFocus = Boolean(
        activeCanvasFocusNodeId || hoveredEditorEdge || isSlotDetailsFocus
    );

    const hoverFocusNodeIds = useMemo(() => {
        if (!hasHoverFocus) return null;

        const ids = new Set();
        if (activeCanvasFocusNodeId) {
            ids.add(activeCanvasFocusNodeId);
            cloneGroupByNodeId
                .get(activeCanvasFocusNodeId)
                ?.forEach((linkedId) => ids.add(linkedId));
            visibleEdges.forEach((edge) => {
                if (
                    edge.source === activeCanvasFocusNodeId ||
                    edge.target === activeCanvasFocusNodeId
                ) {
                    ids.add(edge.source);
                    ids.add(edge.target);
                }
            });
        }

        if (hoveredEditorEdge) {
            ids.add(hoveredEditorEdge.source);
            ids.add(hoveredEditorEdge.target);
        }

        if (isSlotDetailsFocus) {
            ids.add(hoveredSlotAccessNodeId);
            ids.add(selectedNodeId);
        }

        return ids;
    }, [
        hasHoverFocus,
        activeCanvasFocusNodeId,
        visibleEdges,
        hoveredEditorEdge,
        isSlotDetailsFocus,
        hoveredSlotAccessNodeId,
        selectedNodeId,
        cloneGroupByNodeId,
    ]);

    const visibleNodes = useMemo(() => {
        if (!hasHoverFocus && !parallelDropTargetId && !compoundDropTargetId) {
            return baseVisibleNodes;
        }

        const activeParallelLane = parallelDropTargetId
            ? baseVisibleNodes.find((node) => node.id === parallelDropTargetId)
            : null;
        const activeParallelId =
            activeParallelLane?.type === "parallelLane"
                ? activeParallelLane.parentId
                : null;

        return baseVisibleNodes.map((visibleNode) => {
            const isCanvasHoverHighlight =
                visibleNode.id === activeCanvasFocusNodeId;
            const isSlotDetailsSkillHoverHighlight =
                visibleNode.id === hoveredSlotAccessNodeId &&
                visibleNode.type === "custom";
            const isSlotDetailsSelectedSlot =
                isSlotDetailsFocus && visibleNode.id === selectedNodeId;
            const isHoveredEdgeEndpoint = Boolean(
                hoveredEditorEdge &&
                    (visibleNode.id === hoveredEditorEdge.source ||
                        visibleNode.id === hoveredEditorEdge.target)
            );
            const isConnectedHoverFocusNode =
                hasHoverFocus && hoverFocusNodeIds?.has(visibleNode.id);
            const isSelectedNode =
                visibleNode.selected || selectedVisualNodeIdSet.has(visibleNode.id);
            const isCloneLinkedHighlight =
                cloneLinkedHighlightIds.has(visibleNode.id);
            const isDimmedByHoverFocus =
                hasHoverFocus &&
                !isSelectedNode &&
                !isConnectedHoverFocusNode &&
                !isCanvasHoverHighlight &&
                !isSlotDetailsSkillHoverHighlight &&
                !isSlotDetailsSelectedSlot;

            if (isDimmedByHoverFocus) {
                const cachedDimmedNode =
                    dimmedHoverNodeCacheRef.current.get(visibleNode);
                if (cachedDimmedNode) return cachedDimmedNode;

                const dimmedNode = {
                    ...visibleNode,
                    style: {
                        ...(visibleNode.style || {}),
                        opacity: 0.42,
                        filter: "grayscale(0.72)",
                        transition:
                            visibleNode.style?.transition ||
                            "opacity 120ms ease, filter 120ms ease",
                    },
                };
                dimmedHoverNodeCacheRef.current.set(visibleNode, dimmedNode);
                return dimmedNode;
            }

            if (
                isCanvasHoverHighlight ||
                isHoveredEdgeEndpoint ||
                isSlotDetailsSkillHoverHighlight ||
                isCloneLinkedHighlight
            ) {
                // Hover highlighting must never mutate React Flow's real
                // selection state. Setting `selected: true` here made a mere
                // mouse hover replace Ctrl/Meta multi-selection and then clear
                // it again on mouse leave. Use a presentation-only class
                // instead, while preserving an already selected node as-is.
                if (visibleNode.selected) return visibleNode;

                const cachedHighlightedNode =
                    highlightedHoverNodeCacheRef.current.get(visibleNode);
                if (cachedHighlightedNode) return cachedHighlightedNode;

                const classNames = String(visibleNode.className || "")
                    .split(/\s+/)
                    .filter(Boolean);
                if (!classNames.includes("editor-hover-highlight")) {
                    classNames.push("editor-hover-highlight");
                }

                const highlightedNode = {
                    ...visibleNode,
                    className: classNames.join(" "),
                };
                highlightedHoverNodeCacheRef.current.set(
                    visibleNode,
                    highlightedNode
                );
                return highlightedNode;
            }

            if (visibleNode.type === "parallelLane") {
                const isLaneDropTarget =
                    visibleNode.id === parallelDropTargetId;
                if (!isLaneDropTarget) return visibleNode;

                return {
                    ...visibleNode,
                    style: {
                        ...visibleNode.style,
                        outline: "3px solid #0284c7",
                        outlineOffset: "-3px",
                        backgroundColor: "rgba(2, 132, 199, 0.12)",
                        boxShadow:
                            "inset 0 0 0 2px rgba(56, 189, 248, 0.35)",
                        borderRadius: 4,
                    },
                    data: {
                        ...visibleNode.data,
                        isDropTarget: true,
                    },
                };
            }

            if (visibleNode.type === "parallel") {
                const isDropTarget = visibleNode.id === activeParallelId;
                if (Boolean(visibleNode.data?.isDropTarget) === isDropTarget) {
                    return visibleNode;
                }

                return {
                    ...visibleNode,
                    data: {
                        ...visibleNode.data,
                        isDropTarget,
                    },
                };
            }

            if (visibleNode.type === "compound") {
                const isDropTarget = visibleNode.id === compoundDropTargetId;
                if (
                    Boolean(visibleNode.data?.isDropTarget) === isDropTarget
                ) {
                    return visibleNode;
                }

                return {
                    ...visibleNode,
                    data: {
                        ...visibleNode.data,
                        isDropTarget,
                    },
                };
            }

            return visibleNode;
        });
    }, [
        baseVisibleNodes,
        hasHoverFocus,
        hoverFocusNodeIds,
        activeCanvasFocusNodeId,
        hoveredSlotAccessNodeId,
        isSlotDetailsFocus,
        selectedNodeId,
        selectedVisualNodeIdSet,
        cloneLinkedHighlightIds,
        hoveredEditorEdge,
        parallelDropTargetId,
        compoundDropTargetId,
    ]);

    return {
        visibleNodes,
        visibleEdges,
        smartRoutingNodes,
    };
}
