import { getNodeId } from "./editorGeometry";

export const isEditorCloneNode = (node) => Boolean(
    node?.data?.cloneOfNodeId &&
    (
        node.data?.isSkillClone ||
        node.data?.isStateClone ||
        node.data?.isSlotClone
    )
);

export const isCloneableSkillNode = (node) => {
    if (!node || node.type !== "custom" || isEditorCloneNode(node)) {
        return false;
    }

    const skillName = String(node.data?.fullSkillName || node.data?.label || "")
        .split("#")[0]
        .split(".")
        .pop()
        .toLowerCase();

    return !(
        node.data?.isFinal ||
        node.data?.isBehaviorExit ||
        skillName === "end" ||
        skillName === "fatal"
    );
};

export const isCloneableEditorNode = (node) => Boolean(
    isCloneableSkillNode(node) ||
    (node &&
        ["submachine", "compound", "parallel", "slot"].includes(node.type) &&
        !isEditorCloneNode(node) &&
        !node.data?.autoParallelLaneCompound)
);

const createReferenceId = () =>
    `ref-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

export const buildEditorCloneNode = (sourceNode, position) => {
    if (!isCloneableEditorNode(sourceNode)) return null;

    if (sourceNode.type === "slot") {
        return {
            id: `slot-clone-${crypto.randomUUID()}`,
            position,
            type: "slot",
            selected: true,
            data: {
                ...(sourceNode.data || {}),
                cloneOfNodeId: sourceNode.id,
                editorInstanceId: createReferenceId(),
                isSlotClone: true,
            },
        };
    }

    const commonData = {
        label: sourceNode.data?.label || sourceNode.data?.fullSkillName || "State",
        fullSkillName:
            sourceNode.data?.fullSkillName ||
            sourceNode.data?.label ||
            "State",
        cloneOfNodeId: sourceNode.id,
        editorInstanceId: createReferenceId(),
        isInitial: false,
        isFinal: false,
        events: [],
        inSlots: [],
        outSlots: [],
        params: [],
        onEntry: [],
        onExit: [],
    };

    if (sourceNode.type === "custom") {
        return {
            id: getNodeId(),
            position,
            type: "custom",
            selected: true,
            data: {
                ...commonData,
                isSkillClone: true,
            },
        };
    }

    return {
        id: getNodeId(),
        position,
        type: "stateClone",
        selected: true,
        data: {
            ...commonData,
            isStateClone: true,
            sourceNodeType: sourceNode.type,
        },
    };
};
