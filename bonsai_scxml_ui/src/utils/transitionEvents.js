const MAIN_EXIT_TYPES = new Set(["success", "error", "fatal"]);

const getSkillNameCandidates = (sourceSkillName) => {
    const rawName = String(sourceSkillName || "").trim();
    if (!rawName) return [];

    const withoutInstance = rawName.split("#")[0];
    const simpleName = withoutInstance.split(".").filter(Boolean).pop() || "";

    return Array.from(new Set([rawName, withoutInstance, simpleName].filter(Boolean)))
        .sort((a, b) => b.length - a.length);
};

export const isWildcardTransitionEvent = (eventId) =>
    String(eventId || "").includes("*");

export const isManagedBoundaryEvent = (nodeType, event) =>
    ["compound", "parallelLane"].includes(nodeType) &&
    Boolean(event?.sourceNodeId && event?.transitionHandleId);

// Compare entire descriptor coverage: a specific child event does not shadow
// an ancestor wildcard's remaining event namespace.
export const transitionDescriptorCovers = (covering, covered) => {
    const tokens = (value) => String(value || "").trim().split(/\s+/).filter(Boolean);
    const outer = tokens(covering);
    const inner = tokens(covered);
    return inner.length > 0 && inner.every((event) => outer.some((descriptor) => {
        if (descriptor === "*" || descriptor === "**" || descriptor === event) return true;
        const wildcard = /\.\*{1,2}$/.test(descriptor);
        const prefix = wildcard ? descriptor.replace(/\.\*{1,2}$/, "") : descriptor;
        const eventPrefix = event.replace(/\.\*{1,2}$/, "");
        return eventPrefix.startsWith(`${prefix}.`) || eventPrefix === prefix;
    }));
};

const normalizeExitToken = (token) => {
    const value = String(token || "").trim();
    if (!value) return "success";
    // Wildcards are meaningful SCXML event descriptors. Preserve patterns
    // such as success.*, error.* and event.** exactly in the editor so saving
    // the graph does not silently narrow their matching semantics.
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

    // Already-normalized/custom event ids and wildcard descriptors are kept
    // unchanged when no source prefix can be identified safely.
    return eventName;
};
