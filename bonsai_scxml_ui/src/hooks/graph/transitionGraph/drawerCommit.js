import { MarkerType } from "@xyflow/react";
import { clearTransientTransitionHighlight } from "../../../utils/editorGraph";
import {
    getTransitionTargetHandleForNode,
    isNodeInsideContainer,
} from "../../../utils/editorGeometry";
import { getSkillPackageName } from "../../../utils/editorScxml";
import {
    canTargetVisualNode,
    getLogicalEdgeSourceHandle,
    getLogicalEdgeSourceId,
    makeSelfLoopControlPoints,
} from "../../../utils/transitionSemantics";
import { rebuildBoundaryTransitionsIncremental } from "../../../utils/boundaryTransitions";
import { isWildcardTransitionEvent } from "../../../utils/transitionEvents";

export const createTransitionDrawerCommitHandler = ({
    drawerData,
    edges,
    nodes,
    setGlobalDataModel,
    setNodes,
    setEdges,
    updateNodeInternals,
    syncTransitionsForSource,
    setDrawerData,
}) => ({ updatedTransitions, newGlobalVars = [], newGlobalVar = null }) => {
    if (drawerData.targetOnlyMode) {
        if (!Array.isArray(updatedTransitions)) return;

        const updateByEdgeId = new Map(
            updatedTransitions
                .filter((transition) => transition?.edgeId)
                .map((transition) => [
                    String(transition.edgeId),
                    transition,
                ])
        );
        const affectedSourceIds = new Set();
        const acceptedUpdates = new Map();

        const semanticEdges = edges.map((edge) => {
            const transition = updateByEdgeId.get(String(edge.id));
            if (!transition) return edge;

            const logicalSourceId =
                transition.sourceNodeId ||
                getLogicalEdgeSourceId(edge);
            const logicalSourceNode = nodes.find(
                (node) => node.id === logicalSourceId
            );
            const targetNode = nodes.find(
                (node) => node.id === transition.target
            );

            const containerNode = drawerData.containerNodeId
                ? nodes.find(
                    (node) =>
                        node.id === drawerData.containerNodeId
                )
                : null;
            const targetIsInsideContainer = Boolean(
                containerNode &&
                (targetNode?.id === containerNode.id ||
                    (targetNode &&
                        isNodeInsideContainer(
                            targetNode,
                            containerNode.id,
                            nodes
                        )))
            );

            if (
                !logicalSourceNode ||
                !targetNode ||
                targetIsInsideContainer ||
                !canTargetVisualNode(
                    logicalSourceNode,
                    targetNode,
                    nodes
                )
            ) {
                return edge;
            }

            const eventId =
                transition.event ||
                getLogicalEdgeSourceHandle(edge) ||
                "success";
            const cleanedExisting =
                clearTransientTransitionHighlight(edge);
            const existingData = {
                ...(cleanedExisting?.data || {}),
            };

            [
                "boundaryInternalEdge",
                "boundaryOriginalSource",
                "boundaryOriginalSourceHandle",
                "boundaryOriginalTarget",
                "compoundInternalEdge",
                "compoundOriginalSource",
                "compoundOriginalSourceHandle",
                "compoundOriginalTarget",
                "parallelInternalEdge",
                "parallelOriginalSource",
                "parallelOriginalSourceHandle",
                "parallelOriginalTarget",
            ].forEach((key) => delete existingData[key]);

            affectedSourceIds.add(logicalSourceId);
            acceptedUpdates.set(String(edge.id), {
                ...transition,
                sourceNodeId: logicalSourceId,
                event: eventId,
            });

            return {
                ...cleanedExisting,
                source: logicalSourceId,
                target: transition.target,
                sourceHandle: eventId,
                targetHandle:
                    getTransitionTargetHandleForNode(targetNode),
                type: "smartTransition",
                selected: false,
                label: transition.cond
                    ? `${eventId} [${transition.cond}]`
                    : eventId,
                data: {
                    ...existingData,
                    cond: transition.cond || "",
                    assignments: Array.isArray(
                        transition.assignments
                    )
                        ? transition.assignments.map(
                            (assignment) => ({
                                location: assignment.location,
                                expr: assignment.expr,
                            })
                        )
                        : [],
                    assign: transition.assignments?.[0]
                        ? {
                            location:
                                transition.assignments[0]
                                    .location,
                            expr:
                                transition.assignments[0].expr,
                        }
                        : null,
                },
            };
        });

        if (acceptedUpdates.size === 0) {
            setDrawerData((previous) => ({
                ...previous,
                isOpen: false,
            }));
            return;
        }

        const updatesBySource = new Map();
        acceptedUpdates.forEach((transition) => {
            const sourceId = transition.sourceNodeId;
            if (!updatesBySource.has(sourceId)) {
                updatesBySource.set(sourceId, []);
            }
            updatesBySource.get(sourceId).push({
                ...transition,
                consumed: false,
            });
        });

        const semanticNodes = nodes.map((node) => {
            const sourceUpdates = updatesBySource.get(node.id);
            if (!sourceUpdates?.length) return node;

            const nextEvents = (node.data?.events || []).map(
                (event) => {
                    const eventId = String(event?.id || "");
                    const eventTarget = String(
                        event?.target || ""
                    );
                    const eventCond = String(
                        event?.cond || ""
                    );

                    let update = sourceUpdates.find(
                        (candidate) =>
                            !candidate.consumed &&
                            String(candidate.event || "") ===
                                eventId &&
                            String(
                                candidate.originalTarget || ""
                            ) === eventTarget &&
                            String(candidate.cond || "") ===
                                eventCond
                    );

                    if (!update) {
                        update = sourceUpdates.find(
                            (candidate) =>
                                !candidate.consumed &&
                                String(
                                    candidate.event || ""
                                ) === eventId &&
                                String(
                                    candidate.originalTarget ||
                                        ""
                                ) === eventTarget
                        );
                    }

                    if (!update) return event;
                    update.consumed = true;

                    const targetNode = nodes.find(
                        (candidate) =>
                            candidate.id === update.target
                    );

                    return {
                        ...event,
                        target: update.target,
                        selectedPackage:
                            getSkillPackageName(
                                targetNode?.data?.fullSkillName
                            ),
                        selectedSkill:
                            targetNode?.data?.fullSkillName
                                ?.split("#")[0] ||
                            targetNode?.data?.label ||
                            "",
                    };
                }
            );

            return {
                ...node,
                data: {
                    ...(node.data || {}),
                    events: nextEvents,
                },
            };
        });

        const normalized =
            rebuildBoundaryTransitionsIncremental(
                semanticNodes,
                semanticEdges,
                {
                    previousEdges: edges,
                    sourceIds: [...affectedSourceIds],
                }
            );

        setNodes(normalized.nodes);
        setEdges(normalized.edges);
        (normalized.affectedNodeIds || []).forEach(
            (nodeId) => {
                requestAnimationFrame(() =>
                    updateNodeInternals(nodeId)
                );
            }
        );
        // Container exits are visually owned by the border but
        // semantically owned by their real child source(s). Sync those
        // logical sources, not the selected container id, otherwise Rust
        // keeps the previous target and the border-to-target edge can
        // disappear again on the next canonical refresh.
        affectedSourceIds.forEach((sourceId) => {
            void syncTransitionsForSource?.(sourceId);
        });

        setDrawerData((previous) => ({
            ...previous,
            isOpen: false,
        }));
        return;
    }

    const varsToAdd = [
        ...(Array.isArray(newGlobalVars) ? newGlobalVars : []),
        ...(newGlobalVar ? [newGlobalVar] : []),
    ];

    if (varsToAdd.length > 0) {
        setGlobalDataModel((previous) => {
            const existingIds = new Set(previous.map((variable) => variable.id));
            const additions = varsToAdd.filter(
                (variable) => variable?.id && !existingIds.has(variable.id)
            );
            return [...previous, ...additions];
        });
    }

    const sourceId = drawerData.sourceNodeId;
    if (!sourceId || !Array.isArray(updatedTransitions)) return;

    const sourceNode = nodes.find((node) => node.id === sourceId);
    if (!sourceNode) return;

    const validUpdatedTransitions = updatedTransitions.filter((transition) => {
        const targetNode = nodes.find((node) => node.id === transition.target);
        return Boolean(
            targetNode && canTargetVisualNode(sourceNode, targetNode, nodes)
        );
    });

    const existingById = new Map(edges.map((edge) => [edge.id, edge]));
    const untouchedEdges = edges.filter(
        (edge) => getLogicalEdgeSourceId(edge) !== sourceId
    );

    const semanticEdges = validUpdatedTransitions.map((transition) => {
        const existing = transition.edgeId
            ? existingById.get(transition.edgeId)
            : null;
        const eventId = transition.event || "success";
        const hasCondition = Boolean(
            transition.cond && transition.cond.trim()
        );
        const cleanedExisting = existing
            ? clearTransientTransitionHighlight(existing)
            : null;
        const existingData = { ...(cleanedExisting?.data || {}) };

        // Boundary helper metadata describes the visual representation,
        // not the semantic SCXML transition. Rebuild it from the edited
        // source/target below so changing a transition cannot leave stale
        // border points behind.
        [
            "boundaryInternalEdge",
            "boundaryOriginalSource",
            "boundaryOriginalSourceHandle",
            "compoundInternalEdge",
            "compoundOriginalSource",
            "compoundOriginalSourceHandle",
            "compoundOriginalTarget",
            "parallelInternalEdge",
            "parallelOriginalSource",
            "parallelOriginalSourceHandle",
            "parallelOriginalTarget",
        ].forEach((key) => delete existingData[key]);

        return {
            ...(cleanedExisting || {}),
            id:
                cleanedExisting?.id ||
                `edge-${sourceId}-${eventId}-${transition.target}-${crypto.randomUUID()}`,
            source: sourceId,
            target: transition.target,
            sourceHandle: eventId,
            targetHandle: getTransitionTargetHandleForNode(
                nodes.find((node) => node.id === transition.target)
            ),
            type: "smartTransition",
            selected: false,
            label: hasCondition
                ? `${eventId} [${transition.cond}]`
                : eventId,
            markerEnd:
                cleanedExisting?.markerEnd || { type: MarkerType.ArrowClosed },
            data: {
                ...existingData,
                cond: transition.cond || "",
                assignments: Array.isArray(transition.assignments)
                    ? transition.assignments.map((assignment) => ({
                        location: assignment.location,
                        expr: assignment.expr,
                    }))
                    : [],
                assign: transition.assignments?.[0]
                    ? {
                        location: transition.assignments[0].location,
                        expr: transition.assignments[0].expr,
                    }
                    : null,
                controlPoints:
                    sourceId === transition.target
                        ? (
                            Array.isArray(existingData.controlPoints) &&
                            existingData.controlPoints.length >= 2
                                ? existingData.controlPoints
                                : makeSelfLoopControlPoints()
                        )
                        : existingData.controlPoints,
            },
        };
    });

    const semanticNodes = nodes.map((node) => {
        if (node.id !== sourceId) return node;

        const originalEvents = node.data.events || [];
        const baseEventById = new Map();
        originalEvents.forEach((event) => {
            if (!event?.id || baseEventById.has(event.id)) return;
            baseEventById.set(event.id, {
                ...event,
                target: null,
                cond: "",
                assignments: [],
                assignLocation: "",
                assignExpr: "",
                selectedPackage: "",
                selectedSkill: "",
            });
        });

        const usedEventIds = new Set();
        const orderedTransitionEvents = validUpdatedTransitions.map(
            (transition) => {
                const eventId = transition.event || "success";
                usedEventIds.add(eventId);
                const baseEvent = baseEventById.get(eventId) || {
                    id: eventId,
                    description: "",
                };
                const targetNode = nodes.find(
                    (candidate) => candidate.id === transition.target
                );

                return {
                    ...baseEvent,
                    id: eventId,
                    selectedPackage: getSkillPackageName(
                        targetNode?.data?.fullSkillName
                    ),
                    selectedSkill:
                        targetNode?.data?.fullSkillName?.split("#")[0] ||
                        targetNode?.data?.label ||
                        "",
                    target: transition.target,
                    cond: transition.cond || "",
                    assignments: Array.isArray(transition.assignments)
                        ? transition.assignments.map((assignment) => ({
                            location: assignment.location,
                            expr: assignment.expr,
                        }))
                        : [],
                    assignLocation:
                        transition.assignments?.[0]?.location || "",
                    assignExpr: transition.assignments?.[0]?.expr || "",
                };
            }
        );

        const unusedEvents = [...baseEventById.entries()]
            .filter(([eventId, event]) => {
                if (usedEventIds.has(eventId)) return false;
                if (eventId === "*") return true;
                if (isWildcardTransitionEvent(eventId)) return false;

                // Imported SCXML can contain transitions for exit tokens
                // the skill does not actually expose. Such handles exist
                // only so the imported edge can be represented and must
                // disappear when its last transition is removed.
                if (
                    event?.editorImportedSynthetic ||
                    event?.editorBoundarySynthetic
                ) {
                    return false;
                }

                return true;
            })
            .map(([, event]) => event);

        return {
            ...node,
            data: {
                ...node.data,
                events: [...orderedTransitionEvents, ...unusedEvents],
            },
        };
    });

    const normalized = rebuildBoundaryTransitionsIncremental(
        semanticNodes,
        [...untouchedEdges, ...semanticEdges],
        {
            previousEdges: edges,
            sourceIds: [sourceId],
        }
    );
    setNodes(normalized.nodes);
    setEdges(normalized.edges);
    (normalized.affectedNodeIds || []).forEach((nodeId) => {
        requestAnimationFrame(() => updateNodeInternals(nodeId));
    });
    void syncTransitionsForSource?.(sourceId);

    setDrawerData((previous) => ({ ...previous, isOpen: false }));
};
