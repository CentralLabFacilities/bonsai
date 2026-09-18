/**
 * Collision resolution adapted from the React Flow node-collisions example.
 *
 * The solver pads every node by `margin`, detects overlapping rectangles and
 * repeatedly separates each colliding pair along the axis with the smaller
 * overlap. `resolveCollisionScope` limits that solver to siblings that share
 * the same React Flow parent so state containers never collide with their own
 * children.
 */

const getNodeWidth = (node) =>
    Number(node?.width) ||
    Number(node?.measured?.width) ||
    Number(node?.style?.width) ||
    210;

const getNodeHeight = (node) =>
    Number(node?.height) ||
    Number(node?.measured?.height) ||
    Number(node?.style?.height) ||
    80;

const getBoxesFromNodes = (nodes, margin = 0) =>
    nodes.map((node) => ({
        x: Number(node.position?.x || 0) - margin,
        y: Number(node.position?.y || 0) - margin,
        width: getNodeWidth(node) + margin * 2,
        height: getNodeHeight(node) + margin * 2,
        node,
        moved: false,
    }));

export const resolveCollisions = (
    nodes,
    {
        maxIterations = 50,
        overlapThreshold = 0.5,
        margin = 0,
    } = {}
) => {
    if (!Array.isArray(nodes) || nodes.length < 2) {
        return nodes;
    }

    const boxes = getBoxesFromNodes(nodes, margin);

    for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
        let moved = false;

        for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
                const a = boxes[i];
                const b = boxes[j];

                const centerAX = a.x + a.width * 0.5;
                const centerAY = a.y + a.height * 0.5;
                const centerBX = b.x + b.width * 0.5;
                const centerBY = b.y + b.height * 0.5;

                const dx = centerAX - centerBX;
                const dy = centerAY - centerBY;

                const overlapX =
                    (a.width + b.width) * 0.5 - Math.abs(dx);
                const overlapY =
                    (a.height + b.height) * 0.5 - Math.abs(dy);

                if (
                    overlapX > overlapThreshold &&
                    overlapY > overlapThreshold
                ) {
                    a.moved = true;
                    b.moved = true;
                    moved = true;

                    if (overlapX < overlapY) {
                        const direction = dx > 0 ? 1 : -1;
                        const amount = (overlapX / 2) * direction;
                        a.x += amount;
                        b.x -= amount;
                    } else {
                        const direction = dy > 0 ? 1 : -1;
                        const amount = (overlapY / 2) * direction;
                        a.y += amount;
                        b.y -= amount;
                    }
                }
            }
        }

        if (!moved) {
            break;
        }
    }

    return boxes.map((box) =>
        box.moved
            ? {
                ...box.node,
                position: {
                    x: box.x + margin,
                    y: box.y + margin,
                },
            }
            : box.node
    );
};

/**
 * Resolve collisions only between nodes in the same state-machine scope as
 * `focusNodeId`. Parent/child overlap is intentional in React Flow subflows,
 * therefore different parent scopes must never be solved together.
 */
export const resolveCollisionScope = (
    allNodes,
    focusNodeId,
    options = {}
) => {
    const focusNode = (allNodes || []).find(
        (node) => node.id === focusNodeId
    );

    if (!focusNode) {
        return allNodes;
    }

    const parentId = focusNode.parentId || null;
    const scopeNodes = (allNodes || []).filter(
        (node) =>
            (node.parentId || null) === parentId &&
            node.type !== "parallelLane" &&
            !node.hidden
    );

    if (scopeNodes.length < 2) {
        return allNodes;
    }

    const resolvedScope = resolveCollisions(scopeNodes, options);
    const resolvedById = new Map(
        resolvedScope.map((node) => [node.id, node])
    );

    return (allNodes || []).map(
        (node) => resolvedById.get(node.id) || node
    );
};
