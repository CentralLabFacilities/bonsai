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

export const buildRustEditorExportRequest = ({
    nodes,
    edges,
    globalDataModel,
    manualSlots,
}) => {
    const exportGraph = prepareGraphForScxml(nodes || [], edges || []);

    return {
        nodes: exportGraph.nodes.map(normalizeNode),
        edges: exportGraph.edges.map(normalizeEdge),
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
