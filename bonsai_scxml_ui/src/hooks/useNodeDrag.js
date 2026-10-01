import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCollisionScope } from "../utils/nodeCollisions";
import { rebuildBoundaryTransitions } from "../utils/boundaryTransitions";
import { getOverviewLayoutNodeSize } from "../utils/layoutUtils";
import {
    COMPOUND_HEADER_HEIGHT,
    COMPOUND_PADDING_X,
    COMPOUND_BOTTOM_PADDING,
    NODE_COLLISION_OPTIONS,
    PARALLEL_NODE_GAP,
    PARALLEL_LANE_CHILD_TOP_INSET,
    fitCompoundAndAncestorCompounds,
    getAbsoluteNodePosition,
    getDirectCompoundForNode,
    getCompoundExitGutterWidth,
    getLaneForNode,
    getNodeSize,
    growParallelToLaneContents,
    isParallelLaneSkillCandidate,
    isAutoParallelLaneCompound,
    findDropContainerAtPoint,
    resolveNodeCollisionsAndRefit,
} from "../utils/editorGeometry";

const CONTAINER_EXIT_RESISTANCE = 52;

const pointInsideBounds = (point, bounds, margin = 0) => Boolean(
    bounds &&
    point.x >= bounds.x - margin &&
    point.x <= bounds.x + bounds.width + margin &&
    point.y >= bounds.y - margin &&
    point.y <= bounds.y + bounds.height + margin
);

export function useNodeDrag({
    edges,
    activeMode,
    setNodes,
    setEdges,
    setSlotEdges,
    setSlotNodes,
    setSelectedNodeId,
    setHoveredEditorEdgeId,
    screenToFlowPosition,
    getNodes,
    syncStatePosition,
    syncStateEditorPositions,
    syncRemovedStates,
    syncEditorStructureAfterCommit,
}) {
    const [parallelDropTargetId, setParallelDropTargetId] = useState(null);
    const [compoundDropTargetId, setCompoundDropTargetId] = useState(null);
    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [draggingNodeId, setDraggingNodeId] = useState(null);
    const [isOverTrash, setIsOverTrash] = useState(false);

    const dragFrameRef = useRef(null);
    const pendingNodeDragRef = useRef(null);

    useEffect(() => () => {
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }
    }, []);

    const dragContainerIndexRef = useRef({ lanes: [], compounds: [] });
    const dragOriginContainerRef = useRef(null);
    const dragOriginParentIdRef = useRef(null);

    const buildDragContainerIndex = useCallback((currentNodes) => {
        const currentNodeById = new Map(
            currentNodes.map((node) => [node.id, node])
        );

        const getAncestorIds = (node) => {
            const result = new Set();
            let parentId = node?.parentId;
            const seen = new Set();

            while (parentId && !seen.has(parentId)) {
                seen.add(parentId);
                result.add(parentId);
                parentId = currentNodeById.get(parentId)?.parentId;
            }

            return result;
        };

        const toBounds = (node) => {
            const absolute = getAbsoluteNodePosition(node, currentNodes);
            const size =
                node.type === "parallelLane"
                    ? {
                          width: Number(node.style?.width) || 420,
                          height: Number(node.style?.height) || 110,
                      }
                    : getNodeSize(node);
            const ancestorIds = getAncestorIds(node);

            return {
                id: node.id,
                type: node.type,
                x: absolute.x,
                y: absolute.y,
                width: size.width,
                height: size.height,
                depth: ancestorIds.size,
                ancestorIds,
            };
        };

        const lanes = [];
        const compounds = [];

        currentNodes.forEach((node) => {
            if (node.type === "parallelLane") {
                lanes.push(toBounds(node));
            } else if (
                node.type === "compound" &&
                !isAutoParallelLaneCompound(node)
            ) {
                compounds.push(toBounds(node));
            }
        });

        compounds.sort((a, b) => b.depth - a.depth);
        return { lanes, compounds };
    }, []);

    const handleNodeDragStart = useCallback((event, node) => {
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }
        pendingNodeDragRef.current = null;

        // Container bounds are static for the duration of a drag. Build the
        // hit-test index once here instead of deriving signatures from the
        // full nodes array on every pointer-driven position update.
        const currentNodes = getNodes();
        dragContainerIndexRef.current = buildDragContainerIndex(currentNodes);

        // Prefer the immediate Compound boundary when a skill is nested in a
        // Compound that itself lives inside a Parallel lane. If there is no
        // direct Compound parent, the lane boundary becomes the sticky one.
        const sourceCompound = getDirectCompoundForNode(node, currentNodes);
        const sourceLane = sourceCompound
            ? null
            : getLaneForNode(node, currentNodes);
        const sourceContainer = sourceCompound || sourceLane;
        if (sourceContainer) {
            const absolute = getAbsoluteNodePosition(sourceContainer, currentNodes);
            const size = sourceLane
                ? {
                    width: Number(sourceLane.style?.width) || 420,
                    height: Number(sourceLane.style?.height) || 110,
                }
                : getNodeSize(sourceCompound);
            const immediateParent = currentNodes.find(
                (candidate) => candidate.id === node.parentId
            );
            const parentAbsolute = immediateParent
                ? getAbsoluteNodePosition(immediateParent, currentNodes)
                : { x: 0, y: 0 };
            const nodeSize = getNodeSize(node);

            dragOriginContainerRef.current = {
                kind: sourceLane ? "parallelLane" : "compound",
                id: sourceContainer.id,
                x: absolute.x,
                y: absolute.y,
                width: size.width,
                height: size.height,
                parentAbsolute,
                nodeWidth: nodeSize.width,
                nodeHeight: nodeSize.height,
            };
        } else {
            dragOriginContainerRef.current = null;
        }

        dragOriginParentIdRef.current = node.parentId || null;
        setDraggingNodeId(node.id);
        setIsDraggingNode(true);
        setHoveredEditorEdgeId(null);

        // Nodes innerhalb einer Lane dürfen vorübergehend den
        // bisherigen Parent verlassen.
        if (
            getLaneForNode(node, currentNodes) ||
            getDirectCompoundForNode(node, currentNodes)
        ) {
            setNodes((allNodes) =>
                allNodes.map((candidate) =>
                    candidate.id === node.id
                        ? {
                            ...candidate,
                            extent: undefined,
                            // React Flow's expandParent would otherwise resize
                            // the container live while this child is dragged.
                            expandParent: undefined,
                        }
                        : candidate
                )
            );
        }
    }, [buildDragContainerIndex, getNodes, setNodes, setHoveredEditorEdgeId]);

    const processPendingNodeDrag = useCallback(() => {
        dragFrameRef.current = null;
        const pending = pendingNodeDragRef.current;
        if (!pending) return;

        const { clientX, clientY, nodeId, nodeType, isEditorClone } = pending;
        const isOverTrash = Boolean(
            document
                .elementFromPoint(clientX, clientY)
                ?.closest(".trash-bin-dropzone")
        );

        setIsOverTrash(isOverTrash);

        // Parallel-lane helper nodes are layout-only. Editor references keep
        // the semantic scope of their original state, so generic container
        // drop highlighting does not apply to them.
        if (isOverTrash || nodeType === "parallelLane" || isEditorClone) {
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        const pointerPosition = screenToFlowPosition({
            x: clientX,
            y: clientY,
        });
        const containsPointer = (entry) =>
            pointerPosition.x >= entry.x &&
            pointerPosition.x <= entry.x + entry.width &&
            pointerPosition.y >= entry.y &&
            pointerPosition.y <= entry.y + entry.height;
        const canUseTarget = (entry) =>
            entry.id !== nodeId && !entry.ancestorIds.has(nodeId);

        const dragContainerIndex = dragContainerIndexRef.current;
        const hoveredContainer = [
            ...dragContainerIndex.compounds,
            ...(nodeType !== "parallel" ? dragContainerIndex.lanes : []),
        ]
            .filter((entry) => canUseTarget(entry) && containsPointer(entry))
            .sort((a, b) => b.depth - a.depth)[0] || null;

        let hoveredLane =
            hoveredContainer?.type === "parallelLane"
                ? hoveredContainer
                : null;
        let effectiveCompound =
            hoveredContainer?.type === "compound"
                ? hoveredContainer
                : null;

        // A node already inside a container is "sticky" at the border. The
        // source container remains highlighted for a small margin outside its
        // real bounds; only dragging farther than that margin releases it.
        const origin = dragOriginContainerRef.current;
        if (
            !effectiveCompound &&
            !hoveredLane &&
            origin &&
            pointInsideBounds(pointerPosition, origin, CONTAINER_EXIT_RESISTANCE)
        ) {
            if (origin.kind === "compound") {
                effectiveCompound = dragContainerIndex.compounds.find(
                    (entry) => entry.id === origin.id
                ) || origin;
            } else if (origin.kind === "parallelLane" && nodeType !== "parallel") {
                hoveredLane = dragContainerIndex.lanes.find(
                    (entry) => entry.id === origin.id
                ) || origin;
            }
        }

        setCompoundDropTargetId(effectiveCompound?.id || null);
        setParallelDropTargetId(hoveredLane?.id || null);
    }, [screenToFlowPosition]);

    const handleNodeDrag = useCallback((event, draggedNode) => {
        pendingNodeDragRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
            nodeId: draggedNode.id,
            nodeType: draggedNode.type,
            isEditorClone: Boolean(
                draggedNode.data?.isSkillClone || draggedNode.data?.isStateClone
            ),
        };

        // Give skills a tangible "sticky" container border while dragging.
        // React Flow has already applied the pointer-driven position by the
        // time this callback runs, so clamp the controlled node back inside
        // the original container while the pointer is only slightly outside.
        // Once the pointer moves past CONTAINER_EXIT_RESISTANCE the clamp is
        // released and the skill can leave normally.
        const origin = dragOriginContainerRef.current;
        if (
            origin &&
            draggedNode.type === "custom" &&
            !(draggedNode.data?.isSkillClone || draggedNode.data?.isStateClone)
        ) {
            const pointerPosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            const isOutsideContainer = !pointInsideBounds(
                pointerPosition,
                origin,
                0
            );
            const isInsideResistanceZone = pointInsideBounds(
                pointerPosition,
                origin,
                CONTAINER_EXIT_RESISTANCE
            );

            if (isOutsideContainer && isInsideResistanceZone) {
                const padding = 16;
                const parentAbsolute = origin.parentAbsolute || { x: 0, y: 0 };
                const nodeWidth = Number(origin.nodeWidth) || getNodeSize(draggedNode).width;
                const nodeHeight = Number(origin.nodeHeight) || getNodeSize(draggedNode).height;
                const desiredAbsolute = {
                    x: parentAbsolute.x + Number(draggedNode.position?.x || 0),
                    y: parentAbsolute.y + Number(draggedNode.position?.y || 0),
                };
                const maxX = Math.max(
                    origin.x + padding,
                    origin.x + origin.width - nodeWidth - padding
                );
                const maxY = Math.max(
                    origin.y + padding,
                    origin.y + origin.height - nodeHeight - padding
                );
                const clampedAbsolute = {
                    x: Math.min(maxX, Math.max(origin.x + padding, desiredAbsolute.x)),
                    y: Math.min(maxY, Math.max(origin.y + padding, desiredAbsolute.y)),
                };

                setNodes((currentNodes) =>
                    currentNodes.map((candidate) =>
                        candidate.id === draggedNode.id
                            ? {
                                ...candidate,
                                position: {
                                    x: clampedAbsolute.x - parentAbsolute.x,
                                    y: clampedAbsolute.y - parentAbsolute.y,
                                },
                            }
                            : candidate
                    )
                );
            }
        }

        if (dragFrameRef.current === null) {
            dragFrameRef.current = requestAnimationFrame(processPendingNodeDrag);
        }
    }, [processPendingNodeDrag, screenToFlowPosition, setNodes]);

    const handleNodeDragStop = useCallback((event, node) => {
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }
        pendingNodeDragRef.current = null;
        const dragOriginContainer = dragOriginContainerRef.current;
        const dragOriginParentId = dragOriginParentIdRef.current;
        dragContainerIndexRef.current = { lanes: [], compounds: [] };
        dragOriginContainerRef.current = null;
        dragOriginParentIdRef.current = null;

        const element = document.elementFromPoint(
            event.clientX,
            event.clientY
        );

        if (element?.closest(".trash-bin-dropzone")) {
            const currentNodes = getNodes();
            const idsToDelete = new Set([node.id]);
            let foundNew = true;

            while (foundNew) {
                foundNew = false;
                currentNodes.forEach((candidate) => {
                    const isDescendant =
                        candidate.parentId && idsToDelete.has(candidate.parentId);
                    const isCloneOfDeletedState =
                        (candidate.data?.isSkillClone || candidate.data?.isStateClone) &&
                        idsToDelete.has(candidate.data?.cloneOfNodeId);

                    if (
                        (isDescendant || isCloneOfDeletedState) &&
                        !idsToDelete.has(candidate.id)
                    ) {
                        idsToDelete.add(candidate.id);
                        foundNew = true;
                    }
                });
            }

            const removedReferenceNodes = currentNodes.filter(
                (candidate) =>
                    idsToDelete.has(candidate.id) &&
                    (candidate.data?.isSkillClone || candidate.data?.isStateClone)
            );
            const referenceStateIds = removedReferenceNodes.map(
                (candidate) => candidate.id
            );
            const referenceSourceIds = Array.from(
                new Set(
                    removedReferenceNodes
                        .map((candidate) => candidate.data?.cloneOfNodeId)
                        .filter((sourceId) => sourceId && !idsToDelete.has(sourceId))
                )
            );
            const removedSemanticNodes = currentNodes.filter(
                (candidate) =>
                    idsToDelete.has(candidate.id) &&
                    !candidate.data?.isSkillClone &&
                    !candidate.data?.isStateClone
            );
            const refreshSlots = removedSemanticNodes.some(
                (candidate) =>
                    (candidate.data?.inSlots || []).some((slot) => slot?.path) ||
                    (candidate.data?.outSlots || []).some((slot) => slot?.path)
            );
            const forceStructureSync = removedSemanticNodes.some(
                (candidate) =>
                    candidate.type === "parallelLane" ||
                    candidate.data?.autoParallelLaneCompound
            );

            setNodes((allNodes) =>
                allNodes
                    .filter((candidate) => !idsToDelete.has(candidate.id))
                    .map((candidate) => {
                        if (
                            candidate.type !== "compound" &&
                            candidate.type !== "parallelLane"
                        ) {
                            return candidate;
                        }

                        return {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: (candidate.data?.events || []).filter(
                                    (event) =>
                                        !idsToDelete.has(event.sourceNodeId)
                                ),
                            },
                        };
                    })
            );

            setEdges((currentEdges) =>
                currentEdges.filter(
                    (edge) =>
                        !idsToDelete.has(edge.source) &&
                        !idsToDelete.has(edge.target) &&
                        !idsToDelete.has(edge.data?.boundaryOriginalSource) &&
                        !idsToDelete.has(edge.data?.compoundOriginalSource) &&
                        !idsToDelete.has(edge.data?.compoundOriginalTarget) &&
                        !idsToDelete.has(edge.data?.parallelOriginalSource) &&
                        !idsToDelete.has(edge.data?.parallelOriginalTarget)
                )
            );

            setSlotEdges((currentEdges) => {
                const updatedEdges = currentEdges.filter(
                    (edge) =>
                        !idsToDelete.has(edge.source) &&
                        !idsToDelete.has(edge.target)
                );

                setSlotNodes((currentSlotNodes) =>
                    currentSlotNodes.filter((slotNode) =>
                        updatedEdges.some(
                            (edge) =>
                                edge.source === slotNode.id ||
                                edge.target === slotNode.id
                        )
                    )
                );

                return updatedEdges;
            });

            setSelectedNodeId((id) =>
                idsToDelete.has(id) ? null : id
            );

            void syncRemovedStates?.([...idsToDelete], {
                refreshSlots,
                forceStructure: forceStructureSync,
                referenceStateIds,
                referenceSourceIds,
            });

            setDraggingNodeId(null);
            setIsDraggingNode(false);
            setIsOverTrash(false);
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        // Parallel-lane helper nodes themselves are not draggable between
        // containers. Compound and parallel states are intentionally allowed.
        if (node.type === "parallelLane") {
            setDraggingNodeId(null);
            setIsDraggingNode(false);
            setIsOverTrash(false);
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        // Editor references are visual aliases only. Their semantic scope is
        // the scope of the original state. Keep/snap the reference into that
        // same parent instead of forcing it to the top level. This is important
        // for references to states in later Parallel lanes and also matches the
        // way reference metadata is reconstructed on SCXML import.
        if (node.data?.isSkillClone || node.data?.isStateClone) {
            const referenceSourceId = String(
                node.data?.cloneOfNodeId || ""
            ).trim();
            setNodes((currentNodes) => {
                const liveNode = currentNodes.find(
                    (candidate) => candidate.id === node.id
                );
                const sourceNode = currentNodes.find(
                    (candidate) =>
                        candidate.id === liveNode?.data?.cloneOfNodeId
                );

                if (!liveNode) return currentNodes;

                const absolute = getAbsoluteNodePosition(
                    liveNode,
                    currentNodes
                );
                const sourceParent = sourceNode?.parentId
                    ? currentNodes.find(
                        (candidate) => candidate.id === sourceNode.parentId
                    )
                    : null;

                let nextNodes = currentNodes.map((candidate) => {
                    if (candidate.id !== liveNode.id) return candidate;

                    if (!sourceParent) {
                        return {
                            ...candidate,
                            parentId: undefined,
                            extent: undefined,
                            expandParent: undefined,
                            position: absolute,
                        };
                    }

                    const parentAbsolute = getAbsoluteNodePosition(
                        sourceParent,
                        currentNodes
                    );
                    return {
                        ...candidate,
                        parentId: sourceParent.id,
                        extent: "parent",
                        expandParent: true,
                        position: {
                            x: absolute.x - parentAbsolute.x,
                            y: absolute.y - parentAbsolute.y,
                        },
                    };
                });

                if (sourceParent?.type === "compound") {
                    nextNodes = fitCompoundAndAncestorCompounds(
                        nextNodes,
                        sourceParent.id
                    );
                } else if (
                    sourceParent?.type === "parallelLane" &&
                    sourceParent.parentId
                ) {
                    nextNodes = growParallelToLaneContents(
                        nextNodes,
                        sourceParent.parentId
                    );
                }

                return nextNodes;
            });

            if (referenceSourceId) {
                void syncStateEditorPositions?.(referenceSourceId);
            } else {
                void syncEditorStructureAfterCommit?.();
            }
            setDraggingNodeId(null);
            setIsDraggingNode(false);
            setIsOverTrash(false);
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        const dropPoint = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        setNodes((currentNodes) => {
            const draggedNode = currentNodes.find(
                (candidate) => candidate.id === node.id
            );

            if (!draggedNode) {
                return currentNodes;
            }

            const sourceCompound = getDirectCompoundForNode(
                draggedNode,
                currentNodes
            );

            const targetContainer = findDropContainerAtPoint(
                dropPoint,
                currentNodes,
                {
                    excludeNodeId: draggedNode.id,
                    allowParallelLanes: draggedNode.type !== "parallel",
                }
            );

            let targetCompound =
                targetContainer?.type === "compound"
                    ? targetContainer
                    : null;
            let targetLaneAtDrop =
                targetContainer?.type === "parallelLane"
                    ? targetContainer
                    : null;

            // A lane with several semantic states may own an editor-managed
            // Compound wrapper. The lane is the conceptual hit target, but its
            // wrapper is the actual semantic parent for inserted/moved states.
            if (targetLaneAtDrop) {
                const laneWrapper = currentNodes.find(
                    (candidate) =>
                        candidate.parentId === targetLaneAtDrop.id &&
                        isAutoParallelLaneCompound(candidate)
                );

                if (laneWrapper) {
                    targetCompound = laneWrapper;
                    targetLaneAtDrop = null;
                }
            }

            // The shared drop resolver already chooses the deepest real
            // user-facing container; automatic lane wrappers are mapped above.

            const resistedCompoundDrop = Boolean(
                !targetCompound &&
                !targetLaneAtDrop &&
                sourceCompound &&
                dragOriginContainer?.kind === "compound" &&
                dragOriginContainer.id === sourceCompound.id &&
                pointInsideBounds(
                    dropPoint,
                    dragOriginContainer,
                    CONTAINER_EXIT_RESISTANCE
                )
            );
            if (resistedCompoundDrop) {
                targetCompound = sourceCompound;
            }


            // ---------------------------------------------------------
            // Node befindet sich bereits im selben Compound
            // -> Position NICHT automatisch verändern
            // -> Node darf frei innerhalb des Compounds bewegt werden
            // ---------------------------------------------------------

            if (
                sourceCompound &&
                targetCompound &&
                sourceCompound.id === targetCompound.id
            ) {
                let retainedNodes = [...currentNodes];

                if (resistedCompoundDrop) {
                    const containerSize = getNodeSize(sourceCompound);
                    const draggedSize = getNodeSize(draggedNode);
                    const maxX = Math.max(
                        COMPOUND_PADDING_X,
                        containerSize.width -
                            getCompoundExitGutterWidth(sourceCompound.data?.events || []) -
                            COMPOUND_PADDING_X -
                            draggedSize.width
                    );
                    const maxY = Math.max(
                        COMPOUND_HEADER_HEIGHT,
                        containerSize.height -
                            COMPOUND_BOTTOM_PADDING -
                            draggedSize.height
                    );

                    retainedNodes = retainedNodes.map((candidate) =>
                        candidate.id === draggedNode.id
                            ? {
                                ...candidate,
                                position: {
                                    x: Math.min(
                                        maxX,
                                        Math.max(
                                            COMPOUND_PADDING_X,
                                            Number(candidate.position?.x || 0)
                                        )
                                    ),
                                    y: Math.min(
                                        maxY,
                                        Math.max(
                                            COMPOUND_HEADER_HEIGHT,
                                            Number(candidate.position?.y || 0)
                                        )
                                    ),
                                },
                                extent: "parent",
                                expandParent: true,
                            }
                            : candidate
                    );
                }

                // Moving a child within the same Compound must not change
                // the Compound dimensions. Resolve overlaps, but keep the
                // existing container size untouched.
                return resolveNodeCollisionsAndRefit(
                    retainedNodes,
                    draggedNode.id,
                    { refitContainers: false }
                );
            }

            if (
                (sourceCompound || targetCompound) &&
                (targetCompound || !targetLaneAtDrop)
            ) {
                const absolute = getAbsoluteNodePosition(
                    draggedNode,
                    currentNodes
                );

                // Zunächst aus aktuellem Parent lösen
                let next = currentNodes.map((c) =>
                    c.id === draggedNode.id
                        ? {
                            ...c,
                            parentId: undefined,
                            extent: undefined,
                            position: absolute,
                        }
                        : c
                );

                if (targetCompound) {
                    const compoundPosition =
                        getAbsoluteNodePosition(
                            targetCompound,
                            currentNodes
                        );

                    // Absolute Position der Node in eine
                    // relative Compound-Position umrechnen
                    const relativePosition = {
                        x: absolute.x - compoundPosition.x,
                        y: absolute.y - compoundPosition.y,
                    };

                    next = next.map((c) =>
                        c.id === draggedNode.id
                            ? {
                                ...c,
                                parentId: targetCompound.id,
                                extent: "parent",
                                expandParent: true,

                                // Drop-Position beibehalten
                                position: {
                                    x: Math.max(
                                        COMPOUND_PADDING_X,
                                        relativePosition.x
                                    ),
                                    y: Math.max(
                                        COMPOUND_HEADER_HEIGHT,
                                        relativePosition.y
                                    ),
                                },
                            }
                            : c
                    );
                }

                else {
                    next = next.map((c) =>
                        c.id === draggedNode.id
                            ? {
                                ...c,
                                position: {
                                    x: dropPoint.x,
                                    y: dropPoint.y,
                                },
                            }
                            : c
                    );
                }

                // Auto-fit both the old and new compound after reparenting.
                // This uses the real React Flow dimensions (width/height +
                // style) and therefore also works after manual NodeResizer use.
                // Fitting is propagated through nested compound ancestors.
                if (sourceCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        sourceCompound.id
                    );
                }

                if (targetCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        targetCompound.id
                    );
                }



                // Boundary helpers are a visual projection of the semantic
                // transition source/target plus the current containment tree.
                // Rebuild them once from the canonical logical-source metadata
                // instead of manually unwrapping/rewrapping Compound exits here.
                const collisionResolved = resolveNodeCollisionsAndRefit(
                    next,
                    draggedNode.id
                );
                const rebuilt = rebuildBoundaryTransitions(
                    collisionResolved,
                    edges
                );
                setEdges(rebuilt.edges);

                return rebuilt.nodes;
            }

            const sourceLane = getLaneForNode(
                draggedNode,
                currentNodes
            );

            let targetLane = targetLaneAtDrop;

            const resistedLaneDrop = Boolean(
                !targetLane &&
                sourceLane &&
                dragOriginContainer?.kind === "parallelLane" &&
                dragOriginContainer.id === sourceLane.id &&
                pointInsideBounds(
                    dropPoint,
                    dragOriginContainer,
                    CONTAINER_EXIT_RESISTANCE
                )
            );
            if (resistedLaneDrop) {
                targetLane = sourceLane;
            }

            // Die Node wurde lediglich innerhalb derselben Lane bewegt.
            // Keep its free position without resizing the lane/parallel.
            if (targetLane?.id === sourceLane?.id) {
                let next = currentNodes.map((candidate) =>
                    candidate.id === draggedNode.id
                        ? {
                            ...candidate,
                            extent: "parent",
                            expandParent: true,
                        }
                        : candidate
                );

                if (resistedLaneDrop && sourceLane) {
                    const laneAbsolute = getAbsoluteNodePosition(
                        sourceLane,
                        currentNodes
                    );
                    const laneWidth = Number(sourceLane.style?.width) || 420;
                    const laneHeight = Number(sourceLane.style?.height) || 110;
                    const draggedSize = getNodeSize(draggedNode);
                    const desiredAbsolute = getAbsoluteNodePosition(
                        draggedNode,
                        currentNodes
                    );
                    const padding = 16;
                    const clampedAbsolute = {
                        x: Math.min(
                            laneAbsolute.x + laneWidth - draggedSize.width - padding,
                            Math.max(laneAbsolute.x + padding, desiredAbsolute.x)
                        ),
                        y: Math.min(
                            laneAbsolute.y + laneHeight - draggedSize.height - padding,
                            Math.max(laneAbsolute.y + padding, desiredAbsolute.y)
                        ),
                    };
                    const immediateParent = currentNodes.find(
                        (candidate) => candidate.id === draggedNode.parentId
                    );
                    const parentAbsolute = immediateParent
                        ? getAbsoluteNodePosition(immediateParent, currentNodes)
                        : { x: 0, y: 0 };

                    next = next.map((candidate) =>
                        candidate.id === draggedNode.id
                            ? {
                                ...candidate,
                                position: {
                                    x: clampedAbsolute.x - parentAbsolute.x,
                                    y: clampedAbsolute.y - parentAbsolute.y,
                                },
                            }
                            : candidate
                    );
                }

                return resolveNodeCollisionsAndRefit(
                    next,
                    draggedNode.id,
                    { refitContainers: false }
                );
            }

            const sourceParallel = sourceLane
                ? currentNodes.find(
                    (candidate) =>
                        candidate.id === sourceLane.parentId
                )
                : null;

            const targetParallel = targetLane
                ? currentNodes.find(
                    (candidate) =>
                        candidate.id === targetLane.parentId
                )
                : null;

            const absolutePosition = getAbsoluteNodePosition(
                draggedNode,
                currentNodes
            );

            let nextNodes = currentNodes.filter(
                (candidate) => candidate.id !== draggedNode.id
            );

            const normalizeLane = (lane, nodeToArrangeId = null) => {
                if (!lane) return;

                const currentLane =
                    nextNodes.find((candidate) => candidate.id === lane.id) ||
                    lane;
                let members = nextNodes.filter(
                    (candidate) =>
                        candidate.parentId === currentLane.id &&
                        isParallelLaneSkillCandidate(candidate)
                );

                if (nodeToArrangeId) {
                    const newNode = members.find(
                        (member) => member.id === nodeToArrangeId
                    );

                    if (newNode) {
                        const existingMembers = members.filter(
                            (member) => member.id !== nodeToArrangeId
                        );
                        const newX =
                            25 + existingMembers.reduce((x, member) => {
                                const size = getOverviewLayoutNodeSize(member);
                                return x + size.width + PARALLEL_NODE_GAP;
                            }, 0);

                        nextNodes = nextNodes.map((candidate) =>
                            candidate.id === nodeToArrangeId
                                ? {
                                    ...candidate,
                                    parentId: currentLane.id,
                                    extent: "parent",
                                    expandParent: true,
                                    position: {
                                        x: newX,
                                        y: PARALLEL_LANE_CHILD_TOP_INSET,
                                    },
                                }
                                : candidate
                        );
                        members = nextNodes.filter(
                            (candidate) =>
                                candidate.parentId === currentLane.id &&
                                isParallelLaneSkillCandidate(candidate)
                        );
                    }
                }

                const storedInitialId = currentLane.data?.initialChildId;
                const initialMember =
                    members.find((member) => member.id === storedInitialId) ||
                    members.find((member) => member.data?.isInitial) ||
                    members[0] ||
                    null;
                const initialChildId = initialMember?.id || null;

                nextNodes = nextNodes.map((candidate) => {
                    if (candidate.id === currentLane.id) {
                        return {
                            ...candidate,
                            data: {
                                ...(candidate.data || {}),
                                initialChildId,
                            },
                        };
                    }

                    if (
                        candidate.parentId === currentLane.id &&
                        isParallelLaneSkillCandidate(candidate)
                    ) {
                        return {
                            ...candidate,
                            data: {
                                ...(candidate.data || {}),
                                isInitial: candidate.id === initialChildId,
                            },
                        };
                    }

                    return candidate;
                });

                const parallel = nextNodes.find(
                    (candidate) => candidate.id === currentLane.parentId
                );
                if (!parallel) return;

                nextNodes = growParallelToLaneContents(
                    nextNodes,
                    parallel.id
                );
            };

            if (targetLane) {
                const targetParent = targetLane;

                // Absolute Position des Parents bestimmen
                const parentAbsolutePosition =
                    getAbsoluteNodePosition(
                        targetParent,
                        nextNodes
                    );

                nextNodes.push({
                    ...draggedNode,

                    parentId: targetParent.id,
                    extent: "parent",
                    expandParent: true,

                    position: {
                        x:
                            absolutePosition.x -
                            parentAbsolutePosition.x,

                        y:
                            absolutePosition.y -
                            parentAbsolutePosition.y,
                    },

                    selected: false,
                });
            } else if (sourceLane) {
                // Node wurde aus einem Parallel State gezogen.
                const hasTransition = edges.some(
                    (edge) =>
                        !edge.id.startsWith("edge-internal-") &&
                        (
                            edge.source === draggedNode.id ||
                            edge.target === draggedNode.id ||
                            edge.data?.parallelOriginalSource ===
                            draggedNode.id ||
                            edge.data?.parallelOriginalTarget ===
                            draggedNode.id ||
                            edge.data?.boundaryOriginalTarget ===
                            draggedNode.id
                        )
                );

                nextNodes.push({
                    ...draggedNode,
                    parentId: undefined,
                    extent: undefined,
                    position: hasTransition
                        ? absolutePosition
                        : {
                            x: dropPoint.x,
                            y: dropPoint.y,
                        },
                    selected: false,
                    // Initial-state membership only has meaning inside the
                    // container that owns that state. A node leaving a
                    // Parallel lane may also have come from a Compound nested
                    // inside that lane, so clear the flag here in the final
                    // top-level drop path as well. Otherwise that nested case
                    // bypasses the Compound reparenting branch above and the
                    // node incorrectly remains initial at the root level.
                    data: {
                        ...(draggedNode.data || {}),
                        isInitial: false,
                    },
                });
            } else {
                nextNodes.push({
                    ...draggedNode,
                    extent: undefined,
                });
            }

            normalizeLane(sourceLane);

            // In der neuen Lane NUR die gerade gedroppte Node einordnen.
            if (
                targetLane &&
                targetLane.id !== sourceLane?.id
            ) {
                normalizeLane(
                    targetLane,
                    draggedNode.id
                );
            }

            let nextEdges = edges;

            if (sourceLane) {
                // Outgoing lane exits are reconstructed below from logical
                // boundary provenance. Only incoming transitions need an
                // explicit visual target restore when the state leaves the
                // Parallel; the generic boundary projector is source-side.
                nextEdges = nextEdges.map((edge) => {
                    const logicalTarget =
                        edge.data?.boundaryOriginalTarget ||
                        edge.data?.parallelOriginalTarget;
                    if (logicalTarget !== draggedNode.id) {
                        return edge;
                    }

                    const data = { ...(edge.data || {}) };
                    delete data.parallelOriginalTarget;
                    delete data.boundaryOriginalTarget;

                    return {
                        ...edge,
                        target: draggedNode.id,
                        targetHandle: null,
                        data,
                    };
                });
            }

            if (targetLane && targetParallel) {
                // Source-side Parallel exits are rebuilt generically below.
                // Incoming transitions still render against the Parallel
                // boundary, while retaining the logical target state.
                nextEdges = nextEdges.map((edge) => {
                    const targetsDraggedState =
                        edge.target === draggedNode.id ||
                        edge.data?.parallelOriginalTarget === draggedNode.id ||
                        edge.data?.boundaryOriginalTarget === draggedNode.id;
                    const logicalSourceId =
                        edge.data?.boundaryOriginalSource ||
                        edge.data?.compoundOriginalSource ||
                        edge.data?.parallelOriginalSource ||
                        edge.source;

                    if (!targetsDraggedState || logicalSourceId === draggedNode.id) {
                        return edge;
                    }

                    return {
                        ...edge,
                        target: targetParallel.id,
                        targetHandle: "target",
                        data: {
                            ...(edge.data || {}),
                            boundaryOriginalTarget: draggedNode.id,
                            parallelOriginalTarget: draggedNode.id,
                        },
                    };
                });
            }

            // React Flow benötigt Parent-Nodes vor ihren Children. Rebuild
            // boundary exit points after the final parent/position is known so
            // dragging into/out of Compound/Parallel updates the border edges
            // immediately and keeps the original skill.event semantics.
            const collisionResolved = resolveNodeCollisionsAndRefit(
                nextNodes,
                draggedNode.id
            );
            const rebuilt = rebuildBoundaryTransitions(
                collisionResolved,
                nextEdges
            );
            setEdges(rebuilt.edges);
            return rebuilt.nodes;
        });

        // Slot nodes live in a separate state array, but in Slot/Overview mode
        // they share the same React Flow canvas with root state nodes. Run one
        // final root-scope pass after React has committed the drag so a slot
        // cannot overlap a root skill (and vice versa). Nested states are still
        // handled only inside their own parent scope above.
        if (activeMode === "slots" || activeMode === "overview") {
            requestAnimationFrame(() => {
                const currentVisibleNodes = getNodes();
                const focusNode = currentVisibleNodes.find(
                    (candidate) => candidate.id === node.id
                );

                if (
                    !focusNode ||
                    focusNode.parentId ||
                    focusNode.type === "parallelLane"
                ) {
                    return;
                }

                const resolvedVisibleNodes = resolveCollisionScope(
                    currentVisibleNodes,
                    node.id,
                    NODE_COLLISION_OPTIONS
                );
                const positionsById = new Map(
                    resolvedVisibleNodes.map((candidate) => [
                        candidate.id,
                        candidate.position,
                    ])
                );

                setNodes((currentNodes) =>
                    currentNodes.map((candidate) => {
                        if (candidate.parentId) return candidate;
                        const position = positionsById.get(candidate.id);
                        return position
                            ? { ...candidate, position }
                            : candidate;
                    })
                );

                setSlotNodes((currentSlotNodes) =>
                    currentSlotNodes.map((candidate) => {
                        const position = positionsById.get(candidate.id);
                        return position
                            ? { ...candidate, position }
                            : candidate;
                    })
                );
            });
        }

        void syncStatePosition?.(node.id, dragOriginParentId);

        setDraggingNodeId(null);
        setIsDraggingNode(false);
        setIsOverTrash(false);
        setParallelDropTargetId(null);
        setCompoundDropTargetId(null);
    }, [
        activeMode,
        edges,
        getNodes,
        screenToFlowPosition,
        setNodes,
        setEdges,
        setSlotEdges,
        setSlotNodes,
        syncStatePosition,
        syncStateEditorPositions,
        syncRemovedStates,
        syncEditorStructureAfterCommit,
    ]);

    return {
        parallelDropTargetId,
        setParallelDropTargetId,
        compoundDropTargetId,
        setCompoundDropTargetId,
        isDraggingNode,
        draggingNodeId,
        isOverTrash,
        handleNodeDragStart,
        handleNodeDrag,
        handleNodeDragStop,
    };
}
