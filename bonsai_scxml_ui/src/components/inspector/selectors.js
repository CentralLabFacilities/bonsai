export function getSkillPackageName(fullSkillName) {
    let baseName = String(fullSkillName || "").split("#")[0];
    const skillsMarker = ".skills.";
    const skillsIndex = baseName.indexOf(skillsMarker);

    if (skillsIndex !== -1) {
        baseName = baseName.slice(skillsIndex + skillsMarker.length);
    }

    const parts = baseName.split(".").filter(Boolean);
    return parts.length <= 1 ? "" : parts.slice(0, -1).join(".");
}

export function createDetailsTargetIndex(availableTargetNodes, transitions, sourceNodeId) {
    const options = (availableTargetNodes || []).map((node) => {
        const fullSkillName = node.data?.fullSkillName || "";
        const editorInstanceId = String(node.data?.editorInstanceId || "").trim();
        const isReference = Boolean(node.data?.isSkillClone || node.data?.isStateClone);
        const referenceId = isReference ? editorInstanceId || String(node.id || "") : "";
        const stateName = editorInstanceId && !isReference
            ? `#${editorInstanceId}`
            : fullSkillName.includes("#")
                ? fullSkillName.split("#").pop()
                : "";
        const skillName = node.data?.label || fullSkillName.split(".").pop().split("#")[0] || node.id;
        const displayName = isReference
            ? `${skillName} [${referenceId}]`
            : editorInstanceId
                ? `${skillName}#${editorInstanceId}`
                : stateName && stateName !== skillName
                    ? `${skillName}${stateName.startsWith("#") ? "" : "#"}${stateName}`
                    : skillName;

        return {
            id: node.id,
            displayName,
            skillName,
            stateName,
            fullSkillName,
            editorInstanceId,
            isReference,
            referenceId,
            packageName: getSkillPackageName(fullSkillName),
        };
    });

    const byId = new Map();
    const byAlias = new Map();
    const byExactQuery = new Map();
    const searchableOptions = options.map((option) => {
        if (!byId.has(option.id)) byId.set(option.id, option);
        // Preserve array.find precedence across aliases, not just within each alias type.
        [option.id, option.fullSkillName, option.displayName].forEach((alias) => {
            if (!byAlias.has(alias)) byAlias.set(alias, option);
        });

        const values = [
            option.displayName,
            option.skillName,
            option.stateName,
            option.fullSkillName,
            option.packageName,
            option.id,
            option.referenceId,
        ].map((value) => String(value || "").toLowerCase());
        values.forEach((value) => {
            if (!byExactQuery.has(value)) byExactQuery.set(value, option);
        });
        return { option, values };
    });

    const targetsByEvent = new Map();
    (transitions || []).forEach((transition) => {
        if (transition?.sourceNodeId !== sourceNodeId) return;
        if (!transition.targetNodeId) return;

        const eventId = String(transition.eventId || "");
        if (!targetsByEvent.has(eventId)) targetsByEvent.set(eventId, new Set());
        targetsByEvent.get(eventId).add(transition.targetNodeId);
    });

    return { options, byId, byAlias, byExactQuery, searchableOptions, targetsByEvent };
}

export function getSemanticTargetNodeIds(event, index) {
    const targetIds = new Set();
    if (event?.target) {
        targetIds.add(index.byAlias.get(event.target)?.id || event.target);
    }
    const transitionTargets = index.targetsByEvent.get(String(event?.id || ""));
    transitionTargets?.forEach((targetId) => targetIds.add(targetId));
    return [...targetIds];
}

export function getMatchingTargetNodeOptions(query, index) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return index.options;

    return index.searchableOptions
        .filter(({ values }) => values.some((value) => value.includes(normalizedQuery)))
        .map(({ option }) => option);
}

export function getAvailableActionLocations(globalDataModel, parameters, isSubMachine) {
    const locations = [
        ...(globalDataModel || []).filter((parameter) =>
            parameter?.id && String(parameter.id).trim() !== "#_STATE_PREFIX"
        ),
        ...(!isSubMachine
            ? (parameters || [])
                .filter((parameter) => parameter?.key)
                .map((parameter) => ({ ...parameter, id: parameter.key, source: "Parameter" }))
            : []),
    ];
    const seen = new Set();
    return locations.filter((location) => {
        if (!location?.id || seen.has(location.id)) return false;
        seen.add(location.id);
        return true;
    });
}

export function areDetailsPanelPropsEqual(previous, next) {
    const stableDataProps = [
        "selectedNode", "hasInitialNode", "activeTab", "availableTargetNodes",
        "availableSlotPaths", "globalDataModel", "actionValueVariables", "slotDetails",
        "parameterFocusRequest", "slotFocusRequest", "transitionFocusRequest", "cloneSourceNode",
        "cloneNodes", "containerOutgoingTransitions", "skillOutgoingTransitions", "parallelLanes",
    ];
    if (!stableDataProps.every((key) => previous[key] === next[key])) return false;

    // Ignoring function props can keep old document/selection closures alive.
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of keys) {
        if (key === "getPackageSkillEvent") continue;
        if ((typeof previous[key] === "function" || typeof next[key] === "function") && previous[key] !== next[key]) {
            return false;
        }
    }
    return true;
}

export function getExitTokenType(eventId) {
    const mainType = String(eventId || "")
        .trim()
        .toLowerCase()
        .split(".")[0];

    if (mainType === "success") return "success";
    if (mainType === "error") return "error";
    if (mainType === "fatal") return "fatal";

    return "other";
}

export function getEditableExitTokens(events, includeImplicitFatal = false) {
    const editable = (events || []).filter(
        (event) => !(event?.sourceNodeId && event?.transitionHandleId)
    );

    // Sub-machines expose only declared exits; normal executable skills also expose fatal.
    if (
        includeImplicitFatal &&
        !editable.some((event) => String(event?.id || "").trim() === "fatal")
    ) {
        editable.push({ id: "fatal", description: "" });
    }

    const priority = { success: 0, error: 1, fatal: 2, other: 3 };
    return editable
        .map((event, index) => ({ event, index, priority: priority[getExitTokenType(event.id)] }))
        .sort((a, b) => a.priority - b.priority || a.index - b.index)
        .map(({ event }) => event);
}
