import { getStoredTransitionAssignments } from "./editorScxml";
import {
    getLogicalEdgeSourceHandle,
    getLogicalEdgeSourceId,
    getSemanticTransitionTarget,
} from "./transitionSemantics";
import {
    serializeEditorConditionForScxml,
    serializeEditorValueForScxml,
} from "./valueTypes";

const isSemanticTransitionEdge = (edge) =>
    !edge?.data?.boundaryInternalEdge &&
    !edge?.data?.compoundInternalEdge &&
    !edge?.data?.parallelInternalEdge &&
    !edge?.data?.compoundInitialEdge &&
    !edge?.data?.parallelEntryEdge &&
    !String(edge?.id || "").startsWith("edge-internal-");

const normalizeAssignments = (edge) =>
    getStoredTransitionAssignments(edge?.data, null)
        .filter(
            (assignment) =>
                String(assignment?.location || "").trim() !== "" &&
                assignment?.expr !== undefined
        )
        .map((assignment) => ({
            location: String(assignment.location).trim().replace(/^@/, ""),
            expression: serializeEditorValueForScxml(assignment.expr ?? ""),
        }));

const semanticTargetId = (edge, nodes, nodeById) => {
    const visualTarget = nodeById.get(edge?.target);
    if (!visualTarget) return null;
    return getSemanticTransitionTarget(visualTarget, nodes)?.id || null;
};

const hasUnrepresentedTargetEvents = (
    sourceNode,
    semanticEdges,
    nodes,
    nodeById
) => {
    const represented = new Map();
    semanticEdges.forEach((edge) => {
        const targetId = semanticTargetId(edge, nodes, nodeById);
        if (!targetId) return;
        const key = `${String(getLogicalEdgeSourceHandle(edge))}::${targetId}`;
        represented.set(key, (represented.get(key) || 0) + 1);
    });

    const consumed = new Map();
    return (sourceNode?.data?.events || []).some((event) => {
        if (!event?.target) return false;
        if (event?.sourceNodeId && event?.transitionHandleId) return false;

        const targetNode = nodeById.get(event.target);
        const targetId = targetNode
            ? getSemanticTransitionTarget(targetNode, nodes)?.id || event.target
            : event.target;
        const key = `${String(event.id || "success")}::${String(targetId)}`;
        const used = consumed.get(key) || 0;
        const available = represented.get(key) || 0;
        if (used < available) {
            consumed.set(key, used + 1);
            return false;
        }
        return true;
    });
};

/**
 * Build the smallest safe Rust document update for one logical transition
 * source. The frontend supplies logical edges; Rust owns the SCXML transition
 * owner for root, nested, and container-scoped transitions. Full projection is
 * now reserved for malformed/incomplete editor state recovery only.
 */
export const buildRustTransitionSyncPlan = ({
    nodes = [],
    edges = [],
    sourceStateId,
}) => {
    const normalizedSourceId = String(sourceStateId || "").trim();
    if (!normalizedSourceId) return { mode: "noop" };

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const visualSourceNode = nodeById.get(normalizedSourceId);
    const logicalSourceId = String(
        visualSourceNode?.data?.isSkillClone || visualSourceNode?.data?.isStateClone
            ? visualSourceNode?.data?.cloneOfNodeId || ""
            : normalizedSourceId
    ).trim();
    const sourceNode = nodeById.get(logicalSourceId);
    if (!sourceNode || !logicalSourceId) return { mode: "full" };

    // The frontend reports the logical source and its visible transitions. Rust
    // now owns whether those transitions stay on the state or are hoisted to a
    // Compound/Parallel SCXML owner.
    const semanticEdges = edges.filter(
        (edge) =>
            isSemanticTransitionEdge(edge) &&
            String(getLogicalEdgeSourceId(edge) || "") === logicalSourceId
    );

    if (
        hasUnrepresentedTargetEvents(
            sourceNode,
            semanticEdges,
            nodes,
            nodeById
        )
    ) {
        return { mode: "full" };
    }

    const transitions = [];

    for (const edge of semanticEdges) {
        const targetStateId = semanticTargetId(edge, nodes, nodeById);
        if (!targetStateId || !nodeById.has(targetStateId)) {
            return { mode: "full" };
        }

        const exitToken = String(
            getLogicalEdgeSourceHandle(edge) || "success"
        ).trim() || "success";
        const importedRawEvent = String(
            edge?.data?.boundaryImportedRawEvent || ""
        ).trim();

        transitions.push({
            id: String(edge.id || ""),
            targetStateId: String(targetStateId),
            // Rust derives the final SCXML event from the logical source and
            // current hierarchy. Preserve an imported raw event only as input
            // compatibility; ownership recalculation remains backend-owned.
            event: importedRawEvent || exitToken,
            sourceHandle: exitToken,
            condition: serializeEditorConditionForScxml(
                edge?.data?.cond || ""
            ),
            assignments: normalizeAssignments(edge),
            targetInstanceId:
                String(edge?.data?.editorTargetInstanceId || "").trim() ||
                null,
        });
    }

    if (transitions.some((transition) => !transition.id)) {
        return { mode: "full" };
    }

    return {
        mode: "command",
        command: {
            type: "replaceTargetedTransitions",
            sourceStateId: logicalSourceId,
            transitions,
        },
    };
};
