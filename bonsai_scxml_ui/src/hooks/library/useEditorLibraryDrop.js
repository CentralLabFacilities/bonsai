import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
    COMPOUND_BOTTOM_PADDING,
    COMPOUND_HEADER_HEIGHT,
    COMPOUND_NODE_GAP,
    COMPOUND_PADDING_X,
    PARALLEL_EXIT_GUTTER,
    PARALLEL_HEADER_HEIGHT,
    PARALLEL_LANE_CHILD_TOP_INSET,
    PARALLEL_NODE_GAP,
    findDropContainerAtPoint,
    getCompoundExitGutterWidth,
    getNodeId,
    isAutoParallelLaneCompound,
    orderNodesParentsFirst,
    resolveNodeCollisionsAndRefit,
} from "../../utils/editorGeometry";
import { getOverviewLayoutNodeSize } from "../../utils/layoutUtils";
import { getSlotPathFromNode, isKnownSlotType, normalizeSlotPath, normalizeSlotType } from "../../utils/editorGraph";
import { isEditorModalOpen } from "../interaction/useGlobalEditorShortcuts.js";

export function useEditorLibraryDrop({
    activeMode,
    nodes,
    flowContainerRef,
    getTabSnapshot,
    getActiveDocumentIdentity,
    getDocumentSnapshot,
    screenToFlowPosition,
    setParallelDropTargetId,
    setCompoundDropTargetId,
    createBehaviorNode,
    createNode,
    checkSlotConnection,
    setNodes,
    setManualSlots,
    setSelectedNodeId,
    syncInsertedEditorStatesAfterCommit,
    syncInsertedParallelLaneStateAfterCommit,
    syncSlotsAfterCommit,
}) {
    const activeModeRef = useRef(activeMode);
    const lifetimeRef = useRef(0);
    const mountedRef = useRef(false);
    const pendingFramesRef = useRef(new Set());
    const [libraryDropError, setLibraryDropError] = useState(null);
    const dismissLibraryDropError = useCallback(() => setLibraryDropError(null), []);
    useLayoutEffect(() => {
        activeModeRef.current = activeMode;
    }, [activeMode]);
    useLayoutEffect(() => {
        mountedRef.current = true;
        const frames = pendingFramesRef.current;
        return () => {
            mountedRef.current = false;
            lifetimeRef.current += 1;
            frames.forEach((id) => cancelAnimationFrame(id));
            frames.clear();
        };
    }, []);

    const handleLibraryDragOver = useCallback(
        (event) => {
            event.preventDefault();

            const skill = event.dataTransfer.getData("skill");
            const behavior = event.dataTransfer.getData("behavior");
            if (!skill && !behavior) return;

            const pointerPosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const hoveredContainer = findDropContainerAtPoint(
                pointerPosition,
                nodes
            );
            const hoveredCompound =
                hoveredContainer?.type === "compound"
                    ? hoveredContainer
                    : null;
            const hoveredLane =
                hoveredContainer?.type === "parallelLane"
                    ? hoveredContainer
                    : null;

            setCompoundDropTargetId(hoveredCompound?.id || null);
            setParallelDropTargetId(hoveredLane?.id || null);
        },
        [
            nodes,
            screenToFlowPosition,
            setCompoundDropTargetId,
            setParallelDropTargetId,
        ]
    );

    const handleLibraryDragLeave = useCallback(
        (event) => {
            const rect = event.currentTarget.getBoundingClientRect();

            const actuallyLeft =
                event.clientX <= rect.left ||
                event.clientX >= rect.right ||
                event.clientY <= rect.top ||
                event.clientY >= rect.bottom;

            if (actuallyLeft) {
                setParallelDropTargetId(null);
                setCompoundDropTargetId(null);
            }
        },
        [setCompoundDropTargetId, setParallelDropTargetId]
    );

    const insertLibraryItem = useCallback(
        async (mousePosition, skill, behaviorPayload = "", atRoot = false) => {
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);

            if (!mountedRef.current || activeModeRef.current === "code" || isEditorModalOpen()) return false;
            const origin = getTabSnapshot();
            if (!origin) return false;
            const identity = getActiveDocumentIdentity();
            const lifetime = lifetimeRef.current;
            const getOwnedDocument = () => {
                if (!mountedRef.current || lifetimeRef.current !== lifetime ||
                    getActiveDocumentIdentity() !== identity) return null;
                const tab = getTabSnapshot();
                return tab?.id === origin.id && tab.documentGeneration === origin.documentGeneration
                    ? getDocumentSnapshot() : null;
            };
            const isBehaviorDrop = Boolean(behaviorPayload);

            let newNode;

            if (behaviorPayload) {
                let behavior;
                try {
                    behavior = JSON.parse(behaviorPayload);
                } catch {
                    throw new Error("The dragged behavior data is invalid. Drag the behavior again from the library.");
                }
                if (!behavior?.source) throw new Error("The dragged behavior has no source file.");
                newNode = await createBehaviorNode(behavior, { x: 0, y: 0 });
            } else {
                if (!skill) return false;
                newNode = await createNode(
                    skill.includes("skills.") ? skill.split("skills.")[1] : skill,
                    getNodeId(),
                    { x: 0, y: 0 }
                );
            }

            // Skill inspection is asynchronous. Never append its result to a
            // different or replaced workflow, and rebase onto live node edits.
            const current = getOwnedDocument();
            if (
                !newNode || !current ||
                activeModeRef.current === "code" || isEditorModalOpen()
            ) return false;
            const nodes = current.nodes;
            const targetContainer = atRoot ? null : findDropContainerAtPoint(mousePosition, nodes);
            const targetCompound = targetContainer?.type === "compound" ? targetContainer : null;
            const targetLane = targetContainer?.type === "parallelLane" ? targetContainer : null;
            const targetLaneCompound = targetLane
                ? nodes.find((candidate) => candidate.parentId === targetLane.id && isAutoParallelLaneCompound(candidate)) || null
                : null;
            const insertionCompound = targetCompound || targetLaneCompound;

            const finishInsertion = (laneId = null) => {
                const reportSyncError = (error) => {
                    if (!getOwnedDocument()) return;
                    setLibraryDropError({
                        action: "sync",
                        title: `Could not synchronize ${origin.title || "workflow"}`,
                        message: String(error?.message || error || "Native synchronization failed."),
                        guidance: "The item remains in the editor. Save the workflow to retry persistence.",
                    });
                };
                const syncInsertion = () => laneId
                    ? syncInsertedParallelLaneStateAfterCommit?.(newNode.id, laneId)
                    : syncInsertedEditorStatesAfterCommit?.(newNode.id);
                if (!isBehaviorDrop) {
                    void Promise.resolve(syncInsertion()).catch(reportSyncError);
                    return;
                }

                const live = getOwnedDocument();
                if (!live) return;
                const declarations = [...live.manualSlots];
                const conflicts = new Set();
                (newNode.data?.inheritedSlots || []).forEach((requirement) => {
                    const path = normalizeSlotPath(requirement?.path || requirement?.inherited?.xpath || requirement?.xpath);
                    if (!path) return;
                    const declaration = declarations.find((slot) =>
                        normalizeSlotPath(slot?.inherited?.xpath || slot?.path) === path);
                    const bindings = live.nodes.flatMap((node) =>
                        [...(node.data?.inSlots || []), ...(node.data?.outSlots || [])]).filter((slot) =>
                        normalizeSlotPath(slot?.path) && String(slot?.key || "").trim() &&
                        normalizeSlotPath(slot?.inherited?.xpath || slot?.path) === path);
                    const canonical = live.slotNodes.find((node) => !node.data?.isSlotClone && getSlotPathFromNode(node) === path);
                    const parentType = (isKnownSlotType(declaration?.type) ? declaration.type : null) ||
                        bindings.find((slot) => isKnownSlotType(slot.type))?.type ||
                        (isKnownSlotType(canonical?.data?.slotType) ? canonical.data.slotType : null) ||
                        declaration?.type || bindings[0]?.type || canonical?.data?.slotType;
                    if (isKnownSlotType(parentType) && isKnownSlotType(requirement.type) &&
                        normalizeSlotType(parentType) !== normalizeSlotType(requirement.type)) {
                        conflicts.add(`/${path}: parent ${parentType}, child ${requirement.type}`);
                    }
                    if (declaration || bindings.length) return;

                    // A visual derived slot is not a declaration. Materialize
                    // its existing path/type without moving it or its aliases.
                    // Child inheritance never promotes a normal parent slot.
                    const inherited = Boolean(canonical?.data?.currentMachineInherited ||
                        canonical?.data?.inherited || canonical?.data?.slotKind === "inheritSlot");
                    declarations.push({
                        id: `manual-${crypto.randomUUID()}`,
                        path: `/${path}`,
                        type: parentType || requirement.type || "Unknown",
                        slotKind: inherited ? "inheritSlot" : "slot",
                        inherited: inherited ? { state: canonical.data?.inheritedFrom || "", xpath: `/${path}` } : null,
                        createdForChildRequirements: true,
                    });
                });
                if (declarations.length !== live.manualSlots.length) setManualSlots(declarations);
                checkSlotConnection(live.nodes, declarations, live.slotNodes, live.slotEdges);
                if (conflicts.size) {
                    setLibraryDropError({
                        action: "slot-type",
                        title: `Slot type conflict in ${origin.title || "workflow"}`,
                        message: [...conflicts].join("; "),
                        guidance: "Existing parent types were preserved. Resolve the child requirements before connecting incompatible slots.",
                    });
                }

                const getOwnedInsertion = () => {
                    const snapshot = getOwnedDocument();
                    const inserted = snapshot?.nodes.find((node) => node.id === newNode.id);
                    return inserted?.type === newNode.type && inserted.data?.src === newNode.data?.src &&
                        inserted.data?.inheritedSlots === newNode.data?.inheritedSlots ? snapshot : null;
                };
                const scheduleFrame = (callback) => {
                    const id = requestAnimationFrame(() => {
                        pendingFramesRef.current.delete(id);
                        const snapshot = getOwnedInsertion();
                        if (snapshot) callback(snapshot);
                    });
                    pendingFramesRef.current.add(id);
                };
                scheduleFrame(() => {
                    // Persist the state (including lane reconciliation) first.
                    // Only then sync #_SLOTS from the latest committed parent,
                    // not an override captured before unrelated native edits.
                    void Promise.resolve(syncInsertion()).then(() => {
                        if (!getOwnedInsertion()) return;
                        scheduleFrame((snapshot) => {
                            checkSlotConnection(snapshot.nodes, snapshot.manualSlots, snapshot.slotNodes, snapshot.slotEdges);
                            void Promise.resolve(syncSlotsAfterCommit?.(null, {
                                reason: "library-child-requirements", nodeId: newNode.id,
                            })).catch(reportSyncError);
                        });
                    }).catch(reportSyncError);
                });
            };

            const {
                width: estimatedNodeWidth,
                height: estimatedNodeHeight,
            } = getOverviewLayoutNodeSize(newNode);

            if (insertionCompound) {
                let newX = COMPOUND_PADDING_X;

                nodes
                    .filter(
                        (member) => member.parentId === insertionCompound.id
                    )
                    .forEach((member) => {
                        const size = getOverviewLayoutNodeSize(member);
                        newX = Math.max(
                            newX,
                            Number(member.position?.x || 0) +
                            size.width +
                            COMPOUND_NODE_GAP
                        );
                    });

                newNode.parentId = insertionCompound.id;
                newNode.extent = "parent";
                newNode.position = {
                    x: newX,
                    y: COMPOUND_HEADER_HEIGHT,
                };

                setNodes((currentNodes) => {
                    const right = newX + estimatedNodeWidth;
                    const bottom =
                        COMPOUND_HEADER_HEIGHT + estimatedNodeHeight;

                    return orderNodesParentsFirst([
                        ...currentNodes.map((candidate) =>
                            candidate.id === insertionCompound.id
                                ? {
                                    ...candidate,
                                    style: {
                                        ...candidate.style,
                                        width: Math.max(
                                            Number(candidate.style?.width) || 320,
                                            right +
                                            COMPOUND_PADDING_X +
                                            getCompoundExitGutterWidth(
                                                insertionCompound.data?.events || []
                                            )
                                        ),
                                        height: Math.max(
                                            Number(candidate.style?.height) || 180,
                                            bottom + COMPOUND_BOTTOM_PADDING
                                        ),
                                    },
                                }
                                : candidate
                        ),
                        newNode,
                    ]);
                });

                setSelectedNodeId(newNode.id);
                finishInsertion();
                return true;
            }

            if (targetLane) {
                const existingMembers = nodes.filter(
                    (node) => node.parentId === targetLane.id
                );

                let newX = 25;
                existingMembers.forEach((member) => {
                    const memberWidth = getOverviewLayoutNodeSize(member).width;
                    newX = Math.max(
                        newX,
                        Number(member.position?.x || 0) +
                        memberWidth +
                        PARALLEL_NODE_GAP
                    );
                });

                newNode.parentId = targetLane.id;
                newNode.extent = "parent";
                newNode.position = {
                    x: newX,
                    y: PARALLEL_LANE_CHILD_TOP_INSET,
                };
                const parallelId = targetLane.parentId;

                setNodes((currentNodes) => {
                    let nextNodes = [...currentNodes, newNode];

                    const parallel = nextNodes.find(
                        (node) => node.id === parallelId
                    );
                    if (!parallel) {
                        return orderNodesParentsFirst(nextNodes);
                    }

                    const lanes = nextNodes
                        .filter(
                            (node) =>
                                node.type === "parallelLane" &&
                                node.parentId === parallelId
                        )
                        .sort(
                            (a, b) =>
                                Number(a.position?.y || 0) -
                                Number(b.position?.y || 0)
                        );

                    let requiredParallelWidth = 420;
                    lanes.forEach((lane) => {
                        const members = nextNodes.filter(
                            (node) => node.parentId === lane.id
                        );
                        let maxRight = 0;

                        members.forEach((member) => {
                            const memberWidth =
                                member.id === newNode.id
                                    ? estimatedNodeWidth
                                    : getOverviewLayoutNodeSize(member).width;
                            maxRight = Math.max(
                                maxRight,
                                Number(member.position?.x || 0) + memberWidth
                            );
                        });

                        requiredParallelWidth = Math.max(
                            requiredParallelWidth,
                            maxRight + PARALLEL_EXIT_GUTTER
                        );
                    });

                    const laneLayouts = new Map();
                    const headerHeight =
                        lanes.length > 0
                            ? Math.max(
                                PARALLEL_HEADER_HEIGHT,
                                Number(
                                    lanes[0].position?.y ||
                                    PARALLEL_HEADER_HEIGHT
                                )
                            )
                            : PARALLEL_HEADER_HEIGHT;
                    let currentY = headerHeight;

                    lanes.forEach((lane) => {
                        const members = nextNodes.filter(
                            (node) => node.parentId === lane.id
                        );
                        let maxBottom = 0;

                        members.forEach((member) => {
                            const memberHeight =
                                member.id === newNode.id
                                    ? estimatedNodeHeight
                                    : getOverviewLayoutNodeSize(member).height;
                            maxBottom = Math.max(
                                maxBottom,
                                Number(member.position?.y || 0) + memberHeight
                            );
                        });

                        const requiredHeight = Math.max(130, maxBottom + 30);
                        laneLayouts.set(lane.id, {
                            y: currentY,
                            height: requiredHeight,
                        });
                        currentY += requiredHeight;
                    });

                    const requiredParallelHeight = currentY + 35;

                    nextNodes = nextNodes.map((node) => {
                        if (node.id === parallelId) {
                            return {
                                ...node,
                                style: {
                                    ...node.style,
                                    width: requiredParallelWidth,
                                    height: requiredParallelHeight,
                                },
                            };
                        }

                        if (
                            node.type === "parallelLane" &&
                            node.parentId === parallelId
                        ) {
                            const layout = laneLayouts.get(node.id);
                            if (!layout) return node;
                            return {
                                ...node,
                                position: {
                                    ...node.position,
                                    y: layout.y,
                                },
                                style: {
                                    ...node.style,
                                    width: requiredParallelWidth,
                                    height: layout.height,
                                },
                            };
                        }

                        return node;
                    });

                    return orderNodesParentsFirst(nextNodes);
                });

                setSelectedNodeId(newNode.id);
                finishInsertion(targetLane.id);
                return true;
            }

            newNode.position = {
                x: mousePosition.x - estimatedNodeWidth / 2,
                y: mousePosition.y - estimatedNodeHeight / 2,
            };

            setNodes((currentNodes) =>
                resolveNodeCollisionsAndRefit(
                    [...currentNodes, newNode],
                    newNode.id
                )
            );
            setSelectedNodeId(newNode.id);
            finishInsertion();
            return true;
        },
        [
            checkSlotConnection,
            createBehaviorNode,
            createNode,
            getActiveDocumentIdentity,
            getDocumentSnapshot,
            getTabSnapshot,
            setCompoundDropTargetId,
            setNodes,
            setManualSlots,
            setParallelDropTargetId,
            setSelectedNodeId,
            syncInsertedEditorStatesAfterCommit,
            syncInsertedParallelLaneStateAfterCommit,
            syncSlotsAfterCommit,
        ]
    );

    const handleLibraryDrop = useCallback(async (event) => {
        event.preventDefault();
        if (!mountedRef.current) return false;
        const origin = getTabSnapshot();
        const identity = getActiveDocumentIdentity();
        const lifetime = lifetimeRef.current;
        setLibraryDropError(null);
        try {
            return await insertLibraryItem(
                screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                event.dataTransfer.getData("skill"),
                event.dataTransfer.getData("behavior"),
            );
        } catch (error) {
            if (!mountedRef.current || lifetimeRef.current !== lifetime ||
                getActiveDocumentIdentity() !== identity) return false;
            console.error("Could not insert library item:", error);
            setLibraryDropError({
                action: "insert",
                title: `Could not add an item to ${origin?.title || "workflow"}`,
                message: String(error?.message || error || "The library item could not be loaded."),
                guidance: "Check the backend connection or behavior file, then add or drag the item again.",
            });
            return false;
        }
    }, [getActiveDocumentIdentity, getTabSnapshot, insertLibraryItem, screenToFlowPosition]);

    const handleAddLibrarySkill = useCallback((skill) => {
        const rect = flowContainerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return Promise.resolve(false);
        return insertLibraryItem(
            screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }),
            skill,
            "",
            true,
        );
    }, [flowContainerRef, insertLibraryItem, screenToFlowPosition]);

    return {
        handleLibraryDragOver,
        handleLibraryDragLeave,
        handleLibraryDrop,
        handleAddLibrarySkill,
        libraryDropError,
        dismissLibraryDropError,
    };
}
