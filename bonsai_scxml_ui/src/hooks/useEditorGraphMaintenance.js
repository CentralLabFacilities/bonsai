import { useEffect, useState } from "react";
import { normalizeContainerAutoExpansion } from "../utils/editorGeometry.js";
import { isEditorCloneNode } from "../utils/editorClones.js";

// Publish immutable projections as render state, not shared ref mutations. The
// input guard makes React's immediate retry cheap and isolates abandoned renders.
// Project must be pure, with every changing dependency included in inputs.
export function useDerivedGraphSnapshot(inputs, project, initialValue) {
    const [snapshot, setSnapshot] = useState(() => ({
        inputs,
        value: project(initialValue),
    }));

    if (
        inputs.length !== snapshot.inputs.length ||
        inputs.some((input, index) => !Object.is(input, snapshot.inputs[index]))
    ) {
        const value = project(snapshot.value);
        setSnapshot({ inputs, value });
        return value;
    }

    return snapshot.value;
}

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
    return useDerivedGraphSnapshot(
        [nodes, isDraggingNode],
        (previous) => previous === undefined
            ? projectSemanticNodes([], nodes)
            : projectSemanticNodes(previous, nodes, isDraggingNode)
    );
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
