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

const HISTORY_NODE_VOLATILE_KEYS = new Set([
    "selected",
    "dragging",
    "measured",
]);
const HISTORY_EDGE_VOLATILE_KEYS = new Set(["selected"]);

const historyValueEqual = (a, b, ignoredKeys = null) => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") {
        return false;
    }

    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);
    if (aIsArray !== bIsArray) return false;

    if (aIsArray) {
        if (a.length !== b.length) return false;
        for (let index = 0; index < a.length; index += 1) {
            if (!historyValueEqual(a[index], b[index])) return false;
        }
        return true;
    }

    const aKeys = Object.keys(a).filter((key) => !ignoredKeys?.has(key));
    const bKeys = Object.keys(b).filter((key) => !ignoredKeys?.has(key));
    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        if (!historyValueEqual(a[key], b[key])) return false;
    }
    return true;
};

const sanitizeNodeForHistory = (node) => {
    const copy = cloneGraphValue(node);
    HISTORY_NODE_VOLATILE_KEYS.forEach((key) => delete copy[key]);
    return copy;
};

const sanitizeEdgeForHistory = (edge) => {
    const copy = cloneGraphValue(edge);
    HISTORY_EDGE_VOLATILE_KEYS.forEach((key) => delete copy[key]);
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

const collectionsEqualByIdentity = (a = [], b = []) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
    }
    return true;
};

const snapshotsEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
        a.nodes === b.nodes &&
        a.edges === b.edges &&
        a.slotNodes === b.slotNodes &&
        a.slotEdges === b.slotEdges &&
        a.manualSlots === b.manualSlots &&
        a.globalDataModel === b.globalDataModel
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

    // History used to deep-clone the complete graph, JSON.stringify it, and
    // deep-clone it a second time for every commit. Large state machines pay
    // that cost even if only one node changed. These caches canonicalize the
    // history representation per node/edge and let snapshots structurally
    // share every unchanged object with previous entries. The snapshot objects
    // are detached clones and are never mutated; undo/redo clones only when a
    // snapshot is actually restored.
    const nodeHistoryCacheRef = useRef(new Map());
    const edgeHistoryCacheRef = useRef(new Map());
    const slotNodeHistoryCacheRef = useRef(new Map());
    const slotEdgeHistoryCacheRef = useRef(new Map());
    const manualSlotsHistoryCacheRef = useRef({ source: null, snapshot: [] });
    const dataModelHistoryCacheRef = useRef({ source: null, snapshot: [] });
    const lastCreatedSnapshotRef = useRef(null);

    liveHistoryStateRef.current = {
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
    };

    const resetSnapshotCaches = useCallback(() => {
        nodeHistoryCacheRef.current = new Map();
        edgeHistoryCacheRef.current = new Map();
        slotNodeHistoryCacheRef.current = new Map();
        slotEdgeHistoryCacheRef.current = new Map();
        manualSlotsHistoryCacheRef.current = { source: null, snapshot: [] };
        dataModelHistoryCacheRef.current = { source: null, snapshot: [] };
        lastCreatedSnapshotRef.current = null;
    }, []);

    const canonicalizeGraphCollection = useCallback((
        sourceItems,
        cacheRef,
        sanitize,
        ignoredKeys,
        previousCollection
    ) => {
        const cache = cacheRef.current;
        const seenIds = new Set();
        const canonicalItems = (sourceItems || []).map((item, index) => {
            const cacheKey = item?.id ?? `__index_${index}`;
            seenIds.add(cacheKey);
            const cached = cache.get(cacheKey);

            if (cached?.source === item) return cached.snapshot;

            if (
                cached &&
                historyValueEqual(cached.source, item, ignoredKeys)
            ) {
                // React Flow frequently replaces a node/edge object only to
                // change selection state. Keep the already-sanitized history
                // object in that case so selection/hover cannot create a new
                // history snapshot or duplicate large graph data.
                cached.source = item;
                return cached.snapshot;
            }

            const snapshot = sanitize(item);
            cache.set(cacheKey, { source: item, snapshot });
            return snapshot;
        });

        // Prevent deleted graph objects from being retained forever by the
        // canonicalization cache.
        for (const cacheKey of cache.keys()) {
            if (!seenIds.has(cacheKey)) cache.delete(cacheKey);
        }

        return collectionsEqualByIdentity(previousCollection, canonicalItems)
            ? previousCollection
            : canonicalItems;
    }, []);

    const canonicalizeValueCollection = useCallback((source, cacheRef) => {
        const normalizedSource = source || [];
        const cached = cacheRef.current;
        if (cached.source === normalizedSource) return cached.snapshot;

        if (
            cached.source &&
            historyValueEqual(cached.source, normalizedSource)
        ) {
            cached.source = normalizedSource;
            return cached.snapshot;
        }

        const snapshot = cloneGraphValue(normalizedSource);
        cacheRef.current = { source: normalizedSource, snapshot };
        return snapshot;
    }, []);

    const createHistorySnapshot = useCallback(() => {
        const current = liveHistoryStateRef.current || {};
        const previous = lastCreatedSnapshotRef.current || {};

        const snapshot = {
            nodes: canonicalizeGraphCollection(
                current.nodes || [],
                nodeHistoryCacheRef,
                sanitizeNodeForHistory,
                HISTORY_NODE_VOLATILE_KEYS,
                previous.nodes
            ),
            edges: canonicalizeGraphCollection(
                current.edges || [],
                edgeHistoryCacheRef,
                sanitizeEdgeForHistory,
                HISTORY_EDGE_VOLATILE_KEYS,
                previous.edges
            ),
            slotNodes: canonicalizeGraphCollection(
                current.slotNodes || [],
                slotNodeHistoryCacheRef,
                sanitizeNodeForHistory,
                HISTORY_NODE_VOLATILE_KEYS,
                previous.slotNodes
            ),
            slotEdges: canonicalizeGraphCollection(
                current.slotEdges || [],
                slotEdgeHistoryCacheRef,
                sanitizeEdgeForHistory,
                HISTORY_EDGE_VOLATILE_KEYS,
                previous.slotEdges
            ),
            manualSlots: canonicalizeValueCollection(
                current.manualSlots || [],
                manualSlotsHistoryCacheRef
            ),
            globalDataModel: canonicalizeValueCollection(
                current.globalDataModel || [],
                dataModelHistoryCacheRef
            ),
        };

        if (snapshotsEqual(previous, snapshot)) return previous;
        lastCreatedSnapshotRef.current = snapshot;
        return snapshot;
    }, [canonicalizeGraphCollection, canonicalizeValueCollection]);

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
        const currentEntry = historyRef.current[historyIndexRef.current];
        if (snapshotsEqual(currentEntry?.snapshot, snapshot)) return false;

        const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        // Snapshot data is already detached from live React state and uses
        // structural sharing. Do not clone it again here.
        nextHistory.push({ snapshot });
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
            resetSnapshotCaches();
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
        resetSnapshotCaches,
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

    const flushPendingHistorySnapshot = useCallback(() => {
        // Only flush a snapshot when the normal debounced history writer still
        // has an edit waiting to be committed. Re-committing on every undo can
        // add the just-restored state back to the history and trap Ctrl+Z on a
        // single entry.
        if (!historyTimerRef.current) return false;

        clearTimeout(historyTimerRef.current);
        historyTimerRef.current = null;
        return commitHistorySnapshot(createHistorySnapshot());
    }, [commitHistorySnapshot, createHistorySnapshot]);

    const undo = useCallback(() => {
        flushPendingHistorySnapshot();
        if (historyIndexRef.current <= 0) return false;
        historyIndexRef.current -= 1;
        applyHistorySnapshot(historyRef.current[historyIndexRef.current]?.snapshot);
        return true;
    }, [applyHistorySnapshot, flushPendingHistorySnapshot]);

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
