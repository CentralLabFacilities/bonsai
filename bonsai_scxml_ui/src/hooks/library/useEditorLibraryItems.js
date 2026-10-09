import { useCallback } from "react";

import { collectInheritedSlotUsages } from "../../utils/editorGraph";
import { getNodeId } from "../../utils/editorGeometry";
import {
    ensureSharedEditorInstanceIds,
    getLocalDataModelEntries,
    getSharedScxmlStateId,
    normalizeSharedScxmlStateIdentity,
} from "../../utils/editorScxml";
import { isEditorCloneNode } from "../../utils/editorClones";
import {
    inspectWorkflowForEditorSource,
    loadWorkflowForEditor,
    projectWorkflowInspectionForEditor,
    getWorkflowFileKey,
} from "../../utils/workflowLoader";

export function useEditorLibraryItems({
    nodes,
    behaviorDirectories,
    fetchSkillData,
    hydrateSubMachineInheritedSlots,
    handleOpenSubMachine,
    switchTab,
    openTab,
    getTabsSnapshot,
    checkSlotConnection,
    beginStateMachineLoad,
    endStateMachineLoad,
}) {
    const handleOpenBehaviorFile = useCallback(
        async (behavior) => {
            if (!behavior?.source) return;

            beginStateMachineLoad(
                behavior.name?.replace(/\.(xml|scxml)$/i, "") || "State machine"
            );
            await new Promise((resolve) =>
                window.requestAnimationFrame(() =>
                    window.requestAnimationFrame(resolve)
                )
            );

            try {
                // behavior.source remains ${KEY}/... for SCXML portability.
                // Rust resolves and caches the referenced workflow for local access.
                const loaded = await inspectWorkflowForEditorSource({
                    src: behavior.source,
                    directories: behaviorDirectories,
                    currentFilePath: null,
                });

                const tabId = `tab-behavior-${loaded.path || behavior.source}`;
                const fileKey = getWorkflowFileKey(loaded.path);
                const existingTab = fileKey ? getTabsSnapshot().find((tab) =>
                    getWorkflowFileKey(tab.filePath) === fileKey) : null;

                if (existingTab) {
                    switchTab(existingTab.id);
                    return;
                }

                const parsed = await projectWorkflowInspectionForEditor(loaded, {
                    fetchSkillData,
                    getNodeId,
                });
                const parsedNodes = ensureSharedEditorInstanceIds(
                    (await hydrateSubMachineInheritedSlots(
                        parsed.nodes,
                        loaded.path
                    )).map(normalizeSharedScxmlStateIdentity)
                );

                const newTabObj = {
                    id: tabId,
                    title:
                        behavior.name?.replace(/\.(xml|scxml)$/i, "") ||
                        loaded.fileName,
                    fileName: loaded.fileName,
                    fileHandle: null,
                    filePath: loaded.path,
                    sourcePath: behavior.source,
                    nodes: parsedNodes,
                    edges: parsed.edges,
                    slotNodes: [],
                    slotEdges: [],
                    manualSlots: parsed.manualSlots || [],
                    parentTabId: null,
                    selectedNodeId: null,
                    viewport: null,
                    inheritedGlobalDataModel: [],
                    globalDataModel: parsed.globalDataModel,
                };

                openTab(newTabObj, {
                    fit: true,
                    fitOptions: { duration: 300 },
                });
                checkSlotConnection(
                    parsedNodes,
                    parsed.manualSlots || [],
                    parsed.editorSlotNodes || []
                );
            } catch (error) {
                console.error("Could not open behavior:", error);
                throw error;
            } finally {
                endStateMachineLoad();
            }
        },
        [
            behaviorDirectories,
            getTabsSnapshot,
            beginStateMachineLoad,
            endStateMachineLoad,
            fetchSkillData,
            hydrateSubMachineInheritedSlots,
            switchTab,
            openTab,
            checkSlotConnection,
        ]
    );

    const createBehaviorNode = useCallback(
        async (behavior, position) => {
            const baseName = String(behavior?.name || "Behavior").replace(
                /\.(xml|scxml)$/i,
                ""
            );

            let behaviorEvents = [];
            let inheritedSlots = [];
            let localDataModel = [];

            try {
                if (behavior?.source) {
                    const loaded = await loadWorkflowForEditor({
                        src: behavior.source,
                        directories: behaviorDirectories,
                        currentFilePath: null,
                        fetchSkillData,
                        getNodeId,
                    });
                    const parsedBehavior = loaded.parsed;

                    behaviorEvents = loaded.behaviorExitEvents || [];
                    inheritedSlots = collectInheritedSlotUsages(
                        parsedBehavior.nodes,
                        loaded.inheritedSlotDeclarations || []
                    );
                    localDataModel = getLocalDataModelEntries(
                        parsedBehavior.globalDataModel
                    );
                }
            } catch (error) {
                throw new Error(`Could not inspect ${behavior?.source || baseName}: ${error?.message || error}`, { cause: error });
            }

            // A Sub-SM exposes exactly the events forwarded by Nop states
            // inside the child machine. Do not invent generic success/failure
            // tokens: an empty child interface should remain visibly empty.
            const events = behaviorEvents.map((eventId) => ({ id: eventId }));

            return {
                id: getNodeId(),
                position,
                type: "submachine",
                data: {
                    label: baseName,
                    fullSkillName: baseName,
                    src: behavior.source,
                    isInitial: false,
                    events,
                    inheritedSlots,
                    localDataModel,
                    onEntry: [],
                    onExit: [],
                    onOpenSubMachine: handleOpenSubMachine,
                },
            };
        },
        [behaviorDirectories, fetchSkillData, handleOpenSubMachine]
    );

    const createNode = useCallback(
        async (selectedSkill, nodeid, position) => {
            const data = await fetchSkillData(selectedSkill);
            if (!data) {
                throw new Error(`Could not load ${selectedSkill}. Check the Bonsai backend and try again.`);
            }
            const baseSkillLabel = selectedSkill.split(".").pop() || selectedSkill;
            const isFinalSkill =
                baseSkillLabel.toLowerCase() === "end" ||
                baseSkillLabel.toLowerCase() === "fatal";
            const exposesBuiltInEvents =
                selectedSkill.split(".").pop() !== "End" &&
                selectedSkill.split(".").pop() !== "Fatal";

            const createNameForSkill = (fullSkillName) => {
                const label = fullSkillName.split(".").pop();
                const count = nodes.filter(
                    (node) =>
                        !isEditorCloneNode(node) && node.data?.label === label
                ).length;
                return `${fullSkillName}#${count + 1}`;
            };

            let sharedEditorInstanceId;
            if (isFinalSkill) {
                const sharedStateId = selectedSkill.split("#")[0];
                const usedIds = new Set(
                    nodes
                        .filter((node) => {
                            const candidate = normalizeSharedScxmlStateIdentity(node);
                            return (
                                getSharedScxmlStateId(candidate) === sharedStateId
                            );
                        })
                        .map((node) =>
                            String(node.data?.editorInstanceId || "").trim()
                        )
                        .filter(Boolean)
                );

                let index = 1;
                while (usedIds.has(String(index))) index += 1;
                sharedEditorInstanceId = String(index);
            }

            return {
                id: nodeid,
                position,
                type: "custom",
                data: {
                    label: baseSkillLabel,
                    fullSkillName: isFinalSkill
                        ? selectedSkill.split("#")[0]
                        : createNameForSkill(selectedSkill),
                    ...(isFinalSkill
                        ? {
                            scxmlStateId: selectedSkill.split("#")[0],
                            editorInstanceId: sharedEditorInstanceId,
                        }
                        : {}),
                    description: data.description || "",
                    isInitial: false,
                    isFinal: isFinalSkill,
                    src: "",
                    onEntry: [],
                    onExit: [],
                    events: [
                        ...(data.events || []).map((event) => ({
                            id: event.event,
                            description: event.description || "",
                            selectedPackage: "",
                            selectedSkill: "",
                            target: null,
                            cond: "",
                            assignments: [],
                            assignLocation: "",
                            assignExpr: "",
                        })),
                        ...(exposesBuiltInEvents
                            ? [
                                {
                                    id: "fatal",
                                    selectedPackage: "",
                                    selectedSkill: "",
                                    target: null,
                                    cond: "",
                                    assignments: [],
                                    assignLocation: "",
                                    assignExpr: "",
                                },
                                {
                                    id: "*",
                                    selectedPackage: "",
                                    selectedSkill: "",
                                    target: null,
                                    cond: "",
                                    assignments: [],
                                    assignLocation: "",
                                    assignExpr: "",
                                },
                            ]
                            : []),
                    ],
                    sensors: data.sensors || [],
                    actuators: data.actuator || data.actuators || [],
                    inSlots: (data.inSlots || []).map((slot) => ({
                        key: slot.key,
                        type: slot.type,
                        description: slot.description || "",
                        path: "",
                        inherited: null,
                    })),
                    outSlots: (data.outSlots || []).map((slot) => ({
                        key: slot.key,
                        type: slot.type,
                        description: slot.description || "",
                        path: "",
                        inherited: null,
                    })),
                    params: (data.params || []).map((param) => ({
                        key: param.key,
                        type: param.type,
                        required: param.required,
                        default: param.default,
                        description: param.description || "",
                    })),
                },
            };
        },
        [fetchSkillData, nodes]
    );

    return {
        handleOpenBehaviorFile,
        createBehaviorNode,
        createNode,
    };
}
