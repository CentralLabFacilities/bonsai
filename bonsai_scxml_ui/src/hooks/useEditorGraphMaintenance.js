import { useEffect, useMemo, useState } from "react";
import { normalizeContainerAutoExpansion } from "../utils/editorGeometry.js";
import { isEditorCloneNode } from "../utils/editorClones.js";

export function projectSemanticNodes(previous, nodes, isDraggingNode = false) {
    if (isDraggingNode) return previous;

    const unchanged =
        previous.length === nodes.length &&
        nodes.every((node, index) => {
            const oldNode = previous[index];
            return (
                oldNode?.id === node.id &&
                oldNode?.type === node.type &&
                oldNode?.parentId === node.parentId &&
                oldNode?.data === node.data
            );
        });

    return unchanged
        ? previous
        : nodes.map((node) => ({
              id: node.id,
              type: node.type,
              parentId: node.parentId,
              data: node.data,
          }));
}

export function useSemanticNodeSnapshot(nodes, isDraggingNode) {
    const [snapshot, setSnapshot] = useState(() => projectSemanticNodes([], nodes));
    const semanticNodes = useMemo(
        () => projectSemanticNodes(snapshot, nodes, isDraggingNode),
        [snapshot, nodes, isDraggingNode]
    );

    // A render-local state adjustment is replayable if React abandons a render;
    // mutating a shared ref here would expose an uncommitted graph to handlers.
    if (semanticNodes !== snapshot) setSnapshot(semanticNodes);
    return semanticNodes;
}

/**
 * Maintains graph invariants that are independent from rendering/interaction.
 * Geometry-only drag updates are deliberately ignored so these semantic scans
 * do not run for every pointer movement.
 */
export function useEditorGraphMaintenance({
    nodes,
    isDraggingNode,
    selectedNodeId,
    setNodes,
    setEdges,
    setSelectedNodeId,
}) {
    const semanticNodes = useSemanticNodeSnapshot(nodes, isDraggingNode);

    useEffect(() => {
        if (isDraggingNode) return;

        setNodes((currentNodes) => {
            return normalizeContainerAutoExpansion(currentNodes);
        });
    }, [semanticNodes, isDraggingNode, setNodes]);

    useEffect(() => {
        if (isDraggingNode) return;

        const semanticNodeIds = new Set(semanticNodes.map((node) => node.id));
        const danglingCloneIds = new Set(
            semanticNodes
                .filter(
                    (node) =>
                        isEditorCloneNode(node) &&
                        (!node.data?.cloneOfNodeId ||
                            !semanticNodeIds.has(node.data.cloneOfNodeId))
                )
                .map((node) => node.id)
        );

        if (danglingCloneIds.size > 0) {
            setEdges((currentEdges) =>
                currentEdges.filter(
                    (edge) =>
                        !danglingCloneIds.has(edge.source) &&
                        !danglingCloneIds.has(edge.target)
                )
            );

            if (danglingCloneIds.has(selectedNodeId)) {
                setSelectedNodeId(null);
            }
        }

        setNodes((currentNodes) => {
            const byId = new Map(
                currentNodes.map((node) => [node.id, node])
            );
            let changed = false;
            const nextNodes = [];

            currentNodes.forEach((node) => {
                if (!isEditorCloneNode(node)) {
                    nextNodes.push(node);
                    return;
                }

                const sourceNode = byId.get(node.data?.cloneOfNodeId);
                if (!sourceNode || isEditorCloneNode(sourceNode)) {
                    changed = true;
                    return;
                }

                const nextLabel = sourceNode.data?.label || node.data?.label;
                const nextFullSkillName =
                    sourceNode.data?.fullSkillName || node.data?.fullSkillName;

                const nextSourceNodeType = node.data?.isStateClone
                    ? sourceNode.type
                    : node.data?.sourceNodeType;

                if (
                    node.data?.label === nextLabel &&
                    node.data?.fullSkillName === nextFullSkillName &&
                    node.data?.sourceNodeType === nextSourceNodeType
                ) {
                    nextNodes.push(node);
                    return;
                }

                changed = true;
                nextNodes.push({
                    ...node,
                    data: {
                        ...(node.data || {}),
                        label: nextLabel,
                        fullSkillName: nextFullSkillName,
                        ...(node.data?.isStateClone
                            ? { sourceNodeType: nextSourceNodeType }
                            : {}),
                    },
                });
            });

            return changed ? nextNodes : currentNodes;
        });
    }, [
        semanticNodes,
        isDraggingNode,
        selectedNodeId,
        setNodes,
        setEdges,
        setSelectedNodeId,
    ]);

    return semanticNodes;
}
