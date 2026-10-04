import { useCallback, useLayoutEffect, useRef } from "react";
import { isTauri, saveFile } from "../tauri-client.js";
import { useFeedback } from "../components/ui/index.js";
import { collectInheritedSlotUsages } from "../utils/editorGraph";
import { getNodeId } from "../utils/editorGeometry";
import {
    getLocalDataModelEntries,
    ensureSharedEditorInstanceIds,
    normalizeSharedScxmlStateIdentity,
    prepareGraphForScxml,
} from "../utils/editorScxml";
import { serializeEditorGraphWithRust } from "../utils/scxmlRustExport";
import {
    getWorkflowFileKey,
    inspectWorkflowForEditorSource,
    loadWorkflowForEditor,
    projectWorkflowInspectionForEditor,
} from "../utils/workflowLoader";

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
        // Creating a populated Sub-SM is a persisted semantic operation. In
        // desktop mode Rust is authoritative, so serialization errors abort the
        // creation instead of writing independently-generated JavaScript XML.
        xml = await serializeEditorGraphWithRust({
            nodes,
            edges,
            globalDataModel: DEFAULT_CHILD_DATA_MODEL,
            manualSlots: [],
        });
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
    selectedNodes,
    activeTabId,
    getTabSnapshot,
    getTabsSnapshot,
    switchTab,
    openTab,
    behaviorDirectories,
    fetchSkillData,
    setContextMenu,
    checkSlotConnection,
    onStateMachineLoadStart,
    onStateMachineLoadEnd,
}) {
    const { notify } = useFeedback();

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
                    const loaded = await loadWorkflowForEditor({
                        src: node.data.src,
                        directories: behaviorDirectories,
                        currentFilePath: parentFilePath,
                        fetchSkillData,
                        getNodeId,
                    });
                    const behaviorExitEvents = loaded.behaviorExitEvents || [];
                    const declaredInheritedSlots =
                        loaded.inheritedSlotDeclarations || [];
                    const parsedChild = loaded.parsed;
                    const inheritedSlots = collectInheritedSlotUsages(
                        parsedChild.nodes,
                        declaredInheritedSlots
                    );
                    const localDataModel = getLocalDataModelEntries(
                        parsedChild.globalDataModel
                    );
                    const existingEventsById = new Map(
                        (node.data?.events || []).map((event) => [
                            String(event?.id || ""),
                            event,
                        ])
                    );
                    const confirmedEventIds = new Set(
                        behaviorExitEvents.map((eventId) => String(eventId))
                    );
                    const confirmedEvents = behaviorExitEvents.map((eventId) => ({
                        ...(existingEventsById.get(String(eventId)) || {}),
                        id: eventId,
                        // This event is confirmed by a forwarding Nop inside
                        // the referenced state machine. It may have been added
                        // provisionally while importing the parent SCXML, but
                        // it is now part of the real Sub-SM interface.
                        editorImportedSynthetic: false,
                        editorBoundarySynthetic: false,
                    }));
                    const unresolvedImportedEvents = (node.data?.events || [])
                        .filter((event) => {
                            const eventId = String(event?.id || "");
                            if (!eventId || confirmedEventIds.has(eventId)) {
                                return false;
                            }

                            // Keep editor-only handles for invalid transitions
                            // so React Flow can still render those edges. The
                            // Problems panel deliberately ignores these handles
                            // as exposed exits, and deletion prunes them once
                            // their last transition disappears.
                            return Boolean(
                                event?.editorImportedSynthetic ||
                                event?.editorBoundarySynthetic
                            );
                        });
                    const events = [
                        ...confirmedEvents,
                        ...unresolvedImportedEvents,
                    ];

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            events,
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

        const originTab = getTabSnapshot(activeTabId);
        if (!originTab) return false;

        const fileName = srcPath.split(/[\\/]/).pop();
        const baseName = fileName.replace(/\.(xml|scxml)$/i, "");

        onStateMachineLoadStart?.(label || baseName || "State machine");
        await new Promise((resolve) =>
            window.requestAnimationFrame(() =>
                window.requestAnimationFrame(resolve)
            )
        );

        let tabId = `tab-sub-${baseName}`;
        try {
            // Inspect first so an already-open tab can be selected without
            // rebuilding its React Flow projection or refetching skill data.
            const inspection = await inspectWorkflowForEditorSource({
                src: srcPath,
                directories: behaviorDirectories,
                currentFilePath: originTab.filePath || null,
            });
            const resolvedFilePath = inspection.path;
            if (resolvedFilePath) {
                tabId = `tab-sub-${resolvedFilePath}`;
            }

            const resolvedFileKey = getWorkflowFileKey(resolvedFilePath);
            const getExistingChild = () => getTabsSnapshot().find((tab) =>
                resolvedFileKey
                    ? getWorkflowFileKey(tab.filePath) === resolvedFileKey
                    : tab.id === tabId
            );
            const existingTab = getExistingChild();
            if (existingTab) {
                switchTab(existingTab.id);
                return;
            }

            if (!inspection.content || !inspection.content.includes("<scxml")) {
                throw new Error(
                    "The selected file does not contain a valid <scxml> document."
                );
            }

            const discoveredBehaviorExitEvents =
                inspection.behaviorExitEvents || [];
            const declaredInheritedSlots =
                inspection.inheritedSlotDeclarations || [];
            const parsed = await projectWorkflowInspectionForEditor(inspection, {
                fetchSkillData,
                getNodeId,
            });
            const discoveredInheritedSlots =
                collectInheritedSlotUsages(
                    parsed.nodes,
                    declaredInheritedSlots
                );

            const currentTabPatch = (liveOriginSnapshot) => ({
                nodes: liveOriginSnapshot.nodes.map((node) => {
                    if (
                        node.type !== "submachine" ||
                        String(node.data?.src || "") !== String(srcPath)
                    ) {
                        return node;
                    }

                    const existingEventsById = new Map(
                        (node.data?.events || []).map((event) => [
                            String(event?.id || ""),
                            event,
                        ])
                    );

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            events:
                                discoveredBehaviorExitEvents.length > 0
                                    ? (() => {
                                        const confirmedEventIds = new Set(
                                            discoveredBehaviorExitEvents.map(
                                                (eventId) => String(eventId)
                                            )
                                        );
                                        const confirmedEvents =
                                            discoveredBehaviorExitEvents.map(
                                                (eventId) => ({
                                                    ...(existingEventsById.get(String(eventId)) || {}),
                                                    id: eventId,
                                                    // Opening the child machine confirms
                                                    // that this exit is genuinely exposed
                                                    // by a forwarding Nop. Do not retain a
                                                    // provisional imported-handle marker.
                                                    editorImportedSynthetic: false,
                                                    editorBoundarySynthetic: false,
                                                })
                                            );
                                        const unresolvedImportedEvents = (
                                            node.data?.events || []
                                        ).filter((event) => {
                                            const eventId = String(event?.id || "");
                                            if (
                                                !eventId ||
                                                confirmedEventIds.has(eventId)
                                            ) {
                                                return false;
                                            }

                                            return Boolean(
                                                event?.editorImportedSynthetic ||
                                                event?.editorBoundarySynthetic
                                            );
                                        });

                                        return [
                                            ...confirmedEvents,
                                            ...unresolvedImportedEvents,
                                        ];
                                    })()
                                    : node.data?.events || [],
                            inheritedSlots: discoveredInheritedSlots,
                            localDataModel: getLocalDataModelEntries(
                                parsed.globalDataModel
                            ),
                        },
                    };
                }),
            });
            const parsedNodes = ensureSharedEditorInstanceIds(
                (await hydrateSubMachineInheritedSlots(
                    parsed.nodes,
                    resolvedFilePath
                )).map(normalizeSharedScxmlStateIdentity)
            );

            // Another load may have opened this child during hydration. Keep
            // its live graph and slot metadata instead of applying this load.
            const existingAfterHydration = getExistingChild();
            if (existingAfterHydration) {
                switchTab(existingAfterHydration.id);
                return;
            }

            const inheritedForChild = buildInheritedGlobalsForChild(
                originTab.inheritedGlobalDataModel,
                originTab.globalDataModel,
                originTab.title ||
                originTab.fileName ||
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
                parentTabId: originTab.id,
                selectedNodeId: null,
                viewport: null,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: parsed.globalDataModel,
            };

            const opened = openTab(newTabObj, {
                originTabId: originTab.id,
                originGeneration: originTab.documentGeneration,
                currentTabPatch,
                fit: true,
                fitOptions: { duration: 300 },
            });
            if (!opened) {
                notify({
                    id: "submachine-open",
                    tone: "warning",
                    title: "Sub-state machine not opened",
                    message: "The original workflow is no longer available for this operation. No workflow was changed.",
                });
                return false;
            }
            checkSlotConnection(
                parsedNodes,
                [],
                parsed.editorSlotNodes || []
            );

        } catch (err) {
            console.error("Sub-Machine loading error:", err);
            notify({
                id: "submachine-open",
                tone: "danger",
                title: "Could not open sub-state machine",
                message: `${String(err?.message || err || "Unknown error.")} Source: ${srcPath}`,
            });
        } finally {
            onStateMachineLoadEnd?.();
        }
    };
    const handleOpenSubMachineRef = useRef(handleOpenSubMachineImpl);
    useLayoutEffect(() => {
        handleOpenSubMachineRef.current = handleOpenSubMachineImpl;
    });
    const handleOpenSubMachine = useCallback(
        (...args) => handleOpenSubMachineRef.current?.(...args),
        []
    );

    const handleCreateEmptySubMachine = async (pos, fileConfig = {}) => {
        const originTab = getTabSnapshot(activeTabId);
        if (!originTab) return false;

        const fallbackLabel = `SubMachine_${originTab.nodes.filter((n) => n.type === "submachine").length + 1}`;
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
                    events: [{ id: "success" }, { id: "failure" }],
                    onOpenSubMachine: handleOpenSubMachine,
                },
            };

            const newTabId = `tab-sub-${resolvedFilePath || crypto.randomUUID().slice(0, 6)}`;
            const inheritedForChild = buildInheritedGlobalsForChild(
                originTab.inheritedGlobalDataModel,
                originTab.globalDataModel,
                originTab.title || originTab.fileName || "Parent"
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
                parentTabId: originTab.id,
                selectedNodeId: null,
                viewport: null,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: DEFAULT_CHILD_DATA_MODEL,
            };

            // Append to the live origin so edits made during the file write
            // survive even if another tab is now active.
            const opened = openTab(newTabObj, {
                originTabId: originTab.id,
                originGeneration: originTab.documentGeneration,
                currentTabPatch: (liveOriginSnapshot) => ({
                    nodes: [
                        ...liveOriginSnapshot.nodes,
                        {
                            ...subMachineNode,
                            data: {
                                ...subMachineNode.data,
                                isInitial: liveOriginSnapshot.nodes.length === 0,
                            },
                        },
                    ],
                }),
                fit: true,
                fitOptions: { duration: 300 },
            });
            if (!opened) {
                throw new Error(
                    "The original workflow changed or is no longer available. No workflow was changed." +
                        (IS_DESKTOP ? ` The new child file was kept at ${resolvedFilePath}.` : "")
                );
            }
            setContextMenu(null);
            return true;
        } catch (error) {
            console.error("Could not create sub-state-machine:", error);
            throw error;
        }
    };

    const handleCreateSubMachineFromSelected = async (fileConfig = {}) => {
        if (selectedNodes.length < 1) return false;

        const originTab = getTabSnapshot(activeTabId);
        if (!originTab) return false;

        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const selectedParentNodes = originTab.nodes.filter((node) =>
            selectedIds.has(node.id)
        );
        if (selectedParentNodes.length !== selectedIds.size) return false;

        const { minX, minY } = getSelectionBoundingBox(selectedParentNodes);
        const fallbackLabel = `SubMachine_${originTab.nodes.filter((n) => n.type === "submachine").length + 1}`;
        const fileName = String(fileConfig.fileName || `${fallbackLabel}.xml`).trim();
        const subMachineLabel = fileName.replace(/\.(xml|scxml)$/i, "") || fallbackLabel;
        const requestedFilePath = joinFsPath(fileConfig.directory, fileName);
        const subMachineId = getNodeId();
        const semanticParentGraph = prepareGraphForScxml(
            originTab.nodes,
            originTab.edges
        );
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

        const subTabNodes = selectedParentNodes.map((node) => ({
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
                    isInitial: selectedParentNodes.some((node) => node.data?.isInitial),
                    events: externalEvents.length > 0
                        ? externalEvents
                        : [{ id: "success" }, { id: "failure" }],
                    onEntry: [],
                    onExit: [],
                    onOpenSubMachine: handleOpenSubMachine,
                },
            };

            const inheritedForChild = buildInheritedGlobalsForChild(
                originTab.inheritedGlobalDataModel,
                originTab.globalDataModel,
                originTab.title || originTab.fileName || "Parent"
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
                parentTabId: originTab.id,
                selectedNodeId: null,
                viewport: null,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: DEFAULT_CHILD_DATA_MODEL,
            };

            const opened = openTab(newTabObj, {
                originTabId: originTab.id,
                originGeneration: originTab.documentGeneration,
                expectedFingerprint: originTab.fingerprint,
                currentTabPatch: (liveOriginSnapshot) => {
                    const liveParentGraph = prepareGraphForScxml(
                        liveOriginSnapshot.nodes,
                        liveOriginSnapshot.edges
                    );
                    return {
                        nodes: [
                            ...liveOriginSnapshot.nodes.filter((node) =>
                                !selectedIds.has(node.id)
                            ),
                            subMachineNode,
                        ],
                        edges: liveParentGraph.edges
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
                            .filter(Boolean),
                    };
                },
                fit: true,
                fitOptions: { duration: 300 },
            });
            if (!opened) {
                throw new Error(
                    "The original workflow changed or is no longer available. It was retained and no states were removed." +
                        (IS_DESKTOP ? ` The new child file was kept at ${resolvedFilePath}.` : "")
                );
            }
            const openedChild = getTabsSnapshot().find((tab) =>
                getWorkflowFileKey(tab.filePath) === getWorkflowFileKey(resolvedFilePath)
            );
            if (openedChild?.nodes === subTabNodes) {
                checkSlotConnection(subTabNodes);
            }
            return true;
        } catch (error) {
            console.error("Could not create sub-state-machine:", error);
            throw error;
        }
    };

    return {
        handleCreateEmptySubMachine,
        hydrateSubMachineInheritedSlots,
        handleOpenSubMachine,
        handleCreateSubMachineFromSelected,
    };
}
