import { useCallback, useMemo, useRef } from "react";
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
}) {
    const selectedNodesCacheRef = useRef([]);
    const selectionNodesDependency = isDraggingNode ? null : nodes;
    const selectedNodes = useMemo(() => {
        if (!selectionNodesDependency) {
            return selectedNodesCacheRef.current;
        }

        const candidates = selectionNodesDependency.filter(
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
        selectedNodesCacheRef.current = next;
        return next;
    }, [selectionNodesDependency]);

    const handleAddLaneToParallel = useCallback((parallelId) => {
        const newLaneId = getNodeId();
        setNodes((nds) => {
            const parallelNode = nds.find((n) => n.id === parallelId);
            if (!parallelNode) return nds;

            const existingLanes = nds
                .filter(
                    (n) =>
                        n.parentId === parallelId &&
                        n.type === "parallelLane"
                )
                .sort((a, b) => a.position.y - b.position.y);

            const laneIndex = existingLanes.length;
            const laneHeight = 170;
            const headerHeight = PARALLEL_HEADER_HEIGHT;
            const buttonReserve = PARALLEL_BOTTOM_PADDING;

            const newLaneName = `Lane_${laneIndex + 1}`;
            const containerWidth =
                Number(parallelNode.style?.width) || 420;

            // Ende der bisher letzten Lane bestimmen
            const lastLane = existingLanes[existingLanes.length - 1];

            const newLaneY = lastLane
                ? Number(lastLane.position?.y || 0) +
                Number(lastLane.style?.height || 140)
                : headerHeight;

            const newLaneNode = {
                id: newLaneId,
                position: {
                    x: 0,
                    y: newLaneY,
                },
                parentId: parallelId,
                extent: "parent",
                expandParent: true,
                type: "parallelLane",
                draggable: false,
                style: {
                    width: containerWidth,
                    height: laneHeight,
                    borderBottom: "none",
                },
                data: {
                    label: newLaneName,
                    events: [],
                },
            };

            const newTotalHeight =
                newLaneY + laneHeight + buttonReserve;

            const updatedNodes = nds.map((n) => {
                if (n.id === parallelId) {
                    return {
                        ...n,
                        style: {
                            ...n.style,
                            height: newTotalHeight,
                        },
                        data: {
                            ...n.data,
                            lanes: [
                                ...(n.data.lanes || []),
                                newLaneName,
                            ],
                        },
                    };
                }

                // Die bisher letzte Lane bekommt jetzt die Trennlinie,
                // weil danach die neue Lane kommt.
                if (lastLane && n.id === lastLane.id) {
                    return {
                        ...n,
                        style: {
                            ...n.style,
                            borderBottom:
                                "1.5px solid #0284c7",
                        },
                    };
                }

                return n;
            });

            return [...updatedNodes, newLaneNode];
        });
        void syncInsertedEditorStatesAfterCommit?.(newLaneId);
    }, [setNodes, syncInsertedEditorStatesAfterCommit]);

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
        handleCreateEmptyParallel,
        handleCreateCompoundFromSelected,
        handleCreateParallelFromSelected,
    };
}
