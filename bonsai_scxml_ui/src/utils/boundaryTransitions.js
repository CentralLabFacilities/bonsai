import {
    COMPOUND_PADDING_X,
    getCompoundChildrenRight,
    getCompoundExitGutterWidth,
    isNodeInsideContainer,
} from "./editorGeometry";

const sourceIdOf = (edge) =>
    edge?.data?.boundaryOriginalSource ||
    edge?.data?.compoundOriginalSource ||
    edge?.data?.parallelOriginalSource ||
    edge?.source;

const sourceHandleOf = (edge) =>
    edge?.data?.boundaryOriginalSourceHandle ||
    edge?.data?.compoundOriginalSourceHandle ||
    edge?.data?.parallelOriginalSourceHandle ||
    edge?.sourceHandle ||
    edge?.label ||
    "success";


const sourceEntriesOf = (edge) => {
    const storedSources = Array.isArray(edge?.data?.boundaryOriginalSources)
        ? edge.data.boundaryOriginalSources
              .map((entry) => ({
                  sourceId: String(entry?.sourceId || ""),
                  sourceHandle: String(entry?.sourceHandle || ""),
              }))
              .filter((entry) => entry.sourceId && entry.sourceHandle)
        : [];

    if (storedSources.length > 0) return storedSources;

    return [
        {
            sourceId: sourceIdOf(edge),
            sourceHandle: String(sourceHandleOf(edge)),
        },
    ];
};

const semanticTargetIdOf = (edge) =>
    edge?.data?.boundaryOriginalTarget ||
    edge?.data?.compoundOriginalTarget ||
    edge?.data?.parallelOriginalTarget ||
    edge?.target;

const getExitedBoundaries = (sourceNode, targetNode, allNodes) => {
    if (!sourceNode || !targetNode) return [];
    const byId = new Map(allNodes.map((node) => [node.id, node]));
    const steps = [];
    const visited = new Set();
    const seenParallelIds = new Set();
    let parentId = sourceNode.parentId;

    const targetIsInside = (container) =>
        targetNode.id === container.id ||
        isNodeInsideContainer(targetNode, container.id, allNodes);

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;

        if (parent.type === "compound") {
            // The automatically managed Compound inside a Parallel lane is
            // structural only. The visible lane is the actual transition
            // boundary, so routing through both would duplicate the same exit.
            if (parent.data?.autoParallelLaneCompound) {
                parentId = parent.parentId;
                continue;
            }
            if (!targetIsInside(parent)) {
                steps.push({ kind: "compound", anchor: parent, container: parent });
            }
        } else if (parent.type === "parallelLane") {
            const parallel = byId.get(parent.parentId);
            if (
                parallel?.type === "parallel" &&
                !seenParallelIds.has(parallel.id)
            ) {
                seenParallelIds.add(parallel.id);
                if (!targetIsInside(parallel)) {
                    steps.push({ kind: "parallel", anchor: parent, container: parallel });
                }
            }
        } else if (parent.type === "parallel") {
            seenParallelIds.add(parent.id);
        }

        parentId = parent.parentId;
    }

    return steps;
};

const stripSourceBoundaryData = (data = {}) => {
    const next = { ...data };
    [
        "boundaryOriginalSource",
        "boundaryOriginalSourceHandle",
        "boundaryOriginalSources",
        "boundaryExitId",
        "compoundOriginalSource",
        "compoundOriginalSourceHandle",
        "compoundExitId",
        "parallelOriginalSource",
        "parallelOriginalSourceHandle",
        "parallelExitId",
        "boundaryInternalEdge",
        "compoundInternalEdge",
        "parallelInternalEdge",
        "boundaryKind",
    ].forEach((key) => delete next[key]);
    return next;
};

const makeSelfLoopControlPoints = () => [
    { id: `cp-${crypto.randomUUID()}`, anchor: "source", dx: 76, dy: -92 },
    { id: `cp-${crypto.randomUUID()}`, anchor: "target", dx: -76, dy: -92 },
];

/**
 * Rebuild all outgoing Compound/Parallel boundary helpers from semantic edge
 * metadata. Call this after reparenting nodes so border points immediately
 * follow the new containment hierarchy.
 */
export const rebuildBoundaryTransitions = (sourceNodes = [], sourceEdges = []) => {
    const nodes = sourceNodes.map((node) => ({
        ...node,
        data: node.data ? { ...node.data } : node.data,
        style: node.style ? { ...node.style } : node.style,
    }));
    const byId = new Map(nodes.map((node) => [node.id, node]));

    // Remove only managed boundary events. API-defined normal skill events and
    // genuine container-level events remain untouched.
    nodes.forEach((node) => {
        if (node.type !== "compound" && node.type !== "parallelLane") return;
        const events = node.type === "parallelLane"
            ? []
            : (node.data?.events || []).filter(
                (event) => !(event?.sourceNodeId && event?.transitionHandleId)
            );
        node.data = { ...(node.data || {}), events };
    });

    const semanticEdges = (sourceEdges || [])
        .filter(
            (edge) =>
                !edge.data?.boundaryInternalEdge &&
                !edge.data?.compoundInternalEdge &&
                !edge.data?.parallelInternalEdge &&
                !String(edge.id || "").startsWith("edge-internal-boundary-")
        )
        .map((edge) => {
            const sourceEntries = sourceEntriesOf(edge);
            return {
                edge,
                sourceEntries,
                sourceId: sourceEntries[0]?.sourceId || edge.source,
                sourceHandle:
                    sourceEntries[0]?.sourceHandle ||
                    String(edge.sourceHandle || edge.label || "success"),
                semanticTargetId: semanticTargetIdOf(edge),
            };
        });

    const nextEdges = [];
    const helperKeys = new Set();
    const boundaryEventsByNode = new Map();
    const updateBoundaryEvent = (anchor, event) => {
        if (!boundaryEventsByNode.has(anchor.id)) {
            boundaryEventsByNode.set(anchor.id, new Map());
        }
        const map = boundaryEventsByNode.get(anchor.id);
        if (!map.has(event.id)) map.set(event.id, event);
    };

    semanticEdges.forEach(
        ({ edge, sourceEntries, sourceId, sourceHandle, semanticTargetId }) => {
            const semanticTargetNode = byId.get(semanticTargetId);
            const validSources = sourceEntries.filter((entry) => byId.has(entry.sourceId));
            const primarySource = validSources[0];
            const sourceNode = primarySource ? byId.get(primarySource.sourceId) : null;

            if (!sourceNode || !semanticTargetNode) {
                nextEdges.push(edge);
                return;
            }

            const cleanData = stripSourceBoundaryData(edge.data || {});
            const sourcePaths = validSources.map((entry) => ({
                ...entry,
                sourceNode: byId.get(entry.sourceId),
                steps: getExitedBoundaries(
                    byId.get(entry.sourceId),
                    semanticTargetNode,
                    nodes
                ),
            }));
            const primaryPath = sourcePaths[0];
            const hasBoundaryStep = sourcePaths.some((path) => path.steps.length > 0);

            if (!hasBoundaryStep) {
                nextEdges.push({
                    ...edge,
                    source: sourceId,
                    sourceHandle,
                    label: sourceHandle,
                    data: {
                        ...cleanData,
                        ...(sourceId === semanticTargetId && !cleanData.controlPoints
                            ? { controlPoints: makeSelfLoopControlPoints() }
                            : {}),
                    },
                });
                return;
            }

            const importedRawEvent = String(
                edge.data?.boundaryImportedRawEvent || ""
            ).trim();
            const baseName =
                sourceNode.data?.label ||
                String(sourceNode.data?.fullSkillName || "state")
                    .split("#")[0]
                    .split(".")
                    .pop();
            const exitLabel = importedRawEvent || `${baseName}.${sourceHandle}`;
            const exitId =
                String(edge.data?.boundaryExitId || "").trim() ||
                `${sourceId}-${sourceHandle}`;
            const crossedKinds = new Set();
            let finalSourceId = sourceId;
            let finalSourceHandle = sourceHandle;

            sourcePaths.forEach((path, pathIndex) => {
                let currentSourceId = path.sourceId;
                let currentSourceHandle = path.sourceHandle;

                path.steps.forEach((step) => {
                    crossedKinds.add(step.kind);
                    updateBoundaryEvent(step.anchor, {
                        id: exitId,
                        name: exitLabel,
                        rawEvent: exitLabel,
                        target: edge.target,
                        sourceNodeId: sourceId,
                        transitionHandleId: sourceHandle,
                        ...(validSources.length > 1
                            ? {
                                sourceNodeIds: validSources.map((entry) => entry.sourceId),
                                transitionHandleIds: validSources.map(
                                    (entry) => entry.sourceHandle
                                ),
                            }
                            : {}),
                    });

                    const helperKey =
                        `${currentSourceId}|${currentSourceHandle}|` +
                        `${step.anchor.id}|${exitId}`;
                    if (!helperKeys.has(helperKey)) {
                        helperKeys.add(helperKey);
                        nextEdges.push({
                            id:
                                `edge-internal-boundary-${path.sourceId}-` +
                                `${path.sourceHandle}-${step.anchor.id}-${crypto.randomUUID()}`,
                            source: currentSourceId,
                            target: step.anchor.id,
                            sourceHandle: currentSourceHandle,
                            targetHandle: `target-${exitId}`,
                            type: "smoothstep",
                            selectable: false,
                            focusable: false,
                            style: {
                                strokeDasharray: "4 4",
                                stroke: "#0284c7",
                                strokeWidth: 1.5,
                            },
                            data: {
                                boundaryInternalEdge: true,
                                boundaryKind: step.kind,
                                boundaryExitId: exitId,
                                boundaryOriginalSource: path.sourceId,
                                boundaryOriginalSourceHandle: path.sourceHandle,
                                ...(step.kind === "compound"
                                    ? {
                                        compoundInternalEdge: true,
                                        compoundExitId: exitId,
                                    }
                                    : {
                                        parallelInternalEdge: true,
                                        parallelExitId: exitId,
                                    }),
                            },
                        });
                    }

                    currentSourceId = step.anchor.id;
                    currentSourceHandle = exitId;
                });

                if (pathIndex === 0) {
                    finalSourceId = currentSourceId;
                    finalSourceHandle = currentSourceHandle;
                }
            });

            nextEdges.push({
                ...edge,
                source: finalSourceId,
                sourceHandle: finalSourceHandle,
                label: sourceHandle,
                type: "smartTransition",
                data: {
                    ...cleanData,
                    boundaryOriginalSource: sourceId,
                    boundaryOriginalSourceHandle: sourceHandle,
                    ...(validSources.length > 1
                        ? { boundaryOriginalSources: validSources }
                        : {}),
                    ...(importedRawEvent
                        ? { boundaryImportedRawEvent: importedRawEvent }
                        : {}),
                    boundaryExitId: exitId,
                    ...(crossedKinds.has("compound")
                        ? {
                            compoundOriginalSource: sourceId,
                            compoundOriginalSourceHandle: sourceHandle,
                            compoundExitId: exitId,
                        }
                        : {}),
                    ...(crossedKinds.has("parallel")
                        ? {
                            parallelOriginalSource: sourceId,
                            parallelOriginalSourceHandle: sourceHandle,
                            parallelExitId: exitId,
                        }
                        : {}),
                },
            });
        }
    );

    boundaryEventsByNode.forEach((eventsById, nodeId) => {
        const node = byId.get(nodeId);
        if (!node) return;
        const events = [...(node.data?.events || []), ...eventsById.values()];
        node.data = { ...(node.data || {}), events };

        if (node.type === "compound") {
            const requiredWidth =
                getCompoundChildrenRight(node.id, nodes) +
                COMPOUND_PADDING_X +
                getCompoundExitGutterWidth(events);
            node.style = {
                ...(node.style || {}),
                width: Math.max(Number(node.style?.width) || 320, requiredWidth),
            };
        }
    });

    return { nodes, edges: nextEdges };
};
