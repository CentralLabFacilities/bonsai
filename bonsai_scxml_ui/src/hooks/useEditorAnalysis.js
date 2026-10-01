import { useEffect, useMemo, useRef, useState } from "react";
import {
    getSlotPathFromNode,
    normalizeSlotPath,
    normalizeSlotType,
} from "../utils/editorGraph";
import { buildEditorValidationRequest } from "../utils/editorValidation";
import {
    buildSlotAncestryRequest,
    slotAncestryResponseToMap,
} from "../utils/slotAnalysis";
import { buildTransitionAnalysisRequest } from "../utils/transitionAnalysisRequest";
import {
    analyzeEditorTransitions,
    isTauri,
    resolveEditorSlotAncestry,
    validateEditorWorkflow,
} from "../tauri-client";

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
    const [ancestorSlotSourcesByPath, setAncestorSlotSourcesByPath] = useState(
        () => new Map()
    );
    const slotAncestryRevisionRef = useRef(0);

    const slotAncestryRequest = useMemo(
        () =>
            buildSlotAncestryRequest({
                tabs,
                activeTabId,
                nodes: semanticNodes,
                manualSlots,
                slotNodes: semanticSlotNodes,
            }),
        [tabs, activeTabId, semanticNodes, manualSlots, semanticSlotNodes]
    );

    useEffect(() => {
        // Keep Slot Details stable while React Flow emits intermediate drag
        // states. The ancestry relationship cannot change until the drag has
        // completed, so there is no reason to cross the IPC boundary here.
        if (isDraggingNode) return undefined;

        const revision = ++slotAncestryRevisionRef.current;
        let cancelled = false;

        const commit = (next) => {
            if (cancelled || revision !== slotAncestryRevisionRef.current) {
                return;
            }
            setAncestorSlotSourcesByPath(next);
        };

        if (!isTauri()) {
            // Browser/Vite mode is UI-only. Semantic ancestry is owned by the
            // Rust backend and is intentionally unavailable without Tauri.
            commit(new Map());
            return () => {
                cancelled = true;
            };
        }

        // Several node/slot state updates commonly happen in the same React
        // turn. Coalesce them so Rust receives only the final semantic snapshot.
        const timer = window.setTimeout(async () => {
            try {
                const response = await resolveEditorSlotAncestry(
                    slotAncestryRequest
                );
                commit(slotAncestryResponseToMap(response));
            } catch (error) {
                console.error("Rust slot ancestry failed:", error);
                // Desktop mode treats Rust as the semantic authority. Do not
                // silently project a second implementation after an IPC/backend
                // failure because that can hide Rust/JavaScript divergence.
                commit(new Map());
            }
        }, 30);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        isDraggingNode,
        slotAncestryRequest,
        tabs,
        activeTabId,
        semanticNodes,
        semanticSlotNodes,
        manualSlots,
    ]);

    const transitionAnalysisRequest = useMemo(
        () =>
            buildTransitionAnalysisRequest({
                selectedNode: selectedRawNode,
                nodes: semanticNodes,
                edges,
            }),
        [selectedRawNode, semanticNodes, edges]
    );

    const [selectedContainerOutgoingTransitions, setSelectedContainerOutgoingTransitions] =
        useState([]);
    const transitionAnalysisRevisionRef = useRef(0);

    useEffect(() => {
        const revision = ++transitionAnalysisRevisionRef.current;
        let cancelled = false;

        const selectedIsContainer =
            selectedRawNode?.type === "compound" ||
            selectedRawNode?.type === "parallel";
        if (!selectedIsContainer) {
            setSelectedContainerOutgoingTransitions([]);
            return () => {
                cancelled = true;
            };
        }

        // Boundary metadata is normalized after a drag completes. Avoid
        // analyzing transient helper edges while the node is still moving.
        if (isDraggingNode) {
            return () => {
                cancelled = true;
            };
        }

        const commit = (next) => {
            if (cancelled || revision !== transitionAnalysisRevisionRef.current) {
                return;
            }
            setSelectedContainerOutgoingTransitions(
                Array.isArray(next) ? next : []
            );
        };

        if (!isTauri()) {
            // Browser/Vite mode is UI-only. Container transition semantics are
            // resolved exclusively by the Rust backend.
            commit([]);
            return () => {
                cancelled = true;
            };
        }

        analyzeEditorTransitions(transitionAnalysisRequest)
            .then(commit)
            .catch((error) => {
                console.error("Rust transition analysis failed:", error);
                // Avoid displaying stale or independently-derived semantics in
                // desktop mode when the authoritative Rust analysis fails.
                commit([]);
            });

        return () => {
            cancelled = true;
        };
    }, [
        isDraggingNode,
        transitionAnalysisRequest,
        selectedRawNode,
        semanticNodes,
        edges,
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

        if (!isTauri()) {
            // Browser/Vite mode intentionally has no semantic validator. Rust
            // is the single source of truth for workflow validation.
            commitProblems([]);
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
                console.error("Rust editor validation failed:", error);
                const message = String(
                    error?.message || error || "Unknown Rust validation error"
                );
                commitProblems([
                    {
                        id: "rust-validation-failed",
                        severity: "error",
                        category: "Workflow",
                        title: "Workflow validation unavailable",
                        message: `Rust validation failed: ${message}`,
                    },
                ]);
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
        selectedContainerOutgoingTransitions,
        editorProblems,
        errorProblemCount,
    };
}
