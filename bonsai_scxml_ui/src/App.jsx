import { useCallback, useMemo } from "react";
import {
    ReactFlowProvider,
    useReactFlow,
    useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import Header, { EditorNotice, EditorPanel, EditorPanelLedge, EditorPanelResizer } from "./components/EditorChrome.jsx";
import SkillLibrary from "./components/SkillLibrary";
import BehaviorLibrary from "./components/BehaviorLibrary";
import EditorCanvas from "./components/EditorCanvas";
import EditorOverlays from "./components/EditorOverlays.jsx";
import WorkflowTabBar from "./components/WorkflowTabBar";
import EditorFindOverlay from "./components/EditorFindOverlay";
import EditorInspectorPanel from "./components/EditorInspectorPanel.jsx";
import { FeedbackProvider } from "./components/ui/index.js";

import {
    isTauri,
    initApiProxy,
} from "./tauri-client.js";
import { getParallelLaneSummaries } from "./utils/containerState.js";
import { collectDescendantGlobals } from "./utils/editorScxml";
import { useEditorHistory } from "./hooks/useEditorHistory";
import { useNodeInteraction } from "./hooks/useNodeInteraction";
import { useSlotGraph } from "./hooks/useSlotGraph";
import { useSkillDefinitions } from "./hooks/useSkillDefinitions";
import { useDynamicSkillConfiguration } from "./hooks/useDynamicSkillConfiguration";
import { useWorkflowTabs } from "./hooks/useWorkflowTabs";
import { useFocusHistory } from "./hooks/useFocusHistory";
import { useWorkflowDocument } from "./hooks/useWorkflowDocument";
import { useEditorAnalysis } from "./hooks/useEditorAnalysis";
import { useEditorDisplay } from "./hooks/useEditorDisplay";
import { useSkillLibraryView } from "./hooks/useSkillLibraryView";
import { useNodeDrag } from "./hooks/useNodeDrag";
import { useSubStateMachines } from "./hooks/useSubStateMachines";
import { useTransitionGraph } from "./hooks/useTransitionGraph";
import { useContainerCreation } from "./hooks/useContainerCreation";
import { useEditorGraphState } from "./hooks/useEditorGraphState";
import { useEditorGraphMaintenance } from "./hooks/useEditorGraphMaintenance";
import { useEditorPresentationGraph } from "./hooks/useEditorPresentationGraph";
import { useEditorActions } from "./hooks/useEditorActions";
import { useRustWorkflowDocument } from "./hooks/useRustWorkflowDocument";
import { useEditorClipboard } from "./hooks/useEditorClipboard";
import { useProblemNavigation } from "./hooks/useProblemNavigation";
import { useEditorSelectionController } from "./hooks/useEditorSelectionController";
import { useEditorContextMenu } from "./hooks/useEditorContextMenu";
import { useRuntimeReplay } from "./hooks/useRuntimeReplay";
import { useEditorFind } from "./hooks/useEditorFind";
import { useGlobalEditorShortcuts } from "./hooks/useGlobalEditorShortcuts";
import { useEditorLibraryDrop } from "./hooks/useEditorLibraryDrop";
import { useEditorFlowChanges } from "./hooks/useEditorFlowChanges";
import { useEditorLibraryItems } from "./hooks/useEditorLibraryItems";
import { useEditorDetailsCallbacks, useEditorDetailsController } from "./hooks/useEditorDetailsController.js";
import { useEditorPanelLayout, useEditorPreferences } from "./hooks/useEditorPreferences.js";
import { useEditorUiState, useRestoreCanvasViewportOnModeChange } from "./hooks/useEditorUiState.js";
import "./App.css";
import "./styles/design-system.css";
import "./styles/interaction-states.css";

// Initialize API proxy for Tauri desktop mode (intercepts /api/* fetch calls)
initApiProxy();


// Detect if running in Tauri desktop app
const IS_DESKTOP = isTauri();
function AppContent() {
    const {
        skills,
        isReloadingSkills,
        skillLibraryRefreshVersion,
        skillLibraryStatus,
        skillLibraryError,
        hasLoadedSkills,
        fetchSkills,
        fetchSkillData,
    } = useSkillDefinitions();
    const updateNodeInternals = useUpdateNodeInternals();
    const {
        behaviorDirectories,
        setBehaviorDirectories,
        showTransitionEdges,
        setShowTransitionEdges,
        showSlotEdges,
        setShowSlotEdges,
    } = useEditorPreferences();
    const panels = useEditorPanelLayout();
    const { showPanel } = panels;

    //---- TAB / GRAPH MANAGEMENT ----
    const {
        nodes,
        setNodes,
        onNodesChange,
        edges,
        setEdges,
        onEdgesChange,
        slotNodes,
        setSlotNodes,
        onSlotNodesChange,
        slotEdges,
        setSlotEdges,
        onSlotEdgesChange,
        manualSlots,
        setManualSlots,
        globalDataModel,
        setGlobalDataModel,
        inheritedGlobalDataModel,
        replaceDocument,
        getDocumentSnapshot,
    } = useEditorGraphState();

    const availableDataModelParameters = useMemo(() => {
        const parameters = [];
        const seen = new Set();

        // Parent globals take precedence when a child defines the same global.
        [...(inheritedGlobalDataModel || []), ...(globalDataModel || [])].forEach(
            (parameter) => {
                if (!parameter?.id || seen.has(parameter.id)) return;
                seen.add(parameter.id);
                parameters.push(parameter);
            }
        );
        return parameters;
    }, [inheritedGlobalDataModel, globalDataModel]);

    const {
        selectedPackage,
        setSelectedPackage,
        selectedSubPackage,
        setSelectedSubPackage,
        activeFilter,
        setActiveFilter,
        searchText,
        setSearchText,
        contextMenu,
        setContextMenu,
        controlPointInsertRequest,
        setControlPointInsertRequest,
        leftLibraryTab,
        setLeftLibraryTab,
        isHintPageOpen,
        setIsHintPageOpen,
        activeMode,
        setActiveMode,
        isCreateSlotModalOpen,
        setIsCreateSlotModalOpen,
        pendingSubMachineCreation,
        setPendingSubMachineCreation,
        stateMachineLoading,
        beginStateMachineLoad,
        endStateMachineLoad,
        activeTab,
        setActiveTab,
        rightPanelTab,
        setRightPanelTab,
    } = useEditorUiState({ showPanel });

    const {
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
    } = useNodeInteraction({
        setNodes,
        setRightPanelTab,
        setActiveTab,
    });

    const { checkSlotConnection } = useSlotGraph({
        nodes,
        manualSlots,
        slotNodes,
        slotEdges,
        setSlotNodes,
        setSlotEdges,
    });

    const rustWorkflowDocument = useRustWorkflowDocument({
        nodes,
        edges,
        globalDataModel,
        manualSlots,
        setNodes,
        setEdges,
        setGlobalDataModel,
    });

    const { updateEventsFromParameters } = useDynamicSkillConfiguration({
        nodes,
        setNodes,
        fetchSkillData,
        checkSlotConnection,
        syncStateConfigurationAfterCommit:
            rustWorkflowDocument.syncStateConfigurationAfterCommit,
    });

    const {
        selectEditorNode,
        clearEditorNodeSelection,
        createEditorReference,
        setNodeAsInitial,
        addEmptyStateToContainer,
        updateSlotPath,
        updateSlotInherited,
        createManualSlot,
        clearTransitionSelection,
        clearAllEdgeSelection,
        selectTransitionEdge,
        selectSlotEdge,
        updateNodeEvent,
        setExistingTargetForEvent,
        moveContainerTransition,
        updateNodeName,
        updateNodeSource,
        updateNodeParameter,
        toggleContainerCollapse,
        updateEdgeControlPoints,
        updateStateActions,
        updateSendEvents,
        updateSkillSlotPath,
        updateGlobalParameter,
        addGlobalParameter,
        deleteGlobalParameter,
    } = useEditorActions({
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
        valueVariables: availableDataModelParameters,
        selectedNodeId,
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
        setManualSlots,
        setGlobalDataModel,
        setSelectedNodeId,
        setRightPanelTab,
        setActiveTab,
        checkSlotConnection,
        updateNodeInternals,
        applyWorkflowCommand: rustWorkflowDocument.applyWorkflowCommand,
        syncInsertedParallelLaneStateAfterCommit:
            rustWorkflowDocument.syncInsertedParallelLaneStateAfterCommit,
        syncStateEditorPositions:
            rustWorkflowDocument.syncStateEditorPositions,
        syncTransitionsForSource:
            rustWorkflowDocument.syncTransitionsForSource,
        syncStateParameters: rustWorkflowDocument.syncStateParameters,
        syncSlotsAfterCommit: rustWorkflowDocument.syncSlotsAfterCommit,
        updateEventsFromParameters,
        setControlPointInsertRequest,
    });

    const {
        screenToFlowPosition,
        fitView,
        getNodes,
        setCenter,
        getViewport,
        setViewport,
    } = useReactFlow();

    const {
        hasGraphClipboard,
        pendingSkillPaste,
        flowContainerRef,
        editorPointerPositionRef,
        handleGraphSelectionChange,
        captureGraphSelection,
        requestGraphPaste,
        resolvePendingSkillPaste,
        cancelPendingSkillPaste,
    } = useEditorClipboard({
        activeMode,
        selectedNodeId,
        nodes,
        edges,
        slotNodes,
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
        setSelectedNodeId,
        setRightPanelTab,
        setActiveTab,
        clearAllEdgeSelection,
        checkSlotConnection,
        updateNodeInternals,
        screenToFlowPosition,
        syncPastedEditorSubgraphAfterCommit:
            rustWorkflowDocument.syncPastedEditorSubgraphAfterCommit,
        syncStateEditorPositions:
            rustWorkflowDocument.syncStateEditorPositions,
    });
    useRestoreCanvasViewportOnModeChange({ activeMode, fitView, getNodes });

    const {
        parallelDropTargetId,
        setParallelDropTargetId,
        compoundDropTargetId,
        setCompoundDropTargetId,
        isDraggingNode,
        draggingNodeId,
        isOverTrash,
        handleNodeDragStart,
        handleNodeDrag,
        handleNodeDragStop,
    } = useNodeDrag({
        edges,
        activeMode,
        setNodes,
        setEdges,
        setSlotEdges,
        setSlotNodes,
        setSelectedNodeId,
        setHoveredEditorEdgeId,
        screenToFlowPosition,
        getNodes,
        syncStatePosition: rustWorkflowDocument.syncStatePosition,
        syncStateEditorPositions:
            rustWorkflowDocument.syncStateEditorPositions,
        syncRemovedStates: rustWorkflowDocument.syncRemovedStates,
    });

    const semanticNodes = useEditorGraphMaintenance({
        nodes,
        isDraggingNode,
        selectedNodeId,
        setNodes,
        setEdges,
        setSelectedNodeId,
    });

    const {
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
    } = useTransitionGraph({
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
        syncTransitionsForSource:
            rustWorkflowDocument.syncTransitionsForSource,
        checkSlotConnection,
        syncSlotsAfterCommit: rustWorkflowDocument.syncSlotsAfterCommit,
    });

    const {
        handleEdgeClick,
        handleEdgeDoubleClick: handleEditorEdgeDoubleClick,
        handleNodeClick,
        handlePaneClick,
        handleNodeMouseEnter,
        handleNodeMouseLeave,
        handleEdgeMouseEnter,
        handleEdgeMouseLeave,
    } = useEditorSelectionController({
        nodes,
        clearAllEdgeSelection,
        selectSlotEdge,
        selectTransitionEdge,
        onTransitionEdgeDoubleClick: onEdgeDoubleClick,
        setSelectedNodeId,
        setRightPanelTab,
        setActiveTab,
        setHoveredEditorNodeId,
        setHoveredEditorEdgeId,
    });

    const {
        selectedNodes,
        handleCreateEmptyCompound,
        handleAddLaneToParallel,
        handleRenameParallelLane,
        handleMoveParallelLane,
        handleDeleteParallelLane,
        handleCreateEmptyParallel,
        handleCreateCompoundFromSelected,
        handleCreateParallelFromSelected,
    } = useContainerCreation({
        nodes,
        edges,
        isDraggingNode,
        setNodes,
        setEdges,
        setSelectedNodeId,
        setActiveTab,
        setContextMenu,
        updateNodeInternals,
        syncInsertedEditorStatesAfterCommit:
            rustWorkflowDocument.syncInsertedEditorStatesAfterCommit,
        syncWrappedContainerAfterCommit:
            rustWorkflowDocument.syncWrappedContainerAfterCommit,
        syncEditorStateAfterCommit:
            rustWorkflowDocument.syncEditorStateAfterCommit,
    });

    const {
        tabs,
        activeTabId,
        activeTab: activeWorkflowTab,
        getTabSnapshot,
        getTabsSnapshot,
        updateTab,
        replaceTabDocument,
        tabPathTooltip,
        draggedTabId,
        switchTab,
        openTab,
        handleAddNewTab,
        closeTab,
        handleTabDragStart,
        handleTabDragOver,
        handleTabDragEnd,
        handleTabMouseEnter,
        handleTabMouseLeave,
    } = useWorkflowTabs({
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
        inheritedGlobalDataModel,
        replaceDocument,
        getDocumentSnapshot,
        selectedNodeId,
        setSelectedNodeId,
        fitView,
        getViewport,
        setViewport,
        syncRustDocument: rustWorkflowDocument.syncEditorState,
        isDraggingNode,
    });

    const {
        canGoBack: canGoFocusBack,
        canGoForward: canGoFocusForward,
        goBack: goFocusBack,
        goForward: goFocusForward,
    } = useFocusHistory({
        activeTabId,
        selectedNodeId,
        tabs,
        switchTab,
        setNodes,
        setSlotNodes,
        setSelectedNodeId,
        setRightPanelTab,
        fitView,
    });

    const {
        handleCreateEmptySubMachine,
        hydrateSubMachineInheritedSlots,
        handleOpenSubMachine,
        handleCreateSubMachineFromSelected,
    } = useSubStateMachines({
        selectedNodes,
        activeTabId,
        getTabSnapshot,
        getTabsSnapshot,
        switchTab,
        openTab,
        behaviorDirectories,
        fetchSkillData,
        setContextMenu,
        checkSlotConnection,
        onStateMachineLoadStart: beginStateMachineLoad,
        onStateMachineLoadEnd: endStateMachineLoad,
    });

    const {
        handleOpenBehaviorFile,
        createBehaviorNode,
        createNode,
        getPackageSkillEvent,
    } = useEditorLibraryItems({
        skills,
        nodes,
        behaviorDirectories,
        fetchSkillData,
        hydrateSubMachineInheritedSlots,
        handleOpenSubMachine,
        switchTab,
        openTab,
        getTabsSnapshot,
        checkSlotConnection,
        beginStateMachineLoad,
        endStateMachineLoad,
    });

    const descendantGlobalDataModel = useMemo(() => {
        const blockedIds = [
            ...(inheritedGlobalDataModel || []),
            ...(globalDataModel || []),
        ]
            .filter((parameter) =>
                String(parameter.id || "").startsWith("_")
            )
            .map((parameter) => parameter.id);

        return collectDescendantGlobals(
            tabs,
            activeTabId,
            blockedIds
        );
    }, [
        tabs,
        activeTabId,
        globalDataModel,
        inheritedGlobalDataModel,
    ]);

    useEditorHistory({
        activeTabId,
        activeMode,
        isDraggingNode,
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
        setManualSlots,
        setGlobalDataModel,
        setSelectedNodeId,
        setRightPanelTab,
        updateNodeInternals,
        syncRustDocument: rustWorkflowDocument.syncEditorState,
    });


    const {
        semanticSlotNodes,
        nodeById,
        childIdsByParent,
        semanticChildrenByParent,
        hiddenNodeIds,
        slotNodeIdSet,
        injectedNodes,
        injectedSlotNodes,
    } = useEditorPresentationGraph({
        semanticNodes,
        slotNodes,
        isDraggingNode,
        nodes,
        edges,
        tabs,
        activeTabId,
        activeMode,
        slotConnectionDrag,
        handleAddLaneToParallel,
        handleOpenStateActions,
        handleOpenParameter,
        handleOpenSlot,
        handleOpenTransition,
        handleOpenSubMachine,
        handleToggleContainerCollapse: toggleContainerCollapse,
    });

    const selectedRawNode = useMemo(() => {
        const semanticNode =
            [...semanticNodes, ...semanticSlotNodes].find(
                (node) => node.id === selectedNodeId
            ) || null;

        if (!semanticNode || semanticNode.type === "slot") {
            return semanticNode;
        }

        // Reconcile pending slot edits from the live node while retaining the
        // semantic projection's drag-stable geometry and identity.
        const liveNode = nodes.find((node) => node.id === selectedNodeId);
        if (liveNode?.data && liveNode.data !== semanticNode.data) {
            return {
                ...semanticNode,
                data: liveNode.data,
            };
        }

        return semanticNode;
    }, [
        semanticNodes,
        semanticSlotNodes,
        nodes,
        selectedNodeId,
    ]);

    const selectedParallelLanes = useMemo(
        () => getParallelLaneSummaries(selectedRawNode, semanticChildrenByParent),
        [selectedRawNode, semanticChildrenByParent],
    );

    const {
        selectedSlotDetails,
        canvasSlotPathOptions,
        canvasSkillSlotOptions,
        selectedContainerOutgoingTransitions,
        editorProblems,
        errorProblemCount,
    } = useEditorAnalysis({
        tabs,
        activeTabId,
        semanticNodes,
        semanticSlotNodes,
        manualSlots,
        isDraggingNode,
        selectedRawNode,
        edges,
        globalDataModel,
        availableDataModel: availableDataModelParameters,
        behaviorDirectories,
        runRustReadQuery: rustWorkflowDocument.runReadQuery,
        validationRevision: rustWorkflowDocument.validationRevision,
    });

    const {
        selectedNode,
        selectedCloneSourceNode,
        selectedNodeClones,
        selectedActionDataModel,
        selectedActionExpressionVariables,
        hasInitialNode,
        handleMoveContainerTransition,
        handleNavigateCloneSource,
        handleUpdateSelectedSlotPath,
        handleUpdateSelectedSlotInherited,
        handleSelectSlotAccessSkill,
        handleNavigateDescendantSlotSkill,
        handleNavigateAncestorSlot,
    } = useEditorDetailsController({
        selectedRawNode,
        semanticNodes,
        tabs,
        activeTabId,
        availableDataModelParameters,
        selectedContainerOutgoingTransitions,
        moveContainerTransition,
        getNodes,
        setNodes,
        updateNodeInternals,
        handleToggleContainerCollapse: toggleContainerCollapse,
        clearAllEdgeSelection,
        selectEditorNode,
        fitView,
        setCenter,
        setHoveredSlotAccessNodeId,
        switchTab,
        handleOpenSubMachine,
        setRightPanelTab,
        updateSlotPath,
        updateSlotInherited,
    });

    const handleProblemClick = useProblemNavigation({
        edges,
        setEdges,
        setNodes,
        setSelectedNodeId,
        setActiveMode,
        setShowTransitionEdges,
        setActiveTab,
        setRightPanelTab,
        getNodes,
        setCenter,
        fitView,
        updateNodeInternals,
        selectEditorNode,
    });

    const {
        packages,
        directSkills,
        packageSkills,
        subPackages,
        searchedSkills,
        filteredSkills,
    } = useSkillLibraryView({
        skills: skills.skills,
        selectedPackage,
        selectedSubPackage,
        searchText,
        activeFilter,
    });

    const handleControlPointContextMenu = useCallback(
        (event, edgeId, pointId, edgeKind = "transition") => {
            event.preventDefault();
            event.stopPropagation();

            setContextMenu({
                kind: "control-point",
                x: event.clientX,
                y: event.clientY,
                edgeId,
                pointId,
                edgeKind,
                title: "Control point",
            });
        },
        []
    );

    const variableProblemNodeIds = useMemo(
        () =>
            new Set(
                editorProblems
                    .filter((problem) => problem.category === "Variables")
                    .flatMap((problem) =>
                        problem.focusNodeIds?.length
                            ? problem.focusNodeIds
                            : problem.nodeId
                                ? [problem.nodeId]
                                : []
                    )
                    .filter(Boolean)
            ),
        [editorProblems]
    );

    const {
        visibleNodes,
        visibleEdges,
        smartRoutingNodes,
        edgeFocusMode,
        nodeFocusMode,
    } = useEditorDisplay({
        hoveredEditorNodeId,
        hoveredEditorEdgeId,
        selectedNodes,
        selectedNodeId,
        edges,
        nodeById,
        slotNodeIdSet,
        slotEdges,
        updatePersistentEdgeControlPoints: updateEdgeControlPoints,
        controlPointInsertRequest,
        onControlPointContextMenu: handleControlPointContextMenu,
        hoveredSlotAccessNodeId,
        semanticNodes,
        semanticChildrenByParent,
        nodes,
        childIdsByParent,
        activeMode,
        showTransitionEdges,
        showSlotEdges,
        injectedNodes,
        injectedSlotNodes,
        isDraggingNode,
        draggingNodeId,
        hiddenNodeIds,
        parallelDropTargetId,
        compoundDropTargetId,
        problemNodeIds: variableProblemNodeIds,
    });


    const {
        runtimeLog,
        runtimePreparation,
        runtimePlayback,
        activeRuntimeChanges,
        runtimeChangesPanelOpen,
        setRuntimeChangesPanelOpen,
        playbackVisibleNodes,
        playbackVisibleEdges,
        handleLoadRuntimeLog,
        handleClearRuntimeLog,
        toggleRuntimePlayback,
        restartRuntimePlayback,
        seekRuntimePlayback,
        stepRuntimePlayback,
        setRuntimePlaybackDelay,
    } = useRuntimeReplay({
        tabs,
        activeTabId,
        nodes,
        edges,
        slotNodes,
        slotEdges,
        globalDataModel,
        visibleNodes,
        visibleEdges,
        fitView,
        switchTab,
        setActiveMode,
    });

    const {
        handleNodesChange,
        handleVisibleEdgesChange,
    } = useEditorFlowChanges({
        nodeById,
        slotNodeIdSet,
        onNodesChange,
        onSlotNodesChange,
        onEdgesChange,
        onSlotEdgesChange,
        nodes,
        edges,
        slotNodes,
        slotEdges,
        setNodes,
        setEdges,
        setSlotEdges,
        updateNodeInternals,
        syncRemovedStates: rustWorkflowDocument.syncRemovedStates,
        syncTransitionSources: rustWorkflowDocument.syncTransitionSources,
    });

    const {
        handleContextMenuOpen,
        handleSelectAction,
    } = useEditorContextMenu({
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
        updatePersistentEdgeControlPoints: updateEdgeControlPoints,
        handleVisibleEdgesChange,
        handleOpenSlot,
        clearAllEdgeSelection,
        getNodes,
        setCenter,
    });

    const {
        isFindOpen,
        setIsFindOpen,
        findQuery,
        setFindQuery,
        findResultIndex,
        setFindResultIndex,
        findInputRef,
        findPanelRef,
        findResults,
        focusFindResult,
    } = useEditorFind({
        activeMode,
        setActiveMode,
        semanticNodes,
        slotNodes,
        manualSlots,
        nodes,
        clearAllEdgeSelection,
        checkSlotConnection,
        selectEditorNode,
        fitView,
    });

    const {
        handleOpenDocument,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
        handleCloseTab,
        handleTabMiddleMouseDown,
        documentGuard,
        hasFilePath: activeWorkflowHasFilePath,
        isSaving: isWorkflowSaving,
        isOpening: isWorkflowOpening,
        documentNotice,
        dismissDocumentNotice,
        handleRetryDocumentAction,
    } = useWorkflowDocument({
        isDesktop: IS_DESKTOP,
        activeTab: activeWorkflowTab,
        getTabSnapshot,
        getTabsSnapshot,
        updateTab,
        replaceTabDocument,
        closeTab,
        fetchSkillData,
        hydrateSubMachineInheritedSlots,
        checkSlotConnection,
        onStateMachineLoadStart: beginStateMachineLoad,
        onStateMachineLoadEnd: endStateMachineLoad,
    });

    const {
        handleLibraryDragOver,
        handleLibraryDragLeave,
        handleLibraryDrop,
        handleAddLibrarySkill,
        libraryDropError,
        dismissLibraryDropError,
    } = useEditorLibraryDrop({
        activeMode,
        nodes,
        flowContainerRef,
        getTabSnapshot,
        screenToFlowPosition,
        setParallelDropTargetId,
        setCompoundDropTargetId,
        createBehaviorNode,
        createNode,
        checkSlotConnection,
        getNodes,
        setNodes,
        setSelectedNodeId,
        syncInsertedEditorStatesAfterCommit:
            rustWorkflowDocument.syncInsertedEditorStatesAfterCommit,
        syncInsertedParallelLaneStateAfterCommit:
            rustWorkflowDocument.syncInsertedParallelLaneStateAfterCommit,
    });

    const addLibrarySkill = useCallback(async (skill) => {
        const added = await handleAddLibrarySkill(skill);
        if (added) {
            setRightPanelTab("details");
            setActiveTab("allgemein");
        }
        return added;
    }, [handleAddLibrarySkill, setRightPanelTab]);

    const {
        isShortcutHelpOpen,
        setIsShortcutHelpOpen,
    } = useGlobalEditorShortcuts({
        activeMode,
        setActiveMode,
        activeTabId,
        contextMenu,
        setContextMenu,
        isDrawerOpen: drawerData.isOpen,
        setDrawerData,
        isCreateSlotModalOpen,
        setIsCreateSlotModalOpen,
        isFindOpen,
        setIsFindOpen,
        nodes,
        slotNodes,
        fitView,
        clearAllEdgeSelection,
        clearEditorNodeSelection,
        handleAddNewTab,
        handleCloseTab,
        canGoFocusBack,
        canGoFocusForward,
        goFocusBack,
        goFocusForward,
    });

    const selectLibraryPackage = useCallback((pkg) => {
        setSelectedPackage(pkg);
        setSelectedSubPackage(null);
    }, []);
    const reloadSkills = useCallback(() => fetchSkills({ manual: true }), [fetchSkills]);

    const detailsCallbacks = useEditorDetailsCallbacks({
        onNavigateCloneSource: handleNavigateCloneSource,
        onNavigateClone: handleNavigateCloneSource,
        onMoveContainerTransition: handleMoveContainerTransition,
        onNavigateTransitionNode: handleNavigateCloneSource,
        onHoverTransitionNode: (nodeId) => setHoveredEditorNodeId(nodeId || null),
        onOpenTransitionPanel: (sourceNodeId, eventId, targetNodeId = null, options = null) => {
            if (!sourceNodeId || (!options?.containerMode && !eventId)) return;
            openConditionDrawer(sourceNodeId, eventId, targetNodeId || null, null, options);
        },
        onAddParallelLane: () => handleAddLaneToParallel(selectedNode.id),
        onRenameParallelLane: (laneId, name) => handleRenameParallelLane(selectedNode.id, laneId, name),
        onMoveParallelLane: (laneId, direction) => handleMoveParallelLane(selectedNode.id, laneId, direction),
        onDeleteParallelLane: (laneId) => handleDeleteParallelLane(selectedNode.id, laneId),
        onSetInitial: () => setNodeAsInitial(selectedNode.id),
        onUpdateName: (name) => updateNodeName(selectedNode.id, name, false),
        onUpdateNameCommit: (name) => updateNodeName(selectedNode.id, name, true),
        onUpdateSrc: updateNodeSource,
        onUpdateEvent: updateNodeEvent,
        onSetEventTarget: setExistingTargetForEvent,
        onUpdateParameter: (index, value, commit = false) =>
            updateNodeParameter(selectedNode.id, index, value, commit),
        onUpdateStateActions: updateStateActions,
        onUpdateSendEvents: updateSendEvents,
        onUpdateInSlotPath: (index, value, commit = false) => updateSkillSlotPath(selectedNode.id, "read", index, value, commit),
        onUpdateOutSlotPath: (index, value, commit = false) => updateSkillSlotPath(selectedNode.id, "write", index, value, commit),
        onCheckSlots: checkSlotConnection,
        onUpdateSlotPath: handleUpdateSelectedSlotPath,
        onUpdateSlotInherited: handleUpdateSelectedSlotInherited,
        onHoverSlotAccessSkill: (nodeId) => setHoveredSlotAccessNodeId(nodeId || null),
        onSelectSlotAccessSkill: handleSelectSlotAccessSkill,
        onNavigateDescendantSlotSkill: handleNavigateDescendantSlotSkill,
        onNavigateAncestorSlot: handleNavigateAncestorSlot,
    });

    return (
        <div className="container">
            <Header
                onOpenFile={handleOpenDocument}
                onSaveFile={handleSaveCurrentTab}
                onSaveAsFile={handleSaveAsCurrentTab}
                hasFilePath={activeWorkflowHasFilePath}
                isSaving={isWorkflowSaving}
                isOpening={isWorkflowOpening}
                panels={panels}
            />
            <EditorNotice notice={documentNotice} onDismiss={dismissDocumentNotice}
                onRetry={handleRetryDocumentAction}
                onSaveAs={() => handleRetryDocumentAction({ forceSaveAs: true })} />
            <EditorNotice notice={libraryDropError} onDismiss={dismissLibraryDropError} />

            <div className="app" data-panel-mode={panels.isDocked ? "docked" : "drawers"}
                data-library-dragging={String(panels.libraryDragging)} data-panel-resizing={String(panels.resizing)}
                style={{
                    "--library-width": `${panels.libraryWidth}px`,
                    "--inspector-width": `${panels.inspectorWidth}px`,
                    "--library-drawer-width": `${Math.min(panels.preferences.libraryWidth, panels.libraryMaxWidth)}px`,
                    "--inspector-drawer-width": `${Math.min(panels.preferences.inspectorWidth, panels.inspectorMaxWidth)}px`,
                    "--library-resize-width": panels.isDocked && panels.libraryOpen ? "6px" : "0px",
                    "--inspector-resize-width": panels.isDocked && panels.inspectorOpen ? "6px" : "0px",
                }}>
                <EditorPanel side="library" panels={panels}>
                {leftLibraryTab === "skills" ? (
                    <SkillLibrary
                        searchText={searchText}
                        setSearchText={setSearchText}
                        activeFilter={activeFilter}
                        setActiveFilter={setActiveFilter}
                        packages={packages}
                        selectedPackage={selectedPackage}
                        setSelectedPackage={selectLibraryPackage}
                        searchedSkills={searchedSkills}
                        packageSkills={packageSkills}
                        filteredSkills={filteredSkills}
                        subPackages={subPackages}
                        selectedSubPackage={selectedSubPackage}
                        setSelectedSubPackage={setSelectedSubPackage}
                        directSkills={directSkills}
                        activeLibraryTab={leftLibraryTab}
                        onLibraryTabChange={setLeftLibraryTab}
                        onReloadSkills={reloadSkills}
                        isReloadingSkills={isReloadingSkills}
                        refreshVersion={skillLibraryRefreshVersion}
                        skillLibraryStatus={skillLibraryStatus}
                        skillLibraryError={skillLibraryError}
                        hasLoadedSkills={hasLoadedSkills}
                        skillCount={skills.skills.length}
                        fetchSkillData={fetchSkillData}
                        onAddSkill={addLibrarySkill}
                        canAddSkill={activeMode !== "code"}
                    />
                ) : (
                    <BehaviorLibrary
                        directories={behaviorDirectories}
                        onDirectoriesChange={setBehaviorDirectories}
                        onOpenBehavior={handleOpenBehaviorFile}
                        activeLibraryTab={leftLibraryTab}
                        onLibraryTabChange={setLeftLibraryTab}
                    />
                )}
                </EditorPanel>
                <EditorPanelResizer side="library" panels={panels} />

                <main className="editor-area">
                    <WorkflowTabBar
                        tabs={tabs}
                        activeTabId={activeTabId}
                        draggedTabId={draggedTabId}
                        switchTab={switchTab}
                        handleTabDragStart={handleTabDragStart}
                        handleTabDragOver={handleTabDragOver}
                        handleTabDragEnd={handleTabDragEnd}
                        handleTabMiddleMouseDown={handleTabMiddleMouseDown}
                        handleTabMouseEnter={handleTabMouseEnter}
                        handleTabMouseLeave={handleTabMouseLeave}
                        handleCloseTab={handleCloseTab}
                        handleAddNewTab={handleAddNewTab}
                        canGoFocusBack={canGoFocusBack}
                        canGoFocusForward={canGoFocusForward}
                        onFocusBack={goFocusBack}
                        onFocusForward={goFocusForward}
                    />

                    <EditorFindOverlay
                        isOpen={isFindOpen}
                        panelRef={findPanelRef}
                        inputRef={findInputRef}
                        query={findQuery}
                        setQuery={setFindQuery}
                        results={findResults}
                        resultIndex={findResultIndex}
                        setResultIndex={setFindResultIndex}
                        focusResult={focusFindResult}
                        onClose={() => setIsFindOpen(false)}
                    />

                    <div
                        ref={flowContainerRef}
                        id="workflow-tab-panel"
                        role="tabpanel"
                        aria-labelledby={`workflow-tab-${activeTabId}`}
                        tabIndex={0}
                        className="flow-container"
                        onPointerMove={(event) => {
                            editorPointerPositionRef.current = {
                                inside: true,
                                clientX: event.clientX,
                                clientY: event.clientY,
                            };
                        }}
                        onPointerLeave={() => {
                            editorPointerPositionRef.current = {
                                inside: false,
                                clientX: null,
                                clientY: null,
                            };
                        }}
                        onDragOver={handleLibraryDragOver}
                        onDragLeave={handleLibraryDragLeave}
                        onDrop={handleLibraryDrop}
                    >
                        <EditorCanvas
                            activeMode={activeMode}
                            setActiveMode={setActiveMode}
                            showTransitionEdges={showTransitionEdges}
                            setShowTransitionEdges={setShowTransitionEdges}
                            showSlotEdges={showSlotEdges}
                            setShowSlotEdges={setShowSlotEdges}
                            nodes={nodes}
                            edges={edges}
                            globalDataModel={globalDataModel}
                            manualSlots={manualSlots}
                            visibleNodes={playbackVisibleNodes}
                            visibleEdges={playbackVisibleEdges}
                            smartRoutingNodes={smartRoutingNodes}
                            edgeFocusMode={edgeFocusMode}
                            nodeFocusMode={nodeFocusMode}
                            contextMenu={contextMenu}
                            handleSelectAction={handleSelectAction}
                            hasGraphClipboard={hasGraphClipboard}
                            setIsCreateSlotModalOpen={setIsCreateSlotModalOpen}
                            isDraggingNode={isDraggingNode}
                            isOverTrash={isOverTrash}
                            handleNodesChange={handleNodesChange}
                            handleVisibleEdgesChange={handleVisibleEdgesChange}
                            onSelectionChange={handleGraphSelectionChange}
                            onConnect={onConnect}
                            handleConnectStart={handleConnectStart}
                            handleConnectEnd={handleConnectEnd}
                            onReconnect={onReconnect}
                            handleReconnectStart={handleReconnectStart}
                            handleReconnectEnd={handleReconnectEnd}
                            isValidConnection={isValidConnection}
                            handleEdgeClick={handleEdgeClick}
                            handleEdgeDoubleClick={handleEditorEdgeDoubleClick}
                            handleNodeClick={handleNodeClick}
                            handlePaneClick={handlePaneClick}
                            handleNodeMouseEnter={handleNodeMouseEnter}
                            handleNodeMouseLeave={handleNodeMouseLeave}
                            handleEdgeMouseEnter={handleEdgeMouseEnter}
                            handleEdgeMouseLeave={handleEdgeMouseLeave}
                            handleContextMenuOpen={handleContextMenuOpen}
                            handleOpenSubMachine={handleOpenSubMachine}
                            handleNodeDragStart={handleNodeDragStart}
                            handleNodeDrag={handleNodeDrag}
                            handleNodeDragStop={handleNodeDragStop}
                            runtimePlayback={runtimePlayback}
                            onLoadRuntimeLog={handleLoadRuntimeLog}
                            onRuntimePlayPause={toggleRuntimePlayback}
                            onRuntimeRestart={restartRuntimePlayback}
                            onRuntimePrevious={() => stepRuntimePlayback(-1)}
                            onRuntimeNext={() => stepRuntimePlayback(1)}
                            onRuntimeSeek={seekRuntimePlayback}
                            onRuntimeClear={handleClearRuntimeLog}
                            onRuntimeDelayChange={setRuntimePlaybackDelay}
                        />

                    </div>
                </main>

                <EditorPanelResizer side="inspector" panels={panels} />
                <EditorPanel side="inspector" panels={panels}>
                    <EditorInspectorPanel
                        rightPanelTab={rightPanelTab}
                        setRightPanelTab={setRightPanelTab}
                        selection={{
                            selectedNode,
                            cloneSourceNode: selectedCloneSourceNode,
                            cloneNodes: selectedNodeClones,
                            containerOutgoingTransitions: selectedContainerOutgoingTransitions,
                            parallelLanes: selectedParallelLanes,
                            hasInitialNode,
                            actionDataModel: selectedActionDataModel,
                            actionExpressionVariables: selectedActionExpressionVariables,
                            slotDetails: selectedSlotDetails,
                        }}
                        dataModel={{
                            global: globalDataModel,
                            inherited: inheritedGlobalDataModel,
                            descendant: descendantGlobalDataModel,
                            onUpdateParameter: updateGlobalParameter,
                            onAddParameter: addGlobalParameter,
                            onDeleteParameter: deleteGlobalParameter,
                        }}
                        problems={{
                            items: editorProblems,
                            errorCount: errorProblemCount,
                            onClick: handleProblemClick,
                        }}
                        runtime={{
                            log: runtimeLog,
                            panelOpen: runtimeChangesPanelOpen,
                            setPanelOpen: setRuntimeChangesPanelOpen,
                            playback: runtimePlayback,
                            changes: activeRuntimeChanges,
                        }}
                        details={{
                            callbacks: detailsCallbacks,
                            activeTab,
                            setActiveTab,
                            packages,
                            getPackageSkillEvent,
                            availableTargetNodes: semanticNodes,
                            availableSlotPaths: canvasSlotPathOptions,
                            parameterFocusRequest,
                            slotFocusRequest,
                            transitionFocusRequest,
                        }}
                    />
                </EditorPanel>
                <EditorPanelLedge side="library" panels={panels} />
                <EditorPanelLedge side="inspector" panels={panels} />
                {!panels.isDocked && panels.drawer && !panels.libraryDragging && (
                    <button type="button" className="editor-panel-backdrop" tabIndex={-1}
                        aria-label="Close side panel" onClick={() => panels.closePanel(panels.drawer)} />
                )}
            </div>

            <button
                type="button"
                className="hint-page-open-button nodrag nopan"
                onClick={() => setIsHintPageOpen(true)}
                title="Quick guide"
                aria-label="Open Bonsai UI quick guide"
            >
                ?
            </button>

            <EditorOverlays
                documentGuard={documentGuard}
                loading={stateMachineLoading}
                runtimePreparation={runtimePreparation}
                hint={{ isOpen: isHintPageOpen, onClose: () => setIsHintPageOpen(false) }}
                subMachine={{
                    pending: pendingSubMachineCreation,
                    onCancel: () => setPendingSubMachineCreation(null),
                    onConfirm: (fileConfig) => {
                        if (!pendingSubMachineCreation) return false;
                        return pendingSubMachineCreation.fromSelection
                            ? handleCreateSubMachineFromSelected(fileConfig)
                            : handleCreateEmptySubMachine(pendingSubMachineCreation.flowPosition, fileConfig);
                    },
                }}
                paste={{ pending: pendingSkillPaste, onCancel: cancelPendingSkillPaste, onResolve: resolvePendingSkillPaste }}
                shortcuts={{ isOpen: isShortcutHelpOpen, setIsOpen: setIsShortcutHelpOpen }}
                tabPathTooltip={tabPathTooltip}
                condition={{
                    drawer: drawerData,
                    variables: availableDataModelParameters,
                    onConfirm: handleConfirmDrawer,
                    onClose: () => {
                        setDrawerData((prev) => ({ ...prev, isOpen: false }));
                        clearTransitionSelection();
                    },
                }}
                slots={{
                    isOpen: isCreateSlotModalOpen,
                    onClose: () => setIsCreateSlotModalOpen(false),
                    onCreate: createManualSlot,
                    options: canvasSkillSlotOptions,
                }}
            />
        </div>
    );
}

export default function App() {
    return (
        <FeedbackProvider>
            <ReactFlowProvider>
                <AppContent />
            </ReactFlowProvider>
        </FeedbackProvider>
    );
}
