import { useCallback, useRef, useState } from "react";
import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";

const createStatePrefixDeclaration = () => [
    { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
];

export function useEditorGraphState() {
    const [document, setDocument] = useState(() => ({
        nodes: [],
        edges: [],
        slotNodes: [],
        slotEdges: [],
        manualSlots: [],
        globalDataModel: createStatePrefixDeclaration(),
        inheritedGlobalDataModel: [],
    }));
    const documentRef = useRef(document);

    const setField = useCallback((field, valueOrUpdater) => {
        const current = documentRef.current;
        const value =
            typeof valueOrUpdater === "function" ? valueOrUpdater(current[field]) : valueOrUpdater;
        if (value === current[field]) return;
        const next = { ...current, [field]: value };
        // Publish edits before React paints them so async document actions
        // cannot approve a stale checkpoint from the previous render.
        documentRef.current = next;
        setDocument(next);
    }, []);
    const setNodes = useCallback((value) => setField("nodes", value), [setField]);
    const setEdges = useCallback((value) => setField("edges", value), [setField]);
    const setSlotNodes = useCallback((value) => setField("slotNodes", value), [setField]);
    const setSlotEdges = useCallback((value) => setField("slotEdges", value), [setField]);
    const setManualSlots = useCallback((value) => setField("manualSlots", value), [setField]);
    const setGlobalDataModel = useCallback(
        (value) => setField("globalDataModel", value),
        [setField],
    );
    const setInheritedGlobalDataModel = useCallback(
        (value) => setField("inheritedGlobalDataModel", value),
        [setField],
    );
    const onNodesChange = useCallback(
        (changes) => setNodes((nodes) => applyNodeChanges(changes, nodes)),
        [setNodes],
    );
    const onEdgesChange = useCallback(
        (changes) => setEdges((edges) => applyEdgeChanges(changes, edges)),
        [setEdges],
    );
    const onSlotNodesChange = useCallback(
        (changes) => setSlotNodes((nodes) => applyNodeChanges(changes, nodes)),
        [setSlotNodes],
    );
    const onSlotEdgesChange = useCallback(
        (changes) => setSlotEdges((edges) => applyEdgeChanges(changes, edges)),
        [setSlotEdges],
    );
    const getDocumentSnapshot = useCallback(() => documentRef.current, []);

    const replaceDocument = useCallback((nextDocument = {}) => {
        const next = {
            nodes: nextDocument.nodes || [],
            edges: nextDocument.edges || [],
            slotNodes: nextDocument.slotNodes || [],
            slotEdges: nextDocument.slotEdges || [],
            manualSlots: nextDocument.manualSlots || [],
            globalDataModel: nextDocument.globalDataModel || createStatePrefixDeclaration(),
            inheritedGlobalDataModel: nextDocument.inheritedGlobalDataModel || [],
        };
        documentRef.current = next;
        setDocument(next);
    }, []);

    return {
        ...document,
        setNodes,
        onNodesChange,
        setEdges,
        onEdgesChange,
        setSlotNodes,
        onSlotNodesChange,
        setSlotEdges,
        onSlotEdgesChange,
        setManualSlots,
        setGlobalDataModel,
        setInheritedGlobalDataModel,
        getDocumentSnapshot,
        replaceDocument,
    };
}
