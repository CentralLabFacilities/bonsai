import { MarkerType } from "@xyflow/react";
import {
    canTargetAcrossStateBoundaries,
    getTransitionTargetHandleForNode,
} from "./editorGeometry";

export const getSemanticTransitionTarget = (targetNode, allNodes = []) => {
    if (!(targetNode?.data?.isSkillClone || targetNode?.data?.isStateClone)) {
        return targetNode;
    }

    return (
        allNodes.find(
            (node) => node.id === targetNode.data?.cloneOfNodeId
        ) || targetNode
    );
};

export const canTargetVisualNode = (sourceNode, targetNode, allNodes = []) =>
    canTargetAcrossStateBoundaries(
        sourceNode,
        getSemanticTransitionTarget(targetNode, allNodes),
        allNodes
    );

const getFirstStoredBoundarySource = (edge) => {
    const entries = Array.isArray(edge?.data?.boundaryOriginalSources)
        ? edge.data.boundaryOriginalSources
        : [];
    return (
        entries.find((entry) => entry?.sourceId || entry?.nodeId || entry?.id) ||
        null
    );
};

export const getLogicalEdgeSourceId = (edge) => {
    const storedSource = getFirstStoredBoundarySource(edge);
    return (
        storedSource?.sourceId ||
        storedSource?.nodeId ||
        storedSource?.id ||
        edge?.data?.boundaryOriginalSource ||
        edge?.data?.compoundOriginalSource ||
        edge?.data?.parallelOriginalSource ||
        edge?.source
    );
};

export const getLogicalEdgeSourceHandle = (edge) => {
    const storedSource = getFirstStoredBoundarySource(edge);
    return (
        storedSource?.sourceHandle ||
        storedSource?.handle ||
        edge?.data?.boundaryOriginalSourceHandle ||
        edge?.data?.compoundOriginalSourceHandle ||
        edge?.data?.parallelOriginalSourceHandle ||
        edge?.sourceHandle ||
        edge?.label ||
        "success"
    );
};

export const makeSelfLoopControlPoints = () => [
    {
        id: `cp-${crypto.randomUUID()}`,
        anchor: "source",
        dx: 76,
        dy: -92,
    },
    {
        id: `cp-${crypto.randomUUID()}`,
        anchor: "target",
        dx: -76,
        dy: -92,
    },
];

export const buildSemanticTransitionEdge = ({
    sourceNode,
    eventId,
    targetNode,
}) => ({
    id: `edge-${sourceNode.id}-${eventId}-${targetNode.id}-${crypto.randomUUID()}`,
    source: sourceNode.id,
    target: targetNode.id,
    sourceHandle: eventId,
    targetHandle: getTransitionTargetHandleForNode(targetNode),
    label: eventId,
    type: "smartTransition",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: {
        cond: "",
        assignments: [],
        assign: null,
        ...(sourceNode.id === targetNode.id
            ? { controlPoints: makeSelfLoopControlPoints() }
            : {}),
    },
});
