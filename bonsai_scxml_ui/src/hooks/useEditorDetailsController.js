import { useCallback, useMemo } from "react";
import { getAbsoluteNodePosition } from "../utils/editorGeometry";
import { getLocalDataModelEntries } from "../utils/editorScxml";
import { isEditorCloneNode } from "../utils/editorClones";

export function useEditorDetailsController({
    selectedRawNode,
    semanticNodes,
    tabs,
    activeTabId,
    availableDataModelParameters,
    selectedContainerOutgoingTransitions,
    moveContainerTransition,
    getNodes,
    handleToggleContainerCollapse,
    clearAllEdgeSelection,
    selectEditorNode,
    fitView,
    setCenter,
    setHoveredSlotAccessNodeId,
    switchTab,
    setRightPanelTab,
    updateSlotPath,
    updateSlotInherited,
}) {
    const selectedNode = selectedRawNode;

    const selectedCloneSourceNode = useMemo(() => {
        if (!isEditorCloneNode(selectedNode)) return null;
        return (
            semanticNodes.find(
                (node) => node.id === selectedNode.data?.cloneOfNodeId
            ) || null
        );
    }, [selectedNode, semanticNodes]);

    const selectedNodeClones = useMemo(() => {
        if (!selectedNode || isEditorCloneNode(selectedNode)) return [];

        return semanticNodes.filter(
            (node) =>
                node.id !== selectedNode.id &&
                node.data?.cloneOfNodeId === selectedNode.id
        );
    }, [selectedNode, semanticNodes]);

    const handleMoveContainerTransition = useCallback(
        (edgeId, direction) => {
            if (
                !selectedNode ||
                (selectedNode.type !== "compound" &&
                    selectedNode.type !== "parallel")
            ) {
                return;
            }

            moveContainerTransition(
                selectedNode.id,
                selectedContainerOutgoingTransitions,
                edgeId,
                direction
            );
        },
        [
            moveContainerTransition,
            selectedContainerOutgoingTransitions,
            selectedNode,
        ]
    );

    const handleNavigateCloneSource = useCallback(
        (nodeId) => {
            if (!nodeId) return;

            const flowNodes = getNodes();
            const byId = new Map(flowNodes.map((node) => [node.id, node]));
            const collapsedAncestors = [];
            let parentId = byId.get(nodeId)?.parentId;
            const visited = new Set();

            while (parentId && !visited.has(parentId)) {
                visited.add(parentId);
                const parent = byId.get(parentId);
                if (!parent) break;
                if (
                    (parent.type === "compound" || parent.type === "parallel") &&
                    parent.data?.isCollapsed
                ) {
                    collapsedAncestors.push(parent.id);
                }
                parentId = parent.parentId;
            }

            collapsedAncestors.reverse().forEach((containerId) =>
                handleToggleContainerCollapse(containerId)
            );

            clearAllEdgeSelection();
            selectEditorNode(nodeId, { kind: "node", tab: null });

            window.setTimeout(() => {
                const flowNode = getNodes().find((node) => node.id === nodeId);
                if (!flowNode) {
                    fitView({
                        nodes: [{ id: nodeId }],
                        padding: 0.8,
                        maxZoom: 1.2,
                        duration: 250,
                    });
                    return;
                }

                const position = getAbsoluteNodePosition(flowNode, getNodes());
                const width =
                    Number(flowNode.measured?.width) ||
                    Number(flowNode.width) ||
                    220;
                const height =
                    Number(flowNode.measured?.height) ||
                    Number(flowNode.height) ||
                    90;

                setCenter(position.x + width / 2, position.y + height / 2, {
                    zoom: 1,
                    duration: 300,
                });
            }, 40);
        },
        [
            clearAllEdgeSelection,
            fitView,
            getNodes,
            handleToggleContainerCollapse,
            selectEditorNode,
            setCenter,
        ]
    );

    // OnEntry/OnExit has asymmetric scope for sub-state-machines:
    // - assignment location belongs to the child machine's local datamodel
    // - assignment expression is evaluated in the parent workflow scope
    const selectedActionDataModel = useMemo(() => {
        if (!selectedNode || selectedNode.type !== "submachine") {
            return availableDataModelParameters;
        }

        const srcFileName = String(selectedNode.data?.src || "")
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.(xml|scxml)$/i, "");

        const childTab = tabs.find((tab) => {
            if (tab.parentTabId !== activeTabId) return false;

            const tabFileName = String(tab.fileName || "")
                .split(/[\\/]/)
                .pop()
                ?.replace(/\.(xml|scxml)$/i, "");

            return (
                (tab.sourcePath &&
                    String(tab.sourcePath) ===
                        String(selectedNode.data?.src || "")) ||
                String(tab.title || "") ===
                    String(selectedNode.data?.label || "") ||
                (srcFileName && tabFileName === srcFileName)
            );
        });

        if (childTab) {
            return getLocalDataModelEntries(childTab.globalDataModel);
        }

        return getLocalDataModelEntries(selectedNode.data?.localDataModel || []);
    }, [
        activeTabId,
        availableDataModelParameters,
        selectedNode,
        tabs,
    ]);

    const selectedActionExpressionVariables = availableDataModelParameters;

    const selectedInitialScopeParentId = selectedNode?.parentId || null;
    const hasInitialNode = useMemo(
        () =>
            semanticNodes.some(
                (node) =>
                    Boolean(node.data?.isInitial) &&
                    (node.parentId || null) === selectedInitialScopeParentId
            ),
        [semanticNodes, selectedInitialScopeParentId]
    );

    const handleUpdateSelectedSlotPath = useCallback(
        (nextPath) => updateSlotPath(selectedRawNode, nextPath),
        [selectedRawNode, updateSlotPath]
    );

    const handleUpdateSelectedSlotInherited = useCallback(
        (shouldInherit) => updateSlotInherited(selectedRawNode, shouldInherit),
        [selectedRawNode, updateSlotInherited]
    );

    const handleSelectSlotAccessSkill = useCallback(
        (nodeId) => {
            if (!nodeId) return;

            setHoveredSlotAccessNodeId(null);
            clearAllEdgeSelection();
            selectEditorNode(nodeId, {
                kind: "node",
                tab: null,
            });

            window.setTimeout(() => {
                const flowNode = getNodes().find((node) => node.id === nodeId);
                if (!flowNode) {
                    fitView({
                        nodes: [{ id: nodeId }],
                        padding: 0.8,
                        maxZoom: 1.2,
                        duration: 250,
                    });
                    return;
                }

                const position =
                    flowNode.positionAbsolute || flowNode.position || { x: 0, y: 0 };
                const width =
                    Number(flowNode.measured?.width) ||
                    Number(flowNode.width) ||
                    220;
                const height =
                    Number(flowNode.measured?.height) ||
                    Number(flowNode.height) ||
                    90;

                setCenter(position.x + width / 2, position.y + height / 2, {
                    zoom: 1,
                    duration: 300,
                });
            }, 50);
        },
        [
            clearAllEdgeSelection,
            fitView,
            getNodes,
            selectEditorNode,
            setCenter,
            setHoveredSlotAccessNodeId,
        ]
    );

    const handleNavigateAncestorSlot = useCallback(
        (tabId, nodeId = null) => {
            if (!tabId) return;

            if (tabId !== activeTabId) {
                switchTab(tabId);
            }
            setRightPanelTab("details");

            if (!nodeId) return;

            window.setTimeout(() => {
                selectEditorNode(nodeId, {
                    kind: "node",
                    allowMissing: true,
                    tab: null,
                });

                window.setTimeout(() => {
                    const flowNode = getNodes().find(
                        (node) => node.id === nodeId
                    );
                    if (!flowNode) {
                        fitView({
                            nodes: [{ id: nodeId }],
                            padding: 0.8,
                            maxZoom: 1.2,
                            duration: 250,
                        });
                        return;
                    }

                    const position =
                        flowNode.positionAbsolute ||
                        flowNode.position ||
                        { x: 0, y: 0 };
                    const width =
                        Number(flowNode.measured?.width) ||
                        Number(flowNode.width) ||
                        220;
                    const height =
                        Number(flowNode.measured?.height) ||
                        Number(flowNode.height) ||
                        90;
                    setCenter(position.x + width / 2, position.y + height / 2, {
                        zoom: 1,
                        duration: 300,
                    });
                }, 60);
            }, tabId === activeTabId ? 0 : 80);
        },
        [
            activeTabId,
            fitView,
            getNodes,
            selectEditorNode,
            setCenter,
            setRightPanelTab,
            switchTab,
        ]
    );

    return {
        selectedNode,
        selectedCloneSourceNode,
        selectedNodeClones,
        selectedActionDataModel,
        selectedActionExpressionVariables,
        hasInitialNode,
        handleMoveContainerTransition,
        handleNavigateCloneSource,
        handleUpdateSelectedSlotPath,
        handleUpdateSelectedSlotInherited,
        handleSelectSlotAccessSkill,
        handleNavigateAncestorSlot,
    };
}
