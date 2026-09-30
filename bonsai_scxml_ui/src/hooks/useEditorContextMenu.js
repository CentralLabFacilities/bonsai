import { useCallback, useEffect, useMemo } from "react";
import { isSlotEdge } from "../utils/editorGraph";
import { getAbsoluteNodePosition } from "../utils/editorGeometry";
import {
    isCloneableEditorNode,
    isEditorCloneNode,
} from "../utils/editorClones";

const getContextNodeLabel = (node) => {
    if (!node) return "Node";
    return (
        node.data?.label ||
        node.data?.fullSkillName ||
        node.data?.path ||
        node.id ||
        "Node"
    );
};

export function useEditorContextMenu({
    contextMenu,
    setContextMenu,
    nodes,
    edges,
    slotNodes,
    slotEdges,
    selectedNodes,
    activeMode,
    behaviorDirectories,
    screenToFlowPosition,
    selectSlotEdge,
    selectTransitionEdge,
    selectEditorNode,
    setNodes,
    setSlotNodes,
    setSelectedNodeId,
    setRightPanelTab,
    setActiveTab,
    setNodeAsInitial,
    createEditorReference,
    captureGraphSelection,
    requestGraphPaste,
    handleOpenTransition,
    handleCreateCompoundFromSelected,
    handleCreateEmptyCompound,
    handleCreateParallelFromSelected,
    handleCreateEmptyParallel,
    setPendingSubMachineCreation,
    setIsCreateSlotModalOpen,
    addEmptyStateToContainer,
    handleAddLaneToParallel,
    handleNodesChange,
    onEdgeDoubleClick,
    openConditionDrawer,
    handleNavigateCloneSource,
    setControlPointInsertRequest,
    updatePersistentEdgeControlPoints,
    handleVisibleEdgesChange,
    handleOpenSlot,
    clearAllEdgeSelection,
    getNodes,
    setCenter,
}) {
    const selectedSlotNodes = useMemo(
        () => slotNodes.filter((node) => node.selected),
        [slotNodes]
    );

    const editorCloneSelection = useMemo(
        () => [...selectedNodes, ...selectedSlotNodes],
        [selectedNodes, selectedSlotNodes]
    );

    const handleContextMenuOpen = useCallback(
        (event, clickedNode = null, clickedEdge = null) => {
            event.preventDefault();
            event.stopPropagation();

            const flowPos = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            if (clickedEdge) {
                if (
                    clickedEdge.data?.compoundInitialEdge ||
                    clickedEdge.data?.parallelEntryEdge
                ) {
                    setContextMenu(null);
                    return;
                }

                const slotConnection = isSlotEdge(clickedEdge);
                if (slotConnection) {
                    selectSlotEdge(clickedEdge.id);
                } else {
                    selectTransitionEdge(clickedEdge.id);
                }

                const storedBoundarySources = Array.isArray(
                    clickedEdge.data?.boundaryOriginalSources
                )
                    ? clickedEdge.data.boundaryOriginalSources
                    : [];
                const firstBoundarySource = storedBoundarySources.find(
                    (entry) => entry?.sourceId || entry?.nodeId || entry?.id
                );
                const logicalSourceId =
                    firstBoundarySource?.sourceId ||
                    firstBoundarySource?.nodeId ||
                    firstBoundarySource?.id ||
                    clickedEdge.data?.boundaryOriginalSource ||
                    clickedEdge.data?.compoundOriginalSource ||
                    clickedEdge.data?.parallelOriginalSource ||
                    clickedEdge.source;
                const logicalSourceHandle = String(
                    firstBoundarySource?.sourceHandle ||
                        firstBoundarySource?.handle ||
                        clickedEdge.data?.boundaryOriginalSourceHandle ||
                        clickedEdge.data?.compoundOriginalSourceHandle ||
                        clickedEdge.data?.parallelOriginalSourceHandle ||
                        clickedEdge.sourceHandle ||
                        clickedEdge.label ||
                        "success"
                );
                const logicalTargetId =
                    clickedEdge.data?.boundaryOriginalTarget ||
                    clickedEdge.data?.compoundOriginalTarget ||
                    clickedEdge.data?.parallelOriginalTarget ||
                    clickedEdge.target;

                const allEditorNodes = [...nodes, ...slotNodes];
                const sourceNode = allEditorNodes.find(
                    (node) => node.id === logicalSourceId
                );
                const targetNode = allEditorNodes.find(
                    (node) => node.id === logicalTargetId
                );
                const slotSkillNodeId =
                    clickedEdge.data?.skillNodeId || clickedEdge.source;
                const slotNodeId =
                    clickedEdge.data?.slotNodeId || clickedEdge.target;

                setContextMenu({
                    kind: "edge",
                    x: event.clientX,
                    y: event.clientY,
                    flowPosition: flowPos,
                    edgeId: clickedEdge.id,
                    isSlotConnection: slotConnection,
                    sourceNodeId: logicalSourceId || null,
                    sourceHandle: logicalSourceHandle,
                    targetNodeId: logicalTargetId || null,
                    slotSkillNodeId: slotSkillNodeId || null,
                    slotNodeId: slotNodeId || null,
                    slotAccess: clickedEdge.data?.access || null,
                    slotIndex: Number.isInteger(
                        Number(clickedEdge.data?.slotIndex)
                    )
                        ? Number(clickedEdge.data.slotIndex)
                        : null,
                    title: slotConnection
                        ? `${getContextNodeLabel(
                              allEditorNodes.find(
                                  (node) => node.id === slotSkillNodeId
                              )
                          )} ↔ ${getContextNodeLabel(
                              allEditorNodes.find(
                                  (node) => node.id === slotNodeId
                              )
                          )}`
                        : `${getContextNodeLabel(
                              sourceNode
                          )}.${logicalSourceHandle} → ${getContextNodeLabel(
                              targetNode
                          )}`,
                });
                return;
            }

            if (clickedNode) {
                if (!clickedNode.selected) {
                    if (clickedNode.type === "slot") {
                        setNodes((currentNodes) =>
                            currentNodes.map((node) => ({
                                ...node,
                                selected: false,
                            }))
                        );
                        setSlotNodes((currentSlotNodes) =>
                            currentSlotNodes.map((node) => ({
                                ...node,
                                selected: node.id === clickedNode.id,
                            }))
                        );
                    } else {
                        setNodes((currentNodes) =>
                            currentNodes.map((node) => ({
                                ...node,
                                selected: node.id === clickedNode.id,
                            }))
                        );
                        setSlotNodes((currentSlotNodes) =>
                            currentSlotNodes.map((node) => ({
                                ...node,
                                selected: false,
                            }))
                        );
                    }
                    setSelectedNodeId(clickedNode.id);
                }

                const parentNode = clickedNode.parentId
                    ? nodes.find((node) => node.id === clickedNode.parentId)
                    : null;
                const isStructuralLane = clickedNode.type === "parallelLane";
                const isStructuralHelper = Boolean(
                    clickedNode.data?.autoParallelLaneCompound
                );
                const isReference = isEditorCloneNode(clickedNode);
                const canSetInitial = Boolean(
                    clickedNode.parentId &&
                        !isReference &&
                        !isStructuralLane &&
                        clickedNode.type !== "slot" &&
                        !clickedNode.data?.isInitial &&
                        ["compound", "parallelLane"].includes(parentNode?.type)
                );

                const addStateTargets =
                    clickedNode.type === "parallel"
                        ? nodes
                              .filter(
                                  (node) =>
                                      node.parentId === clickedNode.id &&
                                      node.type === "parallelLane"
                              )
                              .sort(
                                  (a, b) =>
                                      Number(a.position?.y || 0) -
                                      Number(b.position?.y || 0)
                              )
                              .map((lane) => ({
                                  id: lane.id,
                                  label: getContextNodeLabel(lane),
                              }))
                        : ["compound", "parallelLane"].includes(
                                clickedNode.type
                            )
                          ? [
                                {
                                    id: clickedNode.id,
                                    label: getContextNodeLabel(clickedNode),
                                },
                            ]
                          : [];

                setContextMenu({
                    kind: "node",
                    x: event.clientX,
                    y: event.clientY,
                    flowPosition: flowPos,
                    nodeId: clickedNode.id,
                    nodeType: clickedNode.type,
                    title: getContextNodeLabel(clickedNode),
                    isStructuralNode: isStructuralLane || isStructuralHelper,
                    addStateTargets,
                    canSetInitial: Boolean(
                        canSetInitial &&
                            parentNode?.data?.initialChildId !== clickedNode.id
                    ),
                    canOpenTransitions:
                        !isReference &&
                        !isStructuralLane &&
                        clickedNode.type !== "slot",
                    canCreateReference: isCloneableEditorNode(clickedNode),
                    referenceLabel:
                        clickedNode.type === "slot"
                            ? "Create slot reference"
                            : clickedNode.type === "compound"
                              ? "Create compound reference"
                              : clickedNode.type === "parallel"
                                ? "Create parallel reference"
                                : clickedNode.type === "submachine"
                                  ? "Create sub-state-machine reference"
                                  : "Create state reference",
                    canWrap:
                        !isReference &&
                        !isStructuralLane &&
                        !isStructuralHelper &&
                        clickedNode.type !== "slot",
                    canAddState: addStateTargets.length > 0,
                    canAddLane: clickedNode.type === "parallel",
                    canDelete: !isStructuralHelper && !isStructuralLane,
                });
                return;
            }

            setContextMenu({
                kind: "pane",
                x: event.clientX,
                y: event.clientY,
                flowPosition: flowPos,
                title: "Create new element",
            });
        },
        [
            nodes,
            screenToFlowPosition,
            selectSlotEdge,
            selectTransitionEdge,
            setContextMenu,
            setNodes,
            setSelectedNodeId,
            setSlotNodes,
            slotNodes,
        ]
    );

    const handleSelectAction = useCallback(
        (type, payload = null) => {
            const hasSelection = selectedNodes.length > 0;
            const contextNodeId = contextMenu?.nodeId || null;
            const contextEdgeId = contextMenu?.edgeId || null;

            if (type === "copy" || type === "paste") {
                if (type === "copy") {
                    captureGraphSelection();
                } else {
                    requestGraphPaste(contextMenu?.flowPosition || null);
                }
                setContextMenu(null);
                return;
            }

            if (type === "open-details" && contextNodeId) {
                selectEditorNode(contextNodeId);
            } else if (type === "open-transitions" && contextNodeId) {
                const node = nodes.find(
                    (candidate) => candidate.id === contextNodeId
                );
                const firstEventId = String(node?.data?.events?.[0]?.id || "");
                if (firstEventId) {
                    handleOpenTransition(contextNodeId, firstEventId);
                } else {
                    setSelectedNodeId(contextNodeId);
                    setRightPanelTab("details");
                    setActiveTab("allgemein");
                }
            } else if (type === "set-initial" && contextNodeId) {
                setNodeAsInitial(contextNodeId);
            } else if (type === "clone") {
                const sourceNode =
                    editorCloneSelection.length === 1
                        ? editorCloneSelection[0]
                        : null;
                if (contextMenu?.flowPosition && sourceNode) {
                    createEditorReference(sourceNode, {
                        x: Number(contextMenu.flowPosition.x || 0) + 220,
                        y: Number(contextMenu.flowPosition.y || 0),
                    });
                }
            } else if (type === "compound") {
                if (hasSelection && contextMenu?.kind === "node") {
                    handleCreateCompoundFromSelected();
                } else {
                    handleCreateEmptyCompound(contextMenu?.flowPosition);
                }
            } else if (type === "parallel") {
                if (hasSelection && contextMenu?.kind === "node") {
                    handleCreateParallelFromSelected();
                } else {
                    handleCreateEmptyParallel(contextMenu?.flowPosition);
                }
            } else if (type === "submachine") {
                const nextIndex =
                    nodes.filter((node) => node.type === "submachine").length +
                    1;
                setPendingSubMachineCreation({
                    fromSelection:
                        hasSelection && contextMenu?.kind === "node",
                    flowPosition: contextMenu?.flowPosition,
                    defaultDirectory: behaviorDirectories[0]?.path || "",
                    defaultFileName: `SubMachine_${nextIndex}.xml`,
                });
            } else if (type === "slot") {
                if (activeMode === "slots" || activeMode === "overview") {
                    setIsCreateSlotModalOpen(true);
                }
            } else if (type === "add-state") {
                const targetParentId = payload || contextNodeId;
                if (targetParentId) addEmptyStateToContainer(targetParentId);
            } else if (type === "add-lane" && contextNodeId) {
                handleAddLaneToParallel(contextNodeId);
            } else if (type === "delete-node" && contextNodeId) {
                const removalIds = new Set([contextNodeId]);
                let foundDescendant = true;
                while (foundDescendant) {
                    foundDescendant = false;
                    nodes.forEach((node) => {
                        if (
                            node.parentId &&
                            removalIds.has(node.parentId) &&
                            !removalIds.has(node.id)
                        ) {
                            removalIds.add(node.id);
                            foundDescendant = true;
                        }
                    });
                }

                handleNodesChange(
                    [...removalIds].map((id) => ({ id, type: "remove" }))
                );
                setSelectedNodeId((current) =>
                    current && removalIds.has(current) ? null : current
                );
            } else if (type === "open-transition" && contextEdgeId) {
                const edge = edges.find(
                    (candidate) => candidate.id === contextEdgeId
                );
                if (edge) onEdgeDoubleClick(null, edge);
            } else if (
                type === "change-transition-target" &&
                contextEdgeId
            ) {
                const edge = edges.find(
                    (candidate) => candidate.id === contextEdgeId
                );
                if (edge && contextMenu?.sourceNodeId) {
                    selectTransitionEdge(edge.id);
                    openConditionDrawer(
                        contextMenu.sourceNodeId,
                        contextMenu.sourceHandle || "success",
                        contextMenu.targetNodeId || edge.target,
                        null,
                        {
                            targetOnly: true,
                            edgeId: edge.id,
                        }
                    );
                }
            } else if (type === "go-source" && contextMenu?.sourceNodeId) {
                handleNavigateCloneSource(contextMenu.sourceNodeId);
            } else if (type === "go-target" && contextMenu?.targetNodeId) {
                handleNavigateCloneSource(contextMenu.targetNodeId);
            } else if (type === "create-control-point" && contextEdgeId) {
                const flowPosition = contextMenu?.flowPosition;
                const edgeKind = contextMenu?.isSlotConnection
                    ? "slot"
                    : "transition";
                const sourceEdges = edgeKind === "slot" ? slotEdges : edges;
                const edge = sourceEdges.find(
                    (candidate) => candidate.id === contextEdgeId
                );

                if (flowPosition && edge) {
                    setControlPointInsertRequest({
                        requestId: crypto.randomUUID(),
                        edgeId: contextEdgeId,
                        edgeKind,
                        expectedControlPointCount: Array.isArray(
                            edge.data?.controlPoints
                        )
                            ? edge.data.controlPoints.length
                            : 0,
                        flowPosition: {
                            x: Number(flowPosition.x || 0),
                            y: Number(flowPosition.y || 0),
                        },
                    });
                }
            } else if (type === "remove-control-point" && contextEdgeId) {
                const edgeKind =
                    contextMenu?.edgeKind === "slot" ? "slot" : "transition";
                const sourceEdges = edgeKind === "slot" ? slotEdges : edges;
                const edge = sourceEdges.find(
                    (candidate) => candidate.id === contextEdgeId
                );
                const pointId = contextMenu?.pointId;

                if (edge && pointId) {
                    const nextControlPoints = Array.isArray(
                        edge.data?.controlPoints
                    )
                        ? edge.data.controlPoints.filter(
                              (point) => point.id !== pointId
                          )
                        : [];

                    updatePersistentEdgeControlPoints(
                        contextEdgeId,
                        nextControlPoints,
                        edgeKind
                    );
                }
            } else if (type === "delete-transition" && contextEdgeId) {
                handleVisibleEdgesChange([
                    { id: contextEdgeId, type: "remove" },
                ]);
            } else if (type === "open-slot-connection") {
                const skillNode = nodes.find(
                    (node) => node.id === contextMenu?.slotSkillNodeId
                );
                const access = contextMenu?.slotAccess;
                const slotIndex = contextMenu?.slotIndex;
                const slotKey =
                    access === "read"
                        ? skillNode?.data?.inSlots?.[slotIndex]?.key
                        : access === "write"
                          ? skillNode?.data?.outSlots?.[slotIndex]?.key
                          : null;

                if (skillNode && access && slotKey) {
                    handleOpenSlot(skillNode.id, access, slotKey);
                } else if (skillNode) {
                    setSelectedNodeId(skillNode.id);
                    setRightPanelTab("details");
                    setActiveTab("slots");
                }
            } else if (
                type === "go-slot-skill" &&
                contextMenu?.slotSkillNodeId
            ) {
                handleNavigateCloneSource(contextMenu.slotSkillNodeId);
                setActiveTab("slots");
            } else if (
                type === "go-slot-node" &&
                contextMenu?.slotNodeId
            ) {
                const slotNodeId = contextMenu.slotNodeId;
                clearAllEdgeSelection();
                selectEditorNode(slotNodeId, {
                    kind: "slot",
                    tab: "slots",
                });

                window.setTimeout(() => {
                    const currentNodes = getNodes();
                    const flowNode = currentNodes.find(
                        (node) => node.id === slotNodeId
                    );
                    if (!flowNode) return;
                    const position = getAbsoluteNodePosition(
                        flowNode,
                        currentNodes
                    );
                    const width =
                        Number(flowNode.measured?.width) ||
                        Number(flowNode.width) ||
                        Number(flowNode.style?.width) ||
                        180;
                    const height =
                        Number(flowNode.measured?.height) ||
                        Number(flowNode.height) ||
                        Number(flowNode.style?.height) ||
                        70;
                    setCenter(position.x + width / 2, position.y + height / 2, {
                        zoom: 1,
                        duration: 300,
                    });
                }, 30);
            } else if (type === "disconnect-slot" && contextEdgeId) {
                handleVisibleEdgesChange([
                    { id: contextEdgeId, type: "remove" },
                ]);
            }

            setContextMenu(null);
        },
        [
            activeMode,
            addEmptyStateToContainer,
            behaviorDirectories,
            captureGraphSelection,
            clearAllEdgeSelection,
            contextMenu,
            createEditorReference,
            edges,
            editorCloneSelection,
            getNodes,
            handleAddLaneToParallel,
            handleCreateCompoundFromSelected,
            handleCreateEmptyCompound,
            handleCreateEmptyParallel,
            handleCreateParallelFromSelected,
            handleNavigateCloneSource,
            handleNodesChange,
            handleOpenSlot,
            handleOpenTransition,
            handleVisibleEdgesChange,
            nodes,
            onEdgeDoubleClick,
            openConditionDrawer,
            requestGraphPaste,
            selectEditorNode,
            selectTransitionEdge,
            setActiveTab,
            setCenter,
            setContextMenu,
            setControlPointInsertRequest,
            setIsCreateSlotModalOpen,
            setNodeAsInitial,
            setPendingSubMachineCreation,
            setRightPanelTab,
            setSelectedNodeId,
            slotEdges,
            updatePersistentEdgeControlPoints,
        ]
    );

    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu) setContextMenu(null);
        };
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, [contextMenu, setContextMenu]);

    return {
        handleContextMenuOpen,
        handleSelectAction,
    };
}
