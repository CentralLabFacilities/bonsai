const BEHAVIOR_DIRECTORIES_KEY = "bonsai.behaviorDirectories";

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
