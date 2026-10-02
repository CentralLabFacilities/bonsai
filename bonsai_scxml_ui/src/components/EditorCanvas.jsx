import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FiEye,
    FiEyeOff,
    FiFolder,
    FiPause,
    FiPlay,
    FiPlus,
    FiRotateCcw,
    FiSkipBack,
    FiSkipForward,
    FiTrash2,
    FiX,
} from "react-icons/fi";
import {
    Background,
    ConnectionMode,
    Controls,
    ReactFlow,
} from "@xyflow/react";
import { SmartEdgeProvider } from "@tisoap/react-flow-smart-edge";
import CustomNode from "./CustomNode";
import SlotNode from "./SlotNode";
import ParallelNode from "./ParallelNode";
import SubMachineNode from "./SubMachineNode";
import CompoundNode from "./CompoundNode";
import StateCloneNode from "./StateCloneNode";
import ParallelLaneNode from "./ParallelLaneNode";
import EditableTransitionEdge from "./EditableTransitionEdge";
import CodeView from "./CodeView";
import { isTauri } from "../tauri-client";
import { getTransitionHighlightColor } from "../utils/editorGraph";
import {
    buildFallbackEditorScxml,
    serializeEditorGraphWithRust,
} from "../utils/scxmlRustExport";

const nodeTypes = {
    custom: memo(CustomNode),
    slot: memo(SlotNode),
    submachine: memo(SubMachineNode),
    parallel: memo(ParallelNode),
    compound: memo(CompoundNode),
    stateClone: memo(StateCloneNode),
    parallelLane: memo(ParallelLaneNode),
};

const edgeTypes = {
    smartTransition: EditableTransitionEdge,
};

const getHoverEdgeNodeIds = (edge) => {
    const ids = [
        edge?.source,
        edge?.target,
        edge?.data?.skillNodeId,
        edge?.data?.slotNodeId,
        edge?.data?.canonicalSlotNodeId,
        edge?.data?.boundaryOriginalSource,
        edge?.data?.boundaryOriginalTarget,
        edge?.data?.compoundOriginalSource,
        edge?.data?.compoundOriginalTarget,
        edge?.data?.parallelOriginalSource,
        edge?.data?.parallelOriginalTarget,
    ];

    if (Array.isArray(edge?.data?.boundaryOriginalSources)) {
        edge.data.boundaryOriginalSources.forEach((source) => {
            ids.push(source?.sourceId || source?.nodeId || source?.id);
        });
    }

    return [...new Set(ids.filter(Boolean))];
};

const getHoverTransitionColor = (edge) => {
    const semanticHandle =
        edge?.data?.boundaryOriginalSourceHandle ||
        edge?.data?.compoundOriginalSourceHandle ||
        edge?.data?.parallelOriginalSourceHandle ||
        edge?.sourceHandle ||
        edge?.label;
    return getTransitionHighlightColor(semanticHandle);
};

const escapeDataId = (value) =>
    String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

export default function EditorCanvas({
    activeMode,
    setActiveMode,
    showTransitionEdges,
    setShowTransitionEdges,
    showSlotEdges,
    setShowSlotEdges,
    nodes,
    edges,
    globalDataModel,
    manualSlots,
    visibleNodes,
    visibleEdges,
    smartRoutingNodes,
    edgeFocusMode,
    nodeFocusMode,
    contextMenu,
    handleSelectAction,
    hasGraphClipboard,
    setIsCreateSlotModalOpen,
    isDraggingNode,
    isOverTrash,
    handleNodesChange,
    handleVisibleEdgesChange,
    onSelectionChange,
    onConnect,
    handleConnectStart,
    handleConnectEnd,
    onReconnect,
    handleReconnectStart,
    handleReconnectEnd,
    isValidConnection,
    handleEdgeClick,
    handleEdgeDoubleClick,
    handleNodeClick,
    handlePaneClick,
    handleContextMenuOpen,
    handleOpenSubMachine,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    runtimePlayback,
    onLoadRuntimeLog,
    onRuntimePlayPause,
    onRuntimeRestart,
    onRuntimePrevious,
    onRuntimeNext,
    onRuntimeSeek,
    onRuntimeClear,
    onRuntimeDelayChange,
}) {
    const runtimeLogInputRef = useRef(null);
    const [codeString, setCodeString] = useState("");
    // React Flow's visibility culling performs geometry checks and can mount /
    // unmount elements on every viewport frame. Counting edges here made fairly
    // ordinary workflows with many transitions enter that expensive path. Keep
    // the DOM stable unless the *node* count itself is genuinely very large;
    // transition-heavy graphs are handled by the interaction edge fast paths.
    const useViewportCulling = visibleNodes.length >= 600;

    // Canvas hover must not travel through App state. A React-state hover used
    // to rebuild the display graph and rerender unrelated panels every time the
    // pointer crossed a node or edge. Keep the semantic graph unchanged and
    // paint hover directly onto the already-mounted React Flow elements.
    const hoverDomMutationsRef = useRef([]);

    const hoverEdgeIndex = useMemo(() => {
        const edgeById = new Map();
        const edgeIdsByNodeId = new Map();

        visibleEdges.forEach((edge) => {
            edgeById.set(edge.id, edge);
            getHoverEdgeNodeIds(edge).forEach((nodeId) => {
                if (!edgeIdsByNodeId.has(nodeId)) {
                    edgeIdsByNodeId.set(nodeId, []);
                }
                edgeIdsByNodeId.get(nodeId).push(edge.id);
            });
        });

        return { edgeById, edgeIdsByNodeId };
    }, [visibleEdges]);

    const recordHoverClass = useCallback((element, className) => {
        if (!element || element.classList.contains(className)) return;
        element.classList.add(className);
        hoverDomMutationsRef.current.push(() =>
            element.classList.remove(className)
        );
    }, []);

    const recordHoverStyle = useCallback((element, property, value) => {
        if (!element) return;
        const previousValue = element.style.getPropertyValue(property);
        const previousPriority = element.style.getPropertyPriority(property);
        element.style.setProperty(property, value);
        hoverDomMutationsRef.current.push(() => {
            if (previousValue) {
                element.style.setProperty(
                    property,
                    previousValue,
                    previousPriority
                );
            } else {
                element.style.removeProperty(property);
            }
        });
    }, []);

    const clearFastHover = useCallback(() => {
        const mutations = hoverDomMutationsRef.current;
        hoverDomMutationsRef.current = [];
        for (let index = mutations.length - 1; index >= 0; index -= 1) {
            mutations[index]();
        }
    }, []);

    const getFlowElement = useCallback((event) =>
        event?.target?.closest?.(".react-flow") ||
        document.querySelector(".react-flow"), []);

    const getFlowNodeElement = useCallback((flowElement, nodeId) => {
        if (!flowElement || !nodeId) return null;
        return flowElement.querySelector(
            `.react-flow__node[data-id="${escapeDataId(nodeId)}"]`
        );
    }, []);

    const getFlowEdgeElement = useCallback((flowElement, edgeId) => {
        if (!flowElement || !edgeId) return null;
        return flowElement.querySelector(
            `.react-flow__edge[data-id="${escapeDataId(edgeId)}"]`
        );
    }, []);

    const markFastHoverNode = useCallback((flowElement, nodeId, highlighted) => {
        const nodeElement = getFlowNodeElement(flowElement, nodeId);
        if (!nodeElement) return;
        recordHoverClass(nodeElement, "editor-node-context-visible");
        if (highlighted) {
            recordHoverClass(nodeElement, "editor-hover-highlight");
        }
    }, [getFlowNodeElement, recordHoverClass]);

    const markFastHoverEdge = useCallback((flowElement, edge) => {
        const edgeElement = getFlowEdgeElement(flowElement, edge?.id);
        if (!edgeElement) return;

        recordHoverClass(edgeElement, "editor-edge-context-visible");
        recordHoverClass(edgeElement, "editor-edge-focus-active");

        // Preserve the moving-dash hover effect, but enable it directly on the
        // one/few connected SVG groups instead of rebuilding React edge data.
        if (edgeElement.classList.contains("editor-user-transition-edge")) {
            recordHoverClass(edgeElement, "animated");
            const path = edgeElement.querySelector(".react-flow__edge-path");
            if (path) {
                recordHoverStyle(
                    path,
                    "stroke",
                    getHoverTransitionColor(edge)
                );
            }
        }
    }, [getFlowEdgeElement, recordHoverClass, recordHoverStyle]);

    const applyFastNodeHover = useCallback((event, node) => {
        clearFastHover();
        const flowElement = getFlowElement(event);
        if (!flowElement || !node?.id) return;

        recordHoverClass(flowElement, "editor-edge-focus-mode");
        recordHoverClass(flowElement, "editor-node-focus-mode");
        markFastHoverNode(flowElement, node.id, true);

        const connectedEdgeIds =
            hoverEdgeIndex.edgeIdsByNodeId.get(node.id) || [];
        connectedEdgeIds.forEach((edgeId) => {
            const edge = hoverEdgeIndex.edgeById.get(edgeId);
            if (!edge) return;
            markFastHoverEdge(flowElement, edge);
            getHoverEdgeNodeIds(edge).forEach((nodeId) =>
                markFastHoverNode(flowElement, nodeId, nodeId === node.id)
            );
        });
    }, [
        clearFastHover,
        getFlowElement,
        hoverEdgeIndex,
        markFastHoverEdge,
        markFastHoverNode,
        recordHoverClass,
    ]);

    const applyFastEdgeHover = useCallback((event, edge) => {
        clearFastHover();
        const flowElement = getFlowElement(event);
        if (!flowElement || !edge?.id) return;

        recordHoverClass(flowElement, "editor-edge-focus-mode");
        recordHoverClass(flowElement, "editor-node-focus-mode");

        const renderedEdge = hoverEdgeIndex.edgeById.get(edge.id) || edge;
        markFastHoverEdge(flowElement, renderedEdge);
        getHoverEdgeNodeIds(renderedEdge).forEach((nodeId) =>
            markFastHoverNode(flowElement, nodeId, true)
        );
    }, [
        clearFastHover,
        getFlowElement,
        hoverEdgeIndex,
        markFastHoverEdge,
        markFastHoverNode,
        recordHoverClass,
    ]);

    useEffect(() => clearFastHover, [clearFastHover]);

    // Viewport movement must not feed back into React state. A previous attempt
    // used state in onMoveStart/onMoveEnd and could recurse through React Flow's
    // lifecycle. Toggle a paint-only class directly on the mounted flow element
    // instead. This lets CSS temporarily disable expensive SVG/node effects
    // during pan/zoom without causing a React render.
    const movingFlowElementRef = useRef(null);
    const handleViewportMoveStart = useCallback((event) => {
        const flowElement =
            event?.target?.closest?.(".react-flow") ||
            document.querySelector(".react-flow");
        if (!flowElement) return;

        movingFlowElementRef.current = flowElement;
        flowElement.classList.add("editor-viewport-moving");
    }, []);

    const handleViewportMoveEnd = useCallback(() => {
        movingFlowElementRef.current?.classList.remove("editor-viewport-moving");
        movingFlowElementRef.current = null;
    }, []);

    useEffect(
        () => () => {
            movingFlowElementRef.current?.classList.remove(
                "editor-viewport-moving"
            );
        },
        []
    );

    useEffect(() => {
        if (activeMode !== "code") return undefined;

        let cancelled = false;
        setCodeString("<!-- Generating SCXML… -->");

        const generateCode = async () => {
            try {
                if (!isTauri()) {
                    if (!cancelled) {
                        setCodeString(
                            buildFallbackEditorScxml(
                                { nodes, edges, globalDataModel, manualSlots },
                                "Rust/Tauri backend unavailable"
                            )
                        );
                    }
                    return;
                }

                // Code View uses the same canonical Rust serializer as Save.
                const xml = await serializeEditorGraphWithRust({
                    nodes,
                    edges,
                    globalDataModel,
                    manualSlots,
                });

                if (!cancelled) setCodeString(xml);
            } catch (error) {
                console.error("Could not generate Code View SCXML:", error);
                if (!cancelled) {
                    setCodeString(
                        buildFallbackEditorScxml(
                            { nodes, edges, globalDataModel, manualSlots },
                            error
                        )
                    );
                }
            }
        };

        void generateCode();
        return () => {
            cancelled = true;
        };
    }, [activeMode, nodes, edges, globalDataModel, manualSlots]);

    if (activeMode === "code") {
        return (
            <CodeView
                codeString={codeString}
                activeMode={activeMode}
                setActiveMode={setActiveMode}
            />
        );
    }

    return (
        <>
            <div className="mode-button-group-floating">
                {["event", "slots", "overview", "code"].map((mode) => (
                    <button
                        key={mode}
                        className={`mode-button ${activeMode === mode ? "active" : ""}`}
                        onClick={() => setActiveMode(mode)}
                    >
                        {mode === "event"
                            ? "Event Mode"
                            : mode === "slots"
                                ? "Slot Mode"
                                : mode === "overview"
                                    ? "Overview Mode"
                                    : "Code View"}
                    </button>
                ))}
            </div>

            <div className="edge-visibility-toggle-group">
                <button
                    type="button"
                    className={`edge-visibility-toggle ${showTransitionEdges ? "active" : ""}`}
                    aria-pressed={showTransitionEdges}
                    title={
                        showTransitionEdges
                            ? "Hide transitions except for hovered/selected nodes"
                            : "Show all transitions"
                    }
                    onClick={() => setShowTransitionEdges((value) => !value)}
                >
                    {showTransitionEdges ? <FiEye /> : <FiEyeOff />}
                    <span>Transitions</span>
                </button>

                <button
                    type="button"
                    className={`edge-visibility-toggle ${showSlotEdges ? "active" : ""}`}
                    aria-pressed={showSlotEdges}
                    title={
                        showSlotEdges
                            ? "Hide slot edges except for hovered/selected skills or slots"
                            : "Show all slot edges"
                    }
                    onClick={() => setShowSlotEdges((value) => !value)}
                >
                    {showSlotEdges ? <FiEye /> : <FiEyeOff />}
                    <span>Slot edges</span>
                </button>
            </div>

            <input
                ref={runtimeLogInputRef}
                type="file"
                accept=".log,.txt,text/plain"
                style={{ display: "none" }}
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;

                    try {
                        const text = await file.text();
                        onLoadRuntimeLog?.(text, file.name);
                    } catch (error) {
                        console.error("Could not read runtime log:", error);
                    }
                }}
            />

            {!runtimePlayback?.loaded ? (
                <button
                    type="button"
                    className="runtime-log-load-button"
                    onClick={() => runtimeLogInputRef.current?.click()}
                    title="Load a SkillStateMachine runtime log"
                >
                    <FiFolder />
                    <span>Load log</span>
                </button>
            ) : (
                <div className="runtime-log-player" role="region" aria-label="Runtime log playback">
                    <div className="runtime-log-player-header">
                        <button
                            type="button"
                            className="runtime-log-file-button"
                            onClick={() => runtimeLogInputRef.current?.click()}
                            title="Load another runtime log"
                        >
                            <FiFolder />
                        </button>
                        <div className="runtime-log-file-info">
                            <strong title={runtimePlayback.fileName}>
                                {runtimePlayback.fileName || "Runtime log"}
                            </strong>
                            <span>
                                {runtimePlayback.stepCount > 0
                                    ? runtimePlayback.started
                                        ? `${runtimePlayback.stepIndex + 1} / ${runtimePlayback.stepCount}`
                                        : `Trace overview · ${runtimePlayback.stepCount} transitions`
                                    : "No transitions found"}
                                {runtimePlayback.unresolvedCount > 0
                                    ? ` · ${runtimePlayback.unresolvedCount} unmatched`
                                    : ""}
                                {runtimePlayback.unresolvedSlotSampleCount > 0
                                    ? ` · ${runtimePlayback.unresolvedSlotSampleCount} slot values unmatched`
                                    : ""}
                                {runtimePlayback.unresolvedParameterSampleCount > 0
                                    ? ` · ${runtimePlayback.unresolvedParameterSampleCount} parameter values unmatched`
                                    : ""}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="runtime-log-close-button"
                            onClick={onRuntimeClear}
                            title="Close runtime log"
                        >
                            <FiX />
                        </button>
                    </div>

                    {!runtimePlayback.started && runtimePlayback.stepCount > 0 && (
                        <div className="runtime-log-trace-overview">
                            Executed route highlighted · press Play to follow it step by step
                        </div>
                    )}

                    {runtimePlayback.currentStep && (
                        <div className="runtime-log-current-step">
                            <div className="runtime-log-route" title={`${runtimePlayback.currentStep.source} → ${runtimePlayback.currentStep.target}`}>
                                <span>{runtimePlayback.currentStep.source}</span>
                                <span className="runtime-log-route-arrow">→</span>
                                <span>{runtimePlayback.currentStep.target}</span>
                            </div>
                            <div className="runtime-log-event-row">
                                <code>{runtimePlayback.currentStep.event || "(no event)"}</code>
                                <span>{runtimePlayback.currentStep.timestamp}</span>
                                {!runtimePlayback.currentStep.resolved && (
                                    <span className="runtime-log-unmatched">not matched</span>
                                )}
                            </div>
                        </div>
                    )}

                    {runtimePlayback.stepCount > 0 && (
                        <div className="runtime-log-timeline">
                            <div className="runtime-log-timeline-labels">
                                <span>
                                    {runtimePlayback.started
                                        ? `Step ${runtimePlayback.stepIndex + 1}`
                                        : "Trace start"}
                                </span>
                                <span>
                                    {runtimePlayback.started
                                        ? runtimePlayback.currentStep?.timestamp || ""
                                        : "Click to jump"}
                                </span>
                                <span>{runtimePlayback.stepCount}</span>
                            </div>
                            <input
                                className="runtime-log-timeline-range"
                                type="range"
                                min={0}
                                max={Math.max(0, runtimePlayback.stepCount - 1)}
                                step={1}
                                value={
                                    runtimePlayback.started
                                        ? runtimePlayback.stepIndex
                                        : 0
                                }
                                onChange={(event) =>
                                    onRuntimeSeek?.(Number(event.target.value))
                                }
                                aria-label="Runtime transition timeline"
                                title="Click or drag to jump to a transition"
                            />
                        </div>
                    )}

                    <div className="runtime-log-controls">
                        <button
                            type="button"
                            onClick={onRuntimeRestart}
                            disabled={runtimePlayback.stepCount === 0}
                            title="Start from beginning"
                        >
                            <FiRotateCcw />
                        </button>
                        <button
                            type="button"
                            onClick={onRuntimePrevious}
                            disabled={
                                runtimePlayback.stepCount === 0 ||
                                !runtimePlayback.started ||
                                runtimePlayback.stepIndex <= 0
                            }
                            title="Previous transition"
                        >
                            <FiSkipBack />
                        </button>
                        <button
                            type="button"
                            className="runtime-log-play-button"
                            onClick={onRuntimePlayPause}
                            disabled={runtimePlayback.stepCount === 0}
                            title={runtimePlayback.isPlaying ? "Pause" : "Play"}
                        >
                            {runtimePlayback.isPlaying ? <FiPause /> : <FiPlay />}
                        </button>
                        <button
                            type="button"
                            onClick={onRuntimeNext}
                            disabled={
                                runtimePlayback.stepCount === 0 ||
                                !runtimePlayback.started ||
                                runtimePlayback.stepIndex >= runtimePlayback.stepCount - 1
                            }
                            title="Next transition"
                        >
                            <FiSkipForward />
                        </button>
                        <select
                            value={runtimePlayback.delay}
                            onChange={(event) =>
                                onRuntimeDelayChange?.(Number(event.target.value))
                            }
                            title="Playback speed"
                            aria-label="Playback speed"
                        >
                            <option value={1400}>0.5×</option>
                            <option value={800}>1×</option>
                            <option value={400}>2×</option>
                            <option value={200}>4×</option>
                        </select>
                    </div>
                </div>
            )}

            {(activeMode === "slots" || activeMode === "overview") && (
                <button
                    type="button"
                    className="create-slot-button-floating"
                    onClick={() => setIsCreateSlotModalOpen(true)}
                >
                    <FiPlus /> New Slot
                </button>
            )}

            {isDraggingNode && (
                <div
                    className={`trash-bin-dropzone ${isOverTrash ? "drag-over" : ""}`}
                >
                    <FiTrash2 className="trash-icon" />
                    <span>Drop here to delete</span>
                </div>
            )}

            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="context-menu-header">
                        {contextMenu.title || "Editor"}
                    </div>

                    {contextMenu.kind === "pane" && (
                        <>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("paste")}
                                disabled={!hasGraphClipboard}
                                aria-disabled={!hasGraphClipboard}
                                title={
                                    hasGraphClipboard
                                        ? "Paste copied nodes"
                                        : "Nothing copied"
                                }
                            >
                                Paste
                            </button>
                            <div className="context-menu-divider" aria-hidden="true" />
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("compound")}
                            >
                                New Compound State
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("parallel")}
                            >
                                New Parallel State
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("submachine")}
                            >
                                New Sub-State-Machine
                            </button>
                            {(activeMode === "slots" || activeMode === "overview") && (
                                <button
                                    className="context-menu-item"
                                    onClick={() => handleSelectAction("slot")}
                                >
                                    New Slot
                                </button>
                            )}
                        </>
                    )}

                    {contextMenu.kind === "node" && (
                        <>
                            {!contextMenu.isStructuralNode && (
                                <>
                                    <button
                                        className="context-menu-item"
                                        onClick={() => handleSelectAction("open-details")}
                                    >
                                        Open details
                                    </button>
                                    {contextMenu.canOpenTransitions && (
                                        <button
                                            className="context-menu-item"
                                            onClick={() => handleSelectAction("open-transitions")}
                                        >
                                            Transitions…
                                        </button>
                                    )}
                                    {contextMenu.canSetInitial && (
                                        <button
                                            className="context-menu-item"
                                            onClick={() => handleSelectAction("set-initial")}
                                        >
                                            Set as initial
                                        </button>
                                    )}
                                </>
                            )}

                            {(contextMenu.canCreateReference || contextMenu.canAddState || contextMenu.canAddLane) && (
                                <div className="context-menu-divider" aria-hidden="true" />
                            )}

                            {contextMenu.canAddState &&
                                (contextMenu.addStateTargets || []).map((target) => (
                                    <button
                                        key={`add-state-${target.id}`}
                                        className="context-menu-item"
                                        onClick={() =>
                                            handleSelectAction("add-state", target.id)
                                        }
                                    >
                                        {(contextMenu.addStateTargets || []).length > 1
                                            ? `Add state to ${target.label}`
                                            : "Add state"}
                                    </button>
                                ))}
                            {contextMenu.canAddLane && (
                                <button
                                    className="context-menu-item"
                                    onClick={() => handleSelectAction("add-lane")}
                                >
                                    Add lane
                                </button>
                            )}
                            {!contextMenu.isStructuralNode && contextMenu.canCreateReference && (
                                <button
                                    className="context-menu-item"
                                    onClick={() => handleSelectAction("clone")}
                                >
                                    {contextMenu.referenceLabel || "Create reference"}
                                </button>
                            )}
                            {!contextMenu.isStructuralNode && (
                                <button
                                    className="context-menu-item"
                                    onClick={() => handleSelectAction("copy")}
                                >
                                    Copy
                                </button>
                            )}

                            {!contextMenu.isStructuralNode && contextMenu.canWrap && (
                                <>
                                    <div className="context-menu-divider" aria-hidden="true" />
                                    <button
                                        className="context-menu-item"
                                        onClick={() => handleSelectAction("compound")}
                                    >
                                        Wrap in Compound
                                    </button>
                                    <button
                                        className="context-menu-item"
                                        onClick={() => handleSelectAction("parallel")}
                                    >
                                        Wrap in Parallel
                                    </button>
                                </>
                            )}

                            {contextMenu.canDelete && (
                                <>
                                    <div className="context-menu-divider" aria-hidden="true" />
                                    <button
                                        className="context-menu-item context-menu-item-danger"
                                        onClick={() => handleSelectAction("delete-node")}
                                    >
                                        Delete
                                    </button>
                                </>
                            )}
                        </>
                    )}


                    {contextMenu.kind === "edge" && !contextMenu.isSlotConnection && (
                        <>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("open-transition")}
                            >
                                Open transition
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("go-source")}
                            >
                                Go to source
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("go-target")}
                            >
                                Go to target
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("change-transition-target")}
                            >
                                Change target…
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("create-control-point")}
                            >
                                Create control point here
                            </button>
                            <div className="context-menu-divider" aria-hidden="true" />
                            <button
                                className="context-menu-item context-menu-item-danger"
                                onClick={() => handleSelectAction("delete-transition")}
                            >
                                Delete transition
                            </button>
                        </>
                    )}

                    {contextMenu.kind === "edge" && contextMenu.isSlotConnection && (
                        <>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("open-slot-connection")}
                            >
                                Open slot connection
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("go-slot-skill")}
                            >
                                Go to skill
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("go-slot-node")}
                            >
                                Go to slot
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("create-control-point")}
                            >
                                Create control point here
                            </button>
                            <div className="context-menu-divider" aria-hidden="true" />
                            <button
                                className="context-menu-item context-menu-item-danger"
                                onClick={() => handleSelectAction("disconnect-slot")}
                            >
                                Disconnect
                            </button>
                        </>
                    )}

                    {contextMenu.kind === "control-point" && (
                        <button
                            className="context-menu-item context-menu-item-danger"
                            onClick={() => handleSelectAction("remove-control-point")}
                        >
                            Remove control point
                        </button>
                    )}
                </div>
            )}


            <SmartEdgeProvider nodes={smartRoutingNodes}>
                <ReactFlow
                    className={
                        [
                            (!showTransitionEdges || activeMode === "slots") &&
                                "editor-transitions-context-only",
                            !showSlotEdges && "editor-slots-context-only",
                            edgeFocusMode && "editor-edge-focus-mode",
                            nodeFocusMode && "editor-node-focus-mode",
                            runtimePlayback?.loaded && "runtime-log-focus-mode",
                            isDraggingNode && "editor-node-dragging",
                        ]
                            .filter(Boolean)
                            .join(" ") || undefined
                    }
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    // Keep the complete graph loaded/cached, but only mount
                    // React Flow elements that are actually inside the viewport.
                    // This significantly reduces DOM/SVG work on large state
                    // machines without changing the semantic graph in memory.
                    onlyRenderVisibleElements={useViewportCulling}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleVisibleEdgesChange}
                    onSelectionChange={onSelectionChange}
                    onConnect={onConnect}
                    onConnectStart={handleConnectStart}
                    onConnectEnd={handleConnectEnd}
                    onReconnect={onReconnect}
                    onReconnectStart={handleReconnectStart}
                    onReconnectEnd={handleReconnectEnd}
                    edgesReconnectable
                    isValidConnection={isValidConnection}
                    connectionMode={ConnectionMode.Loose}
                    onEdgeClick={handleEdgeClick}
                    onEdgeDoubleClick={handleEdgeDoubleClick}
                    onEdgeContextMenu={(event, edge) =>
                        handleContextMenuOpen(event, null, edge)
                    }
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodeClick={handleNodeClick}
                    onNodeMouseEnter={applyFastNodeHover}
                    onNodeMouseLeave={clearFastHover}
                    onEdgeMouseEnter={applyFastEdgeHover}
                    onEdgeMouseLeave={clearFastHover}
                    onPaneClick={handlePaneClick}
                    onPaneContextMenu={(event) => handleContextMenuOpen(event)}
                    onNodeContextMenu={(event, node) =>
                        handleContextMenuOpen(event, node)
                    }
                    multiSelectionKeyCode={["Shift", "Control", "Meta"]}
                    // Left-drag is reserved for box selection. Pan the viewport
                    // with either the middle or right mouse button.
                    selectionOnDrag
                    selectionKeyCode={null}
                    panOnDrag={[1, 2]}
                    // Trackpad behavior: two-finger scrolling pans the viewport.
                    // Trackpad/wheel zoom is disabled; use the React Flow zoom
                    // controls instead.
                    zoomOnScroll={true}
                    zoomOnPinch={true}
                    deleteKeyCode={["Delete"]}
                    minZoom={0.08}
                    onNodeDoubleClick={(_, node) => {
                        if (node.type === "submachine" && node.data?.src) {
                            handleOpenSubMachine(node.data.src, node.data.label);
                        }
                    }}
                    onNodeDragStart={handleNodeDragStart}
                    onNodeDrag={handleNodeDrag}
                    onNodeDragStop={handleNodeDragStop}
                    onMoveStart={handleViewportMoveStart}
                    onMoveEnd={handleViewportMoveEnd}
                >
                    <Background />
                    <Controls />
                </ReactFlow>
            </SmartEdgeProvider>
        </>
    );
}
