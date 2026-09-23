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
    selectedNodes,
    contextMenu,
    handleSelectAction,
    canCreateEditorClone,
    setIsCreateSlotModalOpen,
    isDraggingNode,
    isOverTrash,
    handleNodesChange,
    handleVisibleEdgesChange,
    onSelectionChange,
    onConnect,
    handleConnectStart,
    handleConnectEnd,
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
                        {selectedNodes.length > 0
                            ? `change ${selectedNodes.length} node(s) in:`
                            : "Create new element"}
                    </div>
                    {canCreateEditorClone && (
                        <button
                            className="context-menu-item"
                            onClick={() => handleSelectAction("clone")}
                        >
                            Clone Selected State
                        </button>
                    )}
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("compound")}
                    >
                        Compound State
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("parallel")}
                    >
                        Parallel State
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("submachine")}
                    >
                        Sub-State-Machine
                    </button>
                    {(activeMode === "slots" || activeMode === "overview") && (
                        <button
                            className="context-menu-item"
                            onClick={() => handleSelectAction("slot")}
                        >
                            Slot
                        </button>
                    )}
                </div>
            )}

            <SmartEdgeProvider nodes={smartRoutingNodes}>
                <ReactFlow
                    className={
                        !showTransitionEdges || activeMode === "slots"
                            ? "editor-transitions-context-only"
                            : undefined
                    }
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleVisibleEdgesChange}
                    onSelectionChange={onSelectionChange}
                    onConnect={onConnect}
                    onConnectStart={handleConnectStart}
                    onConnectEnd={handleConnectEnd}
                    isValidConnection={isValidConnection}
                    connectionMode={ConnectionMode.Loose}
                    multiSelectionKeyCode={["Control", "Meta"]}
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
                    multiSelectionKeyCode={["Control", "Meta"]}
                    selectionKeyCode={["Control", "Meta"]}
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
