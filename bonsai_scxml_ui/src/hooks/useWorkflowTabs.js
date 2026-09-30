import { useCallback, useEffect, useRef, useState } from "react";

const createInitialTab = () => ({
    id: "tab-1",
    title: "Workflow 1",
    fileName: "Workflow_1.xml",
    fileHandle: null,
    filePath: null,
    nodes: [],
    edges: [],
    slotNodes: [],
    slotEdges: [],
    manualSlots: [],
    parentTabId: null,
    selectedNodeId: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    globalDataModel: [
        { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
    ],
});

const getTabDisplayPath = (tab) => {
    if (!tab) return "";

    return (
        tab.filePath ||
        tab.sourcePath ||
        tab.fileName ||
        "Unsaved workflow"
    );
};

export function useWorkflowTabs({
    nodes,
    edges,
    slotNodes,
    slotEdges,
    manualSlots,
    globalDataModel,
    inheritedGlobalDataModel,
    replaceDocument,
    selectedNodeId,
    setSelectedNodeId,
    fitView,
    getViewport,
    setViewport,
}) {
    const [tabs, setTabsState] = useState([createInitialTab()]);
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;

    const setTabs = useCallback((nextTabsOrUpdater) => {
        setTabsState((currentTabs) => {
            const nextTabs =
                typeof nextTabsOrUpdater === "function"
                    ? nextTabsOrUpdater(currentTabs)
                    : nextTabsOrUpdater;
            tabsRef.current = nextTabs;
            return nextTabs;
        });
    }, []);

    const [activeTabId, setActiveTabId] = useState("tab-1");
    const [tabPathTooltip, setTabPathTooltip] = useState(null);
    const [draggedTabId, setDraggedTabId] = useState(null);

    const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;

    // File/document controllers should update tab metadata through one stable
    // operation rather than reaching into setTabs themselves. The updater can
    // be either a partial object or a function of the current active tab.
    const updateActiveTab = useCallback((patchOrUpdater) => {
        const currentActiveTabId = activeEditorStateRef.current?.activeTabId;
        if (!currentActiveTabId) return;

        setTabs((currentTabs) =>
            currentTabs.map((tab) => {
                if (tab.id !== currentActiveTabId) return tab;
                const patch =
                    typeof patchOrUpdater === "function"
                        ? patchOrUpdater(tab)
                        : patchOrUpdater;
                return patch ? { ...tab, ...patch } : tab;
            })
        );
    }, [setTabs]);

    // Keep tab actions stable while nodes move. The active editor state is read
    // from a ref so tab operations do not get recreated on every drag frame.
    const activeEditorStateRef = useRef(null);
    activeEditorStateRef.current = {
        activeTabId,
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
        inheritedGlobalDataModel,
        selectedNodeId,
    };

    const persistActiveTab = useCallback((currentTabs, currentTabPatch = null) => {
        const current = activeEditorStateRef.current;
        if (!current) return currentTabs;

        let viewport = null;
        try {
            viewport = getViewport?.() || null;
        } catch {
            // React Flow can be temporarily unmounted (for example in Code
            // view). Keep the last tab viewport in that case.
        }

        return currentTabs.map((tab) =>
            tab.id === current.activeTabId
                ? {
                    ...tab,
                    nodes: current.nodes,
                    edges: current.edges,
                    slotNodes: current.slotNodes,
                    slotEdges: current.slotEdges,
                    manualSlots: current.manualSlots,
                    globalDataModel: current.globalDataModel,
                    inheritedGlobalDataModel: current.inheritedGlobalDataModel,
                    selectedNodeId: current.selectedNodeId || null,
                    viewport: viewport || tab.viewport || null,
                    ...(currentTabPatch || {}),
                }
                : tab
        );
    }, [getViewport]);

    const loadTabState = useCallback(
        (tab, { fit = false, fitOptions = null } = {}) => {
            if (!tab) return;
            replaceDocument({
                nodes: tab.nodes || [],
                edges: tab.edges || [],
                slotNodes: tab.slotNodes || [],
                slotEdges: tab.slotEdges || [],
                manualSlots: tab.manualSlots || [],
                globalDataModel: tab.globalDataModel || [],
                inheritedGlobalDataModel: tab.inheritedGlobalDataModel || [],
            });

            const selectableIds = new Set([
                ...(tab.nodes || []).map((node) => node.id),
                ...(tab.slotNodes || []).map((node) => node.id),
            ]);
            const restoredSelectedNodeId =
                tab.selectedNodeId && selectableIds.has(tab.selectedNodeId)
                    ? tab.selectedNodeId
                    : [
                        ...(tab.nodes || []),
                        ...(tab.slotNodes || []),
                    ].find((node) => node.selected)?.id || null;
            setSelectedNodeId(restoredSelectedNodeId);

            // React Flow applies node changes asynchronously. Restore the
            // viewport after the new tab has mounted/measured so switching
            // state-machine tabs returns to exactly the previous view.
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    if (tab.viewport && setViewport) {
                        setViewport(tab.viewport, { duration: 0 });
                        return;
                    }

                    if (fit) {
                        fitView({
                            padding: 0.2,
                            duration: 250,
                            ...(fitOptions || {}),
                        });
                    }
                });
            });
        },
        [
            replaceDocument,
            setSelectedNodeId,
            fitView,
            setViewport,
        ]
    );

    const switchTab = useCallback(
        (targetTabId) => {
            if (targetTabId === activeEditorStateRef.current?.activeTabId) return;

            const updatedTabs = persistActiveTab(tabsRef.current);
            const targetTab = updatedTabs.find((tab) => tab.id === targetTabId);
            if (!targetTab) return;

            setTabs(updatedTabs);
            setActiveTabId(targetTabId);
            loadTabState(targetTab, { fit: !targetTab.viewport });
        },
        [persistActiveTab, loadTabState, setTabs]
    );

    // Central entry point for opening a newly loaded/created workflow. The
    // current tab is persisted first and can be patched with semantic changes
    // that happened immediately before entering the child (for example adding
    // the new Sub-SM node or syncing its discovered exit tokens).
    const openTab = useCallback(
        (
            tab,
            {
                currentTabPatch = null,
                fit = true,
                fitOptions = { duration: 300 },
            } = {}
        ) => {
            if (!tab?.id) return false;

            const updatedTabs = persistActiveTab(
                tabsRef.current,
                currentTabPatch
            );
            const existingIndex = updatedTabs.findIndex(
                (candidate) => candidate.id === tab.id
            );
            const nextTabs = [...updatedTabs];

            if (existingIndex >= 0) {
                nextTabs[existingIndex] = tab;
            } else {
                nextTabs.push(tab);
            }

            setTabs(nextTabs);
            setActiveTabId(tab.id);
            loadTabState(tab, { fit, fitOptions });
            return true;
        },
        [persistActiveTab, loadTabState, setTabs]
    );

    const handleAddNewTab = useCallback(() => {
        const currentTabs = tabsRef.current;
        const newId = `tab-${crypto.randomUUID().slice(0, 6)}`;
        const newTabObj = {
            id: newId,
            title: `Workflow ${currentTabs.length + 1}`,
            fileName: `Workflow_${currentTabs.length + 1}.xml`,
            fileHandle: null,
            filePath: null,
            nodes: [],
            edges: [],
            slotNodes: [],
            slotEdges: [],
            manualSlots: [],
            parentTabId: null,
            inheritedGlobalDataModel: [],
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
            selectedNodeId: null,
            viewport: { x: 0, y: 0, zoom: 1 },
        };

        openTab(newTabObj, { fit: false });
    }, [openTab]);

    const handleCloseTab = useCallback(
        (tabIdToClose, event = null) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();

            const currentTabs = tabsRef.current;
            if (currentTabs.length === 1) return;

            const remainingTabs = currentTabs.filter(
                (tab) => tab.id !== tabIdToClose
            );
            setTabs(remainingTabs);

            const currentActiveTabId = activeEditorStateRef.current?.activeTabId;
            if (currentActiveTabId === tabIdToClose) {
                const fallbackTab = remainingTabs[remainingTabs.length - 1];
                setActiveTabId(fallbackTab.id);
                loadTabState(fallbackTab);
            }
        },
        [loadTabState, setTabs]
    );

    const handleTabDragStart = useCallback((event, tabId) => {
        setDraggedTabId(tabId);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", tabId);
        }
    }, []);

    const handleTabDragOver = useCallback(
        (event, targetTabId) => {
            event.preventDefault();
            if (!draggedTabId || draggedTabId === targetTabId) return;

            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }

            setTabs((currentTabs) => {
                const sourceIndex = currentTabs.findIndex(
                    (tab) => tab.id === draggedTabId
                );
                const targetIndex = currentTabs.findIndex(
                    (tab) => tab.id === targetTabId
                );
                if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
                    return currentTabs;
                }

                const reorderedTabs = [...currentTabs];
                const [movedTab] = reorderedTabs.splice(sourceIndex, 1);
                reorderedTabs.splice(targetIndex, 0, movedTab);
                return reorderedTabs;
            });
        },
        [draggedTabId]
    );

    const handleTabDragEnd = useCallback(() => setDraggedTabId(null), []);

    const handleTabMiddleMouseDown = useCallback(
        (event, tabId) => {
            if (event.button !== 1) return;
            event.preventDefault();
            event.stopPropagation();
            handleCloseTab(tabId, event);
        },
        [handleCloseTab]
    );

    const handleTabMouseEnter = useCallback((event, tab) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipWidth = 320;
        const gap = 8;
        const viewportPadding = 8;

        let left = rect.left;
        if (left + tooltipWidth > window.innerWidth - viewportPadding) {
            left = Math.max(
                viewportPadding,
                window.innerWidth - tooltipWidth - viewportPadding
            );
        }

        setTabPathTooltip({
            path: getTabDisplayPath(tab),
            left,
            top: rect.bottom + gap,
        });
    }, []);

    const handleTabMouseLeave = useCallback(() => {
        setTabPathTooltip(null);
    }, []);

    // IDE-style workflow navigation: Ctrl+Tab cycles open workflows and Shift
    // reverses direction. Keeping this here makes tab lifecycle/shortcuts one
    // responsibility instead of leaking tab internals back into App.jsx.
    useEffect(() => {
        const handleTabShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

            const isTabShortcut =
                String(event.key || "").toLowerCase() === "tab" ||
                event.code === "Tab" ||
                event.keyCode === 9;
            if (!isTabShortcut) return;

            const currentTabs = tabs;
            if (currentTabs.length <= 1) return;

            event.preventDefault();
            event.stopPropagation();

            const currentTabId = activeEditorStateRef.current?.activeTabId;
            const currentIndex = Math.max(
                0,
                currentTabs.findIndex((tab) => tab.id === currentTabId)
            );
            const direction = event.shiftKey ? -1 : 1;
            const nextIndex =
                (currentIndex + direction + currentTabs.length) % currentTabs.length;

            switchTab(currentTabs[nextIndex].id);
        };

        window.addEventListener("keydown", handleTabShortcut, true);
        return () => window.removeEventListener("keydown", handleTabShortcut, true);
    }, [tabs, switchTab]);

    return {
        tabs,
        setTabs,
        activeTabId,
        activeTab,
        updateActiveTab,
        tabPathTooltip,
        draggedTabId,
        switchTab,
        openTab,
        handleAddNewTab,
        handleCloseTab,
        handleTabDragStart,
        handleTabDragOver,
        handleTabDragEnd,
        handleTabMiddleMouseDown,
        handleTabMouseEnter,
        handleTabMouseLeave,
    };
}
