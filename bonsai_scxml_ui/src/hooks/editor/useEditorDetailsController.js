import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
    COLLAPSED_CONTAINER_HEIGHT,
    COLLAPSED_CONTAINER_WIDTH,
    getAbsoluteNodePosition,
    layoutStateContainerForExpansion,
} from "../../utils/editorGeometry.js";
import { getLocalDataModelEntries } from "../../utils/editorScxml.js";
import { isEditorCloneNode } from "../../utils/editorClones.js";

// The inspector has a fixed event API. Stable forwarders retain drag-time memo
// gating while publishing the current selected-node handlers after each commit.
export function useEditorDetailsCallbacks(callbacks) {
    const latest = useRef(callbacks);
    useLayoutEffect(() => {
        latest.current = callbacks;
    });
    return useMemo(() => ({
        onNavigateCloneSource: (...args) => latest.current.onNavigateCloneSource?.(...args),
        onNavigateClone: (...args) => latest.current.onNavigateClone?.(...args),
        onMoveContainerTransition: (...args) => latest.current.onMoveContainerTransition?.(...args),
        onNavigateTransitionNode: (...args) => latest.current.onNavigateTransitionNode?.(...args),
        onHoverTransitionNode: (...args) => latest.current.onHoverTransitionNode?.(...args),
        onOpenTransitionPanel: (...args) => latest.current.onOpenTransitionPanel?.(...args),
        onAddParallelLane: (...args) => latest.current.onAddParallelLane?.(...args),
        onRenameParallelLane: (...args) => latest.current.onRenameParallelLane?.(...args),
        onMoveParallelLane: (...args) => latest.current.onMoveParallelLane?.(...args),
        onDeleteParallelLane: (...args) => latest.current.onDeleteParallelLane?.(...args),
        onSetInitial: (...args) => latest.current.onSetInitial?.(...args),
        onUpdateName: (...args) => latest.current.onUpdateName?.(...args),
        onUpdateNameCommit: (...args) => latest.current.onUpdateNameCommit?.(...args),
        onUpdateSrc: (...args) => latest.current.onUpdateSrc?.(...args),
        onUpdateEvent: (...args) => latest.current.onUpdateEvent?.(...args),
        onSetEventTarget: (...args) => latest.current.onSetEventTarget?.(...args),
        getParameterEditSource: (...args) => latest.current.getParameterEditSource?.(...args),
        onUpdateParameter: (...args) => latest.current.onUpdateParameter?.(...args),
        onUpdateStateActions: (...args) => latest.current.onUpdateStateActions?.(...args),
        onUpdateSendEvents: (...args) => latest.current.onUpdateSendEvents?.(...args),
        onUpdateInSlotPath: (...args) => latest.current.onUpdateInSlotPath?.(...args),
        onUpdateOutSlotPath: (...args) => latest.current.onUpdateOutSlotPath?.(...args),
        onUpdateSlotPath: (...args) => latest.current.onUpdateSlotPath?.(...args),
        onUpdateSlotInherited: (...args) => latest.current.onUpdateSlotInherited?.(...args),
        onHoverSlotAccessSkill: (...args) => latest.current.onHoverSlotAccessSkill?.(...args),
        onSelectSlotAccessSkill: (...args) => latest.current.onSelectSlotAccessSkill?.(...args),
        onNavigateDescendantSlotSkill: (...args) => latest.current.onNavigateDescendantSlotSkill?.(...args),
        onNavigateAncestorSlot: (...args) => latest.current.onNavigateAncestorSlot?.(...args),
    }), []);
}

const nextEditorFrame = () =>
    new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve();
            return;
        }
        window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
        );
    });

const normalizeMachineIdentity = (value) =>
    String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/\.(xml|scxml)$/i, "")
        .toLowerCase() || "";

const findSubMachineByIdentity = (nodes, identity, preferredNodeId = null) => {
    const candidates = (nodes || []).filter((node) => node?.type === "submachine");
    if (preferredNodeId) {
        const exactId = candidates.find((node) => node.id === preferredNodeId);
        if (exactId) return exactId;
    }

    const wanted = normalizeMachineIdentity(identity);
    if (!wanted) return null;

    return candidates.find((node) => {
        const identities = [
            node.data?.label,
            node.data?.fullSkillName,
            node.data?.src,
        ].map(normalizeMachineIdentity);
        return identities.includes(wanted);
    }) || null;
};

const findSkillByIdentity = (nodes, nodeId, skillName) => {
    if (nodeId) {
        const exact = (nodes || []).find((node) => node.id === nodeId);
        if (exact) return exact;
    }

    const wanted = String(skillName || "").trim();
    if (!wanted) return null;
    const wantedShort = wanted.split("#")[0].split(".").pop();

    return (nodes || []).find((node) => {
        const fullName = String(node.data?.fullSkillName || "").trim();
        const label = String(node.data?.label || "").trim();
        const shortName = fullName.split("#")[0].split(".").pop();
        return (
            fullName === wanted ||
            label === wanted ||
            shortName === wantedShort ||
            label === wantedShort
        );
    }) || null;
};

export function useEditorDetailsController({
    selectedRawNode,
    semanticNodes,
    tabs,
    activeTabId,
    availableDataModelParameters,
    selectedContainerOutgoingTransitions,
    moveContainerTransition,
    getNodes,
    setNodes,
    updateNodeInternals,
    handleToggleContainerCollapse,
    clearAllEdgeSelection,
    selectEditorNode,
    fitView,
    setCenter,
    setHoveredSlotAccessNodeId,
    switchTab,
    handleOpenSubMachine,
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

    const expandAncestorsForNavigation = useCallback(
        async (targetNode) => {
            if (!targetNode?.id) return;

            const currentNodes = getNodes();
            const byId = new Map(currentNodes.map((node) => [node.id, node]));
            const containersToExpand = [];
            const visited = new Set();
            let parentId = targetNode.parentId || null;

            while (parentId && !visited.has(parentId)) {
                visited.add(parentId);
                const parent = byId.get(parentId);
                if (!parent) break;

                if (parent.type === "compound" || parent.type === "parallel") {
                    const width =
                        Number(parent.width) ||
                        Number(parent.measured?.width) ||
                        Number(parent.style?.width) ||
                        0;
                    const height =
                        Number(parent.height) ||
                        Number(parent.measured?.height) ||
                        Number(parent.style?.height) ||
                        0;
                    const hasCollapsedFootprint =
                        width <= COLLAPSED_CONTAINER_WIDTH + 1 &&
                        height <= COLLAPSED_CONTAINER_HEIGHT + 1;

                    if (parent.data?.isCollapsed || hasCollapsedFootprint) {
                        containersToExpand.push(parent.id);
                    }
                }

                parentId = parent.parentId || null;
            }

            if (containersToExpand.length === 0) return;

            const containerIds = new Set(containersToExpand);
            const deepestContainerId = containersToExpand[0];

            // Navigation can cross tabs and several nested collapsed containers
            // at once. Expanding them through the normal toggle one-by-one can
            // leave React Flow between layout states, making children reappear
            // while their parent still has the compact collapsed dimensions.
            // Restore every ancestor in one semantic update, then run the normal
            // expansion layout once over the complete now-visible hierarchy.
            setNodes((nodesBeforeExpansion) => {
                const physicallyExpanded = nodesBeforeExpansion.map((node) => {
                    if (!containerIds.has(node.id)) return node;
                    if (node.type !== "compound" && node.type !== "parallel") {
                        return node;
                    }

                    const savedSize = node.data?.expandedContainerSize || {};
                    const fallbackWidth = node.type === "compound" ? 320 : 420;
                    const fallbackHeight = node.type === "compound" ? 220 : 295;
                    const restoredWidth = Math.max(
                        Number(savedSize.width) || 0,
                        fallbackWidth
                    );
                    const restoredHeight = Math.max(
                        Number(savedSize.height) || 0,
                        fallbackHeight
                    );
                    const restoredStyle = {
                        ...(node.style || {}),
                        width: restoredWidth,
                        height: restoredHeight,
                    };

                    if (savedSize.minHeight == null) {
                        delete restoredStyle.minHeight;
                    } else {
                        restoredStyle.minHeight = savedSize.minHeight;
                    }

                    return {
                        ...node,
                        width: restoredWidth,
                        height: restoredHeight,
                        style: restoredStyle,
                        data: {
                            ...(node.data || {}),
                            isCollapsed: false,
                        },
                    };
                });

                return layoutStateContainerForExpansion(
                    physicallyExpanded,
                    deepestContainerId
                );
            });

            await nextEditorFrame();

            const containerIdsToRefresh = getNodes()
                .filter((node) =>
                    ["compound", "parallel", "parallelLane"].includes(
                        node.type
                    )
                )
                .map((node) => node.id);

            if (containerIdsToRefresh.length === 0) {
                containersToExpand.forEach((containerId) =>
                    updateNodeInternals(containerId)
                );
            } else {
                containerIdsToRefresh.forEach((containerId) =>
                    updateNodeInternals(containerId)
                );
            }

            await nextEditorFrame();
        },
        [getNodes, setNodes, updateNodeInternals]
    );

    const focusSlotAccessNode = useCallback(
        async (nodeId, skillName = "") => {
            const currentNodes = getNodes();
            const targetNode = findSkillByIdentity(
                currentNodes,
                nodeId,
                skillName
            );
            const resolvedNodeId = targetNode?.id || nodeId;
            if (!resolvedNodeId) return;

            if (targetNode) {
                await expandAncestorsForNavigation(targetNode);
            }

            clearAllEdgeSelection();
            selectEditorNode(resolvedNodeId, {
                kind: "node",
                allowMissing: true,
                tab: null,
            });
            setRightPanelTab("details");

            await nextEditorFrame();
            const flowNodes = getNodes();
            const flowNode = findSkillByIdentity(
                flowNodes,
                resolvedNodeId,
                skillName
            );

            if (!flowNode) {
                fitView({
                    nodes: [{ id: resolvedNodeId }],
                    padding: 0.8,
                    maxZoom: 1.2,
                    duration: 250,
                });
                return;
            }

            const position = getAbsoluteNodePosition(flowNode, flowNodes);
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
        },
        [
            clearAllEdgeSelection,
            expandAncestorsForNavigation,
            fitView,
            getNodes,
            selectEditorNode,
            setCenter,
            setRightPanelTab,
        ]
    );

    const handleSelectSlotAccessSkill = useCallback(
        (nodeId) => {
            if (!nodeId) return;
            setHoveredSlotAccessNodeId(null);
            void focusSlotAccessNode(nodeId);
        },
        [focusSlotAccessNode, setHoveredSlotAccessNodeId]
    );

    const handleNavigateDescendantSlotSkill = useCallback(
        async (access) => {
            if (!access) return;

            setHoveredSlotAccessNodeId(null);
            setRightPanelTab("details");

            const targetNodeId = access.nodeId || access.skillNodeId || null;
            const targetSkillName = access.skillName || "";

            if (access.sourceTabId) {
                if (access.sourceTabId !== activeTabId) {
                    switchTab(access.sourceTabId);
                    await nextEditorFrame();
                }
                await focusSlotAccessNode(targetNodeId, targetSkillName);
                return;
            }

            const machinePath = Array.isArray(access.subMachinePath)
                ? access.subMachinePath.filter(Boolean)
                : [];

            let currentNodes = getNodes();
            let subMachineNode = findSubMachineByIdentity(
                currentNodes,
                machinePath[0] || access.childLabel,
                access.childNodeId || null
            );

            if (!subMachineNode?.data?.src) {
                await focusSlotAccessNode(targetNodeId, targetSkillName);
                return;
            }

            const steps = Math.max(machinePath.length, 1);
            for (let index = 0; index < steps; index += 1) {
                if (!subMachineNode?.data?.src) break;

                await handleOpenSubMachine?.(
                    subMachineNode.data.src,
                    subMachineNode.data?.label ||
                        subMachineNode.data?.fullSkillName ||
                        machinePath[index] ||
                        "Sub-state machine"
                );
                await nextEditorFrame();

                currentNodes = getNodes();
                const isFinalMachine = index >= steps - 1;
                if (isFinalMachine) break;

                const nextIdentity = machinePath[index + 1];
                subMachineNode = findSubMachineByIdentity(
                    currentNodes,
                    nextIdentity
                );

                if (!subMachineNode) break;
            }

            await focusSlotAccessNode(targetNodeId, targetSkillName);
        },
        [
            activeTabId,
            focusSlotAccessNode,
            getNodes,
            handleOpenSubMachine,
            setHoveredSlotAccessNodeId,
            setRightPanelTab,
            switchTab,
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
        handleNavigateDescendantSlotSkill,
        handleNavigateAncestorSlot,
    };
}
