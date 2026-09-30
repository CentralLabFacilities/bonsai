import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    saveScxmlFile,
    saveScxmlFileTauri,
    openScxmlFileTauri,
    readScxmlFileContent,
    generateXmlString,
} from "../utils/scxmlExport";
import { parseScxmlFile } from "../utils/scxmlImport";
import { serializeEditorGraphWithRust } from "../utils/scxmlRustExport";
import { getNodeId } from "../utils/editorGeometry";
import {
    ensureSharedEditorInstanceIds,
    normalizeSharedScxmlStateIdentity,
    prepareGraphForScxml,
} from "../utils/editorScxml";

const showSavedToast = () => {
    if (typeof document === "undefined") return;

    document.querySelectorAll(".bonsai-save-toast").forEach((element) =>
        element.remove()
    );

    const toast = document.createElement("div");
    toast.className = "bonsai-save-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = "Saved!";

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

const requestBrowserFile = async () => {
    if (typeof window === "undefined") return null;

    if ("showOpenFilePicker" in window) {
        const [handle] = await window.showOpenFilePicker({
            types: [
                {
                    description: "XML/SCXML",
                    accept: {
                        "application/xml": [".xml", ".scxml"],
                    },
                },
            ],
            multiple: false,
        });
        const file = await handle.getFile();
        return { file, fileHandle: handle };
    }

    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".scxml,.xml";
        input.style.display = "none";

        const cleanup = () => input.remove();
        input.addEventListener(
            "change",
            () => {
                const file = input.files?.[0] || null;
                cleanup();
                resolve(file ? { file, fileHandle: null } : null);
            },
            { once: true }
        );

        document.body.appendChild(input);
        input.click();

        // Browsers do not consistently dispatch `change` when the picker is
        // cancelled. Remove the temporary input when focus returns and no file
        // was selected; resolving twice is harmless because Promises ignore it.
        window.addEventListener(
            "focus",
            () => {
                window.setTimeout(() => {
                    if (!input.files?.length) {
                        cleanup();
                        resolve(null);
                    }
                }, 0);
            },
            { once: true }
        );
    });
};

/**
 * Owns the file/document lifecycle around the active workflow.
 *
 * The editable graph itself remains in `useEditorGraphState` and tab lifecycle
 * remains in `useWorkflowTabs`. This controller is responsible only for the
 * boundary to persisted SCXML: choose/open a file, parse it, install the
 * document, serialize/save it, and update the active tab's file metadata.
 */
export function useWorkflowDocument({
    isDesktop,
    nodes,
    edges,
    manualSlots,
    globalDataModel,
    activeTab,
    updateActiveTab,
    replaceDocument,
    setSelectedNodeId,
    fetchSkillData,
    hydrateSubMachineInheritedSlots,
    checkSlotConnection,
    fitView,
    onStateMachineLoadStart,
    onStateMachineLoadEnd,
    syncRustDocument,
}) {
    const [saveStatus, setSaveStatus] = useState("idle");
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const saveInFlightRef = useRef(null);

    const hasFilePath = Boolean(isDesktop && activeTab?.filePath);
    const currentFileName = activeTab?.fileName || activeTab?.title || "workflow.xml";

    const applyImportedDocument = useCallback(
        async ({ content, filePath = null, fileName, fileHandle = null }) => {
            const normalizedFileName = fileName || "workflow.xml";
            onStateMachineLoadStart?.(
                String(normalizedFileName).replace(/\.(xml|scxml)$/i, "")
            );
            await new Promise((resolve) =>
                window.requestAnimationFrame(() =>
                    window.requestAnimationFrame(resolve)
                )
            );

            try {
                const parsed = await parseScxmlFile(content, fetchSkillData, getNodeId);
                const parsedNodes = ensureSharedEditorInstanceIds(
                    (await hydrateSubMachineInheritedSlots(parsed.nodes, filePath)).map(
                        normalizeSharedScxmlStateIdentity
                    )
                );
                const nextDocument = {
                    nodes: parsedNodes,
                    edges: parsed.edges,
                    slotNodes: [],
                    slotEdges: [],
                    manualSlots: [],
                    globalDataModel: parsed.globalDataModel,
                    inheritedGlobalDataModel: [],
                };

                replaceDocument(nextDocument);
                void syncRustDocument?.(nextDocument).catch((error) => {
                    console.warn(
                        "Could not synchronize Rust workflow document after import.",
                        error
                    );
                });
                setSelectedNodeId(null);

                const cleanTitle = normalizedFileName.replace(/\.(xml|scxml)$/i, "");
                updateActiveTab({
                    ...nextDocument,
                    title: cleanTitle,
                    fileName: normalizedFileName,
                    fileHandle,
                    filePath: filePath || null,
                    sourcePath: null,
                    selectedNodeId: null,
                    viewport: null,
                });

                checkSlotConnection(
                    parsedNodes,
                    [],
                    parsed.editorSlotNodes || []
                );

                if ((parsed.parameterErrors || []).length > 0) {
                    const visibleErrors = parsed.parameterErrors.slice(0, 10);
                    const lines = visibleErrors.map((error) =>
                        `• ${error.state}.${error.parameter}: ${error.message}`
                    );
                    const remaining =
                        parsed.parameterErrors.length - visibleErrors.length;

                    if (remaining > 0) {
                        lines.push(
                            `• …and ${remaining} more parameter type error${remaining === 1 ? "" : "s"}.`
                        );
                    }

                    alert(
                        `Imported with ${parsed.parameterErrors.length} parameter type error${parsed.parameterErrors.length === 1 ? "" : "s"}:\n\n${lines.join("\n")}\n\nThe workflow was loaded. These errors are also listed under Problems → Parameters.`
                    );
                }

                window.setTimeout(
                    () => fitView({ padding: 0.2, duration: 400 }),
                    150
                );
            } finally {
                onStateMachineLoadEnd?.();
            }
        },
        [
            fetchSkillData,
            hydrateSubMachineInheritedSlots,
            replaceDocument,
            setSelectedNodeId,
            updateActiveTab,
            checkSlotConnection,
            fitView,
            onStateMachineLoadStart,
            onStateMachineLoadEnd,
            syncRustDocument,
        ]
    );

    const handleOpenDocument = useCallback(async () => {
        try {
            if (isDesktop) {
                const filePath = await openScxmlFileTauri();
                if (!filePath) return null;

                const content = await readScxmlFileContent(filePath);
                if (!content) return null;

                const fileName = filePath.split(/[\\/]/).pop() || "workflow.xml";
                await applyImportedDocument({ content, filePath, fileName });
                return filePath;
            }

            const selected = await requestBrowserFile();
            if (!selected?.file) return null;

            const content = await selected.file.text();
            await applyImportedDocument({
                content,
                fileName: selected.file.name,
                fileHandle: selected.fileHandle,
            });
            return selected.file.name;
        } catch (error) {
            if (error?.name === "AbortError") return null;
            console.error("Import error:", error);
            alert(`Import error:\n${error?.message || error}`);
            return null;
        }
    }, [isDesktop, applyImportedDocument]);

    const saveDocument = useCallback(
        async ({ forceSaveAs = false }) => {
            if (saveInFlightRef.current) {
                return saveInFlightRef.current;
            }

            if (nodes.length === 0) {
                alert(
                    forceSaveAs
                        ? "Der Graph ist leer und kann nicht gespeichert werden."
                        : "The graph is empty and cannot be saved."
                );
                return null;
            }

            const operation = (async () => {
                setSaveStatus("saving");

                try {
                    let xml;
                    if (isDesktop) {
                        try {
                            xml = await serializeEditorGraphWithRust({
                                nodes,
                                edges,
                                globalDataModel,
                                manualSlots,
                            });
                        } catch (error) {
                            // Keep a compatibility escape hatch while the Rust
                            // exporter is rolled out. Unsupported snapshots must
                            // never prevent the user from saving the workflow.
                            console.warn(
                                "Rust SCXML serialization failed; using JavaScript fallback.",
                                error
                            );
                            const exportGraph = prepareGraphForScxml(nodes, edges);
                            xml = generateXmlString(
                                exportGraph.nodes,
                                exportGraph.edges,
                                globalDataModel,
                                [],
                                manualSlots
                            );
                        }
                    } else {
                        const exportGraph = prepareGraphForScxml(nodes, edges);
                        xml = generateXmlString(
                            exportGraph.nodes,
                            exportGraph.edges,
                            globalDataModel,
                            [],
                            manualSlots
                        );
                    }

                    const defaultName =
                        activeTab?.fileName ||
                        `${activeTab?.title || "workflow"}.xml`;

                    let result;
                    if (isDesktop) {
                        result = await saveScxmlFileTauri(
                            xml,
                            forceSaveAs ? null : activeTab?.filePath,
                            defaultName
                        );
                        if (result?.success) {
                            const cleanTitle = result.fileName.replace(
                                /\.(xml|scxml)$/i,
                                ""
                            );
                            updateActiveTab({
                                title: cleanTitle,
                                fileName: result.fileName,
                                filePath: result.filePath,
                                nodes,
                                edges,
                                manualSlots,
                                globalDataModel,
                            });
                        }
                    } else {
                        result = await saveScxmlFile(
                            xml,
                            forceSaveAs ? null : activeTab?.fileHandle,
                            defaultName
                        );
                        if (result?.success) {
                            const cleanTitle = result.fileName.replace(
                                /\.(xml|scxml)$/i,
                                ""
                            );
                            updateActiveTab({
                                title: cleanTitle,
                                fileName: result.fileName,
                                fileHandle:
                                    result.handle || activeTab?.fileHandle || null,
                                nodes,
                                edges,
                                manualSlots,
                                globalDataModel,
                            });
                        }
                    }

                    if (result?.success) {
                        const savedAt = Date.now();
                        setLastSavedAt(savedAt);
                        setSaveStatus("saved");
                        showSavedToast();
                        window.setTimeout(() => {
                            setSaveStatus((current) =>
                                current === "saved" ? "idle" : current
                            );
                        }, 1300);
                    } else {
                        setSaveStatus("idle");
                    }

                    return result;
                } catch (error) {
                    console.error("Save error:", error);
                    setSaveStatus("error");
                    alert(`Save error:\n${error?.message || error}`);
                    return null;
                } finally {
                    saveInFlightRef.current = null;
                }
            })();

            saveInFlightRef.current = operation;
            return operation;
        },
        [
            nodes,
            edges,
            manualSlots,
            globalDataModel,
            activeTab,
            isDesktop,
            updateActiveTab,
        ]
    );

    const handleSaveCurrentTab = useCallback(
        () => saveDocument({ forceSaveAs: false }),
        [saveDocument]
    );
    const handleSaveAsCurrentTab = useCallback(
        () => saveDocument({ forceSaveAs: true }),
        [saveDocument]
    );

    // File persistence shortcuts belong to the document lifecycle. Keeping
    // Ctrl+S here means App.jsx does not need to know which backend/file handle
    // is active or how Save differs from Save As.
    useEffect(() => {
        const handleSaveShortcut = (event) => {
            const hasModifier = event.ctrlKey || event.metaKey;
            const key = String(event.key || "").toLowerCase();
            if (!hasModifier || event.altKey || key !== "s") return;

            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
                void handleSaveAsCurrentTab();
            } else {
                void handleSaveCurrentTab();
            }
        };

        window.addEventListener("keydown", handleSaveShortcut, true);
        return () =>
            window.removeEventListener("keydown", handleSaveShortcut, true);
    }, [handleSaveCurrentTab, handleSaveAsCurrentTab]);

    const documentInfo = useMemo(
        () => ({
            fileName: currentFileName,
            filePath: activeTab?.filePath || null,
            hasFilePath,
            saveStatus,
            isSaving: saveStatus === "saving",
            lastSavedAt,
        }),
        [
            currentFileName,
            activeTab?.filePath,
            hasFilePath,
            saveStatus,
            lastSavedAt,
        ]
    );

    return {
        ...documentInfo,
        handleOpenDocument,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
    };
}
