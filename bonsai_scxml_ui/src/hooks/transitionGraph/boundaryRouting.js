import {
    getLaneForNode,
    isNodeInsideContainer,
} from "../../utils/editorGeometry";

export const getBoundarySourceEvent = (
    sourceNode,
    sourceHandle,
    allNodes = []
) => {
    if (!sourceNode || !["compound", "parallelLane"].includes(sourceNode.type)) {
        return null;
    }

    const event = (sourceNode.data?.events || []).find(
        (candidate) => String(candidate?.id || "") === String(sourceHandle || "")
    );
    if (!event) return null;

    let sourceNodeId = event.sourceNodeId || null;
    let transitionHandleId = event.transitionHandleId || null;

    // Older parallel exit metadata only stored rawEvent="Skill.event". Resolve
    // that format once so drawing onward from an existing border point still
    // preserves the real skill event.
    if (!sourceNodeId) {
        const rawEvent = String(event.rawEvent || event.name || "").trim();
        const separatorIndex = rawEvent.lastIndexOf(".");
        if (separatorIndex > 0) {
            const skillName = rawEvent.slice(0, separatorIndex);
            transitionHandleId = transitionHandleId || rawEvent.slice(separatorIndex + 1);
            const candidates = allNodes.filter((node) => {
                if (node.type !== "custom" && node.type !== "submachine") return false;
                const full = String(node.data?.fullSkillName || "");
                const label = String(node.data?.label || "");
                const matchesName =
                    full === skillName ||
                    full.split("#")[0] === skillName ||
                    label === skillName;
                if (!matchesName) return false;
                if (sourceNode.type === "parallelLane") {
                    return getLaneForNode(node, allNodes)?.id === sourceNode.id;
                }
                return isNodeInsideContainer(node, sourceNode.id, allNodes);
            });
            if (candidates.length === 1) sourceNodeId = candidates[0].id;
        }
    }

    const logicalSourceNode = allNodes.find((node) => node.id === sourceNodeId);
    if (!logicalSourceNode) return null;

    return {
        event,
        logicalSourceNode,
        logicalSourceId: logicalSourceNode.id,
        logicalHandle: transitionHandleId || sourceHandle || "success",
    };
};

export const getExitedBoundarySteps = (
    sourceNode,
    targetNode,
    allNodes = []
) => {
    if (!sourceNode || !targetNode) return [];
    const byId = new Map(allNodes.map((node) => [node.id, node]));
    const steps = [];
    const seenParallelIds = new Set();
    const visited = new Set();
    let parentId = sourceNode.parentId;

    const targetIsInside = (container) =>
        targetNode.id === container.id ||
        isNodeInsideContainer(targetNode, container.id, allNodes);

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;

        if (parent.type === "compound") {
            // The automatically managed Compound inside a Parallel lane is
            // structural only. The visible lane is the actual transition
            // boundary, so routing through both would duplicate the same exit.
            if (parent.data?.autoParallelLaneCompound) {
                parentId = parent.parentId;
                continue;
            }
            if (!targetIsInside(parent)) {
                steps.push({ kind: "compound", anchor: parent, container: parent });
            }
        } else if (parent.type === "parallelLane") {
            const parallel = byId.get(parent.parentId);
            if (
                parallel?.type === "parallel" &&
                !seenParallelIds.has(parallel.id)
            ) {
                seenParallelIds.add(parallel.id);
                if (!targetIsInside(parallel)) {
                    steps.push({ kind: "parallel", anchor: parent, container: parallel });
                }
            }
        } else if (parent.type === "parallel") {
            seenParallelIds.add(parent.id);
        }

        parentId = parent.parentId;
    }

    return steps;
};
