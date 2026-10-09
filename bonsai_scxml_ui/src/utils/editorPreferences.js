const BEHAVIOR_DIRECTORIES_KEY = "bonsai.behaviorDirectories";
const PANEL_PREFERENCES_KEY = "bonsai.panelLayout";
const RUNTIME_CONFIGURATION_KEY = "bonsai.runtimeConfiguration";

export const PANEL_DOCK_BREAKPOINT = 1100;
export const PANEL_MIN_CANVAS_WIDTH = 420;
export const PANEL_RESIZE_WIDTH = 6;
export const PANEL_LIMITS = {
    library: { min: 240, max: 480, default: 350 },
    inspector: { min: 280, max: 560, default: 400 },
};

export const EDGE_VISIBILITY_KEYS = {
    transitions: "bonsai.showTransitionEdges",
    slots: "bonsai.showSlotEdges",
};

function defaultBehaviorDirectories() {
    return [{ key: "ROBOCUP", path: "/robocup_ws/robocup", isDefault: true }];
}

export function loadBehaviorDirectories(storage) {
    try {
        const raw = (storage ?? window.localStorage).getItem(BEHAVIOR_DIRECTORIES_KEY);
        if (raw === null) return defaultBehaviorDirectories();

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return defaultBehaviorDirectories();

        return parsed
            .filter((entry) => entry && typeof entry.key === "string" && typeof entry.path === "string")
            .map((entry) => ({ ...entry, key: entry.key.trim().toUpperCase() }))
            // Remove retired built-in mappings, but retain user-created mappings.
            .filter((entry) => !(entry.isDefault === true && ["EXERCISE", "CHALLENGE"].includes(entry.key)));
    } catch {
        return defaultBehaviorDirectories();
    }
}

export function loadEdgeVisibility(kind, storage) {
    try {
        return (storage ?? window.localStorage).getItem(EDGE_VISIBILITY_KEYS[kind]) !== "false";
    } catch {
        return true;
    }
}

export function loadRuntimeConfiguration(storage) {
    try {
        return (storage ?? window.localStorage).getItem(RUNTIME_CONFIGURATION_KEY) || "";
    } catch {
        return "";
    }
}

export function saveRuntimeConfiguration(path, storage) {
    try {
        (storage ?? window.localStorage).setItem(RUNTIME_CONFIGURATION_KEY, path);
    } catch {
        // The configuration remains usable when optional caching is unavailable.
    }
}

export function saveEditorPreferences(preferences, storage) {
    const entries = [
        [BEHAVIOR_DIRECTORIES_KEY, JSON.stringify(preferences.behaviorDirectories)],
        [EDGE_VISIBILITY_KEYS.transitions, String(preferences.showTransitionEdges)],
        [EDGE_VISIBILITY_KEYS.slots, String(preferences.showSlotEdges)],
    ];

    for (const [key, value] of entries) {
        try {
            (storage ?? window.localStorage).setItem(key, value);
        } catch {
            // Persistence is optional, including when storage is full or blocked.
        }
    }
}

function normalizePanelPreferences(preferences) {
    const values = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
    return {
        libraryWidth: Number.isFinite(values.libraryWidth)
            ? Math.min(PANEL_LIMITS.library.max, Math.max(PANEL_LIMITS.library.min, values.libraryWidth))
            : PANEL_LIMITS.library.default,
        inspectorWidth: Number.isFinite(values.inspectorWidth)
            ? Math.min(PANEL_LIMITS.inspector.max, Math.max(PANEL_LIMITS.inspector.min, values.inspectorWidth))
            : PANEL_LIMITS.inspector.default,
        libraryOpen: typeof values.libraryOpen === "boolean" ? values.libraryOpen : true,
        inspectorOpen: typeof values.inspectorOpen === "boolean" ? values.inspectorOpen : true,
    };
}

export function loadPanelPreferences(storage) {
    try {
        const raw = (storage ?? window.localStorage).getItem(PANEL_PREFERENCES_KEY);
        return normalizePanelPreferences(JSON.parse(raw));
    } catch {
        return normalizePanelPreferences();
    }
}

export function savePanelPreferences(preferences, storage) {
    try {
        (storage ?? window.localStorage).setItem(PANEL_PREFERENCES_KEY, JSON.stringify(normalizePanelPreferences(preferences)));
    } catch {
        // Panel persistence is optional when storage is unavailable or blocked.
    }
}

export function getEditorPanelLayout(viewportWidth, preferences, drawer = null) {
    const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 1400;
    const normalized = normalizePanelPreferences(preferences);
    const isDocked = width >= PANEL_DOCK_BREAKPOINT;
    const libraryOpen = isDocked ? normalized.libraryOpen : drawer === "library";
    const inspectorOpen = isDocked ? normalized.inspectorOpen : drawer === "inspector";
    let libraryWidth = libraryOpen ? normalized.libraryWidth : 0;
    let inspectorWidth = inspectorOpen ? normalized.inspectorWidth : 0;

    const availableWidth = isDocked
        // The editor frame's two 1px borders are outside the Flow canvas.
        ? width - PANEL_MIN_CANVAS_WIDTH - 2 - (Number(libraryOpen) + Number(inspectorOpen)) * PANEL_RESIZE_WIDTH
        : Math.max(0, width - 12);

    if (!isDocked) {
        libraryWidth = Math.min(libraryWidth, availableWidth);
        inspectorWidth = Math.min(inspectorWidth, availableWidth);
    } else if (libraryWidth + inspectorWidth > availableWidth) {
        const libraryMinimum = libraryOpen ? PANEL_LIMITS.library.min : 0;
        const inspectorMinimum = inspectorOpen ? PANEL_LIMITS.inspector.min : 0;
        // Shrink only the requested space above each minimum, not the saved preferences.
        const scale = (availableWidth - libraryMinimum - inspectorMinimum)
            / (libraryWidth + inspectorWidth - libraryMinimum - inspectorMinimum);
        libraryWidth = libraryMinimum + (libraryWidth - libraryMinimum) * scale;
        inspectorWidth = availableWidth - libraryWidth;
    }

    return {
        isDocked,
        libraryOpen,
        inspectorOpen,
        libraryWidth,
        inspectorWidth,
        libraryMaxWidth: Math.min(PANEL_LIMITS.library.max, Math.max(0, availableWidth - (isDocked ? inspectorWidth : 0))),
        inspectorMaxWidth: Math.min(PANEL_LIMITS.inspector.max, Math.max(0, availableWidth - (isDocked ? libraryWidth : 0))),
    };
}
