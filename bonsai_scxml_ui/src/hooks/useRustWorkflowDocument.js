import { useCallback, useRef } from "react";
import {
    applyWorkflowCommand as applyWorkflowCommandTauri,
    isTauri,
    replaceActiveEditorWorkflowDocument,
} from "../tauri-client";
import { buildRustEditorExportRequest } from "../utils/scxmlRustExport";

const isRevisionConflict = (error) =>
    String(error?.message || error || "")
        .toLowerCase()
        .includes("revision conflict");

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

    const syncEditorState = useCallback(
        (editorState = null) =>
            enqueue(async () => {
                if (!isTauri()) return null;
                return replaceNow(editorState || editorStateRef.current, null);
            }),
        [enqueue, replaceNow]
    );

    const applyWorkflowCommand = useCallback(
        (command) =>
            enqueue(async () => {
                if (!isTauri() || !command) return null;

                // The first semantic edit of a new/blank tab establishes a
                // graph-ID-based Rust document before applying the command.
                // This also normalizes imported workflows whose parser IDs are
                // intentionally independent from React Flow node IDs.
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
                    // Save/import may legitimately advance the backend revision
                    // outside this bridge. The editor already contains the
                    // user's local mutation, so a full semantic resync is the
                    // safest recovery and avoids replaying the command twice.
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

                    // Let React commit the optimistic local mutation before
                    // rebuilding the backend document from the live editor.
                    await new Promise((resolve) => {
                        if (typeof window === "undefined") {
                            resolve();
                            return;
                        }
                        window.requestAnimationFrame(() => resolve());
                    });
                    return replaceNow(editorStateRef.current, null);
                }
            }),
        [enqueue, replaceNow]
    );

    const invalidate = useCallback(() => {
        readyRef.current = false;
        revisionRef.current = null;
    }, []);

    return {
        applyWorkflowCommand,
        syncEditorState,
        invalidate,
        getRevision: () => revisionRef.current,
    };
}
