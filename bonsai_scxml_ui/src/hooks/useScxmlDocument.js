import { useCallback } from "react";
import {
    saveScxmlFile,
    saveScxmlFileTauri,
    openScxmlFileTauri,
    readScxmlFileContent,
    generateXmlString,
} from "../utils/scxmlExport";
import { parseScxmlFile } from "../utils/scxmlImport";
import { getNodeId } from "../utils/editorGeometry";
import {
    ensureSharedEditorInstanceIds,
    normalizeSharedScxmlStateIdentity,
    prepareGraphForScxml,
} from "../utils/editorScxml";

export function useScxmlDocument({
    isDesktop,
    nodes,
    edges,
    globalDataModel,
    tabs,
    setTabs,
    activeTabId,
    setGlobalDataModel,
    setNodes,
    setEdges,
    setManualSlots,
    setSelectedNodeId,
    fetchSkillData,
    hydrateSubMachineInheritedSlots,
    checkSlotConnection,
    fitView,
    onStateMachineLoadStart,
    onStateMachineLoadEnd,
}) {
    const applyImportedDocument = useCallback(
        async ({ content, filePath = null, fileName, fileHandle = null }) => {
            onStateMachineLoadStart?.(
                String(fileName || "State machine").replace(/\.(xml|scxml)$/i, "")
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

                setGlobalDataModel(parsed.globalDataModel);
                setNodes(parsedNodes);
                setEdges(parsed.edges);
                setManualSlots([]);
                setSelectedNodeId(null);

                const cleanTitle = fileName.replace(/\.(xml|scxml)$/i, "");
                setTabs((previousTabs) =>
                    previousTabs.map((tab) =>
                        tab.id === activeTabId
                            ? {
                                ...tab,
                                title: cleanTitle,
                                fileName,
                                fileHandle,
                                ...(filePath ? { filePath } : {}),
                            }
                            : tab
                    )
                );

                checkSlotConnection(parsedNodes);
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
            setGlobalDataModel,
            setNodes,
            setEdges,
            setManualSlots,
            setSelectedNodeId,
            setTabs,
            activeTabId,
            checkSlotConnection,
            fitView,
            onStateMachineLoadStart,
            onStateMachineLoadEnd,
        ]
    );

    const handleImportFile = useCallback(
        async (event) => {
            if (isDesktop && event?.fromDesktop) {
                try {
                    const filePath = await openScxmlFileTauri();
                    if (!filePath) return;
                    const content = await readScxmlFileContent(filePath);
                    if (!content) return;

                    const fileName = filePath.split(/[\\/]/).pop();
                    await applyImportedDocument({ content, filePath, fileName });
                } catch (error) {
                    console.error("Import error:", error);
                    alert("Fehler beim Import:\n" + error.message);
                }
                return;
            }

            const file = event.target.files[0];
            if (!file) return;
            const fileHandle = event.fileHandle || null;

            const reader = new FileReader();
            reader.onload = async (readerEvent) => {
                try {
                    await applyImportedDocument({
                        content: readerEvent.target.result,
                        fileName: file.name,
                        fileHandle,
                    });
                } catch (error) {
                    alert("Import error:\n" + error.message);
                }
            };
            reader.readAsText(file);
        },
        [isDesktop, applyImportedDocument]
    );

    const saveDocument = useCallback(
        async ({ forceSaveAs = false }) => {
            if (nodes.length === 0) {
                alert(
                    forceSaveAs
                        ? "Der Graph ist leer und kann nicht gespeichert werden."
                        : "The graph is empty and cannot be saved."
                );
                return;
            }

            const currentActiveTab = tabs.find((tab) => tab.id === activeTabId);
            const exportGraph = prepareGraphForScxml(nodes, edges);
            const xml = generateXmlString(
                exportGraph.nodes,
                exportGraph.edges,
                globalDataModel
            );
            const defaultName =
                currentActiveTab?.fileName ||
                `${currentActiveTab?.title || "workflow"}.xml`;

            let result;
            if (isDesktop) {
                result = await saveScxmlFileTauri(
                    xml,
                    forceSaveAs ? null : currentActiveTab?.filePath,
                    defaultName
                );
                if (result?.success) {
                    const cleanTitle = result.fileName.replace(/\.(xml|scxml)$/i, "");
                    setTabs((previousTabs) =>
                        previousTabs.map((tab) =>
                            tab.id === activeTabId
                                ? {
                                    ...tab,
                                    title: cleanTitle,
                                    fileName: result.fileName,
                                    filePath: result.filePath,
                                }
                                : tab
                        )
                    );
                }
            } else {
                result = await saveScxmlFile(
                    xml,
                    forceSaveAs ? null : currentActiveTab?.fileHandle,
                    defaultName
                );
                if (result?.success) {
                    const cleanTitle = result.fileName.replace(/\.(xml|scxml)$/i, "");
                    setTabs((previousTabs) =>
                        previousTabs.map((tab) =>
                            tab.id === activeTabId
                                ? {
                                    ...tab,
                                    title: cleanTitle,
                                    fileName: result.fileName,
                                    fileHandle: result.handle || tab.fileHandle,
                                }
                                : tab
                        )
                    );
                }
            }

            return result;
        },
        [
            nodes,
            edges,
            globalDataModel,
            tabs,
            activeTabId,
            isDesktop,
            setTabs,
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

    return {
        handleImportFile,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
    };
}
