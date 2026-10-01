const normalizeName = (value) => String(value || "").trim();

const fileStem = (value) =>
    normalizeName(value)
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.(xml|scxml)$/i, "") || "";

const findChildSegment = (tab, tabById) => {
    if (!tab?.parentTabId) return "";
    const parent = tabById.get(tab.parentTabId);
    const childSource = normalizeName(tab.sourcePath);
    const childTitle = normalizeName(tab.title);
    const childFileStem = fileStem(tab.fileName || tab.sourcePath);

    const parentSubMachine = (parent?.nodes || []).find((node) => {
        if (node.type !== "submachine") return false;
        const src = normalizeName(node.data?.src);
        const label = normalizeName(node.data?.label || node.data?.fullSkillName);
        return (
            (childSource && src === childSource) ||
            (childTitle && label === childTitle) ||
            (childFileStem && fileStem(src) === childFileStem)
        );
    });

    return normalizeName(
        parentSubMachine?.data?.label ||
            parentSubMachine?.data?.fullSkillName ||
            tab.title ||
            childFileStem
    );
};

/**
 * Build replay contexts for every state-machine tab that is already open.
 * The runtime suffix order is inner -> outer, e.g. s2 inside s1 becomes
 * `#s2#s1` for states/slots and `_s2_s1` for datamodel ids.
 */
export const buildRuntimeReplayContexts = (
    tabs = [],
    activeTabId = null,
    liveState = {}
) => {
    const effectiveTabs = (tabs || []).map((tab) =>
        tab.id === activeTabId
            ? {
                  ...tab,
                  nodes: liveState.nodes ?? tab.nodes ?? [],
                  edges: liveState.edges ?? tab.edges ?? [],
                  slotNodes: liveState.slotNodes ?? tab.slotNodes ?? [],
                  slotEdges: liveState.slotEdges ?? tab.slotEdges ?? [],
                  globalDataModel:
                      liveState.globalDataModel ?? tab.globalDataModel ?? [],
              }
            : tab
    );
    const tabById = new Map(effectiveTabs.map((tab) => [tab.id, tab]));
    const suffixCache = new Map();

    const suffixPartsForTab = (tab) => {
        if (!tab?.parentTabId) return [];
        if (suffixCache.has(tab.id)) return suffixCache.get(tab.id);
        const parent = tabById.get(tab.parentTabId);
        const ownSegment = findChildSegment(tab, tabById);
        const result = [
            ...(ownSegment ? [ownSegment] : []),
            ...suffixPartsForTab(parent),
        ];
        suffixCache.set(tab.id, result);
        return result;
    };

    return effectiveTabs.map((tab) => ({
        tabId: tab.id,
        parentTabId: tab.parentTabId || null,
        title: tab.title || tab.fileName || tab.id,
        suffixParts: suffixPartsForTab(tab),
        nodes: tab.nodes || [],
        edges: tab.edges || [],
        slotNodes: tab.slotNodes || [],
        slotEdges: tab.slotEdges || [],
        globalDataModel: tab.globalDataModel || [],
    }));
};
