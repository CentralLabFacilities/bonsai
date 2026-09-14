const MAIN_EXIT_TYPES = new Set(["success", "error", "fatal"]);

const getSkillNameCandidates = (sourceSkillName) => {
    const rawName = String(sourceSkillName || "").trim();
    if (!rawName) return [];

    const withoutInstance = rawName.split("#")[0];
    const simpleName = withoutInstance.split(".").filter(Boolean).pop() || "";

    return Array.from(new Set([rawName, withoutInstance, simpleName].filter(Boolean)))
        .sort((a, b) => b.length - a.length);
};

const normalizeExitToken = (token) => {
    const value = String(token || "").trim();
    if (!value) return "success";
    if (value === "*") return "*";

    // SCXML patterns such as "success.*" represent the main exit token.
    if (value.endsWith(".*")) {
        return value.slice(0, -2) || "*";
    }

    return value;
};

/**
 * Convert an SCXML transition event into the exit-token id used by the UI.
 *
 * Examples:
 *   SetupPlanningScene.success       -> success
 *   SetupPlanningScene.*             -> *
 *   GraspEntity.success.maybe        -> success.maybe
 *   GraspEntity.error.not_grasped    -> error.not_grasped
 *   success.maybe                    -> success.maybe
 */
export const getTransitionExitToken = (rawEvent, sourceSkillName = "") => {
    const eventName = String(rawEvent || "").trim();
    if (!eventName) return "success";
    if (eventName === "*") return "*";

    // Prefer removing the known source prefix. This is important because exit
    // tokens themselves may contain dots (e.g. success.maybe).
    for (const sourceName of getSkillNameCandidates(sourceSkillName)) {
        const prefix = `${sourceName}.`;
        if (eventName.startsWith(prefix)) {
            return normalizeExitToken(eventName.slice(prefix.length));
        }
    }

    // Fallback for SCXML that uses a different/fully-qualified state prefix:
    // locate the first known main exit type and keep the complete subtype.
    const parts = eventName.split(".").filter(Boolean);
    const typeIndex = parts.findIndex((part) => MAIN_EXIT_TYPES.has(part));
    if (typeIndex !== -1) {
        return normalizeExitToken(parts.slice(typeIndex).join("."));
    }

    // A plain "SomeState.*" is a catch-all transition, not an exit token
    // called "SomeState".
    if (eventName.endsWith(".*")) {
        return "*";
    }

    // Already-normalized/custom event ids (e.g. failure) are kept unchanged.
    return eventName;
};

/**
 * Convert a UI exit-token id back to the SCXML event name for a skill node.
 */
export const getScxmlTransitionEvent = (exitToken, sourceSkillName) => {
    const token = String(exitToken || "success").trim() || "success";
    const sourceWithoutInstance = String(sourceSkillName || "").split("#")[0];
    const skillBaseName = sourceWithoutInstance.split(".").filter(Boolean).pop() || sourceWithoutInstance;

    if (!skillBaseName) return token;

    // Keep an event that is already explicitly prefixed with this skill.
    if (token === skillBaseName || token.startsWith(`${skillBaseName}.`)) {
        return token;
    }

    if (token === "*") {
        return `${skillBaseName}.*`;
    }

    return `${skillBaseName}.${token}`;
};
