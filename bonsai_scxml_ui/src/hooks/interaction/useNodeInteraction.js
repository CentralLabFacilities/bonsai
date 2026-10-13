import { useCallback, useEffect, useRef, useState } from "react";

export function useNodeInteraction({ setNodes, setRightPanelTab, setActiveTab }) {
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [hoveredSlotAccessNodeId, setHoveredSlotAccessNodeId] = useState(null);
    const [hoveredEditorNodeId, setHoveredEditorNodeId] = useState(null);
    const [hoveredEditorEdgeId, setHoveredEditorEdgeId] = useState(null);
    // Panel/drawer/annotation hover is separate from persistent edge selection.
    // Keep the DOM owner so a late mouseleave from an old card cannot clear
    // the highlight of a newer badge (and removal while hovered cannot stick).
    const edgeHoverOwnerRef = useRef(null);
    const nodeHoverOwnerRef = useRef(null);
    const lastHoverPointerRef = useRef(null);
    const rememberPointer = (event) => {
        if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
            lastHoverPointerRef.current = { x: event.clientX, y: event.clientY };
        }
    };
    const hoverTransitionNode = useCallback((nodeId, event) => {
        if (nodeId) {
            rememberPointer(event);
            nodeHoverOwnerRef.current = event?.currentTarget || null;
            setHoveredEditorNodeId(nodeId);
            return;
        }
        if (event?.currentTarget && nodeHoverOwnerRef.current !== event.currentTarget) return;
        nodeHoverOwnerRef.current = null;
        setHoveredEditorNodeId(null);
    }, []);
    const hoverTransitionEdge = useCallback((edgeId, event) => {
        if (edgeId) {
            rememberPointer(event);
            edgeHoverOwnerRef.current = event?.currentTarget || null;
            setHoveredEditorEdgeId(edgeId);
            return;
        }
        if (event?.currentTarget && edgeHoverOwnerRef.current !== event.currentTarget) return;
        edgeHoverOwnerRef.current = null;
        setHoveredEditorEdgeId(null);
    }, []);

    useEffect(() => {
        if ((!hoveredEditorEdgeId || !edgeHoverOwnerRef.current) &&
            (!hoveredEditorNodeId || !nodeHoverOwnerRef.current)) return undefined;

        const clearDetachedOwners = () => {
            // A reordered card, closed drawer, or removed badge can disappear
            // without a mouseleave. This must clear the React presentation
            // immediately, even if the user does not move the pointer again.
            for (const [ownerRef, hoveredId, setter] of [
                [edgeHoverOwnerRef, hoveredEditorEdgeId, setHoveredEditorEdgeId],
                [nodeHoverOwnerRef, hoveredEditorNodeId, setHoveredEditorNodeId],
            ]) {
                const owner = ownerRef.current;
                if (owner && hoveredId && !owner.isConnected) {
                    ownerRef.current = null;
                    setter(null);
                }
            }
        };
        const clearIfPointerLeft = (event) => {
            rememberPointer(event);
            const pointer = lastHoverPointerRef.current;
            const underPointer = pointer
                ? document.elementFromPoint(pointer.x, pointer.y)
                : null;
            for (const [ownerRef, hoveredId, setter] of [
                [edgeHoverOwnerRef, hoveredEditorEdgeId, setHoveredEditorEdgeId],
                [nodeHoverOwnerRef, hoveredEditorNodeId, setHoveredEditorNodeId],
            ]) {
                const owner = ownerRef.current;
                // Keyboard users should retain focus highlighting until blur.
                if (owner && hoveredId && !owner.matches(":focus-visible") &&
                    (!owner.isConnected || (pointer && (!underPointer || !owner.contains(underPointer))))) {
                    ownerRef.current = null;
                    setter(null);
                }
            }
        };
        const clearOnBlur = () => {
            edgeHoverOwnerRef.current = null;
            nodeHoverOwnerRef.current = null;
            setHoveredEditorEdgeId(null);
            setHoveredEditorNodeId(null);
        };
        const clearWhenLeavingWindow = (event) => {
            if (!event.relatedTarget) clearOnBlur();
        };
        // Look only for DOM removals (not frequent style/attribute updates).
        const observer = new MutationObserver(clearDetachedOwners);
        observer.observe(document.body, { childList: true, subtree: true });
        // A hovered card can move under a stationary pointer during the reorder
        // animation, or the UI can stop emitting pointer events after a popup
        // closes. A lightweight check while hovering closes that last gap.
        const staleHoverCheck = window.setInterval(() => {
            clearDetachedOwners();
            clearIfPointerLeft();
        }, 200);
        document.addEventListener("pointermove", clearIfPointerLeft, true);
        document.addEventListener("pointerover", clearIfPointerLeft, true);
        document.addEventListener("pointerdown", clearIfPointerLeft, true);
        document.addEventListener("scroll", clearIfPointerLeft, true);
        window.addEventListener("resize", clearIfPointerLeft);
        document.addEventListener("mouseout", clearWhenLeavingWindow, true);
        window.addEventListener("blur", clearOnBlur);
        return () => {
            observer.disconnect();
            window.clearInterval(staleHoverCheck);
            document.removeEventListener("pointermove", clearIfPointerLeft, true);
            document.removeEventListener("pointerover", clearIfPointerLeft, true);
            document.removeEventListener("pointerdown", clearIfPointerLeft, true);
            document.removeEventListener("scroll", clearIfPointerLeft, true);
            window.removeEventListener("resize", clearIfPointerLeft);
            document.removeEventListener("mouseout", clearWhenLeavingWindow, true);
            window.removeEventListener("blur", clearOnBlur);
        };
    }, [hoveredEditorEdgeId, hoveredEditorNodeId]);

    const [parameterFocusRequest, setParameterFocusRequest] = useState(null);
    const [slotFocusRequest, setSlotFocusRequest] = useState(null);
    const [transitionFocusRequest, setTransitionFocusRequest] = useState(null);
    const parameterFocusRequestIdRef = useRef(0);
    const slotFocusRequestIdRef = useRef(0);
    const transitionFocusRequestIdRef = useRef(0);

    useEffect(() => {
        if (!selectedNodeId) setRightPanelTab("datamodel");
    }, [selectedNodeId, setRightPanelTab]);

    const selectOnlyNode = useCallback((nodeId) => {
        setNodes((currentNodes) =>
            currentNodes.map((node) => ({
                ...node,
                selected: node.id === nodeId,
            }))
        );
        setSelectedNodeId(nodeId);
        setRightPanelTab("details");
    }, [setNodes, setRightPanelTab]);

    const handleOpenStateActions = useCallback((nodeId) => {
        selectOnlyNode(nodeId);
        setActiveTab("actions");
    }, [selectOnlyNode, setActiveTab]);

    const handleOpenParameter = useCallback((nodeId, parameterKey) => {
        selectOnlyNode(nodeId);
        setActiveTab("parameter");
        parameterFocusRequestIdRef.current += 1;
        setParameterFocusRequest({
            nodeId,
            parameterKey,
            requestId: parameterFocusRequestIdRef.current,
        });
    }, [selectOnlyNode, setActiveTab]);

    const handleOpenSlot = useCallback((nodeId, access, slotKey) => {
        selectOnlyNode(nodeId);
        setActiveTab("slots");
        slotFocusRequestIdRef.current += 1;
        setSlotFocusRequest({
            nodeId,
            access,
            slotKey,
            requestId: slotFocusRequestIdRef.current,
        });
    }, [selectOnlyNode, setActiveTab]);

    const handleOpenTransition = useCallback((nodeId, eventId) => {
        selectOnlyNode(nodeId);
        setActiveTab("allgemein");
        transitionFocusRequestIdRef.current += 1;
        setTransitionFocusRequest({
            nodeId,
            eventId,
            requestId: transitionFocusRequestIdRef.current,
        });
    }, [selectOnlyNode, setActiveTab]);

    return {
        selectedNodeId,
        setSelectedNodeId,
        hoveredSlotAccessNodeId,
        setHoveredSlotAccessNodeId,
        hoveredEditorNodeId,
        setHoveredEditorNodeId,
        hoveredEditorEdgeId,
        setHoveredEditorEdgeId,
        hoverTransitionEdge,
        hoverTransitionNode,
        parameterFocusRequest,
        slotFocusRequest,
        transitionFocusRequest,
        handleOpenStateActions,
        handleOpenParameter,
        handleOpenSlot,
        handleOpenTransition,
    };
}
