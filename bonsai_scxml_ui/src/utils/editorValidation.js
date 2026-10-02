import { normalizeSlotPath } from "./editorGraph";

const mapVariable = (entry) => ({
    id: String(entry?.id || ""),
    typeName: String(entry?.valueType || entry?.type || ""),
    expression: String(entry?.expr ?? entry?.value ?? ""),
});

const mapAssignment = (assignment) => ({
    location: String(assignment?.location || ""),
    expression: String(assignment?.expr ?? assignment?.expression ?? ""),
});

const mapSlot = (slot) => ({
    key: String(slot?.key || ""),
    typeName: String(slot?.type || ""),
    path: String(slot?.path || ""),
});

const isReferenceNode = (node) =>
    Boolean(
        node?.data?.cloneOfNodeId &&
            (node.data?.isSkillClone ||
                node.data?.isStateClone ||
                node.data?.isSlotClone)
    );

const collectInheritedSlotPaths = (
    nodes = [],
    manualSlots = [],
    currentSlotNodes = []
) => {
    const paths = new Set();
    const add = (value) => {
        const path = normalizeSlotPath(value);
        if (path) paths.add(path);
    };

    manualSlots.forEach((slot) => {
        if (slot?.slotKind === "inheritSlot" || Boolean(slot?.inherited)) {
            add(slot?.inherited?.xpath || slot?.path);
        }
    });

    nodes.forEach((node) => {
        [...(node.data?.inSlots || []), ...(node.data?.outSlots || [])].forEach(
            (slot) => {
                if (slot?.inherited) {
                    add(slot?.inherited?.xpath || slot?.path);
                }
            }
        );
    });

    currentSlotNodes.forEach((slotNode) => {
        if (slotNode?.data?.currentMachineInherited) {
            add(slotNode?.data?.path || slotNode?.data?.label);
        }
    });

    return [...paths];
};

const collectAncestorWriterSlotPaths = (ancestorSlotSourcesByPath) => {
    const paths = [];

    ancestorSlotSourcesByPath?.forEach?.((entries, rawPath) => {
        if ((entries || []).some((entry) => entry?.hierarchyKind === "writer")) {
            const path = normalizeSlotPath(rawPath);
            if (path) paths.push(path);
        }
    });

    return paths;
};

export const buildEditorValidationRequest = ({
    nodes = [],
    edges = [],
    globalDataModel = [],
    availableDataModel = globalDataModel,
    behaviorDirectories = [],
    isBehaviorWorkflow = false,
    manualSlots = [],
    ancestorSlotSourcesByPath = new Map(),
    currentSlotNodes = [],
}) => ({
    nodes: nodes.map((node) => ({
        id: String(node?.id || ""),
        nodeType: String(node?.type || ""),
        parentId: node?.parentId ? String(node.parentId) : null,
        label: String(node?.data?.label || ""),
        fullSkillName: String(node?.data?.fullSkillName || ""),
        source: String(node?.data?.src || ""),
        isInitial: Boolean(node?.data?.isInitial),
        isFinal: Boolean(node?.data?.isFinal),
        isBehaviorExit: Boolean(node?.data?.isBehaviorExit),
        isCollapsed: Boolean(node?.data?.isCollapsed),
        isReference: isReferenceNode(node),
        events: (node?.data?.events || []).map((event) => ({
            id: String(event?.id || ""),
            synthetic: Boolean(
                event?.editorImportedSynthetic || event?.editorBoundarySynthetic
            ),
        })),
        parameters: (node?.data?.params || []).map((parameter) => ({
            key: String(parameter?.key || ""),
            typeName: String(parameter?.type || ""),
            required: Boolean(parameter?.required),
            defaultValue: String(parameter?.default ?? ""),
            expression: String(parameter?.expr ?? ""),
        })),
        onEntry: (node?.data?.onEntry || []).map(mapAssignment),
        onExit: (node?.data?.onExit || []).map(mapAssignment),
        inputSlots: (node?.data?.inSlots || []).map(mapSlot),
        outputSlots: (node?.data?.outSlots || []).map(mapSlot),
        hasLocalDataModel: Array.isArray(node?.data?.localDataModel),
        localDataModel: (node?.data?.localDataModel || []).map(mapVariable),
    })),
    edges: edges.map((edge) => {
        const assignments = Array.isArray(edge?.data?.assignments)
            ? edge.data.assignments
            : edge?.data?.assign?.location
                ? [edge.data.assign]
                : [];

        return {
            id: String(edge?.id || ""),
            source: String(edge?.source || ""),
            target: String(edge?.target || ""),
            event: String(edge?.sourceHandle || edge?.label || ""),
            sourceHandle: String(edge?.sourceHandle || ""),
            semanticSource: String(
                edge?.data?.boundaryOriginalSource ||
                    edge?.data?.compoundOriginalSource ||
                    edge?.data?.parallelOriginalSource ||
                    edge?.source ||
                    ""
            ),
            assignments: assignments.map(mapAssignment),
        };
    }),
    globalDataModel: (globalDataModel || []).map(mapVariable),
    availableDataModel: (availableDataModel || []).map(mapVariable),
    behaviorDirectoryKeys: (behaviorDirectories || [])
        .map((directory) => String(directory?.key || "").trim().toUpperCase())
        .filter(Boolean),
    isBehaviorWorkflow: Boolean(isBehaviorWorkflow),
    inheritedSlotPaths: collectInheritedSlotPaths(
        nodes,
        manualSlots,
        currentSlotNodes
    ),
    ancestorWriterSlotPaths: collectAncestorWriterSlotPaths(
        ancestorSlotSourcesByPath
    ),
});

/**
 * Compact validation payload for the Rust-owned active document.
 *
 * Structural state, transitions, slots and the workflow datamodel already live
 * in WorkflowDocumentStore. Only editor/skill-definition metadata that is not
 * persisted there yet crosses IPC.
 */
export const buildActiveValidationRequest = ({
    nodes = [],
    availableDataModel = [],
    behaviorDirectories = [],
    isBehaviorWorkflow = false,
    ancestorSlotSourcesByPath = new Map(),
}) => ({
    availableDataModel: (availableDataModel || []).map(mapVariable),
    behaviorDirectoryKeys: (behaviorDirectories || [])
        .map((directory) => String(directory?.key || "").trim().toUpperCase())
        .filter(Boolean),
    isBehaviorWorkflow: Boolean(isBehaviorWorkflow),
    ancestorWriterSlotPaths: collectAncestorWriterSlotPaths(
        ancestorSlotSourcesByPath
    ),
    nodeOverlays: (nodes || [])
        .filter((node) => !isReferenceNode(node))
        .map((node) => ({
            id: String(node?.id || ""),
            isCollapsed: Boolean(node?.data?.isCollapsed),
            isBehaviorExit: Boolean(node?.data?.isBehaviorExit),
            events: (node?.data?.events || []).map((event) => ({
                id: String(event?.id || ""),
                synthetic: Boolean(
                    event?.editorImportedSynthetic ||
                        event?.editorBoundarySynthetic
                ),
            })),
            parameters: (node?.data?.params || []).map((parameter) => ({
                key: String(parameter?.key || ""),
                typeName: String(parameter?.type || ""),
                required: Boolean(parameter?.required),
                defaultValue: String(parameter?.default ?? ""),
                expression: String(parameter?.expr ?? ""),
            })),
            onEntry: (node?.data?.onEntry || []).map(mapAssignment),
            onExit: (node?.data?.onExit || []).map(mapAssignment),
            hasLocalDataModel: Array.isArray(node?.data?.localDataModel),
            localDataModel: (node?.data?.localDataModel || []).map(mapVariable),
        })),
});
