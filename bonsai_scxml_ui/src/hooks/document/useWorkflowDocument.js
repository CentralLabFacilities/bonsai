import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri, openFile, saveFile } from "../../tauri-client";
import {
    getWorkflowFileKey,
    inspectWorkflowForEditorSource,
    projectWorkflowInspectionForEditor,
} from "../../utils/workflowLoader";
import { serializeEditorGraphWithRust } from "../../utils/scxmlRustExport";
import { getNodeId } from "../../utils/editorGeometry";
import {
    ensureSharedEditorInstanceIds,
    normalizeSharedScxmlStateIdentity,
} from "../../utils/editorScxml";
import { isEditorModalOpen } from "../interaction/useGlobalEditorShortcuts.js";
import { useFeedback } from "../../components/ui/index.js";

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
    const { notify } = useFeedback();
    const [saveStatus, setSaveStatus] = useState("idle");
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [isOpening, setIsOpening] = useState(false);
    const [documentNotice, setDocumentNotice] = useState(null);
    const [pendingGuard, setPendingGuard] = useState(null);
    const guardRef = useRef(null);
    const savesRef = useRef(new Map());
    const saveQueueRef = useRef(Promise.resolve());
    const closesRef = useRef(new Map());
    const openRef = useRef(null);
    const windowClosingRef = useRef(false);
    const windowCloseApprovedRef = useRef(false);

    const clearOperationNotice = useCallback((action, snapshot) => {
        setDocumentNotice((notice) => notice?.action === action &&
            notice.tabId === snapshot.id && notice.generation === snapshot.documentGeneration
            ? null : notice);
    }, []);

    const saveDocument = useCallback(
        ({ tabId, forceSaveAs = false } = {}) => {
            const snapshot = getTabSnapshot(tabId);
            if (!snapshot) return Promise.resolve(null);
            const operationKey = `${snapshot.id}:${snapshot.documentGeneration}`;
            if (savesRef.current.has(operationKey)) return savesRef.current.get(operationKey);

            clearOperationNotice("save", snapshot);
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
                            throw new Error("The original workflow was closed or replaced before saving completed. No file was written.");
                        }
                        const defaultName =
                            snapshot.fileName || `${snapshot.title || "workflow"}.xml`;
                        const saved = await saveFile(
                            xml,
                            forceSaveAs ? null : snapshot.filePath,
                            defaultName,
                        );
                        if (saved?.success !== true && saved?.success !== false) {
                            throw new Error("The desktop backend did not report a save result.");
                        }
                        if (saved.success && (typeof saved.path !== "string" || !saved.path)) {
                            throw new Error("The desktop backend did not report the saved file path.");
                        }
                        const result = {
                            success: Boolean(saved?.success),
                            fileName: saved?.file_name || defaultName,
                            filePath: saved?.path || null,
                            ...checkpoint(snapshot),
                        };
                        if (!result.success) {
                            setSaveStatus("idle");
                            return { ...result, cancelled: true };
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
                        clearOperationNotice("save", snapshot);
                        const newerChangesRemain =
                            current?.documentGeneration === snapshot.documentGeneration &&
                            current.isModified;
                        notify({
                            id: "workflow-save",
                            tone: "success",
                            title: "Workflow saved",
                            message: newerChangesRemain
                                ? `${result.fileName} was saved, but newer changes remain unsaved.`
                                : `${result.fileName} saved successfully.`,
                            duration: newerChangesRemain ? 5200 : 2600,
                        });
                        return result;
                    } catch (error) {
                        console.error("Save error:", error);
                        setSaveStatus("error");
                        const message = String(error?.message || error || "The save did not complete.");
                        if (!guardRef.current) {
                            setDocumentNotice({
                                action: "save",
                                title: `Could not save ${snapshot.fileName || snapshot.title || "workflow"}`,
                                message,
                                tabId: snapshot.id,
                                generation: snapshot.documentGeneration,
                                forceSaveAs,
                            });
                        }
                        return {
                            success: false,
                            error: message,
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
        [isDesktop, getTabSnapshot, updateTab, clearOperationNotice, notify],
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
                     status: null,
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
            guard.error = null;
            guard.status = null;
            setPendingGuard({ ...guard });
            const result = await saveDocument({ tabId: guard.tabId });
            if (guardRef.current !== guard) return;
            const current = getTabSnapshot(guard.tabId);
            if (result?.success && matchesCheckpoint(current, result)) {
                finishGuard(checkpoint(current));
            } else {
                guard.busy = false;
                guard.status = result?.cancelled
                    ? "Save cancelled. Your unsaved workflow is still open."
                    : null;
                guard.error = result?.cancelled ? null : result?.success
                    ? "The workflow changed while saving. Save again to keep the newer changes, or cancel."
                    : result?.error ||
                      "The save could not complete. Your workflow is still open.";
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

    const handleOpenDocument = useCallback(({ tabId, filePath: requestedPath = null } = {}) => {
        if (openRef.current) return openRef.current;
        const target = getTabSnapshot(tabId);
        if (!target || guardRef.current) return Promise.resolve(null);
        clearOperationNotice("open", target);
        setIsOpening(true);
        let filePath = requestedPath;
        const operation = Promise.resolve()
            .then(async () => {
                try {
                    if (!isDesktop)
                        throw new Error("Opening SCXML requires the Rust/Tauri desktop backend.");
                    filePath = requestedPath || await openFile();
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
                        const count = imported.parameterErrors.length;
                        notify({
                            id: "workflow-open-parameter-errors",
                            tone: "warning",
                            title: "Opened with parameter type errors",
                            message: `${count} parameter ${count === 1 ? "value has" : "values have"} an invalid type. Review Problems > Parameters before saving.`,
                            duration: 8000,
                        });
                    }
                    return filePath;
                } catch (error) {
                    if (error?.name !== "AbortError") {
                        console.error("Import error:", error);
                        setDocumentNotice({
                            action: "open",
                            title: `Could not finish opening ${filePath?.split(/[\\/]/).pop() || "workflow"}`,
                            message: String(error?.message || error || "The file could not be opened."),
                            tabId: target.id,
                            generation: target.documentGeneration,
                            filePath,
                        });
                    }
                    return null;
                }
            })
            .finally(() => {
                openRef.current = null;
                setIsOpening(false);
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
        clearOperationNotice,
        notify,
    ]);

    const dismissDocumentNotice = useCallback(() => setDocumentNotice(null), []);
    const handleRetryDocumentAction = useCallback(({ forceSaveAs } = {}) => {
        if (!documentNotice || guardRef.current || openRef.current || savesRef.current.size > 0)
            return Promise.resolve(null);
        const origin = getTabSnapshot(documentNotice.tabId);
        if (!origin || origin.documentGeneration !== documentNotice.generation)
            return Promise.resolve(null);
        // Retry belongs to the failed operation's document, not the active tab.
        return documentNotice.action === "save"
            ? saveDocument({ tabId: origin.id, forceSaveAs: forceSaveAs ?? documentNotice.forceSaveAs })
            : handleOpenDocument({ tabId: origin.id, filePath: documentNotice.filePath });
    }, [documentNotice, getTabSnapshot, saveDocument, handleOpenDocument]);

    const handleSaveCurrentTab = useCallback(() => saveDocument(), [saveDocument]);
    const handleSaveAsCurrentTab = useCallback(
        () => saveDocument({ forceSaveAs: true }),
        [saveDocument],
    );

    useEffect(() => {
        const handleSaveShortcut = (event) => {
            if (event.defaultPrevented || isEditorModalOpen()) return;
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

    const noticeOrigin = documentNotice && getTabSnapshot(documentNotice.tabId);

    return {
        ...documentInfo,
        isOpening,
        documentNotice: documentNotice ? {
            ...documentNotice,
            canRetry: Boolean(isDesktop && noticeOrigin && noticeOrigin.documentGeneration === documentNotice.generation),
            desktopRequired: !isDesktop,
            busy: saveStatus === "saving" || isOpening || Boolean(pendingGuard),
        } : null,
        dismissDocumentNotice,
        handleRetryDocumentAction,
        documentGuard: pendingGuard ? { ...pendingGuard, onResolve: resolveGuard } : null,
        handleOpenDocument,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
        handleCloseTab,
        handleTabMiddleMouseDown,
    };
}
