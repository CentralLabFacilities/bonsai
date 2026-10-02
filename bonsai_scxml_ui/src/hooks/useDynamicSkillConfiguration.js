import { useCallback, useRef } from "react";

import { normalizeSlotType } from "../utils/editorGraph";

const reconcileDynamicSlots = (currentSlots = [], requestedSlots = []) =>
    (Array.isArray(requestedSlots) ? requestedSlots : []).map((requestedSlot) => {
        const existingSlot = (currentSlots || []).find(
            (slot) =>
                slot?.key === requestedSlot?.key &&
                normalizeSlotType(slot?.type) === normalizeSlotType(requestedSlot?.type)
        );

        return {
            ...requestedSlot,
            key: requestedSlot?.key || "",
            type: requestedSlot?.type || "Unknown",
            description:
                requestedSlot?.description ?? existingSlot?.description ?? "",
            // Keep a user's existing connection when the same request is
            // still exposed. Newly exposed requests deliberately start
            // without a path and therefore show up as unconnected slots.
            path: existingSlot?.path || "",
            inherited: existingSlot?.inherited || null,
        };
    });

const reconcileDynamicParameters = (currentParams = [], requestedParams = []) =>
    (Array.isArray(requestedParams) ? requestedParams : []).map(
        (requestedParam) => {
            const existingParam = (currentParams || []).find(
                (param) => param?.key === requestedParam?.key
            );

            return {
                ...requestedParam,
                key: requestedParam?.key || "",
                type: requestedParam?.type || existingParam?.type || "Unknown",
                required: Boolean(requestedParam?.required),
                default: requestedParam?.default,
                description:
                    requestedParam?.description ?? existingParam?.description ?? "",
                // Parameter requests can depend on other parameter values.
                // Keep the value the user already entered when a parameter
                // is still requested, while newly requested parameters start
                // empty and parameters no longer requested disappear.
                expr: existingParam?.expr ?? "",
            };
        }
    );

/**
 * Keeps a skill node in sync with the parameterized Bonsai skill definition.
 *
 * Parameter changes can alter exit events, requested slots, parameters, and
 * sensor/actuator metadata. This hook owns that asynchronous reconciliation
 * and discards stale API responses when the user edits a skill repeatedly.
 */
export function useDynamicSkillConfiguration({
    nodes,
    setNodes,
    fetchSkillData,
    checkSlotConnection,
    syncStateConfigurationAfterCommit,
}) {
    const requestVersionsRef = useRef(new Map());

    const updateEventsFromParameters = useCallback(
        async (nodeId, parameterOverride = null) => {
            const node = nodes.find((candidate) => candidate.id === nodeId);
            if (!node) return;

            const fullSkillName = String(node.data?.fullSkillName || "").split("#")[0];
            if (!fullSkillName) return;

            const params = {};
            const parameterList = Array.isArray(parameterOverride)
                ? parameterOverride
                : node.data?.params || [];

            parameterList.forEach((param) => {
                if (!param?.key) return;

                // An empty editor field means that the parameter is not supplied
                // to the skill. This matters for skills whose slot requests are
                // conditional on the presence of an optional parameter.
                const expr = param.expr;
                if (
                    expr === undefined ||
                    expr === null ||
                    String(expr).trim() === ""
                ) {
                    return;
                }

                params[param.key] = expr;
            });

            const requestVersions = requestVersionsRef.current;
            const requestVersion = (requestVersions.get(nodeId) || 0) + 1;
            requestVersions.set(nodeId, requestVersion);

            try {
                const data = await fetchSkillData(fullSkillName, params);
                if (!data) return;

                // If a newer edit was sent while this request was in flight,
                // ignore the stale response so old slot requests cannot
                // overwrite a newer skill configuration.
                if (requestVersions.get(nodeId) !== requestVersion) return;

                setNodes((currentNodes) => {
                    const currentNode = currentNodes.find(
                        (candidate) => candidate.id === nodeId
                    );
                    if (!currentNode) return currentNodes;

                    let nextEvents = currentNode.data?.events || [];
                    if (Array.isArray(data.events)) {
                        const previousEvents = new Map(
                            (currentNode.data?.events || []).map((event) => [
                                event.id,
                                event,
                            ])
                        );

                        const configuredEvents = data.events.map((event) => {
                            const existing = previousEvents.get(event.event);
                            return {
                                ...(existing || {}),
                                id: event.event,
                                description: event.description || "",
                                selectedPackage: existing?.selectedPackage || "",
                                selectedSkill: existing?.selectedSkill || "",
                                target: existing?.target ?? null,
                                cond: existing?.cond || "",
                                assignments: existing?.assignments || [],
                                assignLocation: existing?.assignLocation || "",
                                assignExpr: existing?.assignExpr || "",
                            };
                        });

                        const appendBuiltInEvent = (eventId) => {
                            if (
                                configuredEvents.some(
                                    (event) => event.id === eventId
                                )
                            ) {
                                return;
                            }

                            const existing = previousEvents.get(eventId);
                            configuredEvents.push({
                                ...(existing || {}),
                                id: eventId,
                                selectedPackage: existing?.selectedPackage || "",
                                selectedSkill: existing?.selectedSkill || "",
                                target: existing?.target ?? null,
                                cond: existing?.cond || "",
                                assignments: existing?.assignments || [],
                                assignLocation: existing?.assignLocation || "",
                                assignExpr: existing?.assignExpr || "",
                            });
                        };

                        appendBuiltInEvent("fatal");
                        appendBuiltInEvent("*");
                        nextEvents = configuredEvents;
                    }

                    const nextInSlots =
                        data.inSlots !== undefined
                            ? reconcileDynamicSlots(
                                  currentNode.data?.inSlots || [],
                                  data.inSlots
                              )
                            : currentNode.data?.inSlots || [];

                    const nextOutSlots =
                        data.outSlots !== undefined
                            ? reconcileDynamicSlots(
                                  currentNode.data?.outSlots || [],
                                  data.outSlots
                              )
                            : currentNode.data?.outSlots || [];

                    const nextParams =
                        data.params !== undefined
                            ? reconcileDynamicParameters(
                                  currentNode.data?.params || [],
                                  data.params
                              )
                            : currentNode.data?.params || [];

                    const updatedNodes = currentNodes.map((candidate) => {
                        if (candidate.id !== nodeId) return candidate;

                        return {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: nextEvents,
                                sensors:
                                    data.sensors !== undefined
                                        ? data.sensors
                                        : candidate.data?.sensors || [],
                                actuators:
                                    data.actuator !== undefined
                                        ? data.actuator
                                        : data.actuators !== undefined
                                          ? data.actuators
                                          : candidate.data?.actuators || [],
                                inSlots: nextInSlots,
                                outSlots: nextOutSlots,
                                params: nextParams,
                            },
                        };
                    });

                    // Slot nodes/edges are derived from skill requests. Rebuild
                    // them after the node update so newly exposed requests
                    // appear and removed requests disappear immediately.
                    window.requestAnimationFrame(() =>
                        checkSlotConnection(updatedNodes)
                    );

                    return updatedNodes;
                });

                void syncStateConfigurationAfterCommit(nodeId);
            } catch (error) {
                console.error("Error updating skill from parameters:", error);
            }
        },
        [
            nodes,
            setNodes,
            fetchSkillData,
            checkSlotConnection,
            syncStateConfigurationAfterCommit,
        ]
    );

    return {
        updateEventsFromParameters,
    };
}
