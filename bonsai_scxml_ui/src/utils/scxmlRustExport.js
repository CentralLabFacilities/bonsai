import { prepareGraphForScxml } from "./editorScxml";
import { getConfiguredAssignments } from "./stateActions";
import {
    serializeEditorConditionForScxml,
    serializeEditorValueForScxml,
} from "./valueTypes";
import { serializeEditorWorkflow } from "../tauri-client";

const normalizeAssignment = (assignment) => ({
    location: String(assignment?.location || "").trim().replace(/^@/, ""),
    expression: serializeEditorValueForScxml(assignment?.expr ?? ""),
});

const normalizeAssignments = (assignments) =>
    getConfiguredAssignments(assignments || []).map(normalizeAssignment);

// Transition assignments historically allow an explicitly empty expression;
// state on-entry/on-exit actions do not. Preserve that distinction during the
// Rust migration so save behavior stays identical.
const normalizeTransitionAssignments = (assignments) =>
    (Array.isArray(assignments) ? assignments : [])
        .filter(
            (assignment) =>
                String(assignment?.location || "").trim() !== "" &&
                assignment?.expr !== undefined
        )
        .map(normalizeAssignment);

const normalizeSlot = (slot) => ({
    key: String(slot?.key || ""),
    typeName: String(slot?.type || ""),
    description: String(slot?.description || ""),
    path: String(slot?.path || ""),
    inheritedState: String(slot?.inherited?.state || ""),
    inheritedXpath: String(slot?.inherited?.xpath || ""),
    inherited: Boolean(slot?.inherited),
});

const normalizeEvent = (event) => ({
    id: String(event?.id || ""),
    name: String(event?.name || ""),
    rawEvent: String(event?.rawEvent || ""),
    target: String(event?.target || ""),
    condition: serializeEditorConditionForScxml(event?.cond || ""),
    assignments: Array.isArray(event?.assignments)
        ? normalizeTransitionAssignments(event.assignments)
        : event?.assignLocation
            ? normalizeTransitionAssignments([
                {
                    location: event.assignLocation,
                    expr: event.assignExpr || "",
                },
            ])
            : [],
    sourceNodeId: String(event?.sourceNodeId || ""),
    transitionHandleId: String(event?.transitionHandleId || ""),
});

const normalizeParameter = (parameter) => {
    const rawExpression = String(parameter?.expr || parameter?.default || "");
    return {
        key: String(parameter?.key || ""),
        expression: serializeEditorValueForScxml(rawExpression, {
            preserveReferenceMarker: true,
        }),
    };
};

const normalizeNode = (node) => {
    const legacyOnEntry = (node?.data?.params || []).filter(
        (parameter) => parameter?.location && parameter?.expr
    );
    const onEntry = Array.isArray(node?.data?.onEntry)
        ? node.data.onEntry
        : legacyOnEntry;
    const onExit = Array.isArray(node?.data?.onExit)
        ? node.data.onExit
        : [];

    return {
        id: String(node?.id || ""),
        nodeType: String(node?.type || ""),
        parentId: node?.parentId ? String(node.parentId) : null,
        label: String(node?.data?.label || ""),
        fullSkillName: String(node?.data?.fullSkillName || ""),
        source: String(node?.data?.src || ""),
        isInitial: Boolean(node?.data?.isInitial),
        isFinal: Boolean(node?.data?.isFinal),
        initialChildId: node?.data?.initialChildId
            ? String(node.data.initialChildId)
            : null,
        initialSubState: String(node?.data?.initialSubState || ""),
        parameters: buildRustStateParameters(node?.data?.params || []),
        inputSlots: (node?.data?.inSlots || []).map(normalizeSlot),
        outputSlots: (node?.data?.outSlots || []).map(normalizeSlot),
        onEntry: normalizeAssignments(onEntry),
        onExit: normalizeAssignments(onExit),
        events: (node?.data?.events || []).map(normalizeEvent),
        isBehaviorExit: Boolean(node?.data?.isBehaviorExit),
        behaviorExitEvents: (node?.data?.behaviorExitEvents || [])
            .filter(Boolean)
            .map(String),
        behaviorExitTransitions: (node?.data?.behaviorExitTransitions || []).map(
            (transition) => ({
                triggerEvent: String(transition?.triggerEvent || ""),
                sendEvents: (transition?.sendEvents || [])
                    .filter(Boolean)
                    .map(String),
            })
        ),
        containerTransitionOrder: (node?.data?.containerTransitionOrder || []).map(String),
        x: Number(node?.position?.x || 0),
        y: Number(node?.position?.y || 0),
        editorPositions: (node?.data?.editorClonePositions || []).map((position) => ({
            x: Number(position?.x || 0),
            y: Number(position?.y || 0),
            instanceId: position?.instanceId
                ? String(position.instanceId)
                : null,
            cloneType: position?.cloneType
                ? String(position.cloneType)
                : position?.isSkillClone
                    ? "skill"
                    : null,
        })),
    };
};

const normalizeLogicalTransitionSources = (edge) => {
    const stored = Array.isArray(edge?.data?.boundaryOriginalSources)
        ? edge.data.boundaryOriginalSources
              .map((source) => ({
                  stateId: String(
                      source?.sourceId || source?.nodeId || source?.id || ""
                  ),
                  handle: String(
                      source?.sourceHandle || source?.handle || ""
                  ),
              }))
              .filter((source) => source.stateId && source.handle)
        : [];

    if (stored.length > 0) return stored;

    const stateId = String(
        edge?.data?.boundaryOriginalSource ||
        edge?.data?.compoundOriginalSource ||
        edge?.data?.parallelOriginalSource ||
        edge?.source ||
        ""
    );
    const handle = String(
        edge?.data?.boundaryOriginalSourceHandle ||
        edge?.data?.compoundOriginalSourceHandle ||
        edge?.data?.parallelOriginalSourceHandle ||
        edge?.sourceHandle ||
        edge?.label ||
        "success"
    );

    return stateId ? [{ stateId, handle }] : [];
};

const normalizeEdge = (edge) => ({
    id: String(edge?.id || ""),
    source: String(edge?.source || ""),
    target: String(edge?.target || ""),
    sourceHandle: String(edge?.sourceHandle || ""),
    label: String(edge?.label || ""),
    condition: serializeEditorConditionForScxml(edge?.data?.cond || ""),
    assignments: Array.isArray(edge?.data?.assignments)
        ? normalizeTransitionAssignments(edge.data.assignments)
        : edge?.data?.assign?.location
            ? normalizeTransitionAssignments([edge.data.assign])
            : [],
    importedRawEvent: String(edge?.data?.boundaryImportedRawEvent || ""),
    editorTargetInstanceId: String(edge?.data?.editorTargetInstanceId || ""),
    logicalSources: normalizeLogicalTransitionSources(edge),
});


export const buildRustStateEditorPositions = ({
    nodes = [],
    edges = [],
    stateId,
} = {}) => {
    const canonicalId = String(stateId || "").trim();
    if (!canonicalId) return null;

    const exportGraph = prepareGraphForScxml(nodes || [], edges || []);
    const state = exportGraph.nodes.find((node) => node.id === canonicalId);
    if (!state) return null;

    const clonePositions = Array.isArray(state.data?.editorClonePositions)
        ? state.data.editorClonePositions
        : [];

    const positions = clonePositions.length > 0
        ? clonePositions
        : [{
            x: Number(state.position?.x || 0),
            y: Number(state.position?.y || 0),
            instanceId: null,
            cloneType: null,
        }];

    return positions.map((position) => ({
        x: Number(position?.x || 0),
        y: Number(position?.y || 0),
        instanceId: position?.instanceId
            ? String(position.instanceId)
            : null,
        cloneType: position?.cloneType
            ? String(position.cloneType)
            : position?.isSkillClone
                ? "skill"
                : null,
    }));
};

export const buildRustDataModelEntries = (globalDataModel = []) =>
    (globalDataModel || []).map((entry) => ({
        id: String(entry?.id || ""),
        expression: serializeEditorValueForScxml(entry?.expr ?? ""),
    }));

export const buildRustStateParameters = (parameters = []) =>
    (Array.isArray(parameters) ? parameters : [])
        .filter(
            (parameter) =>
                String(parameter?.expr || "").trim() !== "" ||
                String(parameter?.default || "").trim() !== ""
        )
        .map(normalizeParameter);

export const buildRustSlotsSnapshot = ({
    nodes = [],
    edges = [],
    manualSlots = [],
} = {}) => {
    const exportGraph = prepareGraphForScxml(nodes || [], edges || []);
    const states = exportGraph.nodes.map((node) => {
        const normalized = normalizeNode(node);
        return {
            stateId: normalized.id,
            stateName:
                normalized.fullSkillName || normalized.label || normalized.id,
            inputSlots: normalized.inputSlots,
            outputSlots: normalized.outputSlots,
        };
    });

    return {
        states,
        extraSlotDeclarations: (manualSlots || []).map((slot) => {
            const inherited =
                slot?.slotKind === "inheritSlot" || Boolean(slot?.inherited);
            return {
                key: String(slot?.key || ""),
                state: String(slot?.inherited?.state || slot?.state || ""),
                xpath: String(slot?.inherited?.xpath || slot?.path || ""),
                inherited,
            };
        }),
    };
};

export const buildRustParallelLaneMoveContext = ({
    nodes = [],
    laneId,
} = {}) => {
    const id = String(laneId || "").trim();
    if (!id) return null;

    const lane = (nodes || []).find(
        (candidate) => candidate?.id === id && candidate?.type === "parallelLane"
    );
    if (!lane?.parentId) return null;

    const wrapper = (nodes || []).find(
        (candidate) =>
            candidate?.parentId === id &&
            candidate?.type === "compound" &&
            (candidate?.data?.autoParallelLaneCompound ||
                candidate?.className === "compound-in-lane")
    );
    const semanticParentId = wrapper?.id || id;
    const memberStateIds = (nodes || [])
        .filter(
            (candidate) =>
                candidate?.parentId === semanticParentId &&
                candidate?.type !== "slot" &&
                candidate?.type !== "parallelLane" &&
                !candidate?.data?.isSkillClone &&
                !candidate?.data?.isStateClone &&
                !candidate?.data?.isSlotClone
        )
        .map((candidate) => String(candidate.id || "").trim())
        .filter(Boolean);

    return {
        lane: normalizeNode(lane),
        wrapper: wrapper ? normalizeNode(wrapper) : null,
        memberStateIds,
    };
};

export const buildRustEditorNodeSnapshots = ({
    nodes = [],
    edges = [],
    stateIds = [],
} = {}) => {
    const requestedIds = (Array.isArray(stateIds) ? stateIds : [stateIds])
        .map((id) => String(id || "").trim())
        .filter(Boolean);
    if (requestedIds.length === 0) return [];

    const exportGraph = prepareGraphForScxml(nodes || [], edges || []);
    const byId = new Map(exportGraph.nodes.map((node) => [node.id, node]));

    return requestedIds
        .map((stateId) => byId.get(stateId))
        .filter(Boolean)
        .map(normalizeNode);
};

export const buildRustEditorStructureSnapshot = ({
    nodes = [],
    edges = [],
} = {}) => {
    const exportGraph = prepareGraphForScxml(nodes || [], edges || []);
    return {
        nodes: exportGraph.nodes.map(normalizeNode),
        edges: exportGraph.edges.map(normalizeEdge),
    };
};

export const buildRustEditorExportRequest = ({
    nodes,
    edges,
    globalDataModel,
    manualSlots,
}) => {
    const structure = buildRustEditorStructureSnapshot({ nodes, edges });

    return {
        ...structure,
        dataModel: buildRustDataModelEntries(globalDataModel),
        extraSlotDeclarations: (manualSlots || []).map((slot) => {
            const inherited =
                slot?.slotKind === "inheritSlot" || Boolean(slot?.inherited);
            return {
                key: String(slot?.key || ""),
                state: String(slot?.inherited?.state || slot?.state || ""),
                xpath: String(slot?.inherited?.xpath || slot?.path || ""),
                inherited,
            };
        }),
    };
};

export const serializeEditorGraphWithRust = async (editorState) =>
    serializeEditorWorkflow(buildRustEditorExportRequest(editorState));

const escapeFallbackXmlAttribute = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

const sanitizeFallbackXmlComment = (value) =>
    String(value ?? "Unknown serializer error")
        .replace(/--+/g, "—")
        .replace(/-$/g, "–")
        .replace(/[\r\n]+/g, " ")
        .trim();

// Code View is also a recovery surface for malformed/legacy editor state. If
// the canonical Rust serializer rejects that state, keep Code View useful by
// emitting a minimal, transition-free SCXML snapshot instead of an error-only
// comment. The fallback intentionally uses editor ids because they are unique
// even when semantic names/transition ids are not.
const buildFallbackEditorScxmlUnsafe = (editorState = {}, error = null) => {
    let sourceNodes = Array.isArray(editorState.nodes) ? editorState.nodes : [];

    try {
        const prepared = prepareGraphForScxml(
            sourceNodes,
            Array.isArray(editorState.edges) ? editorState.edges : []
        );
        if (Array.isArray(prepared?.nodes)) {
            sourceNodes = prepared.nodes;
        }
    } catch (prepareError) {
        // The emergency serializer must not depend on graph normalization
        // succeeding. Raw editor nodes still provide a useful recovery view.
        console.warn("Could not normalize graph for fallback SCXML:", prepareError);
    }

    const allById = new Map(sourceNodes.map((node) => [node.id, node]));
    const isStructuralNode = (node) =>
        node?.type === "parallelLane" ||
        Boolean(node?.data?.autoParallelLaneCompound) ||
        Boolean(node?.data?.isSkillClone) ||
        Boolean(node?.data?.isStateClone) ||
        Boolean(node?.data?.isSlotClone) ||
        node?.type === "slot";
    const semanticNodes = sourceNodes.filter((node) => !isStructuralNode(node));
    const semanticIds = new Set(semanticNodes.map((node) => node.id));

    const resolveSemanticParentId = (node) => {
        let parentId = node?.parentId || null;
        const visited = new Set();

        while (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            if (semanticIds.has(parentId)) return parentId;
            parentId = allById.get(parentId)?.parentId || null;
        }

        return null;
    };

    const childrenByParent = new Map();
    semanticNodes.forEach((node) => {
        const parentId = resolveSemanticParentId(node);
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(node);
    });

    childrenByParent.forEach((children) => {
        children.sort(
            (left, right) =>
                Number(left.position?.y || 0) - Number(right.position?.y || 0) ||
                Number(left.position?.x || 0) - Number(right.position?.x || 0) ||
                String(left.id).localeCompare(String(right.id))
        );
    });

    const renderNode = (node, depth) => {
        const indent = "  ".repeat(depth);
        const children = childrenByParent.get(node.id) || [];
        const tag = node.type === "parallel" ? "parallel" : "state";
        const id = escapeFallbackXmlAttribute(node.id || "state");
        const initialChild =
            children.find((child) => child.id === node.data?.initialChildId) ||
            children.find((child) => child.data?.isInitial) ||
            null;
        const initialAttribute =
            tag === "state" && initialChild
                ? ` initial="${escapeFallbackXmlAttribute(initialChild.id)}"`
                : "";

        if (children.length === 0) {
            return `${indent}<${tag} id="${id}"${initialAttribute}/>`;
        }

        return [
            `${indent}<${tag} id="${id}"${initialAttribute}>`,
            ...children.map((child) => renderNode(child, depth + 1)),
            `${indent}</${tag}>`,
        ].join("\n");
    };

    const roots = childrenByParent.get(null) || [];
    const initialRoot = roots.find((node) => node.data?.isInitial) || roots[0] || null;
    const initialAttribute = initialRoot
        ? ` initial="${escapeFallbackXmlAttribute(initialRoot.id)}"`
        : "";
    const reason = sanitizeFallbackXmlComment(
        error?.message || error || "Canonical Rust serialization unavailable"
    );

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"${initialAttribute}>`,
        `  <!-- Recovery SCXML: transitions were omitted because canonical serialization failed: ${reason} -->`,
        ...roots.map((node) => renderNode(node, 1)),
        "</scxml>",
    ].join("\n");
};

export const buildFallbackEditorScxml = (editorState = {}, error = null) => {
    try {
        return buildFallbackEditorScxmlUnsafe(editorState, error);
    } catch (fallbackError) {
        console.error("Emergency SCXML fallback also failed:", fallbackError);
        const reason = sanitizeFallbackXmlComment(
            error?.message ||
                error ||
                fallbackError?.message ||
                fallbackError ||
                "Canonical serialization unavailable"
        );
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0">',
            `  <!-- Recovery SCXML: editor structure could not be recovered: ${reason} -->`,
            '</scxml>',
        ].join("\n");
    }
};
