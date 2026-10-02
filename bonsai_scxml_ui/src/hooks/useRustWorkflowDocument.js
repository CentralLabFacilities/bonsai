import { useCallback, useRef } from "react";
import {
    applyWorkflowCommand as applyWorkflowCommandTauri,
    isTauri,
    replaceActiveEditorWorkflowDocument,
} from "../tauri-client";
import {
    buildRustEditorExportRequest,
    buildRustEditorNodeSnapshots,
    buildRustEditorStructureSnapshot,
    buildRustParallelLaneMoveContext,
    buildRustSlotsSnapshot,
    buildRustStateEditorPositions,
    buildRustStateParameters,
} from "../utils/scxmlRustExport";
import { buildRustTransitionSyncPlan } from "../utils/rustTransitionSync";
import { rebuildBoundaryTransitions } from "../utils/boundaryTransitions";
import {
    editorPerfNow,
    logEditorQueueWait,
    measureEditorAsync,
    measureEditorTask,
} from "../utils/editorPerf";
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
        case "replaceTargetedTransitions":
        case "replaceEditorTransitions":
            return { stateMode: "none", applyTransitions: true };
        case "removeStates":
            // Deletions can also prune one logical source from a shared
            // boundary transition, so apply Rust's retained-transition patch.
            return { stateMode: "none", applyTransitions: true };
        case "insertEditorStates":
            return { stateMode: "initial", applyTransitions: false };
        case "moveEditorState":
        case "reconcileParallelLane":
        case "wrapEditorStates":
            return { stateMode: "move", applyTransitions: true };
        case "pasteEditorSubgraph":
            return { stateMode: "all", applyTransitions: true };
        case "addState":
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
 * replace the Rust document from a compact editor snapshot. Read-only
 * operations such as Save and Code View do not touch the document revision;
 * if another document mutation advances it unexpectedly, the bridge can still
 * recover by replacing the semantic document from the current editor state.
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
    const documentGenerationRef = useRef(0);
    const activeQueueGenerationRef = useRef(0);
    const queueDepthRef = useRef(0);
    const editorStateRef = useRef(null);

    editorStateRef.current = {
        nodes,
        edges,
        globalDataModel,
        manualSlots,
    };

    const enqueue = useCallback((operation, generation = documentGenerationRef.current) => {
        const enqueuedAt = editorPerfNow();
        queueDepthRef.current += 1;
        const queuedDepth = queueDepthRef.current;

        const next = queueRef.current
            .catch(() => undefined)
            .then(async () => {
                activeQueueGenerationRef.current = generation;
                logEditorQueueWait("Rust command queue wait", enqueuedAt, {
                    queuedDepth,
                    currentDepth: queueDepthRef.current,
                });
                try {
                    return await operation();
                } finally {
                    queueDepthRef.current = Math.max(0, queueDepthRef.current - 1);
                }
            });
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
                setEdges?.((currentEdges) => {
                    const patchedEdges = applyRustWorkflowTransitionPatch(
                        currentEdges,
                        editorStateRef.current?.nodes || nextNodes,
                        patch,
                        { applyChanges: policy.applyTransitions }
                    );

                    // Rust patches update logical transitions. Boundary edges
                    // (child -> compound border -> target) are a visual
                    // projection and must be rebuilt afterwards. Otherwise the
                    // internal boundary helper survives while the container
                    // exit edge can disappear.
                    return rebuildBoundaryTransitions(
                        editorStateRef.current?.nodes || nextNodes,
                        patchedEdges
                    ).edges;
                });
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

        const request = measureEditorTask(
            "Build full Rust workflow snapshot",
            () =>
                buildRustEditorExportRequest(
                    editorState || editorStateRef.current || {}
                ),
            {
                nodes: (editorState || editorStateRef.current || {})?.nodes?.length || 0,
                edges: (editorState || editorStateRef.current || {})?.edges?.length || 0,
            }
        );
        const snapshot = await measureEditorAsync(
            "IPC replace active Rust workflow",
            () =>
                replaceActiveEditorWorkflowDocument(
                    request,
                    expectedRevision
                ),
            {
                expectedRevision,
                queueDepth: queueDepthRef.current,
            }
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
                const commandType = String(command?.type || "unknown");
                const result = await measureEditorAsync(
                    `IPC Rust command: ${commandType}`,
                    () =>
                        applyWorkflowCommandTauri(
                            command,
                            revisionRef.current
                        ),
                    {
                        revision: revisionRef.current,
                        queueDepth: queueDepthRef.current,
                    }
                );
                revisionRef.current = result?.revision ?? revisionRef.current;
                if (
                    activeQueueGenerationRef.current ===
                    documentGenerationRef.current
                ) {
                    measureEditorTask(
                        `Apply Rust canonical patch: ${commandType}`,
                        () => applyCanonicalPatch(result, command),
                        {
                            states: result?.patch?.states?.length || 0,
                            transitions: result?.patch?.transitions?.length || 0,
                        }
                    );
                }
                return result;
            } catch (error) {
                return resyncFromEditor(error);
            }
        },
        [applyCanonicalPatch, replaceNow, resyncFromEditor]
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
        (editorState = null) => {
            // A full document replacement establishes a new semantic document
            // generation. Commands that were queued for the previous document
            // may still complete in Rust, but their canonical patches must not
            // be projected into the newer React document. This also makes tab
            // switches, file loads and history restoration safe while IPC work
            // from the previous editor state is still draining.
            const generation = documentGenerationRef.current + 1;
            documentGenerationRef.current = generation;
            const snapshot = editorState || editorStateRef.current;

            return enqueue(async () => {
                if (!isTauri()) return null;
                return replaceNow(snapshot, null);
            }, generation);
        },
        [enqueue, replaceNow]
    );

    const syncInsertedEditorStatesAfterCommit = useCallback(
        (stateIds) =>
            enqueue(async () => {
                if (!isTauri()) return null;

                const requestedIds = Array.from(
                    new Set(
                        (Array.isArray(stateIds) ? stateIds : [stateIds])
                            .map((id) => String(id || "").trim())
                            .filter(Boolean)
                    )
                );
                if (requestedIds.length === 0) return null;

                await waitForEditorCommit();
                const editorState = editorStateRef.current || {};
                const insertedNodes = buildRustEditorNodeSnapshots({
                    ...editorState,
                    stateIds: requestedIds,
                });

                // If normalization removed one of the requested nodes (for
                // example an imported atomic Parallel lane), the insertion is
                // not an isolated semantic add. Fall back to the full structural
                // exporter, which owns lane flattening/promotion semantics.
                if (insertedNodes.length !== requestedIds.length) {
                    return replaceNow(editorState, null);
                }

                return applyCommandNow({
                    type: "insertEditorStates",
                    nodes: insertedNodes,
                });
            }),
        [applyCommandNow, enqueue, replaceNow]
    );


    const syncInsertedParallelLaneStateAfterCommit = useCallback(
        (stateId, laneId) =>
            enqueue(async () => {
                if (!isTauri() || !stateId || !laneId) return null;
                await waitForEditorCommit();

                const editorState = editorStateRef.current || {};
                const currentNodes = editorState.nodes || [];
                const context = buildRustParallelLaneMoveContext({
                    nodes: currentNodes,
                    laneId,
                });
                if (!context) {
                    return replaceNow(editorState, null);
                }

                const [insertedNode] = buildRustEditorNodeSnapshots({
                    ...editorState,
                    stateIds: [stateId],
                });
                if (!insertedNode) {
                    return replaceNow(editorState, null);
                }

                // A visual Parallel lane may be flattened in the semantic
                // workflow. Insert the new state under the nearest semantic
                // owner first; Rust then promotes the lane/wrapper as needed.
                insertedNode.parentId =
                    context.wrapper?.id || context.lane?.parentId || null;

                await applyCommandNow({
                    type: "insertEditorStates",
                    nodes: [insertedNode],
                });

                return applyCommandNow({
                    type: "reconcileParallelLane",
                    context,
                });
            }),
        [applyCommandNow, enqueue, replaceNow]
    );


    const syncWrappedContainerAfterCommit = useCallback(
        (containerId) =>
            enqueue(async () => {
                if (!isTauri() || !containerId) return null;
                await waitForEditorCommit();

                const editorState = editorStateRef.current || {};
                const currentNodes = editorState.nodes || [];
                const containerNode = currentNodes.find(
                    (candidate) => candidate.id === containerId
                );
                if (!containerNode || !["compound", "parallel"].includes(containerNode.type)) {
                    return replaceNow(editorState, null);
                }

                const [container] = buildRustEditorNodeSnapshots({
                    ...editorState,
                    stateIds: [containerId],
                });
                if (!container) {
                    return replaceNow(editorState, null);
                }

                let groups;
                if (containerNode.type === "compound") {
                    groups = [
                        {
                            lane: null,
                            stateIds: currentNodes
                                .filter(
                                    (candidate) =>
                                        candidate.parentId === containerId &&
                                        candidate.type !== "slot" &&
                                        candidate.type !== "parallelLane" &&
                                        !candidate.data?.isSkillClone &&
                                        !candidate.data?.isStateClone
                                )
                                .map((candidate) => candidate.id),
                        },
                    ];
                } else {
                    groups = currentNodes
                        .filter(
                            (candidate) =>
                                candidate.parentId === containerId &&
                                candidate.type === "parallelLane"
                        )
                        .map((lane) => {
                            const laneContext = buildRustParallelLaneMoveContext({
                                nodes: currentNodes,
                                laneId: lane.id,
                            });
                            return laneContext
                                ? {
                                      lane: laneContext,
                                      stateIds: laneContext.memberStateIds || [],
                                  }
                                : null;
                        })
                        .filter(Boolean);
                }

                if (groups.length === 0 || groups.some((group) => group.stateIds.length === 0)) {
                    return replaceNow(editorState, null);
                }

                return applyCommandNow({
                    type: "wrapEditorStates",
                    container,
                    groups,
                });
            }),
        [applyCommandNow, enqueue, replaceNow]
    );

    const syncPastedEditorSubgraphAfterCommit = useCallback(
        (pasteCommand) =>
            enqueue(async () => {
                if (!isTauri() || !pasteCommand) return null;
                await waitForEditorCommit();

                const stateMappings = Array.isArray(pasteCommand.stateMappings)
                    ? pasteCommand.stateMappings
                    : [];
                if (stateMappings.length === 0) return null;

                return applyCommandNow({
                    type: "pasteEditorSubgraph",
                    stateMappings,
                    transitionMappings: Array.isArray(
                        pasteCommand.transitionMappings
                    )
                        ? pasteCommand.transitionMappings
                        : [],
                    positions: Array.isArray(pasteCommand.positions)
                        ? pasteCommand.positions
                        : [],
                });
            }),
        [applyCommandNow, enqueue]
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

                const parentChanged =
                    currentParentId !== (previousParentId || null);

                if (parentChanged) {
                    const previousParentNode = previousParentId
                        ? currentNodes.find(
                            (candidate) => candidate.id === previousParentId
                        )
                        : null;
                    const currentParentNode = currentParentId
                        ? currentNodes.find(
                            (candidate) => candidate.id === currentParentId
                        )
                        : null;

                    const laneIdForParent = (parentNode) => {
                        if (parentNode?.type === "parallelLane") {
                            return parentNode.id;
                        }
                        if (
                            parentNode?.type === "compound" &&
                            parentNode?.data?.autoParallelLaneCompound &&
                            parentNode.parentId
                        ) {
                            return parentNode.parentId;
                        }
                        return null;
                    };
                    const sourceLaneId = laneIdForParent(previousParentNode);
                    const targetLaneId = laneIdForParent(currentParentNode);
                    const sourceLane = sourceLaneId
                        ? buildRustParallelLaneMoveContext({
                            nodes: currentNodes,
                            laneId: sourceLaneId,
                        })
                        : null;
                    const targetLane = targetLaneId
                        ? buildRustParallelLaneMoveContext({
                            nodes: currentNodes,
                            laneId: targetLaneId,
                        })
                        : null;

                    return applyCommandNow({
                        type: "moveEditorState",
                        stateId,
                        parentStateId: currentParentId,
                        sourceLane,
                        targetLane,
                        x: Number(node.position?.x || 0),
                        y: Number(node.position?.y || 0),
                    });
                }

                return applyCommandNow({
                    type: "updateStateEditorPosition",
                    stateId,
                    x: Number(node.position?.x || 0),
                    y: Number(node.position?.y || 0),
                });
            }),
        [applyCommandNow, enqueue, replaceNow]
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
                refreshSlots = false,
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
                let committedEditorState = null;
                const getCommittedEditorState = async () => {
                    if (!committedEditorState) {
                        await waitForEditorCommit();
                        committedEditorState = editorStateRef.current || {};
                    }
                    return committedEditorState;
                };

                if (semanticIds.length > 0) {
                    result = await applyCommandNow({
                        type: "removeStates",
                        stateIds: semanticIds,
                    });
                }

                if (refreshSlots) {
                    const editorState = await getCommittedEditorState();
                    result = await applyCommandNow({
                        type: "replaceSlotsSnapshot",
                        ...buildRustSlotsSnapshot(editorState),
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

                const editorState = await getCommittedEditorState();
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
        [applyCommandNow, enqueue]
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
        documentGenerationRef.current += 1;
        readyRef.current = false;
        revisionRef.current = null;
    }, []);

    return {
        applyWorkflowCommand,
        syncEditorState,
        syncInsertedEditorStatesAfterCommit,
        syncInsertedParallelLaneStateAfterCommit,
        syncWrappedContainerAfterCommit,
        syncPastedEditorSubgraphAfterCommit,
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
