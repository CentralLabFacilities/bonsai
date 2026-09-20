import { resolveCollisionScope } from "./nodeCollisions";

export const getNodeId = () => `skill-node-${crypto.randomUUID()}`;

export const PARALLEL_EXIT_GUTTER = 150;
export const PARALLEL_NODE_GAP = 30;
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

export const getDirectCompoundForNode = (node, allNodes) => {
    if (!node?.parentId) return null;
    const parent = allNodes.find((candidate) => candidate.id === node.parentId);
    return parent?.type === "compound" ? parent : null;
};

export const fitCompoundToChildren = (allNodes, compoundId) => {
    const compound = (allNodes || []).find((node) => node.id === compoundId);
    if (!compound || compound.type !== "compound") return allNodes;

    const members = allNodes.filter((node) => node.parentId === compoundId);

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

    return allNodes.map((node) => {
        if (node.id !== compoundId) return node;

        const currentSize = getNodeSize(node);

        if (node.data?.isCollapsed) {
            const savedExpanded = node.data?.expandedContainerSize || {};
            const expandedWidth = Math.max(
                Number(savedExpanded.width) || 0,
                currentSize.width,
                requiredWidth
            );
            const expandedHeight = Math.max(
                Number(savedExpanded.height) || 0,
                requiredHeight
            );

            // Keep the compact collapsed height on screen, but remember a
            // large enough expanded size for all children. Manual resizing
            // therefore becomes a minimum size rather than disabling auto-grow.
            return {
                ...withNodeDimensions(node, expandedWidth, currentSize.height),
                data: {
                    ...(node.data || {}),
                    expandedContainerSize: {
                        ...savedExpanded,
                        width: expandedWidth,
                        height: expandedHeight,
                    },
                },
            };
        }

        const width = Math.max(currentSize.width, requiredWidth);
        const height = Math.max(currentSize.height, requiredHeight);

        return withNodeDimensions(node, width, height);
    });
};

export const fitCompoundAndAncestorCompounds = (allNodes, compoundId) => {
    let nextNodes = allNodes;
    let currentId = compoundId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        nextNodes = fitCompoundToChildren(nextNodes, currentId);

        const current = nextNodes.find((node) => node.id === currentId);
        if (!current?.parentId) break;

        const parent = nextNodes.find((node) => node.id === current.parentId);
        currentId = parent?.type === "compound" ? parent.id : null;
    }

    // A compound can itself live in a parallel lane. If it grows, the lane
    // and enclosing parallel must grow too instead of clipping the compound.
    const fittedCompound = nextNodes.find((node) => node.id === compoundId);
    const lane = fittedCompound
        ? getLaneForNode(fittedCompound, nextNodes)
        : null;

    if (lane?.parentId) {
        nextNodes = growParallelToLaneContents(nextNodes, lane.parentId);
    }

    return nextNodes;
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
export const growParallelToLaneContents = (allNodes, parallelId) => {
    let nextNodes = allNodes;
    const parallel = nextNodes.find((node) => node.id === parallelId);
    if (!parallel || parallel.type !== "parallel") return nextNodes;

    const parallelLanes = nextNodes
        .filter(
            (node) =>
                node.type === "parallelLane" &&
                node.parentId === parallel.id
        )
        .sort(
            (a, b) =>
                Number(a.position?.y || 0) -
                Number(b.position?.y || 0)
        );

    if (parallelLanes.length === 0) return nextNodes;

    // Fit automatic lane compounds first, because their required dimensions
    // determine how large the surrounding lane and parallel must become.
    parallelLanes.forEach((lane) => {
        const wrapper = nextNodes.find(
            (node) =>
                node.parentId === lane.id &&
                isAutoParallelLaneCompound(node)
        );

        if (wrapper) {
            nextNodes = fitCompoundToChildren(nextNodes, wrapper.id);
        }
    });

    const currentParallelSize = getNodeSize(
        nextNodes.find((node) => node.id === parallel.id) || parallel
    );

    let requiredParallelWidth = Math.max(420, currentParallelSize.width);
    const laneHeights = new Map();

    parallelLanes.forEach((originalLane) => {
        const lane =
            nextNodes.find((node) => node.id === originalLane.id) ||
            originalLane;
        const currentLaneSize = getNodeSize(lane);
        const laneChildren = nextNodes.filter(
            (node) => node.parentId === lane.id
        );
        const wrapper = laneChildren.find(isAutoParallelLaneCompound);
        const laneMembers = wrapper
            ? [wrapper]
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

    return nextNodes.map((node) => {
        if (node.id === parallel.id) {
            return withNodeDimensions(
                node,
                requiredParallelWidth,
                requiredParallelHeight
            );
        }

        const geometry = laneGeometry.get(node.id);
        if (geometry) {
            return {
                ...withNodeDimensions(
                    node,
                    geometry.width,
                    geometry.height
                ),
                position: {
                    ...node.position,
                    x: 0,
                    y: geometry.y,
                },
                expandParent: true,
            };
        }

        if (
            isAutoParallelLaneCompound(node) &&
            laneGeometry.has(node.parentId)
        ) {
            const laneSize = laneGeometry.get(node.parentId);
            return {
                ...withNodeDimensions(
                    node,
                    laneSize.width,
                    laneSize.height
                ),
                expandParent: true,
            };
        }

        return node;
    });
};

// Re-evaluate all nested state containers from the inside out. Because the
// individual fit functions are grow-only, this is stable and lets a resize of
// any child propagate through Compound -> Parallel -> Compound chains.
export const growAllStateContainersToContents = (allNodes) => {
    let nextNodes = allNodes;

    const containers = (allNodes || [])
        .filter(
            (node) =>
                node.type === "compound" ||
                node.type === "parallel"
        )
        .sort(
            (a, b) =>
                getNodeNestingDepth(b, allNodes) -
                getNodeNestingDepth(a, allNodes)
        );

    containers.forEach((container) => {
        if (container.type === "compound") {
            nextNodes = fitCompoundToChildren(nextNodes, container.id);
        } else {
            nextNodes = growParallelToLaneContents(
                nextNodes,
                container.id
            );
        }
    });

    return nextNodes;
};

export const NODE_COLLISION_OPTIONS = {
    // Match the React Flow example: keep resolving until the scope is clear.
    maxIterations: Infinity,
    overlapThreshold: 0.5,
    margin: 15,
};

export const resolveNodeCollisionsAndRefit = (allNodes, focusNodeId) => {
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

    // Collision resolution can move a child farther than the container's
    // previous bounds. Re-run the existing grow logic afterwards so compound
    // and parallel layouts remain valid instead of clipping the moved nodes.
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

export const normalizeParallelLaneCompounds = (allNodes) => {
    if (!Array.isArray(allNodes) || allNodes.length === 0) {
        return allNodes;
    }

    let nextNodes = allNodes;
    let changed = false;

    const lanes = allNodes.filter((node) => node.type === "parallelLane");

    lanes.forEach((lane) => {
        const currentById = new Map(nextNodes.map((node) => [node.id, node]));
        const currentLane = currentById.get(lane.id);
        if (!currentLane) return;

        const directChildren = nextNodes.filter(
            (node) => node.parentId === currentLane.id
        );

        const wrappers = directChildren.filter(
            (node) => isAutoParallelLaneCompound(node)
        );

        // There should only ever be one automatic lane compound. If an old
        // file contains more than one, the first is kept and the others are
        // merged into it below.
        let wrapper = wrappers[0] || null;
        const extraWrapperIds = new Set(wrappers.slice(1).map((node) => node.id));

        const directSkills = directChildren.filter(isParallelLaneSkillCandidate);
        const wrappedSkills = wrapper
            ? nextNodes.filter(
                (node) =>
                    node.parentId === wrapper.id &&
                    isParallelLaneSkillCandidate(node)
            )
            : [];
        const extraWrappedSkills = nextNodes.filter(
            (node) =>
                extraWrapperIds.has(node.parentId) &&
                isParallelLaneSkillCandidate(node)
        );

        const allSkills = [
            ...wrappedSkills,
            ...extraWrappedSkills,
            ...directSkills,
        ].filter(
            (node, index, values) =>
                values.findIndex((candidate) => candidate.id === node.id) === index
        );

        // A lane with zero/one direct state does not need an automatically
        // managed compound. Existing lane compounds are deliberately kept.
        if (!wrapper && allSkills.length <= 1) {
            return;
        }

        const laneWidth = Number(currentLane.style?.width) || 420;
        const laneHeight = Number(currentLane.style?.height) || 140;

        /*
         * If the lane already contains a normal compound and another sibling
         * state is added, that existing compound becomes the lane compound.
         * Do NOT create another compound around it. This keeps the region
         * structure flat:
         *
         *   lane -> compound -> states
         *
         * instead of:
         *
         *   lane -> auto compound -> existing compound -> states
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
                const existingChildren = nextNodes.filter(
                    (node) =>
                        node.parentId === existingDirectCompound.id &&
                        isCompoundInitialChildCandidate(node)
                );
                const siblingsToAbsorb = directSkills.filter(
                    (node) => node.id !== existingDirectCompound.id
                );
                const compoundChildren = [
                    ...existingChildren,
                    ...siblingsToAbsorb,
                ].filter(
                    (node, index, values) =>
                        values.findIndex(
                            (candidate) => candidate.id === node.id
                        ) === index
                );

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
                const siblingIds = new Set(
                    siblingsToAbsorb.map((node) => node.id)
                );

                const existingCompoundSize = getNodeSize(existingDirectCompound);
                const promotedWidth = Math.max(laneWidth, existingCompoundSize.width);
                const promotedHeight = Math.max(laneHeight, existingCompoundSize.height);

                nextNodes = nextNodes.map((node) => {
                    if (node.id === existingDirectCompound.id) {
                        return {
                            ...node,
                            position: { x: 0, y: 0 },
                            parentId: currentLane.id,
                            extent: "parent",
                            expandParent: true,
                            draggable: true,
                            selectable: true,
                            width: promotedWidth,
                            height: promotedHeight,
                            style: {
                                ...node.style,
                                width: promotedWidth,
                                height: promotedHeight,
                            },
                            data: {
                                ...node.data,
                                initialChildId: desiredInitialId,
                                autoParallelLaneCompound: true,
                            },
                        };
                    }

                    // Moving the compound itself to the lane origin must not
                    // visually move children it already contained.
                    if (node.parentId === existingDirectCompound.id) {
                        return {
                            ...node,
                            position: {
                                x:
                                    Number(oldWrapperPosition.x || 0) +
                                    Number(node.position?.x || 0),
                                y:
                                    Number(oldWrapperPosition.y || 0) +
                                    Number(node.position?.y || 0),
                            },
                            data: {
                                ...node.data,
                                isInitial: node.id === desiredInitialId,
                            },
                        };
                    }

                    if (siblingIds.has(node.id)) {
                        return {
                            ...node,
                            parentId: existingDirectCompound.id,
                            extent: "parent",
                            expandParent: true,
                            data: {
                                ...node.data,
                                isInitial: node.id === desiredInitialId,
                            },
                        };
                    }

                    return node;
                });

                changed = true;
                return;
            }
        }

        if (!wrapper) {
            const wrapperId = getNodeId();
            const initialSkill =
                allSkills.find((node) => node.data?.isInitial) || allSkills[0];

            // This is the compound that represents the parallel region/lane,
            // so its default name should make that role explicit.
            const compoundName = getNextParallelLaneCompoundName(nextNodes);

            const autoWrapper = {
                id: wrapperId,
                type: "compound",
                position: { x: 0, y: 0 },
                parentId: currentLane.id,
                extent: "parent",
                expandParent: true,
                draggable: true,
                selectable: true,
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

            nextNodes = [
                ...nextNodes,
                autoWrapper,
            ].map((node) => {
                if (!allSkills.some((skill) => skill.id === node.id)) {
                    return node;
                }

                return {
                    ...node,
                    parentId: wrapperId,
                    extent: "parent",
                    expandParent: true,
                    // Wrapper starts at the lane origin, so the visual position
                    // stays exactly where the skill was before wrapping.
                    position: {
                        x: Number(node.position?.x || 0),
                        y: Number(node.position?.y || 0),
                    },
                    data: {
                        ...node.data,
                        isInitial: node.id === initialSkill.id,
                    },
                };
            });

            changed = true;
            return;
        }

        // Existing lane compound: keep it as the single region compound and
        // absorb direct lane states or children of duplicate wrappers into it.
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
        const wrapperSize = getNodeSize(wrapper);
        const desiredWrapperWidth = Math.max(laneWidth, wrapperSize.width);
        const desiredWrapperHeight = Math.max(laneHeight, wrapperSize.height);
        const needsResize =
            Number(wrapper.width) !== desiredWrapperWidth ||
            Number(wrapper.height) !== desiredWrapperHeight ||
            Number(wrapper.style?.width) !== desiredWrapperWidth ||
            Number(wrapper.style?.height) !== desiredWrapperHeight;
        const desiredInitialId = initialSkill?.id || null;
        const needsInitialUpdate =
            (wrapper.data?.initialChildId || null) !== desiredInitialId;
        const needsPresentationUpgrade =
            wrapper.className === "compound-in-lane" ||
            wrapper.draggable === false ||
            wrapper.selectable === false;

        if (
            !needsMerge &&
            !needsResize &&
            !needsInitialUpdate &&
            !needsPresentationUpgrade
        ) {
            return;
        }

        nextNodes = nextNodes
            .filter((node) => !extraWrapperIds.has(node.id))
            .map((node) => {
                if (node.id === wrapper.id) {
                    const { className: _legacyClassName, ...normalCompound } = node;

                    return {
                        ...normalCompound,
                        draggable: true,
                        selectable: true,
                        width: desiredWrapperWidth,
                        height: desiredWrapperHeight,
                        style: {
                            ...node.style,
                            width: desiredWrapperWidth,
                            height: desiredWrapperHeight,
                        },
                        data: {
                            ...node.data,
                            initialChildId: desiredInitialId,
                            autoParallelLaneCompound: true,
                        },
                    };
                }

                if (!allSkills.some((skill) => skill.id === node.id)) {
                    return node;
                }

                if (node.parentId === wrapper.id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            isInitial: node.id === desiredInitialId,
                        },
                    };
                }

                const oldParent = currentById.get(node.parentId);
                const oldParentPosition =
                    isAutoParallelLaneCompound(oldParent)
                        ? oldParent.position || { x: 0, y: 0 }
                        : { x: 0, y: 0 };

                const laneX =
                    Number(oldParentPosition.x || 0) +
                    Number(node.position?.x || 0);
                const laneY =
                    Number(oldParentPosition.y || 0) +
                    Number(node.position?.y || 0);

                return {
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
                };
            });

        changed = true;
    });

    return changed ? orderNodesParentsFirst(nextNodes) : allNodes;
};

export const normalizeCompoundInitialStates = (allNodes) => {
    const compounds = (allNodes || []).filter(
        (node) => node.type === "compound"
    );

    if (compounds.length === 0) {
        return allNodes;
    }

    const desiredInitialByCompound = new Map();

    compounds.forEach((compound) => {
        const children = (allNodes || []).filter(
            (node) =>
                node.parentId === compound.id &&
                isCompoundInitialChildCandidate(node)
        );

        if (children.length === 0) {
            desiredInitialByCompound.set(compound.id, null);
            return;
        }

        const storedInitialId = compound.data?.initialChildId;
        const storedInitialStillExists = children.some(
            (child) => child.id === storedInitialId
        );
        const existingInitial = children.find(
            (child) => child.data?.isInitial
        );

        desiredInitialByCompound.set(
            compound.id,
            storedInitialStillExists
                ? storedInitialId
                : existingInitial?.id || children[0].id
        );
    });

    let changed = false;

    const normalized = (allNodes || []).map((node) => {
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

