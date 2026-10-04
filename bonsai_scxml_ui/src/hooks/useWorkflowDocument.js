import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri, openFile, saveFile } from "../tauri-client";
import {
    getWorkflowFileKey,
    inspectWorkflowForEditorSource,
    projectWorkflowInspectionForEditor,
} from "../utils/workflowLoader";
import { serializeEditorGraphWithRust } from "../utils/scxmlRustExport";
import { getNodeId } from "../utils/editorGeometry";
import {
    ensureSharedEditorInstanceIds,
    normalizeSharedScxmlStateIdentity,
} from "../utils/editorScxml";
import { isDocumentGuardOpen } from "./useGlobalEditorShortcuts.js";

const showSavedToast = (fileName, newerChanges) => {
    if (typeof document === "undefined") return;
    document.querySelectorAll(".bonsai-save-toast").forEach((element) => element.remove());
    const toast = document.createElement("div");
    toast.className = "bonsai-save-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = `Saved ${fileName}${newerChanges ? "; newer changes remain unsaved" : ""}`;
    Object.assign(toast.style, {
        position: "fixed",
        left: "50%",
        bottom: "28px",
        zIndex: "10000",
        transform: "translate(-50%, 8px)",
        padding: "7px 14px",
        border: "1px solid rgba(34, 197, 94, 0.45)",
        borderRadius: "7px",
        background: "#0f172a",
        color: "#86efac",
        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.28)",
        fontSize: "12px",
        fontWeight: "700",
        opacity: "0",
        pointerEvents: "none",
        transition: "opacity 140ms ease, transform 140ms ease",
    });
    document.body.appendChild(toast);
    window.requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translate(-50%, 0)";
    });
    window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%, 8px)";
        window.setTimeout(() => toast.remove(), 160);
    }, 1200);
};

const checkpoint = (snapshot) =>
    snapshot
        ? {
              tabId: snapshot.id,
              generation: snapshot.documentGeneration,
              fingerprint: snapshot.fingerprint,
          }
        : null;

const matchesCheckpoint = (snapshot, ticket) =>
    Boolean(
        snapshot &&
        ticket &&
        snapshot.id === ticket.tabId &&
        snapshot.documentGeneration === ticket.generation &&
        snapshot.fingerprint === ticket.fingerprint,
    );

export function useWorkflowDocument({
    isDesktop,
    activeTab,
    getTabSnapshot,
    getTabsSnapshot,
    updateTab,
    replaceTabDocument,
    closeTab,
    fetchSkillData,
    hydrateSubMachineInheritedSlots,
    checkSlotConnection,
    onStateMachineLoadStart,
    onStateMachineLoadEnd,
}) {
    const [saveStatus, setSaveStatus] = useState("idle");
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [pendingGuard, setPendingGuard] = useState(null);
    const guardRef = useRef(null);
    const savesRef = useRef(new Map());
    const saveQueueRef = useRef(Promise.resolve());
    const closesRef = useRef(new Map());
    const openRef = useRef(null);
    const windowClosingRef = useRef(false);
    const windowCloseApprovedRef = useRef(false);

    const saveDocument = useCallback(
        ({ tabId, forceSaveAs = false } = {}) => {
            const snapshot = getTabSnapshot(tabId);
            if (!snapshot) return Promise.resolve(null);
            const operationKey = `${snapshot.id}:${snapshot.documentGeneration}`;
            if (savesRef.current.has(operationKey)) return savesRef.current.get(operationKey);

            setSaveStatus("saving");
            // Publish the promise before serialization or native I/O can finish.
            const operation = saveQueueRef.current
                .then(async () => {
                    try {
                        if (!isDesktop)
                            throw new Error(
                                "Saving SCXML requires the Rust/Tauri desktop backend.",
                            );
                        const xml = await serializeEditorGraphWithRust(snapshot);
                        if (
                            getTabSnapshot(snapshot.id)?.documentGeneration !==
                            snapshot.documentGeneration
                        ) {
                            setSaveStatus("idle");
                            return {
                                success: false,
                                ...checkpoint(snapshot),
                                error: "The original workflow was closed or replaced before saving completed.",
                            };
                        }
                        const defaultName =
                            snapshot.fileName || `${snapshot.title || "workflow"}.xml`;
                        const saved = await saveFile(
                            xml,
                            forceSaveAs ? null : snapshot.filePath,
                            defaultName,
                        );
                        const result = {
                            success: Boolean(saved?.success),
                            fileName: saved?.file_name || defaultName,
                            filePath: saved?.path || null,
                            ...checkpoint(snapshot),
                        };
                        if (!result.success) {
                            setSaveStatus("idle");
                            return result;
                        }

                        // A tab can be edited, switched, closed or replaced during I/O.
                        // Never restore the captured graph or rename another document.
                        updateTab(snapshot.id, (current) =>
                            current.documentGeneration === snapshot.documentGeneration
                                ? {
                                      title: result.fileName.replace(/\.(xml|scxml)$/i, ""),
                                      fileName: result.fileName,
                                      filePath: result.filePath,
                                      savedFingerprint: snapshot.fingerprint,
                                      ...(current.filePath &&
                                      getWorkflowFileKey(current.filePath) !==
                                          getWorkflowFileKey(result.filePath)
                                          ? {
                                                sourcePath: null,
                                                parentTabId: null,
                                                inheritedGlobalDataModel: [],
                                            }
                                          : {}),
                                  }
                                : null,
                        );
                        const current = getTabSnapshot(snapshot.id);
                        result.isCurrent = matchesCheckpoint(current, result);
                        setLastSavedAt(Date.now());
                        setSaveStatus("saved");
                        showSavedToast(
                            result.fileName,
                            current?.documentGeneration === snapshot.documentGeneration &&
                                current.isModified,
                        );
                        return result;
                    } catch (error) {
                        console.error("Save error:", error);
                        setSaveStatus("error");
                        if (!guardRef.current) alert(`Save error:\n${error?.message || error}`);
                        return {
                            success: false,
                            error: error?.message || String(error),
                            ...checkpoint(snapshot),
                        };
                    }
                })
                .finally(() => {
                    savesRef.current.delete(operationKey);
                    if (savesRef.current.size > 0) setSaveStatus("saving");
                });
            savesRef.current.set(operationKey, operation);
            // Keep older native writes ahead of newer saves, even after a tab
            // is closed/reopened or replaced with another document generation.
            saveQueueRef.current = operation.catch(() => null);
            return operation;
        },
        [isDesktop, getTabSnapshot, updateTab],
    );

    const finishGuard = useCallback((ticket) => {
        const guard = guardRef.current;
        guardRef.current = null;
        setPendingGuard(null);
        guard?.resolve(ticket);
    }, []);

    const confirmUnsaved = useCallback(
        (tabId, action) => {
            const snapshot = getTabSnapshot(tabId);
            if (!snapshot) return Promise.resolve(null);
            if (!snapshot.isModified) return Promise.resolve(checkpoint(snapshot));
            if (guardRef.current) return Promise.resolve(null);
            return new Promise((resolve) => {
                const guard = {
                    tabId,
                    action,
                    title: snapshot.title || snapshot.fileName || "Workflow",
                    generation: snapshot.documentGeneration,
                    busy: false,
                    error: null,
                    resolve,
                };
                guardRef.current = guard;
                setPendingGuard({ ...guard });
            });
        },
        [getTabSnapshot],
    );

    const resolveGuard = useCallback(
        async (choice) => {
            const guard = guardRef.current;
            if (!guard || guard.busy) return;
            const snapshot = getTabSnapshot(guard.tabId);
            if (
                choice === "cancel" ||
                !snapshot ||
                snapshot.documentGeneration !== guard.generation
            ) {
                finishGuard(null);
                return;
            }
            if (choice === "discard") {
                finishGuard(checkpoint(snapshot));
                return;
            }
            if (choice !== "save") return;

            guard.busy = true;
            setPendingGuard({ ...guard, error: null });
            const result = await saveDocument({ tabId: guard.tabId });
            if (guardRef.current !== guard) return;
            const current = getTabSnapshot(guard.tabId);
            if (result?.success && matchesCheckpoint(current, result)) {
                finishGuard(checkpoint(current));
            } else {
                guard.busy = false;
                guard.error = result?.success
                    ? "The workflow changed while saving. Save again to keep the newer changes, or cancel."
                    : result?.error ||
                      "The save was cancelled or could not complete. Your workflow is still open.";
                setPendingGuard({ ...guard });
            }
        },
        [getTabSnapshot, saveDocument, finishGuard],
    );

    const handleCloseTab = useCallback(
        (tabId, event = null) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            if (closesRef.current.has(tabId)) return closesRef.current.get(tabId);
            const operation = Promise.resolve()
                .then(async () => {
                    if (getTabsSnapshot().length <= 1) return false;
                    while (getTabSnapshot(tabId)) {
                        const ticket = await confirmUnsaved(tabId, "close");
                        if (!ticket) return false;
                        if (matchesCheckpoint(getTabSnapshot(tabId), ticket))
                            return closeTab(tabId);
                    }
                    return false;
                })
                .finally(() => closesRef.current.delete(tabId));
            closesRef.current.set(tabId, operation);
            return operation;
        },
        [getTabSnapshot, getTabsSnapshot, confirmUnsaved, closeTab],
    );

    const handleTabMiddleMouseDown = useCallback(
        (event, tabId) => {
            if (event.button === 1) void handleCloseTab(tabId, event);
        },
        [handleCloseTab],
    );

    const prepareImportedDocument = useCallback(
        async ({ inspection, filePath, fileName }) => {
            onStateMachineLoadStart?.(String(fileName).replace(/\.(xml|scxml)$/i, ""));
            await new Promise((resolve) =>
                window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
            );
            try {
                if (!inspection.workflow)
                    throw new Error("The backend did not return an inspected workflow.");
                const parsed = await projectWorkflowInspectionForEditor(inspection, {
                    fetchSkillData,
                    getNodeId,
                });
                const parsedNodes = ensureSharedEditorInstanceIds(
                    (await hydrateSubMachineInheritedSlots(parsed.nodes, filePath)).map(
                        normalizeSharedScxmlStateIdentity,
                    ),
                );
                return {
                    document: {
                        nodes: parsedNodes,
                        edges: parsed.edges,
                        slotNodes: [],
                        slotEdges: [],
                        manualSlots: [],
                        globalDataModel: parsed.globalDataModel,
                        inheritedGlobalDataModel: [],
                    },
                    editorSlotNodes: parsed.editorSlotNodes || [],
                    parameterErrors: parsed.parameterErrors || [],
                };
            } finally {
                onStateMachineLoadEnd?.();
            }
        },
        [
            fetchSkillData,
            hydrateSubMachineInheritedSlots,
            onStateMachineLoadStart,
            onStateMachineLoadEnd,
        ],
    );

    const handleOpenDocument = useCallback(() => {
        if (openRef.current) return openRef.current;
        const target = getTabSnapshot();
        if (!target || guardRef.current) return Promise.resolve(null);
        const operation = Promise.resolve()
            .then(async () => {
                try {
                    if (!isDesktop)
                        throw new Error("Opening SCXML requires the Rust/Tauri desktop backend.");
                    const filePath = await openFile();
                    if (!filePath) return null;
                    const fileName = filePath.split(/[\\/]/).pop() || "workflow.xml";
                    let imported;
                    while (true) {
                        const original = getTabSnapshot(target.id);
                        if (!original || original.documentGeneration !== target.documentGeneration)
                            return null;
                        const ticket = await confirmUnsaved(target.id, "replace");
                        if (!ticket) return null;
                        // Save may have rewritten the selected file, including
                        // through Save As. Never install a pre-approval image.
                        const inspection = await inspectWorkflowForEditorSource({ src: filePath });
                        imported = await prepareImportedDocument({
                            inspection,
                            filePath,
                            fileName,
                        });
                        const current = getTabSnapshot(target.id);
                        if (!current || current.documentGeneration !== target.documentGeneration)
                            return null;
                        if (matchesCheckpoint(current, ticket)) break;
                        // Reinspect after renewed approval if edits were made
                        // during parsing/hydration; another Save can change disk.
                    }
                    const installed = replaceTabDocument(target.id, imported.document, {
                        title: fileName.replace(/\.(xml|scxml)$/i, ""),
                        fileName,
                        filePath,
                        fileHandle: null,
                        sourcePath: null,
                        parentTabId: null,
                        selectedNodeId: null,
                        viewport: null,
                    });
                    if (!installed) return null;
                    if (getTabSnapshot()?.id === target.id) {
                        checkSlotConnection(imported.document.nodes, [], imported.editorSlotNodes);
                    }
                    if (imported.parameterErrors.length > 0) {
                        const lines = imported.parameterErrors
                            .slice(0, 10)
                            .map((error) => `${error.state}.${error.parameter}: ${error.message}`);
                        alert(
                            `Imported with ${imported.parameterErrors.length} parameter type errors:\n\n${lines.join("\n")}\n\nThese are also listed under Problems / Parameters.`,
                        );
                    }
                    return filePath;
                } catch (error) {
                    if (error?.name !== "AbortError") {
                        console.error("Import error:", error);
                        alert(`Import error:\n${error?.message || error}`);
                    }
                    return null;
                }
            })
            .finally(() => {
                openRef.current = null;
            });
        openRef.current = operation;
        return operation;
    }, [
        isDesktop,
        getTabSnapshot,
        confirmUnsaved,
        prepareImportedDocument,
        replaceTabDocument,
        checkSlotConnection,
    ]);

    const handleSaveCurrentTab = useCallback(() => saveDocument(), [saveDocument]);
    const handleSaveAsCurrentTab = useCallback(
        () => saveDocument({ forceSaveAs: true }),
        [saveDocument],
    );

    useEffect(() => {
        const handleSaveShortcut = (event) => {
            if (isDocumentGuardOpen()) return;
            if (
                !(event.ctrlKey || event.metaKey) ||
                event.altKey ||
                String(event.key || "").toLowerCase() !== "s"
            )
                return;
            event.preventDefault();
            event.stopPropagation();
            void saveDocument({ forceSaveAs: event.shiftKey });
        };
        const handleBeforeUnload = (event) => {
            if (
                windowCloseApprovedRef.current &&
                getTabsSnapshot().every((tab) =>
                    matchesCheckpoint(tab, windowCloseApprovedRef.current.get(tab.id)),
                )
            )
                return;
            if (!getTabsSnapshot().some((tab) => tab.isModified)) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("keydown", handleSaveShortcut, true);
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            window.removeEventListener("keydown", handleSaveShortcut, true);
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [saveDocument, getTabsSnapshot]);

    useEffect(() => {
        if (!isDesktop || !isTauri()) return;
        let disposed = false;
        let unlisten;
        void getCurrentWindow()
            .onCloseRequested(async (event) => {
                if (disposed || windowClosingRef.current) {
                    event.preventDefault();
                    return;
                }
                windowClosingRef.current = true;
                windowCloseApprovedRef.current = false;
                try {
                    const approvals = new Map();
                    while (!disposed) {
                        const changed = getTabsSnapshot().find(
                            (tab) => !matchesCheckpoint(tab, approvals.get(tab.id)),
                        );
                        if (!changed) {
                            windowCloseApprovedRef.current = approvals;
                            window.setTimeout(() => {
                                windowCloseApprovedRef.current = false;
                            }, 1000);
                            return;
                        }
                        const ticket = await confirmUnsaved(changed.id, "close");
                        if (!ticket) {
                            event.preventDefault();
                            return;
                        }
                        approvals.set(changed.id, ticket);
                    }
                    event.preventDefault();
                } catch (error) {
                    event.preventDefault();
                    console.error("Could not safely close the application:", error);
                } finally {
                    windowClosingRef.current = false;
                }
            })
            .then((stopListening) => {
                if (disposed) stopListening();
                else unlisten = stopListening;
            })
            .catch((error) =>
                console.error("Could not register document close protection:", error),
            );
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [isDesktop, getTabsSnapshot, confirmUnsaved]);

    useEffect(() => () => guardRef.current?.resolve(null), []);

    const documentInfo = useMemo(
        () => ({
            fileName: activeTab?.fileName || activeTab?.title || "workflow.xml",
            filePath: activeTab?.filePath || null,
            hasFilePath: Boolean(isDesktop && activeTab?.filePath),
            saveStatus,
            isSaving: saveStatus === "saving",
            lastSavedAt,
        }),
        [
            activeTab?.fileName,
            activeTab?.title,
            activeTab?.filePath,
            isDesktop,
            saveStatus,
            lastSavedAt,
        ],
    );

    return {
        ...documentInfo,
        documentGuard: pendingGuard ? { ...pendingGuard, onResolve: resolveGuard } : null,
        handleOpenDocument,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
        handleCloseTab,
        handleTabMiddleMouseDown,
    };
}
