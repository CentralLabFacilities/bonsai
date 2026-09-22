import { useCallback, useEffect, useRef } from "react";
import {
    growAllStateContainersToContents,
    normalizeCompoundInitialStates,
    normalizeContainerAutoExpansion,
    normalizeParallelLaneCompounds,
} from "../utils/editorGeometry";

const cloneGraphValue = (value) => {
    if (Array.isArray(value)) return value.map(cloneGraphValue);
    if (value && typeof value === "object") {
        const clone = {};
        Object.entries(value).forEach(([key, entry]) => {
            clone[key] = cloneGraphValue(entry);
        });
        return clone;
    }
    return value;
};

const sanitizeNodeForHistory = (node) => {
    const copy = cloneGraphValue(node);
    delete copy.selected;
    delete copy.dragging;
    delete copy.measured;
    return copy;
};

const sanitizeEdgeForHistory = (edge) => {
    const copy = cloneGraphValue(edge);
    delete copy.selected;
    return copy;
};

const isUndoRedoEditableTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
        target.closest(
            'input, textarea, select, [contenteditable="true"], [role="textbox"], .monaco-editor, .cm-editor'
        )
    );
};

export function useEditorHistory({
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
}) {
    const historyRef = useRef([]);
    const historyIndexRef = useRef(-1);
    const historyTimerRef = useRef(null);
    const historyTabRef = useRef(activeTabId);
    const applyingHistoryRef = useRef(false);
    const liveHistoryStateRef = useRef(null);
    liveHistoryStateRef.current = {
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
    };

    const createHistorySnapshot = useCallback(() => {
        const current = liveHistoryStateRef.current || {};
        return {
            nodes: (current.nodes || []).map(sanitizeNodeForHistory),
            edges: (current.edges || []).map(sanitizeEdgeForHistory),
            slotNodes: (current.slotNodes || []).map(sanitizeNodeForHistory),
            slotEdges: (current.slotEdges || []).map(sanitizeEdgeForHistory),
            manualSlots: cloneGraphValue(current.manualSlots || []),
            globalDataModel: cloneGraphValue(current.globalDataModel || []),
        };
    }, []);

    // Collapse all geometry churn to one dependency value while dragging.
    // The effect runs once when the drag starts and once again with the final
    // graph after drop, instead of once per pointer-driven node update.
    const historyNodesDependency = isDraggingNode ? null : nodes;
    const historyEdgesDependency = isDraggingNode ? null : edges;
    const historySlotNodesDependency = isDraggingNode ? null : slotNodes;
    const historySlotEdgesDependency = isDraggingNode ? null : slotEdges;
    const historyManualSlotsDependency = isDraggingNode ? null : manualSlots;
    const historyDataModelDependency = isDraggingNode ? null : globalDataModel;

    const commitHistorySnapshot = useCallback((snapshot) => {
        if (!snapshot) return false;
        const hash = JSON.stringify(snapshot);
        const currentEntry = historyRef.current[historyIndexRef.current];
        if (currentEntry?.hash === hash) return false;

        const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        nextHistory.push({ hash, snapshot: cloneGraphValue(snapshot) });
        if (nextHistory.length > 20) {
            nextHistory.splice(0, nextHistory.length - 20);
        }
        historyRef.current = nextHistory;
        historyIndexRef.current = nextHistory.length - 1;
        return true;
    }, []);

    useEffect(() => {
        if (isDraggingNode) {
            if (historyTimerRef.current) {
                clearTimeout(historyTimerRef.current);
                historyTimerRef.current = null;
            }
            return;
        }

        if (historyTabRef.current !== activeTabId) {
            historyTabRef.current = activeTabId;
            historyRef.current = [];
            historyIndexRef.current = -1;
            applyingHistoryRef.current = false;
            if (historyTimerRef.current) {
                clearTimeout(historyTimerRef.current);
                historyTimerRef.current = null;
            }
            commitHistorySnapshot(createHistorySnapshot());
            return;
        }

        if (applyingHistoryRef.current) {
            applyingHistoryRef.current = false;
            return;
        }

        if (historyRef.current.length === 0) {
            commitHistorySnapshot(createHistorySnapshot());
            return;
        }

        if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
        historyTimerRef.current = setTimeout(() => {
            historyTimerRef.current = null;
            commitHistorySnapshot(createHistorySnapshot());
        }, 180);

        return () => {
            if (historyTimerRef.current) {
                clearTimeout(historyTimerRef.current);
                historyTimerRef.current = null;
            }
        };
    }, [
        activeTabId,
        isDraggingNode,
        historyNodesDependency,
        historyEdgesDependency,
        historySlotNodesDependency,
        historySlotEdgesDependency,
        historyManualSlotsDependency,
        historyDataModelDependency,
        createHistorySnapshot,
        commitHistorySnapshot,
    ]);

    const applyHistorySnapshot = useCallback((snapshot) => {
        if (!snapshot) return;
        if (historyTimerRef.current) {
            clearTimeout(historyTimerRef.current);
            historyTimerRef.current = null;
        }
        applyingHistoryRef.current = true;

        const restoredNodes = normalizeCompoundInitialStates(
            growAllStateContainersToContents(
                normalizeParallelLaneCompounds(
                    normalizeContainerAutoExpansion(
                        cloneGraphValue(snapshot.nodes || []).map((node) => ({
                            ...node,
                            selected: false,
                        }))
                    )
                )
            )
        );

        setNodes(restoredNodes);
        setEdges(cloneGraphValue(snapshot.edges || []).map((edge) => ({ ...edge, selected: false })));
        setSlotNodes(cloneGraphValue(snapshot.slotNodes || []).map((node) => ({ ...node, selected: false })));
        setSlotEdges(cloneGraphValue(snapshot.slotEdges || []).map((edge) => ({ ...edge, selected: false })));
        setManualSlots(cloneGraphValue(snapshot.manualSlots || []));
        setGlobalDataModel(cloneGraphValue(snapshot.globalDataModel || []));
        setSelectedNodeId(null);
        setRightPanelTab("datamodel");

        requestAnimationFrame(() => {
            restoredNodes.forEach((node) => updateNodeInternals(node.id));
        });
    }, [
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
        setManualSlots,
        setGlobalDataModel,
        setSelectedNodeId,
        setRightPanelTab,
        updateNodeInternals,
    ]);

    const undo = useCallback(() => {
        commitHistorySnapshot(createHistorySnapshot());
        if (historyIndexRef.current <= 0) return false;
        historyIndexRef.current -= 1;
        applyHistorySnapshot(historyRef.current[historyIndexRef.current]?.snapshot);
        return true;
    }, [applyHistorySnapshot, commitHistorySnapshot, createHistorySnapshot]);

    const redo = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return false;
        historyIndexRef.current += 1;
        applyHistorySnapshot(historyRef.current[historyIndexRef.current]?.snapshot);
        return true;
    }, [applyHistorySnapshot]);

    useEffect(() => {
        const handleUndoRedoShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (activeMode === "code") return;
            if (isUndoRedoEditableTarget(event.target)) return;

            const key = String(event.key || "").toLowerCase();
            let handled = false;
            if (key === "z") handled = event.shiftKey ? redo() : undo();
            else if (key === "y" && !event.shiftKey) handled = redo();
            if (!handled) return;
            event.preventDefault();
            event.stopPropagation();
        };

        window.addEventListener("keydown", handleUndoRedoShortcut, true);
        return () => window.removeEventListener("keydown", handleUndoRedoShortcut, true);
    }, [activeMode, undo, redo]);

    return { undo, redo };
}
