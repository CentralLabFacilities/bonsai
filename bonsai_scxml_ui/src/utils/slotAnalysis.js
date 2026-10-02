const mapSkillSlot = (slot) => ({
    key: String(slot?.key || ""),
    typeName: String(slot?.type || ""),
    description: String(slot?.description || ""),
    path: String(slot?.path || ""),
    inheritedPath: String(slot?.inherited?.xpath || ""),
    isInherited: Boolean(slot?.inherited),
});

const mapInheritedUsage = (slot) => ({
    key: String(slot?.key || ""),
    typeName: String(slot?.type || ""),
    description: String(slot?.description || ""),
    path: String(slot?.path || ""),
    access: String(slot?.access || ""),
});

const mapGraphNode = (node) => ({
    id: String(node?.id || ""),
    nodeType: String(node?.type || ""),
    label: String(node?.data?.label || ""),
    fullSkillName: String(node?.data?.fullSkillName || ""),
    inputSlots: (node?.data?.inSlots || []).map(mapSkillSlot),
    outputSlots: (node?.data?.outSlots || []).map(mapSkillSlot),
    inheritedSlots: (node?.data?.inheritedSlots || []).map(mapInheritedUsage),
});

const mapManualSlot = (slot) => ({
    key: String(slot?.key || ""),
    typeName: String(slot?.type || ""),
    description: String(slot?.description || ""),
    path: String(slot?.path || ""),
    inheritedPath: String(slot?.inherited?.xpath || ""),
    slotKind: String(slot?.slotKind || ""),
    isInherited: Boolean(slot?.inherited),
});

const mapCanvasSlotNode = (slotNode) => ({
    path: String(slotNode?.data?.path || ""),
    label: String(slotNode?.data?.label || ""),
    typeName: String(slotNode?.data?.slotType || ""),
    description: String(slotNode?.data?.description || ""),
    key: String(slotNode?.data?.key || ""),
    currentMachineInherited: Boolean(
        slotNode?.data?.currentMachineInherited
    ),
    isSlotClone: Boolean(slotNode?.data?.isSlotClone),
});

const mapTab = (tab) => ({
    id: String(tab?.id || ""),
    title: String(tab?.title || ""),
    fileName: String(tab?.fileName || ""),
    parentTabId: tab?.parentTabId ? String(tab.parentTabId) : null,
    nodes: (tab?.nodes || []).map(mapGraphNode),
    manualSlots: (tab?.manualSlots || []).map(mapManualSlot),
    slotNodes: (tab?.slotNodes || []).map(mapCanvasSlotNode),
});

export const buildSlotAncestryRequest = ({
    tabs = [],
    activeTabId = null,
    nodes = [],
    manualSlots = [],
    slotNodes = [],
}) => {
    const tabsById = new Map((tabs || []).map((tab) => [tab?.id, tab]));
    const storedActiveTab = tabsById.get(activeTabId);
    const relevantTabs = [];
    const seen = new Set();
    let currentTab = storedActiveTab;

    // Only the active machine and its sourcing ancestors can contribute to an
    // inherited-slot chain. Avoid serializing unrelated open tabs over IPC.
    while (currentTab?.id && !seen.has(currentTab.id)) {
        seen.add(currentTab.id);
        relevantTabs.push(currentTab);
        currentTab = currentTab.parentTabId
            ? tabsById.get(currentTab.parentTabId)
            : null;
    }

    return {
        tabs: relevantTabs.map(mapTab),
        activeTabId: activeTabId ? String(activeTabId) : null,
        activeSnapshot: activeTabId
            ? {
                parentTabId: storedActiveTab?.parentTabId
                    ? String(storedActiveTab.parentTabId)
                    : null,
                nodes: nodes.map(mapGraphNode),
                manualSlots: manualSlots.map(mapManualSlot),
                slotNodes: slotNodes.map(mapCanvasSlotNode),
            }
            : null,
    };
};

/**
 * Convert the Rust response back to the historical Map/entry shape consumed
 * by Slot Details and editor validation. Keeping this adapter local means the
 * rest of the UI does not need to know about DTO field naming.
 */
export const slotAncestryResponseToMap = (response) => {
    const result = new Map();

    Object.entries(response?.byPath || {}).forEach(([path, entries]) => {
        result.set(
            path,
            (entries || []).map((entry) => ({
                nodeId: entry?.nodeId || null,
                skillName: String(entry?.skillName || ""),
                key: String(entry?.key || ""),
                type: String(entry?.typeName || "Unknown"),
                description: String(entry?.description || ""),
                access: String(entry?.access || ""),
                slotIndex:
                    entry?.slotIndex === null || entry?.slotIndex === undefined
                        ? null
                        : Number(entry.slotIndex),
                sourceKind: String(entry?.sourceKind || ""),
                hierarchyKind: String(entry?.hierarchyKind || ""),
                path: String(entry?.path || ""),
                parentTabId: String(entry?.parentTabId || ""),
                parentMachineName: String(entry?.parentMachineName || ""),
                ancestorDepth: Number(entry?.ancestorDepth || 0),
            }))
        );
    });

    return result;
};

/**
 * Build the compact ancestry query used with the Rust-owned active workflow.
 * The active tab itself is metadata-only; its semantic nodes/slots are read
 * directly from WorkflowDocumentStore. Only parent state machines still cross
 * IPC because they are separate open documents.
 */
export const buildActiveSlotAncestryRequest = ({
    tabs = [],
    activeTabId = null,
}) => {
    const tabsById = new Map((tabs || []).map((tab) => [tab?.id, tab]));
    const relevantTabs = [];
    const seen = new Set();
    let currentTab = tabsById.get(activeTabId);
    let isActive = true;

    while (currentTab?.id && !seen.has(currentTab.id)) {
        seen.add(currentTab.id);
        if (isActive) {
            relevantTabs.push({
                id: String(currentTab.id || ""),
                title: String(currentTab.title || ""),
                fileName: String(currentTab.fileName || ""),
                parentTabId: currentTab.parentTabId
                    ? String(currentTab.parentTabId)
                    : null,
                nodes: [],
                manualSlots: [],
                slotNodes: [],
            });
            isActive = false;
        } else {
            relevantTabs.push(mapTab(currentTab));
        }

        currentTab = currentTab.parentTabId
            ? tabsById.get(currentTab.parentTabId)
            : null;
    }

    return {
        tabs: relevantTabs,
        activeTabId: activeTabId ? String(activeTabId) : null,
        activeSnapshot: null,
    };
};
