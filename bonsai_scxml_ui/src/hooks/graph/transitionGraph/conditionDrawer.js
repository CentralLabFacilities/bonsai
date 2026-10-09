import { isNodeInsideContainer } from "../../../utils/editorGeometry";
import {
    getSkillPackageName,
    getStoredTransitionAssignments,
} from "../../../utils/editorScxml";
import {
    canTargetVisualNode,
    getLogicalEdgeSourceHandle,
    getLogicalEdgeSourceId,
} from "../../../utils/transitionSemantics";

export const createClosedConditionDrawerState = () => ({
    isOpen: false,
    sourceNodeId: null,
    sourceNodeName: "",
    sourceEventName: "",
    initialTargetId: null,
    initialTransitionId: null,
    candidateTransitions: [],
    availableEvents: [],
    availableTargets: [],
});

const toTargetOption = (node) => {
    const fullSkillName = node.data?.fullSkillName || "";
    const editorInstanceId = String(node.data?.editorInstanceId || "").trim();
    const stateName = editorInstanceId
        ? editorInstanceId
        : fullSkillName.includes("#")
            ? fullSkillName.split("#").pop()
            : "";
    const skillName =
        node.data?.label ||
        fullSkillName.split(".").pop()?.split("#")[0] ||
        node.id;
    const displayName =
        stateName && stateName !== skillName
            ? `${skillName}#${stateName.replace(/^#/, "")}`
            : skillName;

    return {
        id: node.id,
        label: node.data?.label || node.id,
        displayName,
        skillName,
        stateName,
        fullSkillName,
        packageName: getSkillPackageName(fullSkillName),
    };
};

const buildContainerDrawerData = ({
    sourceNode,
    currentEdges,
    nodes,
    options,
}) => {
    const suppliedTransitions = Array.isArray(options.containerTransitions)
        ? options.containerTransitions
        : [];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    const isInsideContainer = (nodeId) => {
        if (!nodeId) return false;
        if (nodeId === sourceNode.id) return true;

        const candidate = nodeById.get(nodeId);
        return Boolean(
            candidate &&
            isNodeInsideContainer(candidate, sourceNode.id, nodes)
        );
    };

    const availableTargetMap = new Map();
    const transitions = suppliedTransitions
        .map((transition, index) => {
            const logicalSourceNode = nodeById.get(transition.sourceNodeId);
            if (!logicalSourceNode) return null;

            const eventId = String(transition.eventId || "success").trim() || "success";
            const existingEdge = transition.edgeId
                ? currentEdges.find((edge) => edge.id === transition.edgeId)
                : null;
            const edgeCondition = String(existingEdge?.data?.cond || "");
            const matchingEvent =
                (logicalSourceNode.data?.events || []).find(
                    (event) =>
                        String(event?.id || "") === eventId &&
                        String(event?.target || "") ===
                            String(transition.targetNodeId || "") &&
                        String(event?.cond || "") === edgeCondition
                ) ||
                (logicalSourceNode.data?.events || []).find(
                    (event) =>
                        String(event?.id || "") === eventId &&
                        String(event?.target || "") ===
                            String(transition.targetNodeId || "")
                );

            const availableTargetIds = nodes
                .filter(
                    (node) =>
                        !isInsideContainer(node.id) &&
                        canTargetVisualNode(logicalSourceNode, node, nodes)
                )
                .map((node) => {
                    if (!availableTargetMap.has(node.id)) {
                        availableTargetMap.set(node.id, toTargetOption(node));
                    }
                    return node.id;
                });

            const sourceDisplayName =
                transition.sourceDisplayName ||
                logicalSourceNode.data?.label ||
                logicalSourceNode.id;
            const eventDisplayName =
                transition.eventDisplayName || `${sourceDisplayName}.${eventId}`;

            return {
                transitionId:
                    transition.edgeId ||
                    `container-transition-${sourceNode.id}-${index}`,
                edgeId: transition.edgeId || null,
                sourceNodeId: logicalSourceNode.id,
                sourceNodeName: sourceDisplayName,
                event: eventId,
                eventDisplayName,
                target: transition.targetNodeId || "",
                originalTarget: transition.targetNodeId || "",
                targetLabel:
                    transition.targetDisplayName ||
                    transition.targetNodeId ||
                    "",
                cond: existingEdge?.data?.cond || matchingEvent?.cond || "",
                assignments: getStoredTransitionAssignments(
                    existingEdge?.data,
                    matchingEvent
                ),
                availableTargetIds,
            };
        })
        .filter(Boolean);

    const initialTransition = transitions[0] || null;

    return {
        isOpen: true,
        sourceNodeId: sourceNode.id,
        sourceNodeName:
            sourceNode.data?.label ||
            sourceNode.data?.fullSkillName ||
            sourceNode.id,
        sourceEventName: "",
        initialTargetId: initialTransition?.target || "",
        initialTransitionId: initialTransition?.transitionId || null,
        candidateTransitions: transitions,
        availableEvents: [],
        availableTargets: [...availableTargetMap.values()],
        targetOnlyMode: true,
        containerNodeId: sourceNode.id,
    };
};

export const buildConditionDrawerData = ({
    sourceId,
    sourceHandle = "",
    initialTargetId = null,
    customEdges = null,
    options = null,
    nodes,
    edges,
}) => {
    const sourceNode = nodes.find((node) => node.id === sourceId);
    if (!sourceNode) return null;

    const currentEdges = customEdges || edges;

    if (
        options?.containerMode &&
        (sourceNode.type === "compound" || sourceNode.type === "parallel")
    ) {
        return buildContainerDrawerData({
            sourceNode,
            currentEdges,
            nodes,
            options,
        });
    }

    const outgoingEdges = currentEdges.filter(
        (edge) =>
            !edge.data?.boundaryInternalEdge &&
            !edge.data?.compoundInternalEdge &&
            !edge.data?.parallelInternalEdge &&
            getLogicalEdgeSourceId(edge) === sourceId
    );
    const sourceEvents = [...(sourceNode.data.events || [])];
    const baseStateName = String(
        sourceNode.data?.fullSkillName || sourceNode.data?.label || ""
    )
        .split("#")[0]
        .split(".")
        .pop()
        .toLowerCase();
    const exposesImplicitFatal =
        sourceNode.type === "custom" &&
        !sourceNode.data?.isFinal &&
        !sourceNode.data?.isBehaviorExit &&
        baseStateName !== "end" &&
        baseStateName !== "fatal";

    if (
        exposesImplicitFatal &&
        !sourceEvents.some((event) => String(event?.id || "").trim() === "fatal")
    ) {
        sourceEvents.push({ id: "fatal", description: "" });
    }

    // Edges preserve the SCXML transition order, so they are the primary
    // source for the ordered transition list shown in step 1.
    const transitions = outgoingEdges.map((edge) => {
        const matchingEvent =
            sourceEvents.find(
                (event) =>
                    event.id === getLogicalEdgeSourceHandle(edge) &&
                    event.target === edge.target &&
                    String(event.cond || "") === String(edge.data?.cond || "")
            ) ||
            sourceEvents.find(
                (event) =>
                    event.id === getLogicalEdgeSourceHandle(edge) &&
                    event.target === edge.target
            );

        const targetNode = nodes.find((node) => node.id === edge.target);

        return {
            transitionId: edge.id,
            edgeId: edge.id,
            event:
                getLogicalEdgeSourceHandle(edge) || matchingEvent?.id || "success",
            target: edge.target,
            targetLabel:
                targetNode?.data?.label ||
                matchingEvent?.targetLabel ||
                edge.target,
            cond: edge.data?.cond || matchingEvent?.cond || "",
            assignments: getStoredTransitionAssignments(edge.data, matchingEvent),
        };
    });

    // Keep transition data that may exist on the node even when an edge is
    // currently missing, without collapsing duplicate conditional paths.
    const representedCounts = new Map();
    transitions.forEach((transition) => {
        const key = `${transition.event}::${transition.target}`;
        representedCounts.set(key, (representedCounts.get(key) || 0) + 1);
    });

    const consumedCounts = new Map();
    sourceEvents
        .filter((event) => event.target)
        .forEach((event, index) => {
            const key = `${event.id}::${event.target}`;
            const consumed = consumedCounts.get(key) || 0;
            const represented = representedCounts.get(key) || 0;

            if (consumed < represented) {
                consumedCounts.set(key, consumed + 1);
                return;
            }

            const targetNode = nodes.find((node) => node.id === event.target);
            transitions.push({
                transitionId: `node-transition-${sourceId}-${index}`,
                edgeId: null,
                event: event.id,
                target: event.target,
                targetLabel: targetNode?.data?.label || event.target,
                cond: event.cond || "",
                assignments: getStoredTransitionAssignments(event),
            });
        });

    const eventMap = new Map();
    sourceEvents.forEach((event) => {
        if (!event?.id || eventMap.has(event.id)) return;
        eventMap.set(event.id, {
            id: event.id,
            description: event.description || "",
        });
    });
    outgoingEdges.forEach((edge) => {
        const eventId = edge.sourceHandle || edge.label;
        if (!eventId || eventMap.has(eventId)) return;
        eventMap.set(eventId, { id: eventId, description: "" });
    });

    const availableTargets = nodes
        .filter((node) => canTargetVisualNode(sourceNode, node, nodes))
        .map(toTargetOption);

    const targetOnlyMode = Boolean(options?.targetOnly);
    const targetOnlyEdgeId = options?.edgeId ? String(options.edgeId) : null;
    const availableTargetIds = availableTargets.map((target) => target.id);
    const drawerTransitions = targetOnlyMode
        ? transitions
              .filter(
                  (transition) =>
                      !targetOnlyEdgeId ||
                      String(transition.edgeId || transition.transitionId) ===
                          targetOnlyEdgeId
              )
              .map((transition) => ({
                  ...transition,
                  sourceNodeId: sourceId,
                  sourceNodeName:
                      sourceNode.data?.label ||
                      sourceNode.data?.fullSkillName ||
                      sourceId,
                  eventDisplayName:
                      transition.event || sourceHandle || "success",
                  originalTarget: transition.target || "",
                  availableTargetIds,
              }))
        : transitions;

    const initialTransition =
        drawerTransitions.find(
            (transition) =>
                (!sourceHandle || transition.event === sourceHandle) &&
                (!initialTargetId || transition.target === initialTargetId)
        ) ||
        drawerTransitions.find((transition) => transition.event === sourceHandle) ||
        drawerTransitions[0];

    return {
        isOpen: true,
        sourceNodeId: sourceId,
        sourceNodeName:
            sourceNode.data?.label ||
            sourceNode.data?.fullSkillName ||
            sourceId,
        sourceEventName: sourceHandle,
        initialTargetId: initialTargetId || initialTransition?.target || "",
        initialTransitionId: initialTransition?.transitionId || null,
        candidateTransitions: drawerTransitions,
        availableEvents: [...eventMap.values()],
        availableTargets,
        targetOnlyMode,
        containerNodeId: null,
    };
};
