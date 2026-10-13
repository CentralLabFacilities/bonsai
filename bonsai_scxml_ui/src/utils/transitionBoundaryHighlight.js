/**
 * Boundary exits are drawn as a semantic transition and one or more internal
 * helper edges. All pieces retain the original skill/event identity so hover
 * and selection can highlight the full visual path without persisting a
 * separate UI-only edge relationship in SCXML.
 */
export const isBoundaryHelperEdge = (edge) => Boolean(
    edge?.data?.boundaryInternalEdge ||
    edge?.data?.compoundInternalEdge ||
    edge?.data?.parallelInternalEdge
);

export const boundaryTransitionKeys = (edge) => {
    const data = edge?.data || {};
    const exitId = data.boundaryExitId || data.compoundExitId || data.parallelExitId;
    if (!exitId) return [];
    const entries = [
        {
            sourceId: data.boundaryOriginalSource || data.compoundOriginalSource || data.parallelOriginalSource,
            sourceHandle: data.boundaryOriginalSourceHandle || data.compoundOriginalSourceHandle || data.parallelOriginalSourceHandle,
        },
        ...(Array.isArray(data.boundaryOriginalSources) ? data.boundaryOriginalSources : []),
    ];
    return [...new Set(entries
        .filter((entry) => entry.sourceId && entry.sourceHandle)
        .map((entry) => JSON.stringify([String(entry.sourceId), String(entry.sourceHandle), String(exitId)])))];
};

/** Returns all boundary helper IDs on the same original skill/event path. */
export const buildBoundaryHelperIndex = (edges) => {
    const byKey = new Map();
    for (const edge of edges || []) {
        if (!isBoundaryHelperEdge(edge)) continue;
        for (const key of boundaryTransitionKeys(edge)) {
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(edge.id);
        }
    }
    return byKey;
};
