import { useCallback, useRef } from "react";
import { parseScxmlFile, extractBehaviorExitEventsFromScxml } from "../utils/scxmlImport";
import { DEFAULT_PREFIX_CONFIG, resolveSrcPath } from "../config/prefixMapping";
import { isTauri, readWorkflowSource, saveFile } from "../tauri-client.js";
import {
    extractInheritedSlotsFromScxml,
    collectInheritedSlotUsages,
} from "../utils/editorGraph";
import { getNodeId } from "../utils/editorGeometry";
import {
    getLocalDataModelEntries,
    ensureSharedEditorInstanceIds,
    normalizeSharedScxmlStateIdentity,
    prepareGraphForScxml,
} from "../utils/editorScxml";
import { generateXmlString } from "../utils/scxmlExport";

const IS_DESKTOP = isTauri();

const normalizeFsPath = (value) =>
    String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");

const joinFsPath = (directory, fileName) => {
    const dir = normalizeFsPath(directory);
    return dir ? `${dir}/${fileName}` : fileName;
};

const getSymbolicBehaviorSource = (filePath, behaviorDirectories = []) => {
    const normalizedFile = normalizeFsPath(filePath);
    const matches = (behaviorDirectories || [])
        .map((entry) => ({
            entry,
            root: normalizeFsPath(entry?.path),
        }))
        .filter(({ entry, root }) =>
            entry?.key && root &&
            (normalizedFile === root || normalizedFile.startsWith(`${root}/`))
        )
        .sort((a, b) => b.root.length - a.root.length);

    if (matches.length === 0) return normalizedFile;

    const { entry, root } = matches[0];
    const relative = normalizedFile.slice(root.length).replace(/^\/+/, "");
    const key = String(entry.key).trim().toUpperCase();
    return relative ? `\${${key}}/${relative}` : `\${${key}}`;
};

const DEFAULT_CHILD_DATA_MODEL = [
    { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
];

const buildEmptySubMachineXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:editor="http://bonsai.cit-ec.uni-bielefeld.de/editor"
       version="1.0">
    <datamodel>
        <data id="#_STATE_PREFIX" expr="'de.unibi.citec.clf.bonsai.skills.'"/>
    </datamodel>
</scxml>
`;

const writeNewSubMachineFile = async ({ filePath, nodes = [], edges = [] }) => {
    if (!IS_DESKTOP) return { success: true, filePath };

    let xml = buildEmptySubMachineXml();
    if (nodes.length > 0) {
        const exportGraph = prepareGraphForScxml(nodes, edges);
        xml = generateXmlString(
            exportGraph.nodes,
            exportGraph.edges,
            DEFAULT_CHILD_DATA_MODEL
        ) || xml;
    }

    const result = await saveFile(xml, filePath, "Create Sub-State-Machine");
    if (!result?.success) {
        throw new Error("The sub-state-machine file could not be created.");
    }

    return {
        success: true,
        filePath: result.path || filePath,
        fileName: result.file_name || filePath.split(/[\\/]/).pop(),
    };
};

const getSelectionBoundingBox = (selectedList) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    selectedList.forEach((node) => {
        const x = node.position.x;
        const y = node.position.y;
        const width = node.style?.width || 180;
        const height = node.style?.height || 80;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
    });

    return { minX, minY, maxX, maxY };
};

const buildInheritedGlobalsForChild = (
    inheritedGlobals,
    parentDataModel,
    parentName
) => {
    const inherited = [];
    const seen = new Set();

    (inheritedGlobals || []).forEach((parameter) => {
        if (!String(parameter.id || "").startsWith("_")) return;
        if (seen.has(parameter.id)) return;
        seen.add(parameter.id);
        inherited.push(parameter);
    });

    (parentDataModel || []).forEach((parameter) => {
        if (!String(parameter.id || "").startsWith("_")) return;
        if (seen.has(parameter.id)) return;
        seen.add(parameter.id);
        inherited.push({
            ...parameter,
            inheritedFrom: parentName || "Parent",
        });
    });

    return inherited;
};

export function useSubStateMachines({
    nodes,
    edges,
    selectedNodes,
    slotNodes,
    slotEdges,
    manualSlots,
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    switchTab,
    globalDataModel,
    setGlobalDataModel,
    inheritedGlobalDataModel,
    setInheritedGlobalDataModel,
    behaviorDirectories,
    fetchSkillData,
    setNodes,
    setEdges,
    setSlotNodes,
    setSlotEdges,
    setManualSlots,
    setSelectedNodeId,
    setActiveTab,
    setContextMenu,
    fitView,
    checkSlotConnection,
    onStateMachineLoadStart,
    onStateMachineLoadEnd,
}) {
    const hydrateSubMachineInheritedSlots = async (
        targetNodes,
        parentFilePath = null
    ) => {
        return Promise.all(
            (targetNodes || []).map(async (node) => {
                if (node.type !== "submachine" || !node.data?.src) {
                    return node;
                }

                try {
                    let xmlText = "";

                    if (IS_DESKTOP) {
                        const loaded = await readWorkflowSource(
                            node.data.src,
                            behaviorDirectories,
                            parentFilePath
                        );
                        xmlText = loaded.content || "";
                    } else {
                        const resolvedUrl = resolveSrcPath(
                            node.data.src,
                            DEFAULT_PREFIX_CONFIG
                        );
                        const response = await fetch(resolvedUrl);
                        if (!response.ok) return node;
                        xmlText = await response.text();
                    }

                    const declaredInheritedSlots =
                        extractInheritedSlotsFromScxml(xmlText);
                    const parsedChild = await parseScxmlFile(
                        xmlText,
                        fetchSkillData,
                        getNodeId
                    );
                    const inheritedSlots = collectInheritedSlotUsages(
                        parsedChild.nodes,
                        declaredInheritedSlots
                    );
                    const localDataModel = getLocalDataModelEntries(
                        parsedChild.globalDataModel
                    );

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            inheritedSlots,
                            localDataModel,
                        },
                    };
                } catch (error) {
                    console.warn(
                        `Could not inspect inheritSlot declarations for ${node.data.src}:`,
                        error
                    );
                    return node;
                }
            })
        );
    };

    const handleOpenSubMachineImpl = async (srcPath, label) => {
        if (!srcPath) return;

        const fileName = srcPath.split(/[\\/]/).pop();
        const baseName = fileName.replace(/\.(xml|scxml)$/i, "");
        const currentTab = tabs.find((tab) => tab.id === activeTabId);

        onStateMachineLoadStart?.(label || baseName || "State machine");
        await new Promise((resolve) =>
            window.requestAnimationFrame(() =>
                window.requestAnimationFrame(resolve)
            )
        );

        let tabId = `tab-sub-${baseName}`;
        let resolvedFilePath = null;
        let xmlText = "";

        try {
            if (IS_DESKTOP) {
                // Keep srcPath symbolic in SCXML, but resolve ${KEY} to the
                // configured local directory before reading from disk.
                const loaded = await readWorkflowSource(
                    srcPath,
                    behaviorDirectories,
                    currentTab?.filePath || null
                );

                xmlText = loaded.content;
                resolvedFilePath = loaded.path;
                tabId = `tab-sub-${resolvedFilePath}`;
            } else {
                // Browser compatibility only. The desktop app resolves
                // ${KEY}/... directly from the Behavior Library.
                const resolvedUrl = resolveSrcPath(
                    srcPath,
                    DEFAULT_PREFIX_CONFIG
                );
                const response = await fetch(resolvedUrl);

                if (!response.ok) {
                    throw new Error(
                        `Server returned status ${response.status} (${response.statusText})`
                    );
                }

                xmlText = await response.text();
            }

            const existingTab = tabs.find((tab) => tab.id === tabId);
            if (existingTab) {
                switchTab(tabId);
                return;
            }

            if (!xmlText || !xmlText.includes("<scxml")) {
                throw new Error(
                    "The selected file does not contain a valid <scxml> document."
                );
            }

            const discoveredBehaviorExitEvents =
                extractBehaviorExitEventsFromScxml(xmlText);
            const declaredInheritedSlots =
                extractInheritedSlotsFromScxml(xmlText);

            const parsed = await parseScxmlFile(
                xmlText,
                fetchSkillData,
                getNodeId
            );
            const discoveredInheritedSlots =
                collectInheritedSlotUsages(
                    parsed.nodes,
                    declaredInheritedSlots
                );

            const syncedParentNodes = nodes.map((node) => {
                if (
                    node.type !== "submachine" ||
                    String(node.data?.src || "") !== String(srcPath)
                ) {
                    return node;
                }

                const existingEventsById = new Map(
                    (node.data?.events || []).map((event) => [
                        event.id,
                        event,
                    ])
                );

                return {
                    ...node,
                    data: {
                        ...node.data,
                        events:
                            discoveredBehaviorExitEvents.length > 0
                                ? discoveredBehaviorExitEvents.map(
                                    (eventId) => ({
                                        ...(existingEventsById.get(eventId) || {}),
                                        id: eventId,
                                    })
                                )
                                : node.data?.events || [],
                        inheritedSlots: discoveredInheritedSlots,
                        localDataModel: getLocalDataModelEntries(
                            parsed.globalDataModel
                        ),
                    },
                };
            });
            const parsedNodes = ensureSharedEditorInstanceIds(
                (await hydrateSubMachineInheritedSlots(
                    parsed.nodes,
                    resolvedFilePath
                )).map(normalizeSharedScxmlStateIdentity)
            );

            const inheritedForChild = buildInheritedGlobalsForChild(
                inheritedGlobalDataModel,
                globalDataModel,
                currentTab?.title ||
                currentTab?.fileName ||
                "Parent"
            );

            const newTabObj = {
                id: tabId,
                title: label || baseName,
                fileName:
                    resolvedFilePath?.split(/[\\/]/).pop() ||
                    fileName,
                fileHandle: null,
                filePath: resolvedFilePath,
                sourcePath: srcPath,
                nodes: parsedNodes,
                edges: parsed.edges,
                slotNodes: [],
                slotEdges: [],
                manualSlots: [],
                parentTabId: activeTabId,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: parsed.globalDataModel,
            };

            setTabs((prev) => [
                ...prev.map((tab) =>
                    tab.id === activeTabId
                        ? {
                            ...tab,
                            nodes: syncedParentNodes,
                            edges,
                            slotNodes,
                            slotEdges,
                            manualSlots,
                            globalDataModel,
                            inheritedGlobalDataModel,
                        }
                        : tab
                ),
                newTabObj,
            ]);

            setActiveTabId(tabId);
            setNodes(parsedNodes);
            setEdges(parsed.edges);
            setSlotNodes([]);
            setSlotEdges([]);
            setManualSlots([]);
            setGlobalDataModel(parsed.globalDataModel);
            setInheritedGlobalDataModel(inheritedForChild);
            setSelectedNodeId(null);
            checkSlotConnection(parsedNodes);

            setTimeout(
                () => fitView({ padding: 0.2, duration: 300 }),
                100
            );
        } catch (err) {
            console.error("Sub-Machine loading error:", err);
            alert(
                `Error loading the sub-state machine:\n${err.message}\n\nSource: ${srcPath}`
            );
        } finally {
            onStateMachineLoadEnd?.();
        }
    };
    const handleOpenSubMachineRef = useRef(handleOpenSubMachineImpl);
    handleOpenSubMachineRef.current = handleOpenSubMachineImpl;
    const handleOpenSubMachine = useCallback(
        (...args) => handleOpenSubMachineRef.current?.(...args),
        []
    );

    const handleCreateEmptySubMachine = async (pos, fileConfig = {}) => {
        const fallbackLabel = `SubMachine_${nodes.filter((n) => n.type === "submachine").length + 1}`;
        const fileName = String(fileConfig.fileName || `${fallbackLabel}.xml`).trim();
        const subMachineLabel = fileName.replace(/\.(xml|scxml)$/i, "") || fallbackLabel;
        const requestedFilePath = joinFsPath(fileConfig.directory, fileName);

        try {
            const created = await writeNewSubMachineFile({
                filePath: requestedFilePath,
            });
            const resolvedFilePath = created.filePath || requestedFilePath;
            const sourcePath = getSymbolicBehaviorSource(
                resolvedFilePath,
                behaviorDirectories
            );
            const subMachineId = getNodeId();

            const subMachineNode = {
                id: subMachineId,
                type: "submachine",
                position: pos,
                data: {
                    label: subMachineLabel,
                    fullSkillName: subMachineLabel,
                    src: sourcePath,
                    localDataModel: [],
                    isInitial: nodes.length === 0,
                    events: [{ id: "success" }, { id: "failure" }],
                    onOpenSubMachine: handleOpenSubMachine,
                },
            };

            const parentNodes = [...nodes, subMachineNode];
            const newTabId = `tab-sub-${resolvedFilePath || crypto.randomUUID().slice(0, 6)}`;
            const inheritedForChild = buildInheritedGlobalsForChild(
                inheritedGlobalDataModel,
                globalDataModel,
                tabs.find((tab) => tab.id === activeTabId)?.title || "Parent"
            );
            const newTabObj = {
                id: newTabId,
                title: subMachineLabel,
                fileName: created.fileName || fileName,
                fileHandle: null,
                filePath: resolvedFilePath || null,
                sourcePath,
                nodes: [],
                edges: [],
                slotNodes: [],
                slotEdges: [],
                manualSlots: [],
                parentTabId: activeTabId,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: DEFAULT_CHILD_DATA_MODEL,
            };

            // Save the new Sub-SM node in the parent tab before switching to
            // the child. Otherwise returning to the parent can restore the old
            // snapshot without the freshly created node.
            setTabs((prevTabs) => [
                ...prevTabs.map((tab) =>
                    tab.id === activeTabId
                        ? {
                            ...tab,
                            nodes: parentNodes,
                            edges,
                            slotNodes,
                            slotEdges,
                            manualSlots,
                            globalDataModel,
                            inheritedGlobalDataModel,
                        }
                        : tab
                ),
                newTabObj,
            ]);

            setContextMenu(null);
            setActiveTabId(newTabId);
            setNodes([]);
            setEdges([]);
            setSlotNodes([]);
            setSlotEdges([]);
            setManualSlots([]);
            setGlobalDataModel(DEFAULT_CHILD_DATA_MODEL);
            setInheritedGlobalDataModel(inheritedForChild);
            setSelectedNodeId(null);
            setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
            return true;
        } catch (error) {
            console.error("Could not create sub-state-machine:", error);
            alert(`Could not create the sub-state-machine file:\n${error.message}`);
            return false;
        }
    };

    const handleCreateSubMachineFromSelected = async (fileConfig = {}) => {
        if (selectedNodes.length < 1) return false;

        const { minX, minY } = getSelectionBoundingBox(selectedNodes);
        const fallbackLabel = `SubMachine_${nodes.filter((n) => n.type === "submachine").length + 1}`;
        const fileName = String(fileConfig.fileName || `${fallbackLabel}.xml`).trim();
        const subMachineLabel = fileName.replace(/\.(xml|scxml)$/i, "") || fallbackLabel;
        const requestedFilePath = joinFsPath(fileConfig.directory, fileName);
        const subMachineId = getNodeId();
        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const semanticParentGraph = prepareGraphForScxml(nodes, edges);
        const semanticParentEdges = semanticParentGraph.edges || [];

        const externalEvents = [];
        semanticParentEdges.forEach((edge) => {
            const logicalSource =
                edge.data?.boundaryOriginalSource ||
                edge.data?.compoundOriginalSource ||
                edge.data?.parallelOriginalSource ||
                edge.source;
            if (selectedIds.has(logicalSource) && !selectedIds.has(edge.target)) {
                const evHandle =
                    edge.data?.boundaryOriginalSourceHandle ||
                    edge.data?.compoundOriginalSourceHandle ||
                    edge.data?.parallelOriginalSourceHandle ||
                    edge.sourceHandle ||
                    "success";
                if (!externalEvents.some((event) => event.id === evHandle)) {
                    externalEvents.push({
                        id: evHandle,
                        name: evHandle,
                        rawEvent: evHandle,
                        target: edge.target,
                        cond: edge.data?.cond || "",
                    });
                }
            }
        });

        const subTabNodes = selectedNodes.map((node) => ({
            ...node,
            position: {
                x: node.position.x - minX + 50,
                y: node.position.y - minY + 50,
            },
            selected: false,
        }));
        const subTabEdges = semanticParentEdges.filter((edge) =>
            selectedIds.has(edge.source) && selectedIds.has(edge.target)
        );

        try {
            const created = await writeNewSubMachineFile({
                filePath: requestedFilePath,
                nodes: subTabNodes,
                edges: subTabEdges,
            });
            const resolvedFilePath = created.filePath || requestedFilePath;
            const sourcePath = getSymbolicBehaviorSource(
                resolvedFilePath,
                behaviorDirectories
            );

            const subMachineNode = {
                id: subMachineId,
                type: "submachine",
                position: { x: minX, y: minY },
                data: {
                    label: subMachineLabel,
                    fullSkillName: subMachineLabel,
                    localDataModel: [],
                    src: sourcePath,
                    isInitial: selectedNodes.some((node) => node.data?.isInitial),
                    events: externalEvents.length > 0
                        ? externalEvents
                        : [{ id: "success" }, { id: "failure" }],
                    onEntry: [],
                    onExit: [],
                    onOpenSubMachine: handleOpenSubMachine,
                },
            };

            const updatedParentEdges = semanticParentEdges
                .map((edge) => {
                    if (selectedIds.has(edge.source) && !selectedIds.has(edge.target)) {
                        return { ...edge, source: subMachineId };
                    }
                    if (!selectedIds.has(edge.source) && selectedIds.has(edge.target)) {
                        return { ...edge, target: subMachineId };
                    }
                    if (selectedIds.has(edge.source) && selectedIds.has(edge.target)) {
                        return null;
                    }
                    return edge;
                })
                .filter(Boolean);

            const remainingParentNodes = [
                ...nodes.filter((node) => !selectedIds.has(node.id)),
                subMachineNode,
            ];

            const parentTab = tabs.find((tab) => tab.id === activeTabId);
            const inheritedForChild = buildInheritedGlobalsForChild(
                inheritedGlobalDataModel,
                globalDataModel,
                parentTab?.title || parentTab?.fileName || "Parent"
            );
            const newTabId = `tab-sub-${resolvedFilePath || crypto.randomUUID().slice(0, 6)}`;
            const newTabObj = {
                id: newTabId,
                title: subMachineLabel,
                fileName: created.fileName || fileName,
                fileHandle: null,
                filePath: resolvedFilePath || null,
                sourcePath,
                nodes: subTabNodes,
                edges: subTabEdges,
                slotNodes: [],
                slotEdges: [],
                manualSlots: [],
                parentTabId: activeTabId,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: DEFAULT_CHILD_DATA_MODEL,
            };

            setTabs((prevTabs) => [
                ...prevTabs.map((tab) =>
                    tab.id === activeTabId
                        ? {
                            ...tab,
                            nodes: remainingParentNodes,
                            edges: updatedParentEdges,
                            slotNodes,
                            slotEdges,
                            manualSlots,
                            globalDataModel,
                            inheritedGlobalDataModel,
                        }
                        : tab
                ),
                newTabObj,
            ]);

            setActiveTabId(newTabId);
            setNodes(subTabNodes);
            setEdges(subTabEdges);
            setSlotNodes([]);
            setSlotEdges([]);
            setManualSlots([]);
            setGlobalDataModel(DEFAULT_CHILD_DATA_MODEL);
            setInheritedGlobalDataModel(inheritedForChild);
            setSelectedNodeId(null);
            checkSlotConnection(subTabNodes);
            setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
            return true;
        } catch (error) {
            console.error("Could not create sub-state-machine:", error);
            alert(`Could not create the sub-state-machine file:\n${error.message}`);
            return false;
        }
    };

    return {
        handleCreateEmptySubMachine,
        hydrateSubMachineInheritedSlots,
        handleOpenSubMachine,
        handleCreateSubMachineFromSelected,
    };
}
