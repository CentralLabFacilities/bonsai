import { useCallback, useRef } from "react";
import { applyEdgeChanges } from "@xyflow/react";

import { rebuildBoundaryTransitionsIncremental } from "../utils/boundaryTransitions";
import { isWildcardTransitionEvent } from "../utils/transitionEvents";
import {
    PARALLEL_BOTTOM_PADDING,
    PARALLEL_HEADER_HEIGHT,
} from "../utils/editorGeometry";

/**
 * Owns the React Flow change pipeline that bridges visual graph changes back
 * into the semantic editor model. This keeps deletion/remapping bookkeeping
 * out of App while preserving the existing Rust synchronization boundaries.
 */
export function useEditorFlowChanges({
    nodeById,
    slotNodeIdSet,
    onNodesChange,
    onSlotNodesChange,
    onEdgesChange,
    onSlotEdgesChange,
    nodes,
    edges,
    slotNodes,
    slotEdges,
    setNodes,
    setEdges,
    setSlotEdges,
    updateNodeInternals,
    syncRemovedStates,
    syncTransitionSources,
}) {
    // When a visual slot clone is deleted, its connected semantic slot edges
    // are retargeted to the canonical slot instead of disconnecting the skill.
    // React Flow may still emit a remove for the old edge afterwards; remember
    // those edge IDs so the follow-up removal can be ignored once.
    const remappedSlotCloneEdgeIdsRef = useRef(new Set());

    const handleNodesChange = useCallback(
        (changes) => {
            const graphChanges = [];
            const slotChanges = [];

            changes.forEach((change) => {
                if (nodeById.has(change.id)) {
                    graphChanges.push(change);
                } else if (slotNodeIdSet.has(change.id)) {
                    slotChanges.push(change);
                }
            });

            if (graphChanges.length > 0) {
                const removedNodeIds = new Set(
                    graphChanges
                        .filter((change) => change.type === "remove")
                        .map((change) => change.id)
                );

                // A Parallel must retain at least one lane. Context-menu
                // deletion already disables the final lane, but keyboard
                // multi-delete can otherwise remove every lane in one batch.
                const laneIdsByParallel = new Map();
                nodes.forEach((node) => {
                    if (node.type !== "parallelLane" || !node.parentId) return;
                    if (!laneIdsByParallel.has(node.parentId)) {
                        laneIdsByParallel.set(node.parentId, []);
                    }
                    laneIdsByParallel.get(node.parentId).push(node.id);
                });
                laneIdsByParallel.forEach((laneIds) => {
                    const requestedLaneRemovals = laneIds.filter((laneId) =>
                        removedNodeIds.has(laneId)
                    );
                    if (
                        laneIds.length > 0 &&
                        requestedLaneRemovals.length === laneIds.length
                    ) {
                        removedNodeIds.delete(laneIds[laneIds.length - 1]);
                    }
                });

                // React Flow can emit only the removed parent for structural
                // helpers. Expand the local removal too, not only the Rust
                // command, so deleting a Parallel lane cannot leave invisible
                // orphan children behind.
                let expandedLocalRemoval = true;
                while (expandedLocalRemoval) {
                    expandedLocalRemoval = false;
                    nodes.forEach((node) => {
                        if (removedNodeIds.has(node.id)) return;
                        if (node.parentId && removedNodeIds.has(node.parentId)) {
                            removedNodeIds.add(node.id);
                            expandedLocalRemoval = true;
                        }
                    });
                }

                const nonRemovalChanges = graphChanges.filter(
                    (change) => change.type !== "remove"
                );
                const effectiveGraphChanges = [
                    ...nonRemovalChanges,
                    ...[...removedNodeIds].map((id) => ({ id, type: "remove" })),
                ];

                const affectedParallelIds = new Set(
                    nodes
                        .filter(
                            (node) =>
                                removedNodeIds.has(node.id) &&
                                node.type === "parallelLane" &&
                                node.parentId
                        )
                        .map((node) => node.parentId)
                );

                onNodesChange(effectiveGraphChanges);

                if (removedNodeIds.size > 0) {
                    // Boundary transitions are drawn from a Compound/Parallel
                    // border, so React Flow does not see them as connected to
                    // the real source skill. Remove them explicitly by their
                    // semantic source/target metadata when that skill is
                    // deleted.
                    setEdges((currentEdges) =>
                        currentEdges.filter((edge) => {
                            const semanticSource =
                                edge.data?.boundaryOriginalSource ||
                                edge.data?.compoundOriginalSource ||
                                edge.data?.parallelOriginalSource ||
                                edge.source;
                            const semanticTarget =
                                edge.data?.boundaryOriginalTarget ||
                                edge.data?.compoundOriginalTarget ||
                                edge.data?.parallelOriginalTarget ||
                                edge.target;

                            return (
                                !removedNodeIds.has(edge.source) &&
                                !removedNodeIds.has(edge.target) &&
                                !removedNodeIds.has(semanticSource) &&
                                !removedNodeIds.has(semanticTarget)
                            );
                        })
                    );

                    // Remove the editor-only border handle belonging to a
                    // deleted source skill as well. Otherwise the Compound or
                    // Parallel could keep showing a stale skill.event point.
                    setNodes((currentNodes) =>
                        currentNodes.map((node) => {
                            if (
                                node.type !== "compound" &&
                                node.type !== "parallelLane"
                            ) {
                                return node;
                            }

                            const currentEvents = node.data?.events || [];
                            const nextEvents = currentEvents.filter(
                                (event) =>
                                    !removedNodeIds.has(event?.sourceNodeId)
                            );

                            if (nextEvents.length === currentEvents.length) {
                                return node;
                            }

                            return {
                                ...node,
                                data: {
                                    ...(node.data || {}),
                                    events: nextEvents,
                                },
                            };
                        })
                    );

                    if (affectedParallelIds.size > 0) {
                        setNodes((currentNodes) => {
                            let nextNodes = currentNodes;

                            affectedParallelIds.forEach((parallelId) => {
                                const parallel = nextNodes.find(
                                    (node) => node.id === parallelId
                                );
                                if (!parallel) return;

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
                                if (lanes.length === 0) return;

                                let nextY = PARALLEL_HEADER_HEIGHT;
                                const laneUpdates = new Map();
                                lanes.forEach((lane, index) => {
                                    const laneHeight = Math.max(
                                        90,
                                        Number(lane.style?.height) || 140
                                    );
                                    laneUpdates.set(lane.id, {
                                        y: nextY,
                                        height: laneHeight,
                                        borderBottom:
                                            index < lanes.length - 1
                                                ? "1.5px solid #0284c7"
                                                : "none",
                                    });
                                    nextY += laneHeight;
                                });

                                const parallelHeight =
                                    nextY + PARALLEL_BOTTOM_PADDING;
                                const laneNames = lanes.map(
                                    (lane, index) =>
                                        lane.data?.label || `Lane_${index + 1}`
                                );

                                nextNodes = nextNodes.map((node) => {
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
                                                width:
                                                    Number(parallel.style?.width) ||
                                                    Number(node.style?.width) ||
                                                    420,
                                                height: laneUpdate.height,
                                                borderBottom:
                                                    laneUpdate.borderBottom,
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
                            });

                            return nextNodes;
                        });
                    }

                    // React Flow may report only a removed parent while its
                    // descendants disappear with it. Expand the semantic
                    // removal set here so Rust also sees the full subtree and
                    // so slot/reference fallbacks inspect every removed state.
                    const semanticRemovalIds = new Set(removedNodeIds);

                    const removedNodes = nodes.filter((node) =>
                        semanticRemovalIds.has(node.id)
                    );
                    const removedReferenceNodes = removedNodes.filter(
                        (node) =>
                            node.data?.isSkillClone || node.data?.isStateClone
                    );
                    const referenceStateIds = removedReferenceNodes.map(
                        (node) => node.id
                    );
                    const referenceSourceIds = Array.from(
                        new Set(
                            removedReferenceNodes
                                .map((node) => node.data?.cloneOfNodeId)
                                .filter(
                                    (sourceId) =>
                                        sourceId &&
                                        !semanticRemovalIds.has(sourceId)
                                )
                        )
                    );
                    const removedSemanticNodes = removedNodes.filter(
                        (node) =>
                            !node.data?.isSkillClone &&
                            !node.data?.isStateClone
                    );
                    const refreshSlots = removedSemanticNodes.some(
                        (node) =>
                            (node.data?.inSlots || []).some((slot) => slot?.path) ||
                            (node.data?.outSlots || []).some((slot) => slot?.path)
                    );
                    void syncRemovedStates(
                        [...semanticRemovalIds],
                        {
                            refreshSlots,
                            referenceStateIds,
                            referenceSourceIds,
                        }
                    );
                }
            }
            if (slotChanges.length > 0) {
                const removedSlotCloneIds = new Map();
                slotChanges
                    .filter((change) => change.type === "remove")
                    .forEach((change) => {
                        const removedNode = slotNodes.find(
                            (node) => node.id === change.id
                        );
                        if (
                            removedNode?.data?.isSlotClone &&
                            removedNode.data?.cloneOfNodeId
                        ) {
                            removedSlotCloneIds.set(
                                removedNode.id,
                                removedNode.data.cloneOfNodeId
                            );
                        }
                    });

                if (removedSlotCloneIds.size > 0) {
                    setSlotEdges((currentEdges) =>
                        currentEdges.map((edge) => {
                            const canonicalSlotNodeId =
                                removedSlotCloneIds.get(edge.target);
                            if (!canonicalSlotNodeId) return edge;

                            remappedSlotCloneEdgeIdsRef.current.add(edge.id);

                            return {
                                ...edge,
                                id: `${edge.id}-clone-remap-${crypto.randomUUID()}`,
                                target: canonicalSlotNodeId,
                                data: {
                                    ...(edge.data || {}),
                                    slotNodeId: canonicalSlotNodeId,
                                    canonicalSlotNodeId,
                                    controlPoints: [],
                                },
                            };
                        })
                    );
                }

                onSlotNodesChange(slotChanges);
            }
        },
        [
            nodeById,
            slotNodeIdSet,
            onNodesChange,
            onSlotNodesChange,
            setEdges,
            setNodes,
            nodes,
            slotNodes,
            setSlotEdges,
            syncRemovedStates,
        ]
    );

    const handleVisibleEdgesChange = useCallback(
        (changes) => {
            const ignoredRemapIds = remappedSlotCloneEdgeIdsRef.current;
            const effectiveChanges = changes.filter((change) => {
                const shouldIgnore =
                    change.type === "remove" && ignoredRemapIds.has(change.id);
                if (shouldIgnore) {
                    ignoredRemapIds.delete(change.id);
                }
                return !shouldIgnore;
            });

            const slotEdgeIds = new Set(
                (slotEdges || []).map((edge) => edge.id)
            );

            const slotChanges = effectiveChanges.filter((change) =>
                slotEdgeIds.has(change.id)
            );
            const transitionChanges = effectiveChanges.filter(
                (change) => !slotEdgeIds.has(change.id)
            );

            if (transitionChanges.length > 0) {
                const removesTransition = transitionChanges.some(
                    (change) => change.type === "remove"
                );

                if (removesTransition) {
                    // Removing the visible external part of a boundary
                    // transition must also remove its editor-only helper edge
                    // and Compound/Parallel border event. Otherwise stale
                    // exits such as Skill.* remain visible even though no
                    // semantic transition exists anymore.
                    const changedEdges = applyEdgeChanges(
                        transitionChanges,
                        edges
                    );
                    const affectedTransitionSourceIds = new Set();

                    const getLogicalSourceEntries = (edge) => {
                        const storedEntries = Array.isArray(
                            edge?.data?.boundaryOriginalSources
                        )
                            ? edge.data.boundaryOriginalSources
                                  .map((entry) => ({
                                      sourceId: String(entry?.sourceId || ""),
                                      sourceHandle: String(
                                          entry?.sourceHandle || ""
                                      ),
                                  }))
                                  .filter(
                                      (entry) =>
                                          entry.sourceId && entry.sourceHandle
                                  )
                            : [];
                        if (storedEntries.length > 0) return storedEntries;

                        return [
                            {
                                sourceId:
                                    edge?.data?.boundaryOriginalSource ||
                                    edge?.data?.compoundOriginalSource ||
                                    edge?.data?.parallelOriginalSource ||
                                    edge?.source ||
                                    "",
                                sourceHandle: String(
                                    edge?.data?.boundaryOriginalSourceHandle ||
                                    edge?.data?.compoundOriginalSourceHandle ||
                                    edge?.data?.parallelOriginalSourceHandle ||
                                    edge?.sourceHandle ||
                                    edge?.label ||
                                    "success"
                                ),
                            },
                        ];
                    };

                    const isSemanticTransitionEdge = (edge) =>
                        !edge?.data?.boundaryInternalEdge &&
                        !edge?.data?.compoundInternalEdge &&
                        !edge?.data?.parallelInternalEdge &&
                        !String(edge?.id || "").startsWith(
                            "edge-internal-boundary-"
                        );

                    const removedTransientEventsByNode = new Map();
                    transitionChanges
                        .filter((change) => change.type === "remove")
                        .forEach((change) => {
                            const removedEdge = edges.find(
                                (edge) => edge.id === change.id
                            );
                            if (!removedEdge) return;

                            getLogicalSourceEntries(removedEdge).forEach(
                                ({ sourceId, sourceHandle }) => {
                                    if (!sourceId || !sourceHandle) return;
                                    affectedTransitionSourceIds.add(sourceId);

                                    const sourceNode = nodes.find(
                                        (node) => node.id === sourceId
                                    );
                                    const matchingEvents = (
                                        sourceNode?.data?.events || []
                                    ).filter(
                                        (event) =>
                                            String(event?.id || "") ===
                                            sourceHandle
                                    );
                                    const isImportedOnlyHandle =
                                        matchingEvents.length > 0 &&
                                        matchingEvents.every(
                                            (event) =>
                                                event?.editorImportedSynthetic ||
                                                event?.editorBoundarySynthetic
                                        );

                                    if (sourceHandle === "*") return;

                                    if (
                                        !isWildcardTransitionEvent(sourceHandle) &&
                                        !isImportedOnlyHandle
                                    ) {
                                        return;
                                    }

                                    const stillUsed = changedEdges.some(
                                        (edge) =>
                                            isSemanticTransitionEdge(edge) &&
                                            getLogicalSourceEntries(edge).some(
                                                (entry) =>
                                                    entry.sourceId === sourceId &&
                                                    entry.sourceHandle ===
                                                        sourceHandle
                                            )
                                    );
                                    if (stillUsed) return;

                                    if (
                                        !removedTransientEventsByNode.has(
                                            sourceId
                                        )
                                    ) {
                                        removedTransientEventsByNode.set(
                                            sourceId,
                                            new Set()
                                        );
                                    }
                                    removedTransientEventsByNode
                                        .get(sourceId)
                                        .add(sourceHandle);
                                }
                            );
                        });

                    const cleanedNodes =
                        removedTransientEventsByNode.size === 0
                            ? nodes
                            : nodes.map((node) => {
                                const removedHandles =
                                    removedTransientEventsByNode.get(node.id);
                                if (!removedHandles) return node;
                                return {
                                    ...node,
                                    data: {
                                        ...node.data,
                                        events: (node.data?.events || []).filter(
                                            (event) =>
                                                !removedHandles.has(
                                                    String(event?.id || "")
                                                )
                                        ),
                                    },
                                };
                            });

                    const normalized = rebuildBoundaryTransitionsIncremental(
                        cleanedNodes,
                        changedEdges,
                        {
                            previousEdges: edges,
                            changedEdgeIds: transitionChanges
                                .filter((change) => change.type === "remove")
                                .map((change) => change.id),
                        }
                    );

                    setNodes(normalized.nodes);
                    setEdges(normalized.edges);
                    (normalized.affectedNodeIds || []).forEach((nodeId) => {
                        requestAnimationFrame(() =>
                            updateNodeInternals(nodeId)
                        );
                    });
                    void syncTransitionSources(
                        [...affectedTransitionSourceIds]
                    );
                } else {
                    onEdgesChange(transitionChanges);
                }
            }

            if (slotChanges.length === 0) {
                return;
            }

            const removedIds = new Set(
                slotChanges
                    .filter((change) => change.type === "remove")
                    .map((change) => change.id)
            );

            if (removedIds.size > 0) {
                const removedEdges = (slotEdges || []).filter((edge) =>
                    removedIds.has(edge.id)
                );

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        let nextNode = node;

                        removedEdges.forEach((edge) => {
                            const access = edge.data?.access;
                            const slotIndex = Number(edge.data?.slotIndex);

                            if (
                                access === "read" &&
                                (edge.data?.skillNodeId || edge.source) === node.id &&
                                Number.isInteger(slotIndex) &&
                                node.data?.inSlots?.[slotIndex]
                            ) {
                                nextNode = {
                                    ...nextNode,
                                    data: {
                                        ...nextNode.data,
                                        inSlots: nextNode.data.inSlots.map(
                                            (slot, index) =>
                                                index === slotIndex
                                                    ? { ...slot, path: "", inherited: null }
                                                    : slot
                                        ),
                                    },
                                };
                            }

                            if (
                                access === "write" &&
                                (edge.data?.skillNodeId || edge.source) === node.id &&
                                Number.isInteger(slotIndex) &&
                                node.data?.outSlots?.[slotIndex]
                            ) {
                                nextNode = {
                                    ...nextNode,
                                    data: {
                                        ...nextNode.data,
                                        outSlots: nextNode.data.outSlots.map(
                                            (slot, index) =>
                                                index === slotIndex
                                                    ? { ...slot, path: "", inherited: null }
                                                    : slot
                                        ),
                                    },
                                };
                            }
                        });

                        return nextNode;
                    })
                );
            }

            onSlotEdgesChange(slotChanges);
        },
        [
            slotEdges,
            edges,
            nodes,
            onEdgesChange,
            onSlotEdgesChange,
            setNodes,
            setEdges,
            updateNodeInternals,
            syncTransitionSources,
        ]
    );


    return {
        handleNodesChange,
        handleVisibleEdgesChange,
    };
}
