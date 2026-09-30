import { useEffect, useMemo, useRef } from "react";
import {
    normalizeContainerAutoExpansion,
    normalizeParallelLaneCompounds,
    normalizeCompoundInitialStates,
} from "../utils/editorGeometry";
import { isEditorCloneNode } from "../utils/editorClones";

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
    const semanticNodesRef = useRef([]);
    const semanticNodesDependency = isDraggingNode ? null : nodes;

    const semanticNodes = useMemo(() => {
        const previous = semanticNodesRef.current;
        if (!semanticNodesDependency) return previous;

        const unchanged =
            previous.length === semanticNodesDependency.length &&
            semanticNodesDependency.every((node, index) => {
                const oldNode = previous[index];
                return (
                    oldNode?.id === node.id &&
                    oldNode?.type === node.type &&
                    oldNode?.parentId === node.parentId &&
                    oldNode?.data === node.data
                );
            });

        if (unchanged) return previous;

        const next = semanticNodesDependency.map((node) => ({
            id: node.id,
            type: node.type,
            parentId: node.parentId,
            data: node.data,
        }));
        semanticNodesRef.current = next;
        return next;
    }, [semanticNodesDependency]);

    useEffect(() => {
        if (isDraggingNode) return;

        setNodes((currentNodes) => {
            const withAutoExpansion =
                normalizeContainerAutoExpansion(currentNodes);
            const withParallelLaneCompounds =
                normalizeParallelLaneCompounds(withAutoExpansion);

            return normalizeCompoundInitialStates(
                withParallelLaneCompounds
            );
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
