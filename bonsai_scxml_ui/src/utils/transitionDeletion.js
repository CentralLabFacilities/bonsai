/** Strip transition-specific data referencing removed states, retaining declared exit tokens. */
export function cleanEventsForDeletedStates(events, removedNodeIds) {
    return (events || []).flatMap((event) => {
        if (removedNodeIds.has(event?.sourceNodeId)) return [];
        if (!removedNodeIds.has(event?.target)) return [event];
        if (event.editorImportedSynthetic || event.editorBoundarySynthetic) return [];
        return [{
            ...event,
            target: null,
            cond: "",
            assignments: [],
            assign: null,
            assignLocation: "",
            assignExpr: "",
            selectedSkill: "",
            selectedPackage: "",
        }];
    });
}
