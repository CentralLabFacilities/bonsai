import { useCallback } from "react";

import {
    COLLAPSED_CONTAINER_HEIGHT,
    COLLAPSED_CONTAINER_WIDTH,
    getAbsoluteNodePosition,
} from "../utils/editorGeometry";


const getSlotProblemNodeId = (problem, nodeById) => {
    const rawPath = String(problem?.slotPath || "").trim();
    if (!rawPath) return null;

    const cleanPath = rawPath.replace(/^\/+/, "");
    if (!cleanPath) return null;

    const slotNodeId = `slot-${cleanPath}`;
    return nodeById.has(slotNodeId) ? slotNodeId : null;
};

const getTransitionProblemSourceId = (problem, problemEdge) => {
    if (problem?.category !== "Transitions" || !problemEdge) return null;

    return (
        problemEdge.data?.boundaryOriginalSource ||
        problemEdge.data?.compoundOriginalSource ||
        problemEdge.data?.parallelOriginalSource ||
        problemEdge.source ||
        null
    );
};

const collectContainerAncestors = (focusIds, nodeById) => {
    const containerAncestors = new Set();

    focusIds.forEach((focusId) => {
        let parentId = nodeById.get(focusId)?.parentId;
        const visited = new Set();

        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            const parent = nodeById.get(parentId);
            if (!parent) break;

            if (parent.type === "compound" || parent.type === "parallel") {
                containerAncestors.add(parent.id);
            }

            parentId = parent.parentId;
        }
    });

    return containerAncestors;
};

const getAncestorDepth = (nodeId, nodeById) => {
    let depth = 0;
    let parentId = nodeById.get(nodeId)?.parentId;
    const visited = new Set();

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        depth += 1;
        parentId = nodeById.get(parentId)?.parentId;
    }

    return depth;
};

const expandProblemContainers = ({
    containersToExpand,
    setNodes,
    updateNodeInternals,
}) => {
    if (containersToExpand.length === 0) return;

    const containerIds = new Set(containersToExpand);

    setNodes((currentNodes) =>
        currentNodes.map((node) => {
            if (!containerIds.has(node.id)) return node;
            if (node.type !== "compound" && node.type !== "parallel") {
                return node;
            }

            const savedSize = node.data?.expandedContainerSize || {};
            const fallbackWidth = node.type === "compound" ? 320 : 420;
            const fallbackHeight = node.type === "compound" ? 220 : 295;
            const currentWidth =
                Number(node.width) ||
                Number(node.measured?.width) ||
                Number(node.style?.width) ||
                0;
            const currentHeight =
                Number(node.height) ||
                Number(node.measured?.height) ||
                Number(node.style?.height) ||
                0;
            const hasCompactFootprint =
                currentWidth <= COLLAPSED_CONTAINER_WIDTH + 1 &&
                currentHeight <= COLLAPSED_CONTAINER_HEIGHT + 1;
            const needsPhysicalExpansion =
                Boolean(node.data?.isCollapsed) || hasCompactFootprint;

            if (!needsPhysicalExpansion) return node;

            const restoredWidth = Math.max(
                Number(savedSize.width) || 0,
                fallbackWidth
            );
            const restoredHeight = Math.max(
                Number(savedSize.height) || 0,
                fallbackHeight
            );
            const restoredStyle = {
                ...(node.style || {}),
                width: restoredWidth,
                height: restoredHeight,
            };

            if (savedSize.minHeight == null) {
                delete restoredStyle.minHeight;
            } else {
                restoredStyle.minHeight = savedSize.minHeight;
            }

            return {
                ...node,
                width: restoredWidth,
                height: restoredHeight,
                style: restoredStyle,
                data: {
                    ...(node.data || {}),
                    isCollapsed: false,
                },
            };
        })
    );

    requestAnimationFrame(() => {
        containersToExpand.forEach((containerId) =>
            updateNodeInternals(containerId)
        );
    });
};

const focusProblemNodes = ({
    focusIds,
    primaryFocusId,
    getNodes,
    setCenter,
    fitView,
}) => {
    if (focusIds.length === 0) return;

    // Give React Flow two frames to apply expanded container dimensions and
    // remeasure nested nodes before navigating to a hidden child.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const currentNodes = getNodes();

            if (primaryFocusId) {
                const focusNode = currentNodes.find(
                    (node) => node.id === primaryFocusId
                );

                if (focusNode) {
                    const position = getAbsoluteNodePosition(
                        focusNode,
                        currentNodes
                    );
                    const width =
                        Number(focusNode.measured?.width) ||
                        Number(focusNode.width) ||
                        Number(focusNode.style?.width) ||
                        220;
                    const height =
                        Number(focusNode.measured?.height) ||
                        Number(focusNode.height) ||
                        Number(focusNode.style?.height) ||
                        90;

                    setCenter(
                        position.x + width / 2,
                        position.y + height / 2,
                        { zoom: 1, duration: 300 }
                    );
                    return;
                }
            }

            fitView({
                nodes: focusIds.map((id) => ({ id })),
                padding: 0.55,
                maxZoom: 1.25,
                duration: 300,
            });
        });
    });
};

export const useProblemNavigation = ({
    edges,
    setEdges,
    setNodes,
    setSelectedNodeId,
    setActiveMode,
    setShowTransitionEdges,
    setActiveTab,
    setRightPanelTab,
    getNodes,
    setCenter,
    fitView,
    updateNodeInternals,
    selectEditorNode,
}) =>
    useCallback(
        (problem) => {
            if (!problem) return;

            if (problem.mode) {
                setActiveMode(problem.mode);
            }

            const liveNodes = getNodes();
            const liveNodeById = new Map(
                liveNodes.map((node) => [node.id, node])
            );
            const problemEdge = problem.edgeId
                ? edges.find((edge) => edge.id === problem.edgeId)
                : null;
            const transitionSourceId = getTransitionProblemSourceId(
                problem,
                problemEdge
            );
            const slotProblemNodeId = getSlotProblemNodeId(
                problem,
                liveNodeById
            );
            const selectedProblemNodeId =
                transitionSourceId && liveNodeById.has(transitionSourceId)
                    ? transitionSourceId
                    : slotProblemNodeId
                        ? slotProblemNodeId
                        : problem.nodeId && liveNodeById.has(problem.nodeId)
                            ? problem.nodeId
                            : null;

            const requestedFocusIds = problem.focusNodeIds?.length
                ? [...problem.focusNodeIds]
                : selectedProblemNodeId
                    ? [selectedProblemNodeId]
                    : [];

            if (
                transitionSourceId &&
                liveNodeById.has(transitionSourceId) &&
                !requestedFocusIds.includes(transitionSourceId)
            ) {
                requestedFocusIds.unshift(transitionSourceId);
            }

            const focusIds = requestedFocusIds.filter((id) =>
                liveNodeById.has(id)
            );
            const containersToExpand = [
                ...collectContainerAncestors(focusIds, liveNodeById),
            ].sort(
                (leftId, rightId) =>
                    getAncestorDepth(leftId, liveNodeById) -
                    getAncestorDepth(rightId, liveNodeById)
            );

            expandProblemContainers({
                containersToExpand,
                setNodes,
                updateNodeInternals,
            });

            if (problem.category === "Transitions" && problem.edgeId) {
                setShowTransitionEdges(true);
            }

            setEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...edge,
                    selected: Boolean(
                        problem.edgeId && edge.id === problem.edgeId
                    ),
                }))
            );

            if (selectedProblemNodeId) {
                if (slotProblemNodeId === selectedProblemNodeId) {
                    selectEditorNode?.(selectedProblemNodeId, {
                        kind: "slot",
                        tab: "slots",
                    });
                } else {
                    setNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: node.id === selectedProblemNodeId,
                        }))
                    );
                    setSelectedNodeId(selectedProblemNodeId);
                    setActiveTab(problem.detailTab || "allgemein");
                    setRightPanelTab("details");
                }
            } else if (problem.category === "Datamodel") {
                setSelectedNodeId(null);
                setRightPanelTab("datamodel");
            }

            focusProblemNodes({
                focusIds,
                primaryFocusId:
                    selectedProblemNodeId ||
                    (focusIds.length === 1 ? focusIds[0] : null),
                getNodes,
                setCenter,
                fitView,
            });
        },
        [
            edges,
            fitView,
            getNodes,
            setActiveMode,
            setActiveTab,
            setCenter,
            setEdges,
            setNodes,
            setRightPanelTab,
            setSelectedNodeId,
            setShowTransitionEdges,
            updateNodeInternals,
            selectEditorNode,
        ]
    );
