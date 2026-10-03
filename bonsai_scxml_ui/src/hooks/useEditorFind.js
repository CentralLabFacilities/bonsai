import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeSlotPath } from "../utils/editorGraph";

export function useEditorFind({
    activeMode,
    setActiveMode,
    semanticNodes,
    slotNodes,
    manualSlots,
    nodes,
    clearAllEdgeSelection,
    checkSlotConnection,
    selectEditorNode,
    fitView,
}) {
    const [isFindOpen, setIsFindOpen] = useState(false);
    const [findState, setFindState] = useState({ query: "", index: 0 });
    const findQuery = findState.query;
    const findResultIndex = findState.index;
    const setFindQuery = useCallback((valueOrUpdater) => {
        setFindState((current) => {
            const query = typeof valueOrUpdater === "function"
                ? valueOrUpdater(current.query)
                : valueOrUpdater;
            return query === current.query ? current : { query, index: 0 };
        });
    }, []);
    const setFindResultIndex = useCallback((valueOrUpdater) => {
        setFindState((current) => {
            const index = typeof valueOrUpdater === "function"
                ? valueOrUpdater(current.index)
                : valueOrUpdater;
            return index === current.index ? current : { ...current, index };
        });
    }, []);
    const findInputRef = useRef(null);
    const findPanelRef = useRef(null);

    // Ctrl+F opens graph search instead of the browser's page search. Preserve
    // native search while the user is actively editing code.
    useEffect(() => {
        const handleEditorFindShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (String(event.key || "").toLowerCase() !== "f") return;

            const target = event.target;
            const insideCodeEditor =
                target instanceof Element &&
                Boolean(target.closest(".monaco-editor, .cm-editor"));

            if (insideCodeEditor) return;

            event.preventDefault();
            setIsFindOpen(true);
        };

        window.addEventListener("keydown", handleEditorFindShortcut, true);
        return () =>
            window.removeEventListener(
                "keydown",
                handleEditorFindShortcut,
                true
            );
    }, []);

    useEffect(() => {
        if (!isFindOpen) return;

        requestAnimationFrame(() => {
            findInputRef.current?.focus();
            findInputRef.current?.select();
        });
    }, [isFindOpen]);

    useEffect(() => {
        if (!isFindOpen) return;

        const handlePointerDownOutsideFind = (event) => {
            const panel = findPanelRef.current;
            if (panel && !panel.contains(event.target)) {
                setIsFindOpen(false);
            }
        };

        document.addEventListener(
            "pointerdown",
            handlePointerDownOutsideFind,
            true
        );
        return () =>
            document.removeEventListener(
                "pointerdown",
                handlePointerDownOutsideFind,
                true
            );
    }, [isFindOpen]);

    const findResults = useMemo(() => {
        const query = findQuery.trim().toLowerCase();
        if (!query) return [];

        const results = [];

        semanticNodes.forEach((node) => {
            if (node.type !== "custom" && node.type !== "submachine") return;

            const label = String(node.data?.label || node.id);
            const fullName = String(node.data?.fullSkillName || "");
            const src = String(node.data?.src || "");
            const haystack = `${label} ${fullName} ${src}`.toLowerCase();

            if (!haystack.includes(query)) return;

            results.push({
                kind: node.type === "submachine" ? "behavior" : "skill",
                id: node.id,
                label,
                detail: fullName || src || node.id,
            });
        });

        const slotPaths = new Map();
        const addSlotPath = (path, type = "Unknown") => {
            const cleanPath = normalizeSlotPath(path);
            if (!cleanPath) return;

            const existing = slotPaths.get(cleanPath);
            slotPaths.set(cleanPath, {
                path: cleanPath,
                type:
                    existing?.type && existing.type !== "Unknown"
                        ? existing.type
                        : type || "Unknown",
            });
        };

        (slotNodes || []).forEach((node) =>
            addSlotPath(node.data?.path || node.data?.label, node.data?.slotType)
        );
        (manualSlots || []).forEach((slot) => addSlotPath(slot.path, slot.type));
        semanticNodes.forEach((node) => {
            [
                ...(node.data?.inSlots || []),
                ...(node.data?.outSlots || []),
                ...(node.data?.inheritedSlots || []),
            ].forEach((slot) => addSlotPath(slot.path, slot.type));
        });

        [...slotPaths.values()].forEach((slot) => {
            const displayPath = `/${slot.path}`;
            const haystack = `${displayPath} ${slot.type || ""}`.toLowerCase();
            if (!haystack.includes(query)) return;

            results.push({
                kind: "slot",
                id: `slot-${slot.path}`,
                label: displayPath,
                detail: slot.type || "Unknown",
            });
        });

        return results.slice(0, 50);
    }, [findQuery, semanticNodes, slotNodes, manualSlots]);

    const focusFindResult = useCallback(
        (result) => {
            if (!result) return;

            clearAllEdgeSelection();

            if (result.kind === "slot") {
                if (activeMode === "event") {
                    setActiveMode("slots");
                }

                checkSlotConnection(nodes, manualSlots);

                window.setTimeout(() => {
                    selectEditorNode(result.id, {
                        kind: "slot",
                        allowMissing: true,
                        openDetails: false,
                        tab: null,
                    });

                    fitView({
                        nodes: [{ id: result.id }],
                        padding: 0.8,
                        maxZoom: 1.35,
                        duration: 250,
                    });
                }, 40);
            } else {
                selectEditorNode(result.id, {
                    kind: "node",
                    tab: null,
                });

                window.setTimeout(() => {
                    fitView({
                        nodes: [{ id: result.id }],
                        padding: 0.8,
                        maxZoom: 1.35,
                        duration: 250,
                    });
                }, 0);
            }

            setIsFindOpen(false);
        },
        [
            activeMode,
            setActiveMode,
            nodes,
            manualSlots,
            clearAllEdgeSelection,
            checkSlotConnection,
            selectEditorNode,
            fitView,
        ]
    );

    return {
        isFindOpen,
        setIsFindOpen,
        findQuery,
        setFindQuery,
        findResultIndex,
        setFindResultIndex,
        findInputRef,
        findPanelRef,
        findResults,
        focusFindResult,
    };
}
