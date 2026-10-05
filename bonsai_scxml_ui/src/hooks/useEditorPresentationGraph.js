import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { getCollapsedTransitionSource } from "../utils/editorGraph.js";
import { getLocalDataModelEntries } from "../utils/editorScxml.js";
import { useDerivedGraphSnapshot, useSemanticNodeSnapshot } from "./useEditorGraphMaintenance.js";

export function projectOutgoingTransitionHandles(previous, edges) {
    const handlesByNodeId = new Map();
    edges.forEach((edge) => {
        if (!edge?.source || edge.sourceHandle == null) return;
        if (!handlesByNodeId.has(edge.source)) {
            handlesByNodeId.set(edge.source, new Set());
        }
        handlesByNodeId.get(edge.source).add(String(edge.sourceHandle));
    });

    let changed = previous.size !== handlesByNodeId.size;
    const result = new Map();
    handlesByNodeId.forEach((handles, nodeId) => {
        const sortedHandles = [...handles].sort();
        const signature = sortedHandles.join("\u001f");
        const previousEntry = previous.get(nodeId);
        if (previousEntry?.signature === signature) {
            result.set(nodeId, previousEntry);
        } else {
            changed = true;
            result.set(nodeId, { handles: signature ? sortedHandles : [], signature });
        }
    });
    return changed ? result : previous;
}

function useNodeActionForwarders(handlers) {
    const handlersRef = useRef(handlers);
    useLayoutEffect(() => {
        handlersRef.current = handlers;
    });

    // These refs belong only to event handlers. Keeping callback publication
    // separate prevents fresh caller functions from invalidating graph caches.
    const onAddLane = useCallback((...args) => handlersRef.current.handleAddLaneToParallel?.(...args), []);
    const onOpenStateActions = useCallback((...args) => handlersRef.current.handleOpenStateActions?.(...args), []);
    const onOpenParameter = useCallback((...args) => handlersRef.current.handleOpenParameter?.(...args), []);
    const onOpenSlot = useCallback((...args) => handlersRef.current.handleOpenSlot?.(...args), []);
    const onOpenTransition = useCallback((...args) => handlersRef.current.handleOpenTransition?.(...args), []);
    const onOpenSubMachine = useCallback((...args) => handlersRef.current.handleOpenSubMachine?.(...args), []);
    const onToggleCollapse = useCallback((...args) => handlersRef.current.handleToggleContainerCollapse?.(...args), []);
    return { onAddLane, onOpenStateActions, onOpenParameter, onOpenSlot,
        onOpenTransition, onOpenSubMachine, onToggleCollapse };
}

/**
 * Owns the presentation-only graph indexes and injected React Flow node props.
 * Keeping this outside App prevents topology/cache bookkeeping from obscuring
 * editor mutations and keeps node object identity stable across visual updates.
 */
export function useEditorPresentationGraph({
    semanticNodes,
    slotNodes,
    isDraggingNode,
    nodes,
    edges,
    tabs,
    activeTabId,
    activeMode,
    slotConnectionDrag,
    handleAddLaneToParallel,
    handleOpenStateActions,
    handleOpenParameter,
    handleOpenSlot,
    handleOpenTransition,
    handleOpenSubMachine,
    handleToggleContainerCollapse,
}) {
    const semanticSlotNodes = useSemanticNodeSnapshot(slotNodes, isDraggingNode);
    const { onAddLane, onOpenStateActions, onOpenParameter, onOpenSlot,
        onOpenTransition, onOpenSubMachine, onToggleCollapse } = useNodeActionForwarders({
        handleAddLaneToParallel, handleOpenStateActions, handleOpenParameter,
        handleOpenSlot, handleOpenTransition, handleOpenSubMachine, handleToggleContainerCollapse,
    });

    // Build the semantic hierarchy once per real topology/data change. Compound
    // and Parallel operations used to construct several independent maps and
    // then rediscover collapsed descendants by repeatedly traversing the same
    // subtrees. Large workflows with many nested containers paid that cost over
    // and over even though parent/child membership had not changed.
    //
    // Keep all hierarchy-derived data together so every consumer shares the
    // same cached topology snapshot. Collapsed visibility is propagated in one
    // tree walk: each semantic node is visited at most once, even when several
    // collapsed containers are nested inside one another.
    const semanticHierarchy = useMemo(() => {
        const nodeById = new Map();
        const parentByNodeId = new Map();
        const childIdsByParent = new Map();
        const childrenByParent = new Map();

        semanticNodes.forEach((node) => {
            nodeById.set(node.id, node);

            if (!node.parentId) return;
            parentByNodeId.set(node.id, node.parentId);

            if (!childIdsByParent.has(node.parentId)) {
                childIdsByParent.set(node.parentId, []);
                childrenByParent.set(node.parentId, []);
            }

            childIdsByParent.get(node.parentId).push(node.id);
            childrenByParent.get(node.parentId).push(node);
        });

        const hiddenNodeIds = new Set();
        const visitedNodeIds = new Set();
        const stack = [];

        // Start with semantic roots. Children of a collapsed Compound/Parallel
        // inherit hidden=true, but the container itself remains visible.
        semanticNodes.forEach((node) => {
            if (!node.parentId || !nodeById.has(node.parentId)) {
                stack.push({ node, hiddenByAncestor: false });
            }
        });

        const walk = () => {
            while (stack.length > 0) {
                const { node, hiddenByAncestor } = stack.pop();
                if (!node || visitedNodeIds.has(node.id)) continue;
                visitedNodeIds.add(node.id);

                if (hiddenByAncestor) hiddenNodeIds.add(node.id);

                const hidesChildren =
                    hiddenByAncestor ||
                    ((node.type === "compound" || node.type === "parallel") &&
                        Boolean(node.data?.isCollapsed));

                const children = childrenByParent.get(node.id) || [];
                for (let index = children.length - 1; index >= 0; index -= 1) {
                    stack.push({
                        node: children[index],
                        hiddenByAncestor: hidesChildren,
                    });
                }
            }
        };

        walk();

        // Malformed/imported graphs can contain orphaned parent cycles or
        // disconnected islands. Process them as additional roots so the index
        // remains total without risking an infinite traversal.
        semanticNodes.forEach((node) => {
            if (visitedNodeIds.has(node.id)) return;
            stack.push({ node, hiddenByAncestor: false });
            walk();
        });

        return {
            nodeById,
            parentByNodeId,
            childIdsByParent,
            childrenByParent,
            hiddenNodeIds,
        };
    }, [semanticNodes]);

    const nodeById = semanticHierarchy.nodeById;
    const childIdsByParent = semanticHierarchy.childIdsByParent;
    const semanticChildrenByParent = semanticHierarchy.childrenByParent;
    const hiddenNodeIds = semanticHierarchy.hiddenNodeIds;

    const slotNodeIdSet = useMemo(
        () => new Set(semanticSlotNodes.map((node) => node.id)),
        [semanticSlotNodes]
    );


    // Cache the transition handles used by each skill for its local validation
    // badge. CustomNode used to call React Flow's useEdges(), which subscribed
    // every skill node to the entire edge array. With a large state machine,
    // showing/highlighting one transition could therefore wake up every skill.
    // Keep the full transition graph loaded, but expose only this tiny derived
    // per-skill dependency to the node renderer.
    const outgoingTransitionHandlesByNodeId = useDerivedGraphSnapshot(
        [edges],
        (previous = new Map()) => projectOutgoingTransitionHandles(previous, edges)
    );

    // Expose the single semantic incoming transition to the target node so the
    // visible entry handle can hand the drag off to React Flow's native edge
    // reconnect anchor. With zero or multiple incoming transitions the entry
    // handle remains a normal target only.
    const reconnectableIncomingEdgeByNodeId = useMemo(() => {
        const incoming = new Map();

        edges.forEach((edge) => {
            if (
                edge.data?.boundaryInternalEdge ||
                edge.data?.compoundInternalEdge ||
                edge.data?.parallelInternalEdge ||
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge
            ) {
                return;
            }
            if (!edge.target) return;

            if (!incoming.has(edge.target)) incoming.set(edge.target, []);
            incoming.get(edge.target).push(edge);
        });

        return new Map(
            [...incoming.entries()]
                .filter(([, incomingEdges]) => incomingEdges.length === 1)
                .map(([nodeId, incomingEdges]) => [nodeId, incomingEdges[0].id])
        );
    }, [edges]);

    // Track outgoing transitions whose event handle is not actually exposed by
    // the source state. Imported SCXML can legitimately contain such edges: we
    // keep them visible and report them in Problems, but the source skill/Sub-SM
    // should also carry the small warning badge. Derive this from the same
    // semantic event metadata used by the Problems validator.
    const unexposedTransitionHandlesByNodeId = useMemo(() => {
        const result = new Map();

        // This metadata depends on state/event semantics, not x/y geometry.
        // semanticNodes is intentionally stable for the duration of a drag,
        // so moving one node no longer rescans every state's exit tokens on
        // every pointer frame.
        semanticNodes.forEach((node) => {
            const outgoingHandles =
                outgoingTransitionHandlesByNodeId.get(node.id)?.handles || [];
            if (outgoingHandles.length === 0) return;

            const exposedHandles = new Set(
                (node.data?.events || [])
                    .filter(
                        (event) =>
                            !event?.editorImportedSynthetic &&
                            !event?.editorBoundarySynthetic
                    )
                    .map((event) => String(event?.id || "").trim())
                    .filter(Boolean)
            );
            const baseStateName = String(
                node.data?.fullSkillName || node.data?.label || ""
            )
                .split("#")[0]
                .split(".")
                .pop()
                .toLowerCase();
            const exposesImplicitFatal =
                node.type === "custom" &&
                !node.data?.isFinal &&
                !node.data?.isBehaviorExit &&
                baseStateName !== "end" &&
                baseStateName !== "fatal";

            if (exposesImplicitFatal) exposedHandles.add("fatal");

            const unexposedHandles = outgoingHandles
                .map((handle) => String(handle || "").trim())
                .filter(
                    (handle) =>
                        handle &&
                        handle !== "*" &&
                        !exposedHandles.has(handle)
                )
                .sort();

            if (unexposedHandles.length > 0) {
                result.set(node.id, unexposedHandles);
            }
        });

        return result;
    }, [semanticNodes, outgoingTransitionHandlesByNodeId]);

    const collapsedParallelTransitionHandlesByNodeId = useMemo(() => {
        const result = new Map();

        edges.forEach((edge) => {
            if (
                edge.data?.boundaryInternalEdge ||
                edge.data?.compoundInternalEdge ||
                edge.data?.parallelInternalEdge ||
                edge.data?.compoundInitialEdge ||
                edge.data?.parallelEntryEdge
            ) {
                return;
            }

            const collapsedSource = getCollapsedTransitionSource(edge, nodeById);
            if (!collapsedSource) return;
            if (nodeById.get(collapsedSource.nodeId)?.type !== "parallel") return;

            if (!result.has(collapsedSource.nodeId)) {
                result.set(collapsedSource.nodeId, new Map());
            }

            const byHandle = result.get(collapsedSource.nodeId);
            if (!byHandle.has(collapsedSource.sourceHandle)) {
                byHandle.set(collapsedSource.sourceHandle, {
                    id: collapsedSource.sourceHandle,
                    name: collapsedSource.label,
                    sourceNodeId: collapsedSource.logicalSourceId,
                    transitionHandleId: collapsedSource.logicalHandle,
                });
            }
        });

        return new Map(
            [...result.entries()].map(([nodeId, byHandle]) => [
                nodeId,
                [...byHandle.values()],
            ])
        );
    }, [edges, nodeById]);


    const childTabBySubmachineNodeId = useMemo(() => {
        const result = new Map();

        semanticNodes.forEach((node) => {
            if (node.type !== "submachine") return;

            const srcFileName = String(node.data?.src || "")
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
                        String(tab.sourcePath) === String(node.data?.src || "")) ||
                    String(tab.title || "") === String(node.data?.label || "") ||
                    (srcFileName && tabFileName === srcFileName)
                );
            });

            if (childTab) result.set(node.id, childTab);
        });

        return result;
    }, [semanticNodes, tabs, activeTabId]);

    // Keep the injected React Flow node objects stable whenever the source
    // node itself did not change. During a drag React Flow normally replaces
    // only the moved node; recreating wrappers for every other node forces
    // unnecessary custom-node renders.
    const injectedGraph = useDerivedGraphSnapshot([
        nodes,
        outgoingTransitionHandlesByNodeId,
        unexposedTransitionHandlesByNodeId,
        collapsedParallelTransitionHandlesByNodeId,
        reconnectableIncomingEdgeByNodeId,
        childTabBySubmachineNodeId,
        activeMode,
        onAddLane,
        onOpenStateActions,
        onOpenParameter,
        onOpenSlot,
        onOpenTransition,
        onOpenSubMachine,
        onToggleCollapse,
        hiddenNodeIds,
        slotConnectionDrag,
    ], (injectedNodeSnapshot = { cache: new Map(), nodes: [] }) => {
        const previousCache = injectedNodeSnapshot.cache;
        const nextCache = new Map();

        const result = nodes.map((n) => {
            const hidden = hiddenNodeIds.has(n.id);
            const outgoingTransitionInfo =
                outgoingTransitionHandlesByNodeId.get(n.id) || null;
            const outgoingTransitionSignature =
                outgoingTransitionInfo?.signature || "";
            const unexposedTransitionHandles =
                unexposedTransitionHandlesByNodeId.get(n.id) || [];
            const unexposedTransitionSignature =
                unexposedTransitionHandles.join("\u001f");
            const collapsedTransitionHandles =
                collapsedParallelTransitionHandlesByNodeId.get(n.id) || [];
            const reconnectIncomingEdgeId =
                (n.type === "custom" || n.type === "submachine")
                    ? reconnectableIncomingEdgeByNodeId.get(n.id) || null
                    : null;
            const collapsedTransitionSignature = collapsedTransitionHandles
                .map((event) => `${event.id}:${event.name}:${event.sourceNodeId}:${event.transitionHandleId}`)
                .join("\u001f");
            const childTab =
                n.type === "submachine"
                    ? childTabBySubmachineNodeId.get(n.id) || null
                    : null;

            const cached = previousCache.get(n.id);
            const childGlobalDataModel = childTab?.globalDataModel || null;
            const canReuse = Boolean(
                cached &&
                cached.sourceNode === n &&
                cached.hidden === hidden &&
                cached.outgoingTransitionSignature ===
                    outgoingTransitionSignature &&
                cached.unexposedTransitionSignature ===
                    unexposedTransitionSignature &&
                cached.collapsedTransitionSignature ===
                    collapsedTransitionSignature &&
                cached.reconnectIncomingEdgeId === reconnectIncomingEdgeId &&
                cached.activeMode === activeMode &&
                cached.slotConnectionDrag === slotConnectionDrag &&
                cached.childGlobalDataModel === childGlobalDataModel
            );

            if (canReuse) {
                nextCache.set(n.id, cached);
                return cached.value;
            }

            const injectedData = {
                ...n.data,
                mode: activeMode,
                outgoingTransitionHandles:
                    outgoingTransitionInfo?.handles || [],
                unexposedTransitionHandles,
                collapsedTransitionHandles,
                reconnectIncomingEdgeId,
                onOpenStateActions,
                onOpenParameter,
                onOpenSlot,
                onOpenTransition,
                slotConnectionDrag,
                onToggleCollapse,
            };

            if (n.type === "submachine") {
                injectedData.onOpenSubMachine = onOpenSubMachine;

                if (childTab) {
                    injectedData.localDataModel = getLocalDataModelEntries(
                        childTab.globalDataModel
                    );
                }
            }

            if (n.type === "parallel") {
                injectedData.onAddLane = onAddLane;
            }

            const value = {
                ...n,
                hidden,
                data: injectedData,
            };

            nextCache.set(n.id, {
                sourceNode: n,
                hidden,
                outgoingTransitionSignature,
                unexposedTransitionSignature,
                collapsedTransitionSignature,
                reconnectIncomingEdgeId,
                activeMode,
                slotConnectionDrag,
                childGlobalDataModel,
                value,
            });

            return value;
        });

        if (
            result.length === injectedNodeSnapshot.nodes.length &&
            result.every((node, index) => node === injectedNodeSnapshot.nodes[index])
        ) {
            return injectedNodeSnapshot;
        }
        return { cache: nextCache, nodes: result };
    });
    const injectedNodes = injectedGraph.nodes;

    const injectedSlotGraph = useDerivedGraphSnapshot([
        slotNodes,
        slotConnectionDrag,
    ], (injectedSlotNodeSnapshot = { cache: new Map(), nodes: [] }) => {
        const previousCache = injectedSlotNodeSnapshot.cache;
        const nextCache = new Map();

        const result = slotNodes.map((node) => {
            const cached = previousCache.get(node.id);
            if (
                cached?.sourceNode === node &&
                cached?.slotConnectionDrag === slotConnectionDrag
            ) {
                nextCache.set(node.id, cached);
                return cached.value;
            }

            const value = {
                ...node,
                data: {
                    ...node.data,
                    slotConnectionDrag,
                },
            };

            nextCache.set(node.id, {
                sourceNode: node,
                slotConnectionDrag,
                value,
            });

            return value;
        });

        if (
            result.length === injectedSlotNodeSnapshot.nodes.length &&
            result.every((node, index) => node === injectedSlotNodeSnapshot.nodes[index])
        ) {
            return injectedSlotNodeSnapshot;
        }
        return { cache: nextCache, nodes: result };
    });
    const injectedSlotNodes = injectedSlotGraph.nodes;


    return {
        semanticSlotNodes,
        nodeById,
        childIdsByParent,
        semanticChildrenByParent,
        hiddenNodeIds,
        slotNodeIdSet,
        injectedNodes,
        injectedSlotNodes,
    };
}
