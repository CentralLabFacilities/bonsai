import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
    loadBehaviorDirectories,
    loadEdgeVisibility,
    saveEditorPreferences,
    loadPanelPreferences,
    savePanelPreferences,
    getEditorPanelLayout,
    PANEL_LIMITS,
} from "../../utils/editorPreferences.js";

export function useEditorPreferences() {
    const [behaviorDirectories, setBehaviorDirectories] = useState(loadBehaviorDirectories);
    const [showTransitionEdges, setShowTransitionEdges] = useState(() =>
        loadEdgeVisibility("transitions"),
    );
    const [showSlotEdges, setShowSlotEdges] = useState(() => loadEdgeVisibility("slots"));

    useEffect(() => {
        saveEditorPreferences({ behaviorDirectories, showTransitionEdges, showSlotEdges });
    }, [behaviorDirectories, showTransitionEdges, showSlotEdges]);

    return {
        behaviorDirectories,
        setBehaviorDirectories,
        showTransitionEdges,
        setShowTransitionEdges,
        showSlotEdges,
        setShowSlotEdges,
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
