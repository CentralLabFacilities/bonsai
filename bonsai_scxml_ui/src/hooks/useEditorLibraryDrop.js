import { useCallback } from "react";
import {
    COMPOUND_BOTTOM_PADDING,
    COMPOUND_HEADER_HEIGHT,
    COMPOUND_NODE_GAP,
    COMPOUND_PADDING_X,
    PARALLEL_EXIT_GUTTER,
    PARALLEL_HEADER_HEIGHT,
    PARALLEL_LANE_CHILD_TOP_INSET,
    PARALLEL_NODE_GAP,
    findDropContainerAtPoint,
    getCompoundExitGutterWidth,
    getNodeId,
    isAutoParallelLaneCompound,
    orderNodesParentsFirst,
    resolveNodeCollisionsAndRefit,
} from "../utils/editorGeometry";
import { getOverviewLayoutNodeSize } from "../utils/layoutUtils";

export function useEditorLibraryDrop({
    activeMode,
    nodes,
    screenToFlowPosition,
    setParallelDropTargetId,
    setCompoundDropTargetId,
    createBehaviorNode,
    createNode,
    checkSlotConnection,
    getNodes,
    setNodes,
    setSelectedNodeId,
    syncInsertedEditorStatesAfterCommit,
    syncInsertedParallelLaneStateAfterCommit,
}) {
    const handleLibraryDragOver = useCallback(
        (event) => {
            event.preventDefault();

            const skill = event.dataTransfer.getData("skill");
            const behavior = event.dataTransfer.getData("behavior");
            if (!skill && !behavior) return;

            const pointerPosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const hoveredContainer = findDropContainerAtPoint(
                pointerPosition,
                nodes
            );
            const hoveredCompound =
                hoveredContainer?.type === "compound"
                    ? hoveredContainer
                    : null;
            const hoveredLane =
                hoveredContainer?.type === "parallelLane"
                    ? hoveredContainer
                    : null;

            setCompoundDropTargetId(hoveredCompound?.id || null);
            setParallelDropTargetId(hoveredLane?.id || null);
        },
        [
            nodes,
            screenToFlowPosition,
            setCompoundDropTargetId,
            setParallelDropTargetId,
        ]
    );

    const handleLibraryDragLeave = useCallback(
        (event) => {
            const rect = event.currentTarget.getBoundingClientRect();

            const actuallyLeft =
                event.clientX <= rect.left ||
                event.clientX >= rect.right ||
                event.clientY <= rect.top ||
                event.clientY >= rect.bottom;

            if (actuallyLeft) {
                setParallelDropTargetId(null);
                setCompoundDropTargetId(null);
            }
        },
        [setCompoundDropTargetId, setParallelDropTargetId]
    );

    const handleLibraryDrop = useCallback(
        async (event) => {
            event.preventDefault();

            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);

            if (activeMode === "code") return;

            const mousePosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const targetContainer = findDropContainerAtPoint(
                mousePosition,
                nodes
            );
            const targetCompound =
                targetContainer?.type === "compound" ? targetContainer : null;
            const targetLane =
                targetContainer?.type === "parallelLane"
                    ? targetContainer
                    : null;
            const targetLaneCompound = targetLane
                ? nodes.find(
                    (candidate) =>
                        candidate.parentId === targetLane.id &&
                        isAutoParallelLaneCompound(candidate)
                ) || null
                : null;
            const insertionCompound = targetCompound || targetLaneCompound;

            const behaviorPayload = event.dataTransfer.getData("behavior");
            const skill = event.dataTransfer.getData("skill");
            const isBehaviorDrop = Boolean(behaviorPayload);

            let newNode;

            if (behaviorPayload) {
                try {
                    const behavior = JSON.parse(behaviorPayload);
                    newNode = await createBehaviorNode(behavior, { x: 0, y: 0 });
                } catch (error) {
                    console.error("Invalid behavior drag payload:", error);
                    return;
                }
            } else {
                if (!skill) return;
                newNode = await createNode(
                    skill.split("skills.")[1],
                    getNodeId(),
                    { x: 0, y: 0 }
                );
            }

            const refreshBehaviorSlots = () => {
                if (!isBehaviorDrop) return;
                requestAnimationFrame(() => {
                    checkSlotConnection(getNodes());
                });
            };

            const {
                width: estimatedNodeWidth,
                height: estimatedNodeHeight,
            } = getOverviewLayoutNodeSize(newNode);

            if (insertionCompound) {
                let newX = COMPOUND_PADDING_X;

                nodes
                    .filter(
                        (member) => member.parentId === insertionCompound.id
                    )
                    .forEach((member) => {
                        const size = getOverviewLayoutNodeSize(member);
                        newX = Math.max(
                            newX,
                            Number(member.position?.x || 0) +
                            size.width +
                            COMPOUND_NODE_GAP
                        );
                    });

                newNode.parentId = insertionCompound.id;
                newNode.extent = "parent";
                newNode.position = {
                    x: newX,
                    y: COMPOUND_HEADER_HEIGHT,
                };

                setNodes((currentNodes) => {
                    const right = newX + estimatedNodeWidth;
                    const bottom =
                        COMPOUND_HEADER_HEIGHT + estimatedNodeHeight;

                    return orderNodesParentsFirst([
                        ...currentNodes.map((candidate) =>
                            candidate.id === insertionCompound.id
                                ? {
                                    ...candidate,
                                    style: {
                                        ...candidate.style,
                                        width: Math.max(
                                            Number(candidate.style?.width) || 320,
                                            right +
                                            COMPOUND_PADDING_X +
                                            getCompoundExitGutterWidth(
                                                insertionCompound.data?.events || []
                                            )
                                        ),
                                        height: Math.max(
                                            Number(candidate.style?.height) || 180,
                                            bottom + COMPOUND_BOTTOM_PADDING
                                        ),
                                    },
                                }
                                : candidate
                        ),
                        newNode,
                    ]);
                });

                setSelectedNodeId(newNode.id);
                refreshBehaviorSlots();
                void syncInsertedEditorStatesAfterCommit?.(newNode.id);
                return;
            }

            if (targetLane) {
                const existingMembers = nodes.filter(
                    (node) => node.parentId === targetLane.id
                );

                let newX = 25;
                existingMembers.forEach((member) => {
                    const memberWidth = getOverviewLayoutNodeSize(member).width;
                    newX = Math.max(
                        newX,
                        Number(member.position?.x || 0) +
                        memberWidth +
                        PARALLEL_NODE_GAP
                    );
                });

                newNode.parentId = targetLane.id;
                newNode.extent = "parent";
                newNode.position = {
                    x: newX,
                    y: PARALLEL_LANE_CHILD_TOP_INSET,
                };
                const parallelId = targetLane.parentId;

                setNodes((currentNodes) => {
                    let nextNodes = [...currentNodes, newNode];

                    const parallel = nextNodes.find(
                        (node) => node.id === parallelId
                    );
                    if (!parallel) {
                        return orderNodesParentsFirst(nextNodes);
                    }

                    const lanes = nextNodes
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

                    let requiredParallelWidth = 420;
                    lanes.forEach((lane) => {
                        const members = nextNodes.filter(
                            (node) => node.parentId === lane.id
                        );
                        let maxRight = 0;

                        members.forEach((member) => {
                            const memberWidth =
                                member.id === newNode.id
                                    ? estimatedNodeWidth
                                    : getOverviewLayoutNodeSize(member).width;
                            maxRight = Math.max(
                                maxRight,
                                Number(member.position?.x || 0) + memberWidth
                            );
                        });

                        requiredParallelWidth = Math.max(
                            requiredParallelWidth,
                            maxRight + PARALLEL_EXIT_GUTTER
                        );
                    });

                    const laneLayouts = new Map();
                    const headerHeight =
                        lanes.length > 0
                            ? Math.max(
                                PARALLEL_HEADER_HEIGHT,
                                Number(
                                    lanes[0].position?.y ||
                                    PARALLEL_HEADER_HEIGHT
                                )
                            )
                            : PARALLEL_HEADER_HEIGHT;
                    let currentY = headerHeight;

                    lanes.forEach((lane) => {
                        const members = nextNodes.filter(
                            (node) => node.parentId === lane.id
                        );
                        let maxBottom = 0;

                        members.forEach((member) => {
                            const memberHeight =
                                member.id === newNode.id
                                    ? estimatedNodeHeight
                                    : getOverviewLayoutNodeSize(member).height;
                            maxBottom = Math.max(
                                maxBottom,
                                Number(member.position?.y || 0) + memberHeight
                            );
                        });

                        const requiredHeight = Math.max(130, maxBottom + 30);
                        laneLayouts.set(lane.id, {
                            y: currentY,
                            height: requiredHeight,
                        });
                        currentY += requiredHeight;
                    });

                    const requiredParallelHeight = currentY + 35;

                    nextNodes = nextNodes.map((node) => {
                        if (node.id === parallelId) {
                            return {
                                ...node,
                                style: {
                                    ...node.style,
                                    width: requiredParallelWidth,
                                    height: requiredParallelHeight,
                                },
                            };
                        }

                        if (
                            node.type === "parallelLane" &&
                            node.parentId === parallelId
                        ) {
                            const layout = laneLayouts.get(node.id);
                            if (!layout) return node;
                            return {
                                ...node,
                                position: {
                                    ...node.position,
                                    y: layout.y,
                                },
                                style: {
                                    ...node.style,
                                    width: requiredParallelWidth,
                                    height: layout.height,
                                },
                            };
                        }

                        return node;
                    });

                    return orderNodesParentsFirst(nextNodes);
                });

                setSelectedNodeId(newNode.id);
                refreshBehaviorSlots();
                void syncInsertedParallelLaneStateAfterCommit?.(
                    newNode.id,
                    targetLane.id
                );
                return;
            }

            newNode.position = {
                x: mousePosition.x - estimatedNodeWidth / 2,
                y: mousePosition.y - estimatedNodeHeight / 2,
            };

            setNodes((currentNodes) =>
                resolveNodeCollisionsAndRefit(
                    [...currentNodes, newNode],
                    newNode.id
                )
            );
            setSelectedNodeId(newNode.id);
            refreshBehaviorSlots();
            void syncInsertedEditorStatesAfterCommit?.(newNode.id);
        },
        [
            activeMode,
            checkSlotConnection,
            createBehaviorNode,
            createNode,
            getNodes,
            nodes,
            screenToFlowPosition,
            setCompoundDropTargetId,
            setNodes,
            setParallelDropTargetId,
            setSelectedNodeId,
            syncInsertedEditorStatesAfterCommit,
            syncInsertedParallelLaneStateAfterCommit,
        ]
    );

    return {
        handleLibraryDragOver,
        handleLibraryDragLeave,
        handleLibraryDrop,
    };
}
