import { memo, useMemo } from "react";
import { FiEye, FiEyeOff, FiPlus, FiTrash2 } from "react-icons/fi";
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
import { isSlotEdge } from "../utils/editorGraph";
import { prepareGraphForScxml } from "../utils/editorScxml";
import { generateXmlString } from "../utils/scxmlExport";

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
    selectSlotEdge,
    selectTransitionEdge,
    onEdgeDoubleClick,
    clearAllEdgeSelection,
    setSelectedNodeId,
    setActiveTab,
    setRightPanelTab,
    setHoveredEditorNodeId,
    setHoveredEditorEdgeId,
    handleContextMenuOpen,
    handleOpenSubMachine,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
}) {
    const codeString = useMemo(() => {
        if (activeMode !== "code") return "";
        const exportGraph = prepareGraphForScxml(nodes, edges);
        return generateXmlString(
            exportGraph.nodes,
            exportGraph.edges,
            globalDataModel
        );
    }, [activeMode, nodes, edges, globalDataModel]);

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

                            {!contextMenu.isStructuralNode && contextMenu.canDelete && (
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
                    onlyRenderVisibleElements
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
                    onEdgeClick={(event, edge) => {
                        if (
                            edge.data?.compoundInitialEdge ||
                            edge.data?.parallelEntryEdge
                        ) {
                            return;
                        }
                        if (isSlotEdge(edge)) {
                            selectSlotEdge(edge.id);
                            return;
                        }
                        selectTransitionEdge(
                            edge.id,
                            Boolean(event.ctrlKey || event.metaKey)
                        );
                    }}
                    onEdgeDoubleClick={(event, edge) => {
                        if (
                            edge.data?.compoundInitialEdge ||
                            edge.data?.parallelEntryEdge
                        ) {
                            return;
                        }
                        if (isSlotEdge(edge)) {
                            selectSlotEdge(edge.id);
                            return;
                        }
                        onEdgeDoubleClick(event, edge);
                    }}
                    onEdgeContextMenu={(event, edge) =>
                        handleContextMenuOpen(event, null, edge)
                    }
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodeClick={(_, node) => {
                        clearAllEdgeSelection();

                        const isParallelLaneStructure =
                            node.type === "parallelLane" ||
                            Boolean(node.data?.autoParallelLaneCompound) ||
                            node.className === "compound-in-lane";

                        if (isParallelLaneStructure) {
                            let currentNode = node;
                            const visited = new Set();

                            while (currentNode?.parentId && !visited.has(currentNode.id)) {
                                visited.add(currentNode.id);
                                const parentNode = nodes.find(
                                    (candidate) => candidate.id === currentNode.parentId
                                );

                                if (!parentNode) break;

                                if (parentNode.type === "parallel") {
                                    setSelectedNodeId(parentNode.id);
                                    setRightPanelTab("details");
                                    setActiveTab("allgemein");
                                    return;
                                }

                                currentNode = parentNode;
                            }
                        }

                        setSelectedNodeId(node.id);
                        setRightPanelTab("details");
                    }}
                    onNodeMouseEnter={(_, node) => {
                        setHoveredEditorEdgeId(null);
                        setHoveredEditorNodeId(node.id);
                    }}
                    onNodeMouseLeave={(_, node) => {
                        setHoveredEditorNodeId((current) =>
                            current === node.id ? null : current
                        );
                    }}
                    onEdgeMouseEnter={(_, edge) => {
                        setHoveredEditorNodeId(null);
                        setHoveredEditorEdgeId(edge.id);
                    }}
                    onEdgeMouseLeave={(_, edge) => {
                        setHoveredEditorEdgeId((current) =>
                            current === edge.id ? null : current
                        );
                    }}
                    onPaneClick={() => {
                        clearAllEdgeSelection();
                        setSelectedNodeId(null);
                        setRightPanelTab("datamodel");
                    }}
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
                    onlyRenderVisibleElements
                    onNodeDoubleClick={(_, node) => {
                        if (node.type === "submachine" && node.data?.src) {
                            handleOpenSubMachine(node.data.src, node.data.label);
                        }
                    }}
                    onNodeDragStart={handleNodeDragStart}
                    onNodeDrag={handleNodeDrag}
                    onNodeDragStop={handleNodeDragStop}
                >
                    <Background />
                    <Controls />
                </ReactFlow>
            </SmartEdgeProvider>
        </>
    );
}
