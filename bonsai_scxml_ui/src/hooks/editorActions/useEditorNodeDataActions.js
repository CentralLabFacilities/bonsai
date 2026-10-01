import { useCallback } from "react";
import { isSlotEdge } from "../../utils/editorGraph";
import { getForwardingNopScxmlStateId } from "../../utils/editorScxml";

/**
 * Persistent state/skill property mutations used by DetailsPanel.
 *
 * Keep these operations out of App.jsx so panels describe intent instead of
 * knowing the React Flow document shape. Visual-only concerns such as
 * centering, drawers, and hover state remain in the UI controllers.
 */
export function useEditorNodeDataActions({
    nodes,
    setNodes,
    setEdges,
    checkSlotConnection,
    applyWorkflowCommand,
    syncEditorStateAfterCommit,
    syncStateParameters,
    syncSlotsAfterCommit,
}) {
    const updateNodeName = useCallback(
        (nodeId, name, commit = false) => {
            if (!nodeId) return;

            const sourceNode = nodes.find((node) => node.id === nodeId);
            if (!sourceNode) return;

            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (node.id !== nodeId) return node;

                    const isContainerOrSub =
                        node.type === "compound" ||
                        node.type === "parallel" ||
                        node.type === "submachine";

                    if (isContainerOrSub) {
                        return {
                            ...node,
                            data: {
                                ...(node.data || {}),
                                label: name,
                                fullSkillName: name,
                            },
                        };
                    }

                    const skillType = String(node.data?.fullSkillName || "")
                        .split("#")[0]
                        .split(".")
                        .pop()
                        .toLowerCase();

                    // End, Fatal and forwarding Nop clones use an editor-only
                    // instance ID. Renaming the instance must not mutate the
                    // underlying skill identity.
                    if (["nop", "fatal", "end"].includes(skillType)) {
                        return {
                            ...node,
                            data: {
                                ...(node.data || {}),
                                editorInstanceId: name,
                                fullSkillName:
                                    node.data?.fullSkillName?.split("#")[0] ||
                                    node.data?.fullSkillName,
                            },
                        };
                    }

                    const baseSkillName =
                        node.data?.fullSkillName?.split("#")[0] ||
                        node.data?.label ||
                        "";
                    const nextInstanceId = String(name || "").trim();

                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            fullSkillName: nextInstanceId
                                ? `${baseSkillName}#${nextInstanceId}`
                                : baseSkillName,
                        },
                    };
                })
            );

            if (!commit) return;

            const cleanName = String(name || "").trim();
            const isContainerOrSub =
                sourceNode.type === "compound" ||
                sourceNode.type === "parallel" ||
                sourceNode.type === "submachine";

            if (isContainerOrSub) {
                if (!cleanName) {
                    void syncEditorStateAfterCommit?.();
                    return;
                }
                void applyWorkflowCommand?.({
                    type: "renameState",
                    stateId: nodeId,
                    scxmlId: cleanName,
                    label: cleanName,
                    fullSkillName: cleanName,
                });
                return;
            }

            const fullSkillName = String(sourceNode.data?.fullSkillName || "");
            const baseSkillName = fullSkillName.split("#")[0] || String(sourceNode.data?.label || "");
            const skillType = baseSkillName.split(".").pop().toLowerCase();

            // For Nop/Fatal/End this field is an editor-only instance id used
            // to disambiguate visual references. It lives in editor metadata,
            // so refresh the semantic projection instead of renaming the SCXML state.
            if (["nop", "fatal", "end"].includes(skillType)) {
                void syncEditorStateAfterCommit?.();
                return;
            }

            const nextFullSkillName = cleanName
                ? `${baseSkillName}#${cleanName}`
                : baseSkillName;
            void applyWorkflowCommand?.({
                type: "renameState",
                stateId: nodeId,
                scxmlId: nextFullSkillName,
                label: null,
                fullSkillName: nextFullSkillName,
            });
        },
        [
            nodes,
            setNodes,
            applyWorkflowCommand,
            syncEditorStateAfterCommit,
        ]
    );

    const updateNodeSource = useCallback(
        (nodeId, source, commit = false) => {
            if (!nodeId) return;
            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.id === nodeId
                        ? {
                              ...node,
                              data: {
                                  ...(node.data || {}),
                                  src: source,
                              },
                          }
                        : node
                )
            );

            if (commit) {
                void applyWorkflowCommand?.({
                    type: "setStateSource",
                    stateId: nodeId,
                    source: String(source || "").trim() || null,
                });
            }
        },
        [setNodes, applyWorkflowCommand]
    );

    const updateNodeParameter = useCallback(
        (nodeId, parameterIndex, expression) => {
            const sourceNode = nodes.find((node) => node.id === nodeId);
            if (!sourceNode) return null;

            const nextParameters = (sourceNode.data?.params || []).map(
                (parameter, index) =>
                    index === parameterIndex
                        ? { ...parameter, expr: expression }
                        : parameter
            );

            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.id === nodeId
                        ? {
                              ...node,
                              data: {
                                  ...(node.data || {}),
                                  params: nextParameters,
                              },
                          }
                        : node
                )
            );

            return nextParameters;
        },
        [nodes, setNodes]
    );

    const commitNodeParameters = useCallback(
        (nodeId, parameterOverride = null) => {
            if (!nodeId) return;
            const node = nodes.find((candidate) => candidate.id === nodeId);
            if (!node && !Array.isArray(parameterOverride)) return;
            void syncStateParameters?.(
                nodeId,
                Array.isArray(parameterOverride)
                    ? parameterOverride
                    : node?.data?.params || []
            );
        },
        [nodes, syncStateParameters]
    );

    const updateStateActions = useCallback(
        (nodeId, actionType, assignments) => {
            if (!nodeId || !actionType) return;
            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.id === nodeId
                        ? {
                              ...node,
                              data: {
                                  ...(node.data || {}),
                                  [actionType]: assignments,
                              },
                          }
                        : node
                )
            );
        },
        [setNodes]
    );

    const updateSendEvents = useCallback(
        (nodeId, events) => {
            const sourceNode = nodes.find((node) => node.id === nodeId);
            if (!sourceNode) return;

            const nextEvent = Array.isArray(events)
                ? String(events[0] ?? "")
                : "";
            const nextEvents = nextEvent ? [nextEvent] : [];
            const nonEmptyEvents = nextEvent.trim()
                ? [nextEvent.trim()]
                : [];
            const currentTransitions = Array.isArray(
                sourceNode.data?.behaviorExitTransitions
            )
                ? sourceNode.data.behaviorExitTransitions
                : [];
            const triggerEvent =
                currentTransitions[0]?.triggerEvent || "Nop.fatal";
            const sharedScxmlStateId = String(
                sourceNode.data?.scxmlStateId ||
                    sourceNode.data?.behaviorExitScxmlStateId ||
                    ""
            ).trim();

            const isSameSharedNop = (node) => {
                if (node.type !== "custom") return false;
                const baseName = String(node.data?.fullSkillName || "")
                    .split("#")[0]
                    .split(".")
                    .pop()
                    .toLowerCase();
                if (baseName !== "nop") return false;
                if (!sharedScxmlStateId) return node.id === nodeId;

                const candidateSharedId = String(
                    node.data?.scxmlStateId ||
                        node.data?.behaviorExitScxmlStateId ||
                        ""
                ).trim();
                return candidateSharedId === sharedScxmlStateId;
            };

            const sharedNopIds = new Set(
                nodes.filter(isSameSharedNop).map((node) => node.id)
            );

            // A forwarding Nop cannot simultaneously keep ordinary outgoing
            // SCXML transitions. Slot edges are unrelated and stay intact.
            if (nonEmptyEvents.length > 0) {
                setEdges((currentEdges) =>
                    currentEdges.filter(
                        (edge) =>
                            !sharedNopIds.has(edge.source) || isSlotEdge(edge)
                    )
                );
            }

            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (!isSameSharedNop(node)) return node;

                    const clearedEvents =
                        nonEmptyEvents.length > 0
                            ? (node.data?.events || []).map((event) => ({
                                  ...event,
                                  target: null,
                                  cond: "",
                                  assignments: [],
                                  assign: null,
                                  assignLocation: "",
                                  assignExpr: "",
                                  selectedPackage: "",
                                  selectedSkill: "",
                              }))
                            : node.data?.events;

                    const forwardingIdentity =
                        nextEvents.length > 0
                            ? (() => {
                                  const nextScxmlStateId =
                                      getForwardingNopScxmlStateId(
                                          node,
                                          nextEvents[0]
                                      );
                                  return {
                                      behaviorExitScxmlStateId:
                                          nextScxmlStateId,
                                      scxmlStateId: nextScxmlStateId,
                                  };
                              })()
                            : {};

                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            ...(nonEmptyEvents.length > 0
                                ? { events: clearedEvents, onEntry: [], onExit: [] }
                                : {}),
                            isBehaviorExit: nextEvents.length > 0,
                            behaviorExitEvents: nextEvents,
                            behaviorExitTransitions:
                                nextEvents.length > 0
                                    ? [
                                          {
                                              triggerEvent,
                                              sendEvents: nextEvents,
                                          },
                                      ]
                                    : [],
                            label:
                                nonEmptyEvents.length > 0
                                    ? nonEmptyEvents.join(", ")
                                    : "Nop",
                            ...forwardingIdentity,
                        },
                    };
                })
            );
        },
        [nodes, setNodes, setEdges]
    );

    const updateSkillSlotPath = useCallback(
        (nodeId, access, slotIndex, path, commit = false) => {
            if (!nodeId || !["read", "write"].includes(access)) return;
            const key = access === "read" ? "inSlots" : "outSlots";

            setNodes((currentNodes) => {
                const updatedNodes = currentNodes.map((node) => {
                    if (node.id !== nodeId) return node;
                    const slots = Array.isArray(node.data?.[key])
                        ? node.data[key]
                        : [];

                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            [key]: slots.map((slot, index) =>
                                index === slotIndex
                                    ? { ...slot, path }
                                    : slot
                            ),
                        },
                    };
                });

                if (commit) {
                    requestAnimationFrame(() =>
                        checkSlotConnection(updatedNodes)
                    );
                    void syncSlotsAfterCommit?.();
                }

                return updatedNodes;
            });
        },
        [setNodes, checkSlotConnection, syncSlotsAfterCommit]
    );

    return {
        updateNodeName,
        updateNodeSource,
        updateNodeParameter,
        commitNodeParameters,
        updateStateActions,
        updateSendEvents,
        updateSkillSlotPath,
    };
}
