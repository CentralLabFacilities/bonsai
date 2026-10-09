import {
    COLLAPSED_CONTAINER_HEIGHT,
    COLLAPSED_CONTAINER_WIDTH,
    PARALLEL_BOTTOM_PADDING,
    PARALLEL_HEADER_HEIGHT,
    layoutStateContainerForExpansion,
} from "./editorGeometry.js";

export function getContainerExitEvents(data, type) {
    const events = type === "parallel"
        ? data.events || []
        : Array.isArray(data.events) ? data.events : [];
    const uniqueEvents = [];
    const seen = new Set();

    events.forEach((event) => {
        const eventId = String(event?.id || "").trim();
        // Targetless compound events are reusable editor choices, not exits.
        if (
            !eventId ||
            (type !== "parallel" && eventId === "compound-entry") ||
            (type !== "parallelLane" && !event?.target) ||
            seen.has(eventId)
        ) return;
        seen.add(eventId);
        uniqueEvents.push({ ...event, id: eventId });
    });

    if (type === "parallel" && Array.isArray(data.collapsedTransitionHandles)) {
        data.collapsedTransitionHandles.forEach((event) => {
            const eventId = String(event?.id || "").trim();
            if (!eventId || seen.has(eventId)) return;
            seen.add(eventId);
            uniqueEvents.push({ ...event, id: eventId });
        });
    }

    return uniqueEvents;
}

export function resizeParallelLanes(nodes, parallelId, width, height) {
    const lanes = nodes
        .filter((node) => node.parentId === parallelId && node.type === "parallelLane")
        .sort((a, b) => Number(a.position?.y || 0) - Number(b.position?.y || 0));

    if (lanes.length === 0) return nodes;

    const minLaneHeight = 90;
    const firstLaneY = Math.max(
        PARALLEL_HEADER_HEIGHT,
        Number(lanes[0].position?.y || PARALLEL_HEADER_HEIGHT)
    );
    const availableHeight = Math.max(
        lanes.length * minLaneHeight,
        height - firstLaneY - PARALLEL_BOTTOM_PADDING
    );
    const oldHeights = lanes.map((lane) => Number(lane.style?.height) || minLaneHeight);
    const oldTotalHeight = oldHeights.reduce((sum, laneHeight) => sum + laneHeight, 0);
    let nextY = firstLaneY;
    const laneGeometry = new Map();

    lanes.forEach((lane, index) => {
        const proportionalHeight = oldTotalHeight > 0
            ? (availableHeight * oldHeights[index]) / oldTotalHeight
            : availableHeight / lanes.length;
        const laneHeight = index === lanes.length - 1
            ? Math.max(minLaneHeight, firstLaneY + availableHeight - nextY)
            : Math.max(minLaneHeight, proportionalHeight);

        laneGeometry.set(lane.id, { y: nextY, width, height: laneHeight });
        nextY += laneHeight;
    });

    return nodes.map((node) => {
        const geometry = laneGeometry.get(node.id);
        if (!geometry) return node;
        return {
            ...node,
            width: geometry.width,
            height: geometry.height,
            position: { ...node.position, x: 0, y: geometry.y },
            style: { ...node.style, width: geometry.width, height: geometry.height },
        };
    });
}

export function toggleContainerCollapse(nodes, containerId) {
    const container = nodes.find((node) => node.id === containerId);
    if (!container || !["compound", "parallel"].includes(container.type)) return nodes;

    const isCollapsed = Boolean(container.data?.isCollapsed);
    const defaultWidth = container.type === "compound" ? 320 : 420;
    const defaultHeight = container.type === "compound" ? 220 : 295;
    const savedSize = container.data?.expandedContainerSize || {};
    const width = isCollapsed
        ? Number(savedSize.width) || Number(container.width) || Number(container.style?.width) || defaultWidth
        : COLLAPSED_CONTAINER_WIDTH;
    const height = isCollapsed
        ? Number(savedSize.height) || defaultHeight
        : COLLAPSED_CONTAINER_HEIGHT;
    const style = { ...(container.style || {}), width, height };

    if (!isCollapsed) {
        style.minHeight = COLLAPSED_CONTAINER_HEIGHT;
    } else if (savedSize.minHeight == null) {
        delete style.minHeight;
    } else {
        style.minHeight = savedSize.minHeight;
    }

    const data = { ...(container.data || {}), isCollapsed: !isCollapsed };
    if (!isCollapsed) {
        data.expandedContainerSize = {
            width: Number(container.width) || Number(container.measured?.width) || Number(container.style?.width) || defaultWidth,
            height: Number(container.height) || Number(container.measured?.height) || Number(container.style?.height) || defaultHeight,
            minHeight: container.style?.minHeight ?? null,
        };
    }

    const nextNodes = nodes.map((node) => node.id === containerId ? { ...node, width, height, style, data } : node);
    // Expansion must settle descendants before fitting the restored frame.
    return isCollapsed ? layoutStateContainerForExpansion(nextNodes, containerId) : nextNodes;
}

export function getParallelLaneSummaries(node, childrenByParent) {
    if (node?.type !== "parallel") return [];
    const lanes = (childrenByParent.get(node.id) || []).filter((child) => child.type === "parallelLane");

    return lanes.map((lane) => {
        let childCount = 0;
        const visited = new Set([lane.id]);
        const stack = [...(childrenByParent.get(lane.id) || [])];
        while (stack.length > 0) {
            const child = stack.pop();
            if (!child || visited.has(child.id)) continue;
            visited.add(child.id);
            if (child.type !== "parallelLane" && !child.data?.autoParallelLaneCompound && !child.data?.isSkillClone && !child.data?.isStateClone) {
                childCount += 1;
            }
            stack.push(...(childrenByParent.get(child.id) || []));
        }
        return { ...lane, childCount };
    });
}
