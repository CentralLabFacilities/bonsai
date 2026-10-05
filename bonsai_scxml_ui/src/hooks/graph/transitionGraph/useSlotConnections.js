import { useCallback, useState } from "react";
import { MarkerType } from "@xyflow/react";
import {
    SLOT_CONNECTION_COLORS,
    getSlotPathFromNode,
    normalizeSlotType,
    parseSlotConnectionHandle,
} from "../../../utils/editorGraph";
import { slotDebug, summarizeSkillSlots } from "../../../utils/slotDebug";

export const useSlotConnections = ({
    nodes,
    slotNodes,
    slotEdges,
    setNodes,
    setSlotEdges,
    setSelectedNodeId,
    checkSlotConnection,
    syncSlotsAfterCommit,
    onSkillSlotConnectionApplied,
}) => {
    const [slotConnectionDrag, setSlotConnectionDrag] = useState(null);

    const validateSlotConnection = useCallback(
        (connection) => {
            const sourceSlotHandle = parseSlotConnectionHandle(
                connection.sourceHandle
            );
            const targetSlotHandle = parseSlotConnectionHandle(
                connection.targetHandle
            );

            if (!sourceSlotHandle && !targetSlotHandle) {
                return null;
            }

            if (
                !sourceSlotHandle ||
                !targetSlotHandle ||
                sourceSlotHandle.access !== targetSlotHandle.access ||
                sourceSlotHandle.origin === targetSlotHandle.origin
            ) {
                return false;
            }

            const sourceIsSkill = sourceSlotHandle.origin === "skill";
            const skillHandle = sourceIsSkill
                ? sourceSlotHandle
                : targetSlotHandle;
            const skillNodeId = sourceIsSkill
                ? connection.source
                : connection.target;
            const slotNodeId = sourceIsSkill
                ? connection.target
                : connection.source;

            const skillNode = nodes.find((node) => node.id === skillNodeId);
            const slotNode = slotNodes.find((node) => node.id === slotNodeId);

            if (!skillNode || !slotNode) {
                return false;
            }

            const skillSlot =
                skillHandle.access === "read"
                    ? skillNode.data?.inSlots?.[skillHandle.slotIndex]
                    : skillNode.data?.outSlots?.[skillHandle.slotIndex];

            const skillType = normalizeSlotType(skillSlot?.type);
            const slotType = normalizeSlotType(slotNode.data?.slotType);

            return Boolean(skillType && slotType && skillType === slotType);
        },
        [nodes, slotNodes]
    );

    const handleConnectStart = useCallback(
        (_, params) => {
            const slotHandle = parseSlotConnectionHandle(params?.handleId);

            if (!slotHandle) {
                setSlotConnectionDrag(null);
                return;
            }

            let slotType;

            if (slotHandle.origin === "skill") {
                const skillNode = nodes.find((node) => node.id === params.nodeId);
                const skillSlot =
                    slotHandle.access === "read"
                        ? skillNode?.data?.inSlots?.[slotHandle.slotIndex]
                        : skillNode?.data?.outSlots?.[slotHandle.slotIndex];

                slotType = normalizeSlotType(skillSlot?.type);
            } else {
                const slotNode = slotNodes.find((node) => node.id === params.nodeId);
                slotType = normalizeSlotType(slotNode?.data?.slotType);
            }

            setSlotConnectionDrag({
                active: true,
                nodeId: params.nodeId,
                handleId: params.handleId,
                origin: slotHandle.origin,
                access: slotHandle.access,
                slotType,
            });
        },
        [nodes, slotNodes]
    );

    const handleConnectEnd = useCallback(() => {
        setSlotConnectionDrag(null);
    }, []);

    const applySkillSlotConnection = useCallback(
        ({
            skillNodeId,
            slotNodeId,
            access,
            slotIndex,
            preferredEdgeId = null,
        }) => {
            if (
                !skillNodeId ||
                !slotNodeId ||
                !["read", "write"].includes(access) ||
                !Number.isInteger(Number(slotIndex))
            ) {
                slotDebug("slot-edge: connection rejected invalid arguments", {
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex,
                });
                return false;
            }

            const normalizedSlotIndex = Number(slotIndex);
            const skillNode = nodes.find((node) => node.id === skillNodeId);
            const slotNode = slotNodes.find((node) => node.id === slotNodeId);
            const path = getSlotPathFromNode(slotNode);

            if (!skillNode || !slotNode || !path) {
                slotDebug("slot-edge: connection rejected missing node/path", {
                    skillNodeId,
                    slotNodeId,
                    hasSkillNode: Boolean(skillNode),
                    hasSlotNode: Boolean(slotNode),
                    resolvedPath: path || "",
                });
                return false;
            }

            const skillSlot =
                access === "read"
                    ? skillNode.data?.inSlots?.[normalizedSlotIndex]
                    : skillNode.data?.outSlots?.[normalizedSlotIndex];
            if (!skillSlot) {
                slotDebug("slot-edge: connection rejected missing skill slot", {
                    skillNodeId,
                    access,
                    slotIndex: normalizedSlotIndex,
                    skillSlots: summarizeSkillSlots(nodes, skillNodeId),
                });
                return false;
            }

            const skillType = normalizeSlotType(skillSlot.type);
            const slotType = normalizeSlotType(slotNode.data?.slotType);
            if (!skillType || !slotType || skillType !== slotType) {
                slotDebug("slot-edge: connection rejected type mismatch", {
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex: normalizedSlotIndex,
                    skillType,
                    slotType,
                });
                return false;
            }

            const normalizedPath = `/${path}`;
            slotDebug("slot-edge: connection accepted", {
                skillNodeId,
                slotNodeId,
                access,
                slotIndex: normalizedSlotIndex,
                rawPath: path,
                normalizedPath,
                previousSkillSlots: summarizeSkillSlots(nodes, skillNodeId),
            });

            const nextNodes = nodes.map((node) => {
                if (node.id !== skillNodeId) return node;

                const slotKey = access === "read" ? "inSlots" : "outSlots";
                return {
                    ...node,
                    data: {
                        ...node.data,
                        [slotKey]: (node.data?.[slotKey] || []).map(
                            (slot, index) =>
                                index === normalizedSlotIndex
                                    ? {
                                          ...slot,
                                          path: normalizedPath,
                                          inherited: slotNode.data?.inherited
                                              ? {
                                                    state:
                                                        slotNode.data
                                                            ?.inheritedFrom ||
                                                        "",
                                                    xpath: normalizedPath,
                                                }
                                              : null,
                                      }
                                    : slot
                        ),
                    },
                };
            });

            slotDebug("slot-edge: local skill slot path updated", {
                skillNodeId,
                access,
                slotIndex: normalizedSlotIndex,
                normalizedPath,
                nextSkillSlots: summarizeSkillSlots(nextNodes, skillNodeId),
            });

            setNodes(nextNodes);

            // Keep the connected skill as the active detail-panel context.
            // The explicit refresh below runs after React has committed the
            // updated node data, so the controlled slot-path field cannot stay
            // on the pre-connection value.
            setSelectedNodeId?.(skillNodeId);

            const existingEdge =
                slotEdges.find(
                    (edge) => preferredEdgeId && edge.id === preferredEdgeId
                ) ||
                slotEdges.find(
                    (edge) =>
                        edge.data?.edgeKind === "slot" &&
                        edge.data?.subMachineInherited !== true &&
                        edge.data?.access === access &&
                        (edge.data?.skillNodeId || edge.source) === skillNodeId &&
                        Number(edge.data?.slotIndex) === normalizedSlotIndex
                );

            const remainingEdges = slotEdges.filter((edge) => {
                if (edge.data?.edgeKind !== "slot") return true;
                if (edge.data?.subMachineInherited === true) return true;
                if (edge.data?.access !== access) return true;

                const storedSkillNodeId = edge.data?.skillNodeId || edge.source;
                return !(
                    storedSkillNodeId === skillNodeId &&
                    Number(edge.data?.slotIndex) === normalizedSlotIndex
                );
            });

            const skillHandleId =
                access === "read"
                    ? `slot-skill-read-${normalizedSlotIndex}`
                    : `slot-skill-write-${normalizedSlotIndex}`;
            const slotHandleId =
                access === "read" ? "slot-node-read" : "slot-node-write";

            const nextSlotEdges = [
                ...remainingEdges,
                {
                    id:
                        existingEdge?.id ||
                        `edge-slot-${access}-${skillNodeId}-${normalizedSlotIndex}-${crypto.randomUUID()}`,
                    source: skillNodeId,
                    target: slotNodeId,
                    sourceHandle: skillHandleId,
                    targetHandle: slotHandleId,
                    type: "smartTransition",
                    selected: Boolean(existingEdge?.selected),
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
                        ...(existingEdge?.data || {}),
                        edgeKind: "slot",
                        access,
                        slotIndex: normalizedSlotIndex,
                        path,
                        skillNodeId,
                        slotNodeId,
                        canonicalSlotNodeId:
                            slotNode.data?.isSlotClone &&
                            slotNode.data?.cloneOfNodeId
                                ? slotNode.data.cloneOfNodeId
                                : slotNodeId,
                        // A manual route to the previous slot target is no
                        // longer meaningful after reconnecting the edge.
                        controlPoints:
                            existingEdge?.target === slotNodeId
                                ? existingEdge?.data?.controlPoints || []
                                : [],
                    },
                },
            ];

            // Commit the visual slot target and use that same edge snapshot when
            // rebuilding the generated slot graph. Otherwise the rebuild sees
            // the pre-reconnect edge from the hook closure and resolves the
            // visual alias back to the previous slot node.
            setSlotEdges(nextSlotEdges);

            requestAnimationFrame(() => {
                checkSlotConnection?.(nextNodes, null, slotNodes, nextSlotEdges);
                onSkillSlotConnectionApplied?.(skillNodeId);
            });
            // Persist exactly the slot-path state produced by this connection.
            // Do not wait for editorStateRef to catch up: manual handle dragging
            // can otherwise send the previous (empty) path to Rust, which leaves
            // the stale "slot path missing" problem in the Problems panel.
            slotDebug("slot-edge: queue Rust slot snapshot", {
                skillNodeId,
                access,
                slotIndex: normalizedSlotIndex,
                normalizedPath,
            });
            void syncSlotsAfterCommit?.(
                { nodes: nextNodes },
                {
                    source: "manual-slot-edge",
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex: normalizedSlotIndex,
                    normalizedPath,
                }
            );
            return true;
        },
        [
            nodes,
            slotNodes,
            slotEdges,
            setNodes,
            setSlotEdges,
            setSelectedNodeId,
            checkSlotConnection,
            syncSlotsAfterCommit,
            onSkillSlotConnectionApplied,
        ]
    );

    const handleFlowSlotConnect = useCallback(
        (params) => {
            const sourceSlotHandle = parseSlotConnectionHandle(
                params.sourceHandle
            );
            const targetSlotHandle = parseSlotConnectionHandle(
                params.targetHandle
            );

            if (!sourceSlotHandle && !targetSlotHandle) {
                return false;
            }

            slotDebug("slot-edge: React Flow onConnect", {
                source: params.source,
                target: params.target,
                sourceHandle: params.sourceHandle,
                targetHandle: params.targetHandle,
                sourceSlotHandle,
                targetSlotHandle,
            });

            if (
                !sourceSlotHandle ||
                !targetSlotHandle ||
                sourceSlotHandle.access !== targetSlotHandle.access ||
                sourceSlotHandle.origin === targetSlotHandle.origin
            ) {
                slotDebug("slot-edge: onConnect rejected handle pairing", {
                    sourceSlotHandle,
                    targetSlotHandle,
                });
                return true;
            }

            const sourceIsSkill = sourceSlotHandle.origin === "skill";
            const skillHandle = sourceIsSkill
                ? sourceSlotHandle
                : targetSlotHandle;
            const skillNodeId = sourceIsSkill ? params.source : params.target;
            const slotNodeId = sourceIsSkill ? params.target : params.source;

            applySkillSlotConnection({
                skillNodeId,
                slotNodeId,
                access: skillHandle.access,
                slotIndex: skillHandle.slotIndex,
            });

            return true;
        },
        [applySkillSlotConnection]
    );

    const handleSlotReconnect = useCallback(
        (oldEdge, connection) => {
            if (oldEdge?.data?.edgeKind !== "slot") {
                return false;
            }

            const access = oldEdge.data?.access === "write" ? "write" : "read";
            const slotIndex = Number(oldEdge.data?.slotIndex);
            const skillNodeId =
                oldEdge.data?.skillNodeId ||
                oldEdge.data?.collapsedSlotOriginalSource ||
                oldEdge.source;

            // A slot reconnect only changes the slot target. Keep the
            // semantic skill/access/index from the original edge and resolve
            // the new endpoint by node identity instead of relying on React
            // Flow's loose-mode handle orientation.
            const sourceHandle = parseSlotConnectionHandle(
                connection?.sourceHandle
            );
            const targetHandle = parseSlotConnectionHandle(
                connection?.targetHandle
            );
            const slotNodeIdSet = new Set(slotNodes.map((node) => node.id));

            const endpointCandidates = [
                { nodeId: connection?.target, handle: targetHandle },
                { nodeId: connection?.source, handle: sourceHandle },
            ];

            const slotEndpoint = endpointCandidates.find(
                ({ nodeId, handle }) =>
                    nodeId &&
                    slotNodeIdSet.has(nodeId) &&
                    (!handle || handle.origin === "slot")
            );
            const skillEndpoint = endpointCandidates.find(
                ({ nodeId, handle }) =>
                    nodeId === skillNodeId || handle?.origin === "skill"
            );

            const slotNodeId = slotEndpoint?.nodeId || null;
            const slotHandle = slotEndpoint?.handle || null;
            const skillHandle = skillEndpoint?.handle || null;

            if (!slotNodeId) {
                slotDebug("slot-edge: reconnect rejected missing slot endpoint", {
                    edgeId: oldEdge.id,
                    skillNodeId,
                    access,
                    slotIndex,
                    connection,
                });
                return true;
            }

            if (
                (slotHandle &&
                    slotHandle.origin === "slot" &&
                    slotHandle.access !== access) ||
                (skillHandle &&
                    skillHandle.origin === "skill" &&
                    (skillHandle.access !== access ||
                        Number(skillHandle.slotIndex) !== slotIndex))
            ) {
                slotDebug("slot-edge: reconnect rejected handle mismatch", {
                    edgeId: oldEdge.id,
                    skillNodeId,
                    slotNodeId,
                    access,
                    slotIndex,
                    sourceHandle: connection?.sourceHandle || null,
                    targetHandle: connection?.targetHandle || null,
                });
                return true;
            }

            slotDebug("slot-edge: reconnect accepted new slot target", {
                edgeId: oldEdge.id,
                skillNodeId,
                previousSlotNodeId: oldEdge.data?.slotNodeId || oldEdge.target,
                slotNodeId,
                access,
                slotIndex,
            });

            applySkillSlotConnection({
                skillNodeId,
                slotNodeId,
                access,
                slotIndex,
                preferredEdgeId: oldEdge.id,
            });
            return true;
        },
        [slotNodes, applySkillSlotConnection]
    );

    return {
        slotConnectionDrag,
        setSlotConnectionDrag,
        validateSlotConnection,
        handleConnectStart,
        handleConnectEnd,
        applySkillSlotConnection,
        handleFlowSlotConnect,
        handleSlotReconnect,
    };
};
