import {
    deserializeScxmlConditionForEditor,
    deserializeScxmlValueForEditor,
    deserializeStateDatamodelValueForEditor,
} from "./valueTypes";
import { getTransitionExitToken } from "./transitionEvents";

const toEditorAssignment = (assignment) => ({
    location: String(assignment?.location || ""),
    expr: deserializeScxmlValueForEditor(assignment?.expression || ""),
});

const getPrimaryEditorPosition = (state) => {
    const positions = Array.isArray(state?.editor?.positions)
        ? state.editor.positions
        : [];
    return (
        positions.find((position) => !position?.cloneType) ||
        positions[0] ||
        (state?.editor
            ? {
                  x: state.editor.x,
                  y: state.editor.y,
              }
            : null)
    );
};

const mergeParameters = (current = [], canonical = []) => {
    const byKey = new Map(
        (canonical || []).map((parameter) => [String(parameter?.key || ""), parameter])
    );
    const seen = new Set();

    const merged = (current || []).map((parameter) => {
        const key = String(parameter?.key || "");
        const canonicalParameter = byKey.get(key);
        seen.add(key);

        // Rust's editor projection intentionally stores only configured
        // parameter values. Missing keys therefore mean "configured value was
        // cleared", not that the skill definition disappeared.
        if (!canonicalParameter) {
            return {
                ...parameter,
                expr: "",
            };
        }

        return {
            ...parameter,
            ...(canonicalParameter.typeName
                ? { type: canonicalParameter.typeName }
                : {}),
            ...(canonicalParameter.description
                ? { description: canonicalParameter.description }
                : {}),
            ...(canonicalParameter.defaultValue !== undefined &&
            canonicalParameter.defaultValue !== null
                ? { default: canonicalParameter.defaultValue }
                : {}),
            ...(canonicalParameter.required !== undefined
                ? { required: Boolean(canonicalParameter.required) }
                : {}),
            expr: deserializeStateDatamodelValueForEditor(
                canonicalParameter.expression || ""
            ),
        };
    });

    // This primarily matters for states loaded directly from Rust before the
    // skill API has supplied a matching parameter definition. Preserve enough
    // metadata for the editor to display the canonical value.
    (canonical || []).forEach((parameter) => {
        const key = String(parameter?.key || "");
        if (!key || seen.has(key)) return;
        merged.push({
            key,
            type: parameter?.typeName || "",
            required: Boolean(parameter?.required),
            default: parameter?.defaultValue ?? "",
            description: parameter?.description || "",
            expr: deserializeStateDatamodelValueForEditor(
                parameter?.expression || ""
            ),
        });
    });

    return merged;
};

const mergeSlots = (current = [], canonical = [], stateName = "") => {
    const currentByIdentity = new Map(
        (current || []).map((slot) => [
            `${String(slot?.key || "")}\u0000${String(slot?.type || "")}`,
            slot,
        ])
    );

    return (canonical || []).map((slot) => {
        const identity = `${String(slot?.key || "")}\u0000${String(
            slot?.typeName || ""
        )}`;
        const existing =
            currentByIdentity.get(identity) ||
            (current || []).find(
                (candidate) => String(candidate?.key || "") === String(slot?.key || "")
            ) ||
            {};
        const inheritedValue = String(slot?.inherited || "").trim();

        return {
            ...existing,
            key: String(slot?.key || ""),
            type: slot?.typeName || existing.type || "",
            description: slot?.description || existing.description || "",
            path: String(slot?.path || ""),
            inherited: inheritedValue
                ? {
                      ...(existing.inherited || {}),
                      state:
                          existing.inherited?.state ||
                          stateName ||
                          "",
                      xpath: inheritedValue,
                  }
                : null,
        };
    });
};

const stateDataPatch = (node, state, mode = "all") => {
    const currentData = node?.data || {};
    const stateName =
        state?.fullSkillName || state?.scxmlId || state?.label || node?.id || "";
    const next = { ...currentData };

    if (mode === "all" || mode === "identity" || mode === "label") {
        if (state?.label !== undefined) next.label = state.label;
    }
    if (mode === "all" || mode === "identity") {
        if (state?.fullSkillName !== undefined && state?.fullSkillName !== null) {
            next.fullSkillName = state.fullSkillName;
        }
        if (currentData.scxmlStateId !== undefined) {
            next.scxmlStateId = state?.scxmlId || currentData.scxmlStateId;
        }
    }
    if (mode === "all" || mode === "source") {
        next.src = state?.source || "";
    }
    if (mode === "all" || mode === "initial" || mode === "move") {
        next.isInitial = Boolean(state?.isInitial);
        next.isFinal = Boolean(state?.isFinal);
        next.initialChildId = state?.initialChildId || null;
        next.initialSubState = state?.initialChildScxmlId || "";
    }
    if (mode === "all" || mode === "parameters") {
        next.params = mergeParameters(
            currentData.params || [],
            state?.parameters || []
        );
    }
    if (mode === "all" || mode === "slots") {
        next.inSlots = mergeSlots(
            currentData.inSlots || [],
            state?.inputSlots || [],
            stateName
        );
        next.outSlots = mergeSlots(
            currentData.outSlots || [],
            state?.outputSlots || [],
            stateName
        );
    }
    if (mode === "all") {
        next.onEntry = (state?.onEntry || []).map(toEditorAssignment);
        next.onExit = (state?.onExit || []).map(toEditorAssignment);
    }

    return next;
};

export const applyRustWorkflowStatePatch = (
    currentNodes = [],
    patch = null,
    { mode = "all" } = {}
) => {
    if (!patch) return currentNodes;

    const removed = new Set(patch.removedStateIds || []);
    const changedById = new Map(
        (patch.states || []).map((state) => [String(state?.id || ""), state])
    );
    const parallelLaneUpdates = new Map(
        (patch.parallelLaneUpdates || []).map((lane) => [
            String(lane?.laneId || ""),
            lane,
        ])
    );

    let changed = false;
    const nextNodes = [];

    for (const node of currentNodes || []) {
        const canonicalId = String(node?.data?.cloneOfNodeId || node?.id || "");
        if (
            removed.has(canonicalId) &&
            !(mode === "move" && node?.type === "parallelLane")
        ) {
            changed = true;
            continue;
        }

        // Visual references/aliases inherit their display name via the normal
        // graph-maintenance hook. Do not overwrite their intentionally sparse
        // data object with a full semantic state payload.
        const state = changedById.get(String(node?.id || ""));
        if (
            !state ||
            mode === "none" ||
            node?.data?.isSkillClone ||
            node?.data?.isStateClone
        ) {
            nextNodes.push(node);
            continue;
        }

        const shouldApplyPosition =
            (mode === "all" || mode === "position" || mode === "move") &&
            !(mode === "move" && node?.type === "parallelLane");
        const primaryPosition = shouldApplyPosition
            ? getPrimaryEditorPosition(state)
            : null;
        const nextPosition = primaryPosition
            ? {
                  x: Number(primaryPosition.x || 0),
                  y: Number(primaryPosition.y || 0),
              }
            : node.position;

        nextNodes.push({
            ...node,
            // React Flow parentage is editor topology. In particular, an
            // atomic Parallel lane is flattened semantically in Rust while its
            // visual lane helper remains the React parent. The optimistic drag
            // has already committed the correct visual parent, so a move patch
            // must not overwrite it with the flatter semantic parent.
            position: nextPosition,
            data: stateDataPatch(node, state, mode),
        });
        changed = true;
    }

    if (mode === "move" && parallelLaneUpdates.size > 0) {
        const laneMembers = new Map();
        parallelLaneUpdates.forEach((lane, laneId) => {
            const initialChildId = lane?.initialChildId
                ? String(lane.initialChildId)
                : null;
            for (const memberId of lane?.memberStateIds || []) {
                laneMembers.set(String(memberId), { laneId, initialChildId });
            }
        });

        for (let index = 0; index < nextNodes.length; index += 1) {
            const node = nextNodes[index];
            const lane = parallelLaneUpdates.get(String(node?.id || ""));
            if (lane && node?.type === "parallelLane") {
                nextNodes[index] = {
                    ...node,
                    data: {
                        ...(node.data || {}),
                        initialChildId: lane?.initialChildId || null,
                    },
                };
                changed = true;
                continue;
            }

            const membership = laneMembers.get(String(node?.id || ""));
            if (membership && node?.parentId === membership.laneId) {
                const isInitial = node.id === membership.initialChildId;
                if (Boolean(node?.data?.isInitial) !== isInitial) {
                    nextNodes[index] = {
                        ...node,
                        data: {
                            ...(node.data || {}),
                            isInitial,
                        },
                    };
                    changed = true;
                }
            }
        }
    }

    return changed ? nextNodes : currentNodes;
};

const transitionLogicalSources = (transition) =>
    (Array.isArray(transition?.logicalSources) ? transition.logicalSources : [])
        .map((source) => ({
            sourceId: String(source?.stateId || "").trim(),
            sourceHandle: String(source?.handle || "").trim(),
        }))
        .filter((source) => source.sourceId && source.sourceHandle);

const applyLogicalSourcesToBoundaryData = (edge, transition, data) => {
    const logicalSources = transitionLogicalSources(transition);
    if (logicalSources.length === 0) return data;

    const hasBoundaryMetadata = Boolean(
        edge?.data?.boundaryOriginalSource ||
        edge?.data?.compoundOriginalSource ||
        edge?.data?.parallelOriginalSource ||
        Array.isArray(edge?.data?.boundaryOriginalSources)
    );
    const sourceOwnerDiffers =
        String(transition?.sourceStateId || "").trim() &&
        String(transition?.sourceStateId || "").trim() !==
            logicalSources[0].sourceId;
    if (!hasBoundaryMetadata && !sourceOwnerDiffers) return data;

    const primary = logicalSources[0];
    const nextData = {
        ...data,
        boundaryOriginalSource: primary.sourceId,
        boundaryOriginalSourceHandle: primary.sourceHandle,
    };

    if (logicalSources.length > 1) {
        nextData.boundaryOriginalSources = logicalSources;
    } else {
        delete nextData.boundaryOriginalSources;
    }

    if (edge?.data?.compoundOriginalSource !== undefined) {
        nextData.compoundOriginalSource = primary.sourceId;
        nextData.compoundOriginalSourceHandle = primary.sourceHandle;
    }
    if (edge?.data?.parallelOriginalSource !== undefined) {
        nextData.parallelOriginalSource = primary.sourceId;
        nextData.parallelOriginalSourceHandle = primary.sourceHandle;
    }

    return nextData;
};

const edgeLabelFor = (sourceHandle, condition) => {
    const handle = String(sourceHandle || "success");
    const cond = String(condition || "").trim();
    return cond ? `${handle} [${cond}]` : handle;
};

export const applyRustWorkflowTransitionPatch = (
    currentEdges = [],
    currentNodes = [],
    patch = null,
    { applyChanges = true } = {}
) => {
    if (!patch) return currentEdges;

    const removed = new Set(patch.removedTransitionIds || []);
    const transitionsById = new Map(
        (patch.transitions || []).map((transition) => [
            String(transition?.id || ""),
            transition,
        ])
    );
    const nodesById = new Map((currentNodes || []).map((node) => [node.id, node]));

    let changed = false;
    const nextEdges = [];

    for (const edge of currentEdges || []) {
        if (removed.has(String(edge?.id || ""))) {
            changed = true;
            continue;
        }

        const transition = applyChanges
            ? transitionsById.get(String(edge?.id || ""))
            : null;
        if (!transition) {
            nextEdges.push(edge);
            continue;
        }

        const sourceNode = nodesById.get(edge.source);
        const sourceSkillName = sourceNode?.data?.fullSkillName || "";
        const logicalSources = transitionLogicalSources(transition);
        const sourceHandle =
            logicalSources[0]?.sourceHandle ||
            getTransitionExitToken(
                transition.event || edge.sourceHandle || "success",
                sourceSkillName
            );
        const condition = deserializeScxmlConditionForEditor(
            transition.condition || ""
        );
        const assignments = (transition.assignments || []).map(toEditorAssignment);

        const nextData = applyLogicalSourcesToBoundaryData(
            edge,
            transition,
            {
                ...(edge.data || {}),
                cond: condition,
                assignments,
                assign: assignments[0] || null,
                editorTargetInstanceId:
                    transition.targetInstanceId ||
                    edge.data?.editorTargetInstanceId ||
                    "",
                ...(edge.data?.boundaryImportedRawEvent !== undefined
                    ? { boundaryImportedRawEvent: transition.event || "" }
                    : {}),
            }
        );

        nextEdges.push({
            ...edge,
            sourceHandle,
            label: edge?.data?.boundaryInternalEdge
                ? edge.label
                : edgeLabelFor(sourceHandle, condition),
            data: nextData,
        });
        changed = true;
    }

    return changed ? nextEdges : currentEdges;
};

export const applyRustWorkflowDataModelPatch = (current = [], patch = null) => {
    if (!patch || !Array.isArray(patch.dataModel)) return current;

    return patch.dataModel.map((entry) => ({
        id: String(entry?.id || ""),
        ...(entry?.typeName ? { type: entry.typeName } : {}),
        expr: deserializeScxmlValueForEditor(entry?.expression || ""),
    }));
};
