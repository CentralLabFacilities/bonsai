import { useCallback } from "react";
import { clearTransientTransitionHighlight } from "../../utils/editorGraph";
import { getSkillPackageName } from "../../utils/editorScxml";
import { rebuildBoundaryTransitionsIncremental } from "../../utils/boundaryTransitions";
import {
    buildSemanticTransitionEdge,
    canTargetVisualNode,
    getLogicalEdgeSourceHandle,
    getLogicalEdgeSourceId,
} from "../../utils/transitionSemantics";

/**
 * Document-level transition mutations and edge selection.
 *
 * React Flow connection/reconnection gestures remain in useTransitionGraph;
 * this hook owns the resulting persistent editor mutations that are also used
 * by panels, keyboard actions, and problem navigation.
 */
export function useEditorTransitionActions({
    nodes,
    edges,
    selectedNodeId,
    setNodes,
    setEdges,
    setSlotNodes,
    setSlotEdges,
    setSelectedNodeId,
    updateNodeInternals,
    syncTransitionsForSource,
    setControlPointInsertRequest,
}) {
    const clearTransitionSelection = useCallback(() => {
        setEdges((currentEdges) =>
            currentEdges.map((edge) => ({
                ...clearTransientTransitionHighlight(edge),
                selected: false,
            }))
        );
    }, [setEdges]);

    const clearSlotEdgeSelection = useCallback(() => {
        setSlotEdges((currentEdges) =>
            currentEdges.map((edge) => ({
                ...edge,
                selected: false,
            }))
        );
    }, [setSlotEdges]);

    const clearAllEdgeSelection = useCallback(() => {
        clearTransitionSelection();
        clearSlotEdgeSelection();
    }, [clearTransitionSelection, clearSlotEdgeSelection]);

    const selectTransitionEdge = useCallback(
        (edgeId, additive = false) => {
            // Node and transition selection are mutually exclusive. Otherwise
            // the selected skill's transient edge highlighting would remain in
            // addition to the explicitly selected transition.
            setSelectedNodeId(null);
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

            clearSlotEdgeSelection();
            setEdges((currentEdges) =>
                currentEdges.map((edge) => {
                    const normalized = clearTransientTransitionHighlight(edge);

                    if (!additive) {
                        return {
                            ...normalized,
                            selected: edge.id === edgeId,
                        };
                    }

                    if (edge.id !== edgeId) return normalized;

                    return {
                        ...normalized,
                        selected: !edge.selected,
                    };
                })
            );
        },
        [
            setSelectedNodeId,
            setNodes,
            setSlotNodes,
            clearSlotEdgeSelection,
            setEdges,
        ]
    );

    const selectSlotEdge = useCallback(
        (edgeId) => {
            clearTransitionSelection();
            setSlotEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...edge,
                    selected: edge.id === edgeId,
                }))
            );
        },
        [setSlotEdges, clearTransitionSelection]
    );


    const updateEdgeControlPoints = useCallback(
        (edgeId, controlPoints, edgeKind = "transition") => {
            if (!edgeId) return false;

            const setter = edgeKind === "slot" ? setSlotEdges : setEdges;
            setter((currentEdges) =>
                currentEdges.map((edge) =>
                    edge.id === edgeId
                        ? {
                              ...edge,
                              data: {
                                  ...(edge.data || {}),
                                  controlPoints,
                              },
                          }
                        : edge
                )
            );

            setControlPointInsertRequest?.((current) =>
                current?.edgeId === edgeId ? null : current
            );
            return true;
        },
        [setEdges, setSlotEdges, setControlPointInsertRequest]
    );

    const updateNodeEvent = useCallback(
        (nodeId, eventId, changes) => {
            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.id === nodeId
                        ? {
                              ...node,
                              data: {
                                  ...node.data,
                                  events: (node.data?.events || []).map(
                                      (event) =>
                                          event.id === eventId
                                              ? { ...event, ...changes }
                                              : event
                                  ),
                              },
                          }
                        : node
                )
            );
        },
        [setNodes]
    );

    const setExistingTargetForEvent = useCallback(
        (event, targetNodeId) => {
            const selectedNode = nodes.find(
                (node) => node.id === selectedNodeId
            );
            if (
                !selectedNode ||
                selectedNode.type === "slot" ||
                !targetNodeId
            ) {
                return false;
            }

            const targetNode = nodes.find((node) => node.id === targetNodeId);
            if (
                !targetNode ||
                !canTargetVisualNode(selectedNode, targetNode, nodes)
            ) {
                return false;
            }

            const withoutPreviousTarget = edges.filter((edge) => {
                if (edge.data?.boundaryInternalEdge) return true;
                const sameSource =
                    getLogicalEdgeSourceId(edge) === selectedNode.id;
                const sameEvent =
                    String(getLogicalEdgeSourceHandle(edge)) ===
                    String(event.id);
                if (!sameSource || !sameEvent) return true;
                if (!event.target) return true;
                return edge.target !== event.target;
            });

            const alreadyExists = withoutPreviousTarget.some(
                (edge) =>
                    !edge.data?.boundaryInternalEdge &&
                    getLogicalEdgeSourceId(edge) === selectedNode.id &&
                    String(getLogicalEdgeSourceHandle(edge)) ===
                        String(event.id) &&
                    edge.target === targetNodeId
            );

            const nextEdges = alreadyExists
                ? withoutPreviousTarget
                : [
                      ...withoutPreviousTarget,
                      buildSemanticTransitionEdge({
                          sourceNode: selectedNode,
                          eventId: event.id,
                          targetNode,
                      }),
                  ];

            const nextNodes = nodes.map((node) => {
                if (node.id !== selectedNode.id) return node;
                return {
                    ...node,
                    data: {
                        ...node.data,
                        events: (node.data?.events || []).map((candidate) =>
                            candidate.id === event.id
                                ? {
                                      ...candidate,
                                      selectedPackage: getSkillPackageName(
                                          targetNode.data?.fullSkillName
                                      ),
                                      selectedSkill:
                                          targetNode.data?.fullSkillName?.split(
                                              "#"
                                          )[0] ||
                                          targetNode.data?.label ||
                                          "",
                                      target: targetNodeId,
                                  }
                                : candidate
                        ),
                    },
                };
            });

            const normalized = rebuildBoundaryTransitionsIncremental(
                nextNodes,
                nextEdges,
                {
                    previousEdges: edges,
                    sourceKeys: [
                        {
                            sourceId: selectedNode.id,
                            sourceHandle: event.id,
                        },
                    ],
                }
            );
            setNodes(normalized.nodes);
            setEdges(normalized.edges);
            (normalized.affectedNodeIds || []).forEach((nodeId) => {
                requestAnimationFrame(() => updateNodeInternals(nodeId));
            });
            void syncTransitionsForSource?.(selectedNode.id);
            return true;
        },
        [
            nodes,
            edges,
            selectedNodeId,
            setNodes,
            setEdges,
            updateNodeInternals,
            syncTransitionsForSource,
        ]
    );


    const moveContainerTransition = useCallback(
        (containerNodeId, outgoingTransitions, edgeId, direction) => {
            if (!containerNodeId || !edgeId) return false;

            const orderedIds = (outgoingTransitions || [])
                .map((transition) => transition.edgeId)
                .filter(Boolean);
            const currentIndex = orderedIds.indexOf(edgeId);
            if (currentIndex < 0) return false;

            const delta =
                direction === "up" ? -1 : direction === "down" ? 1 : 0;
            const nextIndex = currentIndex + delta;
            if (
                delta === 0 ||
                nextIndex < 0 ||
                nextIndex >= orderedIds.length
            ) {
                return false;
            }

            const nextOrder = [...orderedIds];
            [nextOrder[currentIndex], nextOrder[nextIndex]] = [
                nextOrder[nextIndex],
                nextOrder[currentIndex],
            ];

            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.id === containerNodeId
                        ? {
                              ...node,
                              data: {
                                  ...(node.data || {}),
                                  containerTransitionOrder: nextOrder,
                              },
                          }
                        : node
                )
            );

            // Keep live edge order aligned with the explicit container order.
            // The SCXML exporter uses the same order for container transitions.
            setEdges((currentEdges) => {
                const byId = new Map(
                    currentEdges.map((edge) => [edge.id, edge])
                );
                const orderedEdges = nextOrder
                    .map((id) => byId.get(id))
                    .filter(Boolean);
                const orderedSet = new Set(nextOrder);
                let orderedIndex = 0;

                return currentEdges.map((edge) => {
                    if (!orderedSet.has(edge.id)) return edge;
                    const replacement = orderedEdges[orderedIndex];
                    orderedIndex += 1;
                    return replacement || edge;
                });
            });

            // Container transitions have SCXML ownership/hoisting semantics,
            // so the Rust bridge deliberately promotes this to a full semantic
            // resync rather than issuing an unsafe state-local command.
            void syncTransitionsForSource?.(containerNodeId);
            return true;
        },
        [setNodes, setEdges, syncTransitionsForSource]
    );

    return {
        clearTransitionSelection,
        clearSlotEdgeSelection,
        clearAllEdgeSelection,
        selectTransitionEdge,
        selectSlotEdge,
        updateNodeEvent,
        setExistingTargetForEvent,
        moveContainerTransition,
        updateEdgeControlPoints,
    };
}
