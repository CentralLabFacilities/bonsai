const mapEvent = (event) => ({
    id: String(event?.id || ""),
    sourceNodeId: String(event?.sourceNodeId || ""),
    transitionHandleId: String(event?.transitionHandleId || ""),
    target: String(event?.target || ""),
    rawEvent: String(event?.rawEvent || ""),
    name: String(event?.name || ""),
});

export const buildTransitionAnalysisRequest = ({
    selectedNode,
    nodes = [],
    edges = [],
}) => {
    const selectedIsContainer =
        selectedNode?.type === "compound" || selectedNode?.type === "parallel";
    if (!selectedIsContainer) {
        return {
            selectedContainerId: null,
            nodes: [],
            edges: [],
        };
    }

    return {
        selectedContainerId: String(selectedNode.id || ""),
        nodes: nodes.map((node) => ({
            id: String(node?.id || ""),
            nodeType: String(node?.type || ""),
            parentId: node?.parentId ? String(node.parentId) : null,
            label: String(node?.data?.label || ""),
            fullSkillName: String(node?.data?.fullSkillName || ""),
            editorInstanceId: String(node?.data?.editorInstanceId || ""),
            containerTransitionOrder: Array.isArray(
                node?.data?.containerTransitionOrder
            )
                ? node.data.containerTransitionOrder.map((id) => String(id))
                : [],
            events: (node?.data?.events || []).map(mapEvent),
        })),
        edges: edges.map((edge) => ({
            id: String(edge?.id || ""),
            source: String(edge?.source || ""),
            target: String(edge?.target || ""),
            sourceHandle: String(edge?.sourceHandle || ""),
            label: String(edge?.label || ""),
            boundaryOriginalSource: String(
                edge?.data?.boundaryOriginalSource || ""
            ),
            compoundOriginalSource: String(
                edge?.data?.compoundOriginalSource || ""
            ),
            parallelOriginalSource: String(
                edge?.data?.parallelOriginalSource || ""
            ),
            boundaryOriginalSourceHandle: String(
                edge?.data?.boundaryOriginalSourceHandle || ""
            ),
            compoundOriginalSourceHandle: String(
                edge?.data?.compoundOriginalSourceHandle || ""
            ),
            parallelOriginalSourceHandle: String(
                edge?.data?.parallelOriginalSourceHandle || ""
            ),
            boundaryOriginalTarget: String(
                edge?.data?.boundaryOriginalTarget || ""
            ),
            compoundOriginalTarget: String(
                edge?.data?.compoundOriginalTarget || ""
            ),
            parallelOriginalTarget: String(
                edge?.data?.parallelOriginalTarget || ""
            ),
            boundaryImportedRawEvent: String(
                edge?.data?.boundaryImportedRawEvent || ""
            ),
            boundaryInternalEdge: Boolean(edge?.data?.boundaryInternalEdge),
            compoundInternalEdge: Boolean(edge?.data?.compoundInternalEdge),
            parallelInternalEdge: Boolean(edge?.data?.parallelInternalEdge),
            compoundInitialEdge: Boolean(edge?.data?.compoundInitialEdge),
            parallelEntryEdge: Boolean(edge?.data?.parallelEntryEdge),
        })),
    };
};
