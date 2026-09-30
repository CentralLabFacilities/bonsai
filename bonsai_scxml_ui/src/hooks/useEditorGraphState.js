import { useCallback, useState } from "react";
import { useEdgesState, useNodesState } from "@xyflow/react";

const createInitialDataModel = () => [
    { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
];

/**
 * Owns the editable workflow document state.
 *
 * Keep transient UI state (selection panels, hover, drag state, dialogs, etc.)
 * outside this hook. These values describe the document that is eventually
 * serialized to SCXML and therefore form one coherent state boundary.
 */
export function useEditorGraphState() {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [slotNodes, setSlotNodes, onSlotNodesChange] = useNodesState([]);
    const [slotEdges, setSlotEdges, onSlotEdgesChange] = useEdgesState([]);
    const [manualSlots, setManualSlots] = useState([]);
    const [globalDataModel, setGlobalDataModel] = useState(createInitialDataModel);
    const [inheritedGlobalDataModel, setInheritedGlobalDataModel] = useState([]);

    // Replacing a loaded workflow is one document-level operation. Keeping it
    // here prevents import/open paths from coordinating seven independent
    // setters and gives us a single seam for a future reducer/Rust document
    // store without changing callers again.
    const replaceDocument = useCallback((nextDocument = {}) => {
        setNodes(nextDocument.nodes || []);
        setEdges(nextDocument.edges || []);
        setSlotNodes(nextDocument.slotNodes || []);
        setSlotEdges(nextDocument.slotEdges || []);
        setManualSlots(nextDocument.manualSlots || []);
        setGlobalDataModel(
            nextDocument.globalDataModel || createInitialDataModel()
        );
        setInheritedGlobalDataModel(
            nextDocument.inheritedGlobalDataModel || []
        );
    }, [
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
    ]);

    return {
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
    };
}
