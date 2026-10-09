import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function isDocumentGuardOpen() {
    return typeof document !== "undefined" && Boolean(document.querySelector("[data-workflow-document-guard]"));
}

export function isEditorModalOpen() {
    return typeof document !== "undefined" && Boolean(document.querySelector(
        '[data-workflow-document-guard], dialog[open], [aria-modal="true"]',
    ));
}

export function isEditorShortcutBlocked(event) {
    return isEditorModalOpen() || Boolean(event.target?.closest?.("[data-editor-shortcut-scope]"));
}

const isTypingTarget = (target) => {
    if (!(target instanceof Element)) return false;

    return Boolean(
        target.closest(
            'input, textarea, select, [contenteditable="true"], .monaco-editor, .cm-editor'
        )
    );
};

export function useGlobalEditorShortcuts({
    activeMode,
    setActiveMode,
    activeTabId,
    contextMenu,
    setContextMenu,
    isDrawerOpen,
    setDrawerData,
    isCreateSlotModalOpen,
    setIsCreateSlotModalOpen,
    isFindOpen,
    setIsFindOpen,
    nodes,
    slotNodes,
    fitView,
    clearAllEdgeSelection,
    clearEditorNodeSelection,
    handleAddNewTab,
    handleCloseTab,
    canGoFocusBack,
    canGoFocusForward,
    goFocusBack,
    goFocusForward,
}) {
    const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
    const liveStateRef = useRef(null);

    useLayoutEffect(() => {
        liveStateRef.current = {
            activeMode,
            setActiveMode,
            activeTabId,
            contextMenu,
            setContextMenu,
            isDrawerOpen,
            setDrawerData,
            isCreateSlotModalOpen,
            setIsCreateSlotModalOpen,
            isFindOpen,
            setIsFindOpen,
            isShortcutHelpOpen,
            setIsShortcutHelpOpen,
            nodes,
            slotNodes,
            fitView,
            clearAllEdgeSelection,
            clearEditorNodeSelection,
            handleAddNewTab,
            handleCloseTab,
            canGoFocusBack,
            canGoFocusForward,
            goFocusBack,
            goFocusForward,
        };
    }, [
        activeMode, setActiveMode, activeTabId, contextMenu, setContextMenu,
        isDrawerOpen, setDrawerData, isCreateSlotModalOpen, setIsCreateSlotModalOpen,
        isFindOpen, setIsFindOpen, isShortcutHelpOpen, nodes, slotNodes, fitView,
        clearAllEdgeSelection, clearEditorNodeSelection, handleAddNewTab, handleCloseTab,
        canGoFocusBack, canGoFocusForward, goFocusBack, goFocusForward,
    ]);

    useEffect(() => {
        const handleGlobalShortcut = (event) => {
            if (event.defaultPrevented || isEditorShortcutBlocked(event)) return;
            const live = liveStateRef.current;
            if (!live) return;

            const clearGraphSelection = () => {
                live.clearEditorNodeSelection();
                live.clearAllEdgeSelection();
            };

            const key = String(event.key || "").toLowerCase();
            const hasModifier = event.ctrlKey || event.metaKey;

            if (
                event.altKey &&
                !hasModifier &&
                !event.shiftKey &&
                (key === "arrowleft" || key === "arrowright")
            ) {
                const canNavigate =
                    key === "arrowleft"
                        ? live.canGoFocusBack
                        : live.canGoFocusForward;

                event.preventDefault();
                if (!canNavigate) return;

                if (key === "arrowleft") {
                    live.goFocusBack();
                } else {
                    live.goFocusForward();
                }
                return;
            }

            // Escape is useful even while focus is inside the search field.
            if (key === "escape") {
                if (live.isFindOpen) {
                    event.preventDefault();
                    live.setIsFindOpen(false);
                    return;
                }

                if (live.contextMenu) {
                    event.preventDefault();
                    live.setContextMenu(null);
                    return;
                }

                if (live.isDrawerOpen) {
                    event.preventDefault();
                    live.setDrawerData((previous) => ({
                        ...previous,
                        isOpen: false,
                    }));
                    return;
                }

                if (live.isCreateSlotModalOpen) {
                    event.preventDefault();
                    live.setIsCreateSlotModalOpen(false);
                    return;
                }

                if (live.isShortcutHelpOpen) {
                    event.preventDefault();
                    live.setIsShortcutHelpOpen(false);
                    return;
                }

                if (!isTypingTarget(event.target) && live.activeMode !== "code") {
                    event.preventDefault();
                    clearGraphSelection();
                }
                return;
            }

            if (hasModifier && !event.altKey) {
                if (key === "n") {
                    event.preventDefault();
                    live.handleAddNewTab();
                    return;
                }

                if (key === "w") {
                    event.preventDefault();
                    live.handleCloseTab(live.activeTabId);
                    return;
                }

                if (key === "1") {
                    event.preventDefault();
                    live.setActiveMode("event");
                    return;
                }

                if (key === "2") {
                    event.preventDefault();
                    live.setActiveMode("slots");
                    return;
                }

                if (key === "3") {
                    event.preventDefault();
                    live.setActiveMode("overview");
                    return;
                }

                return;
            }

            if (isTypingTarget(event.target) || live.activeMode === "code") return;
            if (event.altKey || hasModifier || key !== "f") return;

            event.preventDefault();

            if (event.shiftKey) {
                const selectedIds = [
                    ...live.nodes
                        .filter((node) => node.selected)
                        .map((node) => node.id),
                    ...(
                        live.activeMode === "slots" ||
                        live.activeMode === "overview"
                            ? live.slotNodes
                                  .filter((node) => node.selected)
                                  .map((node) => node.id)
                            : []
                    ),
                ];

                if (selectedIds.length === 0) return;

                live.fitView({
                    nodes: selectedIds.map((id) => ({ id })),
                    padding: 0.55,
                    maxZoom: 1.3,
                    duration: 250,
                });
                return;
            }

            live.fitView({
                padding: 0.2,
                duration: 250,
            });
        };

        window.addEventListener("keydown", handleGlobalShortcut);
        return () => window.removeEventListener("keydown", handleGlobalShortcut);
    }, []);

    return {
        isShortcutHelpOpen,
        setIsShortcutHelpOpen,
    };
}
