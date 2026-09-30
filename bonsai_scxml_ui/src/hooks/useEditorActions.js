import { useEditorNodeActions } from "./editorActions/useEditorNodeActions";
import { useEditorSlotActions } from "./editorActions/useEditorSlotActions";

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

    return {
        ...nodeActions,
        ...slotActions,
    };
}
