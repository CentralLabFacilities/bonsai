import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    getDefaultSlotPath,
    getSlotConnectionEndpoint,
    getSlotEdgeEndpoints,
    getSlotPathFromNode,
    normalizeSlotPath,
    parseSlotConnectionHandle,
    planInheritedSlotRename,
    renameParentSlot,
    resolveSlotConnection,
} from "../../../utils/editorGraph";

const endpointSignature = (endpoint) => endpoint && JSON.stringify([
    endpoint.nodeId, endpoint.node.type, endpoint.node.data?.fullSkillName,
    endpoint.node.data?.editorInstanceId, endpoint.node.data?.src,
    endpoint.node.data?.isSkillClone, endpoint.node.data?.isStateClone,
    endpoint.origin, endpoint.access, endpoint.slotIndex, endpoint.inheritIndex, endpoint.slot,
    endpoint.origin === "submachine" ? endpoint.node.data?.inheritedSlots : null,
]);

const resolveSlotReconnect = (connection, edge, model) => {
    const inherited = edge.data?.subMachineInherited === true;
    const consumerId = inherited ? edge.data?.subMachineNodeId : edge.data?.skillNodeId;
    const index = inherited ? edge.data?.inheritIndex : edge.data?.slotIndex;
    const access = edge.data?.access;
    const consumerHandleId = `slot-${inherited ? "submachine" : "skill"}-${access}-${index}`;
    const consumer = getSlotConnectionEndpoint(consumerId, consumerHandleId, model);
    const ends = [
        { nodeId: connection?.source, handleId: connection?.sourceHandle },
        { nodeId: connection?.target, handleId: connection?.targetHandle },
    ];
    const slotEnd = ends.find((end) => parseSlotConnectionHandle(end.handleId)?.origin === "slot");
    const ownerEnd = ends.find((end) => end !== slotEnd);
    const ownerHandle = parseSlotConnectionHandle(ownerEnd?.handleId);
    const projectedOwner = access === "read" ? edge.data?.collapsedSlotOriginalTarget : edge.data?.collapsedSlotOriginalSource;
    const slot = slotEnd && getSlotConnectionEndpoint(slotEnd.nodeId, slotEnd.handleId, model);
    if (!consumer || !slot || slot.access !== access || consumer.slotType !== slot.slotType
        || (ownerHandle && (ownerEnd.nodeId !== consumerId || ownerEnd.handleId !== consumerHandleId))
        || (!ownerHandle && (!projectedOwner || projectedOwner !== consumerId || ownerEnd?.handleId !== "collapsed-slot-source"))) return null;
    return { consumer, slot };
};

export const getEmptySlotDropPosition = (event, connectionState, container, screenToFlowPosition) => {
    if (!["mouseup", "pointerup", "touchend"].includes(event?.type)
        || (event.button != null && event.button !== 0)
        || connectionState?.isValid || connectionState?.toHandle || connectionState?.toNode
        || !container || !screenToFlowPosition) return null;
    const pointer = event.changedTouches?.[0] || event;
    const { clientX: x, clientY: y } = pointer;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const bounds = container.getBoundingClientRect();
    if (x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom) return null;
    const hit = container.ownerDocument.elementFromPoint(x, y);
    if (!hit || !container.contains(hit) || !hit.closest(".react-flow__pane")
        || hit.closest(".react-flow__handle, .react-flow__node, .react-flow__edge, .context-menu, button, dialog")) return null;
    return screenToFlowPosition({ x, y });
};

export const useSlotConnections = (options) => {
    const [slotConnectionDrag, setSlotConnectionDrag] = useState(null);
    const [pendingSlotRename, setPendingSlotRename] = useState(null);
    const callbacksRef = useRef(options);
    const dragRef = useRef(null);
    const pendingRef = useRef(null);
    const reconnectRef = useRef(null);
    const mountedRef = useRef(true);

    const getModel = useCallback(() => {
        const current = callbacksRef.current;
        return current.getDocumentSnapshot?.() || current;
    }, []);
    const getIdentity = useCallback(() => callbacksRef.current.getActiveDocumentIdentity?.() || null, []);
    const reportError = useCallback((message) => callbacksRef.current.onSlotConnectionError?.(message), []);

    const cancelSlotConnection = useCallback((cancelFlow = true) => {
        if (dragRef.current) {
            dragRef.current = null;
            setSlotConnectionDrag(null);
            if (cancelFlow) callbacksRef.current.cancelFlowConnection?.();
        }
    }, []);
    const cancelSlotRename = useCallback(() => {
        if (!pendingRef.current) return;
        pendingRef.current = null;
        setPendingSlotRename(null);
    }, []);

    useLayoutEffect(() => {
        callbacksRef.current = options;
        const model = getModel();
        const identity = getIdentity();
        const drag = dragRef.current;
        if (drag && (drag.identity !== identity || endpointSignature(
            getSlotConnectionEndpoint(drag.nodeId, drag.handleId, model)
        ) !== drag.signature)) cancelSlotConnection();
        const pending = pendingRef.current;
        if (pending && pending.identity !== identity) cancelSlotRename();
    });

    useEffect(() => {
        mountedRef.current = true;
        const cancel = (event) => {
            if (event.type === "keydown" && event.key !== "Escape") return;
            cancelSlotConnection();
        };
        document.addEventListener("keydown", cancel, true);
        document.addEventListener("pointercancel", cancel, true);
        document.addEventListener("touchcancel", cancel, true);
        window.addEventListener("blur", cancel);
        return () => {
            mountedRef.current = false;
            dragRef.current = null;
            pendingRef.current = null;
            callbacksRef.current.cancelFlowConnection?.();
            document.removeEventListener("keydown", cancel, true);
            document.removeEventListener("pointercancel", cancel, true);
            document.removeEventListener("touchcancel", cancel, true);
            window.removeEventListener("blur", cancel);
        };
    }, [cancelSlotConnection]);

    const validateSlotConnection = useCallback((connection, reconnectingEdge = null) => {
        if (!parseSlotConnectionHandle(connection?.sourceHandle)
            && !parseSlotConnectionHandle(connection?.targetHandle)) return null;
        const model = getModel();
        const endpoints = reconnectingEdge?.data?.edgeKind === "slot"
            ? resolveSlotReconnect(connection, reconnectingEdge, model)
            : resolveSlotConnection(connection, model);
        if (!endpoints) return false;
        if (endpoints.consumer.origin === "submachine") {
            return !planInheritedSlotRename(model, endpoints.consumer, endpoints.slot).error;
        }
        return true;
    }, [getModel]);

    const commit = useCallback((model, before, consumer, slotNodeId, preferredEdgeId = null) => {
        if (!mountedRef.current) return false;
        const current = callbacksRef.current;
        const slotNode = model.slotNodes.find((node) => node.id === slotNodeId);
        if (!slotNode) return false;
        const path = getSlotPathFromNode(slotNode);
        const inherited = consumer.origin === "submachine";
        const matches = (edge) => edge.data?.edgeKind === "slot"
            && Boolean(edge.data?.subMachineInherited) === inherited
            && edge.data?.access === consumer.access
            && (inherited ? edge.data?.subMachineNodeId : edge.data?.skillNodeId) === consumer.nodeId
            && Number(inherited ? edge.data?.inheritIndex : edge.data?.slotIndex)
                === (inherited ? consumer.inheritIndex : consumer.slotIndex);
        const existing = model.slotEdges?.find((edge) => edge.id === preferredEdgeId)
            || model.slotEdges?.find(matches);
        const canonicalId = slotNode.data?.cloneOfNodeId || slotNode.id;
        const edge = {
            ...existing,
            id: existing?.id || `edge-slot-${consumer.access}-${consumer.nodeId}-${consumer.slotIndex ?? consumer.inheritIndex}-${crypto.randomUUID()}`,
            ...getSlotEdgeEndpoints(consumer.nodeId, slotNodeId, consumer.access, consumer.handleId),
            type: "smartTransition",
            selected: Boolean(existing?.selected),
            style: { ...existing?.style, stroke: SLOT_CONNECTION_COLORS[consumer.access], strokeWidth: 1.7, strokeDasharray: "5 5" },
            markerEnd: { type: MarkerType.ArrowClosed, color: SLOT_CONNECTION_COLORS[consumer.access] },
            data: {
                ...existing?.data, edgeKind: "slot", access: consumer.access, path,
                skillNodeId: consumer.nodeId, slotNodeId, canonicalSlotNodeId: canonicalId,
                ...(inherited
                    ? { subMachineInherited: true, subMachineNodeId: consumer.nodeId, inheritIndex: consumer.inheritIndex }
                    : { slotIndex: consumer.slotIndex }),
                controlPoints: existing?.data?.slotNodeId === slotNodeId ? existing.data?.controlPoints || [] : [],
            },
        };
        const slotEdges = [...(model.slotEdges || []).filter((edge) => !matches(edge)), edge];
        if (model.nodes !== before.nodes) current.setNodes(model.nodes);
        if (model.manualSlots !== before.manualSlots) current.setManualSlots?.(model.manualSlots);
        if (model.slotNodes !== before.slotNodes) current.setSlotNodes?.(model.slotNodes);
        current.setSlotEdges(slotEdges);
        current.setSelectedNodeId?.(consumer.nodeId);
        // Rebuild immediately from this fresh snapshot, never from a deferred
        // closure that may outlive the document or restore an old clone target.
        current.checkSlotConnection?.(model.nodes, model.manualSlots || [], model.slotNodes, slotEdges);
        current.onSkillSlotConnectionApplied?.(consumer.nodeId);
        const identity = getIdentity();
        Promise.resolve(current.syncSlotsAfterCommit?.(
            { nodes: model.nodes, manualSlots: model.manualSlots || [] },
            { source: "manual-slot-edge", skillNodeId: consumer.nodeId, slotNodeId,
                access: consumer.access, slotIndex: consumer.slotIndex, inheritIndex: consumer.inheritIndex, normalizedPath: `/${path}` }
        )).catch((error) => {
            if (mountedRef.current && identity === getIdentity()) {
                reportError(`Slot connection synchronization failed: ${String(error?.message || error)}`);
            }
        });
        return true;
    }, [getIdentity, reportError]);

    const applySkillSlotConnection = useCallback(({ skillNodeId, slotNodeId, access, slotIndex, preferredEdgeId = null }) => {
        const model = getModel();
        const consumer = getSlotConnectionEndpoint(skillNodeId, `slot-skill-${access}-${slotIndex}`, model);
        const slot = getSlotConnectionEndpoint(slotNodeId, `slot-node-${access}`, model);
        if (!consumer || !slot || consumer.slotType !== slot.slotType) return false;
        const formattedPath = `/${getSlotPathFromNode(slot.node)}`;
        const inherited = slot.node.data?.inherited
            ? { ...consumer.slot.inherited, state: slot.node.data?.inheritedFrom || "", xpath: formattedPath }
            : null;
        const key = access === "read" ? "inSlots" : "outSlots";
        const nodes = model.nodes.map((node) => node.id !== skillNodeId ? node : {
            ...node, data: { ...node.data, [key]: node.data[key].map((entry, index) => index === consumer.slotIndex
                ? { ...entry, path: formattedPath, inherited } : entry) },
        });
        return commit({ ...model, nodes }, model, consumer, slotNodeId, preferredEdgeId);
    }, [getModel, commit]);

    const applyInheritedSlotConnection = useCallback((consumer, slot, preferredEdgeId = null) => {
        const model = getModel();
        const plan = planInheritedSlotRename(model, consumer, slot);
        if (plan.error) {
            reportError(plan.error);
            return false;
        }
        if (plan.oldPath === plan.newPath) return commit(model, model, consumer, slot.nodeId, preferredEdgeId);
        const pending = {
            id: crypto.randomUUID(), identity: getIdentity(), sourceSignature: endpointSignature(consumer),
            nodeId: consumer.nodeId, handleId: consumer.handleId, slotNodeId: slot.nodeId, slotHandleId: slot.handleId,
            preferredEdgeId, plan, childLabel: consumer.node.data?.label || consumer.nodeId,
            childSource: consumer.node.data?.src || "",
        };
        pendingRef.current = pending;
        setPendingSlotRename(pending);
        return false;
    }, [getModel, commit, getIdentity, reportError]);

    const confirmSlotRename = useCallback((id) => {
        const pending = pendingRef.current;
        if (!pending || pending.id !== id || !mountedRef.current) return false;
        cancelSlotRename();
        const model = getModel();
        const consumer = getSlotConnectionEndpoint(pending.nodeId, pending.handleId, model);
        const slot = getSlotConnectionEndpoint(pending.slotNodeId, pending.slotHandleId, model);
        const plan = consumer && slot && planInheritedSlotRename(model, consumer, slot);
        if (pending.identity !== getIdentity() || endpointSignature(consumer) !== pending.sourceSignature
            || !plan || plan.error || plan.signature !== pending.plan.signature
            || (pending.preferredEdgeId && !model.slotEdges?.some((edge) => edge.id === pending.preferredEdgeId))) {
            reportError("The document, child requirement, or affected parent bindings changed. Draw the connection again.");
            return false;
        }
        const renamed = renameParentSlot(model, plan);
        const slotNodeId = slot.node.data?.isSlotClone ? slot.nodeId : plan.newCanonicalId;
        return commit(renamed, model, consumer, slotNodeId, pending.preferredEdgeId);
    }, [cancelSlotRename, getModel, getIdentity, reportError, commit]);

    const handleFlowSlotConnect = useCallback((connection) => {
        if (!parseSlotConnectionHandle(connection?.sourceHandle)
            && !parseSlotConnectionHandle(connection?.targetHandle)) return false;
        const drag = dragRef.current;
        if (drag) drag.completed = true;
        const model = getModel();
        const endpoints = resolveSlotConnection(connection, model);
        if (!endpoints || (drag && (drag.identity !== getIdentity()
            || endpointSignature(getSlotConnectionEndpoint(drag.nodeId, drag.handleId, model)) !== drag.signature))) return true;
        if (endpoints.consumer.origin === "submachine") applyInheritedSlotConnection(endpoints.consumer, endpoints.slot);
        else applySkillSlotConnection({ skillNodeId: endpoints.consumer.nodeId, slotNodeId: endpoints.slot.nodeId,
            access: endpoints.consumer.access, slotIndex: endpoints.consumer.slotIndex });
        return true;
    }, [getModel, getIdentity, applyInheritedSlotConnection, applySkillSlotConnection]);

    const handleConnectStart = useCallback((_, params) => {
        cancelSlotConnection(false);
        const model = getModel();
        const endpoint = getSlotConnectionEndpoint(params?.nodeId, params?.handleId, model);
        if (!endpoint || pendingRef.current) return;
        const inheritedPath = endpoint.slot.inherited && normalizeSlotPath(endpoint.slot.inherited.xpath || endpoint.slot.path);
        const drag = {
            active: true, nodeId: endpoint.nodeId, handleId: endpoint.handleId,
            origin: endpoint.origin, access: endpoint.access, slotType: endpoint.slotType,
            slotIndex: endpoint.slotIndex, inheritIndex: endpoint.inheritIndex,
            previewPath: `/${inheritedPath || getDefaultSlotPath(model)}`, previewType: endpoint.slot.type,
            canCreate: endpoint.origin === "skill" && !reconnectRef.current,
        };
        dragRef.current = { ...drag, identity: getIdentity(), signature: endpointSignature(endpoint), completed: false };
        setSlotConnectionDrag(drag);
    }, [cancelSlotConnection, getModel, getIdentity]);

    const handleConnectEnd = useCallback((event, connectionState) => {
        const drag = dragRef.current;
        cancelSlotConnection();
        if (!drag?.canCreate || drag.completed || drag.identity !== getIdentity() || !mountedRef.current) return false;
        const current = callbacksRef.current;
        const position = getEmptySlotDropPosition(event, connectionState, current.flowContainerRef?.current, current.screenToFlowPosition);
        if (!position) return false;
        const model = getModel();
        const consumer = getSlotConnectionEndpoint(drag.nodeId, drag.handleId, model);
        if (endpointSignature(consumer) !== drag.signature) return false;
        const inherited = consumer.slot.inherited;
        const path = inherited && normalizeSlotPath(inherited.xpath || consumer.slot.path) || getDefaultSlotPath(model);
        if (model.slotNodes.some((node) => getSlotPathFromNode(node) === path)) {
            reportError(`/${path} already exists. Connect to its handle instead.`);
            return false;
        }
        const formattedPath = `/${path}`;
        const newInherited = inherited ? { ...inherited, xpath: formattedPath } : null;
        const manualSlots = [...(model.manualSlots || []), {
            id: `manual-${crypto.randomUUID()}`, path: formattedPath, type: consumer.slot.type,
            access: consumer.access, slotKind: inherited ? "inheritSlot" : "slot", inherited: newInherited,
        }];
        const slotNodes = [...model.slotNodes, {
            id: `slot-${path}`, type: "slot", position,
            data: { path: formattedPath, label: formattedPath, slotType: consumer.slot.type,
                inherited: Boolean(inherited), currentMachineInherited: Boolean(inherited),
                inheritedFrom: inherited?.state || "", ...(inherited ? { slotKind: "inheritSlot" } : {}) },
        }];
        const key = consumer.access === "read" ? "inSlots" : "outSlots";
        const nodes = model.nodes.map((node) => node.id !== consumer.nodeId ? node : {
            ...node, data: { ...node.data, [key]: node.data[key].map((slot, index) => index === consumer.slotIndex
                ? { ...slot, path: formattedPath, inherited: newInherited } : slot) },
        });
        return commit({ ...model, nodes, manualSlots, slotNodes }, model, consumer, `slot-${path}`);
    }, [cancelSlotConnection, getIdentity, getModel, reportError, commit]);

    const handleSlotReconnectStart = useCallback((edge) => {
        cancelSlotConnection(false);
        reconnectRef.current = edge?.data?.edgeKind === "slot" ? edge : null;
    }, [cancelSlotConnection]);
    const handleSlotReconnectEnd = useCallback(() => {
        reconnectRef.current = null;
        cancelSlotConnection();
    }, [cancelSlotConnection]);
    const handleSlotReconnect = useCallback((oldEdge, connection) => {
        if (oldEdge?.data?.edgeKind !== "slot") return false;
        if (dragRef.current) dragRef.current.completed = true;
        const model = getModel();
        const existing = model.slotEdges?.find((edge) => edge.id === oldEdge.id);
        const endpoints = resolveSlotReconnect(connection, oldEdge, model);
        if (!existing || !endpoints) return true;
        const { consumer, slot } = endpoints;
        const inherited = existing.data?.subMachineInherited === true;
        if (consumer.nodeId !== (inherited ? existing.data?.subMachineNodeId : existing.data?.skillNodeId)
            || consumer.access !== existing.data?.access
            || (inherited ? consumer.inheritIndex !== Number(existing.data?.inheritIndex)
                : consumer.slotIndex !== Number(existing.data?.slotIndex))) return true;
        if (inherited) applyInheritedSlotConnection(consumer, slot, existing.id);
        else applySkillSlotConnection({ skillNodeId: consumer.nodeId, slotNodeId: slot.nodeId,
            access: consumer.access, slotIndex: consumer.slotIndex, preferredEdgeId: existing.id });
        return true;
    }, [getModel, applyInheritedSlotConnection, applySkillSlotConnection]);

    return {
        slotConnectionDrag, pendingSlotRename, cancelSlotConnection, cancelSlotRename, confirmSlotRename,
        validateSlotConnection, handleConnectStart, handleConnectEnd, applySkillSlotConnection,
        handleFlowSlotConnect, handleSlotReconnect, handleSlotReconnectStart, handleSlotReconnectEnd,
    };
};
