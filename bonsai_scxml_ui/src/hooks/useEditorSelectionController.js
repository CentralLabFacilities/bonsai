import { useCallback } from "react";
import { isSlotEdge } from "../utils/editorGraph";

export function useEditorSelectionController({
    nodes,
    clearAllEdgeSelection,
    selectSlotEdge,
    selectTransitionEdge,
    onTransitionEdgeDoubleClick,
    setSelectedNodeId,
    setRightPanelTab,
    setActiveTab,
    setHoveredEditorNodeId,
    setHoveredEditorEdgeId,
}) {
    const handleEdgeClick = useCallback(
        (event, edge) => {
            if (
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge
            ) {
                return;
            }

            if (isSlotEdge(edge)) {
                selectSlotEdge(edge.id);
                return;
            }

            selectTransitionEdge(
                edge.id,
                Boolean(event.ctrlKey || event.metaKey)
            );
        },
        [selectSlotEdge, selectTransitionEdge]
    );

    const handleEdgeDoubleClick = useCallback(
        (event, edge) => {
            if (
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge
            ) {
                return;
            }

            if (isSlotEdge(edge)) {
                selectSlotEdge(edge.id);
                return;
            }

            onTransitionEdgeDoubleClick(event, edge);
        },
        [onTransitionEdgeDoubleClick, selectSlotEdge]
    );

    const handleNodeClick = useCallback(
        (_, node) => {
            clearAllEdgeSelection();

            const isParallelLaneStructure =
                node.type === "parallelLane" ||
                Boolean(node.data?.autoParallelLaneCompound) ||
                node.className === "compound-in-lane";

            if (isParallelLaneStructure) {
                let currentNode = node;
                const visited = new Set();

                while (
                    currentNode?.parentId &&
                    !visited.has(currentNode.id)
                ) {
                    visited.add(currentNode.id);
                    const parentNode = nodes.find(
                        (candidate) => candidate.id === currentNode.parentId
                    );

                    if (!parentNode) break;

                    if (parentNode.type === "parallel") {
                        setSelectedNodeId(parentNode.id);
                        setRightPanelTab("details");
                        setActiveTab("allgemein");
                        return;
                    }

                    currentNode = parentNode;
                }
            }

            setSelectedNodeId(node.id);
            setRightPanelTab("details");
        },
        [
            clearAllEdgeSelection,
            nodes,
            setActiveTab,
            setRightPanelTab,
            setSelectedNodeId,
        ]
    );

    const handlePaneClick = useCallback(() => {
        clearAllEdgeSelection();
        setSelectedNodeId(null);
        setRightPanelTab("datamodel");
    }, [clearAllEdgeSelection, setRightPanelTab, setSelectedNodeId]);

    const handleNodeMouseEnter = useCallback(
        (_, node) => {
            setHoveredEditorEdgeId(null);
            setHoveredEditorNodeId(node.id);
        },
        [setHoveredEditorEdgeId, setHoveredEditorNodeId]
    );

    const handleNodeMouseLeave = useCallback(
        (_, node) => {
            setHoveredEditorNodeId((current) =>
                current === node.id ? null : current
            );
        },
        [setHoveredEditorNodeId]
    );

    const handleEdgeMouseEnter = useCallback(
        (_, edge) => {
            setHoveredEditorNodeId(null);
            setHoveredEditorEdgeId(edge.id);
        },
        [setHoveredEditorEdgeId, setHoveredEditorNodeId]
    );

    const handleEdgeMouseLeave = useCallback(
        (_, edge) => {
            setHoveredEditorEdgeId((current) =>
                current === edge.id ? null : current
            );
        },
        [setHoveredEditorEdgeId]
    );

    return {
        handleEdgeClick,
        handleEdgeDoubleClick,
        handleNodeClick,
        handlePaneClick,
        handleNodeMouseEnter,
        handleNodeMouseLeave,
        handleEdgeMouseEnter,
        handleEdgeMouseLeave,
    };
}
