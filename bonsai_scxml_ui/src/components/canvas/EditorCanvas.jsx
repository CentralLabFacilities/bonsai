import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { FiTrash2 } from "react-icons/fi";
import {
    Background,
    ConnectionMode,
    Controls,
    ReactFlow,
    getBezierPath,
} from "@xyflow/react";
import { SmartEdgeProvider } from "@tisoap/react-flow-smart-edge";
import { SkillNode, SubMachineNode, StateReferenceNode } from "../graph/StateNodes.jsx";
import SlotNode from "../graph/SlotNode";
import { CompoundNode, ParallelNode, ParallelLaneNode } from "../graph/ContainerNodes.jsx";
import EditableTransitionEdge from "../graph/EditableTransitionEdge";
import CodeView from "./CodeView";
import ModeSwitcher from "./ModeSwitcher.jsx";
import RuntimeLogPlayer from "../inspector/RuntimeLogPlayer.jsx";
import CanvasContextMenu from "./CanvasContextMenu.jsx";
import { getSlotConnectionColor, getTransitionHighlightColor, parseSlotConnectionHandle } from "../../utils/editorGraph";
import { boundaryTransitionKeys, buildBoundaryHelperIndex } from "../../utils/transitionBoundaryHighlight.js";

function EditorConnectionLine({ fromHandle, fromX, fromY, toX, toY, fromPosition, toPosition,
    connectionLineStyle }) {
    const handle = parseSlotConnectionHandle(fromHandle?.id);
    const reverse = handle && (handle.origin === "slot" ? handle.access === "write" : handle.access === "read");
    const [path] = getBezierPath(reverse
        ? { sourceX: toX, sourceY: toY, sourcePosition: toPosition, targetX: fromX, targetY: fromY, targetPosition: fromPosition }
        : { sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition, targetX: toX, targetY: toY, targetPosition: toPosition });
    const color = handle ? getSlotConnectionColor(handle.access, document.documentElement.hasAttribute("data-colorblind-mode")) : undefined;
    return (
        <g style={{ pointerEvents: "none" }}>
            <path className="react-flow__connection-path" d={path} fill="none"
                style={{ ...connectionLineStyle, ...(color ? { stroke: color, strokeWidth: 1.7, strokeDasharray: "5 5" } : {}) }} />
        </g>
    );
}

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
    return getTransitionHighlightColor(semanticHandle, document.documentElement.hasAttribute("data-colorblind-mode"));
};

const escapeDataId = (value) =>
    String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

export default function EditorCanvas({
    activeMode,
    setActiveMode,
    showTransitionEdges,
    showSlotEdges,
    showCodeViewButton = true,
    colorblindMode = false,
    nodes,
    edges,
    globalDataModel,
    manualSlots,
    visibleNodes,
    visibleEdges,
    documentKey,
    smartRoutingNodes,
    edgeFocusMode,
    nodeFocusMode,
    contextMenu,
    setContextMenu,
    handleSelectAction,
    hasGraphClipboard,
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
    runtimeCommanderOpen = false,
    runtimeExpansionActive = false,
    liveExecutionActive = false,
    onOpenRuntimeCommander,
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
    const fastHoverOwnerRef = useRef(null);
    const fastHoverObserverRef = useRef(null);

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

        return {
            edgeById,
            edgeIdsByNodeId,
            boundaryHelperIdsByKey: buildBoundaryHelperIndex(visibleEdges),
        };
    }, [visibleEdges]);

    const recordHoverClass = useCallback((element, className) => {
        if (!element || element.classList.contains(className)) return;
        element.classList.add(className);
        hoverDomMutationsRef.current.push(() =>
            element.classList.remove(className)
        );
    }, []);

    const recordHoverStyle = useCallback((
        element,
        property,
        value,
    ) => {
        if (!element) return;
        const previousValue = element.style.getPropertyValue(property);
        const previousPriority = element.style.getPropertyPriority(property);
        element.style.setProperty(property, value);
        hoverDomMutationsRef.current.push(() => {
            // This helper is used only for canvas-owned CSS variables; never
            // restore a React-owned edge stroke or selection style.
            if (!element.isConnected || element.style.getPropertyValue(property) !== value) return;

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
        fastHoverObserverRef.current?.disconnect();
        fastHoverObserverRef.current = null;
        fastHoverOwnerRef.current = null;
        const mutations = hoverDomMutationsRef.current;
        hoverDomMutationsRef.current = [];
        for (let index = mutations.length - 1; index >= 0; index -= 1) {
            mutations[index]();
        }
    }, []);

    // React Flow may remove or replace a hovered SVG/node without emitting
    // mouseleave. Observe removal while a fast hover is active, instead of
    // relying on another pointermove to eventually clean up the old paint.
    const watchFastHoverOwner = useCallback((flowElement, owner) => {
        if (!flowElement || !owner || !window.MutationObserver) return;
        fastHoverObserverRef.current?.disconnect();
        const observer = new MutationObserver(() => {
            if (!owner.isConnected || !flowElement.contains(owner)) {
                clearFastHover();
            }
        });
        observer.observe(flowElement, { childList: true, subtree: true });
        fastHoverObserverRef.current = observer;
    }, [clearFastHover]);

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
        recordHoverClass(nodeElement, "editor-canvas-fast-node-context-visible");
        if (highlighted) {
            recordHoverClass(nodeElement, "editor-canvas-fast-hover-highlight");
        }
    }, [getFlowNodeElement, recordHoverClass]);

    const markFastHoverEdge = useCallback((flowElement, edge) => {
        const edgeElement = getFlowEdgeElement(flowElement, edge?.id);
        if (!edgeElement) return;

        recordHoverClass(edgeElement, "editor-canvas-fast-edge-context-visible");
        recordHoverClass(edgeElement, "editor-canvas-fast-edge-focus-active");

        // Preserve the moving-dash hover effect, but enable it directly on the
        // one/few connected SVG groups instead of rebuilding React edge data.
        if (edgeElement.classList.contains("editor-transition-edge")) {
            recordHoverClass(edgeElement, "editor-canvas-fast-edge-animated");
            recordHoverStyle(
                edgeElement,
                "--editor-canvas-hover-stroke",
                getHoverTransitionColor(edge)
            );
        }
    }, [getFlowEdgeElement, recordHoverClass, recordHoverStyle]);

    const applyFastNodeHover = useCallback((event, node) => {
        clearFastHover();
        const flowElement = getFlowElement(event);
        if (!flowElement || !node?.id) return;

        fastHoverOwnerRef.current = getFlowNodeElement(flowElement, node.id);
        watchFastHoverOwner(flowElement, fastHoverOwnerRef.current);
        recordHoverClass(flowElement, "editor-canvas-fast-edge-focus-mode");
        recordHoverClass(flowElement, "editor-canvas-fast-node-focus-mode");
        markFastHoverNode(flowElement, node.id, true);

        const originalNodeId = node.data?.cloneOfNodeId;
        if (originalNodeId) {
            // A reference hover has two different meanings: the reference itself
            // is hovered, while the source is only the related target. Keep
            // those states separate so their visual feedback can coexist with
            // selection/problem styling without pretending both nodes are hovered.
            markFastHoverNode(flowElement, originalNodeId, false);
            recordHoverClass(
                getFlowNodeElement(flowElement, originalNodeId),
                "editor-canvas-fast-reference-target-highlight"
            );
        }

        const connectedEdgeIds =
            hoverEdgeIndex.edgeIdsByNodeId.get(node.id) || [];
        connectedEdgeIds.forEach((edgeId) => {
            const edge = hoverEdgeIndex.edgeById.get(edgeId);
            if (!edge) return;
            markFastHoverEdge(flowElement, edge);
            boundaryTransitionKeys(edge).forEach((boundaryKey) => {
                (hoverEdgeIndex.boundaryHelperIdsByKey.get(boundaryKey) || []).forEach((helperId) => {
                    const helper = hoverEdgeIndex.edgeById.get(helperId);
                    if (helper) markFastHoverEdge(flowElement, helper);
                });
            });
            getHoverEdgeNodeIds(edge).forEach((nodeId) =>
                markFastHoverNode(flowElement, nodeId, nodeId === node.id)
            );
        });
    }, [
        clearFastHover,
        getFlowElement,
        getFlowNodeElement,
        hoverEdgeIndex,
        markFastHoverEdge,
        markFastHoverNode,
        recordHoverClass,
        watchFastHoverOwner,
    ]);

    const applyFastEdgeHover = useCallback((event, edge) => {
        clearFastHover();
        const flowElement = getFlowElement(event);
        if (!flowElement || !edge?.id) return;

        fastHoverOwnerRef.current = getFlowEdgeElement(flowElement, edge.id);
        watchFastHoverOwner(flowElement, fastHoverOwnerRef.current);
        recordHoverClass(flowElement, "editor-canvas-fast-edge-focus-mode");
        recordHoverClass(flowElement, "editor-canvas-fast-node-focus-mode");

        const renderedEdge = hoverEdgeIndex.edgeById.get(edge.id) || edge;
        markFastHoverEdge(flowElement, renderedEdge);
        boundaryTransitionKeys(renderedEdge).forEach((boundaryKey) => {
            (hoverEdgeIndex.boundaryHelperIdsByKey.get(boundaryKey) || []).forEach((helperId) => {
                const helper = hoverEdgeIndex.edgeById.get(helperId);
                if (helper) markFastHoverEdge(flowElement, helper);
            });
        });
        getHoverEdgeNodeIds(renderedEdge).forEach((nodeId) =>
            markFastHoverNode(flowElement, nodeId, true)
        );
    }, [
        clearFastHover,
        getFlowElement,
        getFlowEdgeElement,
        hoverEdgeIndex,
        markFastHoverEdge,
        markFastHoverNode,
        recordHoverClass,
        watchFastHoverOwner,
    ]);

    // React Flow can remove a hovered edge during a document/viewport update
    // without sending onEdgeMouseLeave. Clear any imperative hover on graph
    // changes, pane movement, window blur and mouse departure from the canvas.
    useEffect(() => clearFastHover, [clearFastHover]);
    useEffect(() => { clearFastHover(); }, [documentKey, activeMode, showTransitionEdges, showSlotEdges, colorblindMode, clearFastHover]);
    useEffect(() => {
        // Missing mouseleave (for instance when React Flow replaces an edge
        // while the pointer is over it) must never leave DOM-only hover classes.
        const clearIfPointerLeft = (event) => {
            const owner = fastHoverOwnerRef.current;
            if (!owner) return;
            const underPointer = document.elementFromPoint(event.clientX, event.clientY);
            if (!owner.isConnected || !underPointer || !owner.contains(underPointer)) {
                clearFastHover();
            }
        };
        document.addEventListener("pointermove", clearIfPointerLeft, true);
        document.addEventListener("pointercancel", clearFastHover, true);
        const clearWhenLeavingWindow = (event) => {
            if (!event.relatedTarget) clearFastHover();
        };
        document.addEventListener("mouseout", clearWhenLeavingWindow, true);
        return () => {
            document.removeEventListener("pointermove", clearIfPointerLeft, true);
            document.removeEventListener("pointercancel", clearFastHover, true);
            document.removeEventListener("mouseout", clearWhenLeavingWindow, true);
        };
    }, [clearFastHover]);
    useEffect(() => {
        window.addEventListener("blur", clearFastHover);
        return () => window.removeEventListener("blur", clearFastHover);
    }, [clearFastHover]);

    // Only update a paint-only class when zoom crosses the badge visibility
    // threshold. No per-node viewport subscription or React rerender is needed.
    const updateSlotTypeZoom = useCallback((zoom, flowElement = null) => {
        if (!Number.isFinite(zoom)) return;
        const element = flowElement || document.querySelector(".react-flow");
        element?.classList.toggle("editor-slot-types-compact", zoom <= 0.5);
    }, []);

    // Viewport movement must not feed back into React state. A previous attempt
    // used state in onMoveStart/onMoveEnd and could recurse through React Flow's
    // lifecycle. Toggle a paint-only class directly on the mounted flow element
    // instead. This lets CSS temporarily disable expensive SVG/node effects
    // during pan/zoom without causing a React render.
    const movingFlowElementRef = useRef(null);
    const handleViewportMoveStart = useCallback((event) => {
        clearFastHover();
        const flowElement =
            event?.target?.closest?.(".react-flow") ||
            document.querySelector(".react-flow");
        if (!flowElement) return;

        movingFlowElementRef.current = flowElement;
        flowElement.classList.add("editor-viewport-moving");
    }, [clearFastHover]);

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
                showCodeViewButton={showCodeViewButton}
            />
        );
    }

    return (
        <>
            <div className="editor-canvas-toolbar">
                <ModeSwitcher activeMode={activeMode} setActiveMode={setActiveMode}
                    showCodeViewButton={showCodeViewButton} />
            </div>

            <RuntimeLogPlayer
                runtimePlayback={runtimePlayback}
                isRunPanelOpen={runtimeCommanderOpen}
                onOpenRuntimeCommander={onOpenRuntimeCommander}
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
                onClose={() => setContextMenu(null)}
            />


            <SmartEdgeProvider nodes={smartRoutingNodes}>
                <ReactFlow
                    key={documentKey}
                    className={
                        [
                            (!showTransitionEdges || activeMode === "slots") &&
                                "editor-transitions-context-only",
                            !showSlotEdges && "editor-slots-context-only",
                            edgeFocusMode && "editor-edge-focus-mode",
                            nodeFocusMode && "editor-node-focus-mode",
                            (runtimePlayback?.loaded || liveExecutionActive) && "runtime-log-focus-mode",
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
                    onNodesChange={(changes) => {
                        // Synthetic React Flow measurements of an expanded live
                        // presentation must never leak into the saved graph.
                        const edits = runtimeExpansionActive
                            ? changes.filter((change) => change.type !== "dimensions")
                            : changes;
                        if (edits.length) handleNodesChange(edits);
                    }}
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
                    connectionLineComponent={EditorConnectionLine}
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
                    onPointerLeave={clearFastHover}
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
                    onMove={(_, viewport) => updateSlotTypeZoom(viewport.zoom, movingFlowElementRef.current)}
                    onMoveEnd={handleViewportMoveEnd}
                    onInit={(instance) => updateSlotTypeZoom(instance.getZoom())}
                >
                    <Background />
                    <Controls position={runtimePlayback?.loaded || liveExecutionActive ? "bottom-right" : "bottom-left"} />
                </ReactFlow>
            </SmartEdgeProvider>
        </>
    );
}
