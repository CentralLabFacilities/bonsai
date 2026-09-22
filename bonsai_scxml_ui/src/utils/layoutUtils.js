import dagre from "@dagrejs/dagre";

const DEFAULT_NODE_WIDTH = 210;
const DEFAULT_NODE_HEIGHT = 80;
const MAX_OVERVIEW_WIDTH = 520;

const getSkillSlotEntries = (data = {}, nodeType = "custom") => {
    const regularSlots = [
        ...(data.inSlots || []).map((slot) => ({
            key: slot?.key,
            path: slot?.path,
        })),
        ...(data.outSlots || []).map((slot) => ({
            key: slot?.key,
            path: slot?.path,
        })),
    ];

    if (nodeType !== "submachine") {
        return regularSlots.filter((slot) => String(slot.key || "").trim());
    }

    const inheritedSlots = (data.inheritedSlots || [])
        .filter((slot) => slot?.access === "read" || slot?.access === "write")
        .map((slot) => ({
            key: slot?.key,
            path: slot?.path,
        }));

    return [...regularSlots, ...inheritedSlots].filter((slot) =>
        String(slot.key || slot.path || "").trim()
    );
};

const estimateSlotDockWidth = (slotEntries) => {
    if (!slotEntries.length) return 0;

    const slotGutters = 16 + 24;
    const minimumPortWidth = 25;
    const requiredSlotWidth =
        slotEntries.length <= 2
            ? slotGutters +
              slotEntries.reduce((total, entry) => {
                  const label = String(entry.key || entry.path || "Slot");
                  const estimatedLabelWidth = Math.min(
                      92,
                      Math.max(minimumPortWidth, 12 + label.length * 6.5)
                  );
                  return total + estimatedLabelWidth;
              }, 0) +
              Math.max(0, slotEntries.length - 1) * 12
            : slotGutters + slotEntries.length * minimumPortWidth;

    return Math.min(MAX_OVERVIEW_WIDTH, Math.max(180, requiredSlotWidth));
};

const estimateOverviewWidth = (node) => {
    const data = node?.data || {};
    const nodeType = node?.type || "custom";
    const labelLength = String(data.label || data.fullSkillName || "").length;
    let requiredWidth = Math.max(DEFAULT_NODE_WIDTH, 95 + labelLength * 6.5);

    if (nodeType === "custom") {
        const parameters = (data.params || []).filter((parameter) =>
            String(parameter?.key || "").trim()
        );
        if (parameters.length > 0) {
            const longestRow = parameters.reduce((longest, parameter) => {
                const value = String(
                    parameter?.expr ?? parameter?.default ?? ""
                ).trim();
                const text = value
                    ? `${parameter.key} = ${value}`
                    : String(parameter.key || "");
                return Math.max(longest, text.length);
            }, labelLength);
            requiredWidth = Math.max(
                requiredWidth,
                Math.min(MAX_OVERVIEW_WIDTH, Math.max(190, 55 + longestRow * 7))
            );
        }
    }

    if (nodeType === "submachine") {
        const entries = (data.localDataModel || []).filter((entry) => {
            const id = String(entry?.id || "").trim();
            return id && id !== "#_STATE_PREFIX";
        });
        if (entries.length > 0) {
            const longestRow = entries.reduce((longest, entry) => {
                const value = String(entry?.expr ?? "").trim();
                const text = value ? `${entry.id} = ${value}` : String(entry.id);
                return Math.max(longest, text.length);
            }, labelLength);
            requiredWidth = Math.max(
                requiredWidth,
                Math.min(MAX_OVERVIEW_WIDTH, Math.max(190, 55 + longestRow * 7))
            );
        }
    }

    requiredWidth = Math.max(
        requiredWidth,
        estimateSlotDockWidth(getSkillSlotEntries(data, nodeType))
    );

    return Math.min(MAX_OVERVIEW_WIDTH, requiredWidth);
};

const estimateOverviewHeight = (node) => {
    const data = node?.data || {};
    const nodeType = node?.type || "custom";

    if (data.isSkillClone || nodeType === "stateClone") return 72;
    if (data.isFinal || data.isBehaviorExit) return 58;

    const eventCount = new Set(
        (data.events || []).map((event) => String(event?.id || "").trim()).filter(Boolean)
    ).size;
    const slotCount = getSkillSlotEntries(data, nodeType).length;

    if (nodeType === "submachine") {
        const localDataCount = (data.localDataModel || []).filter((entry) => {
            const id = String(entry?.id || "").trim();
            return id && id !== "#_STATE_PREFIX";
        }).length;

        return Math.max(
            DEFAULT_NODE_HEIGHT,
            66 +
                eventCount * 18 +
                (localDataCount > 0 ? 10 + localDataCount * 22 : 0) +
                (slotCount > 0 ? 112 : 0)
        );
    }

    const parameterCount = (data.params || []).filter((parameter) =>
        String(parameter?.key || "").trim()
    ).length;

    return Math.max(
        DEFAULT_NODE_HEIGHT,
        48 +
            eventCount * 18 +
            (parameterCount > 0 ? 10 + parameterCount * 22 : 0) +
            (slotCount > 0 ? 112 : 0)
    );
};

/**
 * Return the dimensions automatic placement should reserve for a node while
 * the editor is in Overview mode. Containers keep their explicit dimensions;
 * atomic skills/sub-machines are estimated from the same content that their
 * Overview render shows so Dagre does not lay them out as 180x80 placeholders.
 */
export const getOverviewLayoutNodeSize = (node) => {
    const explicitWidth =
        Number(node?.width) || Number(node?.style?.width) || Number(node?.measured?.width);
    const explicitHeight =
        Number(node?.height) || Number(node?.style?.height) || Number(node?.measured?.height);

    if (
        node?.type === "compound" ||
        node?.type === "parallel" ||
        node?.type === "parallelLane"
    ) {
        return {
            width: explicitWidth || (node.type === "parallel" ? 640 : 320),
            height: explicitHeight || (node.type === "parallel" ? 320 : 180),
        };
    }

    if (node?.type === "custom" || node?.type === "submachine") {
        return {
            width: Math.max(explicitWidth || 0, estimateOverviewWidth(node)),
            height: Math.max(explicitHeight || 0, estimateOverviewHeight(node)),
        };
    }

    return {
        width: explicitWidth || DEFAULT_NODE_WIDTH,
        height: explicitHeight || DEFAULT_NODE_HEIGHT,
    };
};

export const getLayoutedElements = (nodesToLayout, edgesToLayout) => {
    try {
        const GraphClass = dagre.graphlib ? dagre.graphlib.Graph : dagre.Graph;
        const dagreGraph = new GraphClass();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Keep automatically placed nodes comfortably separated. Overview mode
        // is the densest node representation, so spacing is based on those
        // dimensions rather than on a fixed 180x80 placeholder.
        dagreGraph.setGraph({
            rankdir: "LR",
            nodesep: 90,
            ranksep: 170,
        });

        nodesToLayout.forEach((node) => {
            const { width, height } = getOverviewLayoutNodeSize(node);
            dagreGraph.setNode(node.id, { width, height });
        });

        edgesToLayout.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        const layoutedNodes = nodesToLayout.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            const { width, height } = getOverviewLayoutNodeSize(node);

            return {
                ...node,
                position: {
                    x: nodeWithPosition.x - width / 2,
                    y: nodeWithPosition.y - height / 2,
                },
            };
        });

        return { nodes: layoutedNodes, edges: edgesToLayout };
    } catch (err) {
        console.warn("Layouting fehlgeschlagen, nutze Fallback-Positionen:", err);
        return { nodes: nodesToLayout, edges: edgesToLayout };
    }
};
