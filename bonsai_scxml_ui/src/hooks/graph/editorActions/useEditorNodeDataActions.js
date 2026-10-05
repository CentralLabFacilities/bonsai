import { useCallback } from "react";
import { isSlotEdge } from "../../../utils/editorGraph";
import { getForwardingNopScxmlStateId } from "../../../utils/editorScxml";
import {
    validateParameterList,
    validateParameterValue,
} from "../../../utils/valueValidation.js";

/**
 * Persistent state/skill property mutations used by DetailsPanel.
 *
 * Keep these operations out of App.jsx so panels describe intent instead of
 * knowing the React Flow document shape. Visual-only concerns such as
 * centering, drawers, and hover state remain in the UI controllers.
 */
export function useEditorNodeDataActions({
    nodes,
    valueVariables = [],
    setNodes,
    setEdges,
    checkSlotConnection,
    applyWorkflowCommand,
    syncStateEditorPositions,
    syncStateParameters,
    syncSlotsAfterCommit,
    updateEventsFromParameters,
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
                // The editor exporter falls back to the stable node id when a
                // container label is empty. Express the same canonical identity
                // directly in Rust instead of replacing the full workflow.
                void applyWorkflowCommand?.({
                    type: "renameState",
                    stateId: nodeId,
                    scxmlId: cleanName || nodeId,
                    label: cleanName,
                    fullSkillName: cleanName,
                });
                return;
            }

            const fullSkillName = String(sourceNode.data?.fullSkillName || "");
            const baseSkillName = fullSkillName.split("#")[0] || String(sourceNode.data?.label || "");
            const skillType = baseSkillName.split(".").pop().toLowerCase();

            // For Nop/Fatal/End this field is an editor-only instance id used
            // to disambiguate visual references. Only the persisted editor
            // positions change; the semantic state identity stays untouched.
            if (["nop", "fatal", "end"].includes(skillType)) {
                void syncStateEditorPositions?.(nodeId);
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
            syncStateEditorPositions,
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
        (nodeId, parameterIndex, expression, commit = false) => {
            const sourceNode = nodes.find((node) => node.id === nodeId);
            if (!sourceNode) return null;

            const parameters = sourceNode.data?.params || [];
            const parameter = parameters[parameterIndex];
            if (!parameter) return null;

            // This action is the write boundary for parameter values. UI
            // editors may validate earlier for feedback, but every semantic
            // write is checked again here before it can reach graph state or
            // the Rust document.
            const validation = validateParameterValue(
                parameter,
                expression,
                valueVariables,
                { allowEmpty: true }
            );
            if (!validation.valid) return null;

            const nextParameters = parameters.map((currentParameter, index) =>
                index === parameterIndex
                    ? { ...currentParameter, expr: validation.value }
                    : currentParameter
            );

            const listValidation = validateParameterList(
                nextParameters,
                valueVariables,
                { allowEmpty: true }
            );
            if (!listValidation.valid) return null;

            const normalizedParameters = listValidation.parameters;
            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.id === nodeId
                        ? {
                              ...node,
                              data: {
                                  ...(node.data || {}),
                                  params: normalizedParameters,
                              },
                          }
                        : node
                )
            );

            if (commit) {
                void syncStateParameters?.(nodeId, normalizedParameters);
                void updateEventsFromParameters?.(
                    nodeId,
                    normalizedParameters
                );
            } else if (String(validation.value ?? "").trim() === "") {
                // Optional parameters affect dynamic slot/event definitions as
                // soon as they are cleared, matching the previous behavior.
                void updateEventsFromParameters?.(
                    nodeId,
                    normalizedParameters
                );
            }

            return normalizedParameters;
        },
        [
            nodes,
            setNodes,
            valueVariables,
            syncStateParameters,
            updateEventsFromParameters,
        ]
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
        updateStateActions,
        updateSendEvents,
        updateSkillSlotPath,
    };
}
