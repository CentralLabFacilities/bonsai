import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
    loadBehaviorDirectories,
    isAutoBehaviorDirectory,
    loadEdgeVisibility,
    loadColorblindMode,
    loadCodeViewButtonVisibility,
    saveEditorPreferences,
    loadPanelPreferences,
    savePanelPreferences,
    getEditorPanelLayout,
    PANEL_LIMITS,
} from "../../utils/editorPreferences.js";
import { isTauri, resolveBehaviorDirectory } from "../../tauri-client.js";

const behaviorDirectoryIdentity = (entry) => `${entry.key}\u0000${entry.path}`;

export function useEditorPreferences() {
    const [configuredBehaviorDirectories, setConfiguredBehaviorDirectories] = useState(loadBehaviorDirectories);
    const [checkedRoots, setCheckedRoots] = useState({});

    useEffect(() => {
        if (!isTauri()) return undefined;
        let canceled = false;
        const roots = configuredBehaviorDirectories.filter((entry) => isAutoBehaviorDirectory(entry) && entry.path.trim());
        Promise.all(roots.map(async (entry) => {
            try {
                return [behaviorDirectoryIdentity(entry), await resolveBehaviorDirectory(entry.path)];
            } catch (error) {
                // IPC errors must not silently erase a configured library.
                console.error("Could not check Behavior Library directory:", entry.path, error);
                return [behaviorDirectoryIdentity(entry), undefined];
            }
        })).then((values) => {
            if (!canceled) setCheckedRoots(Object.fromEntries(values));
        });
        return () => { canceled = true; };
    }, [configuredBehaviorDirectories]);

    const behaviorDirectories = useMemo(() => configuredBehaviorDirectories
        // Never show an unverified built-in root (including before the
        // filesystem check completes or when Tauri is unavailable).
        .filter((entry) => !isAutoBehaviorDirectory(entry)
            || typeof checkedRoots[behaviorDirectoryIdentity(entry)] === "string")
        .map((entry) => {
            const resolvedPath = checkedRoots[behaviorDirectoryIdentity(entry)];
            return typeof resolvedPath === "string" ? { ...entry, resolvedPath } : entry;
        }), [configuredBehaviorDirectories, checkedRoots]);

    const setBehaviorDirectories = useCallback((updater) => {
        setConfiguredBehaviorDirectories((current) => {
            // The library edits the displayed roots. Preserve unavailable
            // defaults so they can automatically return when the path exists.
            const visibleIds = new Set(behaviorDirectories.map(behaviorDirectoryIdentity));
            const updated = typeof updater === "function" ? updater(behaviorDirectories) : updater;
            const updatedKeys = new Set(updated.map((entry) => entry.key));
            const hidden = current.filter((entry) =>
                !visibleIds.has(behaviorDirectoryIdentity(entry)) && !updatedKeys.has(entry.key));
            return [...updated.map(({ resolvedPath, ...entry }) => entry), ...hidden];
        });
    }, [behaviorDirectories]);
    const [showTransitionEdges, setShowTransitionEdges] = useState(() =>
        loadEdgeVisibility("transitions"),
    );
    const [showSlotEdges, setShowSlotEdges] = useState(() => loadEdgeVisibility("slots"));
    const [colorblindMode, setColorblindMode] = useState(loadColorblindMode);
    const [showCodeViewButton, setShowCodeViewButton] = useState(loadCodeViewButtonVisibility);

    // CSS variables also resolve inside existing React Flow SVG paths and arrowheads.
    // Apply before paint; toggling must not rebuild the workflow or alter its data.
    useLayoutEffect(() => {
        document.documentElement.toggleAttribute("data-colorblind-mode", colorblindMode);
    }, [colorblindMode]);

    useEffect(() => {
        saveEditorPreferences({ behaviorDirectories: configuredBehaviorDirectories, showTransitionEdges, showSlotEdges, colorblindMode, showCodeViewButton });
    }, [configuredBehaviorDirectories, showTransitionEdges, showSlotEdges, colorblindMode, showCodeViewButton]);

    return {
        behaviorDirectories,
        setBehaviorDirectories,
        showTransitionEdges,
        setShowTransitionEdges,
        showSlotEdges,
        setShowSlotEdges,
        showCodeViewButton,
        setShowCodeViewButton,
        colorblindMode,
        setColorblindMode,
    };
}

const subscribeViewport = (notify) => {
    window.addEventListener("resize", notify);
    return () => window.removeEventListener("resize", notify);
};
const viewportWidth = () => window.innerWidth;
const serverWidth = () => 1400;

export function useEditorPanelLayout() {
    const width = useSyncExternalStore(subscribeViewport, viewportWidth, serverWidth);
    const [preferences, setPreferences] = useState(loadPanelPreferences);
    const [drawer, setDrawer] = useState(null);
    const [draft, setDraft] = useState(null);
    const [libraryDragging, setLibraryDragging] = useState(false);
    const gesture = useRef(null);
    const effectivePreferences = draft
        ? { ...draft.base, [`${draft.side}Width`]: draft.width }
        : preferences;
    const layout = getEditorPanelLayout(width, effectivePreferences, drawer);
    const previousDockedModeRef = useRef(layout.isDocked);

    useEffect(() => {
        if (previousDockedModeRef.current === layout.isDocked) return;
        previousDockedModeRef.current = layout.isDocked;
        setDrawer(null);
        setDraft(null);
        setLibraryDragging(false);
    }, [layout.isDocked]);

    useEffect(() => {
        savePanelPreferences(preferences);
    }, [preferences]);
    useEffect(() => {
        const cancelResize = () => {
            gesture.current = null;
            setDraft(null);
        };
        window.addEventListener("blur", cancelResize);
        return () => window.removeEventListener("blur", cancelResize);
    }, []);

    const showPanel = useCallback(
        (side) => {
            if (layout.isDocked)
                setPreferences((current) =>
                    current[`${side}Open`] ? current : { ...current, [`${side}Open`]: true },
                );
            else setDrawer(side);
        },
        [layout.isDocked],
    );
    const closePanel = (side) => {
        if (layout.isDocked) setPreferences((current) => ({ ...current, [`${side}Open`]: false }));
        else setDrawer(null);
    };
    const togglePanel = (side) => (layout[`${side}Open`] ? closePanel(side) : showPanel(side));
    const constrain = (side, value) =>
        Math.max(PANEL_LIMITS[side].min, Math.min(layout[`${side}MaxWidth`], value));
    const fittedPreferences = () => ({
        ...preferences,
        ...(layout.libraryOpen ? { libraryWidth: layout.libraryWidth } : {}),
        ...(layout.inspectorOpen ? { inspectorWidth: layout.inspectorWidth } : {}),
    });
    const commitWidth = (side, value, base = fittedPreferences()) =>
        setPreferences({ ...base, [`${side}Width`]: constrain(side, value) });
    const startResize = (side, event) => {
        if (!layout.isDocked || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        const base = fittedPreferences();
        gesture.current = {
            side,
            x: event.clientX,
            width: layout[`${side}Width`],
            pointerId: event.pointerId,
            base,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDraft({ side, width: layout[`${side}Width`], base });
    };
    const moveResize = (event) => {
        const active = gesture.current;
        if (!layout.isDocked || !draft || !active || active.pointerId !== event.pointerId) return;
        const delta = (event.clientX - active.x) * (active.side === "library" ? 1 : -1);
        setDraft({
            side: active.side,
            width: constrain(active.side, active.width + delta),
            base: active.base,
        });
    };
    const finishResize = (event, cancel = false) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        if (!cancel && layout.isDocked && draft?.side === active.side) {
            const delta = (event.clientX - active.x) * (active.side === "library" ? 1 : -1);
            commitWidth(active.side, active.width + delta, active.base);
        }
        gesture.current = null;
        setDraft(null);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const resizeKey = (side, event) => {
        if (!layout.isDocked || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
        event.preventDefault();
        event.stopPropagation();
        const value =
            event.key === "Home"
                ? PANEL_LIMITS[side].min
                : event.key === "End"
                  ? layout[`${side}MaxWidth`]
                  : layout[`${side}Width`] +
                    (event.key === "ArrowRight" ? 16 : -16) * (side === "library" ? 1 : -1);
        commitWidth(side, value);
    };

    return {
        ...layout,
        preferences,
        drawer,
        libraryDragging,
        resizing: Boolean(draft),
        showPanel,
        closePanel,
        togglePanel,
        startResize,
        moveResize,
        finishResize,
        resizeKey,
        resetWidth: (side) => commitWidth(side, PANEL_LIMITS[side].default),
        onLibraryDragStart: () => {
            if (!layout.isDocked) setLibraryDragging(true);
        },
        onLibraryDragEnd: () => {
            if (!layout.isDocked) {
                setLibraryDragging(false);
                setDrawer((current) => current === "library" ? null : current);
            }
        },
    };
}
