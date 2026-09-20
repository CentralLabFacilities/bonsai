import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCollisionScope } from "../utils/nodeCollisions";
import {
    COMPOUND_HEADER_HEIGHT,
    COMPOUND_PADDING_X,
    NODE_COLLISION_OPTIONS,
    PARALLEL_NODE_GAP,
    fitCompoundAndAncestorCompounds,
    fitCompoundToChildren,
    getAbsoluteNodePosition,
    getDirectCompoundForNode,
    getLaneForNode,
    getNodeNestingDepth,
    getNodeSize,
    growParallelToLaneContents,
    isAutoParallelLaneCompound,
    isNodeInsideContainer,
    isParallelLaneSkillCandidate,
    resolveNodeCollisionsAndRefit,
} from "../utils/editorGeometry";

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
}) {
    const [parallelDropTargetId, setParallelDropTargetId] = useState(null);
    const [compoundDropTargetId, setCompoundDropTargetId] = useState(null);
    const [isDraggingNode, setIsDraggingNode] = useState(false);
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
            } else if (node.type === "compound") {
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
                        ? { ...candidate, extent: undefined }
                        : candidate
                )
            );
        }
    }, [buildDragContainerIndex, getNodes, setNodes, setHoveredEditorEdgeId]);

    const processPendingNodeDrag = useCallback(() => {
        dragFrameRef.current = null;
        const pending = pendingNodeDragRef.current;
        if (!pending) return;

        const { clientX, clientY, nodeId, nodeType, isSkillClone } = pending;
        const isOverTrash = Boolean(
            document
                .elementFromPoint(clientX, clientY)
                ?.closest(".trash-bin-dropzone")
        );

        setIsOverTrash(isOverTrash);

        // Parallel-lane helper nodes are layout-only and editor-only skill
        // clones stay top-level, so neither participates in container drops.
        if (isOverTrash || nodeType === "parallelLane" || isSkillClone) {
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
        const hoveredCompound = dragContainerIndex.compounds.find(
            (entry) => canUseTarget(entry) && containsPointer(entry)
        );

        const hoveredLane =
            !hoveredCompound && nodeType !== "parallel"
                ? dragContainerIndex.lanes.find(
                      (entry) => canUseTarget(entry) && containsPointer(entry)
                  )
                : null;

        setCompoundDropTargetId(hoveredCompound?.id || null);
        setParallelDropTargetId(hoveredLane?.id || null);
    }, [screenToFlowPosition]);

    const handleNodeDrag = useCallback((event, draggedNode) => {
        pendingNodeDragRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
            nodeId: draggedNode.id,
            nodeType: draggedNode.type,
            isSkillClone: Boolean(draggedNode.data?.isSkillClone),
        };

        if (dragFrameRef.current === null) {
            dragFrameRef.current = requestAnimationFrame(processPendingNodeDrag);
        }
    }, [processPendingNodeDrag]);

    const handleNodeDragStop = useCallback((event, node) => {
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }
        pendingNodeDragRef.current = null;
        dragContainerIndexRef.current = { lanes: [], compounds: [] };

        const element = document.elementFromPoint(
            event.clientX,
            event.clientY
        );

        if (element?.closest(".trash-bin-dropzone")) {
            setNodes((currentNodes) => {
                const idsToDelete = new Set([node.id]);
                let foundNew = true;

                while (foundNew) {
                    foundNew = false;

                    currentNodes.forEach((candidate) => {
                        const isDescendant =
                            candidate.parentId &&
                            idsToDelete.has(candidate.parentId);
                        const isCloneOfDeletedSkill =
                            candidate.data?.isSkillClone &&
                            idsToDelete.has(candidate.data?.cloneOfNodeId);

                        if (
                            (isDescendant || isCloneOfDeletedSkill) &&
                            !idsToDelete.has(candidate.id)
                        ) {
                            idsToDelete.add(candidate.id);
                            foundNew = true;
                        }
                    });
                }

                setEdges((currentEdges) =>
                    currentEdges.filter(
                        (edge) =>
                            !idsToDelete.has(edge.source) &&
                            !idsToDelete.has(edge.target) &&
                            !idsToDelete.has(
                                edge.data?.compoundOriginalSource
                            ) &&
                            !idsToDelete.has(
                                edge.data?.compoundOriginalTarget
                            ) &&
                            !idsToDelete.has(
                                edge.data?.parallelOriginalSource
                            ) &&
                            !idsToDelete.has(
                                edge.data?.parallelOriginalTarget
                            )
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

                return currentNodes
                    .filter(
                        (candidate) =>
                            !idsToDelete.has(candidate.id)
                    )
                    .map((candidate) => {
                        if (candidate.type !== "compound") {
                            return candidate;
                        }

                        return {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: (
                                    candidate.data?.events || []
                                ).filter(
                                    (event) =>
                                        !idsToDelete.has(
                                            event.sourceNodeId
                                        )
                                ),
                            },
                        };
                    });
            });

            setIsDraggingNode(false);
            setIsOverTrash(false);
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        // Parallel-lane helper nodes themselves are not draggable between
        // containers. Compound and parallel states are intentionally allowed.
        if (node.type === "parallelLane") {
            setIsDraggingNode(false);
            setIsOverTrash(false);
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        // Skill clones are visual aliases only. Keep them top-level so their
        // saved absolute editor position has the same meaning after reload.
        if (node.data?.isSkillClone) {
            setNodes((currentNodes) => {
                const liveNode = currentNodes.find(
                    (candidate) => candidate.id === node.id
                );

                if (!liveNode?.parentId) return currentNodes;

                const absolute = getAbsoluteNodePosition(
                    liveNode,
                    currentNodes
                );

                return currentNodes.map((candidate) =>
                    candidate.id === liveNode.id
                        ? {
                            ...candidate,
                            parentId: undefined,
                            extent: undefined,
                            expandParent: undefined,
                            position: absolute,
                        }
                        : candidate
                );
            });

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

            const targetCompound = currentNodes
                .filter(
                    (c) =>
                        c.type === "compound" &&
                        c.id !== draggedNode.id &&
                        // Never allow a compound to become a child of one of
                        // its own descendants. Compound -> Compound itself is
                        // otherwise fully supported.
                        !isNodeInsideContainer(
                            c,
                            draggedNode.id,
                            currentNodes
                        )
                )
                .filter((compound) => {
                    const p = getAbsoluteNodePosition(
                        compound,
                        currentNodes
                    );

                    const z = getNodeSize(compound);

                    return (
                        dropPoint.x >= p.x &&
                        dropPoint.x <= p.x + z.width &&
                        dropPoint.y >= p.y &&
                        dropPoint.y <= p.y + z.height
                    );
                })
                .sort(
                    (a, b) =>
                        getNodeNestingDepth(b, currentNodes) -
                        getNodeNestingDepth(a, currentNodes)
                )[0] || null;


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
                // Keep the containing compound fitted to all immediate
                // children, including nested compounds, and propagate any
                // size change through outer compound ancestors.
                const next = fitCompoundAndAncestorCompounds(
                    [...currentNodes],
                    sourceCompound.id
                );

                return resolveNodeCollisionsAndRefit(next, draggedNode.id);
            }

            if (
                !getLaneForNode(draggedNode, currentNodes) &&
                (sourceCompound || targetCompound)
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



                /*
                 * Keep outgoing compound transitions consistent when a child
                 * state is moved into, out of, or between compounds.
                 *
                 * The persisted/logical transition remains the external edge.
                 * A separate display edge connects the real child state to the
                 * matching exit point on the compound boundary.
                 */
                let rewrittenEdges = [...edges];

                if (sourceCompound) {
                    const oldCompoundExitIds = new Set(
                        rewrittenEdges
                            .filter(
                                (edge) =>
                                    edge.data?.compoundOriginalSource ===
                                    draggedNode.id
                            )
                            .map(
                                (edge) =>
                                    edge.data?.compoundExitId ||
                                    edge.sourceHandle
                            )
                            .filter(Boolean)
                    );

                    // Remove the old child -> compound boundary helper edges.
                    rewrittenEdges = rewrittenEdges.filter(
                        (edge) =>
                            !(
                                edge.data?.compoundInternalEdge &&
                                edge.source === draggedNode.id &&
                                edge.target === sourceCompound.id
                            )
                    );

                    // Turn the external compound edges back into ordinary
                    // transitions from the actual child before potentially
                    // wrapping them for the new compound below.
                    rewrittenEdges = rewrittenEdges.map((edge) => {
                        if (
                            edge.data?.compoundOriginalSource !==
                            draggedNode.id
                        ) {
                            return edge;
                        }

                        const restoredHandle =
                            edge.data?.compoundOriginalSourceHandle ||
                            edge.sourceHandle ||
                            "success";

                        const restoredData = {
                            ...(edge.data || {}),
                        };

                        delete restoredData.compoundOriginalSource;
                        delete restoredData.compoundOriginalSourceHandle;
                        delete restoredData.compoundExitId;

                        return {
                            ...edge,
                            source: draggedNode.id,
                            sourceHandle: restoredHandle,
                            label: edge.label || restoredHandle,
                            data: restoredData,
                        };
                    });

                    // Remove exit points that belonged to this child from the
                    // old compound. Other child exits stay untouched.
                    next = next.map((candidate) => {
                        if (candidate.id !== sourceCompound.id) {
                            return candidate;
                        }

                        return {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: (
                                    candidate.data?.events || []
                                ).filter(
                                    (event) =>
                                        event.sourceNodeId !==
                                        draggedNode.id &&
                                        !oldCompoundExitIds.has(event.id)
                                ),
                            },
                        };
                    });
                }

                if (targetCompound) {
                    const targetMemberIds = new Set(
                        next
                            .filter(
                                (candidate) =>
                                    candidate.parentId ===
                                    targetCompound.id
                            )
                            .map((candidate) => candidate.id)
                    );

                    const baseName =
                        draggedNode.data?.label ||
                        draggedNode.data?.fullSkillName
                            ?.split("#")[0]
                            ?.split(".")
                            ?.pop() ||
                        "state";

                    const compoundEventsById = new Map(
                        (
                            next.find(
                                (candidate) =>
                                    candidate.id === targetCompound.id
                            )?.data?.events || []
                        ).map((event) => [
                            String(event.id),
                            event,
                        ])
                    );

                    const internalEdgesByExitId = new Map();

                    rewrittenEdges = rewrittenEdges.map((edge) => {
                        if (
                            edge.source !== draggedNode.id ||
                            edge.data?.compoundInternalEdge
                        ) {
                            return edge;
                        }

                        // A transition between two children of the same
                        // compound remains an ordinary internal transition.
                        if (
                            targetMemberIds.has(edge.target) ||
                            edge.target === targetCompound.id
                        ) {
                            return edge;
                        }

                        const originalHandleId = String(
                            edge.sourceHandle || "success"
                        );
                        const compoundExitId =
                            `${draggedNode.id}-${originalHandleId}`;
                        const exitLabel =
                            `${baseName}.${originalHandleId}`;

                        if (
                            !compoundEventsById.has(compoundExitId)
                        ) {
                            compoundEventsById.set(
                                compoundExitId,
                                {
                                    id: compoundExitId,
                                    name: exitLabel,
                                    rawEvent: exitLabel,
                                    target: edge.target,
                                    sourceNodeId: draggedNode.id,
                                    transitionHandleId:
                                    originalHandleId,
                                }
                            );
                        }

                        if (
                            !internalEdgesByExitId.has(
                                compoundExitId
                            )
                        ) {
                            internalEdgesByExitId.set(
                                compoundExitId,
                                {
                                    id:
                                        `edge-internal-compound-${draggedNode.id}-` +
                                        `${originalHandleId}-${targetCompound.id}-` +
                                        crypto.randomUUID(),
                                    source: draggedNode.id,
                                    target: targetCompound.id,
                                    sourceHandle:
                                    originalHandleId,
                                    targetHandle:
                                        `target-${compoundExitId}`,
                                    type: "smoothstep",
                                    selectable: false,
                                    focusable: false,
                                    style: {
                                        strokeDasharray: "4 4",
                                        stroke: "#0284c7",
                                        strokeWidth: 1.5,
                                    },
                                    data: {
                                        compoundInternalEdge: true,
                                        compoundExitId,
                                    },
                                }
                            );
                        }

                        return {
                            ...edge,
                            source: targetCompound.id,
                            sourceHandle: compoundExitId,
                            label:
                                edge.label ||
                                originalHandleId,
                            data: {
                                ...(edge.data || {}),
                                compoundOriginalSource:
                                draggedNode.id,
                                compoundOriginalSourceHandle:
                                originalHandleId,
                                compoundExitId,
                            },
                        };
                    });

                    rewrittenEdges.push(
                        ...internalEdgesByExitId.values()
                    );

                    const nextCompoundEvents = [
                        ...compoundEventsById.values(),
                    ].filter(
                        (event) =>
                            String(event?.id || "") !== "compound-entry"
                    );

                    next = next.map((candidate) =>
                        candidate.id === targetCompound.id
                            ? {
                                ...candidate,
                                data: {
                                    ...candidate.data,
                                    events: nextCompoundEvents,
                                },
                            }
                            : candidate
                    );
                }

                // Events can change the exit gutter width, so do one final
                // fit after the compound transition metadata has been updated.
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

                setEdges(rewrittenEdges);

                return resolveNodeCollisionsAndRefit(next, draggedNode.id);
            }

            const sourceLane = getLaneForNode(
                draggedNode,
                currentNodes
            );

            const targetLane = draggedNode.type !== "parallel"
                ? currentNodes
                    .filter(
                        (candidate) =>
                            candidate.type === "parallelLane" &&
                            !isNodeInsideContainer(
                                candidate,
                                draggedNode.id,
                                currentNodes
                            )
                    )
                    .find((lane) => {
                        const position = getAbsoluteNodePosition(
                            lane,
                            currentNodes
                        );

                        const width =
                            Number(lane.style?.width) || 420;
                        const height =
                            Number(lane.style?.height) || 110;

                        return (
                            dropPoint.x >= position.x &&
                            dropPoint.x <= position.x + width &&
                            dropPoint.y >= position.y &&
                            dropPoint.y <= position.y + height
                        );
                    })
                : null;

            // Die Node wurde lediglich innerhalb derselben Lane bewegt.
            // Keep its free position, but still allow the lane/parallel to
            // grow when the node reaches beyond the manually resized bounds.
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

                if (sourceCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        sourceCompound.id
                    );
                }

                if (sourceLane?.parentId) {
                    next = growParallelToLaneContents(
                        next,
                        sourceLane.parentId
                    );
                }

                return resolveNodeCollisionsAndRefit(next, draggedNode.id);
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

                let directChildren = nextNodes.filter(
                    (candidate) => candidate.parentId === currentLane.id
                );

                // A lane may already have the automatically managed compound
                // wrapper used when it contains multiple branch states.
                let wrapper = directChildren.find(
                    (candidate) => isAutoParallelLaneCompound(candidate)
                );

                const parentId = wrapper?.id || currentLane.id;

                let members = wrapper
                    ? nextNodes.filter(
                        (candidate) => candidate.parentId === wrapper.id
                    )
                    : directChildren.filter(isParallelLaneSkillCandidate);

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
                                const size = getNodeSize(member);
                                return x + size.width + PARALLEL_NODE_GAP;
                            }, 0);

                        nextNodes = nextNodes.map((candidate) => {
                            if (candidate.id !== nodeToArrangeId) {
                                return candidate;
                            }

                            return {
                                ...candidate,
                                parentId,
                                extent: "parent",
                                expandParent: true,
                                position: {
                                    x: newX,
                                    // When a lane has a compound wrapper, its
                                    // children must begin below the compound
                                    // header just like in a normal compound.
                                    y: wrapper
                                        ? COMPOUND_HEADER_HEIGHT
                                        : 20,
                                },
                            };
                        });
                    }
                }

                // If this lane owns an auto compound, fit that compound to its
                // children before calculating the lane/parallel dimensions.
                if (wrapper) {
                    nextNodes = fitCompoundToChildren(
                        nextNodes,
                        wrapper.id
                    );
                    wrapper = nextNodes.find(
                        (candidate) => candidate.id === wrapper.id
                    );
                }

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
                // Vorhandenen Compound der Lane suchen
                const wrapper = nextNodes.find(
                    (candidate) =>
                        candidate.parentId === targetLane.id &&
                        isAutoParallelLaneCompound(candidate)
                );


                const targetParent = wrapper || targetLane;

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
                const internalHandles = nextEdges
                    .filter(
                        (edge) =>
                            edge.source === draggedNode.id &&
                            edge.target === sourceLane.id &&
                            edge.id.startsWith("edge-internal-")
                    )
                    .map((edge) => edge.sourceHandle);

                // Interne Verbindungen zum alten Lane-Rand entfernen.
                nextEdges = nextEdges
                    .filter(
                        (edge) =>
                            !(
                                edge.source === draggedNode.id &&
                                edge.target === sourceLane.id &&
                                edge.id.startsWith(
                                    "edge-internal-"
                                )
                            )
                    )
                    .map((edge) => {
                        if (
                            edge.data?.parallelOriginalSource ===
                            draggedNode.id
                        ) {
                            return {
                                ...edge,
                                source: draggedNode.id,
                                data: {
                                    ...edge.data,
                                    parallelOriginalSource:
                                    undefined,
                                },
                            };
                        }

                        if (
                            edge.data?.parallelOriginalTarget ===
                            draggedNode.id
                        ) {
                            return {
                                ...edge,
                                target: draggedNode.id,
                                targetHandle: null,
                                data: {
                                    ...edge.data,
                                    parallelOriginalTarget:
                                    undefined,
                                },
                            };
                        }

                        return edge;
                    });

                const stillUsedHandles = new Set(
                    nextEdges
                        .filter(
                            (edge) =>
                                edge.target === sourceLane.id &&
                                edge.id.startsWith(
                                    "edge-internal-"
                                )
                        )
                        .map((edge) => edge.sourceHandle)
                );

                nextNodes = nextNodes.map((candidate) =>
                    candidate.id === sourceLane.id
                        ? {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: (
                                    candidate.data?.events || []
                                ).filter(
                                    (item) =>
                                        !internalHandles.includes(
                                            item.id
                                        ) ||
                                        stillUsedHandles.has(
                                            item.id
                                        )
                                ),
                            },
                        }
                        : candidate
                );
            }

            if (targetLane && targetParallel) {
                const outgoingIds = new Set(
                    nextEdges
                        .filter(
                            (edge) =>
                                edge.source === draggedNode.id &&
                                edge.target !== targetLane.id
                        )
                        .map((edge) => edge.id)
                );

                const incomingIds = new Set(
                    nextEdges
                        .filter(
                            (edge) =>
                                edge.target === draggedNode.id &&
                                edge.source !== draggedNode.id
                        )
                        .map((edge) => edge.id)
                );

                const internalEdges = [];
                const laneEvents = [
                    ...(targetLane.data?.events || []),
                ];

                nextEdges = nextEdges.map((edge) => {
                    if (outgoingIds.has(edge.id)) {
                        const handleId =
                            edge.sourceHandle || "success";

                        if (
                            !laneEvents.some(
                                (item) => item.id === handleId
                            )
                        ) {
                            const baseName =
                                draggedNode.data?.label ||
                                draggedNode.data
                                    ?.fullSkillName ||
                                "state";

                            laneEvents.push({
                                id: handleId,
                                name: `${baseName}.${handleId}`,
                                rawEvent: `${baseName}.${handleId}`,
                                target: edge.target,
                            });
                        }

                        internalEdges.push({
                            id:
                                `edge-internal-${draggedNode.id}-` +
                                `${handleId}-${targetLane.id}`,
                            source: draggedNode.id,
                            target: targetLane.id,
                            sourceHandle: handleId,
                            targetHandle: `target-${handleId}`,
                            style: {
                                strokeDasharray: "4 4",
                                stroke: "#0284c7",
                                strokeWidth: 1.5,
                            },
                            type: "smoothstep",
                        });

                        return {
                            ...edge,
                            source: targetLane.id,
                            data: {
                                ...edge.data,
                                parallelOriginalSource:
                                draggedNode.id,
                            },
                        };
                    }

                    if (incomingIds.has(edge.id)) {
                        return {
                            ...edge,
                            target: targetParallel.id,
                            targetHandle: "target",
                            data: {
                                ...edge.data,
                                parallelOriginalTarget:
                                draggedNode.id,
                            },
                        };
                    }

                    return edge;
                });

                nextEdges = [
                    ...nextEdges,
                    ...internalEdges,
                ];

                nextNodes = nextNodes.map((candidate) =>
                    candidate.id === targetLane.id
                        ? {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: laneEvents,
                            },
                        }
                        : candidate
                );
            }

            setEdges(nextEdges);

            // React Flow benötigt Parent-Nodes vor ihren Children.
            return resolveNodeCollisionsAndRefit(nextNodes, draggedNode.id);
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
    ]);

    return {
        parallelDropTargetId,
        setParallelDropTargetId,
        compoundDropTargetId,
        setCompoundDropTargetId,
        isDraggingNode,
        isOverTrash,
        handleNodeDragStart,
        handleNodeDrag,
        handleNodeDragStop,
    };
}
