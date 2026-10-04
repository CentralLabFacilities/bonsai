import { useLayoutEffect, useMemo, useRef } from "react";
import { MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    clearTransientTransitionHighlight,
    getCollapsedTransitionSource,
    getTransitionHighlightColor,
    withSmartTransitionRouting,
} from "../utils/editorGraph.js";
import {
    getNodeSize,
    isAutoParallelLaneCompound,
} from "../utils/editorGeometry.js";

const SLOT_EDGE_INACTIVE_COLOR = "#64748b";
const COMPOUND_ROUTING_GRID_CELL_SIZE = 640;
const EMPTY_NODES = [];

export function projectStructureEdges(previous, edges) {
    const unchanged =
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
    return unchanged
        ? previous
        : edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge);
}

function useStructureEdges(edges) {
    const snapshotRef = useRef([]);
    return useMemo(() => {
        const next = projectStructureEdges(snapshotRef.current, edges);
        snapshotRef.current = next;
        return next;
    }, [edges]);
}

export function projectRoutingNodes(previous, nodes, isDraggingNode = false) {
    if (isDraggingNode && previous.length > 0) return previous;

    const unchanged =
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
                Boolean(oldNode?.data?.isCollapsed) === Boolean(node.data?.isCollapsed)
            );
        });
    return unchanged ? previous : nodes;
}

function useRoutingNodeSnapshot(nodes, isDraggingNode) {
    const snapshotRef = useRef(nodes);
    return useMemo(() => {
        const next = projectRoutingNodes(snapshotRef.current, nodes, isDraggingNode);
        snapshotRef.current = next;
        return next;
    }, [nodes, isDraggingNode]);
}

function withSlotEdgeEmphasis(edge, hovered) {
    const color = hovered
        ? SLOT_CONNECTION_COLORS[edge.data?.access === "write" ? "write" : "read"]
        : SLOT_EDGE_INACTIVE_COLOR;
    return {
        ...edge,
        style: {
            ...(edge.style || {}),
            stroke: color,
            strokeWidth: hovered ? 3 : 1.35,
            strokeDasharray: edge.style?.strokeDasharray || "5 5",
            opacity: hovered ? 1 : 0.3,
        },
        markerEnd: {
            ...(edge.markerEnd || {}),
            type: edge.markerEnd?.type || MarkerType.ArrowClosed,
            color,
        },
    };
}

function withNodeFocusClass(node, highlighted) {
    const classNames = String(node.className || "").split(/\s+/).filter(Boolean);
    if (!classNames.includes("editor-node-context-visible")) {
        classNames.push("editor-node-context-visible");
    }
    if (highlighted && !classNames.includes("editor-hover-highlight")) {
        classNames.push("editor-hover-highlight");
    }
    return { ...node, className: classNames.join(" ") };
}

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
    controlPointInsertRequest,
    onControlPointContextMenu,
    hoveredSlotAccessNodeId,
    semanticNodes,
    semanticChildrenByParent,
    nodes,
    childIdsByParent,
    activeMode,
    showSlotEdges,
    injectedNodes,
    injectedSlotNodes,
    isDraggingNode,
    draggingNodeId,
    hiddenNodeIds,
    parallelDropTargetId,
    compoundDropTargetId,
    problemNodeIds,
}) {
    const routingHandlersRef = useRef({ updatePersistentEdgeControlPoints, onControlPointContextMenu });
    useLayoutEffect(() => {
        routingHandlersRef.current = { updatePersistentEdgeControlPoints, onControlPointContextMenu };
    });
    const routingHandlers = useMemo(() => ({
        updateControlPoints: (...args) => routingHandlersRef.current.updatePersistentEdgeControlPoints(...args),
        openControlPointContextMenu: (...args) => routingHandlersRef.current.onControlPointContextMenu?.(...args),
    }), []);

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
        // Clone/reference relationships are semantic and do not depend on live
        // x/y positions. semanticNodes stays stable while React Flow drags a
        // node, preventing this complete clone-group index from rebuilding on
        // every pointer frame.
        const visualNodes = [
            ...(semanticNodes || []),
            ...(injectedSlotNodes || []),
        ];
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
    }, [semanticNodes, injectedSlotNodes]);

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
        // While a node is being dragged, its connections are the only node-based
        // transition context that should be highlighted. The persistent editor
        // selection must not keep unrelated transitions highlighted during the
        // drag. This is display-only and does not change actual node selection.
        const ids = isDraggingNode && draggingNodeId
            ? new Set([draggingNodeId])
            : new Set([
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
        isDraggingNode,
        draggingNodeId,
        selectedNodes,
        selectedNodeId,
        activeCanvasFocusNodeId,
        hoveredSlotAccessNodeId,
        cloneGroupByNodeId,
    ]);

    // React Flow stores selection on the edge object itself. Ignore that
    // display-only flag for routing-cache invalidation: clicking an edge must
    // not make the whole workflow normalize/re-route again.
    const transitionStructureEdges = useStructureEdges(edges);

    const selectedTransitionEdgeIds = useMemo(
        () =>
            new Set(
                edges
                    .filter((edge) => edge.selected)
                    .map((edge) => edge.id)
            ),
        [edges]
    );

    // The presentation hook already owns the drag-stable semantic hierarchy.
    const transitionNodeById = nodeById;

    // Build the complete transition render model once for the loaded graph.
    // Visibility/hover changes must never force normalization or routing to run
    // again; those interactions only select entries from this cache below.
    const normalizedTransitionEdges = useMemo(
        () =>
            transitionStructureEdges.map((edge) => {
                let normalizedEdge = edge;

                const collapsedSource = getCollapsedTransitionSource(
                    normalizedEdge,
                    transitionNodeById
                );
                if (
                    collapsedSource &&
                    transitionNodeById.get(collapsedSource.nodeId)?.type === "parallel"
                ) {
                    normalizedEdge = {
                        ...normalizedEdge,
                        source: collapsedSource.nodeId,
                        sourceHandle: collapsedSource.sourceHandle,
                    };
                }

                if (!normalizedEdge.targetHandle) {
                    const targetNode = transitionNodeById.get(normalizedEdge.target);

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
        [transitionStructureEdges, transitionNodeById]
    );

    const routingGeometryNodes = useRoutingNodeSnapshot(nodes, isDraggingNode);

    // Smart/manual edge routing only depends on node geometry, not display-only
    // node data such as selection/hover highlighting. Keep one stable obstacle
    // array so those UI interactions do not invalidate every routed edge.
    // Slot nodes are included only in modes where they are actually rendered.
    const manualRoutingSnapshotRef = useRef(EMPTY_NODES);
    const manualRoutingNodes = useMemo(() => {
        const snapshot = manualRoutingSnapshotRef.current;
        // The provider snapshot is intentionally static while dragging. Return
        // it before even constructing/comparing injected node arrays; the live
        // dragged endpoint is handled by React Flow itself.
        if (isDraggingNode && snapshot.length > 0) {
            return snapshot;
        }

        const requestedNodes =
            activeMode === "slots" || activeMode === "overview"
                ? [...injectedNodes, ...injectedSlotNodes]
                : injectedNodes;
        const next = projectRoutingNodes(snapshot, requestedNodes);
        manualRoutingSnapshotRef.current = next;
        return next;
    }, [activeMode, injectedNodes, injectedSlotNodes, isDraggingNode]);

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
        routingGeometryNodes.forEach((node) => getAncestorIds(node));

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
        };
    }, [routingGeometryNodes]);

    const compoundAvoidanceByEdgeId = useMemo(() => {
        const {
            liveNodeById,
            absolutePositionByNodeId,
            compoundEntries,
            compoundGrid,
            ancestorIdsByNodeId,
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

            const sourceAncestorIds = ancestorIdsByNodeId.get(sourceNode.id);
            const targetAncestorIds = ancestorIdsByNodeId.get(targetNode.id);

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


    const reconnectableTransitionEdgeIds = useMemo(() => {
        const incomingByTarget = new Map();

        normalizedTransitionEdges.forEach((edge) => {
            if (
                edge.data?.boundaryInternalEdge ||
                edge.data?.compoundInternalEdge ||
                edge.data?.parallelInternalEdge ||
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge
            ) {
                return;
            }

            const targetNode = transitionNodeById.get(edge.target);
            if (!targetNode || !["custom", "submachine"].includes(targetNode.type)) {
                return;
            }

            if (!incomingByTarget.has(edge.target)) {
                incomingByTarget.set(edge.target, []);
            }
            incomingByTarget.get(edge.target).push(edge.id);
        });

        return new Set(
            [...incomingByTarget.values()]
                .filter((edgeIds) => edgeIds.length === 1)
                .map((edgeIds) => edgeIds[0])
        );
    }, [normalizedTransitionEdges, transitionNodeById]);

    const smartTransitionEdges = useMemo(
        () =>
            withSmartTransitionRouting(normalizedTransitionEdges).map(
                (edge) => ({
                    ...edge,
                    // React Flow's native target reconnect handle re-drags the
                    // existing edge instead of creating a second connection.
                    reconnectable: reconnectableTransitionEdgeIds.has(edge.id)
                        ? "target"
                        : false,
                    data: {
                        ...(edge.data || {}),
                        ...(compoundAvoidanceByEdgeId.has(edge.id)
                            ? { forceObstacleRouting: true }
                            : {}),
                        // ManualEditableTransitionEdge consumes this stable
                        // geometry cache instead of subscribing to useNodes().
                        routingNodes: manualRoutingNodes,
                        onControlPointsChange: (controlPoints) =>
                            routingHandlers.updateControlPoints(
                                edge.id,
                                controlPoints,
                                "transition"
                            ),
                        controlPointInsertRequest:
                            controlPointInsertRequest?.edgeKind === "transition" &&
                            controlPointInsertRequest?.edgeId === edge.id
                                ? controlPointInsertRequest
                                : null,
                        onControlPointContextMenu: (event, pointId) =>
                            routingHandlers.openControlPointContextMenu(
                                event,
                                edge.id,
                                pointId,
                                "transition"
                            ),
                    },
                })
            ),
        [
            normalizedTransitionEdges,
            reconnectableTransitionEdgeIds,
            compoundAvoidanceByEdgeId,
            manualRoutingNodes,
            routingHandlers,
            controlPointInsertRequest,
        ]
    );

    // Rendering every background transition with obstacle-aware smart routing is
    // disproportionately expensive on large workflows. Keep the complete
    // semantic graph loaded, but switch only the unfocused presentation to a
    // cheap Bezier path once the graph crosses this threshold. Focused/selected
    // transitions still use the full smart-routed, labelled representation.
    const useLightweightBackgroundTransitions =
        isDraggingNode || smartTransitionEdges.length >= 180;

    // Cache all presentation variants independently from React Flow selection.
    // Selecting one edge used to rebuild base/focused objects for the complete
    // transition graph. With large workflows that meant O(E) object churn for
    // a one-edge interaction. Selection now only swaps the indexed entries
    // below, while this cache changes only when transition structure changes.
    const transitionRenderCache = useMemo(() => {
        const baseEdges = [];
        const focusedEdges = [];
        const selectionRelatedEdges = [];
        const selectedEdges = [];
        const selectedFocusedEdges = [];

        smartTransitionEdges.forEach((rawEdge) => {
            const clearedEdge = clearTransientTransitionHighlight(rawEdge);
            const isInternalHelper = Boolean(
                clearedEdge.data?.boundaryInternalEdge ||
                clearedEdge.data?.compoundInternalEdge ||
                clearedEdge.data?.parallelInternalEdge ||
                clearedEdge.data?.compoundInitialEdge ||
                clearedEdge.data?.parallelEntryEdge
            );
            let semanticEdge = withEdgeClassName(
                clearedEdge,
                "editor-transition-edge"
            );
            if (!isInternalHelper) {
                semanticEdge = withEdgeClassName(
                    semanticEdge,
                    "editor-user-transition-edge"
                );
            }
            const edge = useLightweightBackgroundTransitions
                ? {
                      ...semanticEdge,
                      data: {
                          ...(semanticEdge.data || {}),
                          lightweightBackgroundRouting: true,
                      },
                  }
                : semanticEdge;
            const semanticHandle =
                edge.data?.boundaryOriginalSourceHandle ||
                edge.data?.compoundOriginalSourceHandle ||
                edge.data?.parallelOriginalSourceHandle ||
                edge.sourceHandle ||
                edge.label;
            const color = getTransitionHighlightColor(semanticHandle);

            const fullDetailEdge = useLightweightBackgroundTransitions
                ? {
                      ...semanticEdge,
                      data: {
                          ...(semanticEdge.data || {}),
                          lightweightBackgroundRouting: false,
                      },
                  }
                : semanticEdge;
            const selectedEdge = {
                ...fullDetailEdge,
                selected: true,
                style: { ...(fullDetailEdge.style || {}), stroke: color },
                markerEnd: fullDetailEdge.markerEnd
                    ? { ...fullDetailEdge.markerEnd, color }
                    : fullDetailEdge.markerEnd,
            };
            // Detail-panel/programmatic hover still uses the React projection.
            // Keep its moving-dash feedback; ordinary canvas hover is handled
            // imperatively in EditorCanvas and therefore does not rebuild this
            // cache on every pointer enter/leave.
            const focusedEdge = {
                ...withEdgeClassName(
                    withEdgeClassName(
                        fullDetailEdge,
                        "editor-edge-context-visible"
                    ),
                    "editor-edge-focus-active"
                ),
                animated: true,
                style: {
                    ...(fullDetailEdge.style || {}),
                    stroke: color,
                },
                markerEnd: fullDetailEdge.markerEnd
                    ? { ...fullDetailEdge.markerEnd, color }
                    : fullDetailEdge.markerEnd,
            };
            const selectionRelatedEdge = {
                ...withEdgeClassName(
                    fullDetailEdge,
                    "editor-edge-selection-related"
                ),
                // Selection context is persistent and independent from hover.
                // Keep the semantic transition colour on the React-owned edge
                // so mouse-leave can never fall back to the inactive grey.
                animated: false,
                style: {
                    ...(fullDetailEdge.style || {}),
                    stroke: color,
                },
                markerEnd: fullDetailEdge.markerEnd
                    ? { ...fullDetailEdge.markerEnd, color }
                    : fullDetailEdge.markerEnd,
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
            selectionRelatedEdges.push(selectionRelatedEdge);
            selectedEdges.push(selectedEdge);
            selectedFocusedEdges.push(selectedFocusedEdge);
        });

        return {
            baseEdges,
            focusedEdges,
            selectionRelatedEdges,
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
    }, [smartTransitionEdges, useLightweightBackgroundTransitions]);

    const transitionEdgesForDisplay = useMemo(() => {
        if (activeMode === "code") return [];

        const {
            baseEdges,
            focusedEdges,
            selectionRelatedEdges,
            selectedEdges,
            selectedFocusedEdges,
            indexByNodeId,
            indexByEdgeId,
        } = transitionRenderCache;

        // Node selection is semantic context, not edge selection. Give all
        // connected transitions their own persistent related state without
        // setting edge.selected (which would change delete/multi-select
        // semantics). During node dragging we intentionally stay on the cheap
        // drag-only focus path.
        const selectionRelatedIndexes = new Set();
        if (!isDraggingNode) {
            selectedVisualNodeIdSet.forEach((nodeId) => {
                (indexByNodeId.get(nodeId) || []).forEach((edgeIndex) =>
                    selectionRelatedIndexes.add(edgeIndex)
                );
            });
        }

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
            selectionRelatedIndexes.size === 0 &&
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

        selectionRelatedIndexes.forEach((edgeIndex) => {
            const edgeId = baseEdges[edgeIndex]?.id;
            // A directly selected edge is always stronger than contextual
            // highlighting from a selected skill.
            if (edgeId && selectedTransitionEdgeIds.has(edgeId)) return;

            displayed[edgeIndex] = selectionRelatedEdges[edgeIndex];
        });

        return displayed;
    }, [
        activeMode,
        transitionRenderCache,
        selectedTransitionEdgeIds,
        edgeFocusNodeIds,
        activeHoveredEditorEdgeId,
        selectedVisualNodeIdSet,
        isDraggingNode,
    ]);

    const highlightedTransitionEdges = transitionEdgesForDisplay;

    // Selection and hover are intentionally separate for slot connections.
    // A hovered skill must be able to preview its slot edges without replacing
    // the persistent context of the skill the user explicitly selected.
    const selectedSlotContextId = selectedNodeId;
    const selectedSlotContextNodeIds = useMemo(
        () => selectedSlotContextId
            ? cloneGroupByNodeId.get(selectedSlotContextId) || new Set([selectedSlotContextId])
            : new Set(),
        [selectedSlotContextId, cloneGroupByNodeId]
    );
    const isSlotDetailsConnectionPreview = Boolean(
        hoveredSlotAccessNodeId &&
            selectedNodeId &&
            slotNodeIdSet.has(selectedNodeId)
    );

    // Slot-edge selection is display-only too. Keep it out of the structural
    // cache so selecting a slot connection does not rebuild every routed edge.
    const slotStructureEdges = useStructureEdges(slotEdges);

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
                let collapsedSourceId = null;

                if (hiddenNodeIds.has(edge.source)) {
                    let current = transitionNodeById.get(edge.source);
                    const visited = new Set();

                    while (current?.parentId && !visited.has(current.parentId)) {
                        visited.add(current.parentId);
                        const parent = transitionNodeById.get(current.parentId);
                        if (!parent) break;

                        if (
                            (parent.type === "compound" || parent.type === "parallel") &&
                            parent.data?.isCollapsed &&
                            !hiddenNodeIds.has(parent.id)
                        ) {
                            collapsedSourceId = parent.id;
                        }

                        current = parent;
                    }
                }

                return {
                    ...edge,
                    source: collapsedSourceId || edge.source,
                    sourceHandle: collapsedSourceId
                        ? "collapsed-slot-source"
                        : edge.sourceHandle,
                    type: "smartTransition",
                    // Slot connections are semantically owned by the skill
                    // handle. Reconnecting them may only move the slot end;
                    // allowing the source end to be re-dragged would leave the
                    // edge metadata pointing at the old skill.
                    reconnectable: "target",
                    data: {
                        ...(edge.data || {}),
                        ...(collapsedSourceId
                            ? { collapsedSlotOriginalSource: edge.source }
                            : {}),
                        access,
                        // During a node drag, obstacle routing is deliberately
                        // suspended. React Flow still moves connected endpoints
                        // live, but uses the cheap Bezier presentation until drop.
                        ...(isDraggingNode
                            ? { lightweightBackgroundRouting: true }
                            : {}),
                        // Slot edges use the same geometry-only obstacle cache;
                        // in Slot/Overview mode it already includes slot nodes.
                        routingNodes: manualRoutingNodes,
                        onControlPointsChange: (controlPoints) =>
                            routingHandlers.updateControlPoints(
                                edge.id,
                                controlPoints,
                                "slot"
                            ),
                        controlPointInsertRequest:
                            controlPointInsertRequest?.edgeKind === "slot" &&
                            controlPointInsertRequest?.edgeId === edge.id
                                ? controlPointInsertRequest
                                : null,
                        onControlPointContextMenu: (event, pointId) =>
                            routingHandlers.openControlPointContextMenu(
                                event,
                                edge.id,
                                pointId,
                                "slot"
                            ),
                    },
                };
            }),
        [
            slotStructureEdges,
            hiddenNodeIds,
            transitionNodeById,
            manualRoutingNodes,
            isDraggingNode,
            routingHandlers,
            controlPointInsertRequest,
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
        const hoveredEdges = [];
        const selectionRelatedEdges = [];
        const selectedEdges = [];
        const selectedHoveredEdges = [];

        routedSlotEdgeCache.forEach((rawEdge) => {
            const edge = withEdgeClassName(rawEdge, "editor-slot-edge");
            const contextEdge = withEdgeClassName(
                edge,
                "editor-edge-context-visible"
            );
            const hoveredEdge = withEdgeClassName(
                contextEdge,
                "editor-edge-focus-active"
            );
            const selectionRelatedEdge = withEdgeClassName(
                contextEdge,
                "editor-edge-selection-related"
            );
            const selectedEdge = { ...edge, selected: true };
            const selectedHoveredEdge = {
                ...hoveredEdge,
                selected: true,
            };

            baseEdges.push(edge);
            hoveredEdges.push(hoveredEdge);
            selectionRelatedEdges.push(selectionRelatedEdge);
            selectedEdges.push(selectedEdge);
            selectedHoveredEdges.push(selectedHoveredEdge);
        });

        return {
            baseEdges,
            hoveredEdges,
            selectionRelatedEdges,
            selectedEdges,
            selectedHoveredEdges,
            indexByNodeId: buildEdgeIndexByNodeId(
                baseEdges,
                getSlotEdgeNodeIds
            ),
            indexByEdgeId: new Map(
                baseEdges.map((edge, index) => [edge.id, index])
            ),
        };
    }, [routedSlotEdgeCache]);

    const slotSelectionRelatedIndexes = useMemo(() => {
        const indexes = new Set();
        selectedVisualNodeIdSet.forEach((nodeId) => {
            (slotRenderCache.indexByNodeId.get(nodeId) || []).forEach(
                (edgeIndex) => indexes.add(edgeIndex)
            );
        });
        return indexes;
    }, [slotRenderCache, selectedVisualNodeIdSet]);

    const slotHoveredIndexes = useMemo(() => {
        const indexes = new Set();
        const hoveredNodeIds = new Set();

        const addCloneGroup = (nodeId) => {
            if (!nodeId) return;
            hoveredNodeIds.add(nodeId);
            cloneGroupByNodeId
                .get(nodeId)
                ?.forEach((linkedId) => hoveredNodeIds.add(linkedId));
        };

        addCloneGroup(activeCanvasFocusNodeId);
        addCloneGroup(hoveredSlotAccessNodeId);

        hoveredNodeIds.forEach((nodeId) => {
            (slotRenderCache.indexByNodeId.get(nodeId) || []).forEach(
                (edgeIndex) => indexes.add(edgeIndex)
            );
        });

        return indexes;
    }, [
        slotRenderCache,
        activeCanvasFocusNodeId,
        hoveredSlotAccessNodeId,
        cloneGroupByNodeId,
    ]);

    const routedSlotEdges = useMemo(() => {
        if (activeMode !== "slots" && activeMode !== "overview") {
            return [];
        }

        const {
            baseEdges,
            hoveredEdges,
            selectionRelatedEdges,
            selectedEdges,
            selectedHoveredEdges,
            indexByEdgeId,
        } = slotRenderCache;
        if (
            slotHoveredIndexes.size === 0 &&
            slotSelectionRelatedIndexes.size === 0 &&
            selectedSlotEdgeIds.size === 0
        ) {
            return baseEdges;
        }

        // Keep the complete edge set mounted and swap only cached presentation
        // variants. Hover and selection are different semantic states here:
        // hover is temporary, while a selected skill keeps its slot edges
        // highlighted until selection changes.
        const displayed = baseEdges.slice();

        selectedSlotEdgeIds.forEach((edgeId) => {
            const edgeIndex = indexByEdgeId.get(edgeId);
            if (edgeIndex === undefined) return;
            displayed[edgeIndex] = selectedEdges[edgeIndex];
        });

        slotHoveredIndexes.forEach((edgeIndex) => {
            const edgeId = baseEdges[edgeIndex]?.id;
            displayed[edgeIndex] =
                edgeId && selectedSlotEdgeIds.has(edgeId)
                    ? selectedHoveredEdges[edgeIndex]
                    : hoveredEdges[edgeIndex];
        });

        // Persistent selection context wins over hover context. This gives the
        // selected skill a slightly stronger slot-edge weight even while a
        // different skill is being hovered. Directly selected edges remain
        // strongest and are never converted into contextual selection.
        slotSelectionRelatedIndexes.forEach((edgeIndex) => {
            const edgeId = baseEdges[edgeIndex]?.id;
            if (edgeId && selectedSlotEdgeIds.has(edgeId)) return;
            displayed[edgeIndex] = selectionRelatedEdges[edgeIndex];
        });

        return displayed;
    }, [
        activeMode,
        slotRenderCache,
        slotHoveredIndexes,
        slotSelectionRelatedIndexes,
        selectedSlotEdgeIds,
    ]);

    const slotVariantSnapshotRef = useRef({
        source: slotRenderCache,
        byEdge: new Map(),
    });
    const slotPresentation = useMemo(() => {
        const snapshot = slotVariantSnapshotRef.current;
        let nextCache = snapshot.source === slotRenderCache
            ? snapshot.byEdge
            : new Map();
        if (!isSlotDetailsConnectionPreview) {
            slotVariantSnapshotRef.current = {
                source: slotRenderCache,
                byEdge: nextCache,
            };
            return routedSlotEdges;
        }

        const displayed = routedSlotEdges.map((edge) => {
            const edgeClassNames = String(edge.className || "")
                .split(/\s+/)
                .filter(Boolean);
            const isContextVisibleSlotEdge = edgeClassNames.includes(
                "editor-edge-context-visible"
            );
            const isGraphInteractionEdge =
                edgeClassNames.includes("editor-edge-focus-active") ||
                edgeClassNames.includes("editor-edge-selection-related");

            // With slot edges globally hidden, unrelated edges are already
            // invisible through CSS. Preserve their cached object identity
            // instead of rebuilding dimmed variants for the entire graph on
            // every hover/selection change.
            if (!showSlotEdges && !isContextVisibleSlotEdge && !edge.selected) {
                return edge;
            }

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

            if (
                isGraphInteractionEdge ||
                (isConnectedToSelection && !isHoveredSlotDetailsConnection)
            ) {
                return edge;
            }

            const emphasis = isHoveredSlotDetailsConnection ? "hovered" : "inactive";
            const cached = nextCache.get(edge);
            if (cached?.[emphasis]) return cached[emphasis];

            const value = withSlotEdgeEmphasis(edge, isHoveredSlotDetailsConnection);
            if (nextCache === snapshot.byEdge) nextCache = new Map(nextCache);
            nextCache.set(edge, { ...cached, [emphasis]: value });
            return value;
        });
        slotVariantSnapshotRef.current = {
            source: slotRenderCache,
            byEdge: nextCache,
        };
        return displayed;
    }, [
        slotRenderCache,
        routedSlotEdges,
        isSlotDetailsConnectionPreview,
        hoveredSlotAccessNodeId,
        selectedSlotContextNodeIds,
        showSlotEdges,
    ]);
    const editableSlotEdges = slotPresentation;

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

    const parallelEntryEdges = useMemo(() => {
        const liveNodeById = routingGeometryIndex.liveNodeById;
        return semanticNodes
            .filter(
                (node) =>
                    node.type === "parallel" && !node.data?.isCollapsed
            )
            .flatMap((parallel) => {
                const lanes = (childIdsByParent.get(parallel.id) || [])
                    .map((id) => nodeById.get(id))
                    .filter((node) => node?.type === "parallelLane");

                return lanes
                    .map((lane) => {
                        const directChildren = (childIdsByParent.get(lane.id) || [])
                            .map((id) => nodeById.get(id))
                            .filter(Boolean);

                        const candidates = directChildren.filter(
                            (node) =>
                                node.type !== "slot" &&
                                node.type !== "parallelLane"
                        );

                        if (candidates.length === 0) return null;

                        const sortedCandidates = [...candidates].sort((a, b) => {
                            const aPosition = liveNodeById.get(a.id)?.position;
                            const bPosition = liveNodeById.get(b.id)?.position;
                            const ax = Number(aPosition?.x || 0);
                            const bx = Number(bPosition?.x || 0);
                            if (ax !== bx) return ax - bx;

                            const ay = Number(aPosition?.y || 0);
                            const by = Number(bPosition?.y || 0);
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

    }, [semanticNodes, nodeById, routingGeometryIndex, childIdsByParent]);

    const baseVisibleNodes = useMemo(
        () =>
            activeMode === "slots" || activeMode === "overview"
                ? [...injectedNodes, ...injectedSlotNodes]
                : injectedNodes,
        [activeMode, injectedNodes, injectedSlotNodes]
    );

    const hasSmartRoutedEdges =
        highlightedTransitionEdges.length > 0 || editableSlotEdges.length > 0;
    const smartRoutingNodes = hasSmartRoutedEdges
        ? manualRoutingNodes
        : EMPTY_NODES;

    const isSlotDetailsFocus = Boolean(
        hoveredSlotAccessNodeId &&
            selectedNodeId &&
            slotNodeIdSet.has(selectedNodeId)
    );

    const hasSelectedTransitionContext = useMemo(
        () =>
            !isDraggingNode &&
            [...selectedVisualNodeIdSet].some(
                (nodeId) => nodeById.has(nodeId) && !slotNodeIdSet.has(nodeId)
            ),
        [
            isDraggingNode,
            selectedVisualNodeIdSet,
            nodeById,
            slotNodeIdSet,
        ]
    );

    const hasSelectedSlotEdgeContext = Boolean(
        !isDraggingNode && slotSelectionRelatedIndexes.size > 0
    );

    const edgeFocusMode = Boolean(
        activeCanvasFocusNodeId ||
            activeHoveredEditorEdgeId ||
            hasSelectedTransitionContext ||
            hasSelectedSlotEdgeContext ||
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
            const edgeNodeIds = getTransitionEdgeNodeIds(edge);
            const isSelectionRelated =
                !isDraggingNode &&
                edgeNodeIds.some((id) => selectedVisualNodeIdSet.has(id));
            const isFocused =
                edgeNodeIds.some((id) => edgeFocusNodeIds.has(id)) ||
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
            if (isSelectionRelated) {
                transitionEdge = withEdgeClassName(
                    transitionEdge,
                    "editor-edge-selection-related"
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

        // Dragging is the hottest interaction path in the editor. Keeping every
        // transition/slot edge mounted means React Flow still has to maintain a
        // very large SVG tree while only one node is moving. During the drag,
        // keep just the edges that actually belong to the dragged node (plus
        // explicitly selected edges). The full cached edge graph is restored
        // once on drag stop. This changes presentation only; semantic edges are
        // never removed from the editor model.
        if (isDraggingNode) {
            nextVisibleEdges = nextVisibleEdges
                .filter((edge) => {
                    if (edge.selected) return true;

                    const connectedNodeIds = new Set([
                        ...getTransitionEdgeNodeIds(edge),
                        ...getSlotEdgeNodeIds(edge),
                    ]);
                    return [...connectedNodeIds].some((nodeId) =>
                        edgeFocusNodeIds.has(nodeId)
                    );
                })
                .map((edge) =>
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
        selectedVisualNodeIdSet,
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

    const problemVisibleNodes = useMemo(() => {
        if (!problemNodeIds?.size) return baseVisibleNodes;

        return baseVisibleNodes.map((node) => {
            if (!problemNodeIds.has(node.id)) return node;

            const classNames = String(node.className || "")
                .split(/\s+/)
                .filter(Boolean);
            if (!classNames.includes("editor-node-problem")) {
                classNames.push("editor-node-problem");
            }

            return {
                ...node,
                className: classNames.join(" "),
            };
        });
    }, [baseVisibleNodes, problemNodeIds]);

    const nodeIndexById = useMemo(
        () =>
            new Map(
                problemVisibleNodes.map((node, index) => [node.id, index])
            ),
        [problemVisibleNodes]
    );

    const nodeFocusSnapshotRef = useRef(new Map());
    const nodeFocusVariants = useMemo(() => {
        const snapshot = nodeFocusSnapshotRef.current;
        if (!hasHoverFocus || !hoverFocusNodeIds?.size) return snapshot;

        const next = new Map();
        let changed = false;
        hoverFocusNodeIds.forEach((nodeId) => {
            const index = nodeIndexById.get(nodeId);
            if (index === undefined) return;
            const node = problemVisibleNodes[index];
            const cached = snapshot.get(nodeId);
            if (cached?.sourceNode === node) {
                next.set(nodeId, cached);
            } else {
                changed = true;
                next.set(nodeId, {
                    sourceNode: node,
                    context: withNodeFocusClass(node, false),
                    highlighted: withNodeFocusClass(node, true),
                });
            }
        });
        const result = changed || next.size !== snapshot.size ? next : snapshot;
        nodeFocusSnapshotRef.current = result;
        return result;
    }, [hasHoverFocus, hoverFocusNodeIds, nodeIndexById, problemVisibleNodes]);

    const visibleNodes = useMemo(() => {
        const needsFocusPresentation = Boolean(
            hasHoverFocus && hoverFocusNodeIds?.size
        );
        const needsDropPresentation = Boolean(
            parallelDropTargetId || compoundDropTargetId
        );

        if (!needsFocusPresentation && !needsDropPresentation) {
            return problemVisibleNodes;
        }

        // Copy only the array shell, then replace the handful of nodes whose
        // presentation really changes. Previously every mouse move mapped over
        // the complete graph and rebuilt opacity/filter decisions for every
        // node, which was costly on large workflows.
        const displayed = problemVisibleNodes.slice();

        if (needsFocusPresentation) {
            hoverFocusNodeIds.forEach((nodeId) => {
                const index = nodeIndexById.get(nodeId);
                if (index === undefined) return;
                const variants = nodeFocusVariants.get(nodeId);
                displayed[index] = hoverHighlightNodeIds?.has(nodeId)
                    ? variants.highlighted
                    : variants.context;
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
        problemVisibleNodes,
        hasHoverFocus,
        hoverFocusNodeIds,
        hoverHighlightNodeIds,
        nodeIndexById,
        nodeFocusVariants,
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
