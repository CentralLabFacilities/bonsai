import { getStoredTransitionAssignments } from "./editorScxml";
import {
    getLogicalEdgeSourceHandle,
    getLogicalEdgeSourceId,
    getSemanticTransitionTarget,
} from "./transitionSemantics";
import { getScxmlTransitionEvent } from "./transitionEvents";
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
 * source. Root-level executable states can replace their targeted transitions
 * directly. Container/nested transitions request a transition-projection rebuild
 * because SCXML hoists those transitions to container states.
 */
export const buildRustTransitionSyncPlan = ({
    nodes = [],
    edges = [],
    sourceStateId,
}) => {
    const normalizedSourceId = String(sourceStateId || "").trim();
    if (!normalizedSourceId) return { mode: "noop" };

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sourceNode = nodeById.get(normalizedSourceId);
    if (!sourceNode) return { mode: "full" };

    // References and nested/container states require the structure-aware
    // transition projection: their visual edge source is not necessarily the
    // SCXML transition owner.
    if (
        sourceNode.parentId ||
        sourceNode.type === "compound" ||
        sourceNode.type === "parallel" ||
        sourceNode.type === "parallelLane" ||
        sourceNode.data?.isSkillClone ||
        sourceNode.data?.isStateClone
    ) {
        return { mode: "full" };
    }

    const semanticEdges = edges.filter(
        (edge) =>
            isSemanticTransitionEdge(edge) &&
            String(getLogicalEdgeSourceId(edge) || "") === normalizedSourceId
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

    const sourceSkillName =
        sourceNode.data?.fullSkillName ||
        sourceNode.data?.label ||
        sourceNode.id;
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
            event:
                importedRawEvent ||
                getScxmlTransitionEvent(exitToken, sourceSkillName),
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
            sourceStateId: normalizedSourceId,
            transitions,
        },
    };
};
