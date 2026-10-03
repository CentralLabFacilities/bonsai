import { useCallback, useRef, useState } from "react";
import { addEdge, MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    clearTransientTransitionHighlight,
    normalizeSlotType,
    parseSlotConnectionHandle,
    getSlotPathFromNode,
} from "../utils/editorGraph";
import {
    COMPOUND_PADDING_X,
    getCompoundChildrenRight,
    getCompoundExitGutterWidth,
    getDirectCompoundForNode,
    getLaneForNode,
    getTransitionTargetHandleForNode,
    isNodeInsideContainer,
    isCompoundInitialChildCandidate,
} from "../utils/editorGeometry";
import {
    getSkillPackageName,
    getStoredTransitionAssignments,
} from "../utils/editorScxml";
import {
    canTargetVisualNode,
    getLogicalEdgeSourceHandle,
    getLogicalEdgeSourceId,
    getSemanticTransitionTarget,
    makeSelfLoopControlPoints,
} from "../utils/transitionSemantics";
import { rebuildBoundaryTransitionsIncremental } from "../utils/boundaryTransitions";
import { isWildcardTransitionEvent } from "../utils/transitionEvents";
import { slotDebug, summarizeSkillSlots } from "../utils/slotDebug";

const getBoundarySourceEvent = (sourceNode, sourceHandle, allNodes = []) => {
    if (!sourceNode || !["compound", "parallelLane"].includes(sourceNode.type)) {
        return null;
    }

    const event = (sourceNode.data?.events || []).find(
        (candidate) => String(candidate?.id || "") === String(sourceHandle || "")
    );
    if (!event) return null;

    let sourceNodeId = event.sourceNodeId || null;
    let transitionHandleId = event.transitionHandleId || null;

    // Older parallel exit metadata only stored rawEvent="Skill.event". Resolve
    // that format once so drawing onward from an existing border point still
    // preserves the real skill event.
    if (!sourceNodeId) {
        const rawEvent = String(event.rawEvent || event.name || "").trim();
        const separatorIndex = rawEvent.lastIndexOf(".");
        if (separatorIndex > 0) {
            const skillName = rawEvent.slice(0, separatorIndex);
            transitionHandleId = transitionHandleId || rawEvent.slice(separatorIndex + 1);
            const candidates = allNodes.filter((node) => {
                if (node.type !== "custom" && node.type !== "submachine") return false;
                const full = String(node.data?.fullSkillName || "");
                const label = String(node.data?.label || "");
                const matchesName =
                    full === skillName ||
                    full.split("#")[0] === skillName ||
                    label === skillName;
                if (!matchesName) return false;
                if (sourceNode.type === "parallelLane") {
                    return getLaneForNode(node, allNodes)?.id === sourceNode.id;
                }
                return isNodeInsideContainer(node, sourceNode.id, allNodes);
            });
            if (candidates.length === 1) sourceNodeId = candidates[0].id;
        }
    }

    const logicalSourceNode = allNodes.find((node) => node.id === sourceNodeId);
    if (!logicalSourceNode) return null;

    return {
        event,
        logicalSourceNode,
        logicalSourceId: logicalSourceNode.id,
        logicalHandle: transitionHandleId || sourceHandle || "success",
    };
};

const getExitedBoundarySteps = (sourceNode, targetNode, allNodes = []) => {
    if (!sourceNode || !targetNode) return [];
    const byId = new Map(allNodes.map((node) => [node.id, node]));
    const steps = [];
    const seenParallelIds = new Set();
    const visited = new Set();
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

export function useTransitionGraph({
    nodes,
    edges,
    slotNodes,
    slotEdges,
    selectedNodeId,
    setNodes,
    setEdges,
    setSlotNodes,
    setSlotEdges,
    setGlobalDataModel,
    setSelectedNodeId,
    updateNodeInternals,
    selectTransitionEdge,
    syncTransitionsForSource,
    checkSlotConnection,
    syncSlotsAfterCommit,
    onSkillSlotConnectionApplied,
}) {
    const [slotConnectionDrag, setSlotConnectionDrag] = useState(null);
    const reconnectingEdgeRef = useRef(null);
    const [drawerData, setDrawerData] = useState({
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

    const openConditionDrawer = (
        sourceId,
        sourceHandle = "",
        initialTargetId = null,
        customEdges = null,
        options = null
    ) => {
        const sourceNode = nodes.find((node) => node.id === sourceId);
        if (!sourceNode) return;

        const currentEdges = customEdges || edges;

        if (
            options?.containerMode &&
            (sourceNode.type === "compound" || sourceNode.type === "parallel")
        ) {
            const suppliedTransitions = Array.isArray(
                options.containerTransitions
            )
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

            const toTargetOption = (node) => {
                const fullSkillName = node.data?.fullSkillName || "";
                const editorInstanceId = String(
                    node.data?.editorInstanceId || ""
                ).trim();
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

            const availableTargetMap = new Map();
            const transitions = suppliedTransitions
                .map((transition, index) => {
                    const logicalSourceNode = nodeById.get(
                        transition.sourceNodeId
                    );
                    if (!logicalSourceNode) return null;

                    const eventId = String(
                        transition.eventId || "success"
                    ).trim() || "success";
                    const existingEdge = transition.edgeId
                        ? currentEdges.find(
                            (edge) => edge.id === transition.edgeId
                        )
                        : null;
                    const edgeCondition = String(
                        existingEdge?.data?.cond || ""
                    );
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
                                canTargetVisualNode(
                                    logicalSourceNode,
                                    node,
                                    nodes
                                )
                        )
                        .map((node) => {
                            if (!availableTargetMap.has(node.id)) {
                                availableTargetMap.set(
                                    node.id,
                                    toTargetOption(node)
                                );
                            }
                            return node.id;
                        });

                    const sourceDisplayName =
                        transition.sourceDisplayName ||
                        logicalSourceNode.data?.label ||
                        logicalSourceNode.id;
                    const eventDisplayName =
                        transition.eventDisplayName ||
                        `${sourceDisplayName}.${eventId}`;

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
                        cond:
                            existingEdge?.data?.cond ||
                            matchingEvent?.cond ||
                            "",
                        assignments: getStoredTransitionAssignments(
                            existingEdge?.data,
                            matchingEvent
                        ),
                        availableTargetIds,
                    };
                })
                .filter(Boolean);

            const initialTransition = transitions[0] || null;

            setDrawerData({
                isOpen: true,
                sourceNodeId: sourceNode.id,
                sourceNodeName:
                    sourceNode.data?.label ||
                    sourceNode.data?.fullSkillName ||
                    sourceNode.id,
                sourceEventName: "",
                initialTargetId: initialTransition?.target || "",
                initialTransitionId:
                    initialTransition?.transitionId || null,
                candidateTransitions: transitions,
                availableEvents: [],
                availableTargets: [...availableTargetMap.values()],
                targetOnlyMode: true,
                containerNodeId: sourceNode.id,
            });
            return;
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
            const matchingEvent = sourceEvents.find(
                (event) =>
                    event.id === getLogicalEdgeSourceHandle(edge) &&
                    event.target === edge.target &&
                    String(event.cond || "") === String(edge.data?.cond || "")
            ) || sourceEvents.find(
                (event) =>
                    event.id === getLogicalEdgeSourceHandle(edge) &&
                    event.target === edge.target
            );

            const targetNode = nodes.find((node) => node.id === edge.target);

            return {
                transitionId: edge.id,
                edgeId: edge.id,
                event: getLogicalEdgeSourceHandle(edge) || matchingEvent?.id || "success",
                target: edge.target,
                targetLabel:
                    targetNode?.data?.label ||
                    matchingEvent?.targetLabel ||
                    edge.target,
                cond: edge.data?.cond || matchingEvent?.cond || "",
                assignments: getStoredTransitionAssignments(
                    edge.data,
                    matchingEvent
                ),
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
            .filter((node) =>
                canTargetVisualNode(sourceNode, node, nodes)
            )
            .map((node) => {
                const fullSkillName = node.data?.fullSkillName || "";
                const editorInstanceId = String(
                    node.data?.editorInstanceId || ""
                ).trim();
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
            });

        const targetOnlyMode = Boolean(options?.targetOnly);
        const targetOnlyEdgeId = options?.edgeId
            ? String(options.edgeId)
            : null;
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

        const initialTransition = drawerTransitions.find(
            (transition) =>
                (!sourceHandle || transition.event === sourceHandle) &&
                (!initialTargetId || transition.target === initialTargetId)
        ) || drawerTransitions.find(
            (transition) => transition.event === sourceHandle
        ) || drawerTransitions[0];

        setDrawerData({
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
        });
    };

    const isValidConnection = useCallback((connection) => {
        const possibleInitialCompound = nodes.find(
            (node) =>
                node.id === connection.source &&
                node.type === "compound"
        );

        // The compound entry handle is source-only and may only connect
        // inward to an immediate child. It represents the compound's
        // initial state and is never a normal transition.
        if (
            possibleInitialCompound &&
            connection.sourceHandle === "compound-entry"
        ) {
            const targetNode = nodes.find(
                (node) => node.id === connection.target
            );

            return Boolean(
                targetNode &&
                targetNode.parentId === possibleInitialCompound.id &&
                isCompoundInitialChildCandidate(targetNode)
            );
        }

        // The compound entry point is never an incoming endpoint. Loose
        // connection mode would otherwise allow another event handle to use
        // this source handle as a target.
        if (connection.targetHandle === "compound-entry") {
            return false;
        }

        const sourceSlotHandle = parseSlotConnectionHandle(
            connection.sourceHandle
        );
        const targetSlotHandle = parseSlotConnectionHandle(
            connection.targetHandle
        );

        // Slot connections require all three dimensions to match:
        // skill <-> slot node, Read/Write access, and the declared slot type.
        if (sourceSlotHandle || targetSlotHandle) {
            if (
                !sourceSlotHandle ||
                !targetSlotHandle ||
                sourceSlotHandle.access !== targetSlotHandle.access ||
                sourceSlotHandle.origin === targetSlotHandle.origin
            ) {
                return false;
            }

            const sourceIsSkill = sourceSlotHandle.origin === "skill";
            const skillHandle = sourceIsSkill
                ? sourceSlotHandle
                : targetSlotHandle;
            const skillNodeId = sourceIsSkill
                ? connection.source
                : connection.target;
            const slotNodeId = sourceIsSkill
                ? connection.target
                : connection.source;

            const skillNode = nodes.find(
                (node) => node.id === skillNodeId
            );
            const slotNode = slotNodes.find(
                (node) => node.id === slotNodeId
            );

            if (!skillNode || !slotNode) {
                return false;
            }

            const skillSlot =
                skillHandle.access === "read"
                    ? skillNode.data?.inSlots?.[skillHandle.slotIndex]
                    : skillNode.data?.outSlots?.[skillHandle.slotIndex];

            const skillType = normalizeSlotType(skillSlot?.type);
            const slotType = normalizeSlotType(slotNode.data?.slotType);

            return Boolean(
                skillType &&
                slotType &&
                skillType === slotType
            );
        }

        const reconnectingEdge = reconnectingEdgeRef.current;
        if (reconnectingEdge) {
            const destinationNode = nodes.find(
                (node) => node.id === connection.target
            );
            const logicalSourceNode = nodes.find(
                (node) => node.id === getLogicalEdgeSourceId(reconnectingEdge)
            );

            return Boolean(
                destinationNode &&
                logicalSourceNode &&
                ["transition-target", "target"].includes(connection.targetHandle) &&
                canTargetVisualNode(logicalSourceNode, destinationNode, nodes)
            );
        }

        const sourceNode = nodes.find(
            (node) => node.id === connection.source
        );
        const targetNode = nodes.find(
            (node) => node.id === connection.target
        );

        const boundarySource = getBoundarySourceEvent(
            sourceNode,
            connection.sourceHandle,
            nodes
        );
        const semanticSourceNode =
            boundarySource?.logicalSourceNode || sourceNode;

        if (
            !sourceNode ||
            !semanticSourceNode ||
            !targetNode ||
            (semanticSourceNode.data?.isSkillClone || semanticSourceNode.data?.isStateClone) ||
            !canTargetVisualNode(semanticSourceNode, targetNode, nodes)
        ) {
            return false;
        }

        // Normal transitions are strictly directional even though the canvas
        // stays in ConnectionMode.Loose for bidirectional slot wiring:
        //   event handle (right) -> transition target handle (left)
        // A left transition handle can never start an edge, and an event
        // handle can never receive one.
        const normalTransitionTargetHandles = new Set([
            "transition-target",
            "target",
        ]);

        return Boolean(
            connection.sourceHandle &&
            !normalTransitionTargetHandles.has(connection.sourceHandle) &&
            normalTransitionTargetHandles.has(connection.targetHandle)
        );
    }, [nodes, slotNodes, edges]);

    const handleConnectStart = useCallback((_, params) => {
        const slotHandle = parseSlotConnectionHandle(params?.handleId);

        if (!slotHandle) {
            setSlotConnectionDrag(null);
            return;
        }

        let slotType = "";

        if (slotHandle.origin === "skill") {
            const skillNode = nodes.find(
                (node) => node.id === params.nodeId
            );
            const skillSlot =
                slotHandle.access === "read"
                    ? skillNode?.data?.inSlots?.[slotHandle.slotIndex]
                    : skillNode?.data?.outSlots?.[slotHandle.slotIndex];

            slotType = normalizeSlotType(skillSlot?.type);
        } else {
            const slotNode = slotNodes.find(
                (node) => node.id === params.nodeId
            );
            slotType = normalizeSlotType(slotNode?.data?.slotType);
        }

        setSlotConnectionDrag({
            active: true,
            nodeId: params.nodeId,
            handleId: params.handleId,
            origin: slotHandle.origin,
            access: slotHandle.access,
            slotType,
        });
    }, [nodes, slotNodes]);

    const handleConnectEnd = useCallback(() => {
        setSlotConnectionDrag(null);
    }, []);

    const applySkillSlotConnection = useCallback(
        ({
            skillNodeId,
            slotNodeId,
            access,
            slotIndex,
            preferredEdgeId = null,
        }) => {
            if (
                !skillNodeId ||
                !slotNodeId ||
                !["read", "write"].includes(access) ||
                !Number.isInteger(Number(slotIndex))
            ) {
                slotDebug("slot-edge: connection rejected invalid arguments", {
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex,
                });
                return false;
            }

            const normalizedSlotIndex = Number(slotIndex);
            const skillNode = nodes.find((node) => node.id === skillNodeId);
            const slotNode = slotNodes.find((node) => node.id === slotNodeId);
            const path = getSlotPathFromNode(slotNode);

            if (!skillNode || !slotNode || !path) {
                slotDebug("slot-edge: connection rejected missing node/path", {
                    skillNodeId,
                    slotNodeId,
                    hasSkillNode: Boolean(skillNode),
                    hasSlotNode: Boolean(slotNode),
                    resolvedPath: path || "",
                });
                return false;
            }

            const skillSlot =
                access === "read"
                    ? skillNode.data?.inSlots?.[normalizedSlotIndex]
                    : skillNode.data?.outSlots?.[normalizedSlotIndex];
            if (!skillSlot) {
                slotDebug("slot-edge: connection rejected missing skill slot", {
                    skillNodeId,
                    access,
                    slotIndex: normalizedSlotIndex,
                    skillSlots: summarizeSkillSlots(nodes, skillNodeId),
                });
                return false;
            }

            const skillType = normalizeSlotType(skillSlot.type);
            const slotType = normalizeSlotType(slotNode.data?.slotType);
            if (!skillType || !slotType || skillType !== slotType) {
                slotDebug("slot-edge: connection rejected type mismatch", {
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex: normalizedSlotIndex,
                    skillType,
                    slotType,
                });
                return false;
            }

            const normalizedPath = `/${path}`;
            slotDebug("slot-edge: connection accepted", {
                skillNodeId,
                slotNodeId,
                access,
                slotIndex: normalizedSlotIndex,
                rawPath: path,
                normalizedPath,
                previousSkillSlots: summarizeSkillSlots(nodes, skillNodeId),
            });

            const nextNodes = nodes.map((node) => {
                if (node.id !== skillNodeId) return node;

                const slotKey = access === "read" ? "inSlots" : "outSlots";
                return {
                    ...node,
                    data: {
                        ...node.data,
                        [slotKey]: (node.data?.[slotKey] || []).map(
                            (slot, index) =>
                                index === normalizedSlotIndex
                                    ? {
                                          ...slot,
                                          path: normalizedPath,
                                          inherited: slotNode.data?.inherited
                                              ? {
                                                    state:
                                                        slotNode.data
                                                            ?.inheritedFrom ||
                                                        "",
                                                    xpath: normalizedPath,
                                                }
                                              : null,
                                      }
                                    : slot
                        ),
                    },
                };
            });

            slotDebug("slot-edge: local skill slot path updated", {
                skillNodeId,
                access,
                slotIndex: normalizedSlotIndex,
                normalizedPath,
                nextSkillSlots: summarizeSkillSlots(nextNodes, skillNodeId),
            });

            setNodes(nextNodes);

            // Keep the connected skill as the active detail-panel context.
            // The explicit refresh below runs after React has committed the
            // updated node data, so the controlled slot-path field cannot stay
            // on the pre-connection value.
            setSelectedNodeId?.(skillNodeId);

            const existingEdge =
                slotEdges.find(
                    (edge) => preferredEdgeId && edge.id === preferredEdgeId
                ) ||
                slotEdges.find(
                    (edge) =>
                        edge.data?.edgeKind === "slot" &&
                        edge.data?.subMachineInherited !== true &&
                        edge.data?.access === access &&
                        (edge.data?.skillNodeId || edge.source) === skillNodeId &&
                        Number(edge.data?.slotIndex) === normalizedSlotIndex
                );

            const remainingEdges = slotEdges.filter((edge) => {
                if (edge.data?.edgeKind !== "slot") return true;
                if (edge.data?.subMachineInherited === true) return true;
                if (edge.data?.access !== access) return true;

                const storedSkillNodeId = edge.data?.skillNodeId || edge.source;
                return !(
                    storedSkillNodeId === skillNodeId &&
                    Number(edge.data?.slotIndex) === normalizedSlotIndex
                );
            });

            const skillHandleId =
                access === "read"
                    ? `slot-skill-read-${normalizedSlotIndex}`
                    : `slot-skill-write-${normalizedSlotIndex}`;
            const slotHandleId =
                access === "read" ? "slot-node-read" : "slot-node-write";

            const nextSlotEdges = [
                ...remainingEdges,
                {
                    id:
                        existingEdge?.id ||
                        `edge-slot-${access}-${skillNodeId}-${normalizedSlotIndex}-${crypto.randomUUID()}`,
                    source: skillNodeId,
                    target: slotNodeId,
                    sourceHandle: skillHandleId,
                    targetHandle: slotHandleId,
                    type: "smartTransition",
                    selected: Boolean(existingEdge?.selected),
                    style: {
                        stroke: SLOT_CONNECTION_COLORS[access],
                        strokeWidth: 1.7,
                        strokeDasharray: "5 5",
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: SLOT_CONNECTION_COLORS[access],
                    },
                    data: {
                        ...(existingEdge?.data || {}),
                        edgeKind: "slot",
                        access,
                        slotIndex: normalizedSlotIndex,
                        path,
                        skillNodeId,
                        slotNodeId,
                        canonicalSlotNodeId:
                            slotNode.data?.isSlotClone &&
                            slotNode.data?.cloneOfNodeId
                                ? slotNode.data.cloneOfNodeId
                                : slotNodeId,
                        // A manual route to the previous slot target is no
                        // longer meaningful after reconnecting the edge.
                        controlPoints:
                            existingEdge?.target === slotNodeId
                                ? existingEdge?.data?.controlPoints || []
                                : [],
                    },
                },
            ];

            // Commit the visual slot target and use that same edge snapshot when
            // rebuilding the generated slot graph. Otherwise the rebuild sees
            // the pre-reconnect edge from the hook closure and resolves the
            // visual alias back to the previous slot node.
            setSlotEdges(nextSlotEdges);

            requestAnimationFrame(() => {
                checkSlotConnection?.(
                    nextNodes,
                    null,
                    slotNodes,
                    nextSlotEdges
                );
                onSkillSlotConnectionApplied?.(skillNodeId);
            });
            // Persist exactly the slot-path state produced by this connection.
            // Do not wait for editorStateRef to catch up: manual handle dragging
            // can otherwise send the previous (empty) path to Rust, which leaves
            // the stale "slot path missing" problem in the Problems panel.
            slotDebug("slot-edge: queue Rust slot snapshot", {
                skillNodeId,
                access,
                slotIndex: normalizedSlotIndex,
                normalizedPath,
            });
            void syncSlotsAfterCommit?.(
                { nodes: nextNodes },
                {
                    source: "manual-slot-edge",
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex: normalizedSlotIndex,
                    normalizedPath,
                }
            );
            return true;
        },
        [
            nodes,
            slotNodes,
            slotEdges,
            setNodes,
            setSlotEdges,
            setSelectedNodeId,
            checkSlotConnection,
            syncSlotsAfterCommit,
            onSkillSlotConnectionApplied,
        ]
    );

    const handleReconnectStart = useCallback((_, edge) => {
        // Only target-end transition reconnects are exposed. React Flow reports
        // the fixed opposite handle here, so keep the edge itself regardless
        // of that handleType value for validation during the drag.
        reconnectingEdgeRef.current = edge;
        setSlotConnectionDrag(null);
    }, []);

    const handleReconnectEnd = useCallback(() => {
        reconnectingEdgeRef.current = null;
    }, []);

    const onReconnect = useCallback(
        (oldEdge, connection) => {
            reconnectingEdgeRef.current = null;

            if (oldEdge?.data?.edgeKind === "slot") {
                const access =
                    oldEdge.data?.access === "write" ? "write" : "read";
                const slotIndex = Number(oldEdge.data?.slotIndex);
                const skillNodeId =
                    oldEdge.data?.skillNodeId ||
                    oldEdge.data?.collapsedSlotOriginalSource ||
                    oldEdge.source;

                // A slot reconnect only changes the slot target. Keep the
                // semantic skill/access/index from the original edge and resolve
                // the new endpoint by node identity instead of relying on React
                // Flow's loose-mode handle orientation. In ConnectionMode.Loose
                // the reconnect payload can report the new slot as either source
                // or target (and can omit one of the handle ids), which previously
                // caused a visually re-drawn edge to keep its old slot path.
                const sourceHandle = parseSlotConnectionHandle(
                    connection?.sourceHandle
                );
                const targetHandle = parseSlotConnectionHandle(
                    connection?.targetHandle
                );
                const slotNodeIdSet = new Set(
                    slotNodes.map((node) => node.id)
                );

                const endpointCandidates = [
                    {
                        nodeId: connection?.target,
                        handle: targetHandle,
                    },
                    {
                        nodeId: connection?.source,
                        handle: sourceHandle,
                    },
                ];

                const slotEndpoint = endpointCandidates.find(
                    ({ nodeId, handle }) =>
                        nodeId &&
                        slotNodeIdSet.has(nodeId) &&
                        (!handle || handle.origin === "slot")
                );
                const skillEndpoint = endpointCandidates.find(
                    ({ nodeId, handle }) =>
                        nodeId === skillNodeId || handle?.origin === "skill"
                );

                const slotNodeId = slotEndpoint?.nodeId || null;
                const slotHandle = slotEndpoint?.handle || null;
                const skillHandle = skillEndpoint?.handle || null;

                if (!slotNodeId) {
                    slotDebug("slot-edge: reconnect rejected missing slot endpoint", {
                        edgeId: oldEdge.id,
                        skillNodeId,
                        access,
                        slotIndex,
                        connection,
                    });
                    return;
                }

                if (
                    (slotHandle &&
                        slotHandle.origin === "slot" &&
                        slotHandle.access !== access) ||
                    (skillHandle &&
                        skillHandle.origin === "skill" &&
                        (skillHandle.access !== access ||
                            Number(skillHandle.slotIndex) !== slotIndex))
                ) {
                    slotDebug("slot-edge: reconnect rejected handle mismatch", {
                        edgeId: oldEdge.id,
                        skillNodeId,
                        slotNodeId,
                        access,
                        slotIndex,
                        sourceHandle: connection?.sourceHandle || null,
                        targetHandle: connection?.targetHandle || null,
                    });
                    return;
                }

                slotDebug("slot-edge: reconnect accepted new slot target", {
                    edgeId: oldEdge.id,
                    skillNodeId,
                    previousSlotNodeId:
                        oldEdge.data?.slotNodeId || oldEdge.target,
                    slotNodeId,
                    access,
                    slotIndex,
                });

                applySkillSlotConnection({
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex,
                    preferredEdgeId: oldEdge.id,
                });
                return;
            }

            const existingEdge = edges.find((edge) => edge.id === oldEdge?.id);
            if (
                !existingEdge ||
                existingEdge.data?.boundaryInternalEdge ||
                existingEdge.data?.compoundInternalEdge ||
                existingEdge.data?.parallelInternalEdge ||
                existingEdge.data?.compoundInitialEdge ||
                existingEdge.data?.parallelEntryEdge
            ) {
                return;
            }

            // Only an edge entering a state with exactly one semantic incoming
            // transition may be re-targeted. This mirrors the visible reconnect
            // handle configured by useEditorDisplay.
            const incomingEdges = edges.filter(
                (edge) =>
                    edge.target === existingEdge.target &&
                    !edge.data?.boundaryInternalEdge &&
                    !edge.data?.compoundInternalEdge &&
                    !edge.data?.parallelInternalEdge &&
                    !edge.data?.compoundInitialEdge &&
                    !edge.data?.parallelEntryEdge
            );
            if (incomingEdges.length !== 1 || incomingEdges[0].id !== existingEdge.id) {
                return;
            }

            const destinationNode = nodes.find(
                (node) => node.id === connection.target
            );
            const logicalSourceId = getLogicalEdgeSourceId(existingEdge);
            const logicalSourceHandle = getLogicalEdgeSourceHandle(existingEdge);
            const logicalSourceNode = nodes.find(
                (node) => node.id === logicalSourceId
            );

            if (
                !destinationNode ||
                !logicalSourceNode ||
                !["transition-target", "target"].includes(
                    connection.targetHandle || getTransitionTargetHandleForNode(destinationNode)
                ) ||
                !canTargetVisualNode(logicalSourceNode, destinationNode, nodes)
            ) {
                return;
            }

            let updatedMatchingEvent = false;
            const nextNodes = nodes.map((node) => {
                if (node.id !== logicalSourceId) return node;

                const events = (node.data?.events || []).map((event) => {
                    const matchesEvent =
                        String(event?.id || "") === String(logicalSourceHandle);
                    const matchesOldTarget =
                        !event.target || String(event.target) === String(existingEdge.target || "");

                    if (updatedMatchingEvent || !matchesEvent || !matchesOldTarget) {
                        return event;
                    }

                    updatedMatchingEvent = true;
                    return {
                        ...event,
                        target: destinationNode.id,
                        selectedPackage: getSkillPackageName(
                            destinationNode.data?.fullSkillName
                        ),
                        selectedSkill:
                            destinationNode.data?.fullSkillName?.split("#")[0] ||
                            destinationNode.data?.label ||
                            "",
                    };
                });

                return updatedMatchingEvent
                    ? { ...node, data: { ...node.data, events } }
                    : node;
            });

            const nextEdges = edges.map((edge) =>
                edge.id === existingEdge.id
                    ? {
                          ...edge,
                          target: destinationNode.id,
                          targetHandle:
                              connection.targetHandle ||
                              getTransitionTargetHandleForNode(destinationNode),
                          data: {
                              ...(edge.data || {}),
                              editorTargetInstanceId:
                                  destinationNode.data?.editorInstanceId || "",
                          },
                      }
                    : edge
            );

            const normalized = rebuildBoundaryTransitionsIncremental(
                nextNodes,
                nextEdges,
                {
                    previousEdges: edges,
                    sourceKeys: [
                        {
                            sourceId: logicalSourceId,
                            sourceHandle: logicalSourceHandle,
                        },
                    ],
                }
            );

            setNodes(normalized.nodes);
            setEdges(normalized.edges);
            (normalized.affectedNodeIds || []).forEach((nodeId) =>
                requestAnimationFrame(() => updateNodeInternals(nodeId))
            );
            requestAnimationFrame(() => updateNodeInternals(destinationNode.id));
            void syncTransitionsForSource?.(logicalSourceId);
        },
        [
            edges,
            nodes,
            setEdges,
            setNodes,
            updateNodeInternals,
            syncTransitionsForSource,
            slotNodes,
            applySkillSlotConnection,
        ]
    );

    const onConnect = useCallback(
        (params) => {
            const sourceCompoundForInitial = nodes.find(
                (node) =>
                    node.id === params.source &&
                    node.type === "compound"
            );

            if (
                sourceCompoundForInitial &&
                params.sourceHandle === "compound-entry"
            ) {
                const sourceCompound = sourceCompoundForInitial;
                const targetNode = nodes.find(
                    (node) => node.id === params.target
                );

                if (
                    !targetNode ||
                    targetNode.parentId !== sourceCompound.id ||
                    !isCompoundInitialChildCandidate(targetNode)
                ) {
                    return;
                }

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        if (node.id === sourceCompound.id) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    initialChildId: targetNode.id,
                                    // The entry connector is not an exit token/event.
                                    // Clean up stale data from older editor versions.
                                    events: (node.data?.events || []).filter(
                                        (event) =>
                                            String(event?.id || "") !==
                                            "compound-entry"
                                    ),
                                },
                            };
                        }

                        if (node.parentId === sourceCompound.id) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    isInitial: node.id === targetNode.id,
                                },
                            };
                        }

                        return node;
                    })
                );

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceCompound.id);
                    updateNodeInternals(targetNode.id);
                });

                return;
            }

            if (params.targetHandle === "compound-entry") {
                return;
            }

            const sourceSlotHandle = parseSlotConnectionHandle(
                params.sourceHandle
            );
            const targetSlotHandle = parseSlotConnectionHandle(
                params.targetHandle
            );

            if (sourceSlotHandle || targetSlotHandle) {
                slotDebug("slot-edge: React Flow onConnect", {
                    source: params.source,
                    target: params.target,
                    sourceHandle: params.sourceHandle,
                    targetHandle: params.targetHandle,
                    sourceSlotHandle,
                    targetSlotHandle,
                });
                if (
                    !sourceSlotHandle ||
                    !targetSlotHandle ||
                    sourceSlotHandle.access !== targetSlotHandle.access ||
                    sourceSlotHandle.origin === targetSlotHandle.origin
                ) {
                    slotDebug("slot-edge: onConnect rejected handle pairing", {
                        sourceSlotHandle,
                        targetSlotHandle,
                    });
                    return;
                }

                const sourceIsSkill = sourceSlotHandle.origin === "skill";
                const skillHandle = sourceIsSkill
                    ? sourceSlotHandle
                    : targetSlotHandle;
                const skillNodeId = sourceIsSkill
                    ? params.source
                    : params.target;
                const slotNodeId = sourceIsSkill
                    ? params.target
                    : params.source;

                applySkillSlotConnection({
                    skillNodeId,
                    slotNodeId,
                    access: skillHandle.access,
                    slotIndex: skillHandle.slotIndex,
                });

                return;
            }

            const sourceNode = nodes.find(
                (n) => n.id === params.source
            );

            const targetNode = nodes.find(
                (n) => n.id === params.target
            );

            if (
                !sourceNode ||
                !targetNode ||
                sourceNode.data?.isSkillClone ||
                sourceNode.data?.isStateClone
            ) {
                return;
            }

            // Do not let a normal transition cross a compound/parallel entry
            // boundary and land directly on an interior state. The external
            // edge must terminate on the container's left entry handle first.
            if (
                !canTargetVisualNode(
                    sourceNode,
                    targetNode,
                    nodes
                )
            ) {
                return;
            }

            const semanticTargetNode = getSemanticTransitionTarget(
                targetNode,
                nodes
            );

            const boundarySource = getBoundarySourceEvent(
                sourceNode,
                params.sourceHandle,
                nodes
            );
            const logicalSourceNode =
                boundarySource?.logicalSourceNode || sourceNode;
            const logicalSourceId = logicalSourceNode.id;
            const logicalSourceHandle = String(
                boundarySource?.logicalHandle ||
                params.sourceHandle ||
                "success"
            );

            const exitedBoundarySteps = getExitedBoundarySteps(
                logicalSourceNode,
                semanticTargetNode,
                nodes
            );
            const currentBoundaryIndex = boundarySource
                ? exitedBoundarySteps.findIndex(
                    (step) => step.anchor.id === sourceNode.id
                )
                : -1;
            const boundaryStepsToCreate =
                currentBoundaryIndex >= 0
                    ? exitedBoundarySteps.slice(currentBoundaryIndex + 1)
                    : exitedBoundarySteps;

            const logicalDuplicate = edges.some((edge) =>
                !edge.data?.boundaryInternalEdge &&
                !edge.data?.compoundInternalEdge &&
                !edge.data?.parallelInternalEdge &&
                getLogicalEdgeSourceId(edge) === logicalSourceId &&
                String(getLogicalEdgeSourceHandle(edge)) === logicalSourceHandle &&
                edge.target === params.target
            );

            if (logicalDuplicate) {
                openConditionDrawer(
                    logicalSourceId,
                    logicalSourceHandle,
                    params.target
                );
                return;
            }

            // Any transition that crosses a Compound/Parallel boundary is
            // represented as a chain of display-only helper edges. The final
            // external edge keeps the original skill + exit token in metadata,
            // so drawing onward from a border point preserves skill.event.
            if (boundarySource || boundaryStepsToCreate.length > 0) {
                const baseName =
                    logicalSourceNode.data?.label ||
                    String(logicalSourceNode.data?.fullSkillName || "state")
                        .split("#")[0]
                        .split(".")
                        .pop();
                const exitLabel = `${baseName}.${logicalSourceHandle}`;
                const sharedExitId = String(
                    boundarySource?.event?.id ||
                    `${logicalSourceId}-${logicalSourceHandle}`
                );

                let currentVisualSourceId = sourceNode.id;
                let currentVisualSourceHandle =
                    params.sourceHandle || logicalSourceHandle;
                const helperEdges = [];
                const anchorUpdates = new Map();
                const crossedKinds = new Set();

                boundaryStepsToCreate.forEach((step) => {
                    crossedKinds.add(step.kind);
                    const exitId = sharedExitId;

                    helperEdges.push({
                        id:
                            `edge-internal-boundary-${logicalSourceId}-` +
                            `${logicalSourceHandle}-${step.anchor.id}-${crypto.randomUUID()}`,
                        source: currentVisualSourceId,
                        target: step.anchor.id,
                        sourceHandle: currentVisualSourceHandle,
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
                            boundaryOriginalSource: logicalSourceId,
                            boundaryOriginalSourceHandle: logicalSourceHandle,
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

                    anchorUpdates.set(step.anchor.id, {
                        kind: step.kind,
                        exitId,
                    });
                    currentVisualSourceId = step.anchor.id;
                    currentVisualSourceHandle = exitId;
                });

                // If the drag started from an already existing border point,
                // preserve which kinds of boundary have already been crossed.
                exitedBoundarySteps
                    .slice(0, Math.max(0, currentBoundaryIndex + 1))
                    .forEach((step) => crossedKinds.add(step.kind));

                const externalEdge = {
                    id:
                        `edge-${logicalSourceId}-${logicalSourceHandle}-` +
                        `${params.target}-${crypto.randomUUID()}`,
                    source: currentVisualSourceId,
                    target: params.target,
                    sourceHandle: currentVisualSourceHandle,
                    targetHandle: params.targetHandle,
                    label: logicalSourceHandle,
                    type: "smartTransition",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,
                        boundaryOriginalSource: logicalSourceId,
                        boundaryOriginalSourceHandle: logicalSourceHandle,
                        boundaryExitId: sharedExitId,
                        ...(crossedKinds.has("compound") || sourceNode.type === "compound"
                            ? {
                                compoundOriginalSource: logicalSourceId,
                                compoundOriginalSourceHandle: logicalSourceHandle,
                                compoundExitId: sharedExitId,
                            }
                            : {}),
                        ...(crossedKinds.has("parallel") || sourceNode.type === "parallelLane"
                            ? {
                                parallelOriginalSource: logicalSourceId,
                                parallelOriginalSourceHandle: logicalSourceHandle,
                                parallelExitId: sharedExitId,
                            }
                            : {}),
                    },
                };

                const nextEdges = [...edges, externalEdge, ...helperEdges];
                setEdges(nextEdges);

                setNodes((currentNodes) => {
                    const childRightByCompound = new Map();
                    return currentNodes.map((node) => {
                        if (node.id === logicalSourceId) {
                            const events = node.data?.events || [];
                            if (events.some((event) => String(event.id) === logicalSourceHandle)) {
                                return node;
                            }
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    events: [
                                        ...events,
                                        {
                                            id: logicalSourceHandle,
                                            selectedPackage: getSkillPackageName(
                                                targetNode?.data?.fullSkillName
                                            ),
                                            selectedSkill:
                                                targetNode?.data?.fullSkillName?.split("#")[0] || "",
                                            target: params.target,
                                            cond: "",
                                            assignments: [],
                                            assignLocation: "",
                                            assignExpr: "",
                                        },
                                    ],
                                },
                            };
                        }

                        const update = anchorUpdates.get(node.id);
                        if (!update) return node;

                        const currentEvents = (node.data?.events || []).filter(
                            (event) => String(event?.id || "") !== "compound-entry"
                        );
                        const existingIndex = currentEvents.findIndex(
                            (event) => String(event.id) === String(update.exitId)
                        );
                        const boundaryEvent = {
                            ...(existingIndex >= 0 ? currentEvents[existingIndex] : {}),
                            id: update.exitId,
                            name: exitLabel,
                            rawEvent: exitLabel,
                            target: params.target,
                            sourceNodeId: logicalSourceId,
                            transitionHandleId: logicalSourceHandle,
                        };
                        const nextEvents = existingIndex >= 0
                            ? currentEvents.map((event, index) =>
                                index === existingIndex ? boundaryEvent : event
                            )
                            : [...currentEvents, boundaryEvent];

                        if (node.type !== "compound") {
                            return {
                                ...node,
                                data: { ...node.data, events: nextEvents },
                            };
                        }

                        let childRight = childRightByCompound.get(node.id);
                        if (childRight === undefined) {
                            childRight = getCompoundChildrenRight(
                                node.id,
                                currentNodes
                            );
                            childRightByCompound.set(node.id, childRight);
                        }
                        const requiredWidth =
                            childRight +
                            COMPOUND_PADDING_X +
                            getCompoundExitGutterWidth(nextEvents);

                        return {
                            ...node,
                            style: {
                                ...node.style,
                                width: Math.max(
                                    Number(node.style?.width) || 320,
                                    requiredWidth
                                ),
                            },
                            data: { ...node.data, events: nextEvents },
                        };
                    });
                });

                requestAnimationFrame(() => {
                    anchorUpdates.forEach((_, nodeId) =>
                        updateNodeInternals(nodeId)
                    );
                });

                const outgoingFromHandle = nextEdges.filter(
                    (edge) =>
                        !edge.data?.boundaryInternalEdge &&
                        getLogicalEdgeSourceId(edge) === logicalSourceId &&
                        String(getLogicalEdgeSourceHandle(edge)) === logicalSourceHandle
                );
                if (outgoingFromHandle.length >= 2) {
                    openConditionDrawer(
                        logicalSourceId,
                        logicalSourceHandle,
                        params.target,
                        nextEdges
                    );
                }
                void syncTransitionsForSource?.(logicalSourceId);
                return;
            }

            // Container/lane semantics follow the real target. A skill clone
            // is only a visual endpoint and must not make a transition appear
            // to enter or leave a state boundary that its original does not.
            const sourceLane = getLaneForNode(
                sourceNode,
                nodes
            );

            const targetLane = getLaneForNode(
                semanticTargetNode,
                nodes
            );

            const leavesParallel =
                sourceLane &&
                (
                    !targetLane ||
                    targetLane.parentId !== sourceLane.parentId
                );

            const alreadyExists = edges.some((edge) => {
                const logicalSource =
                    edge.data?.compoundOriginalSource ||
                    edge.data?.parallelOriginalSource ||
                    edge.source;
                const logicalHandle =
                    edge.data?.compoundOriginalSourceHandle ||
                    edge.sourceHandle;

                return (
                    logicalSource === params.source &&
                    logicalHandle === params.sourceHandle &&
                    edge.target === params.target
                );
            });

            if (alreadyExists) {
                openConditionDrawer(params.source, params.sourceHandle, params.target);
                return;
            }

            const sourceCompound =
                getDirectCompoundForNode(
                    sourceNode,
                    nodes
                );

            const targetCompound =
                getDirectCompoundForNode(
                    semanticTargetNode,
                    nodes
                );

            const leavesCompound =
                sourceCompound &&
                (
                    !targetCompound ||
                    targetCompound.id !== sourceCompound.id
                );

            if (leavesCompound) {
                const handleId =
                    params.sourceHandle || "success";

                const baseName =
                    sourceNode.data?.label ||
                    sourceNode.data?.fullSkillName ||
                    "state";

                const exitLabel =
                    `${baseName}.${handleId}`;

                // Compound exit handles must be unique per child state.
                // Two children may both expose e.g. a "success" token.
                const compoundExitId =
                    `${params.source}-${handleId}`;

                const externalEdge = {
                    id:
                        `edge-compound-${params.source}-` +
                        `${handleId}-${params.target}-` +
                        crypto.randomUUID(),

                    source: sourceCompound.id,
                    target: params.target,

                    sourceHandle: compoundExitId,
                    targetHandle: params.targetHandle,

                    label: handleId,

                    type: "smartTransition",

                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },

                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,
                        compoundOriginalSource: params.source,
                        compoundOriginalSourceHandle: handleId,
                        compoundExitId,
                    },
                };

                const internalEdge = {
                    id:
                        `edge-internal-compound-${params.source}-` +
                        `${handleId}-${sourceCompound.id}-` +
                        crypto.randomUUID(),

                    source: params.source,
                    target: sourceCompound.id,
                    sourceHandle: handleId,
                    targetHandle: `target-${compoundExitId}`,
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
                };

                setEdges((currentEdges) => [
                    ...currentEdges,
                    externalEdge,
                    internalEdge,
                ]);

                setNodes((currentNodes) => {
                    const childRight = getCompoundChildrenRight(
                        sourceCompound.id,
                        currentNodes
                    );

                    return currentNodes.map((node) => {
                        if (node.id !== sourceCompound.id) {
                            return node;
                        }

                        const compoundEvents = (node.data?.events || []).filter(
                            (event) =>
                                String(event?.id || "") !== "compound-entry"
                        );

                        const alreadyExists = compoundEvents.some(
                            (event) =>
                                String(event.id) === String(compoundExitId)
                        );

                        const nextEvents = alreadyExists
                            ? compoundEvents
                            : [
                                ...compoundEvents,
                                {
                                    id: compoundExitId,
                                    name: exitLabel,
                                    rawEvent: exitLabel,
                                    target: params.target,
                                    sourceNodeId: params.source,
                                    transitionHandleId: handleId,
                                },
                            ];

                        const requiredWidth =
                            childRight +
                            COMPOUND_PADDING_X +
                            getCompoundExitGutterWidth(nextEvents);

                        return {
                            ...node,
                            style: {
                                ...node.style,
                                width: Math.max(
                                    Number(node.style?.width) || 320,
                                    requiredWidth
                                ),
                            },
                            data: {
                                ...node.data,
                                events: nextEvents,
                            },
                        };
                    });
                });

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceCompound.id);
                });

                void syncTransitionsForSource?.(params.source);
                return;
            }

            /*
             * =========================================================
             * TRANSITION VERLÄSST PARALLEL
             * =========================================================
             */
            if (leavesParallel) {
                const handleId =
                    params.sourceHandle || "success";

                /*
                 * Sichtbare äußere Transition:
                 *
                 * Nicht:
                 * State A -> State B
                 *
                 * sondern:
                 * Lane -> State B
                 *
                 * parallelOriginalSource merkt sich,
                 * welcher State eigentlich die Source ist.
                 */
                const externalEdge = {
                    id:
                        `edge-${params.source}-` +
                        `${handleId}-${params.target}-` +
                        crypto.randomUUID(),

                    source: sourceLane.id,
                    target: params.target,

                    sourceHandle: handleId,
                    targetHandle: params.targetHandle,

                    label: handleId,

                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },

                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,

                        // Der tatsächliche State bleibt hier gespeichert
                        parallelOriginalSource:
                        params.source,
                    },
                };

                /*
                 * Interne gestrichelte Verbindung:
                 *
                 * State A -> Lane-Rand
                 */
                const internalEdge = {
                    id:
                        `edge-internal-${params.source}-` +
                        `${handleId}-${sourceLane.id}-` +
                        crypto.randomUUID(),

                    source: params.source,
                    target: sourceLane.id,

                    sourceHandle: handleId,
                    targetHandle: `target-${handleId}`,

                    type: "smoothstep",

                    style: {
                        strokeDasharray: "4 4",
                        stroke: "#0284c7",
                        strokeWidth: 1.5,
                    },
                };

                setEdges((currentEdges) => [
                    ...currentEdges,
                    externalEdge,
                    internalEdge,
                ]);

                /*
                 * Die Lane braucht den Event/Handle ebenfalls,
                 * damit die äußere Transition sauber am Rand
                 * angezeigt werden kann.
                 */
                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        /*
                         * Event am ursprünglichen State ergänzen
                         */
                        if (node.id === params.source) {
                            const events =
                                node.data?.events || [];

                            const existingEvent =
                                events.find(
                                    (event) =>
                                        event.id === handleId
                                );

                            if (existingEvent) {
                                return node;
                            }

                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    events: [
                                        ...events,
                                        {
                                            id: handleId,

                                            selectedPackage:
                                                getSkillPackageName(
                                                    targetNode
                                                        ?.data
                                                        ?.fullSkillName
                                                ),

                                            selectedSkill:
                                                targetNode
                                                    ?.data
                                                    ?.fullSkillName
                                                    ?.split("#")[0] ||
                                                "",

                                            target:
                                            params.target,

                                            cond: "",

                                            assignments: [],

                                            assignLocation: "",
                                            assignExpr: "",
                                        },
                                    ],
                                },
                            };
                        }

                        /*
                         * Passenden Handle/Event an der Lane erzeugen
                         */
                        if (node.id === sourceLane.id) {
                            const laneEvents =
                                node.data?.events || [];

                            const alreadyHasEvent =
                                laneEvents.some(
                                    (event) =>
                                        event.id === handleId
                                );

                            if (alreadyHasEvent) {
                                return node;
                            }

                            const baseName =
                                sourceNode.data?.label ||
                                sourceNode.data
                                    ?.fullSkillName ||
                                "state";

                            return {
                                ...node,
                                data: {
                                    ...node.data,

                                    events: [
                                        ...laneEvents,
                                        {
                                            id: handleId,

                                            name:
                                                `${baseName}.` +
                                                handleId,

                                            rawEvent:
                                                `${baseName}.` +
                                                handleId,

                                            target:
                                            params.target,
                                        },
                                    ],
                                },
                            };
                        }

                        return node;
                    })
                );

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceLane.id);
                });

                /*
                 * Falls mehrere Transitions vom selben Event ausgehen,
                 * Condition Drawer öffnen.
                 */
                const outgoingFromHandle = [
                    ...edges,
                    externalEdge,
                ].filter((edge) => {
                    const logicalSource =
                        edge.data?.parallelOriginalSource ||
                        edge.source;

                    return (
                        logicalSource === params.source &&
                        edge.sourceHandle === handleId
                    );
                });

                if (outgoingFromHandle.length >= 2) {
                    openConditionDrawer(
                        params.source,
                        handleId,
                        params.target,
                        [
                            ...edges,
                            externalEdge,
                            internalEdge,
                        ]
                    );
                }

                void syncTransitionsForSource?.(params.source);
                return;
            }

            /*
             * =========================================================
             * NORMALE TRANSITION
             * =========================================================
             *
             * Source liegt nicht im Parallel oder Target befindet
             * sich im selben Parallel-State.
             */
            const newEdge = {
                id:
                    `edge-${params.source}-` +
                    `${params.sourceHandle}-` +
                    `${params.target}-` +
                    crypto.randomUUID(),

                source: params.source,
                target: params.target,

                sourceHandle:
                params.sourceHandle,

                targetHandle:
                params.targetHandle,

                label:
                params.sourceHandle,

                type: "smartTransition",
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                },

                data: {
                    cond: "",
                    assignments: [],
                    assign: null,
                    ...(params.source === params.target
                        ? { controlPoints: makeSelfLoopControlPoints() }
                        : {}),
                },
            };

            const updatedEdges = [
                ...edges,
                newEdge,
            ];

            setEdges(updatedEdges);

            /*
             * Event am Source-State aktualisieren
             */
            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (node.id !== params.source) {
                        return node;
                    }

                    const events =
                        node.data?.events || [];

                    const existingEvent =
                        events.find(
                            (event) =>
                                event.id ===
                                params.sourceHandle
                        );

                    if (existingEvent) {
                        return node;
                    }

                    return {
                        ...node,
                        data: {
                            ...node.data,

                            events: [
                                ...events,
                                {
                                    id:
                                    params.sourceHandle,

                                    selectedPackage:
                                        getSkillPackageName(
                                            targetNode
                                                ?.data
                                                ?.fullSkillName
                                        ),

                                    selectedSkill:
                                        targetNode
                                            ?.data
                                            ?.fullSkillName
                                            ?.split("#")[0] ||
                                        "",

                                    target:
                                    params.target,

                                    cond: "",
                                    assignments: [],
                                    assignLocation: "",
                                    assignExpr: "",
                                },
                            ],
                        },
                    };
                })
            );

            const outgoingFromHandle =
                updatedEdges.filter(
                    (edge) =>
                        edge.source ===
                        params.source &&
                        edge.sourceHandle ===
                        params.sourceHandle
                );

            if (outgoingFromHandle.length >= 2) {
                openConditionDrawer(
                    params.source,
                    params.sourceHandle,
                    params.target,
                    updatedEdges
                );
            }
            void syncTransitionsForSource?.(params.source);
        },
        [
            edges,
            nodes,
            slotNodes,
            setEdges,
            setNodes,
            setSlotEdges,
            updateNodeInternals,
            syncTransitionsForSource,
            applySkillSlotConnection,
        ]
    );

    const onEdgeDoubleClick = useCallback(
        (event, edge) => {
            selectTransitionEdge(edge.id);
            openConditionDrawer(
                getLogicalEdgeSourceId(edge),
                getLogicalEdgeSourceHandle(edge),
                edge.target
            );
        },
        [edges, nodes, selectTransitionEdge]
    );

    const handleConfirmDrawer = ({ updatedTransitions, newGlobalVars = [], newGlobalVar = null }) => {
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



    return {
        drawerData,
        setDrawerData,
        slotConnectionDrag,
        openConditionDrawer,
        isValidConnection,
        handleConnectStart,
        handleConnectEnd,
        handleReconnectStart,
        handleReconnectEnd,
        onReconnect,
        onConnect,
        onEdgeDoubleClick,
        handleConfirmDrawer,
    };
}
