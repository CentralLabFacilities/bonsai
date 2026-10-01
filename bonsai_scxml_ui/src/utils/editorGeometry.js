import { measureContainerTask } from "./containerPerf.js";
import { resolveCollisionScope, resolveCollisions } from "./nodeCollisions";

export const getNodeId = () => `skill-node-${crypto.randomUUID()}`;

export const COLLAPSED_CONTAINER_WIDTH = 210;
export const COLLAPSED_CONTAINER_HEIGHT = 80;
export const PARALLEL_EXIT_GUTTER = 170;
export const PARALLEL_NODE_GAP = 45;
export const PARALLEL_HEADER_HEIGHT = 64;
export const PARALLEL_LANE_CHILD_LEFT_INSET = 40;
export const PARALLEL_LANE_CHILD_TOP_INSET = 40;
export const PARALLEL_LANE_CHILD_RIGHT_INSET = 45;
export const PARALLEL_LANE_CHILD_BOTTOM_INSET = 40;
export const PARALLEL_BOTTOM_PADDING = 45;
export const COMPOUND_NODE_GAP = 40;
export const COMPOUND_PADDING_X = 45;
export const COMPOUND_HEADER_HEIGHT = 45;
export const COMPOUND_BOTTOM_PADDING = 45;
export const COMPOUND_EXIT_GUTTER_MIN = 220;
export const COMPOUND_EXIT_GUTTER_MAX = 420;

export const getCompoundExitLabel = (event) =>
    String(
        event?.name ||
        event?.rawEvent ||
        event?.transitionHandleId ||
        event?.id ||
        ""
    ).trim();

export const getCompoundExitGutterWidth = (events = []) => {
    const longestLabelLength = (events || []).reduce(
        (maxLength, event) =>
            Math.max(maxLength, getCompoundExitLabel(event).length),
        0
    );

    // Roughly one character width plus label padding, both handles and some
    // breathing room. Keep a generous minimum so child nodes never sit below
    // the compound's exit controls.
    const estimatedWidth = 72 + longestLabelLength * 7.2;

    return Math.max(
        COMPOUND_EXIT_GUTTER_MIN,
        Math.min(COMPOUND_EXIT_GUTTER_MAX, estimatedWidth)
    );
};

export const getCompoundChildrenRight = (compoundId, allNodes = []) =>
    (allNodes || [])
        .filter((node) => node.parentId === compoundId)
        .reduce((right, node) => {
            const size = getNodeSize(node);
            return Math.max(
                right,
                Number(node.position?.x || 0) + size.width
            );
        }, COMPOUND_PADDING_X);

export const getNodeSize = (node) => ({
    // Explicit dimensions written by NodeResizer / auto-fit must win over a
    // possibly stale React Flow measurement from the previous render.
    width: Number(node?.width) || Number(node?.style?.width) || Number(node?.measured?.width) || 210,
    height: Number(node?.height) || Number(node?.style?.height) || Number(node?.measured?.height) || 80,
});

export const withNodeDimensions = (node, width, height) => ({
    ...node,
    width,
    height,
    style: {
        ...(node.style || {}),
        width,
        height,
    },
});

// Container fitting used to repeatedly scan the complete node array with
// find()/filter()/map() for every nested Compound/Parallel. Build one small
// geometry context per fit pass instead. The semantic graph remains unchanged;
// this only gives layout code O(1) node lookup and direct child lists.
const createContainerGeometryContext = (allNodes = []) => {
    const byId = new Map();
    const indexById = new Map();
    const childrenByParent = new Map();

    (allNodes || []).forEach((node, index) => {
        byId.set(node.id, node);
        indexById.set(node.id, index);
        if (!node.parentId) return;
        if (!childrenByParent.has(node.parentId)) {
            childrenByParent.set(node.parentId, []);
        }
        childrenByParent.get(node.parentId).push(node.id);
    });

    const context = {
        nodes: allNodes || [],
        byId,
        indexById,
        childrenByParent,
        changed: false,
    };

    context.replaceNode = (nodeId, nextNode) => {
        const index = context.indexById.get(nodeId);
        if (index == null || !nextNode) return;

        const previous = context.byId.get(nodeId);
        if (previous === nextNode) return;

        if (!context.changed) {
            context.nodes = [...context.nodes];
            context.changed = true;
        }

        context.nodes[index] = nextNode;
        context.byId.set(nodeId, nextNode);
    };

    context.getChildren = (parentId) =>
        (context.childrenByParent.get(parentId) || [])
            .map((id) => context.byId.get(id))
            .filter(Boolean);

    return context;
};

const getLaneForNodeFromContext = (node, context) => {
    let current = node;
    const visited = new Set();

    while (current?.parentId && !visited.has(current.parentId)) {
        visited.add(current.parentId);
        const parent = context.byId.get(current.parentId);
        if (!parent) return null;
        if (parent.type === "parallelLane") return parent;
        current = parent;
    }

    return null;
};

const getNodeNestingDepthFromContext = (node, context) => {
    let depth = 0;
    let parentId = node?.parentId;
    const visited = new Set();

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = context.byId.get(parentId);
        if (!parent) break;
        depth += 1;
        parentId = parent.parentId;
    }

    return depth;
};

export const getDirectCompoundForNode = (node, allNodes) => {
    if (!node?.parentId) return null;
    const parent = allNodes.find((candidate) => candidate.id === node.parentId);
    return parent?.type === "compound" ? parent : null;
};

export const fitCompoundToChildren = (allNodes, compoundId) => {
    const context = createContainerGeometryContext(allNodes);
    fitCompoundToChildrenInContext(context, compoundId);
    return context.nodes;
};

const fitCompoundToChildrenInContext = (context, compoundId) => {
    const compound = context.byId.get(compoundId);
    if (!compound || compound.type !== "compound") return;

    const members = context.getChildren(compoundId);

    let right = COMPOUND_PADDING_X;
    let bottom = COMPOUND_HEADER_HEIGHT;

    members.forEach((member) => {
        const size = getNodeSize(member);
        right = Math.max(
            right,
            Number(member.position?.x || 0) + size.width
        );
        bottom = Math.max(
            bottom,
            Number(member.position?.y || 0) + size.height
        );
    });

    const requiredWidth = Math.max(
        320,
        right +
        COMPOUND_PADDING_X +
        getCompoundExitGutterWidth(compound.data?.events || [])
    );
    const requiredHeight = Math.max(
        180,
        bottom + COMPOUND_BOTTOM_PADDING
    );

    const currentSize = getNodeSize(compound);

    if (compound.data?.isCollapsed) {
        const savedExpanded = compound.data?.expandedContainerSize || {};
        const expandedWidth = Math.max(
            Number(savedExpanded.width) || 0,
            currentSize.width,
            requiredWidth
        );
        const expandedHeight = Math.max(
            Number(savedExpanded.height) || 0,
            requiredHeight
        );

        // Keep the compact collapsed footprint on screen in both dimensions,
        // but remember a large enough expanded size for all children.
        context.replaceNode(compound.id, {
            ...withNodeDimensions(
                compound,
                COLLAPSED_CONTAINER_WIDTH,
                COLLAPSED_CONTAINER_HEIGHT
            ),
            data: {
                ...(compound.data || {}),
                expandedContainerSize: {
                    ...savedExpanded,
                    width: expandedWidth,
                    height: expandedHeight,
                },
            },
        });
        return;
    }

    context.replaceNode(
        compound.id,
        withNodeDimensions(
            compound,
            Math.max(currentSize.width, requiredWidth),
            Math.max(currentSize.height, requiredHeight)
        )
    );
};

const fitCompoundAndAncestorCompoundsImpl = (allNodes, compoundId) => {
    const context = createContainerGeometryContext(allNodes);
    let currentId = compoundId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        fitCompoundToChildrenInContext(context, currentId);

        const current = context.byId.get(currentId);
        if (!current?.parentId) break;

        const parent = context.byId.get(current.parentId);
        currentId = parent?.type === "compound" ? parent.id : null;
    }

    // A compound can itself live in a parallel lane. If it grows, the lane
    // and enclosing parallel must grow too instead of clipping the compound.
    const fittedCompound = context.byId.get(compoundId);
    const lane = fittedCompound
        ? getLaneForNodeFromContext(fittedCompound, context)
        : null;

    if (lane?.parentId) {
        growParallelToLaneContentsInContext(context, lane.parentId);
    }

    return context.nodes;
};

export const getAbsoluteNodePosition = (node, allNodes) => {
    let x = node?.position?.x || 0;
    let y = node?.position?.y || 0;
    let parentId = node?.parentId;
    const visited = new Set();

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);

        const parent = allNodes.find(
            (candidate) => candidate.id === parentId
        );

        if (!parent) break;

        x += parent.position?.x || 0;
        y += parent.position?.y || 0;
        parentId = parent.parentId;
    }

    return { x, y };
};

export const getLaneForNode = (node, allNodes) => {
    let current = node;
    const visited = new Set();

    while (current?.parentId && !visited.has(current.parentId)) {
        visited.add(current.parentId);

        const parent = allNodes.find(
            (candidate) => candidate.id === current.parentId
        );

        if (!parent) return null;
        if (parent.type === "parallelLane") return parent;

        current = parent;
    }

    return null;
};

export const getEnclosingStateContainers = (node, allNodes = []) => {
    const byId = new Map(
        (allNodes || []).map((candidate) => [candidate.id, candidate])
    );
    const containers = [];
    const visited = new Set();
    let parentId = node?.parentId;

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;

        if (parent.type === "compound" || parent.type === "parallel") {
            containers.push(parent);
        }

        parentId = parent.parentId;
    }

    return containers;
};

export const isNodeInsideContainer = (node, containerId, allNodes = []) => {
    if (!node || !containerId) return false;

    const byId = new Map(
        (allNodes || []).map((candidate) => [candidate.id, candidate])
    );
    const visited = new Set();
    let parentId = node.parentId;

    while (parentId && !visited.has(parentId)) {
        if (parentId === containerId) return true;

        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        parentId = parent.parentId;
    }

    return false;
};

export const getNodeNestingDepth = (node, allNodes = []) => {
    const byId = new Map(
        (allNodes || []).map((candidate) => [candidate.id, candidate])
    );
    const visited = new Set();
    let depth = 0;
    let parentId = node?.parentId;

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        depth += 1;
        parentId = parent.parentId;
    }

    return depth;
};

// Resolve the actual editor container under a flow-space pointer. This is used
// for both library drops and existing-node drags so all parallel lanes (not
// just the first two) follow the same hit-testing rules. Automatic lane
// compounds are implementation details and are deliberately skipped: dropping
// onto their area conceptually means dropping into the surrounding lane; the
// normal lane normalization can then place real states into the wrapper.
export const findDropContainerAtPoint = (
    point,
    allNodes = [],
    {
        excludeNodeId = null,
        allowCompounds = true,
        allowParallelLanes = true,
    } = {}
) => {
    if (!point) return null;

    const candidates = [];

    (allNodes || []).forEach((node, index) => {
        const isLane = node.type === "parallelLane";
        const isCompound = node.type === "compound";

        if (isLane && !allowParallelLanes) return;
        if (isCompound && !allowCompounds) return;
        if (!isLane && !isCompound) return;

        // Never expose the editor-created lane wrapper as an independent drop
        // target. It occupies the full lane and otherwise masks that lane.
        if (isCompound && isAutoParallelLaneCompound(node)) return;

        if (excludeNodeId) {
            if (node.id === excludeNodeId) return;
            if (isNodeInsideContainer(node, excludeNodeId, allNodes)) return;
        }

        const position = getAbsoluteNodePosition(node, allNodes);
        const size = isLane
            ? {
                  width: Number(node.style?.width) || Number(node.width) || 420,
                  height: Number(node.style?.height) || Number(node.height) || 110,
              }
            : getNodeSize(node);

        if (
            point.x < position.x ||
            point.x > position.x + size.width ||
            point.y < position.y ||
            point.y > position.y + size.height
        ) {
            return;
        }

        candidates.push({
            node,
            depth: getNodeNestingDepth(node, allNodes),
            index,
        });
    });

    candidates.sort((a, b) => {
        if (a.depth !== b.depth) return b.depth - a.depth;
        // At an equal depth a real Compound is the more specific semantic
        // target. Fall back to later-rendered nodes for deterministic overlap.
        if (a.node.type !== b.node.type) {
            return a.node.type === "compound" ? -1 : 1;
        }
        return b.index - a.index;
    });

    return candidates[0]?.node || null;
};

// A normal transition may only target an interior state when its source is
// already inside every compound/parallel boundary surrounding that target.
// This prevents transitions from jumping across a state boundary directly to
// one of its children; external transitions must target the container itself.
export const canTargetAcrossStateBoundaries = (sourceNode, targetNode, allNodes = []) =>
    getEnclosingStateContainers(targetNode, allNodes).every((container) =>
        isNodeInsideContainer(sourceNode, container.id, allNodes)
    );

export const getTransitionTargetHandleForNode = (node) =>
    node?.type === "parallel" ? "target" : "transition-target";

export const getDescendantNodeIds = (rootId, allNodes = []) => {
    const childrenByParent = new Map();

    (allNodes || []).forEach((node) => {
        if (!node?.parentId) return;
        if (!childrenByParent.has(node.parentId)) {
            childrenByParent.set(node.parentId, []);
        }
        childrenByParent.get(node.parentId).push(node.id);
    });

    const descendants = new Set();
    const queue = [...(childrenByParent.get(rootId) || [])];

    while (queue.length > 0) {
        const id = queue.shift();
        if (!id || descendants.has(id)) continue;
        descendants.add(id);
        queue.push(...(childrenByParent.get(id) || []));
    }

    return descendants;
};

export const orderNodesParentsFirst = (allNodes) => {
    const byId = new Map(
        allNodes.map((node) => [node.id, node])
    );

    const getDepth = (node) => {
        let depth = 0;
        let parentId = node.parentId;
        const visited = new Set();

        while (
            parentId &&
            byId.has(parentId) &&
            !visited.has(parentId)
            ) {
            visited.add(parentId);
            depth += 1;
            parentId = byId.get(parentId).parentId;
        }

        return depth;
    };

    return allNodes
        .map((node, index) => ({
            node,
            index,
            depth: getDepth(node),
        }))
        .sort((a, b) => a.depth - b.depth || a.index - b.index)
        .map(({ node }) => node);
};

export const isEditorReferenceNode = (node) =>
    Boolean(
        node?.data?.cloneOfNodeId &&
        (
            node.data?.isSkillClone ||
            node.data?.isStateClone ||
            node.data?.isSlotClone
        )
    );

export const isCompoundInitialChildCandidate = (node) =>
    Boolean(
        node &&
        node.type !== "slot" &&
        node.type !== "parallelLane" &&
        !isEditorReferenceNode(node)
    );

// Any real SCXML state can be a branch state in a parallel lane. Structural
// states (compound/parallel) therefore participate exactly like skills. Editor
// references are visual aliases only and must never become lane members for
// initial-state or SCXML-wrapper purposes.
export const isParallelLaneSkillCandidate = (node) =>
    Boolean(
        node &&
        node.type !== "slot" &&
        node.type !== "parallelLane" &&
        !isEditorReferenceNode(node) &&
        !(
            node.type === "compound" &&
            (
                node.data?.autoParallelLaneCompound ||
                node.className === "compound-in-lane"
            )
        )
    );

export const isAutoParallelLaneCompound = (node) =>
    Boolean(
        node &&
        node.type === "compound" &&
        (
            node.data?.autoParallelLaneCompound ||
            node.className === "compound-in-lane"
        )
    );



// Expansion-time layout is deliberately stricter than the normal grow-only
// helpers below. When a collapsed state is opened we first make its visible
// descendants non-overlapping, then normalize them back toward the container
// insets, and only then derive the exact container dimensions from the final
// child geometry. This prevents stale saved sizes and overlapping imported
// positions from being restored indefinitely.
const layoutSiblingScopeInContext = (
    context,
    parentId,
    { minX = 20, minY = 20, gap = 30, filter = null } = {}
) => {
    const originalChildren = context
        .getChildren(parentId)
        .filter((node) => !node.hidden)
        .filter((node) => (typeof filter === "function" ? filter(node) : true));

    if (originalChildren.length === 0) return;

    const resolved = resolveCollisions(originalChildren, {
        maxIterations: 300,
        overlapThreshold: 0.1,
        // resolveCollisions expands both sides of a node by margin, so half
        // the desired visual gap produces approximately that final gap.
        margin: Math.max(4, gap / 2),
    });

    const minResolvedX = Math.min(
        ...resolved.map((node) => Number(node.position?.x || 0))
    );
    const minResolvedY = Math.min(
        ...resolved.map((node) => Number(node.position?.y || 0))
    );
    const shiftX = minX - minResolvedX;
    const shiftY = minY - minResolvedY;

    resolved.forEach((node) => {
        const liveNode = context.byId.get(node.id) || node;
        const nextX = Number(node.position?.x || 0) + shiftX;
        const nextY = Number(node.position?.y || 0) + shiftY;
        const currentX = Number(liveNode.position?.x || 0);
        const currentY = Number(liveNode.position?.y || 0);

        if (nextX === currentX && nextY === currentY) return;

        context.replaceNode(node.id, {
            ...liveNode,
            position: { x: nextX, y: nextY },
        });
    });
};

const getExactCompoundContentSizeInContext = (context, compound) => {
    const members = context
        .getChildren(compound.id)
        .filter((node) => !node.hidden);
    const isLaneWrapper = isAutoParallelLaneCompound(compound);

    const leftInset = isLaneWrapper
        ? PARALLEL_LANE_CHILD_LEFT_INSET
        : COMPOUND_PADDING_X;
    const topInset = isLaneWrapper
        ? PARALLEL_LANE_CHILD_TOP_INSET
        : COMPOUND_HEADER_HEIGHT + COMPOUND_PADDING_X;

    let right = leftInset;
    let bottom = topInset;

    members.forEach((member) => {
        const size = getNodeSize(member);
        right = Math.max(
            right,
            Number(member.position?.x || 0) + size.width
        );
        bottom = Math.max(
            bottom,
            Number(member.position?.y || 0) + size.height
        );
    });

    if (isLaneWrapper) {
        return {
            width: Math.max(
                420,
                right +
                    PARALLEL_LANE_CHILD_RIGHT_INSET +
                    PARALLEL_EXIT_GUTTER
            ),
            height: Math.max(
                130,
                bottom + PARALLEL_LANE_CHILD_BOTTOM_INSET
            ),
        };
    }

    return {
        width: Math.max(
            320,
            right +
                COMPOUND_PADDING_X +
                getCompoundExitGutterWidth(compound.data?.events || [])
        ),
        height: Math.max(180, bottom + COMPOUND_BOTTOM_PADDING),
    };
};

// Children that live inside state containers should still be able to enlarge
// their parent after that parent has been manually resized. React Flow's
// expandParent support handles the live drag case; our explicit fit helpers
// below handle drops/reparenting and nested containers.
export const normalizeContainerAutoExpansion = (allNodes) => {
    if (!Array.isArray(allNodes) || allNodes.length === 0) return allNodes;

    const byId = new Map(allNodes.map((node) => [node.id, node]));
    let changed = false;

    const nextNodes = allNodes.map((node) => {
        if (!node.parentId) return node;

        const parent = byId.get(node.parentId);
        const shouldExpandParent =
            parent?.type === "compound" ||
            parent?.type === "parallel" ||
            parent?.type === "parallelLane";

        if (!shouldExpandParent || node.expandParent === true) {
            return node;
        }

        changed = true;
        return {
            ...node,
            expandParent: true,
        };
    });

    return changed ? nextNodes : allNodes;
};

// Grow a parallel state (and its lanes / automatic lane compounds) just enough
// to contain the current lane contents. Existing dimensions are floors, so a
// user resize is preserved while automatic layout may still make the state
// larger later.
const growParallelToLaneContentsImpl = (allNodes, parallelId) => {
    const context = createContainerGeometryContext(allNodes);
    growParallelToLaneContentsInContext(context, parallelId);
    return context.nodes;
};

const growParallelToLaneContentsInContext = (context, parallelId) => {
    const parallel = context.byId.get(parallelId);
    if (!parallel || parallel.type !== "parallel") return;

    const parallelLanes = context
        .getChildren(parallel.id)
        .filter((node) => node.type === "parallelLane")
        .sort(
            (a, b) =>
                Number(a.position?.y || 0) -
                Number(b.position?.y || 0)
        );

    if (parallelLanes.length === 0) return;

    // Fit automatic lane compounds first, because their required dimensions
    // determine how large the surrounding lane and parallel must become.
    parallelLanes.forEach((lane) => {
        const wrapper = context
            .getChildren(lane.id)
            .find(isAutoParallelLaneCompound);

        if (wrapper) {
            fitCompoundToChildrenInContext(context, wrapper.id);
        }
    });

    const liveParallel = context.byId.get(parallel.id) || parallel;
    const currentParallelSize = getNodeSize(liveParallel);

    let requiredParallelWidth = Math.max(420, currentParallelSize.width);
    const laneHeights = new Map();

    parallelLanes.forEach((originalLane) => {
        const lane = context.byId.get(originalLane.id) || originalLane;
        const currentLaneSize = getNodeSize(lane);
        const laneChildren = context.getChildren(lane.id);
        const wrapper = laneChildren.find(isAutoParallelLaneCompound);
        const directReferences = laneChildren.filter(isEditorReferenceNode);
        const laneMembers = wrapper
            ? [context.byId.get(wrapper.id) || wrapper, ...directReferences]
            : laneChildren.filter(
                  (child) =>
                      isParallelLaneSkillCandidate(child) ||
                      isEditorReferenceNode(child)
              );

        let maxRight = 0;
        let maxBottom = 0;

        laneMembers.forEach((member) => {
            const size = getNodeSize(member);
            maxRight = Math.max(
                maxRight,
                Number(member.position?.x || 0) + size.width
            );
            maxBottom = Math.max(
                maxBottom,
                Number(member.position?.y || 0) + size.height
            );
        });

        const requiredLaneWidth = wrapper
            ? Math.max(420, maxRight + PARALLEL_LANE_CHILD_RIGHT_INSET)
            : Math.max(
                  420,
                  maxRight + PARALLEL_LANE_CHILD_RIGHT_INSET + PARALLEL_EXIT_GUTTER
              );
        const requiredLaneHeight = wrapper
            ? Math.max(150, maxBottom + PARALLEL_LANE_CHILD_BOTTOM_INSET)
            : Math.max(130, maxBottom + PARALLEL_LANE_CHILD_BOTTOM_INSET);

        requiredParallelWidth = Math.max(
            requiredParallelWidth,
            currentLaneSize.width,
            requiredLaneWidth
        );
        laneHeights.set(
            lane.id,
            Math.max(currentLaneSize.height, requiredLaneHeight)
        );
    });

    const firstLaneY = Math.max(
        40,
        Number(parallelLanes[0]?.position?.y || 40)
    );
    let nextLaneY = firstLaneY;
    const laneGeometry = new Map();

    parallelLanes.forEach((lane) => {
        const height = laneHeights.get(lane.id) || 110;
        laneGeometry.set(lane.id, {
            y: nextLaneY,
            width: requiredParallelWidth,
            height,
        });
        nextLaneY += height;
    });

    const requiredParallelHeight = Math.max(
        180,
        currentParallelSize.height,
        nextLaneY + PARALLEL_BOTTOM_PADDING
    );

    if (liveParallel.data?.isCollapsed) {
        const savedExpanded = liveParallel.data?.expandedContainerSize || {};
        context.replaceNode(liveParallel.id, {
            ...withNodeDimensions(
                liveParallel,
                COLLAPSED_CONTAINER_WIDTH,
                COLLAPSED_CONTAINER_HEIGHT
            ),
            data: {
                ...(liveParallel.data || {}),
                expandedContainerSize: {
                    ...savedExpanded,
                    width: Math.max(
                        Number(savedExpanded.width) || 0,
                        requiredParallelWidth
                    ),
                    height: Math.max(
                        Number(savedExpanded.height) || 0,
                        requiredParallelHeight
                    ),
                },
            },
        });
    } else {
        context.replaceNode(
            liveParallel.id,
            withNodeDimensions(
                liveParallel,
                requiredParallelWidth,
                requiredParallelHeight
            )
        );
    }

    laneGeometry.forEach((geometry, laneId) => {
        const lane = context.byId.get(laneId);
        if (!lane) return;
        context.replaceNode(lane.id, {
            ...withNodeDimensions(
                lane,
                geometry.width,
                geometry.height
            ),
            position: {
                ...lane.position,
                x: 0,
                y: geometry.y,
            },
            expandParent: true,
        });
    });

    parallelLanes.forEach((lane) => {
        const geometry = laneGeometry.get(lane.id);
        if (!geometry) return;
        context
            .getChildren(lane.id)
            .filter(isAutoParallelLaneCompound)
            .forEach((wrapper) => {
                const liveWrapper = context.byId.get(wrapper.id) || wrapper;
                context.replaceNode(liveWrapper.id, {
                    ...withNodeDimensions(
                        liveWrapper,
                        geometry.width,
                        geometry.height
                    ),
                    expandParent: true,
                });
            });
    });
};

// Expansion layout differs from the everyday grow-only helpers: opening a
// container should make the visible hierarchy coherent again, including
// shrinking a stale oversized frame when its contents no longer need it.
function layoutCompoundForExpansionInContext(context, compoundId) {
    const compound = context.byId.get(compoundId);
    if (!compound || compound.type !== "compound" || compound.data?.isCollapsed) {
        return;
    }

    // Child container dimensions must be final before we resolve collisions in
    // this scope; otherwise a nested Compound/Parallel can grow into a sibling
    // after collision resolution has already finished.
    context.getChildren(compound.id).forEach((child) => {
        if (child.type === "compound") {
            layoutCompoundForExpansionInContext(context, child.id);
        } else if (child.type === "parallel") {
            layoutParallelForExpansionInContext(context, child.id);
        }
    });

    const isLaneWrapper = isAutoParallelLaneCompound(compound);
    layoutSiblingScopeInContext(context, compound.id, {
        minX: isLaneWrapper
            ? PARALLEL_LANE_CHILD_LEFT_INSET
            : COMPOUND_PADDING_X,
        minY: isLaneWrapper
            ? PARALLEL_LANE_CHILD_TOP_INSET
            : COMPOUND_HEADER_HEIGHT + COMPOUND_PADDING_X,
        gap: isLaneWrapper ? PARALLEL_NODE_GAP : COMPOUND_NODE_GAP,
        filter: (node) => node.type !== "parallelLane",
    });

    const liveCompound = context.byId.get(compound.id) || compound;
    const required = getExactCompoundContentSizeInContext(
        context,
        liveCompound
    );

    context.replaceNode(liveCompound.id, {
        ...withNodeDimensions(liveCompound, required.width, required.height),
        data: {
            ...(liveCompound.data || {}),
            expandedContainerSize: {
                ...(liveCompound.data?.expandedContainerSize || {}),
                width: required.width,
                height: required.height,
            },
        },
    });
}

function layoutParallelForExpansionInContext(context, parallelId) {
    const parallel = context.byId.get(parallelId);
    if (!parallel || parallel.type !== "parallel" || parallel.data?.isCollapsed) {
        return;
    }

    const lanes = context
        .getChildren(parallel.id)
        .filter((node) => node.type === "parallelLane")
        .sort(
            (a, b) =>
                Number(a.position?.y || 0) -
                Number(b.position?.y || 0)
        );

    if (lanes.length === 0) {
        const width = 420;
        const height = Math.max(
            180,
            PARALLEL_HEADER_HEIGHT + PARALLEL_BOTTOM_PADDING + 90
        );
        context.replaceNode(parallel.id, {
            ...withNodeDimensions(parallel, width, height),
            data: {
                ...(parallel.data || {}),
                expandedContainerSize: {
                    ...(parallel.data?.expandedContainerSize || {}),
                    width,
                    height,
                },
            },
        });
        return;
    }

    const laneIntrinsicSizes = new Map();
    let requiredParallelWidth = 420;

    lanes.forEach((originalLane) => {
        const lane = context.byId.get(originalLane.id) || originalLane;
        const laneChildren = context.getChildren(lane.id);
        const wrapper = laneChildren.find(isAutoParallelLaneCompound);

        if (wrapper) {
            layoutCompoundForExpansionInContext(context, wrapper.id);
        } else {
            // A one-state lane has no automatic wrapper, and a user-created
            // Compound/Parallel can also be a direct branch state.
            laneChildren.forEach((child) => {
                if (child.type === "compound") {
                    layoutCompoundForExpansionInContext(context, child.id);
                } else if (child.type === "parallel") {
                    layoutParallelForExpansionInContext(context, child.id);
                }
            });

            layoutSiblingScopeInContext(context, lane.id, {
                minX: PARALLEL_LANE_CHILD_LEFT_INSET,
                minY: PARALLEL_LANE_CHILD_TOP_INSET,
                gap: PARALLEL_NODE_GAP,
                filter: (node) =>
                    node.type !== "parallelLane" &&
                    !isAutoParallelLaneCompound(node),
            });
        }

        const liveChildren = context.getChildren(lane.id);
        const liveWrapper = liveChildren.find(isAutoParallelLaneCompound);
        const directReferences = liveChildren.filter(isEditorReferenceNode);
        const laneMembers = liveWrapper
            ? [liveWrapper, ...directReferences]
            : liveChildren.filter(
                  (child) =>
                      isParallelLaneSkillCandidate(child) ||
                      isEditorReferenceNode(child)
              );

        let maxRight = PARALLEL_LANE_CHILD_LEFT_INSET;
        let maxBottom = PARALLEL_LANE_CHILD_TOP_INSET;

        laneMembers.forEach((member) => {
            const size = getNodeSize(member);
            maxRight = Math.max(
                maxRight,
                Number(member.position?.x || 0) + size.width
            );
            maxBottom = Math.max(
                maxBottom,
                Number(member.position?.y || 0) + size.height
            );
        });

        const laneWidth = liveWrapper
            ? Math.max(
                  420,
                  getNodeSize(liveWrapper).width,
                  maxRight + PARALLEL_LANE_CHILD_RIGHT_INSET
              )
            : Math.max(
                  420,
                  maxRight +
                      PARALLEL_LANE_CHILD_RIGHT_INSET +
                      PARALLEL_EXIT_GUTTER
              );
        const laneHeight = liveWrapper
            ? Math.max(
                  130,
                  getNodeSize(liveWrapper).height,
                  maxBottom + PARALLEL_LANE_CHILD_BOTTOM_INSET
              )
            : Math.max(
                  130,
                  maxBottom + PARALLEL_LANE_CHILD_BOTTOM_INSET
              );

        laneIntrinsicSizes.set(lane.id, {
            width: laneWidth,
            height: laneHeight,
            wrapperId: liveWrapper?.id || null,
        });
        requiredParallelWidth = Math.max(requiredParallelWidth, laneWidth);
    });

    let nextLaneY = PARALLEL_HEADER_HEIGHT;
    lanes.forEach((lane) => {
        const intrinsic = laneIntrinsicSizes.get(lane.id) || {
            height: 130,
            wrapperId: null,
        };
        const liveLane = context.byId.get(lane.id) || lane;
        const laneHeight = intrinsic.height;

        context.replaceNode(liveLane.id, {
            ...withNodeDimensions(
                liveLane,
                requiredParallelWidth,
                laneHeight
            ),
            position: {
                ...liveLane.position,
                x: 0,
                y: nextLaneY,
            },
            expandParent: true,
        });

        // The automatic lane Compound is a structural routing wrapper whose UI
        // is hidden. Make it exactly cover the lane after its own children have
        // been laid out; this keeps its boundary handles aligned with the
        // visible lane frame without influencing the intrinsic size calculation.
        if (intrinsic.wrapperId) {
            const wrapper = context.byId.get(intrinsic.wrapperId);
            if (wrapper) {
                context.replaceNode(wrapper.id, {
                    ...withNodeDimensions(
                        wrapper,
                        requiredParallelWidth,
                        laneHeight
                    ),
                    position: { x: 0, y: 0 },
                    expandParent: true,
                });
            }
        }

        nextLaneY += laneHeight;
    });

    const requiredParallelHeight = Math.max(
        180,
        nextLaneY + PARALLEL_BOTTOM_PADDING
    );
    const liveParallel = context.byId.get(parallel.id) || parallel;

    context.replaceNode(liveParallel.id, {
        ...withNodeDimensions(
            liveParallel,
            requiredParallelWidth,
            requiredParallelHeight
        ),
        data: {
            ...(liveParallel.data || {}),
            expandedContainerSize: {
                ...(liveParallel.data?.expandedContainerSize || {}),
                width: requiredParallelWidth,
                height: requiredParallelHeight,
            },
        },
    });
}

const getTopmostExpandedStateContainerId = (context, containerId) => {
    let rootId = containerId;
    let current = context.byId.get(containerId);
    const visited = new Set();

    while (current?.parentId && !visited.has(current.parentId)) {
        visited.add(current.parentId);
        const parent = context.byId.get(current.parentId);
        if (!parent) break;

        if (
            (parent.type === "compound" || parent.type === "parallel") &&
            !parent.data?.isCollapsed
        ) {
            rootId = parent.id;
        }

        current = parent;
    }

    return rootId;
};

const layoutStateContainerForExpansionImpl = (allNodes, containerId) => {
    if (!Array.isArray(allNodes) || allNodes.length === 0 || !containerId) {
        return allNodes;
    }

    const context = createContainerGeometryContext(allNodes);
    const container = context.byId.get(containerId);
    if (
        !container ||
        (container.type !== "compound" && container.type !== "parallel")
    ) {
        return allNodes;
    }

    // If this is nested, relayout the highest visible enclosing state. This
    // lets the newly expanded child grow first and then moves/resizes its
    // siblings and ancestors around that final geometry.
    const rootId = getTopmostExpandedStateContainerId(context, containerId);
    const root = context.byId.get(rootId);

    if (root?.type === "compound") {
        layoutCompoundForExpansionInContext(context, root.id);
    } else if (root?.type === "parallel") {
        layoutParallelForExpansionInContext(context, root.id);
    }

    return orderNodesParentsFirst(context.nodes);
};

// Re-evaluate nested state containers from the inside out using one shared
// geometry context. Previously every container pass rescanned and remapped the
// complete node array, which made Compound/Parallel-heavy graphs approach
// O(containers * nodes).
const growAllStateContainersToContentsImpl = (allNodes) => {
    const context = createContainerGeometryContext(allNodes);

    const containers = (allNodes || [])
        .filter(
            (node) =>
                node.type === "compound" ||
                node.type === "parallel"
        )
        .sort(
            (a, b) =>
                getNodeNestingDepthFromContext(b, context) -
                getNodeNestingDepthFromContext(a, context)
        );

    containers.forEach((container) => {
        if (container.type === "compound") {
            fitCompoundToChildrenInContext(context, container.id);
        } else {
            growParallelToLaneContentsInContext(context, container.id);
        }
    });

    return context.nodes;
};

export const NODE_COLLISION_OPTIONS = {
    // Match the React Flow example: keep resolving until the scope is clear.
    maxIterations: Infinity,
    overlapThreshold: 0.5,
    margin: 15,
};

export const resolveNodeCollisionsAndRefit = (
    allNodes,
    focusNodeId,
    { refitContainers = true } = {}
) => {
    let nextNodes = resolveCollisionScope(
        allNodes,
        focusNodeId,
        NODE_COLLISION_OPTIONS
    );

    const focusNode = nextNodes.find((node) => node.id === focusNodeId);
    if (!focusNode?.parentId) {
        return orderNodesParentsFirst(nextNodes);
    }

    const parent = nextNodes.find(
        (node) => node.id === focusNode.parentId
    );

    // The reference collision solver is intentionally unbounded. Inside our
    // subflows that could push a sibling through the parent's left/top edge.
    // Shift the whole resolved sibling group together so its relative spacing
    // stays intact while respecting the container's content inset.
    const minContentX =
        parent?.type === "compound"
            ? COMPOUND_PADDING_X
            : parent?.type === "parallelLane"
              ? PARALLEL_LANE_CHILD_LEFT_INSET
              : 20;
    const minContentY =
        parent?.type === "compound"
            ? COMPOUND_HEADER_HEIGHT + COMPOUND_PADDING_X
            : parent?.type === "parallelLane"
              ? PARALLEL_LANE_CHILD_TOP_INSET
              : 20;
    const siblings = nextNodes.filter(
        (node) =>
            (node.parentId || null) === (focusNode.parentId || null) &&
            node.type !== "parallelLane"
    );

    if (siblings.length > 0) {
        const currentMinX = Math.min(
            ...siblings.map((node) => Number(node.position?.x || 0))
        );
        const currentMinY = Math.min(
            ...siblings.map((node) => Number(node.position?.y || 0))
        );
        const shiftX = Math.max(0, minContentX - currentMinX);
        const shiftY = Math.max(0, minContentY - currentMinY);

        if (shiftX > 0 || shiftY > 0) {
            const siblingIds = new Set(siblings.map((node) => node.id));
            nextNodes = nextNodes.map((node) =>
                siblingIds.has(node.id)
                    ? {
                        ...node,
                        position: {
                            x: Number(node.position?.x || 0) + shiftX,
                            y: Number(node.position?.y || 0) + shiftY,
                        },
                    }
                    : node
            );
        }
    }

    // Adding/removing children may intentionally refit their container, but a
    // plain move inside an existing Compound/Parallel must not resize it. The
    // drag hook disables this final refit for same-container movement while
    // preserving collision resolution itself.
    if (refitContainers) {
        if (parent?.type === "compound") {
            nextNodes = fitCompoundAndAncestorCompounds(
                nextNodes,
                parent.id
            );
        } else if (parent?.type === "parallelLane" && parent.parentId) {
            nextNodes = growParallelToLaneContents(
                nextNodes,
                parent.parentId
            );
        }
    }

    return orderNodesParentsFirst(nextNodes);
};

/*
 * Parallel lanes use an automatically managed compound whenever they contain
 * more than one executable state. It is a normal compound from the editor's
 * point of view (visible, selectable, with an initial child and entry edge);
 * the autoParallelLaneCompound flag is only used for lane bookkeeping.
 *
 * 0 states -> no wrapper unless a compound already exists
 * 1 state  -> direct child unless a compound already exists
 * 2+       -> all states live inside one normal compound
 * Existing compounds are never auto-dissolved.
 */
export const getNextParallelLaneCompoundName = (allNodes) => {
    const usedNames = new Set(
        (allNodes || [])
            .flatMap((node) => [node.data?.label, node.data?.fullSkillName])
            .filter(Boolean)
            .map(String)
    );

    let index = 1;
    while (usedNames.has(`lane_${index}`)) {
        index += 1;
    }

    return `lane_${index}`;
};

// Container-heavy operations are measured at their public boundaries. The
// semantic graph stays unchanged; only calls exceeding the threshold are
// logged so large Compound/Parallel workflows can be profiled without
// flooding the console.
export const fitCompoundAndAncestorCompounds = (allNodes, compoundId) =>
    measureContainerTask(
        "fit compound and ancestors",
        () => fitCompoundAndAncestorCompoundsImpl(allNodes, compoundId),
        { nodes: allNodes?.length || 0, compoundId }
    );

export const growParallelToLaneContents = (allNodes, parallelId) =>
    measureContainerTask(
        "grow parallel to lane contents",
        () => growParallelToLaneContentsImpl(allNodes, parallelId),
        { nodes: allNodes?.length || 0, parallelId }
    );

export const layoutStateContainerForExpansion = (allNodes, containerId) =>
    measureContainerTask(
        "layout expanded state container",
        () => layoutStateContainerForExpansionImpl(allNodes, containerId),
        { nodes: allNodes?.length || 0, containerId }
    );

export const growAllStateContainersToContents = (allNodes) =>
    measureContainerTask(
        "grow all compound/parallel containers",
        () => growAllStateContainersToContentsImpl(allNodes),
        { nodes: allNodes?.length || 0 }
    );

