import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const sameFocus = (a, b) =>
    Boolean(
        a &&
        b &&
        a.tabId === b.tabId &&
        (a.nodeId || null) === (b.nodeId || null)
    );

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
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const historyRef = useRef(history);
    const historyIndexRef = useRef(historyIndex);
    const restoringRef = useRef(null);
    const restoreTimeoutRef = useRef(null);
    const recordTimeoutRef = useRef(null);
    const lastObservedTabRef = useRef(activeTabId);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    useEffect(() => {
        historyIndexRef.current = historyIndex;
    }, [historyIndex]);

    const commitFocus = useCallback((focus) => {
        if (!focus?.tabId) return;

        const currentHistory = historyRef.current;
        const currentIndex = historyIndexRef.current;
        const current = currentHistory[currentIndex] || null;

        if (sameFocus(current, focus)) return;

        const nextHistory = currentHistory.slice(0, currentIndex + 1);
        nextHistory.push(focus);

        // Keep navigation history bounded. This is editor navigation state,
        // not document history, so an unbounded list only wastes memory.
        const boundedHistory = nextHistory.slice(-200);
        const nextIndex = boundedHistory.length - 1;

        historyRef.current = boundedHistory;
        historyIndexRef.current = nextIndex;
        setHistory(boundedHistory);
        setHistoryIndex(nextIndex);
    }, []);

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
        if (!selectedNodeId && !tabChanged && historyRef.current.length > 0) {
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
        (startIndex, direction) => {
            const entries = historyRef.current;
            let index = startIndex;

            while (index >= 0 && index < entries.length) {
                if (availableTabIds.has(entries[index]?.tabId)) {
                    return index;
                }
                index += direction;
            }

            return -1;
        },
        [availableTabIds]
    );

    const restoreFocus = useCallback(
        (targetIndex) => {
            const entries = historyRef.current;
            const target = entries[targetIndex];
            if (!target || !availableTabIds.has(target.tabId)) return false;

            restoringRef.current = target;
            historyIndexRef.current = targetIndex;
            setHistoryIndex(targetIndex);

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
            setNodes,
            setRightPanelTab,
            setSelectedNodeId,
            setSlotNodes,
            switchTab,
        ]
    );

    const goBack = useCallback(() => {
        const targetIndex = findNavigableIndex(
            historyIndexRef.current - 1,
            -1
        );
        if (targetIndex < 0) return false;
        return restoreFocus(targetIndex);
    }, [findNavigableIndex, restoreFocus]);

    const goForward = useCallback(() => {
        const targetIndex = findNavigableIndex(
            historyIndexRef.current + 1,
            1
        );
        if (targetIndex < 0) return false;
        return restoreFocus(targetIndex);
    }, [findNavigableIndex, restoreFocus]);

    const canGoBack =
        findNavigableIndex(historyIndex - 1, -1) >= 0;
    const canGoForward =
        findNavigableIndex(historyIndex + 1, 1) >= 0;

    return {
        canGoBack,
        canGoForward,
        goBack,
        goForward,
    };
}
