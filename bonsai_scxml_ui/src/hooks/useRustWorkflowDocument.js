import { useCallback, useRef } from "react";
import {
    applyWorkflowCommand as applyWorkflowCommandTauri,
    isTauri,
    replaceActiveEditorWorkflowDocument,
} from "../tauri-client";
import {
    buildRustEditorExportRequest,
    buildRustEditorStructureSnapshot,
    buildRustSlotsSnapshot,
    buildRustStateEditorPositions,
    buildRustStateParameters,
} from "../utils/scxmlRustExport";
import { buildRustTransitionSyncPlan } from "../utils/rustTransitionSync";
import {
    applyRustWorkflowDataModelPatch,
    applyRustWorkflowStatePatch,
    applyRustWorkflowTransitionPatch,
} from "../utils/rustWorkflowPatch";

const isRevisionConflict = (error) =>
    String(error?.message || error || "")
        .toLowerCase()
        .includes("revision conflict");

const waitForEditorCommit = () =>
    new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve();
            return;
        }
        window.requestAnimationFrame(() => resolve());
    });

const getCanonicalPatchPolicy = (command) => {
    switch (command?.type) {
        case "setRootInitial":
        case "setStateInitialChild":
            return { stateMode: "initial", applyTransitions: false };
        case "renameState":
            return { stateMode: "identity", applyTransitions: true };
        case "setStateLabel":
            return { stateMode: "label", applyTransitions: false };
        case "setStateSource":
            return { stateMode: "source", applyTransitions: false };
        case "updateStateEditorPosition":
        case "replaceStateEditorPositions":
            return { stateMode: "position", applyTransitions: false };
        case "replaceStateParameters":
            return { stateMode: "parameters", applyTransitions: false };
        case "replaceSlotsSnapshot":
            return { stateMode: "slots", applyTransitions: false };
        case "replaceDataModel":
            return { stateMode: "none", applyTransitions: false };
        case "updateTransitionEvent":
        case "updateTransitionTarget":
        case "replaceTargetedTransitions":
        case "replaceEditorTransitions":
            return { stateMode: "none", applyTransitions: true };
        case "removeStates":
            return { stateMode: "none", applyTransitions: false };
        case "addState":
        case "replaceEditorStructure":
            return { stateMode: "all", applyTransitions: true };
        default:
            return { stateMode: "none", applyTransitions: false };
    }
};

/**
 * Keeps the Rust-owned semantic Workflow aligned with the active React Flow
 * document without putting UI interaction behind IPC.
 *
 * Local editor mutations remain immediate. Semantic Rust commands are queued
 * in the same order and guarded by the document revision. Tab/file switches
 * replace the Rust document from a compact editor snapshot. If an external
 * operation (for example Save) advanced the Rust revision, the bridge recovers
 * by replacing the semantic document from the already-updated editor state.
 */
export function useRustWorkflowDocument({
    nodes,
    edges,
    globalDataModel,
    manualSlots,
    setNodes,
    setEdges,
    setGlobalDataModel,
}) {
    const revisionRef = useRef(null);
    const readyRef = useRef(false);
    const queueRef = useRef(Promise.resolve());
    const editorStateRef = useRef(null);

    editorStateRef.current = {
        nodes,
        edges,
        globalDataModel,
        manualSlots,
    };

    const enqueue = useCallback((operation) => {
        const next = queueRef.current
            .catch(() => undefined)
            .then(operation);
        queueRef.current = next.catch(() => undefined);
        return next;
    }, []);

    const applyCanonicalPatch = useCallback(
        (result, command) => {
            const patch = result?.patch;
            if (!patch) return;
            const policy = getCanonicalPatchPolicy(command);

            // Merge Rust's canonical semantic result back into the existing
            // React Flow projection. The patch utilities deliberately preserve
            // view-only topology (Parallel lanes, boundary helpers, callbacks,
            // selection, etc.) instead of replacing the graph with the flatter
            // semantic Rust model.
            const current = editorStateRef.current || {};
            const nextNodes = applyRustWorkflowStatePatch(
                current.nodes || [],
                patch,
                { mode: policy.stateMode }
            );
            const nextEdges = applyRustWorkflowTransitionPatch(
                current.edges || [],
                nextNodes,
                patch,
                { applyChanges: policy.applyTransitions }
            );
            const nextDataModel = applyRustWorkflowDataModelPatch(
                current.globalDataModel || [],
                patch
            );

            editorStateRef.current = {
                ...current,
                nodes: nextNodes,
                edges: nextEdges,
                globalDataModel: nextDataModel,
            };

            if (
                (patch.states?.length || 0) > 0 ||
                (patch.removedStateIds?.length || 0) > 0
            ) {
                setNodes?.((currentNodes) =>
                    applyRustWorkflowStatePatch(currentNodes, patch, {
                        mode: policy.stateMode,
                    })
                );
            }
            if (
                (patch.transitions?.length || 0) > 0 ||
                (patch.removedTransitionIds?.length || 0) > 0
            ) {
                setEdges?.((currentEdges) =>
                    applyRustWorkflowTransitionPatch(
                        currentEdges,
                        editorStateRef.current?.nodes || nextNodes,
                        patch,
                        { applyChanges: policy.applyTransitions }
                    )
                );
            }
            if (Array.isArray(patch.dataModel)) {
                setGlobalDataModel?.((currentDataModel) =>
                    applyRustWorkflowDataModelPatch(currentDataModel, patch)
                );
            }
        },
        [setEdges, setGlobalDataModel, setNodes]
    );

    const replaceNow = useCallback(async (editorState, expectedRevision = null) => {
        if (!isTauri()) return null;

        const request = buildRustEditorExportRequest(
            editorState || editorStateRef.current || {}
        );
        const snapshot = await replaceActiveEditorWorkflowDocument(
            request,
            expectedRevision
        );
        revisionRef.current = snapshot?.revision ?? null;
        readyRef.current = true;
        return snapshot;
    }, []);

    const resyncFromEditor = useCallback(
        async (error = null) => {
            if (error) {
                if (isRevisionConflict(error)) {
                    console.debug(
                        "Rust workflow revision changed; resynchronizing active editor document."
                    );
                } else {
                    console.warn(
                        "Rust workflow command failed; resynchronizing from editor state.",
                        error
                    );
                }
            }

            await waitForEditorCommit();
            return replaceNow(editorStateRef.current, null);
        },
        [replaceNow]
    );

    const applyCommandNow = useCallback(
        async (command) => {
            if (!isTauri() || !command) return null;

            if (!readyRef.current) {
                await replaceNow(editorStateRef.current, null);
            }

            try {
                const result = await applyWorkflowCommandTauri(
                    command,
                    revisionRef.current
                );
                revisionRef.current = result?.revision ?? revisionRef.current;
                applyCanonicalPatch(result, command);
                return result;
            } catch (error) {
                return resyncFromEditor(error);
            }
        },
        [applyCanonicalPatch, replaceNow, resyncFromEditor]
    );

    const syncEditorStructureNow = useCallback(
        async (editorState = null) => {
            if (!isTauri()) return null;
            const structure = buildRustEditorStructureSnapshot(
                editorState || editorStateRef.current || {}
            );
            return applyCommandNow({
                type: "replaceEditorStructure",
                ...structure,
            });
        },
        [applyCommandNow]
    );

    const syncEditorTransitionsNow = useCallback(
        async (editorState = null) => {
            if (!isTauri()) return null;
            const structure = buildRustEditorStructureSnapshot(
                editorState || editorStateRef.current || {}
            );
            return applyCommandNow({
                type: "replaceEditorTransitions",
                ...structure,
            });
        },
        [applyCommandNow]
    );

    const syncEditorState = useCallback(
        (editorState = null) =>
            enqueue(async () => {
                if (!isTauri()) return null;
                return replaceNow(editorState || editorStateRef.current, null);
            }),
        [enqueue, replaceNow]
    );

    const syncEditorStateAfterCommit = useCallback(
        () =>
            enqueue(async () => {
                if (!isTauri()) return null;
                await waitForEditorCommit();
                return replaceNow(editorStateRef.current, null);
            }),
        [enqueue, replaceNow]
    );

    const syncEditorStructureAfterCommit = useCallback(
        () =>
            enqueue(async () => {
                if (!isTauri()) return null;
                await waitForEditorCommit();
                return syncEditorStructureNow(editorStateRef.current);
            }),
        [enqueue, syncEditorStructureNow]
    );

    const syncStateEditorPositions = useCallback(
        (stateId) =>
            enqueue(async () => {
                if (!isTauri() || !stateId) return null;
                await waitForEditorCommit();

                const editorState = editorStateRef.current || {};
                const positions = buildRustStateEditorPositions({
                    ...editorState,
                    stateId,
                });
                if (!positions) {
                    return replaceNow(editorState, null);
                }

                return applyCommandNow({
                    type: "replaceStateEditorPositions",
                    stateId,
                    positions,
                });
            }),
        [applyCommandNow, enqueue, replaceNow]
    );

    const syncStatePosition = useCallback(
        (stateId, previousParentId = null) =>
            enqueue(async () => {
                if (!isTauri() || !stateId) return null;
                await waitForEditorCommit();

                const currentNodes = editorStateRef.current?.nodes || [];
                const node = currentNodes.find((candidate) => candidate.id === stateId);
                if (!node) {
                    return replaceNow(editorStateRef.current, null);
                }

                const currentParentId = node.parentId || null;
                const isReference = Boolean(
                    node.data?.isSkillClone || node.data?.isStateClone
                );
                if (isReference) {
                    const sourceStateId = String(
                        node.data?.cloneOfNodeId || ""
                    ).trim();
                    const positions = buildRustStateEditorPositions({
                        ...(editorStateRef.current || {}),
                        stateId: sourceStateId,
                    });
                    if (!sourceStateId || !positions) {
                        return replaceNow(editorStateRef.current, null);
                    }
                    return applyCommandNow({
                        type: "replaceStateEditorPositions",
                        stateId: sourceStateId,
                        positions,
                    });
                }

                const requiresSemanticRebuild =
                    node.type === "parallelLane" ||
                    currentParentId !== (previousParentId || null);

                if (requiresSemanticRebuild) {
                    return syncEditorStructureNow(editorStateRef.current);
                }

                return applyCommandNow({
                    type: "updateStateEditorPosition",
                    stateId,
                    x: Number(node.position?.x || 0),
                    y: Number(node.position?.y || 0),
                });
            }),
        [applyCommandNow, enqueue, replaceNow, syncEditorStructureNow]
    );

    const syncStateParameters = useCallback(
        (stateId, parameters = null) =>
            enqueue(async () => {
                if (!isTauri() || !stateId) return null;

                let parameterList = parameters;
                if (!Array.isArray(parameterList)) {
                    const node = (editorStateRef.current?.nodes || []).find(
                        (candidate) => candidate.id === stateId
                    );
                    if (!node) {
                        return replaceNow(editorStateRef.current, null);
                    }
                    parameterList = node.data?.params || [];
                }

                return applyCommandNow({
                    type: "replaceStateParameters",
                    stateId,
                    parameters: buildRustStateParameters(parameterList),
                });
            }),
        [applyCommandNow, enqueue, replaceNow]
    );

    const syncSlotsAfterCommit = useCallback(
        () =>
            enqueue(async () => {
                if (!isTauri()) return null;
                await waitForEditorCommit();
                const editorState = editorStateRef.current || {};
                return applyCommandNow({
                    type: "replaceSlotsSnapshot",
                    ...buildRustSlotsSnapshot(editorState),
                });
            }),
        [applyCommandNow, enqueue]
    );

    const syncStateConfigurationAfterCommit = useCallback(
        (stateId) =>
            enqueue(async () => {
                if (!isTauri() || !stateId) return null;
                await waitForEditorCommit();

                const editorState = editorStateRef.current || {};
                const node = (editorState.nodes || []).find(
                    (candidate) => candidate.id === stateId
                );
                if (!node) {
                    return replaceNow(editorState, null);
                }

                let result = await applyCommandNow({
                    type: "replaceStateParameters",
                    stateId,
                    parameters: buildRustStateParameters(node.data?.params || []),
                });
                result = await applyCommandNow({
                    type: "replaceSlotsSnapshot",
                    ...buildRustSlotsSnapshot(editorState),
                });
                return result;
            }),
        [applyCommandNow, enqueue, replaceNow]
    );

    const syncRemovedStates = useCallback(
        (
            stateIds,
            {
                forceFull = false,
                forceStructure = false,
                referenceStateIds = [],
                referenceSourceIds = [],
            } = {}
        ) =>
            enqueue(async () => {
                if (!isTauri()) return null;
                const ids = Array.from(
                    new Set(
                        (Array.isArray(stateIds) ? stateIds : [stateIds])
                            .map((id) => String(id || "").trim())
                            .filter(Boolean)
                    )
                );
                if (ids.length === 0 && referenceSourceIds.length === 0) {
                    return null;
                }

                if (forceFull) {
                    await waitForEditorCommit();
                    return replaceNow(editorStateRef.current, null);
                }
                if (forceStructure) {
                    await waitForEditorCommit();
                    return syncEditorStructureNow(editorStateRef.current);
                }

                const referenceIds = new Set(
                    (Array.isArray(referenceStateIds)
                        ? referenceStateIds
                        : [referenceStateIds]
                    )
                        .map((id) => String(id || "").trim())
                        .filter(Boolean)
                );
                const semanticIds = ids.filter((id) => !referenceIds.has(id));

                let result = null;
                if (semanticIds.length > 0) {
                    result = await applyCommandNow({
                        type: "removeStates",
                        stateIds: semanticIds,
                    });
                }

                const sourceIds = Array.from(
                    new Set(
                        (Array.isArray(referenceSourceIds)
                            ? referenceSourceIds
                            : [referenceSourceIds]
                        )
                            .map((id) => String(id || "").trim())
                            .filter(
                                (id) =>
                                    id && !semanticIds.includes(id)
                            )
                    )
                );
                if (sourceIds.length === 0) return result;

                await waitForEditorCommit();
                const editorState = editorStateRef.current || {};
                for (const sourceStateId of sourceIds) {
                    const positions = buildRustStateEditorPositions({
                        ...editorState,
                        stateId: sourceStateId,
                    });
                    if (!positions) continue;
                    result = await applyCommandNow({
                        type: "replaceStateEditorPositions",
                        stateId: sourceStateId,
                        positions,
                    });
                }
                return result;
            }),
        [applyCommandNow, enqueue, replaceNow, syncEditorStructureNow]
    );

    const applyWorkflowCommand = useCallback(
        (command) => enqueue(() => applyCommandNow(command)),
        [applyCommandNow, enqueue]
    );

    const syncTransitionSources = useCallback(
        (sourceStateIds) =>
            enqueue(async () => {
                if (!isTauri()) return null;

                const sourceIds = Array.from(
                    new Set(
                        (Array.isArray(sourceStateIds)
                            ? sourceStateIds
                            : [sourceStateIds]
                        )
                            .map((id) => String(id || "").trim())
                            .filter(Boolean)
                    )
                );
                if (sourceIds.length === 0) return null;

                // Transition mutations are optimistic local React updates. Wait
                // one frame so editorStateRef observes the committed graph.
                await waitForEditorCommit();
                const editorState = editorStateRef.current || {};
                const plans = sourceIds.map((sourceStateId) =>
                    buildRustTransitionSyncPlan({
                        ...editorState,
                        sourceStateId,
                    })
                );

                // Nested/container transitions are hoisted by the SCXML export
                // rules. Rebuild only the transition projection in Rust so their
                // logical SCXML owner, full event and target-instance routing stay
                // correct without replacing unrelated workflow state.
                if (plans.some((plan) => plan?.mode === "full")) {
                    return syncEditorTransitionsNow(editorState);
                }

                let result = null;
                for (const plan of plans) {
                    if (plan?.mode !== "command" || !plan.command) continue;
                    result = await applyCommandNow(plan.command);
                }
                return result;
            }),
        [applyCommandNow, enqueue, syncEditorTransitionsNow]
    );

    const syncTransitionsForSource = useCallback(
        (sourceStateId) => syncTransitionSources([sourceStateId]),
        [syncTransitionSources]
    );

    const invalidate = useCallback(() => {
        readyRef.current = false;
        revisionRef.current = null;
    }, []);

    return {
        applyWorkflowCommand,
        syncEditorState,
        syncEditorStateAfterCommit,
        syncEditorStructureAfterCommit,
        syncStateEditorPositions,
        syncStatePosition,
        syncStateParameters,
        syncSlotsAfterCommit,
        syncStateConfigurationAfterCommit,
        syncRemovedStates,
        syncTransitionsForSource,
        syncTransitionSources,
        invalidate,
        getRevision: () => revisionRef.current,
    };
}
