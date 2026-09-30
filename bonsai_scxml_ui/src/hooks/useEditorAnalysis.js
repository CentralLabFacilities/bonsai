import { useEffect, useMemo, useRef, useState } from "react";
import {
    buildEditorProblems,
    getAncestorSlotSourcesByPath,
    getSlotPathFromNode,
    normalizeSlotPath,
    normalizeSlotType,
} from "../utils/editorGraph";
import { buildEditorValidationRequest } from "../utils/editorValidation";
import { isTauri, validateEditorWorkflow } from "../tauri-client";

export function useEditorAnalysis({
    tabs,
    activeTabId,
    semanticNodes,
    semanticSlotNodes,
    manualSlots,
    isDraggingNode,
    selectedRawNode,
    edges,
    globalDataModel,
    availableDataModel = globalDataModel,
    behaviorDirectories,
}) {
    const ancestorSlotSourcesCacheRef = useRef(new Map());
    const ancestorSlotSourcesByPath = useMemo(() => {
        if (isDraggingNode) {
            return ancestorSlotSourcesCacheRef.current;
        }

        const next = getAncestorSlotSourcesByPath(tabs, activeTabId, {
            nodes: semanticNodes,
            slotNodes: semanticSlotNodes,
            manualSlots,
        });
        ancestorSlotSourcesCacheRef.current = next;
        return next;
    }, [
        isDraggingNode,
        tabs,
        activeTabId,
        semanticNodes,
        semanticSlotNodes,
        manualSlots,
    ]);

    const selectedSlotDetails = useMemo(() => {
        if (!selectedRawNode || selectedRawNode.type !== "slot") {
            return null;
        }

        const cleanPath = getSlotPathFromNode(selectedRawNode);
        const skillAccesses = [];
        const accessTypes = new Set();
        const dataTypes = new Set();

        semanticNodes.forEach((node) => {
            const skillName =
                node.data?.fullSkillName || node.data?.label || node.id;

            (node.data?.inSlots || []).forEach((slot, slotIndex) => {
                if (normalizeSlotPath(slot?.path) !== cleanPath) return;
                accessTypes.add("read");
                if (slot?.type) dataTypes.add(String(slot.type));
                skillAccesses.push({
                    nodeId: node.id,
                    skillName,
                    key: slot?.key || `input ${slotIndex + 1}`,
                    type: slot?.type || "Unknown",
                    description: slot?.description || "",
                    access: "read",
                    slotIndex,
                });
            });

            (node.data?.outSlots || []).forEach((slot, slotIndex) => {
                if (normalizeSlotPath(slot?.path) !== cleanPath) return;
                accessTypes.add("write");
                if (slot?.type) dataTypes.add(String(slot.type));
                skillAccesses.push({
                    nodeId: node.id,
                    skillName,
                    key: slot?.key || `output ${slotIndex + 1}`,
                    type: slot?.type || "Unknown",
                    description: slot?.description || "",
                    access: "write",
                    slotIndex,
                });
            });
        });

        (selectedRawNode.data?.requiredByChildren || []).forEach((entry) => {
            if (entry?.access === "read" || entry?.access === "write") {
                accessTypes.add(entry.access);
            }
        });

        const nodeType = String(selectedRawNode.data?.slotType || "").trim();
        const dataType =
            dataTypes.size === 1
                ? [...dataTypes][0]
                : nodeType ||
                  (dataTypes.size > 1 ? [...dataTypes].join(" / ") : "Unknown");

        const ancestorSlotAccesses =
            ancestorSlotSourcesByPath.get(cleanPath) || [];

        return {
            path: cleanPath ? `/${cleanPath}` : "",
            dataType,
            accessTypes: ["read", "write"].filter((access) =>
                accessTypes.has(access)
            ),
            isInherited: Boolean(selectedRawNode.data?.currentMachineInherited),
            skillAccesses,
            ancestorSlotAccesses,
        };
    }, [selectedRawNode, semanticNodes, ancestorSlotSourcesByPath]);

    const canvasSlotPathOptions = useMemo(() => {
        const options = new Map();

        const addOption = (slot) => {
            const cleanPath = normalizeSlotPath(slot?.path);
            const type = String(slot?.type || "").trim();
            if (!cleanPath || !type) return;

            const key = `${cleanPath}|${normalizeSlotType(type)}`;
            if (!options.has(key)) {
                options.set(key, {
                    path: `/${cleanPath}`,
                    type,
                });
            }
        };

        semanticNodes.forEach((node) => {
            (node.data?.inSlots || []).forEach(addOption);
            (node.data?.outSlots || []).forEach(addOption);
        });
        (manualSlots || []).forEach(addOption);

        return [...options.values()].sort((a, b) =>
            a.path.localeCompare(b.path)
        );
    }, [semanticNodes, manualSlots]);

    const canvasSkillSlotOptions = useMemo(() => {
        const options = [];

        semanticNodes.forEach((node) => {
            if (node.type !== "custom") return;

            const nodeLabel =
                node.data?.fullSkillName || node.data?.label || node.id;

            (node.data?.inSlots || []).forEach((slot, index) => {
                if (!slot?.key || !String(slot?.type || "").trim()) return;
                if (slot.path && slot.path.trim()) return;
                options.push({
                    id: `${node.id}-read-${index}`,
                    nodeId: node.id,
                    nodeLabel,
                    access: "read",
                    slotIndex: index,
                    key: slot.key,
                    type: slot.type,
                });
            });

            (node.data?.outSlots || []).forEach((slot, index) => {
                if (!slot?.key || !String(slot?.type || "").trim()) return;
                if (slot.path && slot.path.trim()) return;
                options.push({
                    id: `${node.id}-write-${index}`,
                    nodeId: node.id,
                    nodeLabel,
                    access: "write",
                    slotIndex: index,
                    key: slot.key,
                    type: slot.type,
                });
            });
        });

        return options;
    }, [semanticNodes]);

    const activeWorkflowTab = useMemo(
        () => tabs.find((tab) => tab.id === activeTabId) || null,
        [tabs, activeTabId]
    );

    const isBehaviorWorkflow = Boolean(
        activeWorkflowTab?.sourcePath || activeWorkflowTab?.parentTabId
    );

    const validationRequest = useMemo(
        () =>
            buildEditorValidationRequest({
                nodes: semanticNodes,
                edges,
                globalDataModel,
                availableDataModel,
                behaviorDirectories,
                isBehaviorWorkflow,
                manualSlots,
                ancestorSlotSourcesByPath,
                currentSlotNodes: semanticSlotNodes,
            }),
        [
            semanticNodes,
            edges,
            globalDataModel,
            availableDataModel,
            behaviorDirectories,
            isBehaviorWorkflow,
            manualSlots,
            ancestorSlotSourcesByPath,
            semanticSlotNodes,
        ]
    );

    const [editorProblems, setEditorProblems] = useState([]);
    const validationRevisionRef = useRef(0);

    useEffect(() => {
        // Validation is deliberately frozen while a node is being dragged.
        // React Flow emits many intermediate graph updates during a drag and
        // none of those need a Rust IPC round-trip.
        if (isDraggingNode) return undefined;

        const revision = ++validationRevisionRef.current;
        let cancelled = false;

        const commitProblems = (next) => {
            if (cancelled || revision !== validationRevisionRef.current) return;
            setEditorProblems(next);
        };

        const validateWithJavascript = () =>
            buildEditorProblems(
                semanticNodes,
                edges,
                globalDataModel,
                behaviorDirectories,
                isBehaviorWorkflow,
                manualSlots,
                ancestorSlotSourcesByPath,
                semanticSlotNodes,
                availableDataModel
            );

        if (!isTauri()) {
            commitProblems(validateWithJavascript());
            return () => {
                cancelled = true;
            };
        }

        // Coalesce bursts caused by one editor operation (for example moving a
        // state into a container updates several pieces of semantic state).
        const timer = window.setTimeout(async () => {
            try {
                const next = await validateEditorWorkflow(validationRequest);
                commitProblems(Array.isArray(next) ? next : []);
            } catch (error) {
                console.error(
                    "Rust editor validation failed; using JavaScript fallback:",
                    error
                );
                commitProblems(validateWithJavascript());
            }
        }, 40);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        isDraggingNode,
        validationRequest,
        semanticNodes,
        edges,
        globalDataModel,
        availableDataModel,
        behaviorDirectories,
        isBehaviorWorkflow,
        manualSlots,
        ancestorSlotSourcesByPath,
        semanticSlotNodes,
    ]);

    const errorProblemCount = useMemo(
        () =>
            editorProblems.filter((problem) => problem.severity === "error")
                .length,
        [editorProblems]
    );

    return {
        ancestorSlotSourcesByPath,
        selectedSlotDetails,
        canvasSlotPathOptions,
        canvasSkillSlotOptions,
        editorProblems,
        errorProblemCount,
    };
}
