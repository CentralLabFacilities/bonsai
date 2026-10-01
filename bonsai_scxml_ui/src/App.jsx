import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FiChevronLeft, FiChevronRight, FiPlus, FiX } from "react-icons/fi";
import {
    ReactFlowProvider,
    useReactFlow,
    useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import Header from "./components/Header";
import SkillLibrary from "./components/SkillLibrary";
import BehaviorLibrary from "./components/BehaviorLibrary";
import DetailsPanel from "./components/DetailsPanel";
import WorkflowPanel from "./components/WorkflowPanel";
import ConditionModal from "./components/ConditionModal";
import ProblemsPanel from "./components/ProblemsPanel";
import CreateSlotModal from "./components/CreateSlotModal";
import CreateSubMachineModal from "./components/CreateSubMachineModal";
import EditorCanvas from "./components/EditorCanvas";
import WorkflowTabBar from "./components/WorkflowTabBar";
import EditorFindOverlay from "./components/EditorFindOverlay";
import EditorShortcutHelp from "./components/EditorShortcutHelp";
import HintPage from "./components/HintPage";

import {
    isTauri,
    initApiProxy,
} from "./tauri-client.js";
import {
    COLLAPSED_CONTAINER_WIDTH,
    COLLAPSED_CONTAINER_HEIGHT,
    getAbsoluteNodePosition,
    fitCompoundAndAncestorCompounds,
    growParallelToLaneContents,
    layoutStateContainerForExpansion,
} from "./utils/editorGeometry";
import {
    getLocalDataModelEntries,
    collectDescendantGlobals,
} from "./utils/editorScxml";
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
import { isEditorCloneNode } from "./utils/editorClones";
import "./App.css";

// Initialize API proxy for Tauri desktop mode (intercepts /api/* fetch calls)
initApiProxy();


// Detect if running in Tauri desktop app
const IS_DESKTOP = isTauri();

const DEFAULT_BEHAVIOR_DIRECTORIES = [
    {
        key: "ROBOCUP",
        path: "/robocup_ws/robocup",
        isDefault: true,
    },
];

const loadBehaviorDirectories = () => {
    try {
        const raw = window.localStorage.getItem(
            "bonsai.behaviorDirectories"
        );

        if (!raw) {
            return DEFAULT_BEHAVIOR_DIRECTORIES;
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return DEFAULT_BEHAVIOR_DIRECTORIES;
        }

        return parsed
            .filter(
                (entry) =>
                    entry &&
                    typeof entry.key === "string" &&
                    typeof entry.path === "string"
            )
            .map((entry) => ({
                ...entry,
                key: entry.key.trim().toUpperCase(),
            }))
            // Remove only the old built-in defaults. If the user added an
            // EXERCISE or CHALLENGE mapping themselves, keep it.
            .filter(
                (entry) =>
                    !(
                        entry.isDefault === true &&
                        (entry.key === "EXERCISE" ||
                            entry.key === "CHALLENGE")
                    )
            );
    } catch (error) {
        console.warn(
            "Could not load behavior directories:",
            error
        );
        return DEFAULT_BEHAVIOR_DIRECTORIES;
    }
};



function AppContent() {
    const {
        skills,
        isReloadingSkills,
        skillLibraryRefreshVersion,
        fetchSkills,
        fetchSkillData,
    } = useSkillDefinitions();
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [selectedSubPackage, setSelectedSubPackage] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Everything");
    const [searchText, setSearchText] = useState("");
    const [contextMenu, setContextMenu] = useState(null);
    const [controlPointInsertRequest, setControlPointInsertRequest] = useState(null);
    const updateNodeInternals = useUpdateNodeInternals();
    const [leftLibraryTab, setLeftLibraryTab] = useState("skills");
    const [behaviorDirectories, setBehaviorDirectories] = useState(
        loadBehaviorDirectories
    );

    useEffect(() => {
        window.localStorage.setItem(
            "bonsai.behaviorDirectories",
            JSON.stringify(behaviorDirectories)
        );
    }, [behaviorDirectories]);

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
        setInheritedGlobalDataModel,
        replaceDocument,
    } = useEditorGraphState();

    const [isHintPageOpen, setIsHintPageOpen] = useState(false);

    const [activeMode, setActiveMode] = useState("overview");
    const [showTransitionEdges, setShowTransitionEdges] = useState(() => {
        try {
            return window.localStorage.getItem("bonsai.showTransitionEdges") !== "false";
        } catch {
            return true;
        }
    });
    const [showSlotEdges, setShowSlotEdges] = useState(() => {
        try {
            return window.localStorage.getItem("bonsai.showSlotEdges") !== "false";
        } catch {
            return true;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(
                "bonsai.showTransitionEdges",
                String(showTransitionEdges)
            );
        } catch {
            // Local storage is optional; the in-memory toggle still works.
        }
    }, [showTransitionEdges]);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                "bonsai.showSlotEdges",
                String(showSlotEdges)
            );
        } catch {
            // Local storage is optional; the in-memory toggle still works.
        }
    }, [showSlotEdges]);


    const [isCreateSlotModalOpen, setIsCreateSlotModalOpen] = useState(false);
    const [pendingSubMachineCreation, setPendingSubMachineCreation] = useState(null);
    const [stateMachineLoading, setStateMachineLoading] = useState(null);

    const beginStateMachineLoad = useCallback((label = "State machine") => {
        setStateMachineLoading({ label });
    }, []);

    const endStateMachineLoad = useCallback(() => {
        setStateMachineLoading(null);
    }, []);
    // Slot creation belongs to the slot-centric views only. If the user switches
    // to Event or Code mode while the dialog is open, close it immediately.
    useEffect(() => {
        if (activeMode !== "slots" && activeMode !== "overview") {
            setIsCreateSlotModalOpen(false);
        }
    }, [activeMode]);
    const [activeTab, setActiveTab] = useState("allgemein");
    const [rightPanelTab, setRightPanelTab] = useState("datamodel");

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
        commitNodeParameters,
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
        syncEditorStructureAfterCommit:
            rustWorkflowDocument.syncEditorStructureAfterCommit,
        syncStateEditorPositions:
            rustWorkflowDocument.syncStateEditorPositions,
        syncTransitionsForSource:
            rustWorkflowDocument.syncTransitionsForSource,
        syncStateParameters: rustWorkflowDocument.syncStateParameters,
        syncSlotsAfterCommit: rustWorkflowDocument.syncSlotsAfterCommit,
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
        syncEditorStructureAfterCommit:
            rustWorkflowDocument.syncEditorStructureAfterCommit,
        syncStateEditorPositions:
            rustWorkflowDocument.syncStateEditorPositions,
        syncSlotsAfterCommit: rustWorkflowDocument.syncSlotsAfterCommit,
    });
    const previousActiveModeRef = useRef(activeMode);

    useEffect(() => {
        const previousMode = previousActiveModeRef.current;
        previousActiveModeRef.current = activeMode;

        if (previousMode !== "code" || activeMode === "code") return;

        // Code View unmounts React Flow. Wait until the canvas has mounted and
        // measured its nodes again, then restore a useful workflow viewport.
        let frameA = null;
        let frameB = null;
        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const currentNodes = getNodes();
                const skillNodes = currentNodes.filter(
                    (node) =>
                        !node.hidden &&
                        (node.type === "custom" || node.type === "submachine")
                );
                const focusNodes =
                    skillNodes.length > 0
                        ? skillNodes
                        : currentNodes.filter(
                            (node) =>
                                !node.hidden &&
                                node.type !== "slot" &&
                                node.type !== "parallelLane"
                        );

                if (focusNodes.length === 0) return;
                fitView({
                    nodes: focusNodes.map((node) => ({ id: node.id })),
                    padding: 0.22,
                    maxZoom: 1.15,
                    duration: 260,
                });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [activeMode, fitView, getNodes]);

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
        syncEditorStructureAfterCommit:
            rustWorkflowDocument.syncEditorStructureAfterCommit,
    });

    const semanticNodes = useEditorGraphMaintenance({
        nodes,
        isDraggingNode,
        selectedNodeId,
        setNodes,
        setEdges,
        setSelectedNodeId,
    });

    const [newParamId, setNewParamId] = useState("");
    const [newParamExpr, setNewParamExpr] = useState("");

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
        syncEditorStructureAfterCommit:
            rustWorkflowDocument.syncEditorStructureAfterCommit,
    });

    const {
        tabs,
        setTabs,
        activeTabId,
        activeTab: activeWorkflowTab,
        updateActiveTab,
        tabPathTooltip,
        draggedTabId,
        switchTab,
        openTab,
        handleAddNewTab,
        handleCloseTab,
        handleTabDragStart,
        handleTabDragOver,
        handleTabDragEnd,
        handleTabMiddleMouseDown,
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
        selectedNodeId,
        setSelectedNodeId,
        fitView,
        getViewport,
        setViewport,
        syncRustDocument: rustWorkflowDocument.syncEditorState,
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
        nodes,
        edges,
        selectedNodes,
        tabs,
        activeTabId,
        switchTab,
        openTab,
        globalDataModel,
        inheritedGlobalDataModel,
        behaviorDirectories,
        fetchSkillData,
        setActiveTab,
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
        tabs,
        behaviorDirectories,
        fetchSkillData,
        hydrateSubMachineInheritedSlots,
        handleOpenSubMachine,
        switchTab,
        openTab,
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




    // Hilfsfunktion: Bounding Box um alle ausgewählten Nodes berechnen


    // 1. Compound State erstellen


    // 2. Parallel State erstellen


    // 3. Sub-State-Machine erstellen & direkt in neuem Tab öffnen


    const handleToggleContainerCollapse = useCallback(
        (containerId) => {
            setNodes((currentNodes) => {
                const container = currentNodes.find(
                    (node) => node.id === containerId
                );

                if (
                    !container ||
                    (container.type !== "compound" &&
                        container.type !== "parallel")
                ) {
                    return currentNodes;
                }

                const isCollapsed = Boolean(container.data?.isCollapsed);

                if (!isCollapsed) {
                    const expandedWidth =
                        Number(container.width) ||
                        Number(container.measured?.width) ||
                        Number(container.style?.width) ||
                        (container.type === "compound" ? 320 : 420);
                    const expandedHeight =
                        Number(container.height) ||
                        Number(container.measured?.height) ||
                        Number(container.style?.height) ||
                        (container.type === "compound" ? 220 : 295);

                    return currentNodes.map((node) => {
                        if (node.id !== containerId) return node;

                        return {
                            ...node,
                            width: COLLAPSED_CONTAINER_WIDTH,
                            height: COLLAPSED_CONTAINER_HEIGHT,
                            style: {
                                ...(node.style || {}),
                                width: COLLAPSED_CONTAINER_WIDTH,
                                height: COLLAPSED_CONTAINER_HEIGHT,
                                minHeight: COLLAPSED_CONTAINER_HEIGHT,
                            },
                            data: {
                                ...(node.data || {}),
                                isCollapsed: true,
                                expandedContainerSize: {
                                    width: expandedWidth,
                                    height: expandedHeight,
                                    minHeight: node.style?.minHeight ?? null,
                                },
                            },
                        };
                    });
                }

                const savedSize = container.data?.expandedContainerSize || {};
                const restoredStyle = {
                    ...(container.style || {}),
                    width:
                        Number(savedSize.width) ||
                        Number(container.style?.width) ||
                        (container.type === "compound" ? 320 : 420),
                    height:
                        Number(savedSize.height) ||
                        (container.type === "compound" ? 220 : 295),
                };

                if (savedSize.minHeight == null) {
                    delete restoredStyle.minHeight;
                } else {
                    restoredStyle.minHeight = savedSize.minHeight;
                }

                const restoredWidth =
                    Number(savedSize.width) ||
                    Number(container.width) ||
                    Number(restoredStyle.width) ||
                    (container.type === "compound" ? 320 : 420);
                const restoredHeight =
                    Number(savedSize.height) ||
                    (container.type === "compound" ? 220 : 295);

                restoredStyle.width = restoredWidth;
                restoredStyle.height = restoredHeight;

                const expandedNodes = currentNodes.map((node) => {
                    if (node.id !== containerId) return node;

                    return {
                        ...node,
                        width: restoredWidth,
                        height: restoredHeight,
                        style: restoredStyle,
                        data: {
                            ...(node.data || {}),
                            isCollapsed: false,
                        },
                    };
                });

                // First settle the descendants (nested states and sibling
                // collisions), then compute the exact frame around the final
                // child positions. Unlike the normal grow-only helpers this is
                // allowed to shrink an outdated expanded size as well.
                return layoutStateContainerForExpansion(
                    expandedNodes,
                    containerId
                );
            });

            requestAnimationFrame(() => {
                const containerIds = getNodes()
                    .filter((node) =>
                        ["compound", "parallel", "parallelLane"].includes(
                            node.type
                        )
                    )
                    .map((node) => node.id);

                if (containerIds.length === 0) {
                    updateNodeInternals(containerId);
                } else {
                    containerIds.forEach((id) => updateNodeInternals(id));
                }
            });

            setSelectedNodeId(containerId);
        },
        [getNodes, setNodes, updateNodeInternals]
    );


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
        handleToggleContainerCollapse,
    });

    const selectedRawNode = useMemo(
        () =>
            [...semanticNodes, ...semanticSlotNodes].find(
                (node) => node.id === selectedNodeId
            ) || null,
        [semanticNodes, semanticSlotNodes, selectedNodeId]
    );

    // Keep a clicked slot selected as the slot itself. Previously slot nodes
    // were converted to the first skill that used the path, which prevented a
    // dedicated slot detail view and made multi-skill slots ambiguous.
    const selectedNode = selectedRawNode;

    const selectedCloneSourceNode = useMemo(() => {
        if (!isEditorCloneNode(selectedNode)) return null;
        return semanticNodes.find(
            (node) => node.id === selectedNode.data?.cloneOfNodeId
        ) || null;
    }, [selectedNode, semanticNodes]);

    const selectedNodeClones = useMemo(() => {
        if (!selectedNode || isEditorCloneNode(selectedNode)) return [];

        return semanticNodes.filter(
            (node) =>
                node.id !== selectedNode.id &&
                node.data?.cloneOfNodeId === selectedNode.id
        );
    }, [selectedNode, semanticNodes]);

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
    });

    const handleMoveContainerTransition = useCallback(
        (edgeId, direction) => {
            if (
                !selectedNode ||
                (selectedNode.type !== "compound" &&
                    selectedNode.type !== "parallel")
            ) {
                return;
            }

            moveContainerTransition(
                selectedNode.id,
                selectedContainerOutgoingTransitions,
                edgeId,
                direction
            );
        },
        [
            selectedNode,
            selectedContainerOutgoingTransitions,
            moveContainerTransition,
        ]
    );

    const handleNavigateCloneSource = useCallback((nodeId) => {
        if (!nodeId) return;

        const flowNodes = getNodes();
        const byId = new Map(flowNodes.map((node) => [node.id, node]));
        const collapsedAncestors = [];
        let parentId = byId.get(nodeId)?.parentId;
        const visited = new Set();

        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            const parent = byId.get(parentId);
            if (!parent) break;
            if (
                (parent.type === "compound" || parent.type === "parallel") &&
                parent.data?.isCollapsed
            ) {
                collapsedAncestors.push(parent.id);
            }
            parentId = parent.parentId;
        }

        collapsedAncestors.reverse().forEach((containerId) =>
            handleToggleContainerCollapse(containerId)
        );

        clearAllEdgeSelection();
        selectEditorNode(nodeId, { kind: "node", tab: null });

        window.setTimeout(() => {
            const flowNode = getNodes().find((node) => node.id === nodeId);
            if (!flowNode) {
                fitView({
                    nodes: [{ id: nodeId }],
                    padding: 0.8,
                    maxZoom: 1.2,
                    duration: 250,
                });
                return;
            }

            const position = getAbsoluteNodePosition(
                flowNode,
                getNodes()
            );
            const width =
                Number(flowNode.measured?.width) ||
                Number(flowNode.width) ||
                220;
            const height =
                Number(flowNode.measured?.height) ||
                Number(flowNode.height) ||
                90;

            setCenter(
                position.x + width / 2,
                position.y + height / 2,
                { zoom: 1, duration: 300 }
            );
        }, 40);
    }, [
        clearAllEdgeSelection,
        fitView,
        getNodes,
        handleToggleContainerCollapse,
        selectEditorNode,
        setCenter,
    ]);



    // OnEntry/OnExit has asymmetric scope for sub-state-machines:
    // - assignment location belongs to the child machine's local datamodel
    // - assignment expression is evaluated in the parent workflow scope
    const selectedActionDataModel = useMemo(() => {
        if (!selectedNode || selectedNode.type !== "submachine") {
            return availableDataModelParameters;
        }

        const srcFileName = String(selectedNode.data?.src || "")
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.(xml|scxml)$/i, "");

        // Prefer the live child tab when the sub-state machine is currently
        // open. This means Entry/Exit assignment locations immediately track
        // edits to the child machine's own datamodel.
        const childTab = tabs.find((tab) => {
            if (tab.parentTabId !== activeTabId) return false;

            const tabFileName = String(tab.fileName || "")
                .split(/[\\/]/)
                .pop()
                ?.replace(/\.(xml|scxml)$/i, "");

            return (
                (tab.sourcePath &&
                    String(tab.sourcePath) === String(selectedNode.data?.src || "")) ||
                String(tab.title || "") === String(selectedNode.data?.label || "") ||
                (srcFileName && tabFileName === srcFileName)
            );
        });

        if (childTab) {
            return getLocalDataModelEntries(childTab.globalDataModel);
        }

        // A behavior that has not been opened yet is hydrated with its local
        // datamodel when its source file is inspected. Never fall back to the
        // parent's datamodel for a sub-state-machine action.
        return getLocalDataModelEntries(
            selectedNode.data?.localDataModel || []
        );
    }, [
        selectedNode,
        tabs,
        activeTabId,
        availableDataModelParameters,
    ]);

    const selectedActionExpressionVariables = useMemo(() => {
        // The expression of an action attached to a sub-state-machine is
        // evaluated by the parent state machine. Therefore @variable
        // references must come from the parent/current workflow, not from the
        // child machine whose local datamodel supplies `location`.
        return availableDataModelParameters;
    }, [availableDataModelParameters]);

    const selectedInitialScopeParentId =
        selectedNode?.parentId || null;

    const hasInitialNode = useMemo(
        () =>
            semanticNodes.some(
                (node) =>
                    Boolean(node.data?.isInitial) &&
                    (node.parentId || null) === selectedInitialScopeParentId
            ),
        [semanticNodes, selectedInitialScopeParentId]
    );

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

    const updatePersistentEdgeControlPoints = useCallback(
        (edgeId, controlPoints, edgeKind = "transition") => {
            const setter =
                edgeKind === "slot" ? setSlotEdges : setEdges;

            setter((currentEdges) =>
                currentEdges.map((edge) =>
                    edge.id === edgeId
                        ? {
                            ...edge,
                            data: {
                                ...(edge.data || {}),
                                controlPoints,
                            },
                        }
                        : edge
                )
            );

            setControlPointInsertRequest((current) =>
                current?.edgeId === edgeId ? null : current
            );
        },
        [setEdges, setSlotEdges]
    );

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
        updatePersistentEdgeControlPoints,
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
        updatePersistentEdgeControlPoints,
        handleVisibleEdgesChange,
        handleOpenSlot,
        clearAllEdgeSelection,
        getNodes,
        setCenter,
    });

    const handleUpdateSelectedSlotPath = useCallback(
        (nextPath) => updateSlotPath(selectedRawNode, nextPath),
        [selectedRawNode, updateSlotPath]
    );

    const handleUpdateSelectedSlotInherited = useCallback(
        (shouldInherit) =>
            updateSlotInherited(selectedRawNode, shouldInherit),
        [selectedRawNode, updateSlotInherited]
    );

    const handleCreateManualSlot = createManualSlot;

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
        hasFilePath: activeWorkflowHasFilePath,
        isSaving: isWorkflowSaving,
    } = useWorkflowDocument({
        isDesktop: IS_DESKTOP,
        nodes,
        edges,
        manualSlots,
        globalDataModel,
        activeTab: activeWorkflowTab,
        updateActiveTab,
        replaceDocument,
        setSelectedNodeId,
        fetchSkillData,
        hydrateSubMachineInheritedSlots,
        checkSlotConnection,
        fitView,
        onStateMachineLoadStart: beginStateMachineLoad,
        onStateMachineLoadEnd: endStateMachineLoad,
        syncRustDocument: rustWorkflowDocument.syncEditorState,
    });

    const {
        handleLibraryDragOver,
        handleLibraryDragLeave,
        handleLibraryDrop,
    } = useEditorLibraryDrop({
        activeMode,
        nodes,
        screenToFlowPosition,
        setParallelDropTargetId,
        setCompoundDropTargetId,
        createBehaviorNode,
        createNode,
        checkSlotConnection,
        getNodes,
        setNodes,
        setSelectedNodeId,
        syncEditorStructureAfterCommit:
            rustWorkflowDocument.syncEditorStructureAfterCommit,
    });

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

    return (
        <div className="container">
            <Header
                onOpenFile={handleOpenDocument}
                onSaveFile={handleSaveCurrentTab}
                onSaveAsFile={handleSaveAsCurrentTab}
                hasFilePath={activeWorkflowHasFilePath}
                isSaving={isWorkflowSaving}
            />

            {stateMachineLoading && (
                <div
                    className="state-machine-loading-overlay"
                    role="status"
                    aria-live="polite"
                    aria-label={`Loading ${stateMachineLoading.label}`}
                >
                    <div className="state-machine-loading-card">
                        <div className="state-machine-loading-spinner" aria-hidden="true" />
                        <div className="state-machine-loading-title">
                            Loading state machine
                        </div>
                        <div className="state-machine-loading-label">
                            {stateMachineLoading.label}
                        </div>
                    </div>
                </div>
            )}

            {runtimePreparation && (
                <div
                    className="runtime-replay-loading-overlay"
                    role="status"
                    aria-live="polite"
                    aria-label={`Preparing runtime replay ${runtimePreparation.fileName || ""}`}
                >
                    <div className="runtime-replay-loading-card">
                        <div className="runtime-replay-loading-spinner" aria-hidden="true" />
                        <div className="runtime-replay-loading-title">
                            Preparing runtime replay
                        </div>
                        <div className="runtime-replay-loading-file">
                            {runtimePreparation.fileName}
                        </div>
                        <div className="runtime-replay-loading-phase">
                            {runtimePreparation.phase}
                        </div>
                        <div
                            className="runtime-replay-loading-progress"
                            aria-hidden="true"
                        >
                            <span
                                style={{
                                    width: `${Math.max(0, Math.min(1, runtimePreparation.progress || 0)) * 100}%`,
                                }}
                            />
                        </div>
                        <div className="runtime-replay-loading-percent">
                            {Math.round(
                                Math.max(0, Math.min(1, runtimePreparation.progress || 0)) * 100
                            )}%
                        </div>
                    </div>
                </div>
            )}

            {isHintPageOpen && (
                <HintPage onClose={() => setIsHintPageOpen(false)} />
            )}

            <CreateSubMachineModal
                isOpen={Boolean(pendingSubMachineCreation)}
                defaultDirectory={pendingSubMachineCreation?.defaultDirectory || ""}
                defaultFileName={pendingSubMachineCreation?.defaultFileName || "SubMachine.xml"}
                onCancel={() => setPendingSubMachineCreation(null)}
                onConfirm={async (fileConfig) => {
                    if (!pendingSubMachineCreation) return false;
                    if (pendingSubMachineCreation.fromSelection) {
                        return await handleCreateSubMachineFromSelected(fileConfig);
                    }
                    return await handleCreateEmptySubMachine(
                        pendingSubMachineCreation.flowPosition,
                        fileConfig
                    );
                }}
            />

            {pendingSkillPaste && (
                <div
                    className="skill-paste-choice-overlay"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            cancelPendingSkillPaste();
                        }
                    }}
                >
                    <div
                        className="skill-paste-choice-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="skill-paste-choice-title"
                    >
                        <h3 id="skill-paste-choice-title">
                            Paste {pendingSkillPaste.sourceTypeLabel || "State"}
                        </h3>
                        <p>
                            How should <strong>{pendingSkillPaste.label}</strong> be pasted?
                        </p>
                        <div className="skill-paste-choice-options">
                            <button
                                type="button"
                                className="skill-paste-choice-option"
                                onClick={() => resolvePendingSkillPaste("clone")}
                            >
                                <span className="skill-paste-choice-option-title">Reference</span>
                                <span className="skill-paste-choice-option-description">
                                    Inbound-only reference to the original state.
                                </span>
                            </button>
                            <button
                                type="button"
                                className="skill-paste-choice-option"
                                onClick={() => resolvePendingSkillPaste("copy")}
                            >
                                <span className="skill-paste-choice-option-title">Copy</span>
                                <span className="skill-paste-choice-option-description">
                                    Create an independent copy of the selected state.
                                </span>
                            </button>
                        </div>
                        <button
                            type="button"
                            className="skill-paste-choice-cancel"
                            onClick={cancelPendingSkillPaste}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="app">
                {leftLibraryTab === "skills" ? (
                    <SkillLibrary
                        searchText={searchText}
                        setSearchText={setSearchText}
                        activeFilter={activeFilter}
                        setActiveFilter={setActiveFilter}
                        packages={packages}
                        selectedPackage={selectedPackage}
                        setSelectedPackage={(pkg) => {
                            setSelectedPackage(pkg);
                            setSelectedSubPackage(null);
                        }}
                        searchedSkills={searchedSkills}
                        packageSkills={packageSkills}
                        filteredSkills={filteredSkills}
                        subPackages={subPackages}
                        selectedSubPackage={selectedSubPackage}
                        setSelectedSubPackage={setSelectedSubPackage}
                        directSkills={directSkills}
                        activeLibraryTab={leftLibraryTab}
                        onLibraryTabChange={setLeftLibraryTab}
                        onReloadSkills={() => fetchSkills({ manual: true })}
                        isReloadingSkills={isReloadingSkills}
                        refreshVersion={skillLibraryRefreshVersion}
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

                <div className="right-panel-shell">
                    <div className="right-panel-tabs">
                        <button
                            type="button"
                            className={`right-panel-tab ${rightPanelTab === "datamodel" ? "active" : ""}`}
                            onClick={() => setRightPanelTab("datamodel")}
                        >
                            Data
                        </button>

                        {selectedNode && (
                            <button
                                type="button"
                                className={`right-panel-tab ${rightPanelTab === "details" ? "active" : ""}`}
                                onClick={() => setRightPanelTab("details")}
                            >
                                {selectedNode.type === "slot" ? "Slot Details" : "Skill Detail"}
                            </button>
                        )}

                        <button
                            type="button"
                            className={`right-panel-tab ${rightPanelTab === "problems" ? "active" : ""}`}
                            onClick={() => setRightPanelTab("problems")}
                        >
                            <span>Problems</span>
                            {editorProblems.length > 0 && (
                                <span
                                    className={`right-panel-problem-count ${
                                        errorProblemCount > 0
                                            ? "has-errors"
                                            : "warnings-only"
                                    }`}
                                >
                                    {editorProblems.length}
                                </span>
                            )}
                        </button>
                    </div>
                    {runtimeLog && (
                        <aside
                            className={`runtime-changes-drawer ${
                                runtimeChangesPanelOpen ? "open" : "closed"
                            }`}
                            aria-label="Runtime changes"
                        >
                            <button
                                type="button"
                                className="runtime-changes-drawer-ledge"
                                onClick={() =>
                                    setRuntimeChangesPanelOpen((value) => !value)
                                }
                                title={
                                    runtimeChangesPanelOpen
                                        ? "Close runtime changes"
                                        : "Open runtime changes"
                                }
                                aria-expanded={runtimeChangesPanelOpen}
                            >
                                {runtimeChangesPanelOpen ? (
                                    <FiChevronRight />
                                ) : (
                                    <FiChevronLeft />
                                )}
                            </button>

                            {runtimeChangesPanelOpen && (
                                <div className="runtime-changes-drawer-content">
                                    <div className="runtime-changes-drawer-header">
                                        <div>
                                            <strong>Runtime changes</strong>
                                            <span>
                                                {runtimePlayback.currentStep
                                                    ? `Step ${runtimePlayback.stepIndex + 1} · ${runtimePlayback.currentStep.timestamp}`
                                                    : "No timestep selected"}
                                            </span>
                                        </div>
                                        {runtimePlayback.currentStep?.tabTitle && (
                                            <span
                                                className="runtime-changes-context"
                                                title="State-machine tab used for this runtime step"
                                            >
                                                {runtimePlayback.currentStep.tabTitle}
                                            </span>
                                        )}
                                    </div>

                                    {!activeRuntimeChanges ? (
                                        <div className="runtime-changes-empty">
                                            Start playback or click the timeline to inspect writes and assignments.
                                        </div>
                                    ) : (
                                        <div className="runtime-changes-groups">
                                            {activeRuntimeChanges.slotWrites.length > 0 && (
                                                <section className="runtime-changes-group">
                                                    <h4>Slot writes</h4>
                                                    {activeRuntimeChanges.slotWrites.map((change) => (
                                                        <div
                                                            key={`slot-${change.line}-${change.state}-${change.value}`}
                                                            className="runtime-change-row"
                                                        >
                                                            <div className="runtime-change-main">
                                                                <code>
                                                                    {change.paths?.length > 0
                                                                        ? change.paths.join(", ")
                                                                        : change.slotKey || change.localState || change.state}
                                                                </code>
                                                                <span className="runtime-change-arrow">→</span>
                                                                <strong>{String(change.value)}</strong>
                                                            </div>
                                                            <span className="runtime-change-meta">
                                                                {change.localState || change.state}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </section>
                                            )}

                                            {activeRuntimeChanges.variables.length > 0 && (
                                                <section className="runtime-changes-group">
                                                    <h4>Variables</h4>
                                                    {activeRuntimeChanges.variables.map((change) => (
                                                        <div
                                                            key={`data-${change.line}-${change.key}`}
                                                            className="runtime-change-row"
                                                        >
                                                            <div className="runtime-change-main">
                                                                <code>{change.localKey || change.key}</code>
                                                                <span className="runtime-change-arrow">→</span>
                                                                <strong>
                                                                    {String(
                                                                        change.evaluated
                                                                            ? change.evaluatedValue
                                                                            : change.value
                                                                    )}
                                                                </strong>
                                                            </div>
                                                            <span className="runtime-change-meta">
                                                                {change.localState || change.state}
                                                                {change.evaluated && change.previousValue !== undefined
                                                                    ? ` · previous: ${String(change.previousValue)}`
                                                                    : ""}
                                                                {change.expr
                                                                    ? ` · expr: ${change.expr}`
                                                                    : ""}
                                                                {change.localKey && change.localKey !== change.key
                                                                    ? ` · runtime: ${change.key}`
                                                                    : ""}
                                                                {!change.evaluated && change.evaluationError
                                                                    ? ` · could not evaluate: ${change.evaluationError}`
                                                                    : ""}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </section>
                                            )}

                                            {activeRuntimeChanges.parameters.length > 0 && (
                                                <section className="runtime-changes-group">
                                                    <h4>Parameters</h4>
                                                    {activeRuntimeChanges.parameters.map((change) => (
                                                        <div
                                                            key={`parameter-${change.line}-${change.state}-${change.key}`}
                                                            className="runtime-change-row"
                                                        >
                                                            <div className="runtime-change-main">
                                                                <code>{change.key}</code>
                                                                <span className="runtime-change-arrow">→</span>
                                                                <strong>{String(change.value)}</strong>
                                                            </div>
                                                            <span className="runtime-change-meta">
                                                                {change.localState || change.state}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </section>
                                            )}

                                            {activeRuntimeChanges.slotWrites.length === 0 &&
                                                activeRuntimeChanges.variables.length === 0 &&
                                                activeRuntimeChanges.parameters.length === 0 && (
                                                    <div className="runtime-changes-empty">
                                                        No slot writes, variable changes, or parameter assignments in this step.
                                                    </div>
                                                )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </aside>
                    )}

                    <div className="right-panel-content">
                        {rightPanelTab === "datamodel" && (
                            <WorkflowPanel
                                globalDataModel={globalDataModel}
                                inheritedGlobalDataModel={inheritedGlobalDataModel}
                                descendantGlobalDataModel={descendantGlobalDataModel}
                                newParamId={newParamId}
                                setNewParamId={setNewParamId}
                                newParamExpr={newParamExpr}
                                setNewParamExpr={setNewParamExpr}
                                onUpdateGlobalParam={updateGlobalParameter}
                                onAddParameter={(parameterId, parameterExpr) => {
                                    if (!String(parameterId || "").trim()) return;
                                    addGlobalParameter(parameterId, parameterExpr);
                                    setNewParamId("");
                                    setNewParamExpr("");
                                }}
                                onDeleteParameter={deleteGlobalParameter}
                            />
                        )}

                        {rightPanelTab === "problems" && (
                            <ProblemsPanel
                                problems={editorProblems}
                                onProblemClick={handleProblemClick}
                            />
                        )}

                        {rightPanelTab === "details" && selectedNode && (
                            <DetailsPanel
                                selectedNode={selectedNode}
                                cloneSourceNode={selectedCloneSourceNode}
                                onNavigateCloneSource={handleNavigateCloneSource}
                                cloneNodes={selectedNodeClones}
                                onNavigateClone={handleNavigateCloneSource}
                                containerOutgoingTransitions={selectedContainerOutgoingTransitions}
                                onMoveContainerTransition={handleMoveContainerTransition}
                                onNavigateTransitionNode={handleNavigateCloneSource}
                                onHoverTransitionNode={(nodeId) =>
                                    setHoveredEditorNodeId(nodeId || null)
                                }
                                onOpenTransitionPanel={(
                                    sourceNodeId,
                                    eventId,
                                    targetNodeId = null,
                                    options = null
                                ) => {
                                    if (!sourceNodeId) return;
                                    if (!options?.containerMode && !eventId) return;

                                    openConditionDrawer(
                                        sourceNodeId,
                                        eventId,
                                        targetNodeId || null,
                                        null,
                                        options
                                    );
                                }}
                                hasInitialNode={hasInitialNode}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                packages={packages}
                                getPackageSkillEvent={getPackageSkillEvent}
                                onSetInitial={() =>
                                    setNodeAsInitial(selectedNode.id)
                                }
                                onUpdateName={(name) =>
                                    updateNodeName(selectedNode.id, name, false)
                                }
                                onUpdateNameCommit={(name) =>
                                    updateNodeName(selectedNode.id, name, true)
                                }
                                onUpdateSrc={updateNodeSource}
                                onUpdateEvent={updateNodeEvent}
                                availableTargetNodes={nodes}
                                onSetEventTarget={setExistingTargetForEvent}
                                onUpdateParameter={(idx, val) => {
                                    const nextParams = updateNodeParameter(
                                        selectedNode.id,
                                        idx,
                                        val
                                    );

                                    // Clearing a parameter changes the configured
                                    // skill just as adding one does. Refresh right
                                    // away and pass the new parameter list explicitly
                                    // so the request cannot see stale React state.
                                    if (
                                        nextParams &&
                                        String(val ?? "").trim() === ""
                                    ) {
                                        updateEventsFromParameters(
                                            selectedNode.id,
                                            nextParams
                                        );
                                    }
                                }}

                                onUpdateParameterBlur={(nodeId) => {
                                    commitNodeParameters(nodeId);
                                    updateEventsFromParameters(nodeId);
                                }}
                                globalDataModel={selectedActionDataModel}
                                actionValueVariables={selectedActionExpressionVariables}
                                onUpdateStateActions={updateStateActions}
                                onUpdateSendEvents={updateSendEvents}
                                onUpdateInSlotPath={(idx, val, commit = false) =>
                                    updateSkillSlotPath(
                                        selectedNode.id,
                                        "read",
                                        idx,
                                        val,
                                        commit
                                    )
                                }
                                onUpdateOutSlotPath={(idx, val, commit = false) =>
                                    updateSkillSlotPath(
                                        selectedNode.id,
                                        "write",
                                        idx,
                                        val,
                                        commit
                                    )
                                }
                                onCheckSlots={checkSlotConnection}
                                availableSlotPaths={canvasSlotPathOptions}
                                slotDetails={selectedSlotDetails}
                                onUpdateSlotPath={handleUpdateSelectedSlotPath}
                                onUpdateSlotInherited={handleUpdateSelectedSlotInherited}
                                onHoverSlotAccessSkill={(nodeId) =>
                                    setHoveredSlotAccessNodeId(nodeId || null)
                                }
                                onSelectSlotAccessSkill={(nodeId) => {
                                    if (!nodeId) return;

                                    setHoveredSlotAccessNodeId(null);
                                    clearAllEdgeSelection();
                                    selectEditorNode(nodeId, {
                                        kind: "node",
                                        tab: null,
                                    });

                                    // Selection alone is easy to miss in a large graph. Move
                                    // the viewport to the clicked Accessed-by skill as well.
                                    window.setTimeout(() => {
                                        const flowNode = getNodes().find(
                                            (node) => node.id === nodeId
                                        );
                                        if (!flowNode) {
                                            fitView({
                                                nodes: [{ id: nodeId }],
                                                padding: 0.8,
                                                maxZoom: 1.2,
                                                duration: 250,
                                            });
                                            return;
                                        }

                                        const position =
                                            flowNode.positionAbsolute ||
                                            flowNode.position ||
                                            { x: 0, y: 0 };
                                        const width =
                                            Number(flowNode.measured?.width) ||
                                            Number(flowNode.width) ||
                                            220;
                                        const height =
                                            Number(flowNode.measured?.height) ||
                                            Number(flowNode.height) ||
                                            90;

                                        setCenter(
                                            position.x + width / 2,
                                            position.y + height / 2,
                                            { zoom: 1, duration: 300 }
                                        );
                                    }, 50);
                                }}
                                onNavigateAncestorSlot={(tabId, nodeId = null) => {
                                    if (!tabId) return;

                                    if (tabId !== activeTabId) {
                                        switchTab(tabId);
                                    }
                                    setRightPanelTab("details");

                                    if (!nodeId) return;

                                    // Wait until the parent tab's graph has been installed,
                                    // then select and center the hierarchy writer there.
                                    window.setTimeout(() => {
                                        selectEditorNode(nodeId, {
                                            kind: "node",
                                            allowMissing: true,
                                            tab: null,
                                        });

                                        window.setTimeout(() => {
                                            const flowNode = getNodes().find(
                                                (node) => node.id === nodeId
                                            );
                                            if (!flowNode) {
                                                fitView({
                                                    nodes: [{ id: nodeId }],
                                                    padding: 0.8,
                                                    maxZoom: 1.2,
                                                    duration: 250,
                                                });
                                                return;
                                            }

                                            const position =
                                                flowNode.positionAbsolute ||
                                                flowNode.position ||
                                                { x: 0, y: 0 };
                                            const width =
                                                Number(flowNode.measured?.width) ||
                                                Number(flowNode.width) ||
                                                220;
                                            const height =
                                                Number(flowNode.measured?.height) ||
                                                Number(flowNode.height) ||
                                                90;
                                            setCenter(
                                                position.x + width / 2,
                                                position.y + height / 2,
                                                { zoom: 1, duration: 300 }
                                            );
                                        }, 60);
                                    }, tabId === activeTabId ? 0 : 80);
                                }}
                                parameterFocusRequest={parameterFocusRequest}
                                slotFocusRequest={slotFocusRequest}
                                transitionFocusRequest={transitionFocusRequest}
                            />
                        )}
                    </div>
                </div>
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

            <EditorShortcutHelp
                isOpen={isShortcutHelpOpen}
                setIsOpen={setIsShortcutHelpOpen}
            />

            {tabPathTooltip &&
                createPortal(
                    <div
                        className="workflow-tab-path-tooltip"
                        style={{
                            left: tabPathTooltip.left,
                            top: tabPathTooltip.top,
                        }}
                    >
                        {tabPathTooltip.path}
                    </div>,
                    document.body
                )}

            <ConditionModal
                isOpen={drawerData.isOpen}
                onClose={() => {
                    setDrawerData((prev) => ({ ...prev, isOpen: false }));
                    clearTransitionSelection();
                }}
                onConfirm={handleConfirmDrawer}
                globalVariables={availableDataModelParameters}
                sourceNodeName={drawerData.sourceNodeName}
                sourceEventName={drawerData.sourceEventName}
                candidateTransitions={drawerData.candidateTransitions}
                availableEvents={drawerData.availableEvents}
                availableTargets={drawerData.availableTargets}
                initialTransitionId={drawerData.initialTransitionId}
                initialTargetId={drawerData.initialTargetId}
                targetOnlyMode={drawerData.targetOnlyMode}
            />

            <CreateSlotModal
                isOpen={isCreateSlotModalOpen}
                onClose={() => setIsCreateSlotModalOpen(false)}
                onCreate={handleCreateManualSlot}
                skillSlotOptions={canvasSkillSlotOptions}
            />
        </div>
    );
}

export default function App() {
    return (
        <ReactFlowProvider>
            <AppContent />
        </ReactFlowProvider>
    );
}

