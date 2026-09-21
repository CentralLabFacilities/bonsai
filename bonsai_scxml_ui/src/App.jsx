import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FiPlus, FiX } from "react-icons/fi";
import {
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
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
import HintPage from "./components/HintPage";

import { parseScxmlFile, extractBehaviorExitEventsFromScxml } from "./utils/scxmlImport";
import { DEFAULT_PREFIX_CONFIG, resolveSrcPath } from "./config/prefixMapping";
import {
    isTauri,
    initApiProxy,
    readWorkflowSource,
} from "./tauri-client.js";
import {
    normalizeSlotPath,
    normalizeSlotType,
    extractInheritedSlotsFromScxml,
    collectInheritedSlotUsages,
    isSlotEdge,
    getSlotPathFromNode,
    EDITOR_SHORTCUTS,
    FIND_SHORTCUTS,
} from "./utils/editorGraph";
import {
    getNodeId,
    PARALLEL_EXIT_GUTTER,
    PARALLEL_NODE_GAP,
    COMPOUND_NODE_GAP,
    COMPOUND_PADDING_X,
    COMPOUND_HEADER_HEIGHT,
    COMPOUND_BOTTOM_PADDING,
    getCompoundExitGutterWidth,
    getNodeSize,
    getAbsoluteNodePosition,
    orderNodesParentsFirst,
    normalizeContainerAutoExpansion,
    resolveNodeCollisionsAndRefit,
    normalizeParallelLaneCompounds,
    normalizeCompoundInitialStates,
} from "./utils/editorGeometry";
import {
    getForwardingNopScxmlStateId,
    getSharedScxmlStateId,
    getSharedScxmlStateKey,
    normalizeSharedScxmlStateIdentity,
    ensureSharedEditorInstanceIds,
    getLocalDataModelEntries,
    collectDescendantGlobals,
} from "./utils/editorScxml";
import { useEditorHistory } from "./hooks/useEditorHistory";
import { useNodeInteraction } from "./hooks/useNodeInteraction";
import { useSlotGraph } from "./hooks/useSlotGraph";
import { useSkillDefinitions } from "./hooks/useSkillDefinitions";
import { useWorkflowTabs } from "./hooks/useWorkflowTabs";
import { useFocusHistory } from "./hooks/useFocusHistory";
import { useScxmlDocument } from "./hooks/useScxmlDocument";
import { useEditorAnalysis } from "./hooks/useEditorAnalysis";
import { useEditorDisplay } from "./hooks/useEditorDisplay";
import { useSkillLibraryView } from "./hooks/useSkillLibraryView";
import { useNodeDrag } from "./hooks/useNodeDrag";
import { useSubStateMachines } from "./hooks/useSubStateMachines";
import { useTransitionGraph } from "./hooks/useTransitionGraph";
import { useContainerCreation } from "./hooks/useContainerCreation";
import "./App.css";

// Initialize API proxy for Tauri desktop mode (intercepts /api/* fetch calls)
initApiProxy();


// Detect if running in Tauri desktop app
const IS_DESKTOP = isTauri();


const isCloneableSkillNode = (node) => {
    if (!node || node.type !== "custom" || node.data?.isSkillClone) {
        return false;
    }

    const skillName = String(node.data?.fullSkillName || node.data?.label || "")
        .split("#")[0]
        .split(".")
        .pop()
        .toLowerCase();

    return !(
        node.data?.isFinal ||
        node.data?.isBehaviorExit ||
        skillName === "end" ||
        skillName === "fatal"
    );
};

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



const cloneGraphValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(cloneGraphValue);
    }

    if (value && typeof value === "object") {
        const clone = {};
        Object.entries(value).forEach(([key, entry]) => {
            clone[key] = cloneGraphValue(entry);
        });
        return clone;
    }

    // Keep functions and primitives as-is. Node data contains callbacks that
    // must remain callable after an internal copy/paste.
    return value;
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
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [slotNodes, setSlotNodes, onSlotNodesChange] = useNodesState([]);
    const [slotEdges, setSlotEdges, onSlotEdgesChange] = useEdgesState([]);
    // Internal graph clipboard. This intentionally does not use the system
    // clipboard: Ctrl+C copies the current React Flow selection and
    // Ctrl+V recreates it with fresh graph IDs.
    const graphClipboardRef = useRef(null);
    // Keep an authoritative snapshot of React Flow's current selection.
    // Reading `node.selected` from the controlled nodes array can lag behind
    // the interaction by a render, especially when Ctrl/Meta multi-selecting.
    const graphSelectionRef = useRef(new Set());
    const handleGraphSelectionChange = useCallback(({ nodes: selectedFlowNodes = [] }) => {
        graphSelectionRef.current = new Set(
            selectedFlowNodes.map((node) => node.id)
        );
    }, []);
    const pasteSequenceRef = useRef(0);

    // Editor-wide Find (Ctrl+F): searches skill/behavior nodes and slot paths
    // in the currently active workflow.
    const [isFindOpen, setIsFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState("");
    const [findResultIndex, setFindResultIndex] = useState(0);
    const findInputRef = useRef(null);
    const findPanelRef = useRef(null);
    const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
    const [isHintPageOpen, setIsHintPageOpen] = useState(false);

    const [activeMode, setActiveMode] = useState("event");
    const [manualSlots, setManualSlots] = useState([]);
    const [isCreateSlotModalOpen, setIsCreateSlotModalOpen] = useState(false);
    const [pendingSkillPaste, setPendingSkillPaste] = useState(null);
    const pendingSkillPasteActionRef = useRef(null);
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

    const { screenToFlowPosition, fitView, getNodes, setCenter } = useReactFlow();
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
    });

    // Semantic node snapshots intentionally ignore position/selection changes.
    // During an active drag the only live change is geometry, so keep the
    // semantic snapshot completely frozen instead of scanning all nodes.
    const semanticNodesRef = useRef([]);
    const semanticNodesDependency = isDraggingNode ? null : nodes;
    const semanticNodes = useMemo(() => {
        const previous = semanticNodesRef.current;
        if (!semanticNodesDependency) return previous;

        const unchanged =
            previous.length === semanticNodesDependency.length &&
            semanticNodesDependency.every((node, index) => {
                const oldNode = previous[index];
                return (
                    oldNode?.id === node.id &&
                    oldNode?.type === node.type &&
                    oldNode?.parentId === node.parentId &&
                    oldNode?.data === node.data
                );
            });

        if (unchanged) return previous;

        const next = semanticNodesDependency.map((node) => ({
            id: node.id,
            type: node.type,
            parentId: node.parentId,
            data: node.data,
        }));
        semanticNodesRef.current = next;
        return next;
    }, [semanticNodesDependency]);

    useEffect(() => {
        if (isDraggingNode) return;

        setNodes((currentNodes) => {
            const withAutoExpansion =
                normalizeContainerAutoExpansion(currentNodes);
            const withParallelLaneCompounds =
                normalizeParallelLaneCompounds(withAutoExpansion);

            return normalizeCompoundInitialStates(
                withParallelLaneCompounds
            );
        });
    }, [semanticNodes, isDraggingNode, setNodes]);

    useEffect(() => {
        if (isDraggingNode) return;

        const semanticNodeIds = new Set(semanticNodes.map((node) => node.id));
        const danglingCloneIds = new Set(
            semanticNodes
                .filter(
                    (node) =>
                        node.data?.isSkillClone &&
                        (!node.data?.cloneOfNodeId ||
                            !semanticNodeIds.has(node.data.cloneOfNodeId))
                )
                .map((node) => node.id)
        );

        if (danglingCloneIds.size > 0) {
            setEdges((currentEdges) =>
                currentEdges.filter(
                    (edge) =>
                        !danglingCloneIds.has(edge.source) &&
                        !danglingCloneIds.has(edge.target)
                )
            );

            if (danglingCloneIds.has(selectedNodeId)) {
                setSelectedNodeId(null);
            }
        }

        setNodes((currentNodes) => {
            const byId = new Map(
                currentNodes.map((node) => [node.id, node])
            );
            let changed = false;
            const nextNodes = [];

            currentNodes.forEach((node) => {
                if (!node.data?.isSkillClone) {
                    nextNodes.push(node);
                    return;
                }

                const sourceNode = byId.get(node.data?.cloneOfNodeId);
                if (!sourceNode || sourceNode.data?.isSkillClone) {
                    changed = true;
                    return;
                }

                const nextLabel = sourceNode.data?.label || node.data?.label;
                const nextFullSkillName =
                    sourceNode.data?.fullSkillName || node.data?.fullSkillName;

                if (
                    node.data?.label === nextLabel &&
                    node.data?.fullSkillName === nextFullSkillName
                ) {
                    nextNodes.push(node);
                    return;
                }

                changed = true;
                nextNodes.push({
                    ...node,
                    data: {
                        ...(node.data || {}),
                        label: nextLabel,
                        fullSkillName: nextFullSkillName,
                    },
                });
            });

            return changed ? nextNodes : currentNodes;
        });
    }, [
        semanticNodes,
        isDraggingNode,
        selectedNodeId,
        setNodes,
        setEdges,
        setSelectedNodeId,
    ]);

    const [globalDataModel, setGlobalDataModel] = useState([
        { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
        { id: "Test: global data", expr: "testen" },
    ]);
    const [inheritedGlobalDataModel, setInheritedGlobalDataModel] = useState([]);
    const [newParamId, setNewParamId] = useState("");
    const [newParamExpr, setNewParamExpr] = useState("");

    const {
        drawerData,
        setDrawerData,
        slotConnectionDrag,
        isValidConnection,
        handleConnectStart,
        handleConnectEnd,
        onConnect,
        clearTransitionSelection,
        clearAllEdgeSelection,
        selectTransitionEdge,
        selectSlotEdge,
        onEdgeDoubleClick,
        handleConfirmDrawer,
        updateNodeEvent,
        setExistingTargetForEvent,
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
    });

    const {
        tabs,
        setTabs,
        activeTabId,
        setActiveTabId,
        tabPathTooltip,
        setTabPathTooltip,
        draggedTabId,
        switchTab,
        handleAddNewTab,
        handleCloseTab,
        handleTabDragStart,
        handleTabDragOver,
        handleTabDragEnd,
        handleTabMiddleMouseDown,
    } = useWorkflowTabs({
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
        inheritedGlobalDataModel,
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
        setManualSlots,
        setGlobalDataModel,
        setInheritedGlobalDataModel,
        setSelectedNodeId,
        fitView,
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
        slotNodes,
        slotEdges,
        manualSlots,
        tabs,
        setTabs,
        activeTabId,
        setActiveTabId,
        switchTab,
        globalDataModel,
        setGlobalDataModel,
        inheritedGlobalDataModel,
        setInheritedGlobalDataModel,
        behaviorDirectories,
        fetchSkillData,
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
        setManualSlots,
        setSelectedNodeId,
        setActiveTab,
        setContextMenu,
        fitView,
        checkSlotConnection,
        onStateMachineLoadStart: beginStateMachineLoad,
        onStateMachineLoadEnd: endStateMachineLoad,
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
    });




    // IDE-style workflow navigation/search shortcuts. Ctrl+Tab cycles
    // workflow tabs; Shift reverses direction. Ctrl+F opens the editor
    // search instead of the browser's page search.
    useEffect(() => {
        const handleEditorShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

            const key = String(event.key || "").toLowerCase();

            const isTabShortcut =
                key === "tab" ||
                event.code === "Tab" ||
                event.keyCode === 9;

            if (isTabShortcut) {
                if (tabs.length <= 1) return;

                // Handle this in the capture phase so React Flow / focused UI
                // controls cannot consume Shift+Tab before workflow navigation.
                event.preventDefault();
                event.stopPropagation();

                const currentIndex = Math.max(
                    0,
                    tabs.findIndex((tab) => tab.id === activeTabId)
                );
                const direction = event.shiftKey ? -1 : 1;
                const nextIndex =
                    (currentIndex + direction + tabs.length) % tabs.length;

                switchTab(tabs[nextIndex].id);
                return;
            }

            if (key === "f") {
                const target = event.target;
                const insideCodeEditor =
                    target instanceof Element &&
                    Boolean(target.closest(".monaco-editor, .cm-editor"));

                // Preserve the native editor search when the user is actively
                // editing code. Everywhere else Ctrl+F searches the graph.
                if (insideCodeEditor) return;

                event.preventDefault();
                setIsFindOpen(true);
            }
        };

        // Capture-phase listener is important for Ctrl+Shift+Tab: focused
        // components often use Shift+Tab for their own backwards focus order.
        window.addEventListener("keydown", handleEditorShortcut, true);
        return () =>
            window.removeEventListener("keydown", handleEditorShortcut, true);
    }, [tabs, activeTabId, switchTab]);

    useEffect(() => {
        if (!isFindOpen) return;

        requestAnimationFrame(() => {
            findInputRef.current?.focus();
            findInputRef.current?.select();
        });
    }, [isFindOpen]);

    // Dismiss the editor search as soon as the user clicks anywhere outside
    // the search panel. Capture phase makes this work reliably even when the
    // click lands on React Flow or another component that stops propagation.
    useEffect(() => {
        if (!isFindOpen) return;

        const handlePointerDownOutsideFind = (event) => {
            const panel = findPanelRef.current;
            if (panel && !panel.contains(event.target)) {
                setIsFindOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDownOutsideFind, true);
        return () =>
            document.removeEventListener(
                "pointerdown",
                handlePointerDownOutsideFind,
                true
            );
    }, [isFindOpen]);

    const handleContextMenuOpen = useCallback((event, clickedNode = null) => {
        event.preventDefault();
        event.stopPropagation();

        if (clickedNode && !clickedNode.selected) {
            setNodes((nds) =>
                nds.map((n) => ({
                    ...n,
                    selected: n.id === clickedNode.id,
                }))
            );
            setSelectedNodeId(clickedNode.id);
        }

        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            flowPosition: flowPos,
        });
    }, [screenToFlowPosition, setNodes]);

    const canCreateSkillClone =
        selectedNodes.length === 1 &&
        isCloneableSkillNode(selectedNodes[0]);

    const handleCreateSkillClone = useCallback(() => {
        if (!contextMenu?.flowPosition) return;

        const sourceNode = selectedNodes.length === 1
            ? selectedNodes[0]
            : null;

        if (!isCloneableSkillNode(sourceNode)) return;

        const cloneNode = {
            id: getNodeId(),
            position: {
                x: Number(contextMenu.flowPosition.x || 0) + 220,
                y: Number(contextMenu.flowPosition.y || 0),
            },
            type: "custom",
            selected: true,
            data: {
                label: sourceNode.data?.label || "Skill",
                fullSkillName:
                    sourceNode.data?.fullSkillName ||
                    sourceNode.data?.label ||
                    "Skill",
                isSkillClone: true,
                cloneOfNodeId: sourceNode.id,
                isInitial: false,
                isFinal: false,
                events: [],
                inSlots: [],
                outSlots: [],
                params: [],
                onEntry: [],
                onExit: [],
            },
        };

        setNodes((currentNodes) => [
            ...currentNodes.map((node) => ({
                ...node,
                selected: false,
            })),
            cloneNode,
        ]);
        setSelectedNodeId(cloneNode.id);
        setRightPanelTab("details");
        setActiveTab("allgemein");
    }, [
        contextMenu,
        selectedNodes,
        setNodes,
        setSelectedNodeId,
        setRightPanelTab,
        setActiveTab,
    ]);

    const handleSelectAction = (type) => {
        const hasSelection = selectedNodes.length > 0;

        if (type === "clone") {
            handleCreateSkillClone();
        } else if (type === "compound") {
            if (hasSelection) {
                handleCreateCompoundFromSelected();
            } else {
                handleCreateEmptyCompound(contextMenu.flowPosition);
            }
        } else if (type === "parallel") {
            if (hasSelection) {
                handleCreateParallelFromSelected();
            } else {
                handleCreateEmptyParallel(contextMenu.flowPosition);
            }
        } else if (type === "submachine") {
            const nextIndex = nodes.filter((node) => node.type === "submachine").length + 1;
            setPendingSubMachineCreation({
                fromSelection: hasSelection,
                flowPosition: contextMenu.flowPosition,
                defaultDirectory: behaviorDirectories[0]?.path || "",
                defaultFileName: `SubMachine_${nextIndex}.xml`,
            });
        } else if (type === "slot") {
            if (activeMode === "slots" || activeMode === "overview") {
                setIsCreateSlotModalOpen(true);
            }
        }

        setContextMenu(null);
    };

    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu) setContextMenu(null);
        };
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, [contextMenu]);















    const semanticSlotNodesRef = useRef([]);
    const semanticSlotNodesDependency = isDraggingNode ? null : slotNodes;
    const semanticSlotNodes = useMemo(() => {
        const previous = semanticSlotNodesRef.current;
        if (!semanticSlotNodesDependency) return previous;

        const unchanged =
            previous.length === semanticSlotNodesDependency.length &&
            semanticSlotNodesDependency.every((node, index) => {
                const oldNode = previous[index];
                return (
                    oldNode?.id === node.id &&
                    oldNode?.type === node.type &&
                    oldNode?.data === node.data
                );
            });

        if (unchanged) return previous;

        const next = semanticSlotNodesDependency.map((node) => ({
            id: node.id,
            type: node.type,
            parentId: node.parentId,
            data: node.data,
        }));
        semanticSlotNodesRef.current = next;
        return next;
    }, [semanticSlotNodesDependency]);

    // Shared graph indexes replace repeated nodes.find()/nodes.filter() scans
    // in display-only edge construction and hover/normalization helpers.
    const nodeById = useMemo(
        () => new Map(semanticNodes.map((node) => [node.id, node])),
        [semanticNodes]
    );

    const slotNodeIdSet = useMemo(
        () => new Set(semanticSlotNodes.map((node) => node.id)),
        [semanticSlotNodes]
    );

    // Parent/child membership is semantic and does not change while a node is
    // merely moving. Store child IDs from the semantic snapshot so the index is
    // not rebuilt on every drag frame. Layout code can resolve those IDs to the
    // current node objects only when it actually needs geometry.
    const childIdsByParent = useMemo(() => {
        const index = new Map();
        semanticNodes.forEach((node) => {
            if (!node.parentId) return;
            if (!index.has(node.parentId)) {
                index.set(node.parentId, []);
            }
            index.get(node.parentId).push(node.id);
        });
        return index;
    }, [semanticNodes]);

    const semanticChildrenByParent = useMemo(() => {
        const index = new Map();
        semanticNodes.forEach((node) => {
            if (!node.parentId) return;
            if (!index.has(node.parentId)) {
                index.set(node.parentId, []);
            }
            index.get(node.parentId).push(node);
        });
        return index;
    }, [semanticNodes]);

    // Hilfsfunktion: Bounding Box um alle ausgewählten Nodes berechnen


    // 1. Compound State erstellen


    // 2. Parallel State erstellen


    // 3. Sub-State-Machine erstellen & direkt in neuem Tab öffnen


    const handleToggleContainerCollapse = useCallback(
        (containerId) => {
            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (node.id !== containerId) return node;
                    if (node.type !== "compound" && node.type !== "parallel") {
                        return node;
                    }

                    const isCollapsed = Boolean(node.data?.isCollapsed);

                    if (!isCollapsed) {
                        // NodeResizer writes the resized dimensions onto the real
                        // React Flow node. Remember those dimensions before
                        // replacing the height with the compact collapsed height.
                        const expandedWidth =
                            Number(node.width) ||
                            Number(node.measured?.width) ||
                            Number(node.style?.width) ||
                            (node.type === "compound" ? 320 : 420);
                        const expandedHeight =
                            Number(node.height) ||
                            Number(node.measured?.height) ||
                            Number(node.style?.height) ||
                            (node.type === "compound" ? 220 : 295);
                        const collapsedHeight =
                            node.type === "compound"
                                ? Math.max(
                                    48,
                                    28 +
                                    (Array.isArray(node.data?.events)
                                        ? node.data.events.length
                                        : 0) *
                                    22
                                )
                                : 44;

                        return {
                            ...node,
                            // NodeResizer stores the current size on the node's
                            // top-level width/height fields. Those values take
                            // precedence over style.width/style.height in React
                            // Flow, so collapse has to update both places.
                            width: expandedWidth,
                            height: collapsedHeight,
                            style: {
                                ...(node.style || {}),
                                width: expandedWidth,
                                height: collapsedHeight,
                                minHeight: collapsedHeight,
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
                    }

                    const savedSize = node.data?.expandedContainerSize || {};
                    const restoredStyle = {
                        ...(node.style || {}),
                        width:
                            Number(savedSize.width) ||
                            Number(node.style?.width) ||
                            (node.type === "compound" ? 320 : 420),
                        height:
                            Number(savedSize.height) ||
                            (node.type === "compound" ? 220 : 295),
                    };

                    if (savedSize.minHeight == null) {
                        delete restoredStyle.minHeight;
                    } else {
                        restoredStyle.minHeight = savedSize.minHeight;
                    }

                    const restoredWidth =
                        Number(savedSize.width) ||
                        Number(node.width) ||
                        Number(restoredStyle.width) ||
                        (node.type === "compound" ? 320 : 420);
                    const restoredHeight =
                        Number(savedSize.height) ||
                        (node.type === "compound" ? 220 : 295);

                    restoredStyle.width = restoredWidth;
                    restoredStyle.height = restoredHeight;

                    return {
                        ...node,
                        // Restore the actual React Flow dimensions as well as
                        // the CSS dimensions so an expanded, previously resized
                        // container returns to exactly its saved size.
                        width: restoredWidth,
                        height: restoredHeight,
                        style: restoredStyle,
                        data: {
                            ...(node.data || {}),
                            isCollapsed: false,
                        },
                    };
                })
            );

            // Force React Flow to re-measure the node after changing its actual
            // dimensions. This is important after the node has been resized.
            requestAnimationFrame(() => updateNodeInternals(containerId));

            // Keep the visible container selected rather than leaving a hidden
            // child selected in the details panel after collapsing it.
            setSelectedNodeId(containerId);
        },
        [setNodes, updateNodeInternals]
    );

    const hiddenNodeIds = useMemo(() => {
        const hidden = new Set();

        semanticNodes
            .filter(
                (node) =>
                    (node.type === "compound" || node.type === "parallel") &&
                    Boolean(node.data?.isCollapsed)
            )
            .forEach((container) => {
                const queue = [
                    ...(semanticChildrenByParent.get(container.id) || []),
                ];

                while (queue.length > 0) {
                    const child = queue.shift();
                    if (!child || hidden.has(child.id)) continue;
                    hidden.add(child.id);
                    queue.push(
                        ...(semanticChildrenByParent.get(child.id) || [])
                    );
                }
            });

        return hidden;
    }, [semanticNodes, semanticChildrenByParent]);


    // Keep the injected React Flow node objects stable whenever the source
    // node itself did not change. During a drag React Flow normally replaces
    // only the moved node; recreating wrappers for every other node forces
    // unnecessary custom-node renders.
    const injectedNodeCacheRef = useRef(new Map());
    const injectedSlotNodeCacheRef = useRef(new Map());

    const injectedNodes = useMemo(() => {
        const previousCache = injectedNodeCacheRef.current;
        const nextCache = new Map();

        const result = nodes.map((n) => {
            const hidden = hiddenNodeIds.has(n.id);
            let childTab = null;

            if (n.type === "submachine") {
                const srcFileName = String(n.data?.src || "")
                    .split(/[\\/]/)
                    .pop()
                    ?.replace(/\.(xml|scxml)$/i, "");

                childTab = tabs.find((tab) => {
                    if (tab.parentTabId !== activeTabId) return false;

                    const tabFileName = String(tab.fileName || "")
                        .split(/[\\/]/)
                        .pop()
                        ?.replace(/\.(xml|scxml)$/i, "");

                    return (
                        (tab.sourcePath &&
                            String(tab.sourcePath) === String(n.data?.src || "")) ||
                        String(tab.title || "") === String(n.data?.label || "") ||
                        (srcFileName && tabFileName === srcFileName)
                    );
                }) || null;
            }

            const cached = previousCache.get(n.id);
            const childGlobalDataModel = childTab?.globalDataModel || null;
            const canReuse = Boolean(
                cached &&
                cached.sourceNode === n &&
                cached.hidden === hidden &&
                cached.activeMode === activeMode &&
                cached.slotConnectionDrag === slotConnectionDrag &&
                cached.childGlobalDataModel === childGlobalDataModel &&
                cached.handleOpenStateActions === handleOpenStateActions &&
                cached.handleOpenParameter === handleOpenParameter &&
                cached.handleOpenSlot === handleOpenSlot &&
                cached.handleOpenTransition === handleOpenTransition &&
                cached.handleToggleContainerCollapse === handleToggleContainerCollapse &&
                (n.type !== "submachine" ||
                    cached.handleOpenSubMachine === handleOpenSubMachine) &&
                (n.type !== "parallel" ||
                    cached.handleAddLaneToParallel === handleAddLaneToParallel)
            );

            if (canReuse) {
                nextCache.set(n.id, cached);
                return cached.value;
            }

            const injectedData = {
                ...n.data,
                mode: activeMode,
                onOpenStateActions: handleOpenStateActions,
                onOpenParameter: handleOpenParameter,
                onOpenSlot: handleOpenSlot,
                onOpenTransition: handleOpenTransition,
                slotConnectionDrag,
                onToggleCollapse: handleToggleContainerCollapse,
            };

            if (n.type === "submachine") {
                injectedData.onOpenSubMachine = handleOpenSubMachine;

                if (childTab) {
                    injectedData.localDataModel = getLocalDataModelEntries(
                        childTab.globalDataModel
                    );
                }
            }

            if (n.type === "parallel") {
                injectedData.onAddLane = handleAddLaneToParallel;
            }

            const value = {
                ...n,
                hidden,
                data: injectedData,
            };

            nextCache.set(n.id, {
                sourceNode: n,
                hidden,
                activeMode,
                slotConnectionDrag,
                childGlobalDataModel,
                handleOpenStateActions,
                handleOpenParameter,
                handleOpenSlot,
                handleOpenTransition,
                handleToggleContainerCollapse,
                handleOpenSubMachine: handleOpenSubMachine,
                handleAddLaneToParallel,
                value,
            });

            return value;
        });

        injectedNodeCacheRef.current = nextCache;
        return result;
    }, [
        nodes,
        tabs,
        activeTabId,
        activeMode,
        handleAddLaneToParallel,
        handleOpenStateActions,
        handleOpenParameter,
        handleOpenSlot,
        handleOpenTransition,
        handleOpenSubMachine,
        handleToggleContainerCollapse,
        hiddenNodeIds,
        slotConnectionDrag,
    ]);

    const injectedSlotNodes = useMemo(() => {
        const previousCache = injectedSlotNodeCacheRef.current;
        const nextCache = new Map();

        const result = slotNodes.map((node) => {
            const cached = previousCache.get(node.id);
            if (
                cached?.sourceNode === node &&
                cached?.slotConnectionDrag === slotConnectionDrag
            ) {
                nextCache.set(node.id, cached);
                return cached.value;
            }

            const value = {
                ...node,
                data: {
                    ...node.data,
                    slotConnectionDrag,
                },
            };

            nextCache.set(node.id, {
                sourceNode: node,
                slotConnectionDrag,
                value,
            });

            return value;
        });

        injectedSlotNodeCacheRef.current = nextCache;
        return result;
    }, [slotNodes, slotConnectionDrag]);

    const handleOpenBehaviorFile = useCallback(
        async (behavior) => {
            if (!behavior?.source) return;

            beginStateMachineLoad(
                behavior.name?.replace(/\.(xml|scxml)$/i, "") || "State machine"
            );
            await new Promise((resolve) =>
                window.requestAnimationFrame(() =>
                    window.requestAnimationFrame(resolve)
                )
            );

            try {
                // behavior.source remains ${KEY}/... for SCXML portability.
                // readWorkflowSource expands it only for local file access.
                const loaded = await readWorkflowSource(
                    behavior.source,
                    behaviorDirectories,
                    null
                );

                const tabId = `tab-behavior-${loaded.path}`;
                const existingTab = tabs.find(
                    (tab) => tab.id === tabId
                );

                if (existingTab) {
                    switchTab(tabId);
                    return;
                }

                const parsed = await parseScxmlFile(
                    loaded.content,
                    fetchSkillData,
                    getNodeId
                );
                const parsedNodes = ensureSharedEditorInstanceIds(
                    (await hydrateSubMachineInheritedSlots(
                        parsed.nodes,
                        loaded.path
                    )).map(normalizeSharedScxmlStateIdentity)
                );

                const newTabObj = {
                    id: tabId,
                    title:
                        behavior.name?.replace(
                            /\.(xml|scxml)$/i,
                            ""
                        ) || loaded.file_name,
                    fileName: loaded.file_name,
                    fileHandle: null,
                    filePath: loaded.path,
                    sourcePath: behavior.source,
                    nodes: parsedNodes,
                    edges: parsed.edges,
                    slotNodes: [],
                    slotEdges: [],
                    manualSlots: [],
                    parentTabId: null,
                    inheritedGlobalDataModel: [],
                    globalDataModel: parsed.globalDataModel,
                };

                setTabs((previousTabs) => [
                    ...previousTabs.map((tab) =>
                        tab.id === activeTabId
                            ? {
                                ...tab,
                                nodes,
                                edges,
                                slotNodes,
                                slotEdges,
                                manualSlots,
                                globalDataModel,
                                inheritedGlobalDataModel,
                            }
                            : tab
                    ),
                    newTabObj,
                ]);

                setActiveTabId(tabId);
                setNodes(parsedNodes);
                setEdges(parsed.edges);
                setSlotNodes([]);
                setSlotEdges([]);
                setManualSlots([]);
                setGlobalDataModel(parsed.globalDataModel);
                setInheritedGlobalDataModel([]);
                setSelectedNodeId(null);
                checkSlotConnection(parsedNodes);

                setTimeout(
                    () =>
                        fitView({
                            padding: 0.2,
                            duration: 300,
                        }),
                    100
                );
            } catch (error) {
                console.error(
                    "Could not open behavior:",
                    error
                );
                alert(
                    `Could not open behavior:\n${error.message}`
                );
            } finally {
                endStateMachineLoad();
            }
        },
        [
            behaviorDirectories,
            tabs,
            activeTabId,
            nodes,
            edges,
            slotNodes,
            slotEdges,
            manualSlots,
            globalDataModel,
            inheritedGlobalDataModel,
            fitView,
            beginStateMachineLoad,
            endStateMachineLoad,
        ]
    );

    const createBehaviorNode = useCallback(
        async (behavior, position) => {
            const baseName = String(
                behavior?.name || "Behavior"
            ).replace(/\.(xml|scxml)$/i, "");

            let behaviorEvents = [];
            let inheritedSlots = [];
            let localDataModel = [];

            try {
                if (behavior?.source) {
                    let behaviorContent = "";

                    if (IS_DESKTOP) {
                        const loaded = await readWorkflowSource(
                            behavior.source,
                            behaviorDirectories,
                            null
                        );
                        behaviorContent = loaded.content || "";
                    } else {
                        const resolvedUrl = resolveSrcPath(
                            behavior.source,
                            DEFAULT_PREFIX_CONFIG
                        );
                        const response = await fetch(resolvedUrl);
                        if (response.ok) {
                            behaviorContent = await response.text();
                        }
                    }

                    if (behaviorContent) {
                        behaviorEvents = extractBehaviorExitEventsFromScxml(
                            behaviorContent
                        );
                        const declaredInheritedSlots =
                            extractInheritedSlotsFromScxml(behaviorContent);
                        const parsedBehavior = await parseScxmlFile(
                            behaviorContent,
                            fetchSkillData,
                            getNodeId
                        );
                        inheritedSlots = collectInheritedSlotUsages(
                            parsedBehavior.nodes,
                            declaredInheritedSlots
                        );
                        localDataModel = getLocalDataModelEntries(
                            parsedBehavior.globalDataModel
                        );
                    }
                }
            } catch (error) {
                console.warn(
                    `Could not inspect behavior exits for ${behavior?.source || baseName}:`,
                    error
                );
            }

            // Prefer the real outward events emitted by Nop nodes. Keep the
            // legacy fallback only when the source cannot be inspected or
            // does not expose an outward Nop event.
            const events = (
                behaviorEvents.length > 0
                    ? behaviorEvents
                    : ["success", "failure"]
            ).map((eventId) => ({ id: eventId }));

            return {
                id: getNodeId(),
                position,
                type: "submachine",
                data: {
                    label: baseName,
                    fullSkillName: baseName,
                    src: behavior.source,
                    isInitial: false,
                    events,
                    inheritedSlots,
                    localDataModel,
                    onEntry: [],
                    onExit: [],
                    onOpenSubMachine: handleOpenSubMachine,
                },
            };
        },
        [behaviorDirectories, handleOpenSubMachine]
    );

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
        if (!selectedNode?.data?.isSkillClone) return null;
        return semanticNodes.find(
            (node) => node.id === selectedNode.data?.cloneOfNodeId
        ) || null;
    }, [selectedNode, semanticNodes]);

    const selectedContainerOutgoingTransitions = useMemo(() => {
        if (
            !selectedNode ||
            (selectedNode.type !== "compound" && selectedNode.type !== "parallel")
        ) {
            return [];
        }

        const nodeById = new Map(semanticNodes.map((node) => [node.id, node]));
        const isInsideSelectedContainer = (nodeId) => {
            if (!nodeId) return false;
            if (nodeId === selectedNode.id) return true;

            const visited = new Set();
            let current = nodeById.get(nodeId);
            while (current?.parentId && !visited.has(current.parentId)) {
                visited.add(current.parentId);
                if (current.parentId === selectedNode.id) return true;
                current = nodeById.get(current.parentId);
            }
            return false;
        };

        const displayNameFor = (node) => {
            if (!node) return "Unknown";
            const fullSkillName = String(
                node.data?.fullSkillName || node.data?.label || node.id
            ).trim();
            const editorInstanceId = String(
                node.data?.editorInstanceId || ""
            ).trim();
            const baseName =
                node.data?.label ||
                fullSkillName.split(".").pop()?.split("#")[0] ||
                node.id;

            if (editorInstanceId) return `${baseName}#${editorInstanceId}`;
            if (fullSkillName.includes("#")) {
                const instanceId = fullSkillName.split("#").pop();
                return `${baseName}#${instanceId}`;
            }
            return baseName;
        };

        const seen = new Set();
        const result = [];

        edges.forEach((edge) => {
            if (
                edge.data?.boundaryInternalEdge ||
                edge.data?.compoundInternalEdge ||
                edge.data?.parallelInternalEdge ||
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge ||
                String(edge.id || "").startsWith("edge-internal-")
            ) {
                return;
            }

            const sourceId =
                edge.data?.boundaryOriginalSource ||
                edge.data?.compoundOriginalSource ||
                edge.data?.parallelOriginalSource ||
                edge.source;
            const sourceHandle = String(
                edge.data?.boundaryOriginalSourceHandle ||
                edge.data?.compoundOriginalSourceHandle ||
                edge.data?.parallelOriginalSourceHandle ||
                edge.sourceHandle ||
                edge.label ||
                "success"
            );
            const targetId =
                edge.data?.compoundOriginalTarget ||
                edge.data?.parallelOriginalTarget ||
                edge.target;

            if (
                !isInsideSelectedContainer(sourceId) ||
                isInsideSelectedContainer(targetId)
            ) {
                return;
            }

            const key = `${sourceId}::${sourceHandle}::${targetId}`;
            if (seen.has(key)) return;
            seen.add(key);

            const sourceNode = nodeById.get(sourceId);
            const targetNode = nodeById.get(targetId);
            result.push({
                edgeId: edge.id,
                sourceNodeId: sourceId,
                sourceDisplayName: displayNameFor(sourceNode),
                eventId: sourceHandle,
                eventDisplayName: `${displayNameFor(sourceNode)}.${sourceHandle}`,
                targetNodeId: targetId,
                targetDisplayName: displayNameFor(targetNode),
            });
        });

        return result;
    }, [selectedNode, semanticNodes, edges]);

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
        setNodes((currentNodes) =>
            currentNodes.map((node) => ({
                ...node,
                selected: node.id === nodeId,
            }))
        );
        setSlotNodes((currentNodes) =>
            currentNodes.map((node) => ({
                ...node,
                selected: false,
            }))
        );
        setSelectedNodeId(nodeId);
        setRightPanelTab("details");

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
        setCenter,
        setNodes,
        setSelectedNodeId,
        setRightPanelTab,
        setSlotNodes,
    ]);

    const {
        selectedSlotDetails,
        canvasSlotPathOptions,
        canvasSkillSlotOptions,
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
        behaviorDirectories,
    });

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

    const handleProblemClick = useCallback(
        (problem) => {
            if (!problem) return;

            if (problem.mode) {
                setActiveMode(problem.mode);
            }

            setEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...edge,
                    selected: Boolean(
                        problem.edgeId &&
                        edge.id === problem.edgeId
                    ),
                }))
            );

            if (problem.nodeId) {
                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: node.id === problem.nodeId,
                    }))
                );
                setSelectedNodeId(problem.nodeId);
                setActiveTab(problem.detailTab || "allgemein");
                setRightPanelTab("details");
            } else if (problem.category === "Datamodel") {
                setSelectedNodeId(null);
                setRightPanelTab("datamodel");
            }

            const focusIds = (
                problem.focusNodeIds?.length
                    ? problem.focusNodeIds
                    : problem.nodeId
                        ? [problem.nodeId]
                        : []
            ).filter((id) =>
                nodes.some((node) => node.id === id)
            );

            if (focusIds.length > 0) {
                window.setTimeout(() => {
                    fitView({
                        nodes: focusIds.map((id) => ({ id })),
                        padding: 0.55,
                        maxZoom: 1.25,
                        duration: 300,
                    });
                }, 0);
            }
        },
        [nodes, setNodes, setEdges, fitView]
    );

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
        },
        [setEdges, setSlotEdges]
    );

    const { visibleNodes, visibleEdges, smartRoutingNodes } = useEditorDisplay({
        hoveredEditorNodeId,
        hoveredEditorEdgeId,
        selectedNodes,
        selectedNodeId,
        edges,
        nodeById,
        slotNodeIdSet,
        slotEdges,
        updatePersistentEdgeControlPoints,
        hoveredSlotAccessNodeId,
        semanticNodes,
        semanticChildrenByParent,
        nodes,
        childIdsByParent,
        activeMode,
        injectedNodes,
        injectedSlotNodes,
        isDraggingNode,
        hiddenNodeIds,
        parallelDropTargetId,
        compoundDropTargetId,
    });

    const createNameforSkill = (fullSkillName) => {
        const label = fullSkillName.split(".").pop();
        const count = nodes.filter(
            (n) => !n.data?.isSkillClone && n.data?.label === label
        ).length;
        return `${fullSkillName}#${count + 1}`;
    };

    const getPackageSkillEvent = (pkgName) => {
        if (!pkgName) return [];
        return (skills.skills || []).filter((s) => s.includes(`skills.${pkgName}`));
    };

    const createNode = async (selectedSkill, nodeid, position) => {
        const data = (await fetchSkillData(selectedSkill)) || {};
        const baseSkillLabel =
            selectedSkill.split(".").pop() || selectedSkill;
        const isFinalSkill =
            baseSkillLabel.toLowerCase() === "end" ||
            baseSkillLabel.toLowerCase() === "fatal";

        let sharedEditorInstanceId;
        if (isFinalSkill) {
            const sharedStateId = selectedSkill.split("#")[0];
            const usedIds = new Set(
                nodes
                    .filter((node) => {
                        const candidate = normalizeSharedScxmlStateIdentity(node);
                        return getSharedScxmlStateId(candidate) === sharedStateId;
                    })
                    .map((node) => String(node.data?.editorInstanceId || "").trim())
                    .filter(Boolean)
            );

            let index = 1;
            while (usedIds.has(String(index))) index += 1;
            sharedEditorInstanceId = String(index);
        }

        return {
            id: nodeid,
            position,
            type: "custom",
            data: {
                label: baseSkillLabel,
                fullSkillName: isFinalSkill
                    ? selectedSkill.split("#")[0]
                    : createNameforSkill(selectedSkill),
                ...(isFinalSkill
                    ? {
                        scxmlStateId: selectedSkill.split("#")[0],
                        editorInstanceId: sharedEditorInstanceId,
                    }
                    : {}),
                description: data.description || "",
                isInitial: false,
                isFinal: isFinalSkill,
                src: "",
                onEntry: [],
                onExit: [],
                events: [
                    ...(data.events || []).map((e) => ({
                        id: e.event,
                        description: e.description || "",
                        selectedPackage: "",
                        selectedSkill: "",
                        target: null,
                        cond: "",
                        assignments: [],
                        assignLocation: "",
                        assignExpr: "",
                    })),

                    ...(selectedSkill.split(".").pop() !== "End" &&
                    selectedSkill.split(".").pop() !== "Fatal"
                        ? [
                            {
                                id: "fatal",
                                selectedPackage: "",
                                selectedSkill: "",
                                target: null,
                                cond: "",
                                assignments: [],
                                assignLocation: "",
                                assignExpr: "",
                            },
                        ]
                        : []),

                    ...(selectedSkill.split(".").pop() !== "End" &&
                    selectedSkill.split(".").pop() !== "Fatal"
                        ? [
                            {
                                id: "*",
                                selectedPackage: "",
                                selectedSkill: "",
                                target: null,
                                cond: "",
                                assignments: [],
                                assignLocation: "",
                                assignExpr: "",
                            },
                        ]
                        : []),
                ],

                sensors: data.sensors || [],
                actuators: data.actuator || data.actuators || [],

                inSlots: (data.inSlots || []).map((s) => ({
                    key: s.key,
                    type: s.type,
                    description: s.description || "",
                    path: "",
                    inherited: null,
                })),

                outSlots: (data.outSlots || []).map((s) => ({
                    key: s.key,
                    type: s.type,
                    description: s.description || "",
                    path: "",
                    inherited: null,
                })),

                params: (data.params || []).map((p) => ({
                    key: p.key,
                    type: p.type,
                    required: p.required,
                    default: p.default,
                    description: p.description || "",
                })),
            },
        };
    };

    const handleNodesChange = useCallback(
        (changes) => {
            const graphChanges = [];
            const slotChanges = [];

            changes.forEach((change) => {
                if (nodeById.has(change.id)) {
                    graphChanges.push(change);
                } else if (slotNodeIdSet.has(change.id)) {
                    slotChanges.push(change);
                }
            });

            if (graphChanges.length > 0) {
                const removedNodeIds = new Set(
                    graphChanges
                        .filter((change) => change.type === "remove")
                        .map((change) => change.id)
                );

                onNodesChange(graphChanges);

                if (removedNodeIds.size > 0) {
                    // Boundary transitions are drawn from a Compound/Parallel
                    // border, so React Flow does not see them as connected to
                    // the real source skill. Remove them explicitly by their
                    // semantic source/target metadata when that skill is
                    // deleted.
                    setEdges((currentEdges) =>
                        currentEdges.filter((edge) => {
                            const semanticSource =
                                edge.data?.boundaryOriginalSource ||
                                edge.data?.compoundOriginalSource ||
                                edge.data?.parallelOriginalSource ||
                                edge.source;
                            const semanticTarget =
                                edge.data?.boundaryOriginalTarget ||
                                edge.data?.compoundOriginalTarget ||
                                edge.data?.parallelOriginalTarget ||
                                edge.target;

                            return (
                                !removedNodeIds.has(edge.source) &&
                                !removedNodeIds.has(edge.target) &&
                                !removedNodeIds.has(semanticSource) &&
                                !removedNodeIds.has(semanticTarget)
                            );
                        })
                    );

                    // Remove the editor-only border handle belonging to a
                    // deleted source skill as well. Otherwise the Compound or
                    // Parallel could keep showing a stale skill.event point.
                    setNodes((currentNodes) =>
                        currentNodes.map((node) => {
                            if (
                                node.type !== "compound" &&
                                node.type !== "parallelLane"
                            ) {
                                return node;
                            }

                            const currentEvents = node.data?.events || [];
                            const nextEvents = currentEvents.filter(
                                (event) =>
                                    !removedNodeIds.has(event?.sourceNodeId)
                            );

                            if (nextEvents.length === currentEvents.length) {
                                return node;
                            }

                            return {
                                ...node,
                                data: {
                                    ...(node.data || {}),
                                    events: nextEvents,
                                },
                            };
                        })
                    );
                }
            }
            if (slotChanges.length > 0) {
                onSlotNodesChange(slotChanges);
            }
        },
        [
            nodeById,
            slotNodeIdSet,
            onNodesChange,
            onSlotNodesChange,
            setEdges,
            setNodes,
        ]
    );

    const handleVisibleEdgesChange = useCallback(
        (changes) => {
            const slotEdgeIds = new Set(
                (slotEdges || []).map((edge) => edge.id)
            );

            const slotChanges = changes.filter((change) =>
                slotEdgeIds.has(change.id)
            );
            const transitionChanges = changes.filter(
                (change) => !slotEdgeIds.has(change.id)
            );

            if (transitionChanges.length > 0) {
                onEdgesChange(transitionChanges);
            }

            if (slotChanges.length === 0) {
                return;
            }

            const removedIds = new Set(
                slotChanges
                    .filter((change) => change.type === "remove")
                    .map((change) => change.id)
            );

            if (removedIds.size > 0) {
                const removedEdges = (slotEdges || []).filter((edge) =>
                    removedIds.has(edge.id)
                );

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        let nextNode = node;

                        removedEdges.forEach((edge) => {
                            const access = edge.data?.access;
                            const slotIndex = Number(edge.data?.slotIndex);

                            if (
                                access === "read" &&
                                (edge.data?.skillNodeId || edge.source) === node.id &&
                                Number.isInteger(slotIndex) &&
                                node.data?.inSlots?.[slotIndex]
                            ) {
                                nextNode = {
                                    ...nextNode,
                                    data: {
                                        ...nextNode.data,
                                        inSlots: nextNode.data.inSlots.map(
                                            (slot, index) =>
                                                index === slotIndex
                                                    ? { ...slot, path: "", inherited: null }
                                                    : slot
                                        ),
                                    },
                                };
                            }

                            if (
                                access === "write" &&
                                (edge.data?.skillNodeId || edge.source) === node.id &&
                                Number.isInteger(slotIndex) &&
                                node.data?.outSlots?.[slotIndex]
                            ) {
                                nextNode = {
                                    ...nextNode,
                                    data: {
                                        ...nextNode.data,
                                        outSlots: nextNode.data.outSlots.map(
                                            (slot, index) =>
                                                index === slotIndex
                                                    ? { ...slot, path: "", inherited: null }
                                                    : slot
                                        ),
                                    },
                                };
                            }
                        });

                        return nextNode;
                    })
                );
            }

            onSlotEdgesChange(slotChanges);
        },
        [
            slotEdges,
            onEdgesChange,
            onSlotEdgesChange,
            setNodes,
        ]
    );





























    const handleUpdateSelectedSlotPath = (nextPath) => {
        if (!selectedRawNode || selectedRawNode.type !== "slot") return;

        const oldPath = getSlotPathFromNode(selectedRawNode);
        const newPath = normalizeSlotPath(nextPath);
        if (!oldPath || !newPath || oldPath === newPath) return;

        const formattedPath = `/${newPath}`;
        const updateSlotReference = (slot) => {
            if (normalizeSlotPath(slot?.path) !== oldPath) return slot;

            return {
                ...slot,
                path: formattedPath,
                inherited: slot?.inherited
                    ? {
                        ...slot.inherited,
                        xpath: formattedPath,
                    }
                    : slot?.inherited,
            };
        };

        const updatedNodes = nodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                inSlots: (node.data?.inSlots || []).map(updateSlotReference),
                outSlots: (node.data?.outSlots || []).map(updateSlotReference),
            },
        }));

        const updatedManualSlots = (manualSlots || []).map((slot) => {
            const declarationPath = normalizeSlotPath(
                slot?.inherited?.xpath || slot?.path
            );
            if (declarationPath !== oldPath) return slot;

            return {
                ...slot,
                path: formattedPath,
                inherited: slot?.inherited
                    ? {
                        ...slot.inherited,
                        xpath: formattedPath,
                    }
                    : slot?.inherited,
            };
        });

        setNodes(updatedNodes);
        setManualSlots(updatedManualSlots);
        setSelectedNodeId(`slot-${newPath}`);
        checkSlotConnection(updatedNodes, updatedManualSlots);
    };

    const handleUpdateSelectedSlotInherited = (shouldInherit) => {
        if (!selectedRawNode || selectedRawNode.type !== "slot") return;

        const path = getSlotPathFromNode(selectedRawNode);
        if (!path) return;
        const formattedPath = `/${path}`;

        const updatedNodes = nodes.map((node) => {
            const stateName =
                node.data?.fullSkillName ||
                node.data?.label ||
                node.id;

            const updateSlotReference = (slot) => {
                if (normalizeSlotPath(slot?.path) !== path) return slot;

                return {
                    ...slot,
                    inherited: shouldInherit
                        ? {
                            ...(slot?.inherited || {}),
                            state: slot?.inherited?.state || stateName,
                            xpath: formattedPath,
                        }
                        : null,
                };
            };

            return {
                ...node,
                data: {
                    ...node.data,
                    inSlots: (node.data?.inSlots || []).map(updateSlotReference),
                    outSlots: (node.data?.outSlots || []).map(updateSlotReference),
                },
            };
        });

        const updatedManualSlots = (manualSlots || []).map((slot) => {
            const declarationPath = normalizeSlotPath(
                slot?.inherited?.xpath || slot?.path
            );
            if (declarationPath !== path) return slot;

            return {
                ...slot,
                slotKind: shouldInherit ? "inheritSlot" : "slot",
                inherited: shouldInherit
                    ? {
                        ...(slot?.inherited || {}),
                        state:
                            slot?.inherited?.state ||
                            slot?.state ||
                            "",
                        xpath: formattedPath,
                    }
                    : null,
            };
        });

        setNodes(updatedNodes);
        setManualSlots(updatedManualSlots);
        checkSlotConnection(updatedNodes, updatedManualSlots);
    };

    // Graph-aware copy/paste/duplicate/select-all shortcuts. A copied
    // selection contains the selected nodes plus transitions whose source and
    // target are both in that selection. Pasting remaps graph IDs and keeps
    // the relative layout of the copied group.
    useEffect(() => {
        const isTypingTarget = (target) => {
            if (!(target instanceof Element)) return false;

            return Boolean(
                target.closest(
                    'input, textarea, select, [contenteditable="true"], .monaco-editor, .cm-editor'
                )
            );
        };

        const captureSelection = () => {
            const selectedIds = graphSelectionRef.current;
            let nodesToCopy = nodes.filter(
                (node) =>
                    selectedIds.has(node.id) &&
                    node.type !== "parallelLane"
            );

            // React Flow's onSelectionChange is the authoritative source for
            // multi-selection. Only fall back to the explicitly focused node
            // when there is no usable Flow selection (or a single stale node
            // from the previous click). This keeps the original stale-click
            // fix without collapsing a genuine Ctrl/Meta selection to one node.
            if (selectedNodeId && nodesToCopy.length <= 1) {
                const focusedNode = nodes.find(
                    (node) =>
                        node.id === selectedNodeId &&
                        node.type !== "parallelLane"
                );
                const focusedNodeIsSelected = nodesToCopy.some(
                    (node) => node.id === selectedNodeId
                );

                if (focusedNode && !focusedNodeIsSelected) {
                    nodesToCopy = [focusedNode];
                }
            }

            if (nodesToCopy.length === 0) return false;

            const copiedNodeIds = new Set(
                nodesToCopy.map((node) => node.id)
            );

            const copiedEdges = edges.filter(
                (edge) =>
                    copiedNodeIds.has(edge.source) &&
                    copiedNodeIds.has(edge.target)
            );

            graphClipboardRef.current = {
                nodes: nodesToCopy.map((node) =>
                    cloneGraphValue({
                        ...node,
                        selected: false,
                    })
                ),
                edges: copiedEdges.map((edge) =>
                    cloneGraphValue({
                        ...edge,
                        selected: false,
                    })
                ),
            };

            pasteSequenceRef.current = 0;
            return true;
        };

        const pasteClipboard = (pasteMode = "copy") => {
            const clipboard = graphClipboardRef.current;
            if (!clipboard?.nodes?.length) return false;

            if (pasteMode === "clone") {
                const copiedNode =
                    clipboard.nodes.length === 1 ? clipboard.nodes[0] : null;
                const sourceNode = copiedNode
                    ? nodes.find((node) => node.id === copiedNode.id)
                    : null;

                if (!isCloneableSkillNode(sourceNode)) return false;

                pasteSequenceRef.current += 1;
                const offset = 40 * pasteSequenceRef.current;
                const absoluteSourcePosition = getAbsoluteNodePosition(
                    sourceNode,
                    nodes
                );
                const cloneNode = {
                    id: getNodeId(),
                    position: {
                        x: Number(absoluteSourcePosition.x || 0) + offset,
                        y: Number(absoluteSourcePosition.y || 0) + offset,
                    },
                    type: "custom",
                    selected: true,
                    data: {
                        label: sourceNode.data?.label || "Skill",
                        fullSkillName:
                            sourceNode.data?.fullSkillName ||
                            sourceNode.data?.label ||
                            "Skill",
                        isSkillClone: true,
                        cloneOfNodeId: sourceNode.id,
                        isInitial: false,
                        isFinal: false,
                        events: [],
                        inSlots: [],
                        outSlots: [],
                        params: [],
                        onEntry: [],
                        onExit: [],
                    },
                };

                setNodes((currentNodes) => [
                    ...currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    })),
                    cloneNode,
                ]);
                setEdges((currentEdges) =>
                    currentEdges.map((edge) => ({
                        ...edge,
                        selected: false,
                    }))
                );
                setSelectedNodeId(cloneNode.id);
                setRightPanelTab("details");
                setActiveTab("allgemein");

                requestAnimationFrame(() => {
                    updateNodeInternals(cloneNode.id);
                });

                return true;
            }

            pasteSequenceRef.current += 1;
            const offset = 40 * pasteSequenceRef.current;

            const idMap = new Map();
            clipboard.nodes.forEach((node) => {
                idMap.set(node.id, getNodeId());
            });

            // Avoid duplicate SCXML state instance names such as Talk#1.
            const usedFullSkillNames = new Set(
                nodes
                    .map((node) => String(node.data?.fullSkillName || ""))
                    .filter(Boolean)
            );

            const usedSharedInstanceIds = new Map();
            ensureSharedEditorInstanceIds(nodes).forEach((node) => {
                const sharedKey = getSharedScxmlStateKey(node);
                if (!sharedKey) return;
                if (!usedSharedInstanceIds.has(sharedKey)) {
                    usedSharedInstanceIds.set(sharedKey, new Set());
                }
                const instanceId = String(node.data?.editorInstanceId || "").trim();
                if (instanceId) usedSharedInstanceIds.get(sharedKey).add(instanceId);
            });

            const allocateSharedEditorInstanceId = (data) => {
                const candidateNode = normalizeSharedScxmlStateIdentity({
                    type: "custom",
                    data,
                });
                const sharedKey = getSharedScxmlStateKey(candidateNode);
                if (!sharedKey) return undefined;

                if (!usedSharedInstanceIds.has(sharedKey)) {
                    usedSharedInstanceIds.set(sharedKey, new Set());
                }

                const used = usedSharedInstanceIds.get(sharedKey);
                let index = 1;
                while (used.has(String(index))) index += 1;
                const instanceId = String(index);
                used.add(instanceId);
                return instanceId;
            };

            const allocateFullSkillName = (node, data) => {
                if (node.type !== "custom") return data;

                // Duplicating an editor-only skill clone creates another alias
                // of the same real state, not a new SCXML skill instance.
                if (data?.isSkillClone) return data;

                const current = String(data?.fullSkillName || "").trim();
                if (!current) return data;

                const base = current.split("#")[0];
                const skillName = base.split(".").pop()?.toLowerCase() || "";

                // End/Fatal copies are editor aliases, not separate SCXML
                // instances. Their unique React Flow node id is sufficient.
                if (skillName === "end" || skillName === "fatal") {
                    const normalizedData = {
                        ...data,
                        label: skillName === "end" ? "End" : "Fatal",
                        scxmlStateId: data?.scxmlStateId || base,
                        fullSkillName: base,
                        isFinal: true,
                    };

                    return {
                        ...normalizedData,
                        editorInstanceId: allocateSharedEditorInstanceId(
                            normalizedData
                        ),
                    };
                }

                // A forwarding Nop is also an editor alias when copied. Keep
                // its original SCXML state identity privately, while the visible
                // editor skill identity stays unsuffixed and its name comes from
                // the event(s) it forwards.
                if (skillName === "nop" && data?.isBehaviorExit) {
                    const sentEvents = Array.isArray(data?.behaviorExitEvents)
                        ? data.behaviorExitEvents.filter(Boolean)
                        : [];

                    const normalizedData = {
                        ...data,
                        label:
                            sentEvents.length > 0
                                ? sentEvents.join(", ")
                                : data?.label || "Nop",
                        fullSkillName: base,
                    };

                    const normalizedScxmlStateId =
                        getForwardingNopScxmlStateId(
                            { type: "custom", data: normalizedData },
                            sentEvents[0] || ""
                        );

                    normalizedData.behaviorExitScxmlStateId =
                        normalizedScxmlStateId;
                    normalizedData.scxmlStateId = normalizedScxmlStateId;

                    return {
                        ...normalizedData,
                        editorInstanceId: allocateSharedEditorInstanceId(
                            normalizedData
                        ),
                    };
                }

                // Normal skills still need a distinct SCXML state id when
                // duplicated.
                let index = 1;
                let candidate = `${base}#${index}`;

                while (usedFullSkillNames.has(candidate)) {
                    index += 1;
                    candidate = `${base}#${index}`;
                }

                usedFullSkillNames.add(candidate);
                return {
                    ...data,
                    fullSkillName: candidate,
                };
            };

            const remapEvent = (eventData) => {
                const eventCopy = cloneGraphValue(eventData);

                if (eventCopy.sourceNodeId && idMap.has(eventCopy.sourceNodeId)) {
                    eventCopy.sourceNodeId = idMap.get(eventCopy.sourceNodeId);
                }

                if (!eventCopy.target) return eventCopy;

                if (idMap.has(eventCopy.target)) {
                    eventCopy.target = idMap.get(eventCopy.target);
                    return eventCopy;
                }

                // The copied selection deliberately excludes transitions to
                // nodes outside the selection. Keep the exit token available,
                // but remove its old external transition metadata.
                return {
                    ...eventCopy,
                    target: null,
                    cond: "",
                    assignments: [],
                    assignLocation: "",
                    assignExpr: "",
                    selectedPackage: "",
                    selectedSkill: "",
                };
            };

            const pastedNodes = clipboard.nodes.map((clipboardNode) => {
                const node = cloneGraphValue(clipboardNode);
                let data = cloneGraphValue(node.data || {});

                if (Array.isArray(data.events)) {
                    data.events = data.events.map(remapEvent);
                }

                if (
                    data?.isSkillClone &&
                    data?.cloneOfNodeId &&
                    idMap.has(data.cloneOfNodeId)
                ) {
                    data.cloneOfNodeId = idMap.get(data.cloneOfNodeId);
                }

                data = allocateFullSkillName(node, data);

                // A duplicate must not silently create a second initial state.
                if (data.isInitial) {
                    data.isInitial = false;
                }

                return {
                    ...node,
                    id: idMap.get(node.id),
                    parentId:
                        node.parentId && idMap.has(node.parentId)
                            ? idMap.get(node.parentId)
                            : undefined,
                    extent:
                        node.parentId && idMap.has(node.parentId)
                            ? node.extent
                            : undefined,
                    position: {
                        x: Number(node.position?.x || 0) + offset,
                        y: Number(node.position?.y || 0) + offset,
                    },
                    selected: true,
                    data,
                };
            });

            const remapEdgeDataIds = (edgeData) => {
                const nextData = cloneGraphValue(edgeData || {});

                [
                    "parallelOriginalSource",
                    "parallelOriginalTarget",
                    "compoundOriginalSource",
                    "compoundOriginalTarget",
                ].forEach((keyName) => {
                    if (nextData[keyName] && idMap.has(nextData[keyName])) {
                        nextData[keyName] = idMap.get(nextData[keyName]);
                    }
                });

                return nextData;
            };

            const pastedEdges = clipboard.edges.map((clipboardEdge) => {
                const edge = cloneGraphValue(clipboardEdge);

                return {
                    ...edge,
                    id: `edge-copy-${crypto.randomUUID()}`,
                    source: idMap.get(edge.source),
                    target: idMap.get(edge.target),
                    selected: false,
                    data: remapEdgeDataIds(edge.data),
                };
            });

            const pastedIds = new Set(
                pastedNodes.map((node) => node.id)
            );

            const nextNodes = orderNodesParentsFirst([
                ...nodes.map((node) => ({
                    ...node,
                    selected: false,
                })),
                ...pastedNodes,
            ]);

            setNodes(nextNodes);
            setEdges([
                ...edges.map((edge) => ({
                    ...edge,
                    selected: false,
                })),
                ...pastedEdges,
            ]);

            const firstPastedNode = pastedNodes.find(
                (node) => !node.parentId
            ) || pastedNodes[0];

            setSelectedNodeId(firstPastedNode?.id || null);

            // Slot paths live on the skill nodes. Rebuild the slot-view edges
            // so copied skills immediately retain their slot connections too.
            requestAnimationFrame(() => {
                checkSlotConnection(nextNodes);

                pastedIds.forEach((nodeId) => {
                    updateNodeInternals(nodeId);
                });
            });

            return true;
        };

        const requestPasteClipboard = () => {
            if (pendingSkillPasteActionRef.current) return true;

            const clipboard = graphClipboardRef.current;
            if (!clipboard?.nodes?.length) return false;

            const copiedNode =
                clipboard.nodes.length === 1 ? clipboard.nodes[0] : null;
            const sourceNode = copiedNode
                ? nodes.find((node) => node.id === copiedNode.id)
                : null;

            if (isCloneableSkillNode(sourceNode)) {
                // Keep the pending action itself outside React state. This
                // avoids copying callback-heavy node data into a dialog state
                // while still letting the user decide how this paste behaves.
                pendingSkillPasteActionRef.current = {
                    clone: () => pasteClipboard("clone"),
                    copy: () => pasteClipboard("copy"),
                };
                setPendingSkillPaste({
                    label: sourceNode.data?.label || "Skill",
                    fullSkillName:
                        sourceNode.data?.fullSkillName ||
                        sourceNode.data?.label ||
                        "Skill",
                });
                return true;
            }

            return pasteClipboard("copy");
        };

        const handleGraphClipboardShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (activeMode === "code" || isTypingTarget(event.target)) return;

            const key = String(event.key || "").toLowerCase();

            if (key === "a") {
                event.preventDefault();
                clearAllEdgeSelection();
                setSelectedNodeId(null);

                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: node.selectable !== false,
                    }))
                );

                if (activeMode === "slots" || activeMode === "overview") {
                    setSlotNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: node.selectable !== false,
                        }))
                    );
                }
                return;
            }

            if (key === "c") {
                if (captureSelection()) {
                    event.preventDefault();
                }
                return;
            }

            if (key === "v") {
                if (graphClipboardRef.current) {
                    event.preventDefault();
                    requestPasteClipboard();
                }
                return;
            }

            if (key === "d") {
                if (!captureSelection()) return;
                event.preventDefault();
                requestPasteClipboard();
            }
        };

        // Capture phase makes the graph clipboard deterministic even when
        // React Flow or a focused panel component handles the same shortcut.
        window.addEventListener(
            "keydown",
            handleGraphClipboardShortcut,
            true
        );
        return () =>
            window.removeEventListener(
                "keydown",
                handleGraphClipboardShortcut,
                true
            );
    }, [
        activeMode,
        selectedNodeId,
        nodes,
        edges,
        setNodes,
        setEdges,
        setSlotNodes,
        clearAllEdgeSelection,
        updateNodeInternals,
    ]);

    const resolvePendingSkillPaste = useCallback((choice) => {
        const action = pendingSkillPasteActionRef.current?.[choice];
        pendingSkillPasteActionRef.current = null;
        setPendingSkillPaste(null);
        action?.();
    }, []);

    const cancelPendingSkillPaste = useCallback(() => {
        pendingSkillPasteActionRef.current = null;
        setPendingSkillPaste(null);
    }, []);

    useEffect(() => {
        if (!pendingSkillPaste) return undefined;

        const handlePendingPasteKey = (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            cancelPendingSkillPaste();
        };

        window.addEventListener("keydown", handlePendingPasteKey, true);
        return () =>
            window.removeEventListener("keydown", handlePendingPasteKey, true);
    }, [pendingSkillPaste, cancelPendingSkillPaste]);

    const handleCreateManualSlot = (slotData) => {
        const newSlot = {
            id: `manual-${crypto.randomUUID()}`,
            path: slotData.path,
            type: slotData.type,
            inherited: slotData.isInherited
                ? { state: slotData.inheritedFrom || "" }
                : null,
        };

        const updatedManualSlots = [...manualSlots, newSlot];
        setManualSlots(updatedManualSlots);

        let updatedNodes = nodes;

        if (slotData.linkedSkillSlot) {
            const { nodeId, access, slotIndex } = slotData.linkedSkillSlot;
            const cleanPath = `/${normalizeSlotPath(slotData.path)}`;

            updatedNodes = nodes.map((node) => {
                if (node.id !== nodeId) return node;

                const key = access === "read" ? "inSlots" : "outSlots";
                return {
                    ...node,
                    data: {
                        ...node.data,
                        [key]: node.data[key].map((slot, index) =>
                            index === slotIndex
                                ? {
                                    ...slot,
                                    path: cleanPath,
                                    inherited: slotData.isInherited
                                        ? {
                                            state: "",
                                            xpath: cleanPath,
                                        }
                                        : null,
                                }
                                : slot
                        ),
                    },
                };
            });

            setNodes(updatedNodes);
        }

        checkSlotConnection(updatedNodes, updatedManualSlots);
    };

    const findResults = useMemo(() => {
        const query = findQuery.trim().toLowerCase();
        if (!query) return [];

        const results = [];

        // Search real executable nodes. Compound/Parallel are structural
        // containers and are intentionally omitted from "skill" results.
        semanticNodes.forEach((node) => {
            if (node.type !== "custom" && node.type !== "submachine") return;

            const label = String(node.data?.label || node.id);
            const fullName = String(node.data?.fullSkillName || "");
            const src = String(node.data?.src || "");
            const haystack = `${label} ${fullName} ${src}`.toLowerCase();

            if (!haystack.includes(query)) return;

            results.push({
                kind: node.type === "submachine" ? "behavior" : "skill",
                id: node.id,
                label,
                detail: fullName || src || node.id,
            });
        });

        const slotPaths = new Map();
        const addSlotPath = (path, type = "Unknown") => {
            const cleanPath = normalizeSlotPath(path);
            if (!cleanPath) return;

            const existing = slotPaths.get(cleanPath);
            slotPaths.set(cleanPath, {
                path: cleanPath,
                type:
                    existing?.type && existing.type !== "Unknown"
                        ? existing.type
                        : type || "Unknown",
            });
        };

        (slotNodes || []).forEach((node) =>
            addSlotPath(
                node.data?.path || node.data?.label,
                node.data?.slotType
            )
        );
        (manualSlots || []).forEach((slot) =>
            addSlotPath(slot.path, slot.type)
        );
        semanticNodes.forEach((node) => {
            [
                ...(node.data?.inSlots || []),
                ...(node.data?.outSlots || []),
                ...(node.data?.inheritedSlots || []),
            ].forEach((slot) => addSlotPath(slot.path, slot.type));
        });

        [...slotPaths.values()].forEach((slot) => {
            const displayPath = `/${slot.path}`;
            const haystack = `${displayPath} ${slot.type || ""}`.toLowerCase();
            if (!haystack.includes(query)) return;

            results.push({
                kind: "slot",
                id: `slot-${slot.path}`,
                label: displayPath,
                detail: slot.type || "Unknown",
            });
        });

        return results.slice(0, 50);
    }, [findQuery, semanticNodes, slotNodes, manualSlots]);

    useEffect(() => {
        setFindResultIndex(0);
    }, [findQuery]);

    const focusFindResult = useCallback(
        (result) => {
            if (!result) return;

            clearAllEdgeSelection();

            if (result.kind === "slot") {
                if (activeMode === "event") {
                    setActiveMode("slots");
                }

                // Ensure a slot node exists even when the slot view has not
                // been opened since loading/importing this workflow.
                checkSlotConnection(nodes, manualSlots);
                setSelectedNodeId(result.id);

                window.setTimeout(() => {
                    setSlotNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: node.id === result.id,
                        }))
                    );
                    setNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: false,
                        }))
                    );

                    fitView({
                        nodes: [{ id: result.id }],
                        padding: 0.8,
                        maxZoom: 1.35,
                        duration: 250,
                    });
                }, 40);
            } else {
                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: node.id === result.id,
                    }))
                );
                setSlotNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
                setSelectedNodeId(result.id);
                setRightPanelTab("details");

                window.setTimeout(() => {
                    fitView({
                        nodes: [{ id: result.id }],
                        padding: 0.8,
                        maxZoom: 1.35,
                        duration: 250,
                    });
                }, 0);
            }

            setIsFindOpen(false);
        },
        [
            activeMode,
            nodes,
            manualSlots,
            setNodes,
            setSlotNodes,
            fitView,
            clearAllEdgeSelection,
        ]
    );

    // Reconfigure a skill after one of its parameters changes. The Bonsai skill
    // endpoint can expose a different set of events, sensors/actuators and slot
    // requests depending on the current parameter values.
    const skillConfigurationRequestVersionsRef = useRef(new Map());

    const reconcileDynamicSlots = (currentSlots = [], requestedSlots = []) =>
        (Array.isArray(requestedSlots) ? requestedSlots : []).map((requestedSlot) => {
            const existingSlot = (currentSlots || []).find(
                (slot) =>
                    slot?.key === requestedSlot?.key &&
                    normalizeSlotType(slot?.type) ===
                    normalizeSlotType(requestedSlot?.type)
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

    const updateEventsFromParameters = async (nodeId, parameterOverride = null) => {
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

            // An empty editor field means that the parameter is not supplied to
            // the skill. This is important for skills whose requested slots are
            // conditional on the presence of an optional parameter.
            const expr = param.expr;
            if (expr === undefined || expr === null || String(expr).trim() === "") {
                return;
            }

            params[param.key] = expr;
        });

        const requestVersions = skillConfigurationRequestVersionsRef.current;
        const requestVersion = (requestVersions.get(nodeId) || 0) + 1;
        requestVersions.set(nodeId, requestVersion);

        try {
            const data = await fetchSkillData(fullSkillName, params);
            if (!data) return;

            // If a newer edit was sent while this request was in flight, ignore
            // the stale response so old slot requests cannot overwrite new ones.
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
                        if (configuredEvents.some((event) => event.id === eventId)) {
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
                        },
                    };
                });

                // Slot nodes/edges are derived from skill requests. Rebuild them
                // after the node update so newly exposed requests appear and
                // removed requests disappear immediately.
                window.requestAnimationFrame(() =>
                    checkSlotConnection(updatedNodes)
                );

                return updatedNodes;
            });
        } catch (error) {
            console.error("Error updating skill from parameters:", error);
        }
    };

    const {
        handleImportFile,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
    } = useScxmlDocument({
        isDesktop: IS_DESKTOP,
        nodes,
        edges,
        globalDataModel,
        tabs,
        setTabs,
        activeTabId,
        setGlobalDataModel,
        setNodes,
        setEdges,
        setManualSlots,
        setSelectedNodeId,
        fetchSkillData,
        hydrateSubMachineInheritedSlots,
        checkSlotConnection,
        fitView,
        onStateMachineLoadStart: beginStateMachineLoad,
        onStateMachineLoadEnd: endStateMachineLoad,
    });

    // Global editor shortcuts that depend on actions declared above. Keep the
    // listener stable while dragging; live editor state is read from a ref so
    // node position updates do not remove/re-add a window listener every frame.
    const globalShortcutStateRef = useRef(null);
    globalShortcutStateRef.current = {
        activeMode,
        activeTabId,
        contextMenu,
        isDrawerOpen: drawerData.isOpen,
        isCreateSlotModalOpen,
        isFindOpen,
        isShortcutHelpOpen,
        nodes,
        slotNodes,
        fitView,
        clearAllEdgeSelection,
        handleAddNewTab,
        handleCloseTab,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
        canGoFocusBack,
        canGoFocusForward,
        goFocusBack,
        goFocusForward,
    };

    useEffect(() => {
        const isTypingTarget = (target) => {
            if (!(target instanceof Element)) return false;

            return Boolean(
                target.closest(
                    'input, textarea, select, [contenteditable="true"], .monaco-editor, .cm-editor'
                )
            );
        };

        const handleGlobalShortcut = (event) => {
            const live = globalShortcutStateRef.current;
            if (!live) return;

            const {
                activeMode: liveActiveMode,
                activeTabId: liveActiveTabId,
                contextMenu: liveContextMenu,
                isDrawerOpen,
                isCreateSlotModalOpen: liveCreateSlotModalOpen,
                isFindOpen: liveFindOpen,
                isShortcutHelpOpen: liveShortcutHelpOpen,
                nodes: liveNodes,
                slotNodes: liveSlotNodes,
                fitView: liveFitView,
                clearAllEdgeSelection: liveClearAllEdgeSelection,
                handleAddNewTab: liveHandleAddNewTab,
                handleCloseTab: liveHandleCloseTab,
                handleSaveCurrentTab: liveHandleSaveCurrentTab,
                handleSaveAsCurrentTab: liveHandleSaveAsCurrentTab,
                canGoFocusBack: liveCanGoFocusBack,
                canGoFocusForward: liveCanGoFocusForward,
                goFocusBack: liveGoFocusBack,
                goFocusForward: liveGoFocusForward,
            } = live;

            const clearGraphSelection = () => {
                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
                setSlotNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
                liveClearAllEdgeSelection();
                setSelectedNodeId(null);
            };

            const key = String(event.key || "").toLowerCase();
            const hasModifier = event.ctrlKey || event.metaKey;

            if (
                event.altKey &&
                !hasModifier &&
                !event.shiftKey &&
                (key === "arrowleft" || key === "arrowright")
            ) {
                const canNavigate =
                    key === "arrowleft"
                        ? liveCanGoFocusBack
                        : liveCanGoFocusForward;

                event.preventDefault();
                if (!canNavigate) return;

                if (key === "arrowleft") {
                    liveGoFocusBack();
                } else {
                    liveGoFocusForward();
                }
                return;
            }

            // Escape is useful even while focus is inside the search field.
            if (key === "escape") {
                if (liveFindOpen) {
                    event.preventDefault();
                    setIsFindOpen(false);
                    return;
                }

                if (liveContextMenu) {
                    event.preventDefault();
                    setContextMenu(null);
                    return;
                }

                if (isDrawerOpen) {
                    event.preventDefault();
                    setDrawerData((previous) => ({
                        ...previous,
                        isOpen: false,
                    }));
                    return;
                }

                if (liveCreateSlotModalOpen) {
                    event.preventDefault();
                    setIsCreateSlotModalOpen(false);
                    return;
                }

                if (liveShortcutHelpOpen) {
                    event.preventDefault();
                    setIsShortcutHelpOpen(false);
                    return;
                }

                if (!isTypingTarget(event.target) && liveActiveMode !== "code") {
                    event.preventDefault();
                    clearGraphSelection();
                }
                return;
            }

            if (hasModifier && !event.altKey) {
                if (key === "s") {
                    event.preventDefault();
                    if (event.shiftKey) {
                        void liveHandleSaveAsCurrentTab();
                    } else {
                        void liveHandleSaveCurrentTab();
                    }
                    return;
                }

                if (key === "n") {
                    event.preventDefault();
                    liveHandleAddNewTab();
                    return;
                }

                if (key === "w") {
                    event.preventDefault();
                    liveHandleCloseTab(liveActiveTabId);
                    return;
                }

                if (key === "1") {
                    event.preventDefault();
                    setActiveMode("event");
                    return;
                }

                if (key === "2") {
                    event.preventDefault();
                    setActiveMode("slots");
                    return;
                }

                if (key === "3") {
                    event.preventDefault();
                    setActiveMode("overview");
                    return;
                }

                return;
            }

            if (isTypingTarget(event.target) || liveActiveMode === "code") return;
            if (event.altKey || hasModifier || key !== "f") return;

            event.preventDefault();

            if (event.shiftKey) {
                const selectedIds = [
                    ...liveNodes
                        .filter((node) => node.selected)
                        .map((node) => node.id),
                    ...(
                        liveActiveMode === "slots" || liveActiveMode === "overview"
                            ? liveSlotNodes
                                .filter((node) => node.selected)
                                .map((node) => node.id)
                            : []
                    ),
                ];

                if (selectedIds.length === 0) return;

                liveFitView({
                    nodes: selectedIds.map((id) => ({ id })),
                    padding: 0.55,
                    maxZoom: 1.3,
                    duration: 250,
                });
                return;
            }

            liveFitView({
                padding: 0.2,
                duration: 250,
            });
        };

        window.addEventListener("keydown", handleGlobalShortcut);
        return () =>
            window.removeEventListener("keydown", handleGlobalShortcut);
    }, [
        setNodes,
        setSlotNodes,
        setSelectedNodeId,
        setIsFindOpen,
        setContextMenu,
        setDrawerData,
        setIsCreateSlotModalOpen,
        setIsShortcutHelpOpen,
        setActiveMode,
    ]);

    const getTabDisplayPath = (tab) => {
        if (!tab) return "";

        return (
            tab.filePath ||
            tab.sourcePath ||
            tab.fileName ||
            "Unsaved workflow"
        );
    };

    const handleTabMouseEnter = (event, tab) => {
        const rect = event.currentTarget.getBoundingClientRect();

        const tooltipWidth = 320;
        const gap = 8;
        const viewportPadding = 8;

        let left = rect.left;

        if (left + tooltipWidth > window.innerWidth - viewportPadding) {
            left = Math.max(
                viewportPadding,
                window.innerWidth - tooltipWidth - viewportPadding
            );
        }

        setTabPathTooltip({
            path: getTabDisplayPath(tab),
            left,
            top: rect.bottom + gap,
        });
    };

    const handleTabMouseLeave = () => {
        setTabPathTooltip(null);
    };

    return (
        <div className="container">
            <Header onImportFile={handleImportFile} onSaveFile={handleSaveCurrentTab} onSaveAsFile={handleSaveAsCurrentTab} hasFilePath={IS_DESKTOP && Boolean(tabs.find(t => t.id === activeTabId)?.filePath)} />

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
                        <h3 id="skill-paste-choice-title">Paste skill</h3>
                        <p>
                            How should <strong>{pendingSkillPaste.label}</strong> be pasted?
                        </p>
                        <div className="skill-paste-choice-options">
                            <button
                                type="button"
                                className="skill-paste-choice-option"
                                onClick={() => resolvePendingSkillPaste("clone")}
                            >
                                <span className="skill-paste-choice-option-title">Clone</span>
                                <span className="skill-paste-choice-option-description">
                                    Inbound-only visual alias of the original skill.
                                </span>
                            </button>
                            <button
                                type="button"
                                className="skill-paste-choice-option"
                                onClick={() => resolvePendingSkillPaste("copy")}
                            >
                                <span className="skill-paste-choice-option-title">Copy</span>
                                <span className="skill-paste-choice-option-description">
                                    Same skill with a new instance ID.
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
                        className="flow-container"
                        onDragOver={(e) => {
                            e.preventDefault();

                            const skill = e.dataTransfer.getData("skill");
                            if (!skill) return;

                            const pointerPosition = screenToFlowPosition({
                                x: e.clientX,
                                y: e.clientY,
                            });

                            const hoveredCompound = nodes
                                .filter(
                                    (node) =>
                                        node.type === "compound"
                                )
                                .find((compound) => {
                                    const position = getAbsoluteNodePosition(
                                        compound,
                                        nodes
                                    );
                                    const { width, height } = getNodeSize(compound);

                                    return (
                                        pointerPosition.x >= position.x &&
                                        pointerPosition.x <= position.x + width &&
                                        pointerPosition.y >= position.y &&
                                        pointerPosition.y <= position.y + height
                                    );
                                });

                            const hoveredLane = hoveredCompound
                                ? null
                                : nodes
                                    .filter(
                                        (node) => node.type === "parallelLane"
                                    )
                                    .find((lane) => {
                                        const lanePosition =
                                            getAbsoluteNodePosition(lane, nodes);
                                        const width =
                                            Number(lane.style?.width) || 420;
                                        const height =
                                            Number(lane.style?.height) || 110;

                                        return (
                                            pointerPosition.x >= lanePosition.x &&
                                            pointerPosition.x <=
                                            lanePosition.x + width &&
                                            pointerPosition.y >= lanePosition.y &&
                                            pointerPosition.y <=
                                            lanePosition.y + height
                                        );
                                    });

                            setCompoundDropTargetId(
                                hoveredCompound?.id || null
                            );
                            setParallelDropTargetId(
                                hoveredCompound
                                    ? null
                                    : hoveredLane?.id || null
                            );
                        }}
                        onDragLeave={(e) => {
                            const rect =
                                e.currentTarget.getBoundingClientRect();

                            const actuallyLeft =
                                e.clientX <= rect.left ||
                                e.clientX >= rect.right ||
                                e.clientY <= rect.top ||
                                e.clientY >= rect.bottom;

                            if (actuallyLeft) {
                                setParallelDropTargetId(null);
                                setCompoundDropTargetId(null);
                            }
                        }}
                        onDrop={async (e) => {
                            e.preventDefault();

                            setParallelDropTargetId(null);
                            setCompoundDropTargetId(null);

                            if (activeMode === "code") return;

                            const mousePosition = screenToFlowPosition({
                                x: e.clientX,
                                y: e.clientY,
                            });

                            const behaviorPayload =
                                e.dataTransfer.getData("behavior");

                            if (behaviorPayload) {
                                try {
                                    const behavior = JSON.parse(behaviorPayload);
                                    const newNode = await createBehaviorNode(
                                        behavior,
                                        mousePosition
                                    );
                                    const updatedNodes =
                                        resolveNodeCollisionsAndRefit(
                                            [...nodes, newNode],
                                            newNode.id
                                        );
                                    setNodes(updatedNodes);
                                    checkSlotConnection(updatedNodes);
                                } catch (error) {
                                    console.error(
                                        "Invalid behavior drag payload:",
                                        error
                                    );
                                }
                                return;
                            }

                            const skill = e.dataTransfer.getData("skill");
                            if (!skill) return;

                            const targetCompound = nodes
                                .filter(
                                    (node) =>
                                        node.type === "compound"
                                )
                                .find((compound) => {
                                    const position = getAbsoluteNodePosition(
                                        compound,
                                        nodes
                                    );
                                    const { width, height } = getNodeSize(compound);
                                    return (
                                        mousePosition.x >= position.x &&
                                        mousePosition.x <= position.x + width &&
                                        mousePosition.y >= position.y &&
                                        mousePosition.y <= position.y + height
                                    );
                                });

                            const targetLane = targetCompound
                                ? null
                                : nodes
                                    .filter(
                                        (node) => node.type === "parallelLane"
                                    )
                                    .find((lane) => {
                                        const lanePosition =
                                            getAbsoluteNodePosition(lane, nodes);
                                        const width =
                                            Number(lane.style?.width) || 420;
                                        const height =
                                            Number(lane.style?.height) || 110;

                                        return (
                                            mousePosition.x >= lanePosition.x &&
                                            mousePosition.x <=
                                            lanePosition.x + width &&
                                            mousePosition.y >= lanePosition.y &&
                                            mousePosition.y <=
                                            lanePosition.y + height
                                        );
                                    });

                            const newNode = await createNode(
                                skill.split("skills.")[1],
                                getNodeId(),
                                { x: 0, y: 0 }
                            );

                            const labelLen =
                                (newNode.data?.label || "").length +
                                (newNode.data?.fullSkillName || "").length;
                            const estimatedNodeWidth = Math.max(
                                210,
                                Math.min(300, 160 + labelLen * 3)
                            );
                            const eventCount =
                                newNode.data?.events?.length || 0;
                            const estimatedNodeHeight = Math.max(
                                70,
                                50 + eventCount * 18
                            );

                            if (targetCompound) {
                                let newX = COMPOUND_PADDING_X;

                                nodes
                                    .filter(
                                        (member) =>
                                            member.parentId ===
                                            targetCompound.id
                                    )
                                    .forEach((member) => {
                                        const size = getNodeSize(member);
                                        newX = Math.max(
                                            newX,
                                            Number(member.position?.x || 0) +
                                            size.width +
                                            COMPOUND_NODE_GAP
                                        );
                                    });

                                newNode.parentId = targetCompound.id;
                                newNode.extent = "parent";
                                newNode.position = {
                                    x: newX,
                                    y: COMPOUND_HEADER_HEIGHT,
                                };

                                setNodes((currentNodes) => {
                                    const right =
                                        newX + estimatedNodeWidth;
                                    const bottom =
                                        COMPOUND_HEADER_HEIGHT +
                                        estimatedNodeHeight;

                                    return orderNodesParentsFirst([
                                        ...currentNodes.map((candidate) =>
                                            candidate.id === targetCompound.id
                                                ? {
                                                    ...candidate,
                                                    style: {
                                                        ...candidate.style,
                                                        width: Math.max(
                                                            Number(
                                                                candidate.style
                                                                    ?.width
                                                            ) || 320,
                                                            right +
                                                            COMPOUND_PADDING_X +
                                                            getCompoundExitGutterWidth(
                                                                targetCompound.data?.events || []
                                                            )
                                                        ),
                                                        height: Math.max(
                                                            Number(
                                                                candidate.style
                                                                    ?.height
                                                            ) || 180,
                                                            bottom +
                                                            COMPOUND_BOTTOM_PADDING
                                                        ),
                                                    },
                                                }
                                                : candidate
                                        ),
                                        newNode,
                                    ]);
                                });

                                setSelectedNodeId(newNode.id);
                                return;
                            }

                            if (targetLane) {
                                const existingMembers = nodes.filter(
                                    (node) => node.parentId === targetLane.id
                                );

                                let newX = 25;
                                existingMembers.forEach((member) => {
                                    const memberWidth =
                                        Number(member.measured?.width) ||
                                        Number(member.width) ||
                                        Number(member.style?.width) ||
                                        210;
                                    newX = Math.max(
                                        newX,
                                        Number(member.position?.x || 0) +
                                        memberWidth +
                                        PARALLEL_NODE_GAP
                                    );
                                });

                                const isFirstLaneState = existingMembers.length === 0;
                                newNode.parentId = targetLane.id;
                                newNode.extent = "parent";
                                newNode.position = { x: newX, y: 20 };
                                newNode.data = {
                                    ...(newNode.data || {}),
                                    isInitial: isFirstLaneState,
                                };

                                const parallelId = targetLane.parentId;

                                setNodes((currentNodes) => {
                                    let nextNodes = [
                                        ...currentNodes.map((candidate) =>
                                            candidate.id === targetLane.id && isFirstLaneState
                                                ? {
                                                    ...candidate,
                                                    data: {
                                                        ...(candidate.data || {}),
                                                        initialChildId: newNode.id,
                                                    },
                                                }
                                                : candidate
                                        ),
                                        newNode,
                                    ];

                                    const parallel = nextNodes.find(
                                        (node) => node.id === parallelId
                                    );
                                    if (!parallel) {
                                        return orderNodesParentsFirst(
                                            nextNodes
                                        );
                                    }

                                    const lanes = nextNodes
                                        .filter(
                                            (node) =>
                                                node.type ===
                                                "parallelLane" &&
                                                node.parentId === parallelId
                                        )
                                        .sort(
                                            (a, b) =>
                                                Number(a.position?.y || 0) -
                                                Number(b.position?.y || 0)
                                        );

                                    let requiredParallelWidth = 420;
                                    lanes.forEach((lane) => {
                                        const members = nextNodes.filter(
                                            (node) =>
                                                node.parentId === lane.id
                                        );
                                        let maxRight = 0;

                                        members.forEach((member) => {
                                            const memberWidth =
                                                member.id === newNode.id
                                                    ? estimatedNodeWidth
                                                    : Number(
                                                        member.measured?.width
                                                    ) ||
                                                    Number(member.width) ||
                                                    Number(
                                                        member.style?.width
                                                    ) ||
                                                    210;
                                            maxRight = Math.max(
                                                maxRight,
                                                Number(
                                                    member.position?.x || 0
                                                ) + memberWidth
                                            );
                                        });

                                        requiredParallelWidth = Math.max(
                                            requiredParallelWidth,
                                            maxRight + PARALLEL_EXIT_GUTTER
                                        );
                                    });

                                    const laneLayouts = new Map();
                                    const headerHeight =
                                        lanes.length > 0
                                            ? Number(
                                                lanes[0].position?.y || 40
                                            )
                                            : 40;
                                    let currentY = headerHeight;

                                    lanes.forEach((lane) => {
                                        const members = nextNodes.filter(
                                            (node) =>
                                                node.parentId === lane.id
                                        );
                                        let maxBottom = 0;

                                        members.forEach((member) => {
                                            const memberHeight =
                                                member.id === newNode.id
                                                    ? estimatedNodeHeight
                                                    : Number(
                                                        member.measured?.height
                                                    ) ||
                                                    Number(member.height) ||
                                                    Number(
                                                        member.style?.height
                                                    ) ||
                                                    70;
                                            maxBottom = Math.max(
                                                maxBottom,
                                                Number(
                                                    member.position?.y || 0
                                                ) + memberHeight
                                            );
                                        });

                                        const requiredHeight = Math.max(
                                            110,
                                            maxBottom + 20
                                        );
                                        laneLayouts.set(lane.id, {
                                            y: currentY,
                                            height: requiredHeight,
                                        });
                                        currentY += requiredHeight;
                                    });

                                    const requiredParallelHeight =
                                        currentY + 35;

                                    nextNodes = nextNodes.map((node) => {
                                        if (node.id === parallelId) {
                                            return {
                                                ...node,
                                                style: {
                                                    ...node.style,
                                                    width: requiredParallelWidth,
                                                    height: requiredParallelHeight,
                                                },
                                            };
                                        }

                                        if (
                                            node.type === "parallelLane" &&
                                            node.parentId === parallelId
                                        ) {
                                            const layout = laneLayouts.get(
                                                node.id
                                            );
                                            if (!layout) return node;
                                            return {
                                                ...node,
                                                position: {
                                                    ...node.position,
                                                    y: layout.y,
                                                },
                                                style: {
                                                    ...node.style,
                                                    width: requiredParallelWidth,
                                                    height: layout.height,
                                                },
                                            };
                                        }

                                        return node;
                                    });

                                    return orderNodesParentsFirst(nextNodes);
                                });

                                setSelectedNodeId(newNode.id);
                                return;
                            }

                            newNode.position = {
                                x:
                                    mousePosition.x -
                                    estimatedNodeWidth / 2,
                                y:
                                    mousePosition.y -
                                    estimatedNodeHeight / 2,
                            };

                            setNodes((currentNodes) =>
                                resolveNodeCollisionsAndRefit(
                                    [...currentNodes, newNode],
                                    newNode.id
                                )
                            );
                            setSelectedNodeId(newNode.id);
                        }}
                    >
                        <EditorCanvas
                            activeMode={activeMode}
                            setActiveMode={setActiveMode}
                            nodes={nodes}
                            edges={edges}
                            globalDataModel={globalDataModel}
                            visibleNodes={visibleNodes}
                            visibleEdges={visibleEdges}
                            smartRoutingNodes={smartRoutingNodes}
                            selectedNodes={selectedNodes}
                            contextMenu={contextMenu}
                            handleSelectAction={handleSelectAction}
                            canCreateSkillClone={canCreateSkillClone}
                            setIsCreateSlotModalOpen={setIsCreateSlotModalOpen}
                            isDraggingNode={isDraggingNode}
                            isOverTrash={isOverTrash}
                            handleNodesChange={handleNodesChange}
                            handleVisibleEdgesChange={handleVisibleEdgesChange}
                            onSelectionChange={handleGraphSelectionChange}
                            onConnect={onConnect}
                            handleConnectStart={handleConnectStart}
                            handleConnectEnd={handleConnectEnd}
                            isValidConnection={isValidConnection}
                            selectSlotEdge={selectSlotEdge}
                            selectTransitionEdge={selectTransitionEdge}
                            onEdgeDoubleClick={onEdgeDoubleClick}
                            clearAllEdgeSelection={clearAllEdgeSelection}
                            setSelectedNodeId={setSelectedNodeId}
                            setActiveTab={setActiveTab}
                            setRightPanelTab={setRightPanelTab}
                            setHoveredEditorNodeId={setHoveredEditorNodeId}
                            setHoveredEditorEdgeId={setHoveredEditorEdgeId}
                            handleContextMenuOpen={handleContextMenuOpen}
                            handleOpenSubMachine={handleOpenSubMachine}
                            handleNodeDragStart={handleNodeDragStart}
                            handleNodeDrag={handleNodeDrag}
                            handleNodeDragStop={handleNodeDragStop}
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
                                onUpdateGlobalParam={(index, value) => {
                                    setGlobalDataModel((prev) =>
                                        prev.map((param, i) =>
                                            i === index
                                                ? { ...param, expr: value }
                                                : param
                                        )
                                    );
                                }}
                                onAddParameter={(parameterId, parameterExpr) => {
                                    const normalizedId = parameterId.trim();
                                    if (!normalizedId) return;

                                    setGlobalDataModel((prev) => {
                                        if (
                                            prev.some(
                                                (parameter) =>
                                                    parameter.id === normalizedId
                                            )
                                        ) {
                                            return prev;
                                        }

                                        return [
                                            ...prev,
                                            {
                                                id: normalizedId,
                                                expr: parameterExpr,
                                            },
                                        ];
                                    });

                                    setNewParamId("");
                                    setNewParamExpr("");
                                }}
                                onDeleteParameter={(index) => {
                                    setGlobalDataModel((prev) =>
                                        prev.filter((_, i) => i !== index)
                                    );
                                }}
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
                                containerOutgoingTransitions={selectedContainerOutgoingTransitions}
                                onNavigateTransitionNode={handleNavigateCloneSource}
                                onHoverTransitionNode={(nodeId) =>
                                    setHoveredEditorNodeId(nodeId || null)
                                }
                                hasInitialNode={hasInitialNode}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                packages={packages}
                                getPackageSkillEvent={getPackageSkillEvent}
                                onSetInitial={() =>
                                    setNodes((nds) => {
                                        const parentId =
                                            selectedNode.parentId || null;

                                        const parentCompound =
                                            parentId
                                                ? nds.find(
                                                    (node) =>
                                                        node.id ===
                                                        parentId &&
                                                        node.type ===
                                                        "compound"
                                                )
                                                : null;

                                        return nds.map((node) => {
                                            if (
                                                parentCompound &&
                                                node.id ===
                                                parentCompound.id
                                            ) {
                                                return {
                                                    ...node,
                                                    data: {
                                                        ...node.data,
                                                        initialChildId:
                                                        selectedNode.id,
                                                    },
                                                };
                                            }

                                            if (
                                                (node.parentId || null) !==
                                                parentId
                                            ) {
                                                return node;
                                            }

                                            if (
                                                node.type === "slot" ||
                                                node.type ===
                                                "parallelLane"
                                            ) {
                                                return node;
                                            }

                                            return {
                                                ...node,
                                                data: {
                                                    ...node.data,
                                                    isInitial:
                                                        node.id ===
                                                        selectedNode.id,
                                                },
                                            };
                                        });
                                    })
                                }
                                onUpdateName={(name) =>
                                    setNodes((nds) =>
                                        nds.map((n) => {
                                            if (n.id !== selectedNode.id) return n;

                                            const isContainerOrSub =
                                                n.type === "compound" ||
                                                n.type === "parallel" ||
                                                n.type === "submachine";

                                            if (isContainerOrSub) {
                                                return {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        label: name,
                                                        fullSkillName: name,
                                                    },
                                                };
                                            }

                                            const skillType = String(
                                                n.data?.fullSkillName || ""
                                            )
                                                .split("#")[0]
                                                .split(".")
                                                .pop()
                                                .toLowerCase();

                                            // End, Fatal and forwarding Nop clones use an
                                            // editor-only instance ID. Renaming that ID must
                                            // never modify the underlying skill/SCXML identity.
                                            if (["nop", "fatal", "end"].includes(skillType)) {
                                                return {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        editorInstanceId: name,
                                                        fullSkillName:
                                                            n.data?.fullSkillName?.split("#")[0] ||
                                                            n.data?.fullSkillName,
                                                    },
                                                };
                                            }

                                            const baseSkillName =
                                                n.data?.fullSkillName?.split("#")[0] ||
                                                n.data?.label ||
                                                "";
                                            const nextInstanceId = String(name || "").trim();

                                            return {
                                                ...n,
                                                data: {
                                                    ...n.data,
                                                    // The visible skill name identifies the skill
                                                    // definition. Editing the instance ID must only
                                                    // change the SCXML state suffix.
                                                    fullSkillName: nextInstanceId
                                                        ? `${baseSkillName}#${nextInstanceId}`
                                                        : baseSkillName,
                                                },
                                            };
                                        })
                                    )
                                }
                                onUpdateSrc={(nodeId, newSrc) =>
                                    setNodes((nds) =>
                                        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, src: newSrc } } : n))
                                    )
                                }
                                onUpdateEvent={updateNodeEvent}
                                availableTargetNodes={nodes}
                                onSetEventTarget={setExistingTargetForEvent}
                                onUpdateParameter={(idx, val) => {
                                    const nextParams = (selectedNode.data?.params || []).map(
                                        (parameter, i) =>
                                            i === idx
                                                ? { ...parameter, expr: val }
                                                : parameter
                                    );

                                    setNodes((nds) =>
                                        nds.map((n) =>
                                            n.id === selectedNode.id
                                                ? {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        params: nextParams,
                                                    },
                                                }
                                                : n
                                        )
                                    );

                                    // Clearing a parameter changes the configured
                                    // skill just as adding one does. Refresh right
                                    // away and pass the new parameter list explicitly
                                    // so the request cannot see stale React state.
                                    if (String(val ?? "").trim() === "") {
                                        updateEventsFromParameters(
                                            selectedNode.id,
                                            nextParams
                                        );
                                    }
                                }}

                                onUpdateParameterBlur={updateEventsFromParameters}
                                globalDataModel={selectedActionDataModel}
                                actionValueVariables={selectedActionExpressionVariables}
                                onUpdateStateActions={(nodeId, actionType, assignments) =>
                                    setNodes((nds) =>
                                        nds.map((node) =>
                                            node.id === nodeId
                                                ? {
                                                    ...node,
                                                    data: {
                                                        ...node.data,
                                                        [actionType]: assignments,
                                                    },
                                                }
                                                : node
                                        )
                                    )
                                }
                                onUpdateSendEvents={(nodeId, events) => {
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
                                        const baseName = String(
                                            node.data?.fullSkillName || ""
                                        )
                                            .split("#")[0]
                                            .split(".")
                                            .pop()
                                            .toLowerCase();
                                        if (baseName !== "nop") return false;
                                        if (!sharedScxmlStateId) {
                                            return node.id === nodeId;
                                        }
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

                                    // Once a Nop sends an event it becomes an outward forwarding
                                    // state. Ordinary SCXML transitions are mutually exclusive
                                    // with that behavior, so remove them from every visual clone.
                                    if (nonEmptyEvents.length > 0) {
                                        setEdges((currentEdges) =>
                                            currentEdges.filter(
                                                (edge) =>
                                                    !sharedNopIds.has(edge.source) ||
                                                    isSlotEdge(edge)
                                            )
                                        );
                                    }

                                    setNodes((nds) =>
                                        nds.map((node) => {
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

                                            return {
                                                ...node,
                                                data: {
                                                    ...node.data,
                                                    ...(nonEmptyEvents.length > 0
                                                        ? { events: clearedEvents }
                                                        : {}),
                                                    ...(nonEmptyEvents.length > 0
                                                        ? { onEntry: [], onExit: [] }
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
                                                    ...(nextEvents.length > 0
                                                        ? (() => {
                                                            const nextScxmlStateId =
                                                                getForwardingNopScxmlStateId(
                                                                    node,
                                                                    nextEvents[0]
                                                                );
                                                            return {
                                                                behaviorExitScxmlStateId:
                                                                nextScxmlStateId,
                                                                scxmlStateId:
                                                                nextScxmlStateId,
                                                            };
                                                        })()
                                                        : {}),
                                                },
                                            };
                                        })
                                    );
                                }}
                                onUpdateInSlotPath={(idx, val, commit = false) =>
                                    setNodes((nds) => {
                                        const updatedNodes = nds.map((n) =>
                                            n.id === selectedNode.id
                                                ? {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        inSlots: n.data.inSlots.map((s, i) =>
                                                            i === idx
                                                                ? { ...s, path: val }
                                                                : s
                                                        ),
                                                    },
                                                }
                                                : n
                                        );

                                        if (commit) {
                                            requestAnimationFrame(() =>
                                                checkSlotConnection(updatedNodes)
                                            );
                                        }

                                        return updatedNodes;
                                    })
                                }
                                onUpdateOutSlotPath={(idx, val, commit = false) =>
                                    setNodes((nds) => {
                                        const updatedNodes = nds.map((n) =>
                                            n.id === selectedNode.id
                                                ? {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        outSlots: n.data.outSlots.map((s, i) =>
                                                            i === idx
                                                                ? { ...s, path: val }
                                                                : s
                                                        ),
                                                    },
                                                }
                                                : n
                                        );

                                        if (commit) {
                                            requestAnimationFrame(() =>
                                                checkSlotConnection(updatedNodes)
                                            );
                                        }

                                        return updatedNodes;
                                    })
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
                                    setNodes((currentNodes) =>
                                        currentNodes.map((node) => ({
                                            ...node,
                                            selected: node.id === nodeId,
                                        }))
                                    );
                                    setSlotNodes((currentNodes) =>
                                        currentNodes.map((node) => ({
                                            ...node,
                                            selected: false,
                                        }))
                                    );
                                    setSelectedNodeId(nodeId);
                                    setRightPanelTab("details");

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
                                        setNodes((currentNodes) =>
                                            currentNodes.map((node) => ({
                                                ...node,
                                                selected: node.id === nodeId,
                                            }))
                                        );
                                        setSlotNodes((currentNodes) =>
                                            currentNodes.map((node) => ({
                                                ...node,
                                                selected: false,
                                            }))
                                        );
                                        setSelectedNodeId(nodeId);

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

            <div
                className="nodrag nopan"
                onMouseEnter={() => setIsShortcutHelpOpen(true)}
                onMouseLeave={() => setIsShortcutHelpOpen(false)}
                onFocusCapture={() => setIsShortcutHelpOpen(true)}
                onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                        setIsShortcutHelpOpen(false);
                    }
                }}
                style={{
                    position: "fixed",
                    right: 18,
                    bottom: 18,
                    zIndex: 5200,
                }}
            >
                {isShortcutHelpOpen && (
                    <div
                        role="tooltip"
                        style={{
                            position: "absolute",
                            right: 0,
                            bottom: 44,
                            width: 360,
                            maxWidth: "calc(100vw - 36px)",
                            maxHeight: "min(650px, calc(100vh - 90px))",
                            overflowY: "auto",
                            padding: 12,
                            border: "1px solid #475569",
                            borderRadius: 9,
                            background: "#111827",
                            color: "#e2e8f0",
                            boxShadow: "0 14px 35px rgba(0, 0, 0, 0.38)",
                            fontSize: 12,
                            pointerEvents: "auto",
                        }}
                    >
                        <div
                            style={{
                                marginBottom: 9,
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#f8fafc",
                            }}
                        >
                            Keyboard shortcuts
                        </div>

                        {EDITOR_SHORTCUTS.map((shortcut) => (
                            <div
                                key={shortcut.keys}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "145px 1fr",
                                    alignItems: "center",
                                    gap: 10,
                                    minHeight: 28,
                                }}
                            >
                                <kbd
                                    style={{
                                        justifySelf: "start",
                                        padding: "3px 6px",
                                        border: "1px solid #475569",
                                        borderBottomColor: "#64748b",
                                        borderRadius: 5,
                                        background: "#0f172a",
                                        color: "#cbd5e1",
                                        fontFamily: "inherit",
                                        fontSize: 10,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {shortcut.keys}
                                </kbd>
                                <span style={{ color: "#cbd5e1" }}>
                                    {shortcut.action}
                                </span>
                            </div>
                        ))}

                        <div
                            style={{
                                margin: "8px 0 5px",
                                paddingTop: 8,
                                borderTop: "1px solid #334155",
                                color: "#94a3b8",
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                            }}
                        >
                            In search
                        </div>

                        {FIND_SHORTCUTS.map((shortcut) => (
                            <div
                                key={shortcut.keys}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "145px 1fr",
                                    alignItems: "center",
                                    gap: 10,
                                    minHeight: 26,
                                }}
                            >
                                <kbd
                                    style={{
                                        justifySelf: "start",
                                        padding: "3px 6px",
                                        border: "1px solid #475569",
                                        borderRadius: 5,
                                        background: "#0f172a",
                                        color: "#cbd5e1",
                                        fontFamily: "inherit",
                                        fontSize: 10,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {shortcut.keys}
                                </kbd>
                                <span style={{ color: "#cbd5e1" }}>
                                    {shortcut.action}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    type="button"
                    aria-label="Show keyboard shortcuts"
                    aria-expanded={isShortcutHelpOpen}
                    title="Keyboard shortcuts"
                    style={{
                        width: 34,
                        height: 34,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid #475569",
                        borderRadius: 8,
                        background: "#111827",
                        color: "#cbd5e1",
                        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.28)",
                        cursor: "help",
                        fontSize: 18,
                        lineHeight: 1,
                    }}
                >
                    ⌨
                </button>
            </div>

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

