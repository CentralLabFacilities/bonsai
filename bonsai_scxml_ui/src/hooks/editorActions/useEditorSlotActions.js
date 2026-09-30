import { useCallback } from "react";
import {
    getSlotPathFromNode,
    normalizeSlotPath,
} from "../../utils/editorGraph";

/**
 * Slot/declaration mutations that must update skills and the workflow-level
 * #_SLOTS declarations together.
 */
export function useEditorSlotActions({
    nodes,
    slotNodes,
    manualSlots,
    setNodes,
    setManualSlots,
    setSelectedNodeId,
    checkSlotConnection,
}) {
    const updateSlotPath = useCallback(
        (slotNode, nextPath) => {
            if (!slotNode || slotNode.type !== "slot") return false;

            const oldPath = getSlotPathFromNode(slotNode);
            const newPath = normalizeSlotPath(nextPath);
            if (!oldPath || !newPath || oldPath === newPath) return false;

            const formattedPath = `/${newPath}`;
            const updateSlotReference = (slot) => {
                if (normalizeSlotPath(slot?.path) !== oldPath) return slot;

                return {
                    ...slot,
                    path: formattedPath,
                    inherited: slot?.inherited
                        ? {
                              ...slot.inherited,
                              xpath: formattedPath,
                          }
                        : slot?.inherited,
                };
            };

            const updatedNodes = nodes.map((node) => ({
                ...node,
                data: {
                    ...node.data,
                    inSlots: (node.data?.inSlots || []).map(
                        updateSlotReference
                    ),
                    outSlots: (node.data?.outSlots || []).map(
                        updateSlotReference
                    ),
                },
            }));

            const updatedManualSlots = (manualSlots || []).map((slot) => {
                const declarationPath = normalizeSlotPath(
                    slot?.inherited?.xpath || slot?.path
                );
                if (declarationPath !== oldPath) return slot;

                return {
                    ...slot,
                    path: formattedPath,
                    inherited: slot?.inherited
                        ? {
                              ...slot.inherited,
                              xpath: formattedPath,
                          }
                        : slot?.inherited,
                };
            });

            const oldCanonicalSlotNodeId = `slot-${oldPath}`;
            const newCanonicalSlotNodeId = `slot-${newPath}`;
            const updatedSlotNodes = slotNodes.map((candidate) => {
                const isCanonical = candidate.id === oldCanonicalSlotNodeId;
                const isClone =
                    candidate.data?.isSlotClone &&
                    candidate.data?.cloneOfNodeId === oldCanonicalSlotNodeId;

                if (!isCanonical && !isClone) return candidate;

                return {
                    ...candidate,
                    ...(isCanonical ? { id: newCanonicalSlotNodeId } : {}),
                    data: {
                        ...(candidate.data || {}),
                        path: formattedPath,
                        label: formattedPath,
                        ...(isClone
                            ? { cloneOfNodeId: newCanonicalSlotNodeId }
                            : {}),
                    },
                };
            });

            setNodes(updatedNodes);
            setManualSlots(updatedManualSlots);
            setSelectedNodeId(
                slotNode.data?.isSlotClone
                    ? slotNode.id
                    : newCanonicalSlotNodeId
            );
            checkSlotConnection(
                updatedNodes,
                updatedManualSlots,
                updatedSlotNodes
            );
            return true;
        },
        [
            nodes,
            slotNodes,
            manualSlots,
            setNodes,
            setManualSlots,
            setSelectedNodeId,
            checkSlotConnection,
        ]
    );

    const updateSlotInherited = useCallback(
        (slotNode, shouldInherit) => {
            if (!slotNode || slotNode.type !== "slot") return false;

            const path = getSlotPathFromNode(slotNode);
            if (!path) return false;
            const formattedPath = `/${path}`;

            const updatedNodes = nodes.map((node) => {
                const stateName =
                    node.data?.fullSkillName || node.data?.label || node.id;

                const updateSlotReference = (slot) => {
                    if (normalizeSlotPath(slot?.path) !== path) return slot;

                    return {
                        ...slot,
                        inherited: shouldInherit
                            ? {
                                  ...(slot?.inherited || {}),
                                  state:
                                      slot?.inherited?.state || stateName,
                                  xpath: formattedPath,
                              }
                            : null,
                    };
                };

                return {
                    ...node,
                    data: {
                        ...node.data,
                        inSlots: (node.data?.inSlots || []).map(
                            updateSlotReference
                        ),
                        outSlots: (node.data?.outSlots || []).map(
                            updateSlotReference
                        ),
                    },
                };
            });

            const updatedManualSlots = (manualSlots || []).map((slot) => {
                const declarationPath = normalizeSlotPath(
                    slot?.inherited?.xpath || slot?.path
                );
                if (declarationPath !== path) return slot;

                return {
                    ...slot,
                    slotKind: shouldInherit ? "inheritSlot" : "slot",
                    inherited: shouldInherit
                        ? {
                              ...(slot?.inherited || {}),
                              state:
                                  slot?.inherited?.state || slot?.state || "",
                              xpath: formattedPath,
                          }
                        : null,
                };
            });

            setNodes(updatedNodes);
            setManualSlots(updatedManualSlots);
            checkSlotConnection(updatedNodes, updatedManualSlots);
            return true;
        },
        [
            nodes,
            manualSlots,
            setNodes,
            setManualSlots,
            checkSlotConnection,
        ]
    );

    const createManualSlot = useCallback(
        (slotData) => {
            if (!slotData?.path) return null;

            const newSlot = {
                id: `manual-${crypto.randomUUID()}`,
                path: slotData.path,
                type: slotData.type,
                inherited: slotData.isInherited
                    ? { state: slotData.inheritedFrom || "" }
                    : null,
            };

            const updatedManualSlots = [...manualSlots, newSlot];
            setManualSlots(updatedManualSlots);

            let updatedNodes = nodes;
            if (slotData.linkedSkillSlot) {
                const { nodeId, access, slotIndex } =
                    slotData.linkedSkillSlot;
                const cleanPath = `/${normalizeSlotPath(slotData.path)}`;

                updatedNodes = nodes.map((node) => {
                    if (node.id !== nodeId) return node;

                    const key = access === "read" ? "inSlots" : "outSlots";
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            [key]: (node.data?.[key] || []).map(
                                (slot, index) =>
                                    index === slotIndex
                                        ? {
                                              ...slot,
                                              path: cleanPath,
                                              inherited: slotData.isInherited
                                                  ? {
                                                        state: "",
                                                        xpath: cleanPath,
                                                    }
                                                  : null,
                                          }
                                        : slot
                            ),
                        },
                    };
                });

                setNodes(updatedNodes);
            }

            checkSlotConnection(updatedNodes, updatedManualSlots);
            return newSlot;
        },
        [
            nodes,
            manualSlots,
            setNodes,
            setManualSlots,
            checkSlotConnection,
        ]
    );

    return {
        updateSlotPath,
        updateSlotInherited,
        createManualSlot,
    };
}
