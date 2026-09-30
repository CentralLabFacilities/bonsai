import { useEditorNodeActions } from "./editorActions/useEditorNodeActions";
import { useEditorSlotActions } from "./editorActions/useEditorSlotActions";
import { useEditorTransitionActions } from "./editorActions/useEditorTransitionActions";

/**
 * Public action facade used by App.jsx. Domain-specific action groups stay in
 * separate modules, while callers get one stable interface.
 */
export function useEditorActions(options) {
    const nodeActions = useEditorNodeActions({
        nodes: options.nodes,
        slotNodes: options.slotNodes,
        setNodes: options.setNodes,
        setSlotNodes: options.setSlotNodes,
        setSelectedNodeId: options.setSelectedNodeId,
        setRightPanelTab: options.setRightPanelTab,
        setActiveTab: options.setActiveTab,
    });

    const slotActions = useEditorSlotActions({
        nodes: options.nodes,
        slotNodes: options.slotNodes,
        manualSlots: options.manualSlots,
        setNodes: options.setNodes,
        setManualSlots: options.setManualSlots,
        setSelectedNodeId: options.setSelectedNodeId,
        checkSlotConnection: options.checkSlotConnection,
    });

    const transitionActions = useEditorTransitionActions({
        nodes: options.nodes,
        edges: options.edges,
        slotNodes: options.slotNodes,
        selectedNodeId: options.selectedNodeId,
        setNodes: options.setNodes,
        setEdges: options.setEdges,
        setSlotNodes: options.setSlotNodes,
        setSlotEdges: options.setSlotEdges,
        setSelectedNodeId: options.setSelectedNodeId,
        updateNodeInternals: options.updateNodeInternals,
    });

    return {
        ...nodeActions,
        ...slotActions,
        ...transitionActions,
    };
}
