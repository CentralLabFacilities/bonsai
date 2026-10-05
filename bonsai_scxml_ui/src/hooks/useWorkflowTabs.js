import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getWorkflowDocumentFingerprint } from "../utils/scxmlRustExport.js";
import { isEditorModalOpen } from "./useGlobalEditorShortcuts.js";
import { getWorkflowFileKey } from "../utils/workflowLoader.js";

const checkpointTab = (tab) => ({
    ...tab,
    documentGeneration: tab.documentGeneration ?? 0,
    savedFingerprint: tab.savedFingerprint ?? getWorkflowDocumentFingerprint(tab),
    isModified: false,
});

const sameDocumentInputs = (previous, next) => {
    if (
        !previous ||
        previous.manualSlots !== next.manualSlots ||
        previous.globalDataModel !== next.globalDataModel
    )
        return false;
    if (previous.nodes.length !== next.nodes.length || previous.edges.length !== next.edges.length)
        return false;
    return (
        previous.nodes.every((node, index) => {
            const other = next.nodes[index];
            return (
                node === other ||
                (node.id === other.id &&
                    node.type === other.type &&
                    node.parentId === other.parentId &&
                    node.data === other.data &&
                    node.position?.x === other.position?.x &&
                    node.position?.y === other.position?.y)
            );
        }) &&
        previous.edges.every((edge, index) => {
            const other = next.edges[index];
            return (
                edge === other ||
                (edge.id === other.id &&
                    edge.type === other.type &&
                    edge.source === other.source &&
                    edge.target === other.target &&
                    edge.sourceHandle === other.sourceHandle &&
                    edge.targetHandle === other.targetHandle &&
                    edge.label === other.label &&
                    edge.data === other.data)
            );
        })
    );
};

const createInitialTab = () =>
    checkpointTab({
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
        globalDataModel: [{ id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" }],
    });

const getTabDisplayPath = (tab) => {
    if (!tab) return "";

    return tab.filePath || tab.sourcePath || tab.fileName || "Unsaved workflow";
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
    getDocumentSnapshot,
    selectedNodeId,
    setSelectedNodeId,
    fitView,
    getViewport,
    setViewport,
    syncRustDocument,
    isDraggingNode = false,
}) {
    const [storedTabs, setTabsState] = useState(() => [createInitialTab()]);
    const tabsRef = useRef(storedTabs);
    const documentSequenceRef = useRef(0);

    const setTabs = useCallback((nextTabsOrUpdater) => {
        // Tab operations can be batched before a commit. Advance their event
        // snapshot here, not inside a React updater that may be replayed.
        const nextTabs =
            typeof nextTabsOrUpdater === "function"
                ? nextTabsOrUpdater(tabsRef.current)
                : nextTabsOrUpdater;
        tabsRef.current = nextTabs;
        setTabsState(nextTabs);
    }, []);

    const [activeTabId, setActiveTabId] = useState("tab-1");
    const [tabPathTooltip, setTabPathTooltip] = useState(null);
    const [draggedTabId, setDraggedTabId] = useState(null);

    const [lastFingerprint, setLastFingerprint] = useState(() => ({
        tabId: "tab-1",
        value: storedTabs[0].savedFingerprint,
        inputs: null,
    }));
    const projection = useMemo(() => {
        if (isDraggingNode) return null;
        const inputs = { nodes, edges, manualSlots, globalDataModel };
        // Selection and measurements replace objects without changing the file.
        return lastFingerprint.tabId === activeTabId && sameDocumentInputs(lastFingerprint.inputs, inputs)
            ? lastFingerprint
            : { tabId: activeTabId, value: getWorkflowDocumentFingerprint(inputs), inputs };
    }, [isDraggingNode, activeTabId, nodes, edges, manualSlots, globalDataModel, lastFingerprint]);
    const fingerprint = projection?.value ?? null;
    if (projection && projection !== lastFingerprint) setLastFingerprint(projection);
    const activeStoredTab = storedTabs.find((tab) => tab.id === activeTabId);
    const activeFingerprint =
        fingerprint ??
        (lastFingerprint.tabId === activeTabId
            ? lastFingerprint.value
            : activeStoredTab?.savedFingerprint);
    const activeIsModified = activeFingerprint !== activeStoredTab?.savedFingerprint;
    const tabs = useMemo(
        () =>
            storedTabs.map((tab) =>
                tab.id === activeTabId && tab.isModified !== activeIsModified
                    ? { ...tab, isModified: activeIsModified }
                    : tab,
            ),
        [storedTabs, activeTabId, activeIsModified],
    );
    const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;

    // Keep tab actions stable while nodes move. The active editor state is read
    // from a ref so tab operations do not get recreated on every drag frame.
    const activeEditorStateRef = useRef(null);
    useLayoutEffect(() => {
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
    }, [
        activeTabId,
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
        inheritedGlobalDataModel,
        selectedNodeId,
    ]);

    const getTabSnapshot = useCallback(
        (tabId = activeEditorStateRef.current?.activeTabId) => {
            const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
            if (!tab) return null;
            const current = activeEditorStateRef.current;
            const liveDocument = getDocumentSnapshot();
            const snapshot =
                current?.activeTabId === tabId
                    ? {
                          ...tab,
                          ...liveDocument,
                          selectedNodeId: current.selectedNodeId,
                      }
                    : tab;
            const currentFingerprint = getWorkflowDocumentFingerprint(snapshot);
            return {
                ...snapshot,
                fingerprint: currentFingerprint,
                isModified: currentFingerprint !== tab.savedFingerprint,
            };
        },
        [getDocumentSnapshot],
    );

    const getTabsSnapshot = useCallback(
        () => tabsRef.current.map((tab) => getTabSnapshot(tab.id)),
        [getTabSnapshot],
    );

    // Always address the originating tab. Read its live content, not the stale
    // arrays captured by an asynchronous save, before applying metadata.
    const updateTab = useCallback(
        (tabId, patchOrUpdater) => {
            let updated = false;
            setTabs((currentTabs) =>
                currentTabs.map((tab) => {
                    if (tab.id !== tabId) return tab;
                    const current = getTabSnapshot(tabId);
                    const patch =
                        typeof patchOrUpdater === "function"
                            ? patchOrUpdater(current)
                            : patchOrUpdater;
                    if (!patch) return tab;
                    const next = { ...current, ...patch };
                    next.fingerprint = getWorkflowDocumentFingerprint(next);
                    next.isModified = next.fingerprint !== next.savedFingerprint;
                    if (
                        tabId === activeEditorStateRef.current?.activeTabId &&
                        next.inheritedGlobalDataModel !== current.inheritedGlobalDataModel
                    ) {
                        activeEditorStateRef.current = {
                            ...activeEditorStateRef.current,
                            inheritedGlobalDataModel: next.inheritedGlobalDataModel,
                        };
                        replaceDocument(next);
                    }
                    updated = true;
                    return next;
                }),
            );
            return updated;
        },
        [setTabs, getTabSnapshot, replaceDocument],
    );

    const persistActiveTab = useCallback(
        (currentTabs, currentTabPatch = null) => {
            const current = activeEditorStateRef.current;
            if (!current) return currentTabs;

            let viewport = null;
            try {
                viewport = getViewport?.() || null;
            } catch {
                // React Flow can be temporarily unmounted (for example in Code
                // view). Keep the last tab viewport in that case.
            }

            return currentTabs.map((tab) => {
                if (tab.id !== current.activeTabId) return tab;
                const next = {
                    ...getTabSnapshot(tab.id),
                    selectedNodeId: current.selectedNodeId || null,
                    viewport: viewport || tab.viewport || null,
                    ...(currentTabPatch || {}),
                };
                next.fingerprint = getWorkflowDocumentFingerprint(next);
                next.isModified = next.fingerprint !== next.savedFingerprint;
                return next;
            });
        },
        [getViewport, getTabSnapshot],
    );

    const loadTabState = useCallback(
        (tab, { fit = false, fitOptions = null } = {}) => {
            if (!tab) return;
            const nextDocument = {
                nodes: tab.nodes || [],
                edges: tab.edges || [],
                slotNodes: tab.slotNodes || [],
                slotEdges: tab.slotEdges || [],
                manualSlots: tab.manualSlots || [],
                globalDataModel: tab.globalDataModel || [],
                inheritedGlobalDataModel: tab.inheritedGlobalDataModel || [],
            };
            activeEditorStateRef.current = {
                ...nextDocument,
                activeTabId: tab.id,
                selectedNodeId: tab.selectedNodeId || null,
            };
            replaceDocument(nextDocument);
            void syncRustDocument?.(nextDocument).catch((error) => {
                console.warn(
                    "Could not synchronize Rust workflow document after tab switch.",
                    error,
                );
            });

            const selectableIds = new Set([
                ...(tab.nodes || []).map((node) => node.id),
                ...(tab.slotNodes || []).map((node) => node.id),
            ]);
            const restoredSelectedNodeId =
                tab.selectedNodeId && selectableIds.has(tab.selectedNodeId)
                    ? tab.selectedNodeId
                    : [...(tab.nodes || []), ...(tab.slotNodes || [])].find((node) => node.selected)
                          ?.id || null;
            setSelectedNodeId(restoredSelectedNodeId);

            // React Flow applies node changes asynchronously. Restore the
            // viewport after the new tab has mounted/measured so switching
            // state-machine tabs returns to exactly the previous view.
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    if (activeEditorStateRef.current?.activeTabId !== tab.id) return;
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
        [replaceDocument, setSelectedNodeId, fitView, setViewport, syncRustDocument],
    );

    const replaceTabDocument = useCallback(
        (tabId, nextDocument, metadata = {}) => {
            const current = getTabSnapshot(tabId);
            if (!current) return false;
            const next = checkpointTab({
                ...current,
                ...nextDocument,
                ...metadata,
                documentGeneration: ++documentSequenceRef.current,
                savedFingerprint: getWorkflowDocumentFingerprint(nextDocument),
            });
            updateTab(tabId, next);
            if (activeEditorStateRef.current?.activeTabId === tabId)
                loadTabState(next, { fit: true });
            return true;
        },
        [getTabSnapshot, updateTab, loadTabState],
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
        [persistActiveTab, loadTabState, setTabs],
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
                originTabId = null,
                originGeneration,
                expectedFingerprint,
                fit = true,
                fitOptions = { duration: 300 },
            } = {},
        ) => {
            if (!tab?.id) return false;

            let updatedTabs = persistActiveTab(tabsRef.current);
            if (currentTabPatch) {
                const origin = getTabSnapshot(
                    originTabId || activeEditorStateRef.current?.activeTabId,
                );
                if (
                    !origin ||
                    (originGeneration !== undefined &&
                        origin.documentGeneration !== originGeneration) ||
                    (expectedFingerprint !== undefined &&
                        origin.fingerprint !== expectedFingerprint)
                )
                    return false;
                const patch =
                    typeof currentTabPatch === "function"
                        ? currentTabPatch(origin)
                        : currentTabPatch;
                if (!patch) return false;
                const next = { ...origin, ...patch };
                next.fingerprint = getWorkflowDocumentFingerprint(next);
                next.isModified = next.fingerprint !== next.savedFingerprint;
                updatedTabs = updatedTabs.map((candidate) =>
                    candidate.id === origin.id ? next : candidate,
                );
            }
            const fileKey = getWorkflowFileKey(tab.filePath);
            const existingIndex = updatedTabs.findIndex((candidate) =>
                fileKey
                    ? getWorkflowFileKey(candidate.filePath) === fileKey
                    : candidate.id === tab.id,
            );
            const nextTabs = [...updatedTabs];

            if (existingIndex >= 0) {
                // An asynchronous library load must not replace an already-open
                // workflow, especially one edited while that load was pending.
                tab = nextTabs[existingIndex];
            } else {
                if (nextTabs.some((candidate) => candidate.id === tab.id)) {
                    tab = { ...tab, id: `${tab.id}-${crypto.randomUUID().slice(0, 6)}` };
                }
                tab = checkpointTab({ ...tab, documentGeneration: ++documentSequenceRef.current });
                nextTabs.push(tab);
            }

            setTabs(nextTabs);
            setActiveTabId(tab.id);
            loadTabState(tab, { fit, fitOptions });
            return true;
        },
        [persistActiveTab, getTabSnapshot, loadTabState, setTabs],
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

    const closeTab = useCallback(
        (tabIdToClose) => {
            const currentTabs = persistActiveTab(tabsRef.current);
            if (currentTabs.length === 1 || !currentTabs.some((tab) => tab.id === tabIdToClose))
                return false;

            const remainingTabs = currentTabs.filter((tab) => tab.id !== tabIdToClose);
            setTabs(remainingTabs);

            const currentActiveTabId = activeEditorStateRef.current?.activeTabId;
            if (currentActiveTabId === tabIdToClose) {
                const fallbackTab = remainingTabs[remainingTabs.length - 1];
                setActiveTabId(fallbackTab.id);
                loadTabState(fallbackTab);
            }
            return true;
        },
        [persistActiveTab, loadTabState, setTabs],
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
                const sourceIndex = currentTabs.findIndex((tab) => tab.id === draggedTabId);
                const targetIndex = currentTabs.findIndex((tab) => tab.id === targetTabId);
                if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
                    return currentTabs;
                }

                const reorderedTabs = [...currentTabs];
                const [movedTab] = reorderedTabs.splice(sourceIndex, 1);
                reorderedTabs.splice(targetIndex, 0, movedTab);
                return reorderedTabs;
            });
        },
        [draggedTabId, setTabs],
    );

    const handleTabDragEnd = useCallback(() => setDraggedTabId(null), []);

    const handleTabMouseEnter = useCallback((event, tab) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipWidth = 320;
        const gap = 8;
        const viewportPadding = 8;

        let left = rect.left;
        if (left + tooltipWidth > window.innerWidth - viewportPadding) {
            left = Math.max(viewportPadding, window.innerWidth - tooltipWidth - viewportPadding);
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
            if (event.defaultPrevented || isEditorModalOpen()) return;
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
                currentTabs.findIndex((tab) => tab.id === currentTabId),
            );
            const direction = event.shiftKey ? -1 : 1;
            const nextIndex = (currentIndex + direction + currentTabs.length) % currentTabs.length;

            switchTab(currentTabs[nextIndex].id);
        };

        window.addEventListener("keydown", handleTabShortcut, true);
        return () => window.removeEventListener("keydown", handleTabShortcut, true);
    }, [tabs, switchTab]);

    return {
        tabs,
        activeTabId,
        activeTab,
        getTabSnapshot,
        getTabsSnapshot,
        updateTab,
        replaceTabDocument,
        tabPathTooltip,
        draggedTabId,
        switchTab,
        openTab,
        handleAddNewTab,
        closeTab,
        handleTabDragStart,
        handleTabDragOver,
        handleTabDragEnd,
        handleTabMouseEnter,
        handleTabMouseLeave,
    };
}
