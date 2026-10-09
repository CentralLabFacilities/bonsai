import { useCallback, useEffect, useRef, useState } from "react";

export function useNodeInteraction({ setNodes, setRightPanelTab, setActiveTab }) {
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [hoveredSlotAccessNodeId, setHoveredSlotAccessNodeId] = useState(null);
    const [hoveredEditorNodeId, setHoveredEditorNodeId] = useState(null);
    const [hoveredEditorEdgeId, setHoveredEditorEdgeId] = useState(null);

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
        parameterFocusRequest,
        slotFocusRequest,
        transitionFocusRequest,
        handleOpenStateActions,
        handleOpenParameter,
        handleOpenSlot,
        handleOpenTransition,
    };
}
