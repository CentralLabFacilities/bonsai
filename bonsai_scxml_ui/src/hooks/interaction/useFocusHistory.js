import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEditorModalOpen } from "./useGlobalEditorShortcuts";

const sameFocus = (a, b) =>
    Boolean(
        a &&
        b &&
        a.tabId === b.tabId &&
        (a.nodeId || null) === (b.nodeId || null)
    );

function findNavigableFocusIndex(entries, availableTabIds, startIndex, direction) {
    let index = startIndex;
    while (index >= 0 && index < entries.length) {
        if (availableTabIds.has(entries[index]?.tabId)) return index;
        index += direction;
    }
    return -1;
}

export function useFocusHistory({
    activeTabId,
    selectedNodeId,
    tabs,
    switchTab,
    setNodes,
    setSlotNodes,
    setSelectedNodeId,
    setRightPanelTab,
    fitView,
}) {
    const [historyState, setHistoryState] = useState(() => ({
        entries: [],
        index: -1,
    }));
    const historyStateRef = useRef(historyState);
    const restoringRef = useRef(null);
    const restoreTimeoutRef = useRef(null);
    const recordTimeoutRef = useRef(null);
    const lastObservedTabRef = useRef(activeTabId);

    const publishHistoryState = useCallback((nextState) => {
        historyStateRef.current = nextState;
        setHistoryState(nextState);
    }, []);

    const commitFocus = useCallback((focus) => {
        if (!focus?.tabId) return;

        const currentState = historyStateRef.current;
        const currentHistory = currentState.entries;
        const currentIndex = currentState.index;
        const current = currentHistory[currentIndex] || null;

        if (sameFocus(current, focus)) return;

        const nextHistory = currentHistory.slice(0, currentIndex + 1);
        nextHistory.push(focus);

        // Keep navigation history bounded. This is editor navigation state,
        // not document history, so an unbounded list only wastes memory.
        const boundedHistory = nextHistory.slice(-200);
        const nextIndex = boundedHistory.length - 1;

        publishHistoryState({ entries: boundedHistory, index: nextIndex });
    }, [publishHistoryState]);

    useEffect(() => {
        if (!activeTabId) return;

        const target = restoringRef.current;
        if (target) {
            if (
                activeTabId === target.tabId &&
                (selectedNodeId || null) === (target.nodeId || null)
            ) {
                restoringRef.current = null;
            }
            lastObservedTabRef.current = activeTabId;
            return;
        }

        const tabChanged = lastObservedTabRef.current !== activeTabId;
        lastObservedTabRef.current = activeTabId;

        // Clearing a selection inside the same workflow is not a useful focus
        // destination. A tab change is useful even before a node is selected.
        if (!selectedNodeId && !tabChanged && historyStateRef.current.entries.length > 0) {
            return;
        }

        if (recordTimeoutRef.current !== null) {
            clearTimeout(recordTimeoutRef.current);
        }

        const nextFocus = {
            tabId: activeTabId,
            nodeId: selectedNodeId || null,
        };

        recordTimeoutRef.current = window.setTimeout(() => {
            recordTimeoutRef.current = null;
            if (restoringRef.current) return;
            commitFocus(nextFocus);
        }, 40);

        return () => {
            if (recordTimeoutRef.current !== null) {
                clearTimeout(recordTimeoutRef.current);
                recordTimeoutRef.current = null;
            }
        };
    }, [activeTabId, selectedNodeId, commitFocus]);

    useEffect(
        () => () => {
            if (restoreTimeoutRef.current !== null) {
                clearTimeout(restoreTimeoutRef.current);
            }
            if (recordTimeoutRef.current !== null) {
                clearTimeout(recordTimeoutRef.current);
            }
        },
        []
    );

    const availableTabIds = useMemo(
        () => new Set((tabs || []).map((tab) => tab.id)),
        [tabs]
    );

    const findNavigableIndex = useCallback(
        (startIndex, direction) =>
            findNavigableFocusIndex(historyStateRef.current.entries, availableTabIds, startIndex, direction),
        [availableTabIds]
    );

    const restoreFocus = useCallback(
        (targetIndex) => {
            if (isEditorModalOpen()) return false;
            const currentHistoryState = historyStateRef.current;
            const entries = currentHistoryState.entries;
            const target = entries[targetIndex];
            if (!target || !availableTabIds.has(target.tabId)) return false;

            restoringRef.current = target;
            publishHistoryState({ ...currentHistoryState, index: targetIndex });

            const selectTarget = () => {
                const nodeId = target.nodeId || null;

                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: Boolean(nodeId && node.id === nodeId),
                    }))
                );
                setSlotNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: Boolean(nodeId && node.id === nodeId),
                    }))
                );
                setSelectedNodeId(nodeId);

                if (nodeId) {
                    setRightPanelTab("details");
                    window.setTimeout(() => {
                        fitView({
                            nodes: [{ id: nodeId }],
                            padding: 0.8,
                            maxZoom: 1.2,
                            duration: 250,
                        });
                    }, 40);
                } else {
                    window.setTimeout(() => {
                        fitView({ padding: 0.2, duration: 250 });
                    }, 40);
                }
            };

            if (target.tabId !== activeTabId) {
                switchTab(target.tabId);
                restoreTimeoutRef.current = window.setTimeout(() => {
                    restoreTimeoutRef.current = null;
                    selectTarget();
                }, 80);
            } else {
                selectTarget();
            }

            // Do not remain in restoration mode forever if the referenced node
            // was deleted after the focus entry was recorded.
            window.setTimeout(() => {
                if (restoringRef.current === target) {
                    restoringRef.current = null;
                }
            }, 500);

            return true;
        },
        [
            activeTabId,
            availableTabIds,
            fitView,
            publishHistoryState,
            setNodes,
            setRightPanelTab,
            setSelectedNodeId,
            setSlotNodes,
            switchTab,
        ]
    );

    const goBack = useCallback(() => {
        const targetIndex = findNavigableIndex(
            historyStateRef.current.index - 1,
            -1
        );
        if (targetIndex < 0) return false;
        return restoreFocus(targetIndex);
    }, [findNavigableIndex, restoreFocus]);

    const goForward = useCallback(() => {
        const targetIndex = findNavigableIndex(
            historyStateRef.current.index + 1,
            1
        );
        if (targetIndex < 0) return false;
        return restoreFocus(targetIndex);
    }, [findNavigableIndex, restoreFocus]);

    const canGoBack =
        findNavigableFocusIndex(
            historyState.entries,
            availableTabIds,
            historyState.index - 1,
            -1
        ) >= 0;
    const canGoForward =
        findNavigableFocusIndex(
            historyState.entries,
            availableTabIds,
            historyState.index + 1,
            1
        ) >= 0;

    return {
        canGoBack,
        canGoForward,
        goBack,
        goForward,
    };
}
