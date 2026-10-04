import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
    FiEye,
    FiEyeOff,
    FiPlus,
    FiTrash2,
} from "react-icons/fi";
import {
    Background,
    ConnectionMode,
    Controls,
    ReactFlow,
} from "@xyflow/react";
import { SmartEdgeProvider } from "@tisoap/react-flow-smart-edge";
import { SkillNode, SubMachineNode, StateReferenceNode } from "./StateNodes.jsx";
import SlotNode from "./SlotNode";
import { CompoundNode, ParallelNode, ParallelLaneNode } from "./ContainerNodes.jsx";
import EditableTransitionEdge from "./EditableTransitionEdge";
import CodeView from "./CodeView";
import ModeSwitcher from "./ModeSwitcher.jsx";
import RuntimeLogPlayer from "./RuntimeLogPlayer.jsx";
import CanvasContextMenu from "./CanvasContextMenu.jsx";
import { getTransitionHighlightColor } from "../utils/editorGraph";

const nodeTypes = {
    custom: memo(SkillNode),
    slot: memo(SlotNode),
    submachine: memo(SubMachineNode),
    parallel: memo(ParallelNode),
    compound: memo(CompoundNode),
    stateClone: memo(StateReferenceNode),
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

        const originalNodeId = node.data?.cloneOfNodeId;
        if (originalNodeId) {
            markFastHoverNode(flowElement, originalNodeId, true);
        }

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

    if (activeMode === "code") {
        return (
            <CodeView
                nodes={nodes}
                edges={edges}
                globalDataModel={globalDataModel}
                manualSlots={manualSlots}
                activeMode={activeMode}
                setActiveMode={setActiveMode}
            />
        );
    }

    return (
        <>
            <div className="editor-canvas-toolbar">
                <ModeSwitcher activeMode={activeMode} setActiveMode={setActiveMode} />

                <div className="editor-canvas-toolbar-actions">
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

                    {(activeMode === "slots" || activeMode === "overview") && (
                        <button
                            type="button"
                            className="create-slot-button-floating"
                            onClick={() => setIsCreateSlotModalOpen(true)}
                        >
                            <FiPlus /> New Slot
                        </button>
                    )}
                </div>
            </div>

            <RuntimeLogPlayer
                runtimePlayback={runtimePlayback}
                isDraggingNode={isDraggingNode}
                onLoadRuntimeLog={onLoadRuntimeLog}
                onRuntimePlayPause={onRuntimePlayPause}
                onRuntimeRestart={onRuntimeRestart}
                onRuntimePrevious={onRuntimePrevious}
                onRuntimeNext={onRuntimeNext}
                onRuntimeSeek={onRuntimeSeek}
                onRuntimeClear={onRuntimeClear}
                onRuntimeDelayChange={onRuntimeDelayChange}
            />

            {isDraggingNode && (
                <div
                    className={`trash-bin-dropzone ${isOverTrash ? "drag-over" : ""}`}
                >
                    <FiTrash2 className="trash-icon" />
                    <span>Drop here to delete</span>
                </div>
            )}

            <CanvasContextMenu
                contextMenu={contextMenu}
                activeMode={activeMode}
                hasGraphClipboard={hasGraphClipboard}
                handleSelectAction={handleSelectAction}
            />


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
                    <Controls position={runtimePlayback?.loaded ? "bottom-right" : "bottom-left"} />
                </ReactFlow>
            </SmartEdgeProvider>
        </>
    );
}
