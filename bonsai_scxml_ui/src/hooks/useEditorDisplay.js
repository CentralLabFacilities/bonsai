import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    clearTransientTransitionHighlight,
    getTransitionHighlightColor,
    withSmartTransitionRouting,
} from "../utils/editorGraph";
import {
    getNodeSize,
    isAutoParallelLaneCompound,
} from "../utils/editorGeometry";

const SLOT_EDGE_INACTIVE_COLOR = "#64748b";
const COMPOUND_ROUTING_GRID_CELL_SIZE = 640;

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

    // Smart/manual edge routing only depends on node geometry, not display-only
    // node data such as selection/hover highlighting. Keep one stable obstacle
    // array so those UI interactions do not invalidate every routed edge.
    // Slot nodes are included only in modes where they are actually rendered.
    const manualRoutingNodesRef = useRef([]);
    const manualRoutingNodes = useMemo(() => {
        const requestedNodes =
            activeMode === "slots" || activeMode === "overview"
                ? [...injectedNodes, ...injectedSlotNodes]
                : injectedNodes;
        const previous = manualRoutingNodesRef.current;
        const geometryUnchanged =
            previous.length === requestedNodes.length &&
            requestedNodes.every((node, index) => {
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

        manualRoutingNodesRef.current = requestedNodes;
        return requestedNodes;
    }, [activeMode, injectedNodes, injectedSlotNodes]);

    // Build the expensive routing geometry once per real geometry change.
    // Previously the compound-avoidance pass repeatedly walked parent chains
    // with Array.find() and then tested every transition against every
    // Compound. On large graphs that can become O(edges * compounds * nodes).
    // The cached index below resolves absolute positions/ancestors once and
    // places Compound rectangles into a simple spatial grid. Each transition
    // therefore checks only nearby Compound obstacles.
    const routingGeometryIndex = useMemo(() => {
        const liveNodeById = new Map(
            routingGeometryNodes.map((node) => [node.id, node])
        );
        const absolutePositionByNodeId = new Map();
        const resolvingPositionIds = new Set();

        const getAbsolutePosition = (node) => {
            if (!node) return { x: 0, y: 0 };
            const cached = absolutePositionByNodeId.get(node.id);
            if (cached) return cached;

            const local = {
                x: node.position?.x || 0,
                y: node.position?.y || 0,
            };

            // Guard malformed/cyclic parent relationships without making the
            // normal tree path more expensive.
            if (resolvingPositionIds.has(node.id)) return local;
            resolvingPositionIds.add(node.id);

            const parent = node.parentId
                ? liveNodeById.get(node.parentId)
                : null;
            const parentPosition = parent
                ? getAbsolutePosition(parent)
                : { x: 0, y: 0 };
            const absolute = {
                x: local.x + parentPosition.x,
                y: local.y + parentPosition.y,
            };

            resolvingPositionIds.delete(node.id);
            absolutePositionByNodeId.set(node.id, absolute);
            return absolute;
        };

        routingGeometryNodes.forEach((node) => getAbsolutePosition(node));

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

        const compoundEntries = routingGeometryNodes
            .filter((node) => node.type === "compound" && !node.hidden)
            .map((compound) => {
                const position = absolutePositionByNodeId.get(compound.id) ||
                    getAbsolutePosition(compound);
                const size = getNodeSize(compound);
                const padding = 18;

                return {
                    id: compound.id,
                    rect: {
                        left: position.x - padding,
                        right: position.x + size.width + padding,
                        top: position.y - padding,
                        bottom: position.y + size.height + padding,
                    },
                };
            });

        const compoundGrid = new Map();
        compoundEntries.forEach((entry) => {
            const { rect } = entry;
            const minCellX = Math.floor(
                rect.left / COMPOUND_ROUTING_GRID_CELL_SIZE
            );
            const maxCellX = Math.floor(
                rect.right / COMPOUND_ROUTING_GRID_CELL_SIZE
            );
            const minCellY = Math.floor(
                rect.top / COMPOUND_ROUTING_GRID_CELL_SIZE
            );
            const maxCellY = Math.floor(
                rect.bottom / COMPOUND_ROUTING_GRID_CELL_SIZE
            );

            for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
                for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
                    const key = `${cellX}:${cellY}`;
                    if (!compoundGrid.has(key)) compoundGrid.set(key, []);
                    compoundGrid.get(key).push(entry);
                }
            }
        });

        return {
            liveNodeById,
            absolutePositionByNodeId,
            ancestorIdsByNodeId,
            compoundEntries,
            compoundGrid,
            getAncestorIds,
        };
    }, [routingGeometryNodes]);

    const compoundAvoidanceByEdgeId = useMemo(() => {
        const {
            liveNodeById,
            absolutePositionByNodeId,
            compoundEntries,
            compoundGrid,
            getAncestorIds,
        } = routingGeometryIndex;
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

            const sourcePosition = absolutePositionByNodeId.get(sourceNode.id);
            const targetPosition = absolutePositionByNodeId.get(targetNode.id);
            if (!sourcePosition || !targetPosition) return;

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

            let candidates = compoundEntries;
            if (compoundEntries.length > 8) {
                const minX = Math.min(start.x, end.x);
                const maxX = Math.max(start.x, end.x);
                const minY = Math.min(start.y, end.y);
                const maxY = Math.max(start.y, end.y);
                const minCellX = Math.floor(
                    minX / COMPOUND_ROUTING_GRID_CELL_SIZE
                );
                const maxCellX = Math.floor(
                    maxX / COMPOUND_ROUTING_GRID_CELL_SIZE
                );
                const minCellY = Math.floor(
                    minY / COMPOUND_ROUTING_GRID_CELL_SIZE
                );
                const maxCellY = Math.floor(
                    maxY / COMPOUND_ROUTING_GRID_CELL_SIZE
                );
                const seenIds = new Set();
                const nearby = [];

                for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
                    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
                        const entries = compoundGrid.get(`${cellX}:${cellY}`);
                        if (!entries) continue;

                        entries.forEach((entry) => {
                            if (seenIds.has(entry.id)) return;
                            seenIds.add(entry.id);
                            nearby.push(entry);
                        });
                    }
                }

                candidates = nearby;
            }

            const crossesCompound = candidates.some((entry) => {
                if (
                    entry.id === sourceNode.id ||
                    entry.id === targetNode.id ||
                    sourceAncestorIds.has(entry.id) ||
                    targetAncestorIds.has(entry.id)
                ) {
                    return false;
                }

                return segmentIntersectsRect(start, end, entry.rect);
            });

            if (crossesCompound) next.set(edge.id, true);
        });

        return next;
    }, [routingGeometryIndex, normalizedTransitionEdges]);

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
                        // ManualEditableTransitionEdge consumes this stable
                        // geometry cache instead of subscribing to useNodes().
                        routingNodes: manualRoutingNodes,
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
            manualRoutingNodes,
            updatePersistentEdgeControlPoints,
        ]
    );

    // Cache all presentation variants independently from React Flow selection.
    // Selecting one edge used to rebuild base/focused objects for the complete
    // transition graph. With large workflows that meant O(E) object churn for
    // a one-edge interaction. Selection now only swaps the indexed entries
    // below, while this cache changes only when transition structure changes.
    const transitionRenderCache = useMemo(() => {
        const baseEdges = [];
        const focusedEdges = [];
        const selectedEdges = [];
        const selectedFocusedEdges = [];

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

            const selectedEdge = {
                ...edge,
                selected: true,
                style: { ...(edge.style || {}), stroke: color },
                markerEnd: edge.markerEnd
                    ? { ...edge.markerEnd, color }
                    : edge.markerEnd,
            };
            const focusedEdge = {
                ...withEdgeClassName(
                    withEdgeClassName(
                        edge,
                        "editor-edge-context-visible"
                    ),
                    "editor-edge-focus-active"
                ),
                animated: true,
                style: {
                    ...(edge.style || {}),
                    stroke: color,
                },
                markerEnd: edge.markerEnd
                    ? { ...edge.markerEnd, color }
                    : edge.markerEnd,
            };
            const selectedFocusedEdge = {
                ...withEdgeClassName(
                    withEdgeClassName(
                        selectedEdge,
                        "editor-edge-context-visible"
                    ),
                    "editor-edge-focus-active"
                ),
                animated: true,
            };

            baseEdges.push(edge);
            focusedEdges.push(focusedEdge);
            selectedEdges.push(selectedEdge);
            selectedFocusedEdges.push(selectedFocusedEdge);
        });

        return {
            baseEdges,
            focusedEdges,
            selectedEdges,
            selectedFocusedEdges,
            indexByNodeId: buildEdgeIndexByNodeId(
                baseEdges,
                getTransitionEdgeNodeIds
            ),
            indexByEdgeId: new Map(
                baseEdges.map((edge, index) => [edge.id, index])
            ),
        };
    }, [smartTransitionEdges]);

    const transitionEdgesForDisplay = useMemo(() => {
        if (activeMode === "code") return [];

        const {
            baseEdges,
            focusedEdges,
            selectedEdges,
            selectedFocusedEdges,
            indexByNodeId,
            indexByEdgeId,
        } = transitionRenderCache;
        const focusedIndexes = new Set();
        edgeFocusNodeIds.forEach((nodeId) => {
            (indexByNodeId.get(nodeId) || []).forEach((edgeIndex) =>
                focusedIndexes.add(edgeIndex)
            );
        });

        if (activeHoveredEditorEdgeId) {
            const hoveredIndex = indexByEdgeId.get(activeHoveredEditorEdgeId);
            if (hoveredIndex !== undefined) focusedIndexes.add(hoveredIndex);
        }

        // Keep every transition mounted after load. The visibility toggle is
        // implemented by a CSS class on React Flow instead of removing edges
        // from the array. Selection/focus only replaces the indexed cached
        // variants instead of rebuilding the complete edge cache.
        if (
            focusedIndexes.size === 0 &&
            selectedTransitionEdgeIds.size === 0
        ) {
            return baseEdges;
        }

        const displayed = baseEdges.slice();

        selectedTransitionEdgeIds.forEach((edgeId) => {
            const edgeIndex = indexByEdgeId.get(edgeId);
            if (edgeIndex === undefined) return;
            displayed[edgeIndex] = selectedEdges[edgeIndex];
        });

        focusedIndexes.forEach((edgeIndex) => {
            const edgeId = baseEdges[edgeIndex]?.id;
            displayed[edgeIndex] =
                edgeId && selectedTransitionEdgeIds.has(edgeId)
                    ? selectedFocusedEdges[edgeIndex]
                    : focusedEdges[edgeIndex];
        });

        return displayed;
    }, [
        activeMode,
        transitionRenderCache,
        selectedTransitionEdgeIds,
        edgeFocusNodeIds,
        activeHoveredEditorEdgeId,
    ]);

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
                        // Slot edges use the same geometry-only obstacle cache;
                        // in Slot/Overview mode it already includes slot nodes.
                        routingNodes: manualRoutingNodes,
                        onControlPointsChange: (controlPoints) =>
                            updatePersistentEdgeControlPoints(
                                edge.id,
                                controlPoints,
                                "slot"
                            ),
                    },
                };
            }),
        [
            slotStructureEdges,
            manualRoutingNodes,
            updatePersistentEdgeControlPoints,
        ]
    );

    // Keep every slot edge mounted while Slot/Overview mode is active. Just as
    // with transitions, the visibility toggle must be paint-only; otherwise
    // enabling slot edges mounts every smart-edge component in one frame and
    // forces the router to run for the complete slot graph at once.
    //
    // Both base and contextual variants are cached here. Hover/selection only
    // swaps references at the indexed connected positions below.
    const slotRenderCache = useMemo(() => {
        const baseEdges = [];
        const contextEdges = [];
        const selectedEdges = [];
        const selectedContextEdges = [];

        routedSlotEdgeCache.forEach((rawEdge) => {
            const edge = withEdgeClassName(rawEdge, "editor-slot-edge");
            const contextEdge = withEdgeClassName(
                edge,
                "editor-edge-context-visible"
            );
            const selectedEdge = { ...edge, selected: true };
            const selectedContextEdge = {
                ...contextEdge,
                selected: true,
            };

            baseEdges.push(edge);
            contextEdges.push(contextEdge);
            selectedEdges.push(selectedEdge);
            selectedContextEdges.push(selectedContextEdge);
        });

        return {
            baseEdges,
            contextEdges,
            selectedEdges,
            selectedContextEdges,
            indexByNodeId: buildEdgeIndexByNodeId(
                baseEdges,
                getSlotEdgeNodeIds
            ),
            indexByEdgeId: new Map(
                baseEdges.map((edge, index) => [edge.id, index])
            ),
        };
    }, [routedSlotEdgeCache]);

    const slotFocusedIndexes = useMemo(() => {
        const indexes = new Set();
        edgeFocusNodeIds.forEach((nodeId) => {
            (slotRenderCache.indexByNodeId.get(nodeId) || []).forEach(
                (edgeIndex) => indexes.add(edgeIndex)
            );
        });
        return indexes;
    }, [slotRenderCache, edgeFocusNodeIds]);

    const routedSlotEdges = useMemo(() => {
        if (activeMode !== "slots" && activeMode !== "overview") {
            return [];
        }

        const {
            baseEdges,
            contextEdges,
            selectedEdges,
            selectedContextEdges,
            indexByEdgeId,
        } = slotRenderCache;
        if (
            slotFocusedIndexes.size === 0 &&
            selectedSlotEdgeIds.size === 0
        ) {
            return baseEdges;
        }

        // Keep the complete edge set mounted and swap only cached entries that
        // are selected or contextual. Selecting one slot edge therefore no
        // longer rebuilds render objects for every slot connection.
        const displayed = baseEdges.slice();

        selectedSlotEdgeIds.forEach((edgeId) => {
            const edgeIndex = indexByEdgeId.get(edgeId);
            if (edgeIndex === undefined) return;
            displayed[edgeIndex] = selectedEdges[edgeIndex];
        });

        slotFocusedIndexes.forEach((edgeIndex) => {
            const edgeId = baseEdges[edgeIndex]?.id;
            displayed[edgeIndex] =
                edgeId && selectedSlotEdgeIds.has(edgeId)
                    ? selectedContextEdges[edgeIndex]
                    : contextEdges[edgeIndex];
        });
        return displayed;
    }, [
        activeMode,
        slotRenderCache,
        slotFocusedIndexes,
        selectedSlotEdgeIds,
    ]);

    const editableSlotEdges = useMemo(() => {
        if (!hasSelectedSlotContext && !isSlotDetailsConnectionPreview) {
            return routedSlotEdges;
        }

        return routedSlotEdges.map((edge) => {
            const isContextVisibleSlotEdge = String(edge.className || "")
                .split(/\s+/)
                .includes("editor-edge-context-visible");

            // With slot edges globally hidden, unrelated edges are already
            // invisible through CSS. Preserve their cached object identity
            // instead of rebuilding dimmed variants for the entire graph on
            // every hover/selection change.
            if (!showSlotEdges && !isContextVisibleSlotEdge && !edge.selected) {
                return edge;
            }

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
        showSlotEdges,
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
        ? manualRoutingNodes
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

    const isSlotDetailsFocus = Boolean(
        hoveredSlotAccessNodeId &&
            selectedNodeId &&
            slotNodeIdSet.has(selectedNodeId)
    );

    const edgeFocusMode = Boolean(
        activeCanvasFocusNodeId ||
            activeHoveredEditorEdgeId ||
            isSlotDetailsFocus
    );

    const visibleEdges = useMemo(() => {
        const structuralTransitionEdges = [
            ...compoundInitialEdges,
            ...parallelEntryEdges,
        ].map((edge) => {
            let transitionEdge = withEdgeClassName(
                edge,
                "editor-transition-edge"
            );
            const isFocused =
                transitionEdgeMatchesFocus(edge) ||
                edge.id === activeHoveredEditorEdgeId;

            if (isFocused) {
                transitionEdge = withEdgeClassName(
                    transitionEdge,
                    "editor-edge-context-visible"
                );
                transitionEdge = withEdgeClassName(
                    transitionEdge,
                    "editor-edge-focus-active"
                );
            }

            return transitionEdge;
        });

        let nextVisibleEdges = [
            ...highlightedTransitionEdges,
            ...structuralTransitionEdges,
        ];

        if (activeMode === "slots" || activeMode === "overview") {
            nextVisibleEdges = [
                ...highlightedTransitionEdges,
                ...structuralTransitionEdges,
                ...editableSlotEdges,
            ];
        }

        // This pass runs only when dragging starts/stops. Hover focus is now
        // handled by CSS classes, so it no longer clones every visible edge.
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

        return nextVisibleEdges;
    }, [
        highlightedTransitionEdges,
        compoundInitialEdges,
        parallelEntryEdges,
        edgeFocusNodeIds,
        activeMode,
        editableSlotEdges,
        isDraggingNode,
        hiddenNodeIds,
        activeHoveredEditorEdgeId,
    ]);

    const structuralEdgeById = useMemo(() => {
        const byId = new Map();
        compoundInitialEdges.forEach((edge) => byId.set(edge.id, edge));
        parallelEntryEdges.forEach((edge) => byId.set(edge.id, edge));
        return byId;
    }, [compoundInitialEdges, parallelEntryEdges]);

    const hoveredEditorEdge = useMemo(() => {
        if (!activeHoveredEditorEdgeId) return null;

        const transitionIndex =
            transitionRenderCache.indexByEdgeId.get(activeHoveredEditorEdgeId);
        if (transitionIndex !== undefined) {
            return transitionRenderCache.baseEdges[transitionIndex] || null;
        }

        const slotIndex =
            slotRenderCache.indexByEdgeId.get(activeHoveredEditorEdgeId);
        if (slotIndex !== undefined) {
            return slotRenderCache.baseEdges[slotIndex] || null;
        }

        return structuralEdgeById.get(activeHoveredEditorEdgeId) || null;
    }, [
        activeHoveredEditorEdgeId,
        transitionRenderCache,
        slotRenderCache,
        structuralEdgeById,
    ]);

    const hasHoverFocus = Boolean(
        activeCanvasFocusNodeId || hoveredEditorEdge || isSlotDetailsFocus
    );

    const hoverFocusNodeIds = useMemo(() => {
        if (!hasHoverFocus) return null;

        const ids = new Set(selectedVisualNodeIdSet);

        const addCloneGroup = (nodeId) => {
            if (!nodeId) return;
            ids.add(nodeId);
            cloneGroupByNodeId
                .get(nodeId)
                ?.forEach((linkedId) => ids.add(linkedId));
        };

        const addEdgeEndpoints = (edge) => {
            if (!edge) return;
            addCloneGroup(edge.source);
            addCloneGroup(edge.target);
            getTransitionEdgeNodeIds(edge).forEach(addCloneGroup);
            getSlotEdgeNodeIds(edge).forEach(addCloneGroup);
        };

        if (activeCanvasFocusNodeId) {
            addCloneGroup(activeCanvasFocusNodeId);

            // Use the prebuilt edge indexes instead of scanning every visible
            // edge on each mouse move. Large workflows can have thousands of
            // mounted edges, while a single node normally touches only a few.
            const transitionIndexes =
                transitionRenderCache.indexByNodeId.get(activeCanvasFocusNodeId) ||
                [];
            transitionIndexes.forEach((edgeIndex) =>
                addEdgeEndpoints(transitionRenderCache.baseEdges[edgeIndex])
            );

            const slotIndexes =
                slotRenderCache.indexByNodeId.get(activeCanvasFocusNodeId) || [];
            slotIndexes.forEach((edgeIndex) =>
                addEdgeEndpoints(slotRenderCache.baseEdges[edgeIndex])
            );

            // Structural entry/initial edges are comparatively few and are not
            // part of the semantic transition cache.
            compoundInitialEdges.forEach((edge) => {
                if (
                    edge.source === activeCanvasFocusNodeId ||
                    edge.target === activeCanvasFocusNodeId
                ) {
                    addEdgeEndpoints(edge);
                }
            });
            parallelEntryEdges.forEach((edge) => {
                if (
                    edge.source === activeCanvasFocusNodeId ||
                    edge.target === activeCanvasFocusNodeId
                ) {
                    addEdgeEndpoints(edge);
                }
            });
        }

        if (hoveredEditorEdge) {
            addEdgeEndpoints(hoveredEditorEdge);
        }

        if (isSlotDetailsFocus) {
            addCloneGroup(hoveredSlotAccessNodeId);
            addCloneGroup(selectedNodeId);
        }

        return ids;
    }, [
        hasHoverFocus,
        activeCanvasFocusNodeId,
        hoveredEditorEdge,
        isSlotDetailsFocus,
        hoveredSlotAccessNodeId,
        selectedNodeId,
        selectedVisualNodeIdSet,
        cloneGroupByNodeId,
        transitionRenderCache,
        slotRenderCache,
        compoundInitialEdges,
        parallelEntryEdges,
    ]);

    const hoverHighlightNodeIds = useMemo(() => {
        if (!hasHoverFocus) return null;

        const ids = new Set();
        const addCloneGroup = (nodeId) => {
            if (!nodeId) return;
            ids.add(nodeId);
            cloneGroupByNodeId
                .get(nodeId)
                ?.forEach((linkedId) => ids.add(linkedId));
        };

        if (activeCanvasFocusNodeId) addCloneGroup(activeCanvasFocusNodeId);
        if (hoveredEditorEdge) {
            addCloneGroup(hoveredEditorEdge.source);
            addCloneGroup(hoveredEditorEdge.target);
        }
        if (isSlotDetailsFocus) {
            addCloneGroup(hoveredSlotAccessNodeId);
            addCloneGroup(selectedNodeId);
        }

        return ids;
    }, [
        hasHoverFocus,
        activeCanvasFocusNodeId,
        hoveredEditorEdge,
        isSlotDetailsFocus,
        hoveredSlotAccessNodeId,
        selectedNodeId,
        cloneGroupByNodeId,
    ]);

    const nodeIndexById = useMemo(
        () =>
            new Map(
                baseVisibleNodes.map((node, index) => [node.id, index])
            ),
        [baseVisibleNodes]
    );

    const contextVisibleNodeCacheRef = useRef(new WeakMap());
    const highlightedContextNodeCacheRef = useRef(new WeakMap());

    const withNodeFocusClass = (node, highlighted) => {
        const cache = highlighted
            ? highlightedContextNodeCacheRef.current
            : contextVisibleNodeCacheRef.current;
        const cached = cache.get(node);
        if (cached) return cached;

        const classNames = String(node.className || "")
            .split(/\s+/)
            .filter(Boolean);
        if (!classNames.includes("editor-node-context-visible")) {
            classNames.push("editor-node-context-visible");
        }
        if (highlighted && !classNames.includes("editor-hover-highlight")) {
            classNames.push("editor-hover-highlight");
        }

        const nextNode = {
            ...node,
            className: classNames.join(" "),
        };
        cache.set(node, nextNode);
        return nextNode;
    };

    const visibleNodes = useMemo(() => {
        const needsFocusPresentation = Boolean(
            hasHoverFocus && hoverFocusNodeIds?.size
        );
        const needsDropPresentation = Boolean(
            parallelDropTargetId || compoundDropTargetId
        );

        if (!needsFocusPresentation && !needsDropPresentation) {
            return baseVisibleNodes;
        }

        // Copy only the array shell, then replace the handful of nodes whose
        // presentation really changes. Previously every mouse move mapped over
        // the complete graph and rebuilt opacity/filter decisions for every
        // node, which was costly on large workflows.
        const displayed = baseVisibleNodes.slice();

        if (needsFocusPresentation) {
            hoverFocusNodeIds.forEach((nodeId) => {
                const index = nodeIndexById.get(nodeId);
                if (index === undefined) return;
                const node = displayed[index];
                displayed[index] = withNodeFocusClass(
                    node,
                    Boolean(hoverHighlightNodeIds?.has(nodeId))
                );
            });
        }

        if (parallelDropTargetId) {
            const laneIndex = nodeIndexById.get(parallelDropTargetId);
            const activeParallelLane =
                laneIndex !== undefined ? displayed[laneIndex] : null;
            const activeParallelId =
                activeParallelLane?.type === "parallelLane"
                    ? activeParallelLane.parentId
                    : null;

            if (laneIndex !== undefined && activeParallelLane) {
                displayed[laneIndex] = {
                    ...activeParallelLane,
                    style: {
                        ...activeParallelLane.style,
                        outline: "3px solid #0284c7",
                        outlineOffset: "-3px",
                        backgroundColor: "rgba(2, 132, 199, 0.12)",
                        boxShadow:
                            "inset 0 0 0 2px rgba(56, 189, 248, 0.35)",
                        borderRadius: 4,
                    },
                    data: {
                        ...activeParallelLane.data,
                        isDropTarget: true,
                    },
                };
            }

            if (activeParallelId) {
                const parallelIndex = nodeIndexById.get(activeParallelId);
                if (parallelIndex !== undefined) {
                    const parallelNode = displayed[parallelIndex];
                    if (!parallelNode.data?.isDropTarget) {
                        displayed[parallelIndex] = {
                            ...parallelNode,
                            data: {
                                ...parallelNode.data,
                                isDropTarget: true,
                            },
                        };
                    }
                }
            }
        }

        if (compoundDropTargetId) {
            const compoundIndex = nodeIndexById.get(compoundDropTargetId);
            if (compoundIndex !== undefined) {
                const compoundNode = displayed[compoundIndex];
                if (!compoundNode.data?.isDropTarget) {
                    displayed[compoundIndex] = {
                        ...compoundNode,
                        data: {
                            ...compoundNode.data,
                            isDropTarget: true,
                        },
                    };
                }
            }
        }

        return displayed;
    }, [
        baseVisibleNodes,
        hasHoverFocus,
        hoverFocusNodeIds,
        hoverHighlightNodeIds,
        nodeIndexById,
        parallelDropTargetId,
        compoundDropTargetId,
    ]);

    const nodeFocusMode = Boolean(hasHoverFocus);

    return {
        visibleNodes,
        visibleEdges,
        smartRoutingNodes,
        edgeFocusMode,
        nodeFocusMode,
    };
}
