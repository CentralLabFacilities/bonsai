import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    clearTransientTransitionHighlight,
    getTransitionHighlightColor,
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

const getTransitionEdgeNodeIds = (edge) => {
    const ids = [
        edge.source,
        edge.target,
        edge.data?.boundaryOriginalSource,
        edge.data?.boundaryOriginalTarget,
        edge.data?.compoundOriginalSource,
        edge.data?.compoundOriginalTarget,
        edge.data?.parallelOriginalSource,
        edge.data?.parallelOriginalTarget,
    ];

    if (Array.isArray(edge.data?.boundaryOriginalSources)) {
        edge.data.boundaryOriginalSources.forEach((source) => {
            ids.push(source?.sourceId || source?.nodeId || source?.id);
        });
    }

    return ids.filter(Boolean);
};

const getSlotEdgeNodeIds = (edge) =>
    [
        edge.source,
        edge.target,
        edge.data?.skillNodeId,
        edge.data?.slotNodeId,
        edge.data?.canonicalSlotNodeId,
    ].filter(Boolean);

const buildEdgeIndexByNodeId = (edgeList, getNodeIds) => {
    const index = new Map();

    edgeList.forEach((edge, edgeIndex) => {
        new Set(getNodeIds(edge)).forEach((nodeId) => {
            if (!index.has(nodeId)) index.set(nodeId, []);
            index.get(nodeId).push(edgeIndex);
        });
    });

    return index;
};

const collectIndexedEdges = (edgeList, indexByNodeId, nodeIds) => {
    if (!nodeIds || nodeIds.size === 0) return [];

    const indexes = new Set();
    nodeIds.forEach((nodeId) => {
        (indexByNodeId.get(nodeId) || []).forEach((edgeIndex) =>
            indexes.add(edgeIndex)
        );
    });

    return [...indexes]
        .sort((a, b) => a - b)
        .map((edgeIndex) => edgeList[edgeIndex])
        .filter(Boolean);
};

const withEdgeClassName = (edge, className) => {
    const classNames = String(edge?.className || "")
        .split(/\s+/)
        .filter(Boolean);

    if (!classNames.includes(className)) classNames.push(className);

    const nextClassName = classNames.join(" ");
    if (nextClassName === String(edge?.className || "")) return edge;

    return { ...edge, className: nextClassName };
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
    showTransitionEdges,
    showSlotEdges,
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
        const visualNodes = [...(nodes || []), ...(injectedSlotNodes || [])];
        const visualNodeById = new Map(
            visualNodes.map((node) => [node.id, node])
        );
        const groupsByOriginalId = new Map();

        const resolveOriginalId = (node) => {
            let originalId = node?.data?.cloneOfNodeId;
            const visited = new Set([node?.id]);

            while (originalId && !visited.has(originalId)) {
                visited.add(originalId);
                const originalNode = visualNodeById.get(originalId);
                const nextOriginalId = originalNode?.data?.cloneOfNodeId;
                if (!nextOriginalId) break;
                originalId = nextOriginalId;
            }

            return originalId || null;
        };

        visualNodes.forEach((node) => {
            // cloneOfNodeId is the authoritative editor-alias relationship.
            // Do not depend on a particular clone flag here: imported or older
            // Sub-SM/Compound/Parallel aliases may still be valid visual clones
            // even if their presentation flag differs.
            const originalId = resolveOriginalId(node);
            if (!originalId || !visualNodeById.has(originalId)) return;

            if (!groupsByOriginalId.has(originalId)) {
                groupsByOriginalId.set(originalId, new Set([originalId]));
            }
            groupsByOriginalId.get(originalId).add(node.id);
        });

        const groups = new Map();
        groupsByOriginalId.forEach((group) => {
            group.forEach((nodeId) => groups.set(nodeId, group));
        });

        return groups;
    }, [nodes, injectedSlotNodes]);

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

    // Keep an index of the visual/semantic nodes connected to each edge.
    // Transition visibility itself is paint-only: all transitions stay mounted
    // and routed after load, while this focus set marks the cached subset that
    // should remain visible when global transition visibility is disabled.
    const edgeFocusNodeIds = useMemo(() => {
        const ids = new Set([
            ...selectedNodes.map((node) => node.id),
            ...(selectedNodeId ? [selectedNodeId] : []),
            ...(activeCanvasFocusNodeId ? [activeCanvasFocusNodeId] : []),
            ...(hoveredSlotAccessNodeId ? [hoveredSlotAccessNodeId] : []),
        ]);

        [...ids].forEach((nodeId) => {
            cloneGroupByNodeId
                .get(nodeId)
                ?.forEach((linkedId) => ids.add(linkedId));
        });

        return ids;
    }, [
        selectedNodes,
        selectedNodeId,
        activeCanvasFocusNodeId,
        hoveredSlotAccessNodeId,
        cloneGroupByNodeId,
    ]);

    const transitionEdgeMatchesFocus = (edge) => {
        if (edgeFocusNodeIds.size === 0) return false;
        return getTransitionEdgeNodeIds(edge).some((id) =>
            edgeFocusNodeIds.has(id)
        );
    };

    // React Flow stores selection on the edge object itself. Ignore that
    // display-only flag for routing-cache invalidation: clicking an edge must
    // not make the whole workflow normalize/re-route again.
    const transitionStructureEdgesRef = useRef([]);
    const transitionStructureEdges = useMemo(() => {
        const previous = transitionStructureEdgesRef.current;
        const structurallyUnchanged =
            previous.length === edges.length &&
            edges.every((edge, index) => {
                const oldEdge = previous[index];
                return (
                    oldEdge?.id === edge.id &&
                    oldEdge?.source === edge.source &&
                    oldEdge?.target === edge.target &&
                    oldEdge?.sourceHandle === edge.sourceHandle &&
                    oldEdge?.targetHandle === edge.targetHandle &&
                    oldEdge?.label === edge.label &&
                    oldEdge?.type === edge.type &&
                    oldEdge?.data === edge.data &&
                    oldEdge?.style === edge.style &&
                    oldEdge?.markerEnd === edge.markerEnd
                );
            });

        if (structurallyUnchanged) return previous;

        const next = edges.map((edge) =>
            edge.selected ? { ...edge, selected: false } : edge
        );
        transitionStructureEdgesRef.current = next;
        return next;
    }, [edges]);

    const selectedTransitionEdgeIds = useMemo(
        () =>
            new Set(
                edges
                    .filter((edge) => edge.selected)
                    .map((edge) => edge.id)
            ),
        [edges]
    );

    // Build the complete transition render model once for the loaded graph.
    // Visibility/hover changes must never force normalization or routing to run
    // again; those interactions only select entries from this cache below.
    const normalizedTransitionEdges = useMemo(
        () =>
            transitionStructureEdges.map((edge) => {
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
                // Cache their deterministic loop route once instead of rebuilding
                // it whenever the edge visibility/focus state changes.
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
        [transitionStructureEdges, nodeById]
    );

    const compoundAvoidanceCacheRef = useRef(new Map());
    const routingGeometryNodesRef = useRef([]);
    const routingGeometryNodes = useMemo(() => {
        if (isDraggingNode && routingGeometryNodesRef.current.length > 0) {
            return routingGeometryNodesRef.current;
        }

        const previous = routingGeometryNodesRef.current;
        const geometryUnchanged =
            previous.length === nodes.length &&
            nodes.every((node, index) => {
                const oldNode = previous[index];
                return (
                    oldNode?.id === node.id &&
                    oldNode?.type === node.type &&
                    oldNode?.parentId === node.parentId &&
                    oldNode?.hidden === node.hidden &&
                    oldNode?.position?.x === node.position?.x &&
                    oldNode?.position?.y === node.position?.y &&
                    oldNode?.style?.width === node.style?.width &&
                    oldNode?.style?.height === node.style?.height &&
                    Boolean(oldNode?.data?.isCollapsed) ===
                        Boolean(node.data?.isCollapsed)
                );
            });

        if (geometryUnchanged) return previous;

        routingGeometryNodesRef.current = nodes;
        return nodes;
    }, [nodes, isDraggingNode]);

    const compoundAvoidanceNodesDependency = routingGeometryNodes;
    const compoundAvoidanceByEdgeId = useMemo(() => {
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

    // Cache both the normal and focused/animated variants. Hover/selection
    // therefore swaps object references from this cache instead of rebuilding
    // styles/markers/animation state for every interaction.
    const transitionRenderCache = useMemo(() => {
        const baseEdges = [];
        const focusedEdges = [];

        smartTransitionEdges.forEach((rawEdge) => {
            const edge = withEdgeClassName(
                clearTransientTransitionHighlight(rawEdge),
                "editor-transition-edge"
            );
            const semanticHandle =
                edge.data?.boundaryOriginalSourceHandle ||
                edge.data?.compoundOriginalSourceHandle ||
                edge.data?.parallelOriginalSourceHandle ||
                edge.sourceHandle ||
                edge.label;
            const color = getTransitionHighlightColor(semanticHandle);

            const isEdgeSelected = selectedTransitionEdgeIds.has(edge.id);
            const selectedBaseEdge = isEdgeSelected
                ? {
                      ...edge,
                      selected: true,
                      style: { ...(edge.style || {}), stroke: color },
                      markerEnd: edge.markerEnd
                          ? { ...edge.markerEnd, color }
                          : edge.markerEnd,
                  }
                : edge;

            baseEdges.push(selectedBaseEdge);
            focusedEdges.push({
                ...withEdgeClassName(
                    selectedBaseEdge,
                    "editor-edge-context-visible"
                ),
                animated: true,
                style: {
                    ...(selectedBaseEdge.style || {}),
                    stroke: color,
                },
                markerEnd: selectedBaseEdge.markerEnd
                    ? { ...selectedBaseEdge.markerEnd, color }
                    : selectedBaseEdge.markerEnd,
            });
        });

        return {
            baseEdges,
            focusedEdges,
            indexByNodeId: buildEdgeIndexByNodeId(
                baseEdges,
                getTransitionEdgeNodeIds
            ),
        };
    }, [smartTransitionEdges, selectedTransitionEdgeIds]);

    const transitionEdgesForDisplay = useMemo(() => {
        if (activeMode === "code") return [];

        const { baseEdges, focusedEdges, indexByNodeId } =
            transitionRenderCache;
        const focusedIndexes = new Set();
        edgeFocusNodeIds.forEach((nodeId) => {
            (indexByNodeId.get(nodeId) || []).forEach((edgeIndex) =>
                focusedIndexes.add(edgeIndex)
            );
        });

        // Keep every transition mounted after load. The visibility toggle is
        // implemented by a CSS class on React Flow instead of removing edges
        // from the array. This is critical for large workflows: showing
        // transitions again must not mount thousands of smart-edge components
        // and rerun their routing in one frame.
        if (focusedIndexes.size === 0) return baseEdges;

        // Copy only the array shell; all edge objects are cached. Replace just
        // connected entries with prebuilt focused variants. CSS uses the
        // editor-edge-context-visible class when transitions are globally hidden.
        const displayed = baseEdges.slice();
        focusedIndexes.forEach((edgeIndex) => {
            displayed[edgeIndex] = focusedEdges[edgeIndex];
        });
        return displayed;
    }, [activeMode, transitionRenderCache, edgeFocusNodeIds]);

    const highlightedTransitionEdges = transitionEdgesForDisplay;

    const selectedSlotContextId = activeCanvasFocusNodeId || selectedNodeId;
    const selectedSlotContextNodeIds = selectedSlotContextId
        ? cloneGroupByNodeId.get(selectedSlotContextId) ||
          new Set([selectedSlotContextId])
        : new Set();
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

    // Slot-edge selection is display-only too. Keep it out of the structural
    // cache so selecting a slot connection does not rebuild every routed edge.
    const slotStructureEdgesRef = useRef([]);
    const slotStructureEdges = useMemo(() => {
        const previous = slotStructureEdgesRef.current;
        const structurallyUnchanged =
            previous.length === slotEdges.length &&
            slotEdges.every((edge, index) => {
                const oldEdge = previous[index];
                return (
                    oldEdge?.id === edge.id &&
                    oldEdge?.source === edge.source &&
                    oldEdge?.target === edge.target &&
                    oldEdge?.sourceHandle === edge.sourceHandle &&
                    oldEdge?.targetHandle === edge.targetHandle &&
                    oldEdge?.data === edge.data &&
                    oldEdge?.style === edge.style &&
                    oldEdge?.markerEnd === edge.markerEnd
                );
            });

        if (structurallyUnchanged) return previous;

        const next = slotEdges.map((edge) =>
            edge.selected ? { ...edge, selected: false } : edge
        );
        slotStructureEdgesRef.current = next;
        return next;
    }, [slotEdges]);

    const selectedSlotEdgeIds = useMemo(
        () =>
            new Set(
                slotEdges
                    .filter((edge) => edge.selected)
                    .map((edge) => edge.id)
            ),
        [slotEdges]
    );

    // Slot edges follow the same cache-first rule as transitions: make every
    // render-ready edge once when the slot graph changes, then visibility only
    // chooses cached entries. No edge objects/routing callbacks are rebuilt on
    // hover or toggle changes.
    const routedSlotEdgeCache = useMemo(
        () =>
            slotStructureEdges.map((edge) => {
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
        [slotStructureEdges, updatePersistentEdgeControlPoints]
    );

    const slotRenderEdgeCache = useMemo(
        () =>
            routedSlotEdgeCache.map((edge) =>
                selectedSlotEdgeIds.has(edge.id)
                    ? { ...edge, selected: true }
                    : edge
            ),
        [routedSlotEdgeCache, selectedSlotEdgeIds]
    );

    const slotEdgeIndexByNodeId = useMemo(
        () => buildEdgeIndexByNodeId(slotRenderEdgeCache, getSlotEdgeNodeIds),
        [slotRenderEdgeCache]
    );

    const routedSlotEdges = useMemo(() => {
        if (activeMode !== "slots" && activeMode !== "overview") {
            return [];
        }

        if (showSlotEdges) return slotRenderEdgeCache;

        return collectIndexedEdges(
            slotRenderEdgeCache,
            slotEdgeIndexByNodeId,
            edgeFocusNodeIds
        );
    }, [
        activeMode,
        showSlotEdges,
        slotRenderEdgeCache,
        slotEdgeIndexByNodeId,
        edgeFocusNodeIds,
    ]);

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
                (selectedSlotContextNodeIds.has(slotNodeId) ||
                    selectedSlotContextNodeIds.has(edge.source) ||
                    selectedSlotContextNodeIds.has(edge.target));

            const isConnectedToSelection = isSlotDetailsConnectionPreview
                ? isHoveredSlotDetailsConnection
                : selectedSlotContextNodeIds.has(skillNodeId) ||
                  selectedSlotContextNodeIds.has(slotNodeId) ||
                  selectedSlotContextNodeIds.has(edge.source) ||
                  selectedSlotContextNodeIds.has(edge.target);

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
        cloneGroupByNodeId,
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

    const hasSmartRoutedEdges =
        highlightedTransitionEdges.length > 0 || editableSlotEdges.length > 0;
    const requestedSmartRoutingNodes = hasSmartRoutedEdges
        ? baseVisibleNodes
        : [];
    const [smartRoutingNodes, setSmartRoutingNodes] = useState(
        requestedSmartRoutingNodes
    );
    const smartRoutingNodesDependency = isDraggingNode
        ? null
        : requestedSmartRoutingNodes;

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
        const structuralTransitionEdges = [
            ...compoundInitialEdges,
            ...parallelEntryEdges,
        ].map((edge) => {
            const transitionEdge = withEdgeClassName(
                edge,
                "editor-transition-edge"
            );
            return transitionEdgeMatchesFocus(edge)
                ? withEdgeClassName(
                      transitionEdge,
                      "editor-edge-context-visible"
                  )
                : transitionEdge;
        });

        let nextVisibleEdges = [
            ...highlightedTransitionEdges,
            ...structuralTransitionEdges,
        ];

        if (activeMode === "slots") {
            nextVisibleEdges = [
                ...highlightedTransitionEdges,
                ...structuralTransitionEdges,
                ...editableSlotEdges,
            ];
        } else if (activeMode === "overview") {
            nextVisibleEdges = [
                ...highlightedTransitionEdges,
                ...structuralTransitionEdges,
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

        const transitionsAreContextOnly =
            !showTransitionEdges || activeMode === "slots";

        return nextVisibleEdges.map((edge) => {
            const isTransitionEdge = String(edge.className || "")
                .split(/\s+/)
                .includes("editor-transition-edge");
            const isContextVisibleTransition = String(edge.className || "")
                .split(/\s+/)
                .includes("editor-edge-context-visible");

            // When transitions are context-only, unrelated transitions are
            // already hidden by CSS. Preserve their cached object identity
            // instead of creating thousands of dimmed edge objects on hover.
            if (
                transitionsAreContextOnly &&
                isTransitionEdge &&
                !isContextVisibleTransition &&
                !edge.selected
            ) {
                return edge;
            }

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
        showTransitionEdges,
        edgeFocusNodeIds,
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
