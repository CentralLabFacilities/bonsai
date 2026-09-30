import { getTransitionExitToken } from "./transitionEvents";

const displayNameFor = (node) => {
    if (!node) return "Unknown";

    const fullSkillName = String(
        node.data?.fullSkillName || node.data?.label || node.id
    ).trim();
    const editorInstanceId = String(node.data?.editorInstanceId || "").trim();
    const baseName =
        node.data?.label ||
        fullSkillName.split(".").pop()?.split("#")[0] ||
        node.id;

    if (editorInstanceId) return `${baseName}#${editorInstanceId}`;
    if (fullSkillName.includes("#")) {
        const instanceId = fullSkillName.split("#").pop();
        return `${baseName}#${instanceId}`;
    }
    return baseName;
};

const isInsideContainer = (nodeId, containerId, nodeById) => {
    if (!nodeId) return false;
    if (nodeId === containerId) return true;

    const visited = new Set();
    let current = nodeById.get(nodeId);
    while (current?.parentId && !visited.has(current.parentId)) {
        visited.add(current.parentId);
        if (current.parentId === containerId) return true;
        current = nodeById.get(current.parentId);
    }
    return false;
};

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

/**
 * Browser/error fallback for the Rust transition analyzer.
 *
 * Keep this behavior-equivalent to the Rust implementation while the migration
 * is in progress. React Flow edge routing remains a frontend concern; this only
 * derives the semantic transitions that leave a selected Compound/Parallel.
 */
export const analyzeContainerOutgoingTransitionsInJavascript = ({
    selectedNode,
    nodes = [],
    edges = [],
}) => {
    if (
        !selectedNode ||
        (selectedNode.type !== "compound" && selectedNode.type !== "parallel")
    ) {
        return [];
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const insideSelected = (nodeId) =>
        isInsideContainer(nodeId, selectedNode.id, nodeById);
    const seen = new Set();
    const result = [];

    const appendOutgoingTransition = ({
        edgeId,
        sourceId,
        sourceHandle,
        targetId,
        rawEvent = "",
        isFallback = false,
    }) => {
        if (
            !sourceId ||
            !targetId ||
            !insideSelected(sourceId) ||
            insideSelected(targetId)
        ) {
            return;
        }

        const normalizedHandle = String(sourceHandle || "success");
        const semanticKey = `${sourceId}::${normalizedHandle}::${targetId}`;
        if (isFallback && seen.has(semanticKey)) return;
        seen.add(semanticKey);

        const sourceNode = nodeById.get(sourceId);
        const targetNode = nodeById.get(targetId);
        const sourceSkillBase = String(
            sourceNode?.data?.label ||
                sourceNode?.data?.fullSkillName ||
                sourceNode?.id ||
                ""
        )
            .split("#")[0]
            .split(".")
            .filter(Boolean)
            .pop();
        const rawEventName = String(rawEvent || normalizedHandle).trim();
        const eventSuffix = getTransitionExitToken(
            rawEventName || normalizedHandle,
            sourceSkillBase
        );
        const semanticEventName = `${
            sourceSkillBase || displayNameFor(sourceNode)
        }.${eventSuffix || normalizedHandle}`;

        result.push({
            edgeId,
            sourceNodeId: sourceId,
            sourceDisplayName: displayNameFor(sourceNode),
            eventId: normalizedHandle,
            eventDisplayName: semanticEventName,
            targetNodeId: targetId,
            targetDisplayName: displayNameFor(targetNode),
        });
    };

    edges.forEach((edge) => {
        if (
            edge.data?.boundaryInternalEdge ||
            edge.data?.compoundInternalEdge ||
            edge.data?.parallelInternalEdge ||
            edge.data?.compoundInitialEdge ||
            edge.data?.parallelEntryEdge ||
            String(edge.id || "").startsWith("edge-internal-")
        ) {
            return;
        }

        appendOutgoingTransition({
            edgeId: edge.id,
            sourceId:
                edge.data?.boundaryOriginalSource ||
                edge.data?.compoundOriginalSource ||
                edge.data?.parallelOriginalSource ||
                edge.source,
            sourceHandle:
                edge.data?.boundaryOriginalSourceHandle ||
                edge.data?.compoundOriginalSourceHandle ||
                edge.data?.parallelOriginalSourceHandle ||
                edge.sourceHandle ||
                edge.label ||
                "success",
            targetId:
                edge.data?.boundaryOriginalTarget ||
                edge.data?.compoundOriginalTarget ||
                edge.data?.parallelOriginalTarget ||
                edge.target,
            rawEvent: edge.data?.boundaryImportedRawEvent || "",
        });
    });

    const boundaryAnchors =
        selectedNode.type === "compound"
            ? [selectedNode]
            : nodes.filter(
                  (node) => node.type === "parallelLane" && insideSelected(node.id)
              );

    boundaryAnchors.forEach((anchor) => {
        (anchor.data?.events || []).forEach((event, index) => {
            if (!(event?.sourceNodeId && event?.transitionHandleId && event?.target)) {
                return;
            }

            const boundaryEdge = edges.find(
                (edge) =>
                    edge.source === anchor.id &&
                    String(edge.sourceHandle || "") === String(event.id || "")
            );
            if (!boundaryEdge) return;

            appendOutgoingTransition({
                edgeId:
                    boundaryEdge.id ||
                    `boundary-${anchor.id}-${event.id || index}`,
                sourceId: event.sourceNodeId,
                sourceHandle: event.transitionHandleId,
                targetId: event.target,
                rawEvent: event.rawEvent || event.name || "",
                isFallback: true,
            });
        });
    });

    const storedOrder = Array.isArray(selectedNode.data?.containerTransitionOrder)
        ? selectedNode.data.containerTransitionOrder
        : [];
    if (storedOrder.length > 0) {
        const orderRank = new Map(
            storedOrder.map((edgeId, index) => [String(edgeId), index])
        );
        result.sort((a, b) => {
            const aRank = orderRank.has(String(a.edgeId))
                ? orderRank.get(String(a.edgeId))
                : Number.MAX_SAFE_INTEGER;
            const bRank = orderRank.has(String(b.edgeId))
                ? orderRank.get(String(b.edgeId))
                : Number.MAX_SAFE_INTEGER;
            return aRank - bRank;
        });
    }

    return result;
};
