import { useCallback } from "react";
import { MarkerType } from "@xyflow/react";
import { SLOT_CONNECTION_COLORS, normalizeSlotPath } from "../utils/editorGraph";
import { getAbsoluteNodePosition, getNodeSize } from "../utils/editorGeometry";

export function useSlotGraph({
                                 nodes,
                                 manualSlots,
                                 slotNodes,
                                 slotEdges,
                                 setSlotNodes,
                                 setSlotEdges,
                             }) {
    const checkSlotConnection = useCallback((customNodes = null, customManualSlots = null) => {
        const targetNodes = Array.isArray(customNodes) ? customNodes : nodes;
        const activeManualSlots =
            customManualSlots !== null ? customManualSlots : manualSlots;
        if (!targetNodes || targetNodes.length === 0) {
            setSlotNodes([]);
            setSlotEdges([]);
            return;
        }

        const usedPaths = new Map();

        // The current machine's inheritance status must come from the current
        // SCXML's own #_SLOTS declarations. Child-machine inheritSlot metadata
        // must never make a normal parent <slot> look like an <inheritSlot>.
        const currentMachineDeclarations = new Map();
        (activeManualSlots || []).forEach((slot) => {
            const cleanPath = normalizeSlotPath(
                slot?.inherited?.xpath || slot?.path
            );
            if (!cleanPath) return;

            const existing = currentMachineDeclarations.get(cleanPath) || {
                declared: false,
                inherited: null,
            };
            const isInheritedDeclaration =
                slot?.slotKind === "inheritSlot" || Boolean(slot?.inherited);

            currentMachineDeclarations.set(cleanPath, {
                declared: true,
                inherited:
                    existing.inherited ||
                    (isInheritedDeclaration
                        ? slot?.inherited || {
                        state: slot?.state || "",
                        xpath: `/${cleanPath}`,
                    }
                        : null),
            });
        });

        const registerSlotUsage = (s, options = {}) => {
            if (!s.path || !s.path.trim()) return;
            const cleanPath = normalizeSlotPath(s.path);
            const existing = usedPaths.get(cleanPath) || {};
            const requiredByChildren = [
                ...(existing.requiredByChildren || []),
            ];

            if (options.requiredByChild) {
                const requirement = options.requiredByChild;
                const duplicate = requiredByChildren.some(
                    (entry) =>
                        entry?.childNodeId === requirement.childNodeId &&
                        entry?.access === requirement.access
                );

                if (!duplicate) {
                    requiredByChildren.push(requirement);
                }
            }

            const declaration = currentMachineDeclarations.get(cleanPath);
            let currentMachineInherited =
                existing.currentMachineInherited || null;

            if (!options.requiredByChild) {
                if (declaration?.declared) {
                    // Explicit current-machine declarations are authoritative.
                    // A normal <slot> therefore stays normal even if a child
                    // machine has an <inheritSlot> with the same xpath.
                    currentMachineInherited = declaration.inherited || null;
                } else if (!currentMachineInherited && s.inherited) {
                    // Backwards compatibility for editor-created/legacy slots
                    // which may not yet have a separate declaration entry.
                    currentMachineInherited = s.inherited;
                }
            }

            const accessNodeIds = new Set(existing.accessNodeIds || []);
            if (options.accessNodeId) {
                accessNodeIds.add(options.accessNodeId);
            }

            usedPaths.set(cleanPath, {
                type: s.type || existing.type || "Unknown",
                // Keep the two inheritance directions independent:
                // - currentMachineInherited: this workflow itself declares the
                //   path as <inheritSlot> and receives it from its own parent.
                // - requiredByChildren: one or more sourced child state machines
                //   declare the same path as <inheritSlot>.
                // A path may legitimately have BOTH properties at the same time.
                currentMachineInherited,
                // Keep the legacy field for older code / persisted state.
                inherited: currentMachineInherited,
                requiredByChildren,
                accessNodeIds: [...accessNodeIds],
            });
        };

        targetNodes.forEach((node) => {
            (node.data.inSlots || []).forEach((slot) =>
                registerSlotUsage(slot, { accessNodeId: node.id })
            );
            (node.data.outSlots || []).forEach((slot) =>
                registerSlotUsage(slot, { accessNodeId: node.id })
            );

            if (node.type === "submachine") {
                (node.data.inheritedSlots || []).forEach((slot) => {
                    registerSlotUsage(
                        {
                            path: slot.path,
                            type: slot.type || "Unknown",
                        },
                        {
                            accessNodeId: node.id,
                            requiredByChild: {
                                childNodeId: node.id,
                                childLabel:
                                    node.data?.label ||
                                    node.data?.fullSkillName ||
                                    "Sub-state machine",
                                access: slot.access || "inherit",
                            },
                        }
                    );
                });
            }
        });

        (activeManualSlots || []).forEach(registerSlotUsage);

        const generatedSlotNodes = [];
        let index = 0;
        const existingSlotNodeById = new Map(
            (slotNodes || []).map((node) => [node.id, node])
        );
        const existingSlotEdgeByKey = new Map();
        (slotEdges || []).forEach((edge) => {
            if (edge.data?.edgeKind !== "slot") return;

            if (edge.data?.subMachineInherited === true) {
                existingSlotEdgeByKey.set(
                    `sub:${edge.data?.subMachineNodeId || edge.source}:` +
                    `${edge.data?.access || ""}:${Number(edge.data?.inheritIndex)}`,
                    edge
                );
                return;
            }

            existingSlotEdgeByKey.set(
                `skill:${edge.data?.skillNodeId || edge.source}:` +
                `${edge.data?.access || ""}:${Number(edge.data?.slotIndex)}`,
                edge
            );
        });

        const targetNodeById = new Map(
            targetNodes.map((node) => [node.id, node])
        );
        const slotSpawnCountByAnchor = new Map();
        const getAccessAnchoredSlotPosition = (accessNodeIds = []) => {
            const accessors = accessNodeIds
                .map((nodeId) => targetNodeById.get(nodeId))
                .filter(Boolean);
            if (accessors.length === 0) return null;

            let minLeft = Infinity;
            let maxRight = -Infinity;
            let maxBottom = -Infinity;
            accessors.forEach((node) => {
                const absolute = getAbsoluteNodePosition(node, targetNodes);
                const size = getNodeSize(node);
                minLeft = Math.min(minLeft, absolute.x);
                maxRight = Math.max(maxRight, absolute.x + size.width);
                maxBottom = Math.max(maxBottom, absolute.y + size.height);
            });

            if (
                !Number.isFinite(minLeft) ||
                !Number.isFinite(maxRight) ||
                !Number.isFinite(maxBottom)
            ) {
                return null;
            }

            const anchorKey = [...accessNodeIds].sort().join("|");
            const spawnIndex = slotSpawnCountByAnchor.get(anchorKey) || 0;
            slotSpawnCountByAnchor.set(anchorKey, spawnIndex + 1);
            const estimatedSlotWidth = 190;
            const groupCenterX = (minLeft + maxRight) / 2;

            return {
                x:
                    groupCenterX - estimatedSlotWidth / 2 +
                    (spawnIndex % 3) * 205,
                y: maxBottom + 320 + Math.floor(spawnIndex / 3) * 125,
            };
        };

        // New slot nodes should appear underneath the skills that access them.
        // Keep positions of slots the user has already moved. Slots without an
        // accessor (for example a manually declared unused slot) fall back to
        // the workflow-wide row below.
        // user has already moved, but derive the initial row for new slots
        // from the current workflow bounds.
        const slotLayoutNodes = targetNodes.filter(
            (node) => node.type !== "parallelLane"
        );
        const slotLayoutBounds = slotLayoutNodes.reduce(
            (bounds, node) => {
                const absolutePosition = getAbsoluteNodePosition(
                    node,
                    targetNodes
                );
                const size = getNodeSize(node);

                return {
                    minX: Math.min(bounds.minX, absolutePosition.x),
                    maxBottom: Math.max(
                        bounds.maxBottom,
                        absolutePosition.y + size.height
                    ),
                };
            },
            { minX: Infinity, maxBottom: -Infinity }
        );
        const slotSpawnX = Number.isFinite(slotLayoutBounds.minX)
            ? slotLayoutBounds.minX
            : 380;
        const slotSpawnY = Number.isFinite(slotLayoutBounds.maxBottom)
            ? slotLayoutBounds.maxBottom + 340
            : 120;

        usedPaths.forEach(
            ({
                 type,
                 inherited,
                 currentMachineInherited,
                 requiredByChildren = [],
                 accessNodeIds = [],
             }, path) => {
                const slotNodeId = `slot-${path}`;
                const existingSlotNode = existingSlotNodeById.get(slotNodeId);

                generatedSlotNodes.push({
                    id: slotNodeId,
                    position:
                        existingSlotNode?.position ||
                        getAccessAnchoredSlotPosition(accessNodeIds) || {
                            x: slotSpawnX + (index % 3) * 220,
                            y: slotSpawnY + Math.floor(index / 3) * 140,
                        },
                    type: "slot",
                    data: {
                        path: `/${path}`,
                        label: `/${path}`,
                        slotType: type,
                        currentMachineInherited: Boolean(
                            currentMachineInherited || inherited
                        ),
                        inherited: Boolean(currentMachineInherited || inherited),
                        slotKind:
                            currentMachineInherited || inherited
                                ? "inheritSlot"
                                : undefined,
                        inheritedFrom:
                            (currentMachineInherited || inherited)?.state || "",
                        requiredByChild: requiredByChildren.length > 0,
                        requiredByChildren,
                    },
                });

                index++;
            }
        );

        // Reuse unchanged slot-node objects instead of replacing the complete
        // slot graph every time one skill/parameter changes. React Flow can then
        // rerender only the paths whose declaration/type actually changed.
        setSlotNodes((currentSlotNodes) => {
            const currentById = new Map(
                currentSlotNodes.map((node) => [node.id, node])
            );
            let changed = currentSlotNodes.length !== generatedSlotNodes.length;

            const next = generatedSlotNodes.map((generated) => {
                const current = currentById.get(generated.id);
                if (!current) {
                    changed = true;
                    return generated;
                }

                const currentRequirements = current.data?.requiredByChildren || [];
                const nextRequirements = generated.data?.requiredByChildren || [];
                const requirementsEqual =
                    currentRequirements.length === nextRequirements.length &&
                    currentRequirements.every((entry, index) => {
                        const nextEntry = nextRequirements[index];
                        return (
                            entry?.childNodeId === nextEntry?.childNodeId &&
                            entry?.childLabel === nextEntry?.childLabel &&
                            entry?.access === nextEntry?.access
                        );
                    });

                const equivalent =
                    current.type === generated.type &&
                    current.position?.x === generated.position?.x &&
                    current.position?.y === generated.position?.y &&
                    current.data?.path === generated.data?.path &&
                    current.data?.label === generated.data?.label &&
                    current.data?.slotType === generated.data?.slotType &&
                    Boolean(current.data?.currentMachineInherited) ===
                    Boolean(generated.data?.currentMachineInherited) &&
                    Boolean(current.data?.inherited) ===
                    Boolean(generated.data?.inherited) &&
                    current.data?.slotKind === generated.data?.slotKind &&
                    current.data?.inheritedFrom === generated.data?.inheritedFrom &&
                    Boolean(current.data?.requiredByChild) ===
                    Boolean(generated.data?.requiredByChild) &&
                    requirementsEqual;

                if (equivalent) return current;
                changed = true;
                return generated;
            });

            return changed ? next : currentSlotNodes;
        });

        const newSlotEdges = [];
        targetNodes.forEach((node) => {
            (node.data.inSlots || []).forEach((inslot, inIndex) => {
                if (inslot.path && inslot.path.trim() !== "") {
                    const cleanPath = inslot.path.trim().replace(/^\//, "");
                    const slotNodeId = `slot-${cleanPath}`;
                    const existingReadEdge = existingSlotEdgeByKey.get(
                        `skill:${node.id}:read:${inIndex}`
                    );

                    newSlotEdges.push({
                        id:
                            existingReadEdge?.id ||
                            `edge-read-${slotNodeId}-${node.id}-${inIndex}`,
                        source: node.id,
                        target: slotNodeId,
                        sourceHandle: `slot-skill-read-${inIndex}`,
                        targetHandle: "slot-node-read",
                        type: "smartTransition",
                        selected: Boolean(existingReadEdge?.selected),
                        style: {
                            stroke: SLOT_CONNECTION_COLORS.read,
                            strokeWidth: 1.7,
                            strokeDasharray: "5 5",
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: SLOT_CONNECTION_COLORS.read,
                        },
                        data: {
                            edgeKind: "slot",
                            access: "read",
                            slotIndex: inIndex,
                            path: cleanPath,
                            skillNodeId: node.id,
                            slotNodeId,
                            controlPoints:
                                existingReadEdge?.data?.controlPoints || [],
                        },
                    });
                }
            });

            (node.data.outSlots || []).forEach((outslot, outIndex) => {
                if (outslot.path && outslot.path.trim() !== "") {
                    const cleanPath = outslot.path.trim().replace(/^\//, "");
                    const slotNodeId = `slot-${cleanPath}`;
                    const existingWriteEdge = existingSlotEdgeByKey.get(
                        `skill:${node.id}:write:${outIndex}`
                    );

                    newSlotEdges.push({
                        id:
                            existingWriteEdge?.id ||
                            `edge-write-${node.id}-${slotNodeId}-${outIndex}`,
                        source: node.id,
                        target: slotNodeId,
                        sourceHandle: `slot-skill-write-${outIndex}`,
                        targetHandle: "slot-node-write",
                        type: "smartTransition",
                        selected: Boolean(existingWriteEdge?.selected),
                        style: {
                            stroke: SLOT_CONNECTION_COLORS.write,
                            strokeWidth: 1.7,
                            strokeDasharray: "5 5",
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: SLOT_CONNECTION_COLORS.write,
                        },
                        data: {
                            edgeKind: "slot",
                            access: "write",
                            slotIndex: outIndex,
                            path: cleanPath,
                            skillNodeId: node.id,
                            slotNodeId,
                            controlPoints:
                                existingWriteEdge?.data?.controlPoints || [],
                        },
                    });
                }
            });

            if (node.type === "submachine") {
                (node.data.inheritedSlots || []).forEach((slot, inheritIndex) => {
                    if (
                        !slot?.access ||
                        !slot?.path ||
                        !String(slot.path).trim()
                    ) {
                        return;
                    }

                    const access = slot.access;
                    const cleanPath = normalizeSlotPath(slot.path);
                    const slotNodeId = `slot-${cleanPath}`;
                    const handleId =
                        `slot-submachine-${access}-${inheritIndex}`;
                    const existingInheritedEdge = existingSlotEdgeByKey.get(
                        `sub:${node.id}:${access}:${inheritIndex}`
                    );

                    newSlotEdges.push({
                        id:
                            existingInheritedEdge?.id ||
                            `edge-inherited-${access}-${node.id}-${inheritIndex}-${slotNodeId}`,
                        source: node.id,
                        target: slotNodeId,
                        sourceHandle: handleId,
                        targetHandle:
                            access === "read"
                                ? "slot-node-read"
                                : "slot-node-write",
                        type: "smartTransition",
                        selected: Boolean(existingInheritedEdge?.selected),
                        style: {
                            stroke: SLOT_CONNECTION_COLORS[access],
                            strokeWidth: 1.7,
                            strokeDasharray: "5 5",
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: SLOT_CONNECTION_COLORS[access],
                        },
                        data: {
                            edgeKind: "slot",
                            access,
                            path: cleanPath,
                            slotNodeId,
                            subMachineInherited: true,
                            subMachineNodeId: node.id,
                            inheritIndex,
                            controlPoints:
                                existingInheritedEdge?.data?.controlPoints || [],
                        },
                    });
                });
            }
        });

        // Same principle for slot edges: preserve object identity for every
        // unaffected skill-slot connection and completely skip the state update
        // when the rebuilt graph is equivalent. This makes parameter-driven
        // slot exposure/removal much cheaper on larger workflows.
        setSlotEdges((currentSlotEdges) => {
            const currentById = new Map(
                currentSlotEdges.map((edge) => [edge.id, edge])
            );
            let changed = currentSlotEdges.length !== newSlotEdges.length;

            const next = newSlotEdges.map((generated) => {
                const current = currentById.get(generated.id);
                if (!current) {
                    changed = true;
                    return generated;
                }

                const currentPoints = current.data?.controlPoints || [];
                const nextPoints = generated.data?.controlPoints || [];
                const controlPointsEqual =
                    currentPoints.length === nextPoints.length &&
                    currentPoints.every((point, index) => {
                        const nextPoint = nextPoints[index];
                        return (
                            point?.x === nextPoint?.x &&
                            point?.y === nextPoint?.y
                        );
                    });

                const equivalent =
                    current.source === generated.source &&
                    current.target === generated.target &&
                    current.sourceHandle === generated.sourceHandle &&
                    current.targetHandle === generated.targetHandle &&
                    current.type === generated.type &&
                    Boolean(current.selected) === Boolean(generated.selected) &&
                    current.data?.edgeKind === generated.data?.edgeKind &&
                    current.data?.access === generated.data?.access &&
                    current.data?.slotIndex === generated.data?.slotIndex &&
                    current.data?.path === generated.data?.path &&
                    current.data?.skillNodeId === generated.data?.skillNodeId &&
                    current.data?.slotNodeId === generated.data?.slotNodeId &&
                    Boolean(current.data?.subMachineInherited) ===
                    Boolean(generated.data?.subMachineInherited) &&
                    current.data?.subMachineNodeId ===
                    generated.data?.subMachineNodeId &&
                    current.data?.inheritIndex === generated.data?.inheritIndex &&
                    controlPointsEqual;

                if (equivalent) return current;
                changed = true;
                return generated;
            });

            return changed ? next : currentSlotEdges;
        });
    }, [
        nodes,
        manualSlots,
        slotNodes,
        slotEdges,
        setSlotNodes,
        setSlotEdges,
    ]);

    return { checkSlotConnection };
}
