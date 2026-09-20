import { useCallback, useRef, useState } from "react";

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
    globalDataModel: [
        { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
    ],
});

export function useWorkflowTabs({
    nodes,
    edges,
    slotNodes,
    slotEdges,
    manualSlots,
    globalDataModel,
    inheritedGlobalDataModel,
    setNodes,
    setEdges,
    setSlotNodes,
    setSlotEdges,
    setManualSlots,
    setGlobalDataModel,
    setInheritedGlobalDataModel,
    setSelectedNodeId,
    fitView,
}) {
    const [tabs, setTabs] = useState([createInitialTab()]);
    const [activeTabId, setActiveTabId] = useState("tab-1");
    const [tabPathTooltip, setTabPathTooltip] = useState(null);
    const [draggedTabId, setDraggedTabId] = useState(null);

    // Keep tab actions stable while nodes move. The old persist callback
    // captured the complete graph arrays, which recreated switch/add-tab
    // handlers on every drag frame and cascaded into global shortcut effects.
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
    };

    const persistActiveTab = useCallback((currentTabs) => {
        const current = activeEditorStateRef.current;
        if (!current) return currentTabs;

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
                }
                : tab
        );
    }, []);

    const loadTabState = useCallback(
        (tab, { fit = false } = {}) => {
            if (!tab) return;
            setNodes(tab.nodes || []);
            setEdges(tab.edges || []);
            setSlotNodes(tab.slotNodes || []);
            setSlotEdges(tab.slotEdges || []);
            setManualSlots(tab.manualSlots || []);
            setGlobalDataModel(tab.globalDataModel || []);
            setInheritedGlobalDataModel(tab.inheritedGlobalDataModel || []);
            setSelectedNodeId(null);

            if (fit) {
                window.setTimeout(
                    () => fitView({ padding: 0.2, duration: 250 }),
                    50
                );
            }
        },
        [
            setNodes,
            setEdges,
            setSlotNodes,
            setSlotEdges,
            setManualSlots,
            setGlobalDataModel,
            setInheritedGlobalDataModel,
            setSelectedNodeId,
            fitView,
        ]
    );

    const switchTab = useCallback(
        (targetTabId) => {
            if (targetTabId === activeTabId) return;

            const updatedTabs = persistActiveTab(tabs);
            const targetTab = updatedTabs.find((tab) => tab.id === targetTabId);
            if (!targetTab) return;

            setTabs(updatedTabs);
            setActiveTabId(targetTabId);
            loadTabState(targetTab, { fit: true });
        }, [activeTabId, tabs, persistActiveTab, loadTabState]
    );

    const handleAddNewTab = useCallback(() => {
        const updatedCurrent = persistActiveTab(tabs);
        const newId = `tab-${crypto.randomUUID().slice(0, 6)}`;
        const newTabObj = {
            id: newId,
            title: `Workflow ${tabs.length + 1}`,
            fileName: `Workflow_${tabs.length + 1}.xml`,
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
        };

        setTabs([...updatedCurrent, newTabObj]);
        setActiveTabId(newId);
        loadTabState(newTabObj);
    }, [tabs, persistActiveTab, loadTabState]);

    const handleCloseTab = useCallback(
        (tabIdToClose, event = null) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            if (tabs.length === 1) return;

            const remainingTabs = tabs.filter((tab) => tab.id !== tabIdToClose);
            setTabs(remainingTabs);

            if (activeTabId === tabIdToClose) {
                const fallbackTab = remainingTabs[remainingTabs.length - 1];
                setActiveTabId(fallbackTab.id);
                loadTabState(fallbackTab);
            }
        },
        [tabs, activeTabId, loadTabState]
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

    return {
        tabs,
        setTabs,
        activeTabId,
        setActiveTabId,
        tabPathTooltip,
        setTabPathTooltip,
        draggedTabId,
        switchTab,
        handleAddNewTab,
        handleCloseTab,
        handleTabDragStart,
        handleTabDragOver,
        handleTabDragEnd,
        handleTabMiddleMouseDown,
    };
}
