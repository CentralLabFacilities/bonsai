import { measureContainerTask } from "./containerPerf.js";
import { resolveCollisionScope } from "./nodeCollisions";

export const getNodeId = () => `skill-node-${crypto.randomUUID()}`;

export const COLLAPSED_CONTAINER_WIDTH = 210;
export const COLLAPSED_CONTAINER_HEIGHT = 80;
export const PARALLEL_EXIT_GUTTER = 150;
export const PARALLEL_NODE_GAP = 30;
export const PARALLEL_HEADER_HEIGHT = 64;
export const PARALLEL_LANE_CHILD_TOP_INSET = 30;
export const COMPOUND_NODE_GAP = 30;
export const COMPOUND_PADDING_X = 30;
export const COMPOUND_HEADER_HEIGHT = 45;
export const COMPOUND_BOTTOM_PADDING = 30;
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

export const isCompoundInitialChildCandidate = (node) =>
    Boolean(
        node &&
        node.type !== "slot" &&
        node.type !== "parallelLane"
    );

// Any real SCXML state can be a branch state in a parallel lane. Structural
// states (compound/parallel) therefore participate exactly like skills. The
// automatically managed lane wrapper itself is excluded so it never tries to
// wrap itself.
export const isParallelLaneSkillCandidate = (node) =>
    Boolean(
        node &&
        node.type !== "slot" &&
        node.type !== "parallelLane" &&
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
        const laneMembers = wrapper
            ? [context.byId.get(wrapper.id) || wrapper]
            : laneChildren.filter(isParallelLaneSkillCandidate);

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
            ? Math.max(420, maxRight)
            : Math.max(420, 15 + maxRight + PARALLEL_EXIT_GUTTER);
        const requiredLaneHeight = wrapper
            ? Math.max(140, maxBottom)
            : Math.max(110, maxBottom + 20);

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
        nextLaneY + 35
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
        parent?.type === "compound" ? COMPOUND_PADDING_X : 20;
    const minContentY =
        parent?.type === "compound" ? COMPOUND_HEADER_HEIGHT : 20;
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

const normalizeParallelLaneCompoundsImpl = (allNodes) => {
    if (!Array.isArray(allNodes) || allNodes.length === 0) {
        return allNodes;
    }

    /*
     * This normalization runs after every semantic node change. Parallel-heavy
     * graphs used to rebuild a full node-id map and repeatedly filter the whole
     * node array once per lane. Keep one mutable hierarchy index for the entire
     * pass instead. Reparenting a state updates only the affected parent buckets,
     * while all lane/compound membership lookups stay O(1) + direct children.
     */
    const originalOrder = allNodes.map((node) => node.id);
    const byId = new Map(allNodes.map((node) => [node.id, node]));
    const childrenByParent = new Map();
    const addedIds = [];
    const removedIds = new Set();
    let changed = false;

    const addChildId = (parentId, nodeId) => {
        if (!parentId) return;
        if (!childrenByParent.has(parentId)) {
            childrenByParent.set(parentId, []);
        }
        const children = childrenByParent.get(parentId);
        if (!children.includes(nodeId)) children.push(nodeId);
    };

    const removeChildId = (parentId, nodeId) => {
        if (!parentId) return;
        const children = childrenByParent.get(parentId);
        if (!children) return;
        const index = children.indexOf(nodeId);
        if (index >= 0) children.splice(index, 1);
    };

    allNodes.forEach((node) => addChildId(node.parentId, node.id));

    const getChildren = (parentId) =>
        (childrenByParent.get(parentId) || [])
            .map((id) => byId.get(id))
            .filter(Boolean);

    const replaceNode = (nodeId, nextNode) => {
        const previous = byId.get(nodeId);
        if (!previous || !nextNode || previous === nextNode) return;

        if (previous.parentId !== nextNode.parentId) {
            removeChildId(previous.parentId, nodeId);
            addChildId(nextNode.parentId, nodeId);
        }

        byId.set(nodeId, nextNode);
        changed = true;
    };

    const addNode = (node) => {
        if (!node?.id || byId.has(node.id)) return;
        byId.set(node.id, node);
        addChildId(node.parentId, node.id);
        addedIds.push(node.id);
        changed = true;
    };

    const removeNode = (nodeId) => {
        const node = byId.get(nodeId);
        if (!node) return;
        removeChildId(node.parentId, nodeId);
        byId.delete(nodeId);
        removedIds.add(nodeId);
        changed = true;
    };

    // Allocate automatic lane-compound names without rescanning every node for
    // every lane that needs a wrapper.
    const usedNames = new Set(
        allNodes
            .flatMap((node) => [node.data?.label, node.data?.fullSkillName])
            .filter(Boolean)
            .map(String)
    );
    let nextLaneNameIndex = 1;
    const allocateLaneCompoundName = () => {
        while (usedNames.has(`lane_${nextLaneNameIndex}`)) {
            nextLaneNameIndex += 1;
        }
        const name = `lane_${nextLaneNameIndex}`;
        usedNames.add(name);
        nextLaneNameIndex += 1;
        return name;
    };

    const laneIds = allNodes
        .filter((node) => node.type === "parallelLane")
        .map((node) => node.id);

    laneIds.forEach((laneId) => {
        const currentLane = byId.get(laneId);
        if (!currentLane) return;

        const directChildren = getChildren(currentLane.id);
        const wrappers = directChildren.filter(isAutoParallelLaneCompound);

        // There should only ever be one automatic lane compound. If an old
        // file contains more than one, the first is kept and the others are
        // merged into it below.
        let wrapper = wrappers[0] || null;
        const extraWrappers = wrappers.slice(1);
        const extraWrapperIds = new Set(extraWrappers.map((node) => node.id));

        const directSkills = directChildren.filter(isParallelLaneSkillCandidate);
        const wrappedSkills = wrapper
            ? getChildren(wrapper.id).filter(isParallelLaneSkillCandidate)
            : [];
        const extraWrappedSkills = extraWrappers.flatMap((extraWrapper) =>
            getChildren(extraWrapper.id).filter(isParallelLaneSkillCandidate)
        );

        const allSkills = [];
        const seenSkillIds = new Set();
        [...wrappedSkills, ...extraWrappedSkills, ...directSkills].forEach(
            (node) => {
                if (!node || seenSkillIds.has(node.id)) return;
                seenSkillIds.add(node.id);
                allSkills.push(node);
            }
        );

        // A lane with zero/one direct state does not need an automatically
        // managed compound. Existing lane compounds are deliberately kept.
        if (!wrapper && allSkills.length <= 1) {
            return;
        }

        const laneSize = getNodeSize(currentLane);
        const laneWidth = Math.max(1, Number(laneSize.width) || 420);
        const laneHeight = Math.max(1, Number(laneSize.height) || 140);

        /*
         * If the lane already contains a normal compound and another sibling
         * state is added, that existing compound becomes the lane compound.
         * Do NOT create another compound around it.
         */
        if (!wrapper && allSkills.length > 1) {
            const existingDirectCompound = directSkills.find(
                (node) => node.type === "compound"
            );

            if (existingDirectCompound) {
                const oldWrapperPosition = existingDirectCompound.position || {
                    x: 0,
                    y: 0,
                };
                const existingChildren = getChildren(
                    existingDirectCompound.id
                ).filter(isCompoundInitialChildCandidate);
                const siblingsToAbsorb = directSkills.filter(
                    (node) => node.id !== existingDirectCompound.id
                );
                const compoundChildren = [];
                const compoundChildIds = new Set();
                [...existingChildren, ...siblingsToAbsorb].forEach((node) => {
                    if (!node || compoundChildIds.has(node.id)) return;
                    compoundChildIds.add(node.id);
                    compoundChildren.push(node);
                });

                const storedInitialId =
                    existingDirectCompound.data?.initialChildId;
                const initialChild =
                    compoundChildren.find(
                        (node) => node.id === storedInitialId
                    ) ||
                    compoundChildren.find((node) => node.data?.isInitial) ||
                    compoundChildren[0] ||
                    null;
                const desiredInitialId = initialChild?.id || null;

                replaceNode(existingDirectCompound.id, {
                    ...existingDirectCompound,
                    position: { x: 0, y: 0 },
                    parentId: currentLane.id,
                    extent: "parent",
                    expandParent: true,
                    draggable: false,
                    selectable: false,
                    width: laneWidth,
                    height: laneHeight,
                    style: {
                        ...existingDirectCompound.style,
                        width: laneWidth,
                        height: laneHeight,
                    },
                    data: {
                        ...existingDirectCompound.data,
                        initialChildId: desiredInitialId,
                        autoParallelLaneCompound: true,
                    },
                });

                existingChildren.forEach((child) => {
                    replaceNode(child.id, {
                        ...child,
                        position: {
                            x:
                                Number(oldWrapperPosition.x || 0) +
                                Number(child.position?.x || 0),
                            y:
                                Number(oldWrapperPosition.y || 0) +
                                Number(child.position?.y || 0),
                        },
                        data: {
                            ...child.data,
                            isInitial: child.id === desiredInitialId,
                        },
                    });
                });

                siblingsToAbsorb.forEach((sibling) => {
                    const liveSibling = byId.get(sibling.id) || sibling;
                    replaceNode(sibling.id, {
                        ...liveSibling,
                        parentId: existingDirectCompound.id,
                        extent: "parent",
                        expandParent: true,
                        data: {
                            ...liveSibling.data,
                            isInitial: sibling.id === desiredInitialId,
                        },
                    });
                });

                return;
            }
        }

        if (!wrapper) {
            const wrapperId = getNodeId();
            const initialSkill =
                allSkills.find((node) => node.data?.isInitial) || allSkills[0];
            const compoundName = allocateLaneCompoundName();

            const autoWrapper = {
                id: wrapperId,
                type: "compound",
                position: { x: 0, y: 0 },
                parentId: currentLane.id,
                extent: "parent",
                expandParent: true,
                draggable: false,
                selectable: false,
                width: laneWidth,
                height: laneHeight,
                style: {
                    width: laneWidth,
                    height: laneHeight,
                },
                data: {
                    label: compoundName,
                    fullSkillName: compoundName,
                    isInitial: false,
                    initialChildId: initialSkill.id,
                    events: [],
                    onEntry: [],
                    onExit: [],
                    autoParallelLaneCompound: true,
                },
            };

            addNode(autoWrapper);
            wrapper = autoWrapper;

            allSkills.forEach((skill) => {
                const liveSkill = byId.get(skill.id) || skill;
                replaceNode(skill.id, {
                    ...liveSkill,
                    parentId: wrapperId,
                    extent: "parent",
                    expandParent: true,
                    position: {
                        x: Number(liveSkill.position?.x || 0),
                        y: Number(liveSkill.position?.y || 0),
                    },
                    data: {
                        ...liveSkill.data,
                        isInitial: liveSkill.id === initialSkill.id,
                    },
                });
            });

            return;
        }

        // Existing lane compound: keep it as the single region compound and
        // absorb direct lane states or children of duplicate wrappers into it.
        wrapper = byId.get(wrapper.id) || wrapper;
        const wrapperPosition = wrapper.position || { x: 0, y: 0 };
        const currentInitialId = wrapper.data?.initialChildId;
        const initialSkill =
            allSkills.find((node) => node.id === currentInitialId) ||
            allSkills.find((node) => node.data?.isInitial) ||
            allSkills[0] ||
            null;

        const needsMerge =
            directSkills.length > 0 ||
            extraWrappedSkills.length > 0 ||
            extraWrapperIds.size > 0;
        const desiredWrapperWidth = laneWidth;
        const desiredWrapperHeight = laneHeight;
        const needsResize =
            Number(wrapper.width) !== desiredWrapperWidth ||
            Number(wrapper.height) !== desiredWrapperHeight ||
            Number(wrapper.style?.width) !== desiredWrapperWidth ||
            Number(wrapper.style?.height) !== desiredWrapperHeight;
        const desiredInitialId = initialSkill?.id || null;
        const needsInitialUpdate =
            (wrapper.data?.initialChildId || null) !== desiredInitialId;
        const needsPositionReset =
            Number(wrapper.position?.x || 0) !== 0 ||
            Number(wrapper.position?.y || 0) !== 0;
        const needsPresentationUpgrade =
            wrapper.className === "compound-in-lane" ||
            wrapper.draggable !== false ||
            wrapper.selectable !== false;

        if (
            !needsMerge &&
            !needsResize &&
            !needsPositionReset &&
            !needsInitialUpdate &&
            !needsPresentationUpgrade
        ) {
            return;
        }

        const { className: _legacyClassName, ...normalCompound } = wrapper;
        replaceNode(wrapper.id, {
            ...normalCompound,
            position: { x: 0, y: 0 },
            draggable: false,
            selectable: false,
            width: desiredWrapperWidth,
            height: desiredWrapperHeight,
            style: {
                ...wrapper.style,
                width: desiredWrapperWidth,
                height: desiredWrapperHeight,
            },
            data: {
                ...wrapper.data,
                initialChildId: desiredInitialId,
                autoParallelLaneCompound: true,
            },
        });

        const allSkillIds = new Set(allSkills.map((skill) => skill.id));
        allSkillIds.forEach((skillId) => {
            const node = byId.get(skillId);
            if (!node) return;

            if (node.parentId === wrapper.id) {
                replaceNode(node.id, {
                    ...node,
                    position: needsPositionReset
                        ? {
                              x:
                                  Number(wrapperPosition.x || 0) +
                                  Number(node.position?.x || 0),
                              y:
                                  Number(wrapperPosition.y || 0) +
                                  Number(node.position?.y || 0),
                          }
                        : node.position,
                    data: {
                        ...node.data,
                        isInitial: node.id === desiredInitialId,
                    },
                });
                return;
            }

            const oldParent = byId.get(node.parentId);
            const oldParentPosition = isAutoParallelLaneCompound(oldParent)
                ? oldParent.position || { x: 0, y: 0 }
                : { x: 0, y: 0 };
            const laneX =
                Number(oldParentPosition.x || 0) +
                Number(node.position?.x || 0);
            const laneY =
                Number(oldParentPosition.y || 0) +
                Number(node.position?.y || 0);

            replaceNode(node.id, {
                ...node,
                parentId: wrapper.id,
                extent: "parent",
                expandParent: true,
                position: {
                    x: laneX - Number(wrapperPosition.x || 0),
                    y: laneY - Number(wrapperPosition.y || 0),
                },
                data: {
                    ...node.data,
                    isInitial: node.id === desiredInitialId,
                },
            });
        });

        extraWrapperIds.forEach((extraWrapperId) => removeNode(extraWrapperId));
    });

    if (!changed) return allNodes;

    const normalized = [
        ...originalOrder
            .filter((id) => !removedIds.has(id))
            .map((id) => byId.get(id))
            .filter(Boolean),
        ...addedIds.map((id) => byId.get(id)).filter(Boolean),
    ];

    return orderNodesParentsFirst(normalized);
};

const normalizeCompoundInitialStatesImpl = (allNodes) => {
    if (!Array.isArray(allNodes) || allNodes.length === 0) {
        return allNodes;
    }

    const compounds = [];
    const childrenByParent = new Map();

    allNodes.forEach((node) => {
        if (node.type === "compound") compounds.push(node);
        if (!node.parentId) return;
        if (!childrenByParent.has(node.parentId)) {
            childrenByParent.set(node.parentId, []);
        }
        childrenByParent.get(node.parentId).push(node);
    });

    if (compounds.length === 0) {
        return allNodes;
    }

    // This pass also runs after every semantic node change. Resolve each
    // Compound's direct children from the hierarchy index instead of filtering
    // the complete node array once per Compound.
    const desiredInitialByCompound = new Map();

    compounds.forEach((compound) => {
        const children = (childrenByParent.get(compound.id) || []).filter(
            isCompoundInitialChildCandidate
        );

        if (children.length === 0) {
            desiredInitialByCompound.set(compound.id, null);
            return;
        }

        const compoundData = compound.data || {};
        const hasStoredInitial = Object.prototype.hasOwnProperty.call(
            compoundData,
            "initialChildId"
        );
        const storedInitialId = compoundData.initialChildId;
        const storedInitialStillExists = children.some(
            (child) => child.id === storedInitialId
        );
        const existingInitial = children.find(
            (child) => child.data?.isInitial
        );
        const explicitlyUnsetInitial =
            hasStoredInitial &&
            (storedInitialId === null || storedInitialId === "");

        desiredInitialByCompound.set(
            compound.id,
            storedInitialStillExists
                ? storedInitialId
                : explicitlyUnsetInitial
                    ? null
                    : existingInitial?.id || children[0].id
        );
    });

    let changed = false;

    const normalized = allNodes.map((node) => {
        if (node.type === "compound") {
            const desiredInitialId =
                desiredInitialByCompound.get(node.id) || null;
            const currentInitialId =
                node.data?.initialChildId || null;

            if (currentInitialId === desiredInitialId) {
                return node;
            }

            changed = true;
            return {
                ...node,
                data: {
                    ...node.data,
                    initialChildId: desiredInitialId,
                },
            };
        }

        if (
            node.parentId &&
            desiredInitialByCompound.has(node.parentId)
        ) {
            const desiredInitialId =
                desiredInitialByCompound.get(node.parentId);
            const shouldBeInitial =
                Boolean(desiredInitialId) &&
                node.id === desiredInitialId;
            const currentlyInitial =
                Boolean(node.data?.isInitial);

            if (currentlyInitial === shouldBeInitial) {
                return node;
            }

            changed = true;
            return {
                ...node,
                data: {
                    ...node.data,
                    isInitial: shouldBeInitial,
                },
            };
        }

        return node;
    });

    return changed ? normalized : allNodes;
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

export const growAllStateContainersToContents = (allNodes) =>
    measureContainerTask(
        "grow all compound/parallel containers",
        () => growAllStateContainersToContentsImpl(allNodes),
        { nodes: allNodes?.length || 0 }
    );

export const normalizeParallelLaneCompounds = (allNodes) =>
    measureContainerTask(
        "normalize parallel lane compounds",
        () => normalizeParallelLaneCompoundsImpl(allNodes),
        { nodes: allNodes?.length || 0 }
    );

export const normalizeCompoundInitialStates = (allNodes) =>
    measureContainerTask(
        "normalize compound initial states",
        () => normalizeCompoundInitialStatesImpl(allNodes),
        { nodes: allNodes?.length || 0 }
    );
