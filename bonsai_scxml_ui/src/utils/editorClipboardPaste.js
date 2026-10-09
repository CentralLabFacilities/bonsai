import { normalizeSlotPath } from "./editorGraph";
import {
    getNodeId,
    getNodeSize,
    orderNodesParentsFirst,
} from "./editorGeometry";
import {
    ensureSharedEditorInstanceIds,
    getSharedScxmlStateKey,
    normalizeSharedScxmlStateIdentity,
} from "./editorScxml";
import { createEditorReferenceId } from "./editorClones";
import { cloneGraphValue } from "./editorClipboard";

export const getClipboardPasteTranslation = (clipboard, targetPosition) => {
    const copiedNodes = clipboard?.nodes || [];
    const copiedNodeIds = new Set(copiedNodes.map((node) => node.id));
    const rootNodes = copiedNodes.filter(
        (node) => !node.parentId || !copiedNodeIds.has(node.parentId)
    );
    const layoutNodes = [...rootNodes, ...(clipboard?.slotNodes || [])];

    if (layoutNodes.length === 0) {
        return { x: 0, y: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    layoutNodes.forEach((node) => {
        const x = Number(node.position?.x || 0);
        const y = Number(node.position?.y || 0);
        const { width, height } = getNodeSize(node);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
    });

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    return {
        x: Number(targetPosition?.x || 0) - centerX,
        y: Number(targetPosition?.y || 0) - centerY,
    };
};

export const buildPastedSlotAliases = ({
    copiedSlotNodes,
    translation,
    slotNodes,
}) =>
    (copiedSlotNodes || [])
        .map((copiedSlotNode) => {
            const copiedCanonicalId =
                copiedSlotNode.data?.clipboardCanonicalSlotNodeId ||
                copiedSlotNode.data?.cloneOfNodeId ||
                copiedSlotNode.id;
            const copiedPath = normalizeSlotPath(
                copiedSlotNode.data?.clipboardCanonicalSlotPath ||
                    copiedSlotNode.data?.path ||
                    ""
            );

            const canonicalSlotNode =
                slotNodes.find(
                    (node) =>
                        !node.data?.isSlotClone && node.id === copiedCanonicalId
                ) ||
                slotNodes.find(
                    (node) =>
                        !node.data?.isSlotClone &&
                        copiedPath &&
                        normalizeSlotPath(node.data?.path || "") === copiedPath
                );

            if (!canonicalSlotNode) return null;

            return {
                id: `slot-clone-${crypto.randomUUID()}`,
                position: {
                    x:
                        Number(copiedSlotNode.position?.x || 0) +
                        Number(translation?.x || 0),
                    y:
                        Number(copiedSlotNode.position?.y || 0) +
                        Number(translation?.y || 0),
                },
                type: "slot",
                selected: true,
                data: {
                    ...(canonicalSlotNode.data || {}),
                    cloneOfNodeId: canonicalSlotNode.id,
                    editorInstanceId: createEditorReferenceId(),
                    isSlotClone: true,
                },
            };
        })
        .filter(Boolean);

export const buildCopiedGraphPaste = ({
    clipboard,
    nodes,
    edges,
    slotNodes,
    pasteTranslation,
}) => {
    const copiedSlotNodes = clipboard?.slotNodes || [];
    const idMap = new Map();
    clipboard.nodes.forEach((node) => {
        idMap.set(node.id, getNodeId());
    });

    const usedSharedInstanceIds = new Map();
    ensureSharedEditorInstanceIds(nodes).forEach((node) => {
        const sharedKey = getSharedScxmlStateKey(node);
        if (!sharedKey) return;
        if (!usedSharedInstanceIds.has(sharedKey)) {
            usedSharedInstanceIds.set(sharedKey, new Set());
        }
        const instanceId = String(node.data?.editorInstanceId || "").trim();
        if (instanceId) usedSharedInstanceIds.get(sharedKey).add(instanceId);
    });

    const allocateSharedEditorInstanceId = (data) => {
        const candidateNode = normalizeSharedScxmlStateIdentity({
            type: "custom",
            data,
        });
        const sharedKey = getSharedScxmlStateKey(candidateNode);
        if (!sharedKey) return undefined;

        if (!usedSharedInstanceIds.has(sharedKey)) {
            usedSharedInstanceIds.set(sharedKey, new Set());
        }

        const used = usedSharedInstanceIds.get(sharedKey);
        let index = 1;
        while (used.has(String(index))) index += 1;
        const instanceId = String(index);
        used.add(instanceId);
        return instanceId;
    };

    const refreshSharedEditorIdentity = (node, data) => {
        if (node.type !== "custom") return data;
        const candidateNode = normalizeSharedScxmlStateIdentity({
            type: "custom",
            data,
        });
        if (!getSharedScxmlStateKey(candidateNode)) return data;
        return {
            ...data,
            editorInstanceId: allocateSharedEditorInstanceId(data),
        };
    };

    const remapEvent = (eventData) => {
        const eventCopy = cloneGraphValue(eventData);

        if (eventCopy.sourceNodeId && idMap.has(eventCopy.sourceNodeId)) {
            eventCopy.sourceNodeId = idMap.get(eventCopy.sourceNodeId);
        }

        if (Array.isArray(eventCopy.sourceNodeIds)) {
            eventCopy.sourceNodeIds = eventCopy.sourceNodeIds.map(
                (sourceNodeId) =>
                    idMap.has(sourceNodeId)
                        ? idMap.get(sourceNodeId)
                        : sourceNodeId
            );
        }

        if (!eventCopy.target) return eventCopy;

        if (idMap.has(eventCopy.target)) {
            eventCopy.target = idMap.get(eventCopy.target);
            return eventCopy;
        }

        return {
            ...eventCopy,
            target: null,
            cond: "",
            assignments: [],
            assignLocation: "",
            assignExpr: "",
            selectedPackage: "",
            selectedSkill: "",
        };
    };

    const pastedNodes = clipboard.nodes.map((clipboardNode) => {
        const node = cloneGraphValue(clipboardNode);
        let data = cloneGraphValue(node.data || {});

        if (Array.isArray(data.events)) {
            data.events = data.events.map(remapEvent);
        }

        if (
            (data?.isSkillClone || data?.isStateClone) &&
            data?.cloneOfNodeId &&
            idMap.has(data.cloneOfNodeId)
        ) {
            data.cloneOfNodeId = idMap.get(data.cloneOfNodeId);
        }

        if (data?.isSkillClone || data?.isStateClone) {
            data.editorInstanceId = createEditorReferenceId();
        }

        // Shared End/Fatal/forwarding visual instances need a fresh editor
        // instance id, but semantic naming/initial-state decisions now belong
        // to the Rust paste command.
        data = refreshSharedEditorIdentity(node, data);

        return {
            ...node,
            id: idMap.get(node.id),
            parentId:
                node.parentId && idMap.has(node.parentId)
                    ? idMap.get(node.parentId)
                    : undefined,
            extent:
                node.parentId && idMap.has(node.parentId)
                    ? node.extent
                    : undefined,
            position: {
                x:
                    Number(node.position?.x || 0) +
                    (node.parentId && idMap.has(node.parentId)
                        ? 0
                        : pasteTranslation.x),
                y:
                    Number(node.position?.y || 0) +
                    (node.parentId && idMap.has(node.parentId)
                        ? 0
                        : pasteTranslation.y),
            },
            selected: !(node.parentId && idMap.has(node.parentId)),
            data,
        };
    });

    const remapEdgeDataIds = (edgeData) => {
        const nextData = cloneGraphValue(edgeData || {});

        [
            "boundaryOriginalSource",
            "boundaryOriginalTarget",
            "parallelOriginalSource",
            "parallelOriginalTarget",
            "compoundOriginalSource",
            "compoundOriginalTarget",
        ].forEach((keyName) => {
            if (nextData[keyName] && idMap.has(nextData[keyName])) {
                nextData[keyName] = idMap.get(nextData[keyName]);
            }
        });

        if (Array.isArray(nextData.boundaryOriginalSources)) {
            nextData.boundaryOriginalSources =
                nextData.boundaryOriginalSources.map((source) => ({
                    ...source,
                    sourceId:
                        source?.sourceId && idMap.has(source.sourceId)
                            ? idMap.get(source.sourceId)
                            : source?.sourceId,
                }));
        }

        return nextData;
    };

    const pastedEdges = clipboard.edges.map((clipboardEdge) => {
        const edge = cloneGraphValue(clipboardEdge);

        return {
            ...edge,
            id: `edge-copy-${crypto.randomUUID()}`,
            source: idMap.get(edge.source),
            target: idMap.get(edge.target),
            selected: false,
            data: remapEdgeDataIds(edge.data),
        };
    });

    const pastedIds = new Set(pastedNodes.map((node) => node.id));
    const nextNodes = orderNodesParentsFirst([
        ...nodes.map((node) => ({ ...node, selected: false })),
        ...pastedNodes,
    ]);
    const pastedSlotAliases = buildPastedSlotAliases({
        copiedSlotNodes,
        translation: pasteTranslation,
        slotNodes,
    });
    const nextSlotNodes = [
        ...slotNodes.map((node) => ({ ...node, selected: false })),
        ...pastedSlotAliases,
    ];
    const nextEdges = [
        ...edges.map((edge) => ({ ...edge, selected: false })),
        ...pastedEdges,
    ];
    const firstPastedNode =
        pastedNodes.find((node) => !node.parentId) ||
        pastedNodes[0] ||
        pastedSlotAliases[0] ||
        null;

    const semanticClipboardNodes = clipboard.nodes.filter(
        (node) =>
            node.type !== "parallelLane" &&
            !node.data?.isSkillClone &&
            !node.data?.isStateClone
    );
    const stateMappings = semanticClipboardNodes.map((node) => ({
        sourceId: String(node.id || ""),
        targetId: String(idMap.get(node.id) || ""),
    }));
    const pastedNodeById = new Map(
        pastedNodes.map((node) => [String(node.id || ""), node])
    );
    const transitionMappings = clipboard.edges.map((edge, index) => {
        const targetNode = pastedNodeById.get(
            String(idMap.get(edge.target) || "")
        );
        return {
            sourceId: String(edge.id || ""),
            targetId: String(pastedEdges[index]?.id || ""),
            targetInstanceId: targetNode?.data?.editorInstanceId
                ? String(targetNode.data.editorInstanceId)
                : null,
        };
    });
    const semanticTargetIds = new Set(
        stateMappings.map((mapping) => mapping.targetId)
    );
    const statePositions = pastedNodes
        .filter((node) => semanticTargetIds.has(String(node.id || "")))
        .map((node) => ({
            stateId: String(node.id || ""),
            x: Number(node.position?.x || 0),
            y: Number(node.position?.y || 0),
        }));

    return {
        pastedNodes,
        pastedEdges,
        pastedIds,
        pastedSlotAliases,
        nextNodes,
        nextSlotNodes,
        nextEdges,
        firstPastedNode,
        pasteCommand: {
            stateMappings,
            transitionMappings,
            positions: statePositions,
        },
    };
};
