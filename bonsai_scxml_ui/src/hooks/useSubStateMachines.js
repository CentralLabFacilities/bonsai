import { useCallback, useRef } from "react";
import { parseScxmlFile, extractBehaviorExitEventsFromScxml } from "../utils/scxmlImport";
import { DEFAULT_PREFIX_CONFIG, resolveSrcPath } from "../config/prefixMapping";
import { isTauri, readWorkflowSource } from "../tauri-client.js";
import {
    extractInheritedSlotsFromScxml,
    collectInheritedSlotUsages,
} from "../utils/editorGraph";
import { getNodeId } from "../utils/editorGeometry";
import {
    getLocalDataModelEntries,
    ensureSharedEditorInstanceIds,
    normalizeSharedScxmlStateIdentity,
} from "../utils/editorScxml";

const IS_DESKTOP = isTauri();

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

    const handleCreateEmptySubMachine = (pos) => {
        const subMachineId = getNodeId();
        const subMachineLabel = `SubMachine_${nodes.filter((n) => n.type === "submachine").length + 1}`;

        const subMachineNode = {
            id: subMachineId,
            type: "submachine",
            position: pos,
            data: {
                label: subMachineLabel,
                fullSkillName: subMachineLabel,
                src: `\${${behaviorDirectories[0]?.key || "ROBOCUP"}}/${subMachineLabel}.xml`,
                localDataModel: [],
                isInitial: nodes.length === 0,
                events: [{ id: "success" }, { id: "failure" }],
                onOpenSubMachine: handleOpenSubMachine,
            },
        };

        const newTabId = `tab-sub-${crypto.randomUUID().slice(0, 6)}`;
        const newTabObj = {
            id: newTabId,
            title: subMachineLabel,
            fileName: `${subMachineLabel}.xml`,
            fileHandle: null,
            filePath: null,
            nodes: [],
            edges: [],
            slotNodes: [],
            slotEdges: [],
            manualSlots: [],
            parentTabId: activeTabId,
            inheritedGlobalDataModel: buildInheritedGlobalsForChild(
                inheritedGlobalDataModel,
                globalDataModel,
                tabs.find((tab) => tab.id === activeTabId)?.title || "Parent"
            ),
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
        };

        setTabs((prevTabs) => [
            ...prevTabs.map((t) =>
                t.id === activeTabId
                    ? {
                        ...t,
                        nodes,
                        edges,
                        slotNodes,
                        slotEdges,
                        manualSlots,
                        globalDataModel,
                        inheritedGlobalDataModel,
                    }
                    : t
            ),
            newTabObj,
        ]);

        setNodes((nds) => [...nds, subMachineNode]);
        setContextMenu(null);

        // Direkt in den neuen Sub-Tab wechseln
        setActiveTabId(newTabId);
        setNodes([]);
        setEdges([]);
        setSlotNodes([]);
        setSlotEdges([]);
        setManualSlots([]);
        setGlobalDataModel(newTabObj.globalDataModel);
        setInheritedGlobalDataModel(newTabObj.inheritedGlobalDataModel || []);
        setSelectedNodeId(null);
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    };

    const handleCreateSubMachineFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const { minX, minY } = getSelectionBoundingBox(selectedNodes);
        const subMachineId = getNodeId();
        const subMachineLabel = `SubMachine_${nodes.filter((n) => n.type === "submachine").length + 1}`;
        const selectedIds = new Set(selectedNodes.map((n) => n.id));

        // 1. Externe Transitions für die Handles der Sub-Machine-Node im Parent sammeln
        const externalEvents = [];
        edges.forEach((edge) => {
            if (selectedIds.has(edge.source) && !selectedIds.has(edge.target)) {
                const evHandle = edge.sourceHandle || "success";
                if (!externalEvents.some((e) => e.id === evHandle)) {
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

        // 2. Neue Sub-Machine-Knoten für den aktuellen (Parent-)Workflow vorbereiten
        const subMachineNode = {
            id: subMachineId,
            type: "submachine",
            position: { x: minX, y: minY },
            data: {
                label: subMachineLabel,
                fullSkillName: subMachineLabel,
                localDataModel: [],
                src: `\${${behaviorDirectories[0]?.key || "ROBOCUP"}}/${subMachineLabel}.xml`,
                isInitial: selectedNodes.some((n) => n.data?.isInitial),
                events: externalEvents.length > 0 ? externalEvents : [{ id: "success" }, { id: "failure" }],
                onEntry: [],
                onExit: [],
                onOpenSubMachine: handleOpenSubMachine,
            },
        };

    // 3. Kanten im Parent anpassen (externe Kanten an die SubMachine heften, interne entfernen)
        const updatedParentEdges = edges
            .map((edge) => {
                if (selectedIds.has(edge.source) && !selectedIds.has(edge.target)) {
                    return { ...edge, source: subMachineId };
                }
                if (!selectedIds.has(edge.source) && selectedIds.has(edge.target)) {
                    return { ...edge, target: subMachineId };
                }
                if (selectedIds.has(edge.source) && selectedIds.has(edge.target)) {
                    return null; // Geht in den neuen Sub-Tab über
                }
                return edge;
            })
            .filter(Boolean);

        const remainingParentNodes = [
            ...nodes.filter((n) => !selectedIds.has(n.id)),
            subMachineNode,
        ];

    // 4. Nodes für das neue Sub-Machine-Tab normalisieren (Koordinaten relativ zum Ursprung)
        const subTabNodes = selectedNodes.map((n) => ({
            ...n,
            position: {
                x: n.position.x - minX + 50,
                y: n.position.y - minY + 50,
            },
            selected: false,
        }));

    // Nur interne Kanten für den Sub-Tab mitnehmen
        const subTabEdges = edges.filter(
            (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)
        );

    // 5. Neues Tab-Objekt anlegen
        const parentTab = tabs.find((tab) => tab.id === activeTabId);
        const inheritedForChild = buildInheritedGlobalsForChild(
            inheritedGlobalDataModel,
            globalDataModel,
            parentTab?.title || parentTab?.fileName || "Parent"
        );

        const newTabId = `tab-sub-${crypto.randomUUID().slice(0, 6)}`;
        const newTabObj = {
            id: newTabId,
            title: subMachineLabel,
            fileName: `${subMachineLabel}.xml`,
            fileHandle: null,
            filePath: null,
            nodes: subTabNodes,
            edges: subTabEdges,
            slotNodes: [],
            slotEdges: [],
            manualSlots: [],
            parentTabId: activeTabId,
            inheritedGlobalDataModel: inheritedForChild,
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
        };

    // 6. Parent-Tab mit verbleibenden Nodes speichern und neuen Sub-Tab anhängen
        setTabs((prevTabs) => [
            ...prevTabs.map((t) =>
                t.id === activeTabId
                    ? {
                        ...t,
                        nodes: remainingParentNodes,
                        edges: updatedParentEdges,
                        slotNodes,
                        slotEdges,
                        manualSlots,
                        globalDataModel,
                        inheritedGlobalDataModel,
                    }
                    : t
            ),
            newTabObj,
        ]);

    // 7. Direkt in den neuen Sub-Machine-Tab wechseln
        setActiveTabId(newTabId);
        setNodes(subTabNodes);
        setEdges(subTabEdges);
        setSlotNodes([]);
        setSlotEdges([]);
        setManualSlots([]);
        setGlobalDataModel(newTabObj.globalDataModel);
        setInheritedGlobalDataModel(inheritedForChild);
        setSelectedNodeId(null);

    // Slot-Verbindungen des neuen Tabs berechnen & View zentrieren
        checkSlotConnection(subTabNodes);
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    };

    return {
        handleCreateEmptySubMachine,
        hydrateSubMachineInheritedSlots,
        handleOpenSubMachine,
        handleCreateSubMachineFromSelected,
    };
}
