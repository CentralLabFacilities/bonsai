import { useCallback, useMemo, useState } from "react";
import {
    COMPOUND_PADDING_X,
    COMPOUND_HEADER_HEIGHT,
    PARALLEL_HEADER_HEIGHT,
    PARALLEL_EXIT_GUTTER,
    PARALLEL_LANE_CHILD_LEFT_INSET,
    PARALLEL_LANE_CHILD_TOP_INSET,
    PARALLEL_LANE_CHILD_RIGHT_INSET,
    PARALLEL_LANE_CHILD_BOTTOM_INSET,
    PARALLEL_BOTTOM_PADDING,
    PARALLEL_NODE_GAP,
    getCompoundExitGutterWidth,
    getNodeId,
    orderNodesParentsFirst,
    resolveNodeCollisionsAndRefit,
} from "../utils/editorGeometry";
import { rebuildBoundaryTransitions } from "../utils/boundaryTransitions";
import { getOverviewLayoutNodeSize } from "../utils/layoutUtils";


const MIN_PARALLEL_LANE_HEIGHT = 90;

const getParallelLanes = (allNodes, parallelId) =>
    (allNodes || [])
        .filter(
            (node) =>
                node.type === "parallelLane" &&
                node.parentId === parallelId
        )
        .sort(
            (a, b) =>
                Number(a.position?.y || 0) -
                Number(b.position?.y || 0)
        );

const makeUniqueLaneName = (requestedName, siblingNames, fallbackName) => {
    const usedNames = new Set(
        (siblingNames || [])
            .map((name) => String(name || "").trim())
            .filter(Boolean)
    );
    const baseName = String(requestedName || "").trim() || fallbackName;

    if (!usedNames.has(baseName)) return baseName;

    let suffix = 2;
    while (usedNames.has(`${baseName}_${suffix}`)) {
        suffix += 1;
    }
    return `${baseName}_${suffix}`;
};

const collectDescendantIds = (allNodes, rootId) => {
    const childrenByParent = new Map();
    (allNodes || []).forEach((node) => {
        if (!node.parentId) return;
        if (!childrenByParent.has(node.parentId)) {
            childrenByParent.set(node.parentId, []);
        }
        childrenByParent.get(node.parentId).push(node.id);
    });

    const result = new Set();
    const stack = [rootId];
    while (stack.length > 0) {
        const nodeId = stack.pop();
        if (!nodeId || result.has(nodeId)) continue;
        result.add(nodeId);
        (childrenByParent.get(nodeId) || []).forEach((childId) =>
            stack.push(childId)
        );
    }
    return result;
};

const reflowParallelLanes = (
    allNodes,
    parallelId,
    orderedLaneIds = null
) => {
    const parallel = (allNodes || []).find((node) => node.id === parallelId);
    if (!parallel) return allNodes;

    let lanes = getParallelLanes(allNodes, parallelId);
    if (Array.isArray(orderedLaneIds) && orderedLaneIds.length > 0) {
        const rank = new Map(
            orderedLaneIds.map((laneId, index) => [laneId, index])
        );
        lanes = [...lanes].sort(
            (a, b) =>
                (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        );
    }

    const parallelWidth = Number(parallel.style?.width) || 420;
    let nextY = PARALLEL_HEADER_HEIGHT;
    const laneUpdates = new Map();

    lanes.forEach((lane, index) => {
        const laneHeight = Math.max(
            MIN_PARALLEL_LANE_HEIGHT,
            Number(lane.style?.height) || 140
        );
        laneUpdates.set(lane.id, {
            y: nextY,
            width: parallelWidth,
            height: laneHeight,
            borderBottom:
                index < lanes.length - 1
                    ? "1.5px solid #0284c7"
                    : "none",
        });
        nextY += laneHeight;
    });

    const parallelHeight = Math.max(
        PARALLEL_HEADER_HEIGHT + PARALLEL_BOTTOM_PADDING,
        nextY + PARALLEL_BOTTOM_PADDING
    );
    const laneNames = lanes.map(
        (lane, index) => lane.data?.label || `Lane_${index + 1}`
    );

    return (allNodes || []).map((node) => {
        const laneUpdate = laneUpdates.get(node.id);
        if (laneUpdate) {
            return {
                ...node,
                position: {
                    ...node.position,
                    x: 0,
                    y: laneUpdate.y,
                },
                style: {
                    ...(node.style || {}),
                    width: laneUpdate.width,
                    height: laneUpdate.height,
                    borderBottom: laneUpdate.borderBottom,
                },
            };
        }

        if (node.id === parallelId) {
            return {
                ...node,
                style: {
                    ...(node.style || {}),
                    height: parallelHeight,
                },
                data: {
                    ...(node.data || {}),
                    lanes: laneNames,
                },
            };
        }

        return node;
    });
};

const reorderParallelLaneSubtrees = (
    allNodes,
    parallelId,
    orderedLaneIds
) => {
    if (!Array.isArray(orderedLaneIds) || orderedLaneIds.length === 0) {
        return allNodes;
    }

    const byParent = new Map();
    (allNodes || []).forEach((node) => {
        if (!node.parentId) return;
        if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
        byParent.get(node.parentId).push(node);
    });

    const collectPreorder = (rootId) => {
        const root = (allNodes || []).find((node) => node.id === rootId);
        if (!root) return [];
        const result = [root];
        (byParent.get(rootId) || []).forEach((child) => {
            result.push(...collectPreorder(child.id));
        });
        return result;
    };

    const laneSubtrees = orderedLaneIds.map(collectPreorder);
    const laneSubtreeIds = new Set(
        laneSubtrees.flat().map((node) => node.id)
    );
    const remaining = (allNodes || []).filter(
        (node) => !laneSubtreeIds.has(node.id)
    );
    const parallelIndex = remaining.findIndex(
        (node) => node.id === parallelId
    );
    const insertionIndex = parallelIndex >= 0
        ? parallelIndex + 1
        : remaining.length;

    remaining.splice(insertionIndex, 0, ...laneSubtrees.flat());
    return orderNodesParentsFirst(remaining);
};

export function useContainerCreation({
    nodes,
    edges,
    isDraggingNode,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setActiveTab,
    setContextMenu,
    updateNodeInternals,
    syncInsertedEditorStatesAfterCommit,
    syncWrappedContainerAfterCommit,
    syncEditorStateAfterCommit,
}) {
    const [selectedNodesSnapshot, setSelectedNodesSnapshot] = useState([]);
    const selectedNodes = useMemo(() => {
        if (isDraggingNode) return selectedNodesSnapshot;

        const candidates = nodes.filter(
            (node) =>
                node.selected &&
                node.type !== "parallelLane" &&
                !node.data?.autoParallelLaneCompound
        );

        // Container creation is scoped to siblings. This allows recursive
        // compounds/parallels while preventing one new container from trying
        // to adopt nodes that currently belong to unrelated parents.
        const groups = new Map();
        candidates.forEach((node) => {
            const key = node.parentId || "__root__";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(node);
        });
        const next = [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
        if (
            next.length === selectedNodesSnapshot.length &&
            next.every((node, index) => node === selectedNodesSnapshot[index])
        ) {
            return selectedNodesSnapshot;
        }
        return next;
    }, [nodes, isDraggingNode, selectedNodesSnapshot]);
    if (selectedNodes !== selectedNodesSnapshot) setSelectedNodesSnapshot(selectedNodes);

    const handleAddLaneToParallel = useCallback((parallelId) => {
        const newLaneId = getNodeId();
        setNodes((currentNodes) => {
            const parallelNode = currentNodes.find((node) => node.id === parallelId);
            if (!parallelNode) return currentNodes;

            const existingLanes = getParallelLanes(currentNodes, parallelId);
            const siblingNames = existingLanes.map((lane) => lane.data?.label);
            let laneNumber = 1;
            let proposedName = `Lane_${laneNumber}`;
            const existingNameSet = new Set(
                siblingNames.map((name) => String(name || "").trim())
            );
            while (existingNameSet.has(proposedName)) {
                laneNumber += 1;
                proposedName = `Lane_${laneNumber}`;
            }
            const newLaneName = proposedName;
            const containerWidth = Number(parallelNode.style?.width) || 420;

            const newLaneNode = {
                id: newLaneId,
                position: { x: 0, y: PARALLEL_HEADER_HEIGHT },
                parentId: parallelId,
                extent: "parent",
                expandParent: true,
                type: "parallelLane",
                draggable: false,
                selectable: true,
                style: {
                    width: containerWidth,
                    height: 170,
                    borderBottom: "none",
                },
                data: {
                    label: newLaneName,
                    events: [],
                },
            };

            return reflowParallelLanes(
                [...currentNodes, newLaneNode],
                parallelId
            );
        });

        if (syncEditorStateAfterCommit) {
            void syncEditorStateAfterCommit();
        } else {
            void syncInsertedEditorStatesAfterCommit?.(newLaneId);
        }
    }, [
        setNodes,
        syncEditorStateAfterCommit,
        syncInsertedEditorStatesAfterCommit,
    ]);

    const handleRenameParallelLane = useCallback(
        (parallelId, laneId, requestedName) => {
            if (!parallelId || !laneId) return;

            setNodes((currentNodes) => {
                const lanes = getParallelLanes(currentNodes, parallelId);
                const laneIndex = lanes.findIndex((lane) => lane.id === laneId);
                if (laneIndex < 0) return currentNodes;

                const fallbackName = `Lane_${laneIndex + 1}`;
                const siblingNames = lanes
                    .filter((lane) => lane.id !== laneId)
                    .map((lane) => lane.data?.label);
                const nextName = makeUniqueLaneName(
                    requestedName,
                    siblingNames,
                    fallbackName
                );

                const renamed = currentNodes.map((node) =>
                    node.id === laneId
                        ? {
                              ...node,
                              data: {
                                  ...(node.data || {}),
                                  label: nextName,
                              },
                          }
                        : node
                );

                return reflowParallelLanes(renamed, parallelId);
            });

            void syncEditorStateAfterCommit?.();
        },
        [setNodes, syncEditorStateAfterCommit]
    );

    const handleMoveParallelLane = useCallback(
        (parallelId, laneId, direction) => {
            if (!parallelId || !laneId) return;

            setNodes((currentNodes) => {
                const lanes = getParallelLanes(currentNodes, parallelId);
                const currentIndex = lanes.findIndex((lane) => lane.id === laneId);
                if (currentIndex < 0) return currentNodes;

                const nextIndex = direction === "up"
                    ? currentIndex - 1
                    : currentIndex + 1;
                if (nextIndex < 0 || nextIndex >= lanes.length) {
                    return currentNodes;
                }

                const orderedLaneIds = lanes.map((lane) => lane.id);
                [orderedLaneIds[currentIndex], orderedLaneIds[nextIndex]] =
                    [orderedLaneIds[nextIndex], orderedLaneIds[currentIndex]];

                const reflowed = reflowParallelLanes(
                    currentNodes,
                    parallelId,
                    orderedLaneIds
                );
                return reorderParallelLaneSubtrees(
                    reflowed,
                    parallelId,
                    orderedLaneIds
                );
            });

            window.requestAnimationFrame(() => updateNodeInternals?.(parallelId));
            void syncEditorStateAfterCommit?.();
        },
        [setNodes, syncEditorStateAfterCommit, updateNodeInternals]
    );

    const handleDeleteParallelLane = useCallback(
        (parallelId, laneId) => {
            if (!parallelId || !laneId) return;

            const lanes = getParallelLanes(nodes, parallelId);
            if (lanes.length <= 1) return;

            const removedIds = collectDescendantIds(nodes, laneId);
            const nextNodesWithoutLane = nodes
                .filter((node) => !removedIds.has(node.id))
                .map((node) => {
                    if (!Array.isArray(node.data?.events)) return node;
                    const nextEvents = node.data.events.filter((event) => {
                        const sourceIds = [
                            event?.sourceNodeId,
                            ...(Array.isArray(event?.sourceNodeIds)
                                ? event.sourceNodeIds
                                : []),
                        ]
                            .filter(Boolean)
                            .map(String);
                        return !sourceIds.some((sourceId) =>
                            removedIds.has(sourceId)
                        );
                    });
                    if (nextEvents.length === node.data.events.length) return node;
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            events: nextEvents,
                        },
                    };
                });
            const reflowedNodes = reflowParallelLanes(
                nextNodesWithoutLane,
                parallelId
            );
            const filteredEdges = edges.filter((edge) => {
                const referencedNodeIds = [
                    edge.source,
                    edge.target,
                    edge.data?.boundaryOriginalSource,
                    edge.data?.compoundOriginalSource,
                    edge.data?.parallelOriginalSource,
                    edge.data?.boundaryOriginalTarget,
                    edge.data?.compoundOriginalTarget,
                    edge.data?.parallelOriginalTarget,
                    ...(Array.isArray(edge.data?.boundaryOriginalSources)
                        ? edge.data.boundaryOriginalSources.map(
                              (entry) => entry?.sourceId
                          )
                        : []),
                ]
                    .filter(Boolean)
                    .map(String);

                return !referencedNodeIds.some((nodeId) =>
                    removedIds.has(nodeId)
                );
            });
            const rebuilt = rebuildBoundaryTransitions(
                reflowedNodes,
                filteredEdges
            );

            setNodes(rebuilt.nodes);
            setEdges(rebuilt.edges);
            window.requestAnimationFrame(() => updateNodeInternals?.(parallelId));
            void syncEditorStateAfterCommit?.();
        },
        [
            edges,
            nodes,
            setEdges,
            setNodes,
            syncEditorStateAfterCommit,
            updateNodeInternals,
        ]
    );

    const handleCreateEmptyCompound = (pos) => {
        const compoundId = getNodeId();
        const compoundName = `compound_${nodes.filter((n) => n.type === "compound").length + 1}`;

        const newNode = {
            id: compoundId,
            type: "compound",
            position: pos,
            style: { width: 320, height: 220 },
            data: {
                label: compoundName,
                fullSkillName: compoundName,
                isInitial: false,
                events: [],
            },
        };

        setNodes((nds) =>
            resolveNodeCollisionsAndRefit(
                [...nds, newNode],
                compoundId
            )
        );
        setSelectedNodeId(compoundId); // <-- Details-Panel direkt öffnen
        setActiveTab("allgemein");
        setContextMenu(null);
        void syncInsertedEditorStatesAfterCommit?.(compoundId);
    };

    const handleCreateEmptyParallel = (pos) => {
        const parallelId = getNodeId();
        const parallelName = `parallel_${nodes.filter((n) => n.type === "parallel").length + 1}`;
        const laneHeight = 130;
        const headerHeight = PARALLEL_HEADER_HEIGHT;
        const containerWidth = 420;
        const containerHeight = headerHeight + 2 * laneHeight + 35;

        const parallelNode = {
            id: parallelId,
            type: "parallel",
            position: pos,
            style: { width: containerWidth, height: containerHeight },
            data: {
                label: parallelName,
                fullSkillName: parallelName,
                isInitial: false,
                lanes: ["Lane_1", "Lane_2"],
                events: [],
                onAddLane: handleAddLaneToParallel,
            },
        };

        const lane1Id = getNodeId();
        const lane2Id = getNodeId();

        const lane1 = {
            id: lane1Id,
            position: { x: 0, y: headerHeight },
            parentId: parallelId,
            extent: "parent",
            expandParent: true,
            type: "parallelLane",
            draggable: false,
            style: { width: containerWidth, height: laneHeight, borderBottom: "1.5px solid #0284c7" },
            data: { label: "Lane_1", events: [] },
        };

        const lane2 = {
            id: lane2Id,
            position: { x: 0, y: headerHeight + laneHeight },
            parentId: parallelId,
            extent: "parent",
            expandParent: true,
            type: "parallelLane",
            draggable: false,
            style: { width: containerWidth, height: laneHeight, borderBottom: "none" },
            data: { label: "Lane_2", events: [] },
        };

        setNodes((nds) =>
            resolveNodeCollisionsAndRefit(
                [...nds, parallelNode, lane1, lane2],
                parallelId
            )
        );
        setSelectedNodeId(parallelId);
        setActiveTab("allgemein");
        setContextMenu(null);
        void syncInsertedEditorStatesAfterCommit?.([
            parallelId,
            lane1Id,
            lane2Id,
        ]);
    };

    const getSelectionBoundingBox = (selectedList) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        selectedList.forEach((n) => {
            const x = n.position.x;
            const y = n.position.y;
            const { width: w, height: h } = getOverviewLayoutNodeSize(n);

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });

        return { minX, minY, maxX, maxY };
    };

    const handleCreateCompoundFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const selectionParentId = selectedNodes[0]?.parentId || null;
        const { minX, minY, maxX, maxY } =
            getSelectionBoundingBox(selectedNodes);
        const padding = COMPOUND_PADDING_X;
        const headerOffset = COMPOUND_HEADER_HEIGHT;
        const contentWidth = maxX - minX + padding * 2;
        const containerWidth = Math.max(
            320,
            contentWidth +
                COMPOUND_PADDING_X +
                getCompoundExitGutterWidth([])
        );
        const containerHeight = Math.max(
            180,
            maxY - minY + padding * 2 + headerOffset
        );
        const compoundId = getNodeId();
        const compoundName = `compound_${
            nodes.filter((node) => node.type === "compound").length + 1
        }`;
        const selectedIds = new Set(selectedNodes.map((node) => node.id));
        const selectedInitialNode =
            selectedNodes.find((node) => node.data?.isInitial) ||
            selectedNodes[0] ||
            null;
        const selectedInitialId = selectedInitialNode?.id || null;
        const selectionContainedInitial = Boolean(
            selectedNodes.some((node) => node.data?.isInitial)
        );

        const compoundNode = {
            id: compoundId,
            type: "compound",
            position: {
                x: minX - padding,
                y: minY - padding - headerOffset,
            },
            ...(selectionParentId
                ? {
                      parentId: selectionParentId,
                      extent: "parent",
                      expandParent: true,
                  }
                : {}),
            style: {
                width: containerWidth,
                height: containerHeight,
            },
            data: {
                label: compoundName,
                fullSkillName: compoundName,
                isInitial: selectionContainedInitial,
                initialChildId: selectedInitialId,
                events: [],
                onEntry: [],
                onExit: [],
            },
        };

        const wrappedNodes = nodes.map((node) => {
            if (!selectedIds.has(node.id)) return node;
            return {
                ...node,
                parentId: compoundId,
                extent: "parent",
                expandParent: true,
                position: {
                    x: node.position.x - (minX - padding),
                    y:
                        node.position.y -
                        (minY - padding - headerOffset),
                },
                data: {
                    ...(node.data || {}),
                    isInitial: node.id === selectedInitialId,
                },
                selected: false,
            };
        });

        // Entering a container is a display concern: keep the semantic target
        // state in metadata while rendering the edge against the new boundary.
        const visuallyRoutedEdges = edges.map((edge) => {
            const semanticTarget =
                edge.data?.boundaryOriginalTarget ||
                edge.data?.compoundOriginalTarget ||
                edge.data?.parallelOriginalTarget ||
                edge.target;
            const semanticSource =
                edge.data?.boundaryOriginalSource ||
                edge.data?.compoundOriginalSource ||
                edge.data?.parallelOriginalSource ||
                edge.source;
            if (
                !selectedIds.has(semanticSource) &&
                selectedIds.has(semanticTarget)
            ) {
                // Entering the newly wrapped initial state is semantically the
                // same as entering the Compound itself. Keep that transition
                // as a real incoming Compound edge so wrapping cannot make it
                // disappear. Direct entries to non-initial children retain
                // their child target in editor-only metadata.
                if (semanticTarget === selectedInitialId) {
                    const data = { ...(edge.data || {}) };
                    delete data.boundaryOriginalTarget;
                    delete data.compoundOriginalTarget;
                    delete data.parallelOriginalTarget;
                    return {
                        ...edge,
                        target: compoundId,
                        targetHandle: "transition-target",
                        data,
                    };
                }

                return {
                    ...edge,
                    target: compoundId,
                    targetHandle: "transition-target",
                    data: {
                        ...(edge.data || {}),
                        boundaryOriginalTarget: semanticTarget,
                        compoundOriginalTarget: semanticTarget,
                    },
                };
            }
            return edge;
        });

        const normalizedGraph = rebuildBoundaryTransitions(
            orderNodesParentsFirst([compoundNode, ...wrappedNodes]),
            visuallyRoutedEdges
        );
        setNodes(normalizedGraph.nodes);
        setEdges(normalizedGraph.edges);

        requestAnimationFrame(() => updateNodeInternals(compoundId));
        setSelectedNodeId(compoundId);
        setActiveTab("allgemein");
        void syncWrappedContainerAfterCommit?.(compoundId);
    };

    const handleCreateParallelFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const selectionParentId = selectedNodes[0]?.parentId || null;
        const selectedIds = new Set(selectedNodes.map((node) => node.id));
        const internalEdges = edges.filter(
            (edge) =>
                selectedIds.has(edge.source) && selectedIds.has(edge.target)
        );

        const visited = new Set();
        const groups = [];
        selectedNodes.forEach((startNode) => {
            if (visited.has(startNode.id)) return;
            const currentGroup = [];
            const queue = [startNode.id];
            visited.add(startNode.id);

            while (queue.length > 0) {
                const currentId = queue.shift();
                const node = selectedNodes.find(
                    (candidate) => candidate.id === currentId
                );
                if (node) currentGroup.push(node);

                internalEdges.forEach((edge) => {
                    let neighborId = null;
                    if (
                        edge.source === currentId &&
                        !visited.has(edge.target)
                    ) {
                        neighborId = edge.target;
                    } else if (
                        edge.target === currentId &&
                        !visited.has(edge.source)
                    ) {
                        neighborId = edge.source;
                    }
                    if (neighborId && selectedIds.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push(neighborId);
                    }
                });
            }
            groups.push(currentGroup);
        });

        const getNodeWidth = (node) =>
            getOverviewLayoutNodeSize(node).width;
        const getNodeHeight = (node) =>
            getOverviewLayoutNodeSize(node).height;
        const headerHeight = PARALLEL_HEADER_HEIGHT;
        const buttonReserve = PARALLEL_BOTTOM_PADDING;
        const laneHeights = [];
        const groupWidths = [];

        groups.forEach((group) => {
            let maxHeight = 70;
            let totalWidth = 0;
            group.forEach((node) => {
                maxHeight = Math.max(maxHeight, getNodeHeight(node));
                totalWidth += getNodeWidth(node);
            });
            laneHeights.push(
                Math.max(
                    group.length > 1 ? 190 : 150,
                    maxHeight +
                        PARALLEL_LANE_CHILD_TOP_INSET +
                        PARALLEL_LANE_CHILD_BOTTOM_INSET
                )
            );
            groupWidths.push(
                PARALLEL_LANE_CHILD_LEFT_INSET +
                    totalWidth +
                    Math.max(0, group.length - 1) * PARALLEL_NODE_GAP +
                    PARALLEL_LANE_CHILD_RIGHT_INSET +
                    PARALLEL_EXIT_GUTTER
            );
        });

        const containerWidth = Math.max(480, ...groupWidths);
        const containerHeight =
            headerHeight +
            laneHeights.reduce((sum, height) => sum + height, 0) +
            buttonReserve;
        const { minX, minY, maxX } =
            getSelectionBoundingBox(selectedNodes);
        const parallelId = getNodeId();
        const parallelName = `parallel_${
            nodes.filter((node) => node.type === "parallel").length + 1
        }`;
        const branchNames = groups.map((group, index) =>
            group.length > 1
                ? `Group_${index + 1}`
                : group[0]?.data?.label || `Lane_${index + 1}`
        );

        const parallelNode = {
            id: parallelId,
            type: "parallel",
            position: {
                x: minX - 30,
                y: minY - 30 - headerHeight,
            },
            ...(selectionParentId
                ? {
                      parentId: selectionParentId,
                      extent: "parent",
                      expandParent: true,
                  }
                : {}),
            style: { width: containerWidth, height: containerHeight },
            data: {
                label: parallelName,
                fullSkillName: parallelName,
                lanes: branchNames,
                events: [],
                onAddLane: handleAddLaneToParallel,
                onEntry: [],
                onExit: [],
            },
        };

        const horizontalGrowth = Math.max(
            0,
            parallelNode.position.x + containerWidth - maxX
        );
        const shiftX = horizontalGrowth > 0 ? horizontalGrowth + 50 : 0;
        const newLanes = [];
        const movedNodes = [];
        let currentLaneY = headerHeight;

        groups.forEach((group, index) => {
            const laneId = getNodeId();
            const laneHeight = laneHeights[index];
            newLanes.push({
                id: laneId,
                position: { x: 0, y: currentLaneY },
                parentId: parallelId,
                extent: "parent",
                expandParent: true,
                type: "parallelLane",
                draggable: false,
                selectable: true,
                style: {
                    width: containerWidth,
                    height: laneHeight,
                    borderBottom:
                        index < groups.length - 1
                            ? "1.5px solid #0284c7"
                            : "none",
                },
                data: { label: branchNames[index], events: [] },
            });

            let currentX = PARALLEL_LANE_CHILD_LEFT_INSET;
            group.forEach((node) => {
                movedNodes.push({
                    ...node,
                    parentId: laneId,
                    extent: "parent",
                    expandParent: true,
                    position: {
                        x: currentX,
                        y: PARALLEL_LANE_CHILD_TOP_INSET,
                    },
                    selected: false,
                });
                currentX += getNodeWidth(node) + PARALLEL_NODE_GAP;
            });
            currentLaneY += laneHeight;
        });

        let insertIndex = nodes.findIndex((node) => selectedIds.has(node.id));
        if (insertIndex < 0) insertIndex = 0;
        const remainingNodes = nodes
            .filter((node) => !selectedIds.has(node.id))
            .map((node) => {
                if ((node.parentId || null) !== selectionParentId) return node;
                const nodeX = Number(node.position?.x) || 0;
                if (shiftX > 0 && nodeX >= maxX) {
                    return {
                        ...node,
                        position: { ...node.position, x: nodeX + shiftX },
                    };
                }
                return node;
            });
        remainingNodes.splice(insertIndex, 0, parallelNode);

        const visuallyRoutedEdges = edges.map((edge) => {
            const semanticTarget =
                edge.data?.boundaryOriginalTarget ||
                edge.data?.compoundOriginalTarget ||
                edge.data?.parallelOriginalTarget ||
                edge.target;
            const semanticSource =
                edge.data?.boundaryOriginalSource ||
                edge.data?.compoundOriginalSource ||
                edge.data?.parallelOriginalSource ||
                edge.source;
            if (
                !selectedIds.has(semanticSource) &&
                selectedIds.has(semanticTarget)
            ) {
                return {
                    ...edge,
                    target: parallelId,
                    targetHandle: "target",
                    data: {
                        ...(edge.data || {}),
                        boundaryOriginalTarget: semanticTarget,
                        parallelOriginalTarget: semanticTarget,
                    },
                };
            }
            return edge;
        });

        const normalizedGraph = rebuildBoundaryTransitions(
            [...remainingNodes, ...newLanes, ...movedNodes],
            visuallyRoutedEdges
        );
        setNodes(normalizedGraph.nodes);
        setEdges(normalizedGraph.edges);
        setSelectedNodeId(parallelId);
        setActiveTab("allgemein");
        void syncWrappedContainerAfterCommit?.(parallelId);
    };

    return {
        selectedNodes,
        handleCreateEmptyCompound,
        handleAddLaneToParallel,
        handleRenameParallelLane,
        handleMoveParallelLane,
        handleDeleteParallelLane,
        handleCreateEmptyParallel,
        handleCreateCompoundFromSelected,
        handleCreateParallelFromSelected,
    };
}
