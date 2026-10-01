import { useCallback, useRef } from "react";
import {
    applyWorkflowCommand as applyWorkflowCommandTauri,
    isTauri,
    replaceActiveEditorWorkflowDocument,
} from "../tauri-client";
import { buildRustEditorExportRequest } from "../utils/scxmlRustExport";
import { buildRustTransitionSyncPlan } from "../utils/rustTransitionSync";

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
                return result;
            } catch (error) {
                return resyncFromEditor(error);
            }
        },
        [replaceNow, resyncFromEditor]
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
                const requiresSemanticRebuild =
                    isReference ||
                    node.type === "parallelLane" ||
                    currentParentId !== (previousParentId || null);

                if (requiresSemanticRebuild) {
                    return replaceNow(editorStateRef.current, null);
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

    const syncRemovedStates = useCallback(
        (stateIds, { forceFull = false } = {}) =>
            enqueue(async () => {
                if (!isTauri()) return null;
                const ids = Array.from(
                    new Set(
                        (Array.isArray(stateIds) ? stateIds : [stateIds])
                            .map((id) => String(id || "").trim())
                            .filter(Boolean)
                    )
                );
                if (ids.length === 0) return null;

                if (forceFull) {
                    await waitForEditorCommit();
                    return replaceNow(editorStateRef.current, null);
                }

                return applyCommandNow({
                    type: "removeStates",
                    stateIds: ids,
                });
            }),
        [applyCommandNow, enqueue, replaceNow]
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
                // rules. Until that ownership becomes a Rust editor command of
                // its own, resync those complex cases atomically.
                if (plans.some((plan) => plan?.mode === "full")) {
                    return replaceNow(editorState, null);
                }

                let result = null;
                for (const plan of plans) {
                    if (plan?.mode !== "command" || !plan.command) continue;
                    result = await applyCommandNow(plan.command);
                }
                return result;
            }),
        [applyCommandNow, enqueue, replaceNow]
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
        syncStatePosition,
        syncRemovedStates,
        syncTransitionsForSource,
        syncTransitionSources,
        invalidate,
        getRevision: () => revisionRef.current,
    };
}
