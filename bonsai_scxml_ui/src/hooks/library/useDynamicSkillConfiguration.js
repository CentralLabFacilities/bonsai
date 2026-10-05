import { useCallback, useLayoutEffect, useRef } from "react";

import { normalizeSlotType } from "../../utils/editorGraph.js";

const reconcileDynamicSlots = (currentSlots = [], requestedSlots = []) => {
    const slotsByKey = new Map();
    for (const slot of currentSlots || []) {
        const key = slot?.key;
        // Map uses SameValueZero, whereas the original lookup used ===.
        if (Number.isNaN(key)) continue;
        const type = normalizeSlotType(slot?.type);
        let slotsByType = slotsByKey.get(key);
        if (!slotsByType) {
            slotsByType = new Map();
            slotsByKey.set(key, slotsByType);
        }
        if (!slotsByType.has(type)) slotsByType.set(type, slot);
    }

    return (Array.isArray(requestedSlots) ? requestedSlots : []).map((requestedSlot) => {
        const existingSlot = slotsByKey
            .get(requestedSlot?.key)
            ?.get(normalizeSlotType(requestedSlot?.type));

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
};

const reconcileDynamicParameters = (currentParams = [], requestedParams = []) => {
    const paramsByKey = new Map();
    for (const param of currentParams || []) {
        const key = param?.key;
        if (!Number.isNaN(key) && !paramsByKey.has(key)) paramsByKey.set(key, param);
    }
    return (Array.isArray(requestedParams) ? requestedParams : []).map(
        (requestedParam) => {
            const existingParam = paramsByKey.get(requestedParam?.key);

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
};

const getConsumedParameters = (parameterList = []) => {
    const params = {};
    parameterList.forEach((param) => {
        if (!param?.key) return;
        const expr = param.expr;
        // Empty editor fields are omitted, not supplied as defaults.
        if (expr === undefined || expr === null || String(expr).trim() === "") return;
        params[param.key] = expr;
    });
    return params;
};

const getParameterSnapshot = (params) =>
    new Map(Object.entries(params).map(([key, value]) => {
        // Match useSkillDefinitions' API normalization, not editor formatting.
        if (typeof value !== "string") return [key, value];
        const trimmed = value.trim();
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        const normalized = trimmed.length >= 2 && (first === "\"" || first === "'") && last === first
            ? trimmed.slice(1, -1).replace(/\\([\\'"])/g, "$1")
            : trimmed;
        return [key, normalized];
    }));

const parametersMatch = (expected, parameterList) => {
    const current = getParameterSnapshot(getConsumedParameters(parameterList));
    return expected.size === current.size && [...expected].every(
        ([key, value]) => current.has(key) && Object.is(current.get(key), value),
    );
};

const getNodeIdentity = (node) => [
    node.type,
    node.data?.fullSkillName,
    node.data?.src,
    node.data?.isSkillClone,
    node.data?.isStateClone,
    node.data?.cloneOfNodeId,
    node.data?.scxmlStateId,
];

/**
 * Keeps a skill node in sync with the parameterized Bonsai skill definition.
 *
 * Parameter changes can alter exit events, requested slots, parameters, and
 * sensor/actuator metadata. This hook owns that asynchronous reconciliation
 * and discards stale API responses when the user edits a skill repeatedly.
 */
export function useDynamicSkillConfiguration({
    getDocumentSnapshot,
    getActiveDocumentIdentity,
    setNodes,
    fetchSkillData,
    checkSlotConnection,
    syncStateConfigurationAfterCommit,
}) {
    const requestVersionsRef = useRef(new Map());
    const requestSequenceRef = useRef(0);
    const mountedRef = useRef(false);
    const pendingSlotsRef = useRef(new Map());
    const slotFrameRef = useRef(null);
    const callbacksRef = useRef(null);

    useLayoutEffect(() => {
        callbacksRef.current = { checkSlotConnection, syncStateConfigurationAfterCommit };
    }, [checkSlotConnection, syncStateConfigurationAfterCommit]);

    useLayoutEffect(() => {
        mountedRef.current = true;
        const requestVersions = requestVersionsRef.current;
        const pendingSlots = pendingSlotsRef.current;
        return () => {
            mountedRef.current = false;
            requestVersions.clear();
            pendingSlots.clear();
            const frame = slotFrameRef.current;
            slotFrameRef.current = null;
            if (frame) window.cancelAnimationFrame(frame.id);
            // Never reset the sequence: effect replay must not revive old requests.
        };
    }, []);

    const isCurrentRequest = useCallback((request, node) =>
        mountedRef.current &&
        requestVersionsRef.current.get(request.nodeId) === request.version &&
        getActiveDocumentIdentity() === request.documentIdentity &&
        Boolean(node) &&
        getNodeIdentity(node).every((value, index) => Object.is(value, request.nodeIdentity[index])) &&
        parametersMatch(request.parameters, node.data?.params || []),
    [getActiveDocumentIdentity]);

    const scheduleSlotRebuild = useCallback((request) => {
        pendingSlotsRef.current.set(request.nodeId, request);
        if (slotFrameRef.current) return;
        const frame = { id: null };
        slotFrameRef.current = frame;
        frame.id = window.requestAnimationFrame(() => {
            if (slotFrameRef.current !== frame) return;
            slotFrameRef.current = null;
            const pending = [...pendingSlotsRef.current.values()];
            pendingSlotsRef.current.clear();
            const current = getDocumentSnapshot();
            const nodeById = new Map();
            for (const node of current.nodes) {
                if (!nodeById.has(node.id)) nodeById.set(node.id, node);
            }
            const shouldRebuild = pending.some((work) => isCurrentRequest(work, nodeById.get(work.nodeId)));
            for (const work of pending) {
                if (requestVersionsRef.current.get(work.nodeId) === work.version)
                    requestVersionsRef.current.delete(work.nodeId);
            }
            if (shouldRebuild) {
                callbacksRef.current.checkSlotConnection(
                    current.nodes, current.manualSlots, current.slotNodes, current.slotEdges,
                );
            }
        });
    }, [getDocumentSnapshot, isCurrentRequest]);

    const updateEventsFromParameters = useCallback(
        async (nodeId, parameterOverride = null) => {
            if (!mountedRef.current) return;
            const documentIdentity = getActiveDocumentIdentity();
            const node = getDocumentSnapshot().nodes.find((candidate) => candidate.id === nodeId);
            if (!node) return;

            const fullSkillName = String(node.data?.fullSkillName || "").split("#")[0];
            if (!fullSkillName) return;

            const parameterList = Array.isArray(parameterOverride)
                ? parameterOverride
                : node.data?.params || [];

            const params = getConsumedParameters(parameterList);

            const requestVersions = requestVersionsRef.current;
            const requestVersion = ++requestSequenceRef.current;
            requestVersions.set(nodeId, requestVersion);
            const request = {
                nodeId,
                version: requestVersion,
                documentIdentity,
                nodeIdentity: getNodeIdentity(node),
                parameters: getParameterSnapshot(params),
            };

            try {
                const data = await fetchSkillData(fullSkillName, params);
                if (!data) return;

                const currentNodes = getDocumentSnapshot().nodes;
                const currentNode = currentNodes.find((candidate) => candidate.id === nodeId);
                if (!isCurrentRequest(request, currentNode)) return;

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
                        if (configuredEvents.some((event) => event.id === eventId)) return;
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
                        ? reconcileDynamicSlots(currentNode.data?.inSlots || [], data.inSlots)
                        : currentNode.data?.inSlots || [];
                const nextOutSlots =
                    data.outSlots !== undefined
                        ? reconcileDynamicSlots(currentNode.data?.outSlots || [], data.outSlots)
                        : currentNode.data?.outSlots || [];
                const nextParams =
                    data.params !== undefined
                        ? reconcileDynamicParameters(currentNode.data?.params || [], data.params)
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

                // Rebase onto the live model, outside any replayable state updater.
                setNodes(updatedNodes);
                scheduleSlotRebuild({ ...request, parameters: getParameterSnapshot(getConsumedParameters(nextParams)) });
                void callbacksRef.current.syncStateConfigurationAfterCommit(nodeId);
            } catch (error) {
                if (
                    mountedRef.current &&
                    requestVersions.get(nodeId) === requestVersion &&
                    getActiveDocumentIdentity() === documentIdentity
                )
                    console.error("Error updating skill from parameters:", error);
            } finally {
                if (
                    requestVersions.get(nodeId) === requestVersion &&
                    pendingSlotsRef.current.get(nodeId)?.version !== requestVersion
                ) requestVersions.delete(nodeId);
            }
        },
        [
            getDocumentSnapshot,
            getActiveDocumentIdentity,
            setNodes,
            fetchSkillData,
            isCurrentRequest,
            scheduleSlotRebuild,
        ]
    );

    return {
        updateEventsFromParameters,
    };
}
