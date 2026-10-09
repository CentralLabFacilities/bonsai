import { useCallback, useLayoutEffect, useRef } from "react";
import { isSlotEdge } from "../../../utils/editorGraph";
import { getForwardingNopScxmlStateId } from "../../../utils/editorScxml";
import { validateParameterValue } from "../../../utils/valueValidation.js";

const getParameterNodeIdentity = (node) => [
    node.type,
    node.data?.fullSkillName,
    node.data?.src,
    node.data?.isSkillClone,
    node.data?.isStateClone,
    node.data?.cloneOfNodeId,
    node.data?.scxmlStateId,
];

/**
 * Persistent state/skill property mutations used by DetailsPanel.
 *
 * Keep these operations out of App.jsx so panels describe intent instead of
 * knowing the React Flow document shape. Visual-only concerns such as
 * centering, drawers, and hover state remain in the UI controllers.
 */
export function useEditorNodeDataActions({
    nodes,
    getDocumentSnapshot,
    getActiveDocumentIdentity,
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
    const parameterCallbacksRef = useRef(null);
    const committedParameterListsRef = useRef(new WeakSet());
    useLayoutEffect(() => {
        parameterCallbacksRef.current = {
            nodes, getDocumentSnapshot, getActiveDocumentIdentity, valueVariables,
            setNodes, syncStateParameters, updateEventsFromParameters,
        };
    });

    const getNodeParameterEditSource = useCallback((nodeId, parameterKey) => {
        const current = parameterCallbacksRef.current;
        const liveNodes = current.getDocumentSnapshot?.().nodes || current.nodes;
        const node = liveNodes.find((candidate) => candidate.id === nodeId);
        if (!node || !node.data?.params?.some((parameter) => parameter.key === parameterKey)) return null;
        return {
            nodeId,
            parameterKey,
            nodeIdentity: getParameterNodeIdentity(node),
            documentIdentity: current.getActiveDocumentIdentity?.() || null,
        };
    }, []);

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
        (nodeId, parameterIndex, expression, commit = false, source = undefined) => {
            const current = parameterCallbacksRef.current;
            const document = current.getDocumentSnapshot?.();
            const liveNodes = document?.nodes || current.nodes;
            const sourceNode = liveNodes.find((node) => node.id === nodeId);
            if (!sourceNode) return null;
            if (source === null || (source && (
                source.nodeId !== nodeId ||
                source.documentIdentity !== (current.getActiveDocumentIdentity?.() || null) ||
                !Array.isArray(source.nodeIdentity) ||
                !getParameterNodeIdentity(sourceNode).every((value, index) => Object.is(value, source.nodeIdentity[index]))
            ))) return null;

            const parameters = sourceNode.data?.params || [];
            // A focused row keeps its key even if a configuration response
            // reorders the list before blur. Ambiguous duplicate keys cannot
            // safely identify that row after a reorder.
            const targetIndex = source
                ? parameters.findIndex((parameter) => parameter.key === source.parameterKey)
                : parameterIndex;
            if (source && parameters.filter((parameter) => parameter.key === source.parameterKey).length !== 1) return null;
            const parameter = parameters[targetIndex];
            if (!parameter) return null;

            const seen = new Set();
            const variables = document?.globalDataModel || document?.inheritedGlobalDataModel
                ? [...(document.inheritedGlobalDataModel || []), ...(document.globalDataModel || [])].filter((variable) => {
                    if (!variable?.id || seen.has(variable.id)) return false;
                    seen.add(variable.id);
                    return true;
                })
                : current.valueVariables;

            // This action is the write boundary for parameter values. UI
            // editors may validate earlier for feedback, but every semantic
            // write is checked again here before it can reach graph state or
            // the Rust document. Carry raw UI input in the transient edit source
            // so string quoting is applied once, not once per validation layer.
            const validation = validateParameterValue(
                parameter,
                source?.inputValue ?? expression,
                variables,
                { allowEmpty: true }
            );
            if (!validation.valid) return null;
            const unchanged = Object.is(parameter.expr, validation.value);
            if (unchanged && (!commit || committedParameterListsRef.current.has(parameters))) return parameters;

            const nextParameters = unchanged ? parameters : parameters.map((currentParameter, index) =>
                index === targetIndex
                    ? { ...currentParameter, expr: validation.value }
                    : currentParameter
            );

            // Only this row is being written. Imported invalid siblings must
            // neither veto a correction/reset nor get silently normalized.
            if (!unchanged) current.setNodes(
                liveNodes.map((node) =>
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

            if (commit) {
                committedParameterListsRef.current.add(nextParameters);
                void current.syncStateParameters?.(nodeId, nextParameters);
                void current.updateEventsFromParameters?.(
                    nodeId,
                    nextParameters
                );
            } else if (String(validation.value ?? "").trim() === "") {
                // Optional parameters affect dynamic slot/event definitions as
                // soon as they are cleared, matching the previous behavior.
                void current.updateEventsFromParameters?.(
                    nodeId,
                    nextParameters
                );
            }

            return nextParameters;
        },
        []
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
        getNodeParameterEditSource,
        updateNodeParameter,
        updateStateActions,
        updateSendEvents,
        updateSkillSlotPath,
    };
}
