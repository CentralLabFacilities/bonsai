/**
 * Mirrors editor_export::ExportIndex::transition_owner_id: a transition leaving
 * one or more Compound/Parallel states belongs to the outermost exited state.
 * Use semantic nodes (not the visual boundary helper) for the target.
 */
export const getTransitionScope = (sourceId, targetId, nodes = []) => {
    const byId = new Map(nodes.map((node) => [String(node.id), node]));
    const source = byId.get(String(sourceId));
    if (!source) return null;
    const visualTarget = byId.get(String(targetId));
    const semanticTargetId = String(
        (visualTarget?.data?.isSkillClone || visualTarget?.data?.isStateClone)
            ? visualTarget.data.cloneOfNodeId || targetId
            : targetId || ""
    );
    const targetAncestors = new Set();
    let current = byId.get(semanticTargetId);
    const visitedTargets = new Set();
    while (current && !visitedTargets.has(current.id)) {
        targetAncestors.add(current.id);
        visitedTargets.add(current.id);
        current = byId.get(current.parentId);
    }

    let owner = source;
    let depth = 0;
    let distance = 0;
    let parentId = source.parentId;
    const visited = new Set();
    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        distance += 1;
        if (
            (parent.type === "compound" || parent.type === "parallel") &&
            !targetAncestors.has(parent.id)
        ) {
            owner = parent;
            depth = distance;
        }
        parentId = parent.parentId;
    }
    return {
        id: String(owner.id),
        label: owner.data?.label || owner.data?.fullSkillName || owner.id,
        depth,
        nodeType: owner.type,
    };
};

export const groupTransitionsByScope = (transitions = []) => {
    const groups = new Map();
    transitions.forEach((transition) => {
        const id = String(transition.scopeId || "unscoped");
        if (!groups.has(id)) {
            groups.set(id, {
                id,
                label: transition.scopeLabel || "Current state",
                depth: Number(transition.scopeDepth || 0),
                items: [],
            });
        }
        groups.get(id).items.push(transition);
    });
    return [...groups.values()].sort((a, b) => a.depth - b.depth);
};

const eventDescriptorMatches = (descriptor, event) => {
    if (descriptor === "*") return true;
    const prefix = descriptor.endsWith(".*") ? descriptor.slice(0, -2) : descriptor;
    return Boolean(prefix) && (event === prefix || event.startsWith(`${prefix}.`));
};

export const getShadowedTransitions = (groups = []) => {
    const blockers = new Map();
    const unconditional = [];
    groups.forEach((group) => {
        group.items.forEach((transition) => {
            const event = String(transition.event || "").trim();
            if (!event || !transition.target) return;
            const earlier = unconditional.find(({ event: descriptor }) =>
                eventDescriptorMatches(descriptor, event)
            );
            if (earlier) blockers.set(transition.transitionId, earlier);
            if (!transition.conditionEnabled) {
                unconditional.push({
                    event,
                    label: group.label,
                    transitionId: transition.transitionId,
                    scopeId: group.id,
                });
            }
        });
    });
    return blockers;
};

/** Keep unrelated child sources in their previous slots when one source is reordered. */
export const mergeContainerTransitionOrder = ({
    previousOrder = [], previousOwnerEdges = [], nextOwnerEdges = [], editedSourceId,
}) => {
    const oldIds = previousOwnerEdges.map((edge) => edge.id);
    const newIds = nextOwnerEdges.map((edge) => edge.id);
    const oldIdSet = new Set(oldIds);
    const newIdSet = new Set(newIds);
    const original = [...new Set([
        ...previousOrder.filter((id) => oldIdSet.has(id)),
        ...oldIds,
    ])];
    const oldById = new Map(previousOwnerEdges.map((edge) => [edge.id, edge]));
    const newById = new Map(nextOwnerEdges.map((edge) => [edge.id, edge]));
    const belongsToSource = (edge) => edge?.logicalSourceId === editedSourceId;
    const replacements = newIds.filter((id) => belongsToSource(newById.get(id)));
    let replaceIndex = 0;
    let lastIndex = -1;
    const result = [];
    for (const id of original) {
        if (belongsToSource(oldById.get(id))) {
            if (replaceIndex < replacements.length) {
                result.push(replacements[replaceIndex++]);
                lastIndex = result.length;
            }
        } else if (newIdSet.has(id)) {
            result.push(id);
        }
    }
    const remaining = replacements.slice(replaceIndex);
    if (lastIndex >= 0) result.splice(lastIndex, 0, ...remaining);
    else result.push(...remaining);
    newIds.forEach((id) => { if (!result.includes(id)) result.push(id); });
    return result;
};
