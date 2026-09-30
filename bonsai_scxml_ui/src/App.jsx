import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FiChevronLeft, FiChevronRight, FiPlus, FiX } from "react-icons/fi";
import {
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
    useReactFlow,
    useUpdateNodeInternals,
    applyEdgeChanges,
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
    getCollapsedTransitionSource,
} from "./utils/editorGraph";
import {
    getNodeId,
    COLLAPSED_CONTAINER_WIDTH,
    COLLAPSED_CONTAINER_HEIGHT,
    PARALLEL_EXIT_GUTTER,
    PARALLEL_NODE_GAP,
    PARALLEL_HEADER_HEIGHT,
    PARALLEL_LANE_CHILD_TOP_INSET,
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
    findDropContainerAtPoint,
    fitCompoundAndAncestorCompounds,
    growParallelToLaneContents,
    layoutStateContainerForExpansion,
    isAutoParallelLaneCompound,
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
import { rebuildBoundaryTransitionsIncremental } from "./utils/boundaryTransitions";
import { isWildcardTransitionEvent } from "./utils/transitionEvents";
import { getOverviewLayoutNodeSize } from "./utils/layoutUtils";
import {
    buildRuntimeReplayContexts,
    prepareRuntimeReplayCache,
} from "./utils/runtimeLog";
import { parseRuntimeLogForReplay } from "./utils/runtimeRust";
import "./App.css";

// Initialize API proxy for Tauri desktop mode (intercepts /api/* fetch calls)
initApiProxy();


// Detect if running in Tauri desktop app
const IS_DESKTOP = isTauri();

const EMPTY_RUNTIME_SET = new Set();

const yieldRuntimePreparationFrame = () =>
    new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve();
            return;
        }
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });

const hashRuntimeReplayValue = (seed, value) => {
    let hash = seed >>> 0;
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const buildRuntimeReplayCacheKey = (text, contexts = []) => {
    let hash = 2166136261;
    hash = hashRuntimeReplayValue(hash, text);

    (contexts || []).forEach((context) => {
        hash = hashRuntimeReplayValue(hash, context.tabId);
        hash = hashRuntimeReplayValue(hash, context.parentTabId);
        hash = hashRuntimeReplayValue(hash, (context.suffixParts || []).join("#"));
        (context.nodes || []).forEach((node) => {
            hash = hashRuntimeReplayValue(hash, node.id);
            hash = hashRuntimeReplayValue(hash, node.type);
            hash = hashRuntimeReplayValue(hash, node.parentId);
            hash = hashRuntimeReplayValue(hash, node.data?.fullSkillName);
            hash = hashRuntimeReplayValue(hash, node.data?.label);
            hash = hashRuntimeReplayValue(
                hash,
                JSON.stringify(node.data?.inSlots || [])
            );
            hash = hashRuntimeReplayValue(
                hash,
                JSON.stringify(node.data?.outSlots || [])
            );
        });
        (context.edges || []).forEach((edge) => {
            hash = hashRuntimeReplayValue(hash, edge.id);
            hash = hashRuntimeReplayValue(hash, edge.source);
            hash = hashRuntimeReplayValue(hash, edge.target);
            hash = hashRuntimeReplayValue(hash, edge.sourceHandle);
            hash = hashRuntimeReplayValue(hash, edge.targetHandle);
            hash = hashRuntimeReplayValue(hash, edge.data?.event);
            hash = hashRuntimeReplayValue(hash, edge.data?.path);
            hash = hashRuntimeReplayValue(hash, edge.data?.access);
        });
        (context.slotNodes || []).forEach((node) => {
            hash = hashRuntimeReplayValue(hash, node.id);
            hash = hashRuntimeReplayValue(hash, node.data?.path);
            hash = hashRuntimeReplayValue(hash, node.data?.label);
        });
        (context.slotEdges || []).forEach((edge) => {
            hash = hashRuntimeReplayValue(hash, edge.id);
            hash = hashRuntimeReplayValue(hash, edge.source);
            hash = hashRuntimeReplayValue(hash, edge.target);
            hash = hashRuntimeReplayValue(hash, edge.data?.path);
            hash = hashRuntimeReplayValue(hash, edge.data?.access);
            hash = hashRuntimeReplayValue(hash, edge.data?.slotKey);
        });
        (context.globalDataModel || []).forEach((entry) => {
            hash = hashRuntimeReplayValue(hash, entry?.id);
            hash = hashRuntimeReplayValue(hash, entry?.expr);
        });
    });

    return `${text.length}:${hash.toString(16)}`;
};


const isEditorCloneNode = (node) => Boolean(
    node?.data?.cloneOfNodeId &&
    (
        node.data?.isSkillClone ||
        node.data?.isStateClone ||
        node.data?.isSlotClone
    )
);

const isCloneableSkillNode = (node) => {
    if (!node || node.type !== "custom" || isEditorCloneNode(node)) {
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

const isCloneableEditorNode = (node) => Boolean(
    isCloneableSkillNode(node) ||
    (node &&
        ["submachine", "compound", "parallel", "slot"].includes(node.type) &&
        !isEditorCloneNode(node) &&
        !node.data?.autoParallelLaneCompound)
);

const createReferenceId = () =>
    `ref-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

const buildEditorCloneNode = (sourceNode, position) => {
    if (!isCloneableEditorNode(sourceNode)) return null;

    if (sourceNode.type === "slot") {
        return {
            id: `slot-clone-${crypto.randomUUID()}`,
            position,
            type: "slot",
            selected: true,
            data: {
                ...(sourceNode.data || {}),
                cloneOfNodeId: sourceNode.id,
                editorInstanceId: createReferenceId(),
                isSlotClone: true,
            },
        };
    }

    const commonData = {
        label: sourceNode.data?.label || sourceNode.data?.fullSkillName || "State",
        fullSkillName:
            sourceNode.data?.fullSkillName ||
            sourceNode.data?.label ||
            "State",
        cloneOfNodeId: sourceNode.id,
        editorInstanceId: createReferenceId(),
        isInitial: false,
        isFinal: false,
        events: [],
        inSlots: [],
        outSlots: [],
        params: [],
        onEntry: [],
        onExit: [],
    };

    if (sourceNode.type === "custom") {
        return {
            id: getNodeId(),
            position,
            type: "custom",
            selected: true,
            data: {
                ...commonData,
                isSkillClone: true,
            },
        };
    }

    return {
        id: getNodeId(),
        position,
        type: "stateClone",
        selected: true,
        data: {
            ...commonData,
            isStateClone: true,
            sourceNodeType: sourceNode.type,
        },
    };
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

    // Keep functions and primitives as-is for normal in-memory graph copies.
    return value;
};

// The graph clipboard outlives the currently displayed graph. It must never
// retain render callbacks or routing caches from copied nodes/edges: those
// objects can close over an entire previous workflow and keep it alive even
// after every visible node has been removed.
const CLIPBOARD_TRANSIENT_KEYS = new Set([
    "routingNodes",
    "slotConnectionDrag",
    "outgoingTransitionHandles",
    "isDropTarget",
    "mode",
]);

const cloneClipboardValue = (value, ancestors = new WeakSet()) => {
    if (typeof value === "function") return undefined;

    if (Array.isArray(value)) {
        if (ancestors.has(value)) return undefined;
        ancestors.add(value);
        const clone = [];
        value.forEach((entry) => {
            const copiedEntry = cloneClipboardValue(entry, ancestors);
            if (copiedEntry !== undefined) clone.push(copiedEntry);
        });
        ancestors.delete(value);
        return clone;
    }

    if (value && typeof value === "object") {
        if (ancestors.has(value)) return undefined;
        ancestors.add(value);
        const clone = {};
        Object.entries(value).forEach(([key, entry]) => {
            if (CLIPBOARD_TRANSIENT_KEYS.has(key)) return;
            const copiedEntry = cloneClipboardValue(entry, ancestors);
            if (copiedEntry !== undefined) clone[key] = copiedEntry;
        });
        ancestors.delete(value);
        return clone;
    }

    return value;
};

// Keep the editor clipboard outside AppContent. Selection changes, workflow
// focus changes, or an AppContent remount must not invalidate something the
// user already copied. This is intentionally session-only editor state.
let persistentGraphClipboard = null;

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
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [slotNodes, setSlotNodes, onSlotNodesChange] = useNodesState([]);
    const [slotEdges, setSlotEdges, onSlotEdgesChange] = useEdgesState([]);

    // Internal graph clipboard. This intentionally does not use the system
    // clipboard: Ctrl+C copies the current React Flow selection and
    // Ctrl+V recreates it with fresh graph IDs.
    const graphClipboardRef = useRef(null);
    const [hasGraphClipboard, setHasGraphClipboard] = useState(() =>
        Boolean(
            persistentGraphClipboard &&
                ((persistentGraphClipboard.nodes?.length || 0) > 0 ||
                    (persistentGraphClipboard.slotNodes?.length || 0) > 0)
        )
    );
    useEffect(() => {
        // Also sanitize a clipboard created by an older/hot-reloaded version
        // so stale callback closures are released immediately.
        const sanitizedClipboard = persistentGraphClipboard
            ? cloneClipboardValue(persistentGraphClipboard)
            : null;
        graphClipboardRef.current = sanitizedClipboard;
        persistentGraphClipboard = sanitizedClipboard;
    }, []);
    const captureGraphSelectionRef = useRef(null);
    const requestGraphPasteRef = useRef(null);
    const flowContainerRef = useRef(null);
    const editorPointerPositionRef = useRef({
        inside: false,
        clientX: null,
        clientY: null,
    });
    // Keep an authoritative snapshot of React Flow's current selection.
    // Reading `node.selected` from the controlled nodes array can lag behind
    // the interaction by a render, especially when Ctrl/Meta multi-selecting.
    const graphSelectionRef = useRef(new Set());
    // When a visual slot clone is deleted, its connected semantic slot edges
    // are retargeted to the canonical slot instead of disconnecting the skill.
    // React Flow may still emit remove changes for the old visual edges; keep
    // those edge IDs here so that follow-up removal events can be ignored.
    const remappedSlotCloneEdgeIdsRef = useRef(new Set());
    const handleGraphSelectionChange = useCallback(({ nodes: selectedFlowNodes = [] }) => {
        graphSelectionRef.current = new Set(
            selectedFlowNodes.map((node) => node.id)
        );
    }, []);

    // Editor-wide Find (Ctrl+F): searches skill/behavior nodes and slot paths
    // in the currently active workflow.
    const [isFindOpen, setIsFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState("");
    const [findResultIndex, setFindResultIndex] = useState(0);
    const findInputRef = useRef(null);
    const findPanelRef = useRef(null);
    const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
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

    // Runtime-log playback is intentionally separate from graph selection.
    // A loaded trace can therefore highlight the executed flow without
    // changing the user's current editor selection or transition editing state.
    const [runtimeLog, setRuntimeLog] = useState(null);
    const [runtimeReplayCache, setRuntimeReplayCache] = useState(null);
    const [runtimePreparation, setRuntimePreparation] = useState(null);
    const [runtimeStepIndex, setRuntimeStepIndex] = useState(0);
    const [runtimeStarted, setRuntimeStarted] = useState(false);
    const [runtimeTraceNeedsFit, setRuntimeTraceNeedsFit] = useState(false);
    const [runtimePlaying, setRuntimePlaying] = useState(false);
    const [runtimePlaybackDelay, setRuntimePlaybackDelay] = useState(800);
    const [runtimeChangesPanelOpen, setRuntimeChangesPanelOpen] = useState(true);
    const [runtimeFocusRequest, setRuntimeFocusRequest] = useState(0);
    const runtimeFocusHandledRef = useRef(-1);
    const runtimeReplayContextsRef = useRef([]);
    const runtimeReplayCacheStoreRef = useRef(new Map());
    const runtimeLoadRequestRef = useRef(0);

    const handleLoadRuntimeLog = useCallback(async (text, fileName = "runtime.log") => {
        const requestId = runtimeLoadRequestRef.current + 1;
        runtimeLoadRequestRef.current = requestId;
        setRuntimePlaying(false);
        setRuntimePreparation({
            fileName,
            phase: "Reading runtime log…",
            progress: 0.08,
        });
        // Runtime playback also visualizes slot values, so always use the
        // overview mode where both state and slot nodes are mounted.
        setActiveMode("overview");

        try {
            // Yield once before doing any parsing so the loading screen is
            // guaranteed to paint, even for a very large local log file.
            await yieldRuntimePreparationFrame();
            if (runtimeLoadRequestRef.current !== requestId) return;

            const contexts = runtimeReplayContextsRef.current || [];
            const cacheKey = buildRuntimeReplayCacheKey(text, contexts);
            const cached = runtimeReplayCacheStoreRef.current.get(cacheKey);

            let parsed;
            let prepared;

            if (cached) {
                setRuntimePreparation({
                    fileName,
                    phase: "Loading cached replay…",
                    progress: 0.9,
                });
                await yieldRuntimePreparationFrame();
                if (runtimeLoadRequestRef.current !== requestId) return;
                parsed = { ...cached.log, fileName };
                prepared = cached.cache;
                runtimeReplayCacheStoreRef.current.delete(cacheKey);
                runtimeReplayCacheStoreRef.current.set(cacheKey, cached);
            } else {
                setRuntimePreparation({
                    fileName,
                    phase: "Parsing transitions and runtime values…",
                    progress: 0.16,
                });
                await yieldRuntimePreparationFrame();
                if (runtimeLoadRequestRef.current !== requestId) return;

                parsed = {
                    ...(await parseRuntimeLogForReplay(text)),
                    fileName,
                };

                prepared = await prepareRuntimeReplayCache(parsed, contexts, {
                    onProgress: ({ phase, progress }) => {
                        if (runtimeLoadRequestRef.current !== requestId) return;
                        setRuntimePreparation({ fileName, phase, progress });
                    },
                    yieldControl: yieldRuntimePreparationFrame,
                });

                if (runtimeLoadRequestRef.current !== requestId) return;

                const store = runtimeReplayCacheStoreRef.current;
                store.set(cacheKey, { log: parsed, cache: prepared });
                // Keep a small LRU-like in-memory cache. Re-loading a recent
                // trace against the same graph becomes effectively instant
                // without allowing large logs to accumulate indefinitely.
                while (store.size > 4) {
                    const oldestKey = store.keys().next().value;
                    store.delete(oldestKey);
                }
            }

            if (runtimeLoadRequestRef.current !== requestId) return;

            setRuntimeLog(parsed);
            setRuntimeReplayCache(prepared);
            setRuntimeStepIndex(0);
            setRuntimeStarted(false);
            setRuntimeTraceNeedsFit(true);
            setRuntimePlaying(false);
            setRuntimeChangesPanelOpen(true);
            setRuntimePreparation(null);
        } catch (error) {
            console.error("Failed to prepare runtime replay", error);
            if (runtimeLoadRequestRef.current === requestId) {
                setRuntimePreparation(null);
            }
        }
    }, []);

    const handleClearRuntimeLog = useCallback(() => {
        runtimeLoadRequestRef.current += 1;
        setRuntimePlaying(false);
        setRuntimeStepIndex(0);
        setRuntimeStarted(false);
        setRuntimeTraceNeedsFit(false);
        setRuntimeLog(null);
        setRuntimeReplayCache(null);
        setRuntimePreparation(null);
    }, []);

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


    useEffect(() => {
        const stepCount = runtimeLog?.steps?.length || 0;
        if (!runtimePlaying || stepCount === 0) return undefined;

        const timer = window.setTimeout(() => {
            if (runtimeStepIndex >= stepCount - 1) {
                setRuntimePlaying(false);
                return;
            }

            setRuntimeStepIndex(runtimeStepIndex + 1);
            setRuntimeFocusRequest((value) => value + 1);
        }, runtimePlaybackDelay);

        return () => window.clearTimeout(timer);
    }, [
        runtimeLog,
        runtimePlaying,
        runtimeStepIndex,
        runtimePlaybackDelay,
    ]);

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

    const {
        screenToFlowPosition,
        fitView,
        getNodes,
        setCenter,
        getViewport,
        setViewport,
    } = useReactFlow();
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
                        isEditorCloneNode(node) &&
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
                if (!isEditorCloneNode(node)) {
                    nextNodes.push(node);
                    return;
                }

                const sourceNode = byId.get(node.data?.cloneOfNodeId);
                if (!sourceNode || isEditorCloneNode(sourceNode)) {
                    changed = true;
                    return;
                }

                const nextLabel = sourceNode.data?.label || node.data?.label;
                const nextFullSkillName =
                    sourceNode.data?.fullSkillName || node.data?.fullSkillName;

                const nextSourceNodeType = node.data?.isStateClone
                    ? sourceNode.type
                    : node.data?.sourceNodeType;

                if (
                    node.data?.label === nextLabel &&
                    node.data?.fullSkillName === nextFullSkillName &&
                    node.data?.sourceNodeType === nextSourceNodeType
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
                        ...(node.data?.isStateClone
                            ? { sourceNodeType: nextSourceNodeType }
                            : {}),
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
    ]);
    const [inheritedGlobalDataModel, setInheritedGlobalDataModel] = useState([]);
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
        selectedNodeId,
        setSelectedNodeId,
        fitView,
        getViewport,
        setViewport,
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
        selectedNodeId,
        setSelectedNodeId,
        getViewport,
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

    const getContextNodeLabel = useCallback((node) => {
        if (!node) return "Node";
        return (
            node.data?.label ||
            node.data?.fullSkillName ||
            node.data?.path ||
            node.id ||
            "Node"
        );
    }, []);

    const handleContextMenuOpen = useCallback((event, clickedNode = null, clickedEdge = null) => {
        event.preventDefault();
        event.stopPropagation();

        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

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
                slotIndex: Number.isInteger(Number(clickedEdge.data?.slotIndex))
                    ? Number(clickedEdge.data.slotIndex)
                    : null,
                title: slotConnection
                    ? `${getContextNodeLabel(
                          allEditorNodes.find((node) => node.id === slotSkillNodeId)
                      )} ↔ ${getContextNodeLabel(
                          allEditorNodes.find((node) => node.id === slotNodeId)
                      )}`
                    : `${getContextNodeLabel(sourceNode)}.${logicalSourceHandle} → ${getContextNodeLabel(targetNode)}`,
            });
            return;
        }

        if (clickedNode) {
            if (!clickedNode.selected) {
                if (clickedNode.type === "slot") {
                    setNodes((nds) =>
                        nds.map((node) => ({ ...node, selected: false }))
                    );
                    setSlotNodes((currentSlotNodes) =>
                        currentSlotNodes.map((node) => ({
                            ...node,
                            selected: node.id === clickedNode.id,
                        }))
                    );
                } else {
                    setNodes((nds) =>
                        nds.map((node) => ({
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
                    : ["compound", "parallelLane"].includes(clickedNode.type)
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
    }, [
        getContextNodeLabel,
        isSlotEdge,
        nodes,
        screenToFlowPosition,
        selectSlotEdge,
        selectTransitionEdge,
        setNodes,
        setSelectedNodeId,
        setSlotNodes,
        slotNodes,
    ]);

    const selectedSlotNodes = slotNodes.filter((node) => node.selected);
    const editorCloneSelection = [
        ...selectedNodes,
        ...selectedSlotNodes,
    ];
    const editorCloneSourceNode =
        editorCloneSelection.length === 1
            ? editorCloneSelection[0]
            : null;

    const handleCreateEditorClone = useCallback(() => {
        if (!contextMenu?.flowPosition) return;

        const sourceNode = editorCloneSourceNode;
        if (!isCloneableEditorNode(sourceNode)) return;

        const cloneNode = buildEditorCloneNode(sourceNode, {
            x: Number(contextMenu.flowPosition.x || 0) + 220,
            y: Number(contextMenu.flowPosition.y || 0),
        });
        if (!cloneNode) return;

        if (sourceNode.type === "slot") {
            setNodes((currentNodes) =>
                currentNodes.map((node) => ({ ...node, selected: false }))
            );
            setSlotNodes((currentSlotNodes) => [
                ...currentSlotNodes.map((node) => ({
                    ...node,
                    selected: false,
                })),
                cloneNode,
            ]);
        } else {
            setSlotNodes((currentSlotNodes) =>
                currentSlotNodes.map((node) => ({ ...node, selected: false }))
            );
            setNodes((currentNodes) => [
                ...currentNodes.map((node) => ({
                    ...node,
                    selected: false,
                })),
                cloneNode,
            ]);
        }

        setSelectedNodeId(cloneNode.id);
        setRightPanelTab("details");
        setActiveTab(sourceNode.type === "slot" ? "slots" : "allgemein");
    }, [
        contextMenu,
        editorCloneSourceNode,
        setNodes,
        setSlotNodes,
        setSelectedNodeId,
        setRightPanelTab,
        setActiveTab,
    ]);

    const handleGraphClipboardContextAction = useCallback((type) => {
        if (type === "copy") {
            captureGraphSelectionRef.current?.();
        } else if (type === "paste") {
            requestGraphPasteRef.current?.(contextMenu?.flowPosition || null);
        }
        setContextMenu(null);
    }, [contextMenu]);

    const setNodeAsInitial = useCallback((nodeId) => {
        if (!nodeId) return;

        setNodes((nds) => {
            const selected = nds.find((node) => node.id === nodeId);
            if (!selected || !selected.parentId || isEditorCloneNode(selected)) {
                return nds;
            }

            const parentId = selected.parentId;
            const parentNode = nds.find((node) => node.id === parentId);
            if (!parentNode || !["compound", "parallelLane"].includes(parentNode.type)) {
                return nds;
            }

            return nds.map((node) => {
                if (node.id === parentId && parentNode.type === "compound") {
                    return {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            initialChildId: selected.id,
                        },
                    };
                }

                if ((node.parentId || null) !== parentId) return node;
                if (node.type === "slot" || node.type === "parallelLane") {
                    return node;
                }

                return {
                    ...node,
                    data: {
                        ...(node.data || {}),
                        isInitial: node.id === selected.id,
                    },
                };
            });
        });
    }, [setNodes]);

    const addEmptyStateToContainer = useCallback((parentId) => {
        if (!parentId) return;

        const newNodeId = getNodeId();
        setNodes((currentNodes) => {
            const parent = currentNodes.find((node) => node.id === parentId);
            if (!parent || !["compound", "parallelLane"].includes(parent.type)) {
                return currentNodes;
            }

            const children = currentNodes.filter(
                (node) => node.parentId === parentId && node.type !== "parallelLane"
            );
            const stateCount = currentNodes.filter(
                (node) =>
                    String(node.data?.label || "").startsWith("state_")
            ).length;
            const stateName = `state_${stateCount + 1}`;
            const isFirstChild = children.length === 0;
            const childX = parent.type === "compound" ? COMPOUND_PADDING_X : 24;
            const childStartY =
                parent.type === "compound"
                    ? COMPOUND_HEADER_HEIGHT + 18
                    : PARALLEL_LANE_CHILD_TOP_INSET;
            const nextY = children.reduce((maxY, child) => {
                const size = getOverviewLayoutNodeSize(child);
                return Math.max(
                    maxY,
                    Number(child.position?.y || 0) + size.height + 18
                );
            }, childStartY);

            const newState = {
                id: newNodeId,
                type: "compound",
                parentId,
                extent: "parent",
                expandParent: true,
                position: { x: childX, y: nextY },
                style: { width: 300, height: 180 },
                selected: true,
                data: {
                    label: stateName,
                    fullSkillName: stateName,
                    isInitial: isFirstChild,
                    events: [],
                },
            };

            const withSelection = currentNodes.map((node) => ({
                ...node,
                selected: false,
                ...(node.id === parentId && parent.type === "compound" && isFirstChild
                    ? {
                          data: {
                              ...(node.data || {}),
                              initialChildId: newNodeId,
                          },
                      }
                    : {}),
            }));

            let nextNodes = resolveNodeCollisionsAndRefit(
                [...withSelection, newState],
                newNodeId
            );
            nextNodes = normalizeParallelLaneCompounds(nextNodes);
            nextNodes = normalizeCompoundInitialStates(nextNodes);
            return orderNodesParentsFirst(nextNodes);
        });

        setSelectedNodeId(newNodeId);
        setRightPanelTab("details");
        setActiveTab("allgemein");
    }, [setNodes, setSelectedNodeId, setRightPanelTab, setActiveTab]);

    const handleSelectAction = (type, payload = null) => {
        const hasSelection = selectedNodes.length > 0;
        const contextNodeId = contextMenu?.nodeId || null;
        const contextEdgeId = contextMenu?.edgeId || null;

        if (type === "copy" || type === "paste") {
            handleGraphClipboardContextAction(type);
            return;
        }

        if (type === "open-details" && contextNodeId) {
            const node = [...nodes, ...slotNodes].find(
                (candidate) => candidate.id === contextNodeId
            );
            if (node?.type === "slot") {
                setNodes((current) =>
                    current.map((candidate) => ({ ...candidate, selected: false }))
                );
                setSlotNodes((current) =>
                    current.map((candidate) => ({
                        ...candidate,
                        selected: candidate.id === contextNodeId,
                    }))
                );
            } else {
                setNodes((current) =>
                    current.map((candidate) => ({
                        ...candidate,
                        selected: candidate.id === contextNodeId,
                    }))
                );
                setSlotNodes((current) =>
                    current.map((candidate) => ({ ...candidate, selected: false }))
                );
            }
            setSelectedNodeId(contextNodeId);
            setRightPanelTab("details");
            setActiveTab(node?.type === "slot" ? "slots" : "allgemein");
        } else if (type === "open-transitions" && contextNodeId) {
            const node = nodes.find((candidate) => candidate.id === contextNodeId);
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
            handleCreateEditorClone();
        } else if (type === "compound") {
            if (hasSelection && contextMenu?.kind === "node") {
                handleCreateCompoundFromSelected();
            } else {
                handleCreateEmptyCompound(contextMenu.flowPosition);
            }
        } else if (type === "parallel") {
            if (hasSelection && contextMenu?.kind === "node") {
                handleCreateParallelFromSelected();
            } else {
                handleCreateEmptyParallel(contextMenu.flowPosition);
            }
        } else if (type === "submachine") {
            const nextIndex = nodes.filter((node) => node.type === "submachine").length + 1;
            setPendingSubMachineCreation({
                fromSelection: hasSelection && contextMenu?.kind === "node",
                flowPosition: contextMenu.flowPosition,
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
            const edge = edges.find((candidate) => candidate.id === contextEdgeId);
            if (edge) onEdgeDoubleClick(null, edge);
        } else if (type === "change-transition-target" && contextEdgeId) {
            const edge = edges.find((candidate) => candidate.id === contextEdgeId);
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
            const edgeKind = contextMenu?.isSlotConnection ? "slot" : "transition";
            const sourceEdges = edgeKind === "slot" ? slotEdges : edges;
            const edge = sourceEdges.find((candidate) => candidate.id === contextEdgeId);

            if (flowPosition && edge) {
                setControlPointInsertRequest({
                    requestId: crypto.randomUUID(),
                    edgeId: contextEdgeId,
                    edgeKind,
                    expectedControlPointCount: Array.isArray(edge.data?.controlPoints)
                        ? edge.data.controlPoints.length
                        : 0,
                    flowPosition: {
                        x: Number(flowPosition.x || 0),
                        y: Number(flowPosition.y || 0),
                    },
                });
            }
        } else if (type === "remove-control-point" && contextEdgeId) {
            const edgeKind = contextMenu?.edgeKind === "slot" ? "slot" : "transition";
            const sourceEdges = edgeKind === "slot" ? slotEdges : edges;
            const edge = sourceEdges.find((candidate) => candidate.id === contextEdgeId);
            const pointId = contextMenu?.pointId;

            if (edge && pointId) {
                const nextControlPoints = Array.isArray(edge.data?.controlPoints)
                    ? edge.data.controlPoints.filter((point) => point.id !== pointId)
                    : [];

                updatePersistentEdgeControlPoints(
                    contextEdgeId,
                    nextControlPoints,
                    edgeKind
                );
            }
        } else if (type === "delete-transition" && contextEdgeId) {
            handleVisibleEdgesChange([{ id: contextEdgeId, type: "remove" }]);
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
        } else if (type === "go-slot-skill" && contextMenu?.slotSkillNodeId) {
            handleNavigateCloneSource(contextMenu.slotSkillNodeId);
            setActiveTab("slots");
        } else if (type === "go-slot-node" && contextMenu?.slotNodeId) {
            const slotNodeId = contextMenu.slotNodeId;
            clearAllEdgeSelection();
            setNodes((current) =>
                current.map((node) => ({ ...node, selected: false }))
            );
            setSlotNodes((current) =>
                current.map((node) => ({
                    ...node,
                    selected: node.id === slotNodeId,
                }))
            );
            setSelectedNodeId(slotNodeId);
            setRightPanelTab("details");
            setActiveTab("slots");

            window.setTimeout(() => {
                const flowNode = getNodes().find((node) => node.id === slotNodeId);
                if (!flowNode) return;
                const position = getAbsoluteNodePosition(flowNode, getNodes());
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
                setCenter(
                    position.x + width / 2,
                    position.y + height / 2,
                    { zoom: 1, duration: 300 }
                );
            }, 30);
        } else if (type === "disconnect-slot" && contextEdgeId) {
            handleVisibleEdgesChange([{ id: contextEdgeId, type: "remove" }]);
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

    // Build the semantic hierarchy once per real topology/data change. Compound
    // and Parallel operations used to construct several independent maps and
    // then rediscover collapsed descendants by repeatedly traversing the same
    // subtrees. Large workflows with many nested containers paid that cost over
    // and over even though parent/child membership had not changed.
    //
    // Keep all hierarchy-derived data together so every consumer shares the
    // same cached topology snapshot. Collapsed visibility is propagated in one
    // tree walk: each semantic node is visited at most once, even when several
    // collapsed containers are nested inside one another.
    const semanticHierarchy = useMemo(() => {
        const nodeById = new Map();
        const parentByNodeId = new Map();
        const childIdsByParent = new Map();
        const childrenByParent = new Map();

        semanticNodes.forEach((node) => {
            nodeById.set(node.id, node);

            if (!node.parentId) return;
            parentByNodeId.set(node.id, node.parentId);

            if (!childIdsByParent.has(node.parentId)) {
                childIdsByParent.set(node.parentId, []);
                childrenByParent.set(node.parentId, []);
            }

            childIdsByParent.get(node.parentId).push(node.id);
            childrenByParent.get(node.parentId).push(node);
        });

        const hiddenNodeIds = new Set();
        const visitedNodeIds = new Set();
        const stack = [];

        // Start with semantic roots. Children of a collapsed Compound/Parallel
        // inherit hidden=true, but the container itself remains visible.
        semanticNodes.forEach((node) => {
            if (!node.parentId || !nodeById.has(node.parentId)) {
                stack.push({ node, hiddenByAncestor: false });
            }
        });

        const walk = () => {
            while (stack.length > 0) {
                const { node, hiddenByAncestor } = stack.pop();
                if (!node || visitedNodeIds.has(node.id)) continue;
                visitedNodeIds.add(node.id);

                if (hiddenByAncestor) hiddenNodeIds.add(node.id);

                const hidesChildren =
                    hiddenByAncestor ||
                    ((node.type === "compound" || node.type === "parallel") &&
                        Boolean(node.data?.isCollapsed));

                const children = childrenByParent.get(node.id) || [];
                for (let index = children.length - 1; index >= 0; index -= 1) {
                    stack.push({
                        node: children[index],
                        hiddenByAncestor: hidesChildren,
                    });
                }
            }
        };

        walk();

        // Malformed/imported graphs can contain orphaned parent cycles or
        // disconnected islands. Process them as additional roots so the index
        // remains total without risking an infinite traversal.
        semanticNodes.forEach((node) => {
            if (visitedNodeIds.has(node.id)) return;
            stack.push({ node, hiddenByAncestor: false });
            walk();
        });

        return {
            nodeById,
            parentByNodeId,
            childIdsByParent,
            childrenByParent,
            hiddenNodeIds,
        };
    }, [semanticNodes]);

    const nodeById = semanticHierarchy.nodeById;
    const childIdsByParent = semanticHierarchy.childIdsByParent;
    const semanticChildrenByParent = semanticHierarchy.childrenByParent;
    const hiddenNodeIds = semanticHierarchy.hiddenNodeIds;

    const slotNodeIdSet = useMemo(
        () => new Set(semanticSlotNodes.map((node) => node.id)),
        [semanticSlotNodes]
    );

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

    // Cache the transition handles used by each skill for its local validation
    // badge. CustomNode used to call React Flow's useEdges(), which subscribed
    // every skill node to the entire edge array. With a large state machine,
    // showing/highlighting one transition could therefore wake up every skill.
    // Keep the full transition graph loaded, but expose only this tiny derived
    // per-skill dependency to the node renderer.
    const outgoingTransitionHandlesCacheRef = useRef({
        byNodeId: new Map(),
        signaturesByNodeId: new Map(),
    });

    const outgoingTransitionHandlesByNodeId = useMemo(() => {
        const handlesByNodeId = new Map();

        edges.forEach((edge) => {
            if (!edge?.source) return;
            const handle = edge.sourceHandle;
            if (handle === undefined || handle === null) return;

            if (!handlesByNodeId.has(edge.source)) {
                handlesByNodeId.set(edge.source, new Set());
            }
            handlesByNodeId.get(edge.source).add(String(handle));
        });

        const previous = outgoingTransitionHandlesCacheRef.current;
        const nextSignatures = new Map();
        handlesByNodeId.forEach((handles, nodeId) => {
            nextSignatures.set(nodeId, [...handles].sort().join("\u001f"));
        });

        // React Flow changes edge object identity for selection and other
        // presentation-only updates. Those changes must not invalidate every
        // skill node. Keep this derived map referentially stable unless the
        // semantic set of source handles actually changed.
        const topologyUnchanged =
            previous.signaturesByNodeId.size === nextSignatures.size &&
            [...nextSignatures].every(
                ([nodeId, signature]) =>
                    previous.signaturesByNodeId.get(nodeId) === signature
            );

        if (topologyUnchanged) return previous.byNodeId;

        const result = new Map();
        nextSignatures.forEach((signature, nodeId) => {
            const previousEntry = previous.byNodeId.get(nodeId);
            if (previousEntry?.signature === signature) {
                result.set(nodeId, previousEntry);
                return;
            }

            result.set(nodeId, {
                handles: signature ? signature.split("\u001f") : [],
                signature,
            });
        });

        outgoingTransitionHandlesCacheRef.current = {
            byNodeId: result,
            signaturesByNodeId: nextSignatures,
        };
        return result;
    }, [edges]);

    // Expose the single semantic incoming transition to the target node so the
    // visible entry handle can hand the drag off to React Flow's native edge
    // reconnect anchor. With zero or multiple incoming transitions the entry
    // handle remains a normal target only.
    const reconnectableIncomingEdgeByNodeId = useMemo(() => {
        const incoming = new Map();

        edges.forEach((edge) => {
            if (
                edge.data?.boundaryInternalEdge ||
                edge.data?.compoundInternalEdge ||
                edge.data?.parallelInternalEdge ||
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge
            ) {
                return;
            }
            if (!edge.target) return;

            if (!incoming.has(edge.target)) incoming.set(edge.target, []);
            incoming.get(edge.target).push(edge);
        });

        return new Map(
            [...incoming.entries()]
                .filter(([, incomingEdges]) => incomingEdges.length === 1)
                .map(([nodeId, incomingEdges]) => [nodeId, incomingEdges[0].id])
        );
    }, [edges]);

    // Track outgoing transitions whose event handle is not actually exposed by
    // the source state. Imported SCXML can legitimately contain such edges: we
    // keep them visible and report them in Problems, but the source skill/Sub-SM
    // should also carry the small warning badge. Derive this from the same
    // semantic event metadata used by the Problems validator.
    const unexposedTransitionHandlesByNodeId = useMemo(() => {
        const result = new Map();

        nodes.forEach((node) => {
            const outgoingHandles =
                outgoingTransitionHandlesByNodeId.get(node.id)?.handles || [];
            if (outgoingHandles.length === 0) return;

            const exposedHandles = new Set(
                (node.data?.events || [])
                    .filter(
                        (event) =>
                            !event?.editorImportedSynthetic &&
                            !event?.editorBoundarySynthetic
                    )
                    .map((event) => String(event?.id || "").trim())
                    .filter(Boolean)
            );
            const baseStateName = String(
                node.data?.fullSkillName || node.data?.label || ""
            )
                .split("#")[0]
                .split(".")
                .pop()
                .toLowerCase();
            const exposesImplicitFatal =
                node.type === "custom" &&
                !node.data?.isFinal &&
                !node.data?.isBehaviorExit &&
                baseStateName !== "end" &&
                baseStateName !== "fatal";

            if (exposesImplicitFatal) exposedHandles.add("fatal");

            const unexposedHandles = outgoingHandles
                .map((handle) => String(handle || "").trim())
                .filter(
                    (handle) =>
                        handle &&
                        handle !== "*" &&
                        !exposedHandles.has(handle)
                )
                .sort();

            if (unexposedHandles.length > 0) {
                result.set(node.id, unexposedHandles);
            }
        });

        return result;
    }, [nodes, outgoingTransitionHandlesByNodeId]);

    const collapsedParallelTransitionHandlesByNodeId = useMemo(() => {
        const result = new Map();

        edges.forEach((edge) => {
            if (
                edge.data?.boundaryInternalEdge ||
                edge.data?.compoundInternalEdge ||
                edge.data?.parallelInternalEdge ||
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge
            ) {
                return;
            }

            const collapsedSource = getCollapsedTransitionSource(edge, nodeById);
            if (!collapsedSource) return;
            if (nodeById.get(collapsedSource.nodeId)?.type !== "parallel") return;

            if (!result.has(collapsedSource.nodeId)) {
                result.set(collapsedSource.nodeId, new Map());
            }

            const byHandle = result.get(collapsedSource.nodeId);
            if (!byHandle.has(collapsedSource.sourceHandle)) {
                byHandle.set(collapsedSource.sourceHandle, {
                    id: collapsedSource.sourceHandle,
                    name: collapsedSource.label,
                    sourceNodeId: collapsedSource.logicalSourceId,
                    transitionHandleId: collapsedSource.logicalHandle,
                });
            }
        });

        return new Map(
            [...result.entries()].map(([nodeId, byHandle]) => [
                nodeId,
                [...byHandle.values()],
            ])
        );
    }, [edges, nodeById]);


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
            const outgoingTransitionInfo =
                outgoingTransitionHandlesByNodeId.get(n.id) || null;
            const outgoingTransitionSignature =
                outgoingTransitionInfo?.signature || "";
            const unexposedTransitionHandles =
                unexposedTransitionHandlesByNodeId.get(n.id) || [];
            const unexposedTransitionSignature =
                unexposedTransitionHandles.join("\u001f");
            const collapsedTransitionHandles =
                collapsedParallelTransitionHandlesByNodeId.get(n.id) || [];
            const reconnectIncomingEdgeId =
                (n.type === "custom" || n.type === "submachine")
                    ? reconnectableIncomingEdgeByNodeId.get(n.id) || null
                    : null;
            const collapsedTransitionSignature = collapsedTransitionHandles
                .map((event) => `${event.id}:${event.sourceNodeId}:${event.transitionHandleId}`)
                .join("\u001f");
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
                cached.outgoingTransitionSignature ===
                    outgoingTransitionSignature &&
                cached.unexposedTransitionSignature ===
                    unexposedTransitionSignature &&
                cached.collapsedTransitionSignature ===
                    collapsedTransitionSignature &&
                cached.reconnectIncomingEdgeId === reconnectIncomingEdgeId &&
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
                outgoingTransitionHandles:
                    outgoingTransitionInfo?.handles || [],
                unexposedTransitionHandles,
                collapsedTransitionHandles,
                reconnectIncomingEdgeId,
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
                outgoingTransitionSignature,
                unexposedTransitionSignature,
                collapsedTransitionSignature,
                reconnectIncomingEdgeId,
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
        outgoingTransitionHandlesByNodeId,
        unexposedTransitionHandlesByNodeId,
        collapsedParallelTransitionHandlesByNodeId,
        reconnectableIncomingEdgeByNodeId,
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
                    selectedNodeId: null,
                    viewport: null,
                    inheritedGlobalDataModel: [],
                    globalDataModel: parsed.globalDataModel,
                };

                let currentViewport = null;
                try {
                    currentViewport = getViewport?.() || null;
                } catch {
                    // Keep the previous saved viewport if React Flow is not mounted.
                }

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
                                selectedNodeId: selectedNodeId || null,
                                viewport: currentViewport || tab.viewport || null,
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
                checkSlotConnection(
                    parsedNodes,
                    [],
                    parsed.editorSlotNodes || []
                );

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
            selectedNodeId,
            getViewport,
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

            // A Sub-SM exposes exactly the events forwarded by Nop states
            // inside the child machine. Do not invent generic success/failure
            // tokens: an empty child interface should remain visibly empty.
            const events = behaviorEvents.map((eventId) => ({ id: eventId }));

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

    const handleMoveContainerTransition = useCallback((edgeId, direction) => {
        if (
            !selectedNode ||
            (selectedNode.type !== "compound" && selectedNode.type !== "parallel") ||
            !edgeId
        ) {
            return;
        }

        const orderedIds = selectedContainerOutgoingTransitions
            .map((transition) => transition.edgeId)
            .filter(Boolean);
        const currentIndex = orderedIds.indexOf(edgeId);
        if (currentIndex < 0) return;

        const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
        const nextIndex = currentIndex + delta;
        if (delta === 0 || nextIndex < 0 || nextIndex >= orderedIds.length) return;

        const nextOrder = [...orderedIds];
        [nextOrder[currentIndex], nextOrder[nextIndex]] = [
            nextOrder[nextIndex],
            nextOrder[currentIndex],
        ];

        // Keep the explicit UI order on the container. The SCXML exporter uses
        // this exact order for the container-level <transition> elements, so a
        // specific event such as Talk.error can be placed before Talk.*.
        setNodes((currentNodes) =>
            currentNodes.map((node) =>
                node.id === selectedNode.id
                    ? {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            containerTransitionOrder: nextOrder,
                        },
                    }
                    : node
            )
        );

        // Reorder the matching semantic edges as well. This keeps the live
        // graph/boundary rebuild order aligned with the order shown in the
        // Exit Tokens panel instead of only changing export-time presentation.
        setEdges((currentEdges) => {
            const byId = new Map(currentEdges.map((edge) => [edge.id, edge]));
            const orderedEdges = nextOrder.map((id) => byId.get(id)).filter(Boolean);
            let orderedIndex = 0;
            const orderedSet = new Set(nextOrder);

            return currentEdges.map((edge) => {
                if (!orderedSet.has(edge.id)) return edge;
                const replacement = orderedEdges[orderedIndex];
                orderedIndex += 1;
                return replacement || edge;
            });
        });
    }, [
        selectedNode,
        selectedContainerOutgoingTransitions,
        setNodes,
        setEdges,
    ]);

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

            const liveNodes = getNodes();
            const liveNodeById = new Map(
                liveNodes.map((node) => [node.id, node])
            );

            const problemEdge = problem.edgeId
                ? edges.find((edge) => edge.id === problem.edgeId)
                : null;
            const transitionSourceId =
                problem.category === "Transitions" && problemEdge
                    ? problemEdge.data?.boundaryOriginalSource ||
                      problemEdge.data?.compoundOriginalSource ||
                      problemEdge.data?.parallelOriginalSource ||
                      problemEdge.source
                    : null;
            const selectedProblemNodeId =
                transitionSourceId && liveNodeById.has(transitionSourceId)
                    ? transitionSourceId
                    : problem.nodeId && liveNodeById.has(problem.nodeId)
                        ? problem.nodeId
                        : null;

            const requestedFocusIds = problem.focusNodeIds?.length
                ? [...problem.focusNodeIds]
                : selectedProblemNodeId
                    ? [selectedProblemNodeId]
                    : [];

            if (
                transitionSourceId &&
                liveNodeById.has(transitionSourceId) &&
                !requestedFocusIds.includes(transitionSourceId)
            ) {
                requestedFocusIds.unshift(transitionSourceId);
            }

            const focusIds = requestedFocusIds.filter((id) =>
                liveNodeById.has(id)
            );

            // Problems can point at nodes hidden inside one or more collapsed
            // Compound/Parallel states. Reveal the complete ancestor chain
            // before focusing; otherwise React Flow may fit the viewport to a
            // hidden child's stale/internal bounds and jump somewhere else.
            const containerAncestors = new Set();
            focusIds.forEach((focusId) => {
                let parentId = liveNodeById.get(focusId)?.parentId;
                const visited = new Set();

                while (parentId && !visited.has(parentId)) {
                    visited.add(parentId);
                    const parent = liveNodeById.get(parentId);
                    if (!parent) break;

                    if (
                        parent.type === "compound" ||
                        parent.type === "parallel"
                    ) {
                        containerAncestors.add(parent.id);
                    }

                    parentId = parent.parentId;
                }
            });

            // Expand outside-in so nested children become measurable in the
            // same order they become visible. Parallel lane wrapper nodes are
            // deliberately skipped; their Parallel parent is what collapses.
            const getAncestorDepth = (nodeId) => {
                let depth = 0;
                let parentId = liveNodeById.get(nodeId)?.parentId;
                const visited = new Set();

                while (parentId && !visited.has(parentId)) {
                    visited.add(parentId);
                    depth += 1;
                    parentId = liveNodeById.get(parentId)?.parentId;
                }

                return depth;
            };

            const containersToExpand = [...containerAncestors].sort(
                (leftId, rightId) =>
                    getAncestorDepth(leftId) - getAncestorDepth(rightId)
            );

            if (containersToExpand.length > 0) {
                const containerIds = new Set(containersToExpand);

                // Expand all collapsed ancestors explicitly in one state update.
                // Using the generic toggle handler here only revealed descendants
                // reliably; nested containers could keep their compact React Flow
                // dimensions and therefore never render as genuinely opened frames.
                // Restoring the saved expanded dimensions here makes the actual
                // Compound/Parallel node open before we navigate to its child.
                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        if (!containerIds.has(node.id)) return node;
                        if (
                            node.type !== "compound" &&
                            node.type !== "parallel"
                        ) {
                            return node;
                        }

                        const savedSize =
                            node.data?.expandedContainerSize || {};
                        const fallbackWidth =
                            node.type === "compound" ? 320 : 420;
                        const fallbackHeight =
                            node.type === "compound" ? 220 : 295;
                        const currentWidth =
                            Number(node.width) ||
                            Number(node.measured?.width) ||
                            Number(node.style?.width) ||
                            0;
                        const currentHeight =
                            Number(node.height) ||
                            Number(node.measured?.height) ||
                            Number(node.style?.height) ||
                            0;
                        const hasCompactFootprint =
                            currentWidth <= COLLAPSED_CONTAINER_WIDTH + 1 &&
                            currentHeight <= COLLAPSED_CONTAINER_HEIGHT + 1;
                        const needsPhysicalExpansion =
                            Boolean(node.data?.isCollapsed) ||
                            hasCompactFootprint;

                        if (!needsPhysicalExpansion) {
                            return node;
                        }

                        const restoredWidth = Math.max(
                            Number(savedSize.width) || 0,
                            fallbackWidth
                        );
                        const restoredHeight = Math.max(
                            Number(savedSize.height) || 0,
                            fallbackHeight
                        );
                        const restoredStyle = {
                            ...(node.style || {}),
                            width: restoredWidth,
                            height: restoredHeight,
                        };

                        if (savedSize.minHeight == null) {
                            delete restoredStyle.minHeight;
                        } else {
                            restoredStyle.minHeight = savedSize.minHeight;
                        }

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
                    })
                );

                // React Flow caches node measurements independently of our node
                // objects. Re-measure every opened ancestor after the state update
                // so the expanded Compound/Parallel frame is actually painted and
                // its nested children receive their correct absolute positions.
                requestAnimationFrame(() => {
                    containersToExpand.forEach((containerId) =>
                        updateNodeInternals(containerId)
                    );
                });
            }

            if (problem.category === "Transitions" && problem.edgeId) {
                // A transition problem should always reveal the transition it
                // refers to, even when the user previously hid transition edges.
                setShowTransitionEdges(true);
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

            if (selectedProblemNodeId) {
                // For transition problems select the semantic source skill as
                // well as the edge. Boundary-routed edges can visually start at
                // a container, but the actual problem belongs to the nested state.
                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: node.id === selectedProblemNodeId,
                    }))
                );
                setSelectedNodeId(selectedProblemNodeId);
                setActiveTab(problem.detailTab || "allgemein");
                setRightPanelTab("details");
            } else if (problem.category === "Datamodel") {
                setSelectedNodeId(null);
                setRightPanelTab("datamodel");
            }

            if (focusIds.length > 0) {
                const primaryFocusId =
                    selectedProblemNodeId ||
                    (focusIds.length === 1 ? focusIds[0] : null);

                // Give React Flow two frames to apply the expanded container
                // dimensions and remeasure nested nodes before navigating.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const currentNodes = getNodes();

                        if (primaryFocusId) {
                            const focusNode = currentNodes.find(
                                (node) => node.id === primaryFocusId
                            );

                            if (focusNode) {
                                const position = getAbsoluteNodePosition(
                                    focusNode,
                                    currentNodes
                                );
                                const width =
                                    Number(focusNode.measured?.width) ||
                                    Number(focusNode.width) ||
                                    Number(focusNode.style?.width) ||
                                    220;
                                const height =
                                    Number(focusNode.measured?.height) ||
                                    Number(focusNode.height) ||
                                    Number(focusNode.style?.height) ||
                                    90;

                                setCenter(
                                    position.x + width / 2,
                                    position.y + height / 2,
                                    { zoom: 1, duration: 300 }
                                );
                                return;
                            }
                        }

                        fitView({
                            nodes: focusIds.map((id) => ({ id })),
                            padding: 0.55,
                            maxZoom: 1.25,
                            duration: 300,
                        });
                    });
                });
            }
        },
        [
            edges,
            fitView,
            getNodes,
            setCenter,
            setEdges,
            setNodes,
            updateNodeInternals,
        ]
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


    const runtimeReplayContexts = useMemo(
        () =>
            buildRuntimeReplayContexts(tabs, activeTabId, {
                nodes,
                edges,
                slotNodes,
                slotEdges,
                globalDataModel,
            }),
        [
            tabs,
            activeTabId,
            nodes,
            edges,
            slotNodes,
            slotEdges,
            globalDataModel,
        ]
    );

    useEffect(() => {
        runtimeReplayContextsRef.current = runtimeReplayContexts;
    }, [runtimeReplayContexts]);

    // Runtime resolution is intentionally prepared once when the log is
    // loaded. Playback, timeline scrubbing and value rendering below read from
    // this cache rather than re-resolving the full trace on every render.
    const resolvedRuntimeSteps = runtimeReplayCache?.resolvedSteps || [];
    const runtimeSlotTimeline = runtimeReplayCache?.slotTimeline || {
        snapshots: [],
        samples: [],
        unresolvedCount: 0,
    };
    const runtimeParameterTimeline = runtimeReplayCache?.parameterTimeline || {
        snapshots: [],
        samples: [],
        unresolvedCount: 0,
    };
    const runtimeChangesTimeline = runtimeReplayCache?.changesTimeline || {
        steps: [],
        dataSamples: [],
    };

    const activeRuntimeSlotSnapshot =
        runtimeStarted && runtimeSlotTimeline.snapshots.length > 0
            ? runtimeSlotTimeline.snapshots[
                  Math.min(
                      runtimeStepIndex,
                      runtimeSlotTimeline.snapshots.length - 1
                  )
              ] || {}
            : {};

    const activeRuntimeSlotValues =
        activeRuntimeSlotSnapshot[activeTabId] || {};

    const activeRuntimeParameterSnapshot =
        runtimeStarted && runtimeParameterTimeline.snapshots.length > 0
            ? runtimeParameterTimeline.snapshots[
                  Math.min(
                      runtimeStepIndex,
                      runtimeParameterTimeline.snapshots.length - 1
                  )
              ] || {}
            : {};

    const activeRuntimeParameterValues =
        activeRuntimeParameterSnapshot[activeTabId] || {};

    const activeRuntimeChanges =
        runtimeStarted && runtimeChangesTimeline.steps.length > 0
            ? runtimeChangesTimeline.steps[
                  Math.min(
                      runtimeStepIndex,
                      runtimeChangesTimeline.steps.length - 1
                  )
              ] || null
            : null;

    const activeRuntimeStep =
        runtimeStarted && resolvedRuntimeSteps.length > 0
            ? resolvedRuntimeSteps[
                  Math.min(runtimeStepIndex, resolvedRuntimeSteps.length - 1)
              ]
            : null;

    const activeRuntimeSlotEdgeIds =
        runtimeStarted
            ? runtimeReplayCache?.slotEdgeIdsByStep?.[
                  Math.min(
                      runtimeStepIndex,
                      Math.max(0, (runtimeReplayCache?.slotEdgeIdsByStep?.length || 1) - 1)
                  )
              ]?.get(activeTabId) || EMPTY_RUNTIME_SET
            : EMPTY_RUNTIME_SET;

    const runtimeDisplayEdge = activeRuntimeStep?.edgeId
        ? runtimeReplayCache?.edgeByIdByTab
              ?.get(activeRuntimeStep.tabId || activeTabId)
              ?.get(activeRuntimeStep.edgeId) ||
          visibleEdges.find((edge) => edge.id === activeRuntimeStep.edgeId) ||
          null
        : null;

    const runtimeTraceEdgeIds =
        runtimeReplayCache?.traceEdgeIdsByTab?.get(activeTabId) || EMPTY_RUNTIME_SET;

    const runtimeTraceNodeIds =
        runtimeReplayCache?.traceNodeIdsByTab?.get(activeTabId) || EMPTY_RUNTIME_SET;

    // Before playback starts, frame the complete route once so loading a log
    // immediately presents the execution trace rather than the previous view.
    useEffect(() => {
        if (
            !runtimeLog ||
            runtimeStarted ||
            !runtimeTraceNeedsFit ||
            runtimeTraceNodeIds.size === 0
        ) {
            return undefined;
        }

        const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
        const traceNodes = Array.from(runtimeTraceNodeIds)
            .filter((id) => visibleNodeIds.has(id))
            .map((id) => ({ id }));

        if (traceNodes.length === 0) return undefined;

        const frame = window.requestAnimationFrame(() => {
            fitView({
                nodes: traceNodes,
                padding: 0.28,
                duration: 350,
                maxZoom: 1.05,
            });
            setRuntimeTraceNeedsFit(false);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [
        runtimeLog,
        runtimeStarted,
        runtimeTraceNeedsFit,
        runtimeTraceNodeIds,
        visibleNodes,
        fitView,
    ]);

    useEffect(() => {
        if (!activeRuntimeStep) return undefined;
        if (runtimeFocusHandledRef.current === runtimeFocusRequest) {
            return undefined;
        }

        // Follow runtime execution into a sub-state-machine only when that
        // sub-SM already has an open editor tab. Closed sub-SMs are resolved
        // to their visible wrapper node by runtimeLog.js and stay in-place.
        if (
            activeRuntimeStep.tabId &&
            activeRuntimeStep.tabId !== activeTabId
        ) {
            switchTab(activeRuntimeStep.tabId);
            return undefined;
        }

        const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
        const followNodeIds = [
            runtimeDisplayEdge?.source,
            runtimeDisplayEdge?.target,
            activeRuntimeStep.sourceNodeId,
            activeRuntimeStep.targetNodeId,
        ].filter((nodeId, index, allIds) =>
            Boolean(
                nodeId &&
                    visibleNodeIds.has(nodeId) &&
                    allIds.indexOf(nodeId) === index
            )
        );

        if (followNodeIds.length === 0) return undefined;

        runtimeFocusHandledRef.current = runtimeFocusRequest;
        const frame = window.requestAnimationFrame(() => {
            fitView({
                nodes: followNodeIds.map((id) => ({ id })),
                padding: 0.55,
                duration: 320,
                maxZoom: 1.15,
            });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [
        runtimeFocusRequest,
        activeRuntimeStep,
        runtimeDisplayEdge,
        activeTabId,
        switchTab,
        visibleNodes,
        fitView,
    ]);

    const appendRuntimeClass = useCallback((className, nextClass) => {
        const classes = String(className || "")
            .split(/\s+/)
            .filter(Boolean);
        if (!classes.includes(nextClass)) classes.push(nextClass);
        return classes.join(" ");
    }, []);

    const playbackVisibleNodes = useMemo(() => {
        if (!runtimeLog) return visibleNodes;

        const sourceIds = new Set(
            [
                activeRuntimeStep?.sourceNodeId,
                runtimeDisplayEdge?.source,
            ].filter(Boolean)
        );
        const targetIds = new Set(
            [
                activeRuntimeStep?.targetNodeId,
                runtimeDisplayEdge?.target,
            ].filter(Boolean)
        );

        return visibleNodes.map((node) => {
            const isSource = sourceIds.has(node.id);
            const isTarget = targetIds.has(node.id);
            const isInTrace = runtimeTraceNodeIds.has(node.id);
            const runtimeSlotValue =
                runtimeStarted && node.type === "slot"
                    ? activeRuntimeSlotValues[
                          normalizeSlotPath(getSlotPathFromNode(node))
                      ] || null
                    : null;
            const runtimeParameterValues = runtimeStarted
                ? activeRuntimeParameterValues[node.id] || null
                : null;
            const hasRuntimeSlotValue = Boolean(runtimeSlotValue);
            const shouldDim = runtimeStarted
                ? !isSource && !isTarget && !hasRuntimeSlotValue
                : !isInTrace;

            let className = node.className || "";
            if (runtimeStarted) {
                if (shouldDim) {
                    className = appendRuntimeClass(
                        className,
                        "runtime-log-dimmed-node"
                    );
                }
                if (isSource) {
                    className = appendRuntimeClass(
                        className,
                        "runtime-log-source-node"
                    );
                }
                if (isTarget) {
                    className = appendRuntimeClass(
                        className,
                        "runtime-log-target-node"
                    );
                }
            } else if (isInTrace) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-trace-node"
                );
            } else {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-dimmed-node"
                );
            }

            if (hasRuntimeSlotValue) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-slot-value-node"
                );
            }

            return {
                ...node,
                className,
                data: {
                    ...(node.data || {}),
                    ...(node.type === "slot"
                        ? {
                              runtimeSlotValue: runtimeSlotValue?.value,
                              runtimeSlotValueMeta: runtimeSlotValue,
                          }
                        : {}),
                    runtimeParameterValues,
                },
            };
        });
    }, [
        runtimeLog,
        runtimeStarted,
        activeRuntimeStep,
        runtimeDisplayEdge,
        runtimeTraceNodeIds,
        activeRuntimeSlotValues,
        activeRuntimeParameterValues,
        visibleNodes,
        appendRuntimeClass,
    ]);

    const playbackVisibleEdges = useMemo(() => {
        if (!runtimeLog) return visibleEdges;

        return visibleEdges.map((edge) => {
            const isActiveTransition =
                runtimeStarted &&
                Boolean(activeRuntimeStep?.edgeId) &&
                edge.id === activeRuntimeStep.edgeId;
            const isActiveSlot =
                runtimeStarted && activeRuntimeSlotEdgeIds.has(edge.id);
            const isInTrace = runtimeTraceEdgeIds.has(edge.id);
            const shouldDim = runtimeStarted
                ? !isActiveTransition && !isActiveSlot
                : !isInTrace;

            let className = edge.className || "";
            if (isActiveTransition) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-active-edge"
                );
            } else if (isActiveSlot) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-active-slot-edge"
                );
            } else if (!runtimeStarted && isInTrace) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-trace-edge"
                );
            } else if (shouldDim) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-dimmed-edge"
                );
            }

            if (isActiveTransition) {
                return {
                    ...edge,
                    animated: true,
                    className,
                    style: {
                        ...(edge.style || {}),
                        stroke: "#facc15",
                        strokeWidth: 4,
                    },
                    markerEnd: edge.markerEnd
                        ? { ...edge.markerEnd, color: "#facc15" }
                        : edge.markerEnd,
                };
            }

            if (isActiveSlot) {
                return {
                    ...edge,
                    animated: false,
                    className,
                    style: {
                        ...(edge.style || {}),
                        strokeWidth: 4,
                    },
                };
            }

            return { ...edge, className };
        });
    }, [
        runtimeLog,
        runtimeStarted,
        activeRuntimeStep,
        activeRuntimeSlotEdgeIds,
        runtimeTraceEdgeIds,
        visibleEdges,
        appendRuntimeClass,
    ]);

    const runtimePlayback = useMemo(() => {
        const stepCount = resolvedRuntimeSteps.length;
        const unresolvedCount = resolvedRuntimeSteps.reduce(
            (count, step) => count + (step.resolved ? 0 : 1),
            0
        );

        return {
            loaded: Boolean(runtimeLog),
            fileName: runtimeLog?.fileName || "",
            stepCount,
            stepIndex: stepCount > 0 ? Math.min(runtimeStepIndex, stepCount - 1) : 0,
            currentStep: activeRuntimeStep,
            unresolvedCount,
            started: runtimeStarted,
            isPlaying: runtimePlaying,
            delay: runtimePlaybackDelay,
            slotSampleCount: runtimeLog?.slotSamples?.length || 0,
            unresolvedSlotSampleCount: runtimeSlotTimeline.unresolvedCount || 0,
            parameterSampleCount: runtimeLog?.parameterSamples?.length || 0,
            unresolvedParameterSampleCount:
                runtimeParameterTimeline.unresolvedCount || 0,
            steps: resolvedRuntimeSteps,
        };
    }, [
        runtimeLog,
        resolvedRuntimeSteps,
        runtimeStepIndex,
        activeRuntimeStep,
        runtimeStarted,
        runtimePlaying,
        runtimePlaybackDelay,
        runtimeSlotTimeline.unresolvedCount,
        runtimeParameterTimeline.unresolvedCount,
    ]);

    const restartRuntimePlayback = useCallback(() => {
        if (resolvedRuntimeSteps.length === 0) return;
        setRuntimeStepIndex(0);
        setRuntimeStarted(true);
        setRuntimePlaying(true);
        setRuntimeFocusRequest((value) => value + 1);
    }, [resolvedRuntimeSteps.length]);

    const toggleRuntimePlayback = useCallback(() => {
        const stepCount = resolvedRuntimeSteps.length;
        if (stepCount === 0) return;

        if (runtimePlaying) {
            setRuntimePlaying(false);
            return;
        }

        if (!runtimeStarted) {
            setRuntimeStepIndex(0);
            setRuntimeStarted(true);
        } else if (runtimeStepIndex >= stepCount - 1) {
            setRuntimeStepIndex(0);
        }

        // Resuming playback intentionally re-focuses the current transition.
        // While paused there are no viewport updates, so the user can freely
        // pan/zoom around the graph until playback or navigation resumes.
        setRuntimeFocusRequest((value) => value + 1);
        setRuntimePlaying(true);
    }, [
        resolvedRuntimeSteps.length,
        runtimeStarted,
        runtimePlaying,
        runtimeStepIndex,
    ]);

    const seekRuntimePlayback = useCallback(
        (nextIndex) => {
            const stepCount = resolvedRuntimeSteps.length;
            if (stepCount === 0) return;
            const clampedIndex = Math.max(
                0,
                Math.min(Number(nextIndex) || 0, stepCount - 1)
            );
            setRuntimePlaying(false);
            setRuntimeStarted(true);
            setRuntimeStepIndex(clampedIndex);
            setRuntimeFocusRequest((value) => value + 1);
        },
        [resolvedRuntimeSteps.length]
    );

    const stepRuntimePlayback = useCallback(
        (direction) => {
            const stepCount = resolvedRuntimeSteps.length;
            if (stepCount === 0) return;
            const currentIndex = runtimeStarted ? runtimeStepIndex : 0;
            seekRuntimePlayback(currentIndex + direction);
        },
        [
            resolvedRuntimeSteps.length,
            runtimeStarted,
            runtimeStepIndex,
            seekRuntimePlayback,
        ]
    );

    const createNameforSkill = (fullSkillName) => {
        const label = fullSkillName.split(".").pop();
        const count = nodes.filter(
            (n) => !isEditorCloneNode(n) && n.data?.label === label
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
                const removedSlotCloneIds = new Map();
                slotChanges
                    .filter((change) => change.type === "remove")
                    .forEach((change) => {
                        const removedNode = slotNodes.find(
                            (node) => node.id === change.id
                        );
                        if (
                            removedNode?.data?.isSlotClone &&
                            removedNode.data?.cloneOfNodeId
                        ) {
                            removedSlotCloneIds.set(
                                removedNode.id,
                                removedNode.data.cloneOfNodeId
                            );
                        }
                    });

                if (removedSlotCloneIds.size > 0) {
                    setSlotEdges((currentEdges) =>
                        currentEdges.map((edge) => {
                            const canonicalSlotNodeId =
                                removedSlotCloneIds.get(edge.target);
                            if (!canonicalSlotNodeId) return edge;

                            remappedSlotCloneEdgeIdsRef.current.add(edge.id);

                            return {
                                ...edge,
                                id: `${edge.id}-clone-remap-${crypto.randomUUID()}`,
                                target: canonicalSlotNodeId,
                                data: {
                                    ...(edge.data || {}),
                                    slotNodeId: canonicalSlotNodeId,
                                    canonicalSlotNodeId,
                                    controlPoints: [],
                                },
                            };
                        })
                    );
                }

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
            slotNodes,
            setSlotEdges,
        ]
    );

    const handleVisibleEdgesChange = useCallback(
        (changes) => {
            const ignoredRemapIds = remappedSlotCloneEdgeIdsRef.current;
            const effectiveChanges = changes.filter((change) => {
                const shouldIgnore =
                    change.type === "remove" && ignoredRemapIds.has(change.id);
                if (shouldIgnore) {
                    ignoredRemapIds.delete(change.id);
                }
                return !shouldIgnore;
            });

            const slotEdgeIds = new Set(
                (slotEdges || []).map((edge) => edge.id)
            );

            const slotChanges = effectiveChanges.filter((change) =>
                slotEdgeIds.has(change.id)
            );
            const transitionChanges = effectiveChanges.filter(
                (change) => !slotEdgeIds.has(change.id)
            );

            if (transitionChanges.length > 0) {
                const removesTransition = transitionChanges.some(
                    (change) => change.type === "remove"
                );

                if (removesTransition) {
                    // Removing the visible external part of a boundary
                    // transition must also remove its editor-only helper edge
                    // and Compound/Parallel border event. Otherwise stale
                    // exits such as Skill.* remain visible even though no
                    // semantic transition exists anymore.
                    const changedEdges = applyEdgeChanges(
                        transitionChanges,
                        edges
                    );

                    const getLogicalSourceEntries = (edge) => {
                        const storedEntries = Array.isArray(
                            edge?.data?.boundaryOriginalSources
                        )
                            ? edge.data.boundaryOriginalSources
                                  .map((entry) => ({
                                      sourceId: String(entry?.sourceId || ""),
                                      sourceHandle: String(
                                          entry?.sourceHandle || ""
                                      ),
                                  }))
                                  .filter(
                                      (entry) =>
                                          entry.sourceId && entry.sourceHandle
                                  )
                            : [];
                        if (storedEntries.length > 0) return storedEntries;

                        return [
                            {
                                sourceId:
                                    edge?.data?.boundaryOriginalSource ||
                                    edge?.data?.compoundOriginalSource ||
                                    edge?.data?.parallelOriginalSource ||
                                    edge?.source ||
                                    "",
                                sourceHandle: String(
                                    edge?.data?.boundaryOriginalSourceHandle ||
                                    edge?.data?.compoundOriginalSourceHandle ||
                                    edge?.data?.parallelOriginalSourceHandle ||
                                    edge?.sourceHandle ||
                                    edge?.label ||
                                    "success"
                                ),
                            },
                        ];
                    };

                    const isSemanticTransitionEdge = (edge) =>
                        !edge?.data?.boundaryInternalEdge &&
                        !edge?.data?.compoundInternalEdge &&
                        !edge?.data?.parallelInternalEdge &&
                        !String(edge?.id || "").startsWith(
                            "edge-internal-boundary-"
                        );

                    const removedTransientEventsByNode = new Map();
                    transitionChanges
                        .filter((change) => change.type === "remove")
                        .forEach((change) => {
                            const removedEdge = edges.find(
                                (edge) => edge.id === change.id
                            );
                            if (!removedEdge) return;

                            getLogicalSourceEntries(removedEdge).forEach(
                                ({ sourceId, sourceHandle }) => {
                                    if (!sourceId || !sourceHandle) return;

                                    const sourceNode = nodes.find(
                                        (node) => node.id === sourceId
                                    );
                                    const matchingEvents = (
                                        sourceNode?.data?.events || []
                                    ).filter(
                                        (event) =>
                                            String(event?.id || "") ===
                                            sourceHandle
                                    );
                                    const isImportedOnlyHandle =
                                        matchingEvents.length > 0 &&
                                        matchingEvents.every(
                                            (event) =>
                                                event?.editorImportedSynthetic ||
                                                event?.editorBoundarySynthetic
                                        );

                                    if (sourceHandle === "*") return;

                                    if (
                                        !isWildcardTransitionEvent(sourceHandle) &&
                                        !isImportedOnlyHandle
                                    ) {
                                        return;
                                    }

                                    const stillUsed = changedEdges.some(
                                        (edge) =>
                                            isSemanticTransitionEdge(edge) &&
                                            getLogicalSourceEntries(edge).some(
                                                (entry) =>
                                                    entry.sourceId === sourceId &&
                                                    entry.sourceHandle ===
                                                        sourceHandle
                                            )
                                    );
                                    if (stillUsed) return;

                                    if (
                                        !removedTransientEventsByNode.has(
                                            sourceId
                                        )
                                    ) {
                                        removedTransientEventsByNode.set(
                                            sourceId,
                                            new Set()
                                        );
                                    }
                                    removedTransientEventsByNode
                                        .get(sourceId)
                                        .add(sourceHandle);
                                }
                            );
                        });

                    const cleanedNodes =
                        removedTransientEventsByNode.size === 0
                            ? nodes
                            : nodes.map((node) => {
                                const removedHandles =
                                    removedTransientEventsByNode.get(node.id);
                                if (!removedHandles) return node;
                                return {
                                    ...node,
                                    data: {
                                        ...node.data,
                                        events: (node.data?.events || []).filter(
                                            (event) =>
                                                !removedHandles.has(
                                                    String(event?.id || "")
                                                )
                                        ),
                                    },
                                };
                            });

                    const normalized = rebuildBoundaryTransitionsIncremental(
                        cleanedNodes,
                        changedEdges,
                        {
                            previousEdges: edges,
                            changedEdgeIds: transitionChanges
                                .filter((change) => change.type === "remove")
                                .map((change) => change.id),
                        }
                    );

                    setNodes(normalized.nodes);
                    setEdges(normalized.edges);
                    (normalized.affectedNodeIds || []).forEach((nodeId) => {
                        requestAnimationFrame(() =>
                            updateNodeInternals(nodeId)
                        );
                    });
                } else {
                    onEdgesChange(transitionChanges);
                }
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
            edges,
            nodes,
            onEdgesChange,
            onSlotEdgesChange,
            setNodes,
            setEdges,
            updateNodeInternals,
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

        const oldCanonicalSlotNodeId = `slot-${oldPath}`;
        const newCanonicalSlotNodeId = `slot-${newPath}`;
        const updatedSlotNodes = slotNodes.map((slotNode) => {
            const isCanonical = slotNode.id === oldCanonicalSlotNodeId;
            const isClone =
                slotNode.data?.isSlotClone &&
                slotNode.data?.cloneOfNodeId === oldCanonicalSlotNodeId;

            if (!isCanonical && !isClone) return slotNode;

            return {
                ...slotNode,
                ...(isCanonical ? { id: newCanonicalSlotNodeId } : {}),
                data: {
                    ...(slotNode.data || {}),
                    path: formattedPath,
                    label: formattedPath,
                    ...(isClone
                        ? { cloneOfNodeId: newCanonicalSlotNodeId }
                        : {}),
                },
            };
        });

        setNodes(updatedNodes);
        setManualSlots(updatedManualSlots);
        setSelectedNodeId(
            selectedRawNode.data?.isSlotClone
                ? selectedRawNode.id
                : newCanonicalSlotNodeId
        );
        checkSlotConnection(
            updatedNodes,
            updatedManualSlots,
            updatedSlotNodes
        );
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
            // Merge React Flow's selection callback with the controlled node
            // flags. This makes a just-clicked slot copyable even if the
            // selection callback has not propagated yet.
            const selectedIds = new Set(graphSelectionRef.current);
            nodes.forEach((node) => {
                if (node.selected) selectedIds.add(node.id);
            });
            slotNodes.forEach((node) => {
                if (node.selected) selectedIds.add(node.id);
            });

            let nodesToCopy = nodes.filter(
                (node) =>
                    selectedIds.has(node.id) &&
                    node.type !== "parallelLane"
            );
            let slotNodesToCopy = slotNodes.filter((node) =>
                selectedIds.has(node.id)
            );

            // A normal click also records the focused node in selectedNodeId.
            // Use it as the final fallback so slot copying does not depend on
            // React Flow's selection-event ordering.
            if (
                selectedNodeId &&
                nodesToCopy.length + slotNodesToCopy.length <= 1
            ) {
                const focusedNode =
                    nodes.find(
                        (node) =>
                            node.id === selectedNodeId &&
                            node.type !== "parallelLane"
                    ) ||
                    slotNodes.find((node) => node.id === selectedNodeId);
                const focusedNodeIsSelected =
                    nodesToCopy.some((node) => node.id === selectedNodeId) ||
                    slotNodesToCopy.some(
                        (node) => node.id === selectedNodeId
                    );

                if (focusedNode && !focusedNodeIsSelected) {
                    if (focusedNode.type === "slot") {
                        nodesToCopy = [];
                        slotNodesToCopy = [focusedNode];
                    } else {
                        nodesToCopy = [focusedNode];
                        slotNodesToCopy = [];
                    }
                }
            }

            if (nodesToCopy.length === 0 && slotNodesToCopy.length === 0) {
                return false;
            }

            // Remember which single node the user explicitly copied before
            // recursively adding container descendants. This lets a copied
            // compound/parallel still be pasted as one editor reference even
            // though its clipboard payload contains the complete subtree.
            const explicitReferenceSourceNodeId =
                nodesToCopy.length === 1 && slotNodesToCopy.length === 0
                    ? nodesToCopy[0].id
                    : null;

            // Copying a container must copy its complete subtree, including
            // structural parallel lanes. Those lanes are not directly
            // selectable, but they are required to preserve the hierarchy
            // and relative positions of the states inside a parallel node.
            const copiedNodeIds = new Set(
                nodesToCopy.map((node) => node.id)
            );
            const childrenByParent = new Map();
            nodes.forEach((node) => {
                if (!node.parentId) return;
                if (!childrenByParent.has(node.parentId)) {
                    childrenByParent.set(node.parentId, []);
                }
                childrenByParent.get(node.parentId).push(node);
            });

            const descendantQueue = nodesToCopy
                .filter(
                    (node) =>
                        node.type === "compound" ||
                        node.type === "parallel" ||
                        node.type === "parallelLane"
                )
                .map((node) => node.id);

            while (descendantQueue.length > 0) {
                const parentId = descendantQueue.shift();
                (childrenByParent.get(parentId) || []).forEach((child) => {
                    if (copiedNodeIds.has(child.id)) return;
                    copiedNodeIds.add(child.id);
                    descendantQueue.push(child.id);
                });
            }

            // Re-read from the canonical node array to keep React Flow's
            // parent-before-child ordering and to include non-selectable
            // parallel lane nodes in the clipboard.
            nodesToCopy = nodes.filter((node) =>
                copiedNodeIds.has(node.id)
            );

            const copiedEdges = edges.filter(
                (edge) =>
                    copiedNodeIds.has(edge.source) &&
                    copiedNodeIds.has(edge.target)
            );

            const clipboard = {
                explicitReferenceSourceNodeId,
                nodes: nodesToCopy.map((node) =>
                    cloneClipboardValue({
                        ...node,
                        selected: false,
                    })
                ),
                slotNodes: slotNodesToCopy.map((node) => {
                    const canonicalSlotNodeId =
                        node.data?.cloneOfNodeId || node.id;
                    const canonicalSlotNode =
                        slotNodes.find(
                            (candidate) =>
                                candidate.id === canonicalSlotNodeId &&
                                !candidate.data?.isSlotClone
                        ) || node;

                    return cloneClipboardValue({
                        ...node,
                        selected: false,
                        data: {
                            ...(node.data || {}),
                            clipboardCanonicalSlotNodeId:
                                canonicalSlotNode.id ||
                                canonicalSlotNodeId,
                            clipboardCanonicalSlotPath:
                                canonicalSlotNode.data?.path ||
                                node.data?.path ||
                                "",
                        },
                    });
                }),
                edges: copiedEdges.map((edge) =>
                    cloneClipboardValue({
                        ...edge,
                        selected: false,
                    })
                ),
            };

            graphClipboardRef.current = clipboard;
            persistentGraphClipboard = clipboard;
            setHasGraphClipboard(true);
            return true;
        };

        const resolvePasteTargetPosition = (explicitFlowPosition = null) => {
            if (
                Number.isFinite(explicitFlowPosition?.x) &&
                Number.isFinite(explicitFlowPosition?.y)
            ) {
                return explicitFlowPosition;
            }

            const pointer = editorPointerPositionRef.current;
            if (
                pointer?.inside &&
                Number.isFinite(pointer.clientX) &&
                Number.isFinite(pointer.clientY)
            ) {
                return screenToFlowPosition({
                    x: pointer.clientX,
                    y: pointer.clientY,
                });
            }

            const editorRect = flowContainerRef.current?.getBoundingClientRect();
            if (editorRect?.width > 0 && editorRect?.height > 0) {
                return screenToFlowPosition({
                    x: editorRect.left + editorRect.width / 2,
                    y: editorRect.top + editorRect.height / 2,
                });
            }

            return screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
            });
        };

        const getClipboardPasteTranslation = (clipboard, targetPosition) => {
            const copiedNodes = clipboard?.nodes || [];
            const copiedNodeIds = new Set(copiedNodes.map((node) => node.id));
            const rootNodes = copiedNodes.filter(
                (node) => !node.parentId || !copiedNodeIds.has(node.parentId)
            );
            const layoutNodes = [
                ...rootNodes,
                ...(clipboard?.slotNodes || []),
            ];

            if (layoutNodes.length === 0) {
                return { x: 0, y: 0 };
            }

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            layoutNodes.forEach((node) => {
                const x = Number(node.position?.x || 0);
                const y = Number(node.position?.y || 0);
                const { width, height } = getNodeSize(node);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + width);
                maxY = Math.max(maxY, y + height);
            });

            const centerX = minX + (maxX - minX) / 2;
            const centerY = minY + (maxY - minY) / 2;

            return {
                x: Number(targetPosition?.x || 0) - centerX,
                y: Number(targetPosition?.y || 0) - centerY,
            };
        };

        const buildPastedSlotAliases = (copiedSlotNodes, translation) =>
            (copiedSlotNodes || [])
                .map((copiedSlotNode) => {
                    const copiedCanonicalId =
                        copiedSlotNode.data?.clipboardCanonicalSlotNodeId ||
                        copiedSlotNode.data?.cloneOfNodeId ||
                        copiedSlotNode.id;
                    const copiedPath = normalizeSlotPath(
                        copiedSlotNode.data?.clipboardCanonicalSlotPath ||
                            copiedSlotNode.data?.path ||
                            ""
                    );

                    // Resolve by canonical id first, then by semantic path.
                    // Pasting therefore no longer depends on whichever visual
                    // slot happens to be selected after Ctrl+C.
                    const canonicalSlotNode =
                        slotNodes.find(
                            (node) =>
                                !node.data?.isSlotClone &&
                                node.id === copiedCanonicalId
                        ) ||
                        slotNodes.find(
                            (node) =>
                                !node.data?.isSlotClone &&
                                copiedPath &&
                                normalizeSlotPath(
                                    node.data?.path || ""
                                ) === copiedPath
                        );

                    if (!canonicalSlotNode) return null;

                    return {
                        id: `slot-clone-${crypto.randomUUID()}`,
                        position: {
                            x:
                                Number(
                                    copiedSlotNode.position?.x || 0
                                ) + Number(translation?.x || 0),
                            y:
                                Number(
                                    copiedSlotNode.position?.y || 0
                                ) + Number(translation?.y || 0),
                        },
                        type: "slot",
                        selected: true,
                        data: {
                            ...(canonicalSlotNode.data || {}),
                            cloneOfNodeId: canonicalSlotNode.id,
                            editorInstanceId: createReferenceId(),
                            isSlotClone: true,
                        },
                    };
                })
                .filter(Boolean);

        const pasteClipboard = (pasteMode = "copy", targetPosition = null) => {
            const clipboard =
                graphClipboardRef.current || persistentGraphClipboard;
            if (clipboard && graphClipboardRef.current !== clipboard) {
                graphClipboardRef.current = clipboard;
            }
            const copiedStateNodes = clipboard?.nodes || [];
            const copiedSlotNodes = clipboard?.slotNodes || [];
            const copiedNodeCount =
                copiedStateNodes.length + copiedSlotNodes.length;

            if (copiedNodeCount === 0) return false;

            const resolvedPasteTarget = resolvePasteTargetPosition(targetPosition);
            const pasteTranslation = getClipboardPasteTranslation(
                clipboard,
                resolvedPasteTarget
            );

            if (pasteMode === "clone") {
                const explicitSourceId =
                    clipboard?.explicitReferenceSourceNodeId || null;
                const copiedNode = explicitSourceId
                    ? copiedStateNodes.find((node) => node.id === explicitSourceId) || null
                    : copiedNodeCount === 1
                        ? copiedStateNodes[0] || copiedSlotNodes[0] || null
                        : null;

                if (!copiedNode) return false;

                if (copiedNode?.type === "slot") {
                    const pastedSlotAliases = buildPastedSlotAliases(
                        [copiedNode],
                        pasteTranslation
                    );
                    const cloneNode = pastedSlotAliases[0];
                    if (!cloneNode) return false;

                    const nextSlotNodes = [
                        ...slotNodes.map((node) => ({
                            ...node,
                            selected: false,
                        })),
                        cloneNode,
                    ];

                    setNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: false,
                        }))
                    );
                    setSlotNodes(nextSlotNodes);
                    setEdges((currentEdges) =>
                        currentEdges.map((edge) => ({
                            ...edge,
                            selected: false,
                        }))
                    );
                    setSlotEdges((currentEdges) =>
                        currentEdges.map((edge) => ({
                            ...edge,
                            selected: false,
                        }))
                    );
                    setSelectedNodeId(cloneNode.id);
                    setRightPanelTab("details");
                    setActiveTab("slots");

                    requestAnimationFrame(() => {
                        updateNodeInternals(cloneNode.id);
                    });

                    return true;
                }

                const sourceNode = copiedNode
                    ? nodes.find((node) => node.id === copiedNode.id)
                    : null;

                if (!isCloneableEditorNode(sourceNode)) return false;

                // References have their own compact visual size. Do not use
                // the source container dimensions here: a large compound or
                // parallel would otherwise place its small reference far away
                // from the requested paste position.
                const referenceSize = { width: 180, height: 58 };
                const cloneNode = buildEditorCloneNode(sourceNode, {
                    x:
                        Number(resolvedPasteTarget.x || 0) -
                        referenceSize.width / 2,
                    y:
                        Number(resolvedPasteTarget.y || 0) -
                        referenceSize.height / 2,
                });
                if (!cloneNode) return false;

                setSlotNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
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

            // Slot declarations are unique semantic SCXML objects. Copy/paste
            // therefore creates visual aliases for selected slots instead of a
            // second declaration with the same path.
            if (copiedStateNodes.length === 0 && copiedSlotNodes.length > 0) {
                const pastedSlotAliases = buildPastedSlotAliases(
                    copiedSlotNodes,
                    pasteTranslation
                );
                if (pastedSlotAliases.length === 0) return false;

                const nextSlotNodes = [
                    ...slotNodes.map((node) => ({
                        ...node,
                        selected: false,
                    })),
                    ...pastedSlotAliases,
                ];

                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
                setSlotNodes(nextSlotNodes);
                setEdges((currentEdges) =>
                    currentEdges.map((edge) => ({
                        ...edge,
                        selected: false,
                    }))
                );
                setSlotEdges((currentEdges) =>
                    currentEdges.map((edge) => ({
                        ...edge,
                        selected: false,
                    }))
                );

                const firstPastedSlot = pastedSlotAliases[0];
                setSelectedNodeId(firstPastedSlot.id);
                setRightPanelTab("details");
                setActiveTab("slots");

                requestAnimationFrame(() => {
                    pastedSlotAliases.forEach((node) =>
                        updateNodeInternals(node.id)
                    );
                });

                return true;
            }

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

                if (Array.isArray(eventCopy.sourceNodeIds)) {
                    eventCopy.sourceNodeIds = eventCopy.sourceNodeIds.map(
                        (sourceNodeId) =>
                            idMap.has(sourceNodeId)
                                ? idMap.get(sourceNodeId)
                                : sourceNodeId
                    );
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
                    (data?.isSkillClone || data?.isStateClone) &&
                    data?.cloneOfNodeId &&
                    idMap.has(data.cloneOfNodeId)
                ) {
                    data.cloneOfNodeId = idMap.get(data.cloneOfNodeId);
                }

                if (data?.isSkillClone || data?.isStateClone) {
                    // Each visual Reference needs its own stable route identity
                    // so transition targeting can distinguish multiple aliases
                    // of the same underlying SCXML state.
                    data.editorInstanceId = createReferenceId();
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
                        x:
                            Number(node.position?.x || 0) +
                            (node.parentId && idMap.has(node.parentId)
                                ? 0
                                : pasteTranslation.x),
                        y:
                            Number(node.position?.y || 0) +
                            (node.parentId && idMap.has(node.parentId)
                                ? 0
                                : pasteTranslation.y),
                    },
                    // Descendants come along because their container was
                    // copied; keep only clipboard roots selected. Selecting
                    // both a parent and all of its children can make a drag
                    // apply the movement twice to nested React Flow nodes.
                    selected: !(
                        node.parentId && idMap.has(node.parentId)
                    ),
                    data,
                };
            });

            const remapEdgeDataIds = (edgeData) => {
                const nextData = cloneGraphValue(edgeData || {});

                [
                    "boundaryOriginalSource",
                    "boundaryOriginalTarget",
                    "parallelOriginalSource",
                    "parallelOriginalTarget",
                    "compoundOriginalSource",
                    "compoundOriginalTarget",
                ].forEach((keyName) => {
                    if (nextData[keyName] && idMap.has(nextData[keyName])) {
                        nextData[keyName] = idMap.get(nextData[keyName]);
                    }
                });

                if (Array.isArray(nextData.boundaryOriginalSources)) {
                    nextData.boundaryOriginalSources =
                        nextData.boundaryOriginalSources.map((source) => ({
                            ...source,
                            sourceId:
                                source?.sourceId && idMap.has(source.sourceId)
                                    ? idMap.get(source.sourceId)
                                    : source?.sourceId,
                        }));
                }

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
            const pastedSlotAliases = buildPastedSlotAliases(
                copiedSlotNodes,
                pasteTranslation
            );
            const nextSlotNodes = [
                ...slotNodes.map((node) => ({
                    ...node,
                    selected: false,
                })),
                ...pastedSlotAliases,
            ];

            setNodes(nextNodes);
            setSlotNodes(nextSlotNodes);
            setEdges([
                ...edges.map((edge) => ({
                    ...edge,
                    selected: false,
                })),
                ...pastedEdges,
            ]);

            const firstPastedNode = pastedNodes.find(
                (node) => !node.parentId
            ) || pastedNodes[0] || pastedSlotAliases[0];

            setSelectedNodeId(firstPastedNode?.id || null);

            // Slot paths live on the skill nodes. Rebuild the slot-view edges
            // so copied skills immediately retain their slot connections too,
            // while preserving any visual slot aliases pasted with the group.
            requestAnimationFrame(() => {
                checkSlotConnection(nextNodes, null, nextSlotNodes);

                pastedIds.forEach((nodeId) => {
                    updateNodeInternals(nodeId);
                });
                pastedSlotAliases.forEach((node) => {
                    updateNodeInternals(node.id);
                });
            });

            return true;
        };

        const requestPasteClipboard = (targetPosition = null) => {
            if (pendingSkillPasteActionRef.current) return true;

            const clipboard =
                graphClipboardRef.current || persistentGraphClipboard;
            if (clipboard && graphClipboardRef.current !== clipboard) {
                graphClipboardRef.current = clipboard;
            }
            const copiedStateNodes = clipboard?.nodes || [];
            const copiedSlotNodes = clipboard?.slotNodes || [];
            const copiedNodeCount =
                copiedStateNodes.length + copiedSlotNodes.length;
            if (copiedNodeCount === 0) return false;

            // Slots have one semantic declaration per path, so normal
            // copy/paste directly creates another visual alias.
            if (copiedNodeCount === 1 && copiedSlotNodes.length === 1) {
                return pasteClipboard("copy", targetPosition);
            }

            const explicitSourceId =
                clipboard?.explicitReferenceSourceNodeId || null;
            const copiedNode = explicitSourceId
                ? copiedStateNodes.find((node) => node.id === explicitSourceId) || null
                : copiedNodeCount === 1
                    ? copiedStateNodes[0] || null
                    : null;
            const sourceNode = copiedNode
                ? nodes.find((node) => node.id === copiedNode.id)
                : null;

            if (isCloneableEditorNode(sourceNode)) {
                // Keep the pending action itself outside React state. This
                // avoids copying callback-heavy node data into a dialog state
                // while still letting the user decide how this paste behaves.
                pendingSkillPasteActionRef.current = {
                    clone: () => pasteClipboard("clone", targetPosition),
                    copy: () => pasteClipboard("copy", targetPosition),
                };
                const sourceTypeLabel =
                    sourceNode.type === "compound"
                        ? "Compound"
                        : sourceNode.type === "parallel"
                            ? "Parallel"
                            : sourceNode.type === "submachine"
                                ? "Sub-State-Machine"
                                : "State";

                setPendingSkillPaste({
                    label: sourceNode.data?.label || sourceTypeLabel,
                    fullSkillName:
                        sourceNode.data?.fullSkillName ||
                        sourceNode.data?.label ||
                        sourceTypeLabel,
                    sourceTypeLabel,
                });
                return true;
            }

            return pasteClipboard("copy", targetPosition);
        };

        captureGraphSelectionRef.current = captureSelection;
        requestGraphPasteRef.current = requestPasteClipboard;

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
                if (graphClipboardRef.current || persistentGraphClipboard) {
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
        return () => {
            if (captureGraphSelectionRef.current === captureSelection) {
                captureGraphSelectionRef.current = null;
            }
            if (requestGraphPasteRef.current === requestPasteClipboard) {
                requestGraphPasteRef.current = null;
            }
            window.removeEventListener(
                "keydown",
                handleGraphClipboardShortcut,
                true
            );
        };
    }, [
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
    // endpoint can expose a different set of events, sensors/actuators, parameters
    // and slot requests depending on the current parameter values.
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
                        requestedParam?.description ??
                        existingParam?.description ??
                        "",
                    // Parameter requests can depend on other parameter values.
                    // Keep the value the user already entered when a parameter
                    // is still requested, while newly requested parameters start
                    // empty and parameters no longer requested disappear.
                    expr: existingParam?.expr ?? "",
                };
            }
        );

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
        slotNodes,
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
                        onDragOver={(e) => {
                            e.preventDefault();

                            const skill = e.dataTransfer.getData("skill");
                            const behavior = e.dataTransfer.getData("behavior");
                            if (!skill && !behavior) return;

                            const pointerPosition = screenToFlowPosition({
                                x: e.clientX,
                                y: e.clientY,
                            });

                            const hoveredContainer = findDropContainerAtPoint(
                                pointerPosition,
                                nodes
                            );
                            const hoveredCompound =
                                hoveredContainer?.type === "compound"
                                    ? hoveredContainer
                                    : null;
                            const hoveredLane =
                                hoveredContainer?.type === "parallelLane"
                                    ? hoveredContainer
                                    : null;

                            setCompoundDropTargetId(hoveredCompound?.id || null);
                            setParallelDropTargetId(hoveredLane?.id || null);
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

                            const targetContainer = findDropContainerAtPoint(
                                mousePosition,
                                nodes
                            );
                            const targetCompound =
                                targetContainer?.type === "compound"
                                    ? targetContainer
                                    : null;
                            const targetLane =
                                targetContainer?.type === "parallelLane"
                                    ? targetContainer
                                    : null;
                            const targetLaneCompound = targetLane
                                ? nodes.find(
                                    (candidate) =>
                                        candidate.parentId === targetLane.id &&
                                        isAutoParallelLaneCompound(candidate)
                                ) || null
                                : null;
                            const insertionCompound =
                                targetCompound || targetLaneCompound;

                            const behaviorPayload =
                                e.dataTransfer.getData("behavior");
                            const skill = e.dataTransfer.getData("skill");
                            const isBehaviorDrop = Boolean(behaviorPayload);

                            let newNode;

                            if (behaviorPayload) {
                                try {
                                    const behavior = JSON.parse(behaviorPayload);
                                    newNode = await createBehaviorNode(
                                        behavior,
                                        { x: 0, y: 0 }
                                    );
                                } catch (error) {
                                    console.error(
                                        "Invalid behavior drag payload:",
                                        error
                                    );
                                    return;
                                }
                            } else {
                                if (!skill) return;
                                newNode = await createNode(
                                    skill.split("skills.")[1],
                                    getNodeId(),
                                    { x: 0, y: 0 }
                                );
                            }

                            const refreshBehaviorSlots = () => {
                                if (!isBehaviorDrop) return;
                                requestAnimationFrame(() => {
                                    checkSlotConnection(getNodes());
                                });
                            };

                            const {
                                width: estimatedNodeWidth,
                                height: estimatedNodeHeight,
                            } = getOverviewLayoutNodeSize(newNode);

                            if (insertionCompound) {
                                let newX = COMPOUND_PADDING_X;

                                nodes
                                    .filter(
                                        (member) =>
                                            member.parentId ===
                                            insertionCompound.id
                                    )
                                    .forEach((member) => {
                                        const size = getOverviewLayoutNodeSize(member);
                                        newX = Math.max(
                                            newX,
                                            Number(member.position?.x || 0) +
                                            size.width +
                                            COMPOUND_NODE_GAP
                                        );
                                    });

                                newNode.parentId = insertionCompound.id;
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
                                            candidate.id === insertionCompound.id
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
                                                                insertionCompound.data?.events || []
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
                                refreshBehaviorSlots();
                                return;
                            }

                            if (targetLane) {
                                const existingMembers = nodes.filter(
                                    (node) => node.parentId === targetLane.id
                                );

                                let newX = 25;
                                existingMembers.forEach((member) => {
                                    const memberWidth =
                                        getOverviewLayoutNodeSize(member).width;
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
                                newNode.position = {
                                    x: newX,
                                    y: PARALLEL_LANE_CHILD_TOP_INSET,
                                };
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
                                                    : getOverviewLayoutNodeSize(member).width;
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
                                            ? Math.max(
                                                PARALLEL_HEADER_HEIGHT,
                                                Number(
                                                    lanes[0].position?.y ||
                                                    PARALLEL_HEADER_HEIGHT
                                                )
                                            )
                                            : PARALLEL_HEADER_HEIGHT;
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
                                                    : getOverviewLayoutNodeSize(member).height;
                                            maxBottom = Math.max(
                                                maxBottom,
                                                Number(
                                                    member.position?.y || 0
                                                ) + memberHeight
                                            );
                                        });

                                        const requiredHeight = Math.max(
                                            130,
                                            maxBottom + 30
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
                                refreshBehaviorSlots();
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
                            refreshBehaviorSlots();
                        }}
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
                            slotNodes={slotNodes}
                            globalDataModel={globalDataModel}
                            visibleNodes={playbackVisibleNodes}
                            visibleEdges={playbackVisibleEdges}
                            smartRoutingNodes={smartRoutingNodes}
                            edgeFocusMode={edgeFocusMode}
                            nodeFocusMode={nodeFocusMode}
                            selectedNodes={selectedNodes}
                            contextSelectionCount={editorCloneSelection.length}
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
                                                {activeRuntimeStep
                                                    ? `Step ${runtimeStepIndex + 1} · ${activeRuntimeStep.timestamp}`
                                                    : "No timestep selected"}
                                            </span>
                                        </div>
                                        {activeRuntimeStep?.tabTitle && (
                                            <span
                                                className="runtime-changes-context"
                                                title="State-machine tab used for this runtime step"
                                            >
                                                {activeRuntimeStep.tabTitle}
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

