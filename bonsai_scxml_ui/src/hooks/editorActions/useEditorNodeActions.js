import { useCallback } from "react";
import {
    getNodeId,
    COMPOUND_PADDING_X,
    COMPOUND_HEADER_HEIGHT,
    PARALLEL_LANE_CHILD_TOP_INSET,
    orderNodesParentsFirst,
    resolveNodeCollisionsAndRefit,
    normalizeParallelLaneCompounds,
    normalizeCompoundInitialStates,
} from "../../utils/editorGeometry";
import { getOverviewLayoutNodeSize } from "../../utils/layoutUtils";
import {
    buildEditorCloneNode,
    isCloneableEditorNode,
    isEditorCloneNode,
} from "../../utils/editorClones";

/**
 * State/reference mutations for the editor document.
 *
 * Viewport movement and context-menu state intentionally stay outside this
 * hook; only the graph/document mutation and resulting editor selection live
 * here.
 */
export function useEditorNodeActions({
    nodes,
    slotNodes,
    setNodes,
    setSlotNodes,
    setSelectedNodeId,
    setRightPanelTab,
    setActiveTab,
    applyWorkflowCommand,
}) {
    const selectEditorNode = useCallback(
        (nodeId, options = {}) => {
            if (!nodeId) return false;

            const explicitKind = options.kind;
            const slotNode = slotNodes.find((node) => node.id === nodeId);
            const isSlot =
                explicitKind === "slot" ||
                (explicitKind !== "node" && Boolean(slotNode));
            const exists = options.allowMissing
                ? true
                : isSlot
                  ? Boolean(slotNode) || explicitKind === "slot"
                  : nodes.some((node) => node.id === nodeId);

            if (!exists) return false;

            setNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: !isSlot && node.id === nodeId,
                }))
            );
            setSlotNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: isSlot && node.id === nodeId,
                }))
            );
            setSelectedNodeId(nodeId);

            if (options.openDetails !== false) {
                setRightPanelTab("details");
            }
            if (options.tab !== null) {
                setActiveTab(options.tab || (isSlot ? "slots" : "allgemein"));
            }

            return true;
        },
        [
            nodes,
            slotNodes,
            setNodes,
            setSlotNodes,
            setSelectedNodeId,
            setRightPanelTab,
            setActiveTab,
        ]
    );

    const clearEditorNodeSelection = useCallback(() => {
        setNodes((currentNodes) =>
            currentNodes.map((node) =>
                node.selected ? { ...node, selected: false } : node
            )
        );
        setSlotNodes((currentNodes) =>
            currentNodes.map((node) =>
                node.selected ? { ...node, selected: false } : node
            )
        );
        setSelectedNodeId(null);
    }, [setNodes, setSlotNodes, setSelectedNodeId]);

    const createEditorReference = useCallback(
        (sourceNode, position) => {
            if (!isCloneableEditorNode(sourceNode) || !position) return null;

            const cloneNode = buildEditorCloneNode(sourceNode, {
                x: Number(position.x || 0),
                y: Number(position.y || 0),
            });
            if (!cloneNode) return null;

            if (sourceNode.type === "slot") {
                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
                setSlotNodes((currentSlotNodes) => [
                    ...currentSlotNodes.map((node) => ({
                        ...node,
                        selected: false,
                    })),
                    cloneNode,
                ]);
            } else {
                setSlotNodes((currentSlotNodes) =>
                    currentSlotNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
                setNodes((currentNodes) => [
                    ...currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    })),
                    cloneNode,
                ]);
            }

            setSelectedNodeId(cloneNode.id);
            setRightPanelTab("details");
            setActiveTab(sourceNode.type === "slot" ? "slots" : "allgemein");
            return cloneNode;
        },
        [
            setNodes,
            setSlotNodes,
            setSelectedNodeId,
            setRightPanelTab,
            setActiveTab,
        ]
    );

    const setNodeAsInitial = useCallback(
        (nodeId) => {
            if (!nodeId) return;

            const selected = nodes.find((node) => node.id === nodeId);
            if (!selected || isEditorCloneNode(selected)) return;

            const parentId = selected.parentId || null;
            const parentNode = parentId
                ? nodes.find((node) => node.id === parentId)
                : null;

            if (
                parentId &&
                (!parentNode ||
                    !["compound", "parallelLane"].includes(parentNode.type))
            ) {
                return;
            }

            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (
                        parentNode?.type === "compound" &&
                        node.id === parentId
                    ) {
                        return {
                            ...node,
                            data: {
                                ...(node.data || {}),
                                initialChildId: selected.id,
                            },
                        };
                    }

                    if ((node.parentId || null) !== parentId) return node;
                    if (
                        node.type === "slot" ||
                        node.type === "parallelLane"
                    ) {
                        return node;
                    }

                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            isInitial: node.id === selected.id,
                        },
                    };
                })
            );

            if (!parentId) {
                void applyWorkflowCommand?.({
                    type: "setRootInitial",
                    stateId: selected.id,
                });
            } else if (
                parentNode?.type === "compound" &&
                !parentNode.data?.autoParallelLaneCompound
            ) {
                void applyWorkflowCommand?.({
                    type: "setStateInitialChild",
                    parentStateId: parentId,
                    stateId: selected.id,
                });
            }
            // Parallel lanes are flattened by the semantic exporter in some
            // layouts, so their initial child stays local until lane commands
            // are represented directly in the Rust model.
        },
        [nodes, setNodes, applyWorkflowCommand]
    );

    const addEmptyStateToContainer = useCallback(
        (parentId) => {
            if (!parentId) return null;

            const newNodeId = getNodeId();
            setNodes((currentNodes) => {
                const parent = currentNodes.find(
                    (node) => node.id === parentId
                );
                if (
                    !parent ||
                    !["compound", "parallelLane"].includes(parent.type)
                ) {
                    return currentNodes;
                }

                const children = currentNodes.filter(
                    (node) =>
                        node.parentId === parentId &&
                        node.type !== "parallelLane"
                );
                const stateCount = currentNodes.filter((node) =>
                    String(node.data?.label || "").startsWith("state_")
                ).length;
                const stateName = `state_${stateCount + 1}`;
                const isFirstChild = children.length === 0;
                const childX =
                    parent.type === "compound" ? COMPOUND_PADDING_X : 24;
                const childStartY =
                    parent.type === "compound"
                        ? COMPOUND_HEADER_HEIGHT + 18
                        : PARALLEL_LANE_CHILD_TOP_INSET;
                const nextY = children.reduce((maxY, child) => {
                    const size = getOverviewLayoutNodeSize(child);
                    return Math.max(
                        maxY,
                        Number(child.position?.y || 0) + size.height + 18
                    );
                }, childStartY);

                const newState = {
                    id: newNodeId,
                    type: "compound",
                    parentId,
                    extent: "parent",
                    expandParent: true,
                    position: { x: childX, y: nextY },
                    style: { width: 300, height: 180 },
                    selected: true,
                    data: {
                        label: stateName,
                        fullSkillName: stateName,
                        isInitial: isFirstChild,
                        events: [],
                    },
                };

                const withSelection = currentNodes.map((node) => ({
                    ...node,
                    selected: false,
                    ...(node.id === parentId &&
                    parent.type === "compound" &&
                    isFirstChild
                        ? {
                              data: {
                                  ...(node.data || {}),
                                  initialChildId: newNodeId,
                              },
                          }
                        : {}),
                }));

                let nextNodes = resolveNodeCollisionsAndRefit(
                    [...withSelection, newState],
                    newNodeId
                );
                nextNodes = normalizeParallelLaneCompounds(nextNodes);
                nextNodes = normalizeCompoundInitialStates(nextNodes);
                return orderNodesParentsFirst(nextNodes);
            });

            // Keep the previous App.jsx behavior: once an add-state action is
            // issued, focus the newly allocated id immediately.
            setSelectedNodeId(newNodeId);
            setRightPanelTab("details");
            setActiveTab("allgemein");
            return newNodeId;
        },
        [setNodes, setSelectedNodeId, setRightPanelTab, setActiveTab]
    );

    return {
        selectEditorNode,
        clearEditorNodeSelection,
        createEditorReference,
        setNodeAsInitial,
        addEmptyStateToContainer,
    };
}
