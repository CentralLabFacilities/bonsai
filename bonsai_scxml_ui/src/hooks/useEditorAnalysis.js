import { useEffect, useMemo, useRef, useState } from "react";
import {
    getSlotPathFromNode,
    normalizeSlotPath,
    normalizeSlotType,
} from "../utils/editorGraph";
import { buildActiveValidationRequest } from "../utils/editorValidation";
import { measureEditorAsync, measureEditorTask } from "../utils/editorPerf";
import { slotDebug, summarizeProblems } from "../utils/slotDebug";
import {
    buildActiveSlotAncestryRequest,
    slotAncestryResponseToMap,
} from "../utils/slotAnalysis";
import { buildTransitionAnalysisRequest } from "../utils/transitionAnalysisRequest";
import {
    analyzeEditorTransitions,
    isTauri,
    resolveActiveEditorSlotAncestry,
    validateActiveWorkflow,
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
    runRustReadQuery = null,
    validationRevision = 0,
}) {
    const [ancestorSlotSourcesByPath, setAncestorSlotSourcesByPath] = useState(
        () => new Map()
    );
    const slotAncestryRevisionRef = useRef(0);

    const slotAncestryRequest = useMemo(
        () =>
            measureEditorTask(
                "Build slot ancestry request",
                () =>
                    buildActiveSlotAncestryRequest({
                        tabs,
                        activeTabId,
                    }),
                {
                    tabs: tabs?.length || 0,
                    activeTabId,
                }
            ),
        [tabs, activeTabId]
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
                const response = await measureEditorAsync(
                    "IPC resolve slot ancestry",
                    () => {
                        const query = () =>
                            resolveActiveEditorSlotAncestry(slotAncestryRequest);
                        return runRustReadQuery
                            ? runRustReadQuery("slot-ancestry", query)
                            : query();
                    },
                    {
                        tabs: slotAncestryRequest?.tabs?.length || 0,
                    }
                );
                if (response !== null && response !== undefined) {
                    commit(slotAncestryResponseToMap(response));
                }
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
        runRustReadQuery,
    ]);

    const selectedIsContainer = selectedRawNode?.type === "compound" ||
        selectedRawNode?.type === "parallel";
    const selectedContainerId = selectedIsContainer ? selectedRawNode.id : null;
    const selectedContainerType = selectedIsContainer ? selectedRawNode.type : null;
    const transitionRequestCandidate = useMemo(() => {
        const request = buildTransitionAnalysisRequest({
                selectedNode: selectedContainerId
                    ? { id: selectedContainerId, type: selectedContainerType }
                    : null,
                nodes: semanticNodes,
                edges,
            });
        return { request, signature: JSON.stringify(request) };
    }, [selectedContainerId, selectedContainerType, semanticNodes, edges]);
    const [transitionRequestSnapshot, setTransitionRequestSnapshot] = useState(transitionRequestCandidate);
    const requestChanged = transitionRequestCandidate.signature !== transitionRequestSnapshot.signature;
    const transitionAnalysisRequest = requestChanged
        ? transitionRequestCandidate.request
        : transitionRequestSnapshot.request;
    // Only backend-consumed metadata invalidates analysis. Selection and manual
    // control points are omitted by the request builder and should not issue IPC.
    if (requestChanged) setTransitionRequestSnapshot(transitionRequestCandidate);

    const [selectedContainerOutgoingTransitions, setSelectedContainerOutgoingTransitions] =
        useState([]);
    const transitionAnalysisRevisionRef = useRef(0);
    if (!selectedIsContainer && selectedContainerOutgoingTransitions.length > 0) {
        setSelectedContainerOutgoingTransitions([]);
    }

    useEffect(() => {
        const revision = ++transitionAnalysisRevisionRef.current;
        let cancelled = false;

        if (!selectedIsContainer) {
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
            return () => {
                cancelled = true;
            };
        }

        measureEditorAsync(
            "IPC analyze container transitions",
            () => analyzeEditorTransitions(transitionAnalysisRequest),
            {
                nodes: transitionAnalysisRequest.nodes.length,
                edges: transitionAnalysisRequest.edges.length,
            }
        )
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
        selectedIsContainer,
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

        const childSlotAccesses = selectedRawNode.data?.requiredByChildren || [];
        childSlotAccesses.forEach((entry) => {
            if (entry?.access === "read" || entry?.access === "write") {
                accessTypes.add(entry.access);
            }
        });

        const descendantSkillAccesses = [];
        const unresolvedChildAccesses = [];
        const seenDescendantAccesses = new Set();

        childSlotAccesses.forEach((entry, index) => {
            const skillName = String(entry?.skillName || "").trim();
            if (!skillName) {
                unresolvedChildAccesses.push(entry);
                return;
            }

            const subMachinePath = [
                entry?.childLabel,
                ...(Array.isArray(entry?.subMachinePath)
                    ? entry.subMachinePath
                    : []),
            ].filter(Boolean);
            const key = [
                subMachinePath.join("/"),
                entry?.skillNodeId || skillName,
                entry?.access || "inherit",
                entry?.slotKey || entry?.slotPath || index,
            ].join("|");
            if (seenDescendantAccesses.has(key)) return;
            seenDescendantAccesses.add(key);

            descendantSkillAccesses.push({
                nodeId: entry?.skillNodeId || null,
                skillName,
                key: entry?.slotKey || "",
                type: entry?.type || selectedRawNode.data?.slotType || "Unknown",
                description: entry?.description || "",
                access: entry?.access || "inherit",
                slotPath: entry?.slotPath || cleanPath,
                childNodeId: entry?.childNodeId || null,
                childLabel: entry?.childLabel || "Sub-state machine",
                subMachinePath,
                sourceKind: "descendant-skill",
                hierarchyKind: "descendant",
            });
        });

        // Open descendant tabs contain the full child graph, so include their
        // concrete inherited-slot consumers as well. This catches deeper open
        // Sub-SMs without recursively loading the entire behavior tree.
        const childTabsByParent = new Map();
        (tabs || []).forEach((tab) => {
            if (!tab?.parentTabId) return;
            const siblings = childTabsByParent.get(tab.parentTabId) || [];
            siblings.push(tab);
            childTabsByParent.set(tab.parentTabId, siblings);
        });

        const descendantQueue = (childTabsByParent.get(activeTabId) || []).map(
            (tab) => ({
                tab,
                hierarchy: [tab.title || tab.fileName || "Sub-state machine"],
            })
        );
        const visitedDescendantTabs = new Set();

        while (descendantQueue.length > 0) {
            const { tab, hierarchy } = descendantQueue.shift();
            if (!tab?.id || visitedDescendantTabs.has(tab.id)) continue;
            visitedDescendantTabs.add(tab.id);

            (tab.nodes || []).forEach((node) => {
                const skillName =
                    node.data?.fullSkillName || node.data?.label || node.id;

                const addOpenTabAccess = (slot, access, slotIndex) => {
                    if (!slot?.inherited) return;
                    accessTypes.add(access);
                    const inheritedPath = normalizeSlotPath(
                        slot?.inherited?.xpath || slot?.path
                    );
                    if (inheritedPath !== cleanPath) return;

                    const key = [
                        hierarchy.join("/"),
                        node.id || skillName,
                        access,
                        slot?.key || slotIndex,
                    ].join("|");
                    if (seenDescendantAccesses.has(key)) return;
                    seenDescendantAccesses.add(key);

                    descendantSkillAccesses.push({
                        nodeId: node.id,
                        skillName,
                        key:
                            slot?.key ||
                            `${access === "read" ? "input" : "output"} ${
                                slotIndex + 1
                            }`,
                        type: slot?.type || "Unknown",
                        description: slot?.description || "",
                        access,
                        slotPath: inheritedPath,
                        childNodeId: null,
                        childLabel: hierarchy[0] || "Sub-state machine",
                        subMachinePath: hierarchy,
                        sourceTabId: tab.id,
                        sourceKind: "descendant-skill",
                        hierarchyKind: "descendant",
                    });
                };

                (node.data?.inSlots || []).forEach((slot, slotIndex) =>
                    addOpenTabAccess(slot, "read", slotIndex)
                );
                (node.data?.outSlots || []).forEach((slot, slotIndex) =>
                    addOpenTabAccess(slot, "write", slotIndex)
                );
            });

            (childTabsByParent.get(tab.id) || []).forEach((childTab) => {
                descendantQueue.push({
                    tab: childTab,
                    hierarchy: [
                        ...hierarchy,
                        childTab.title ||
                            childTab.fileName ||
                            "Sub-state machine",
                    ],
                });
            });
        }

        descendantSkillAccesses.sort((left, right) => {
            const leftPath = (left.subMachinePath || []).join(" / ");
            const rightPath = (right.subMachinePath || []).join(" / ");
            return (
                leftPath.localeCompare(rightPath) ||
                left.skillName.localeCompare(right.skillName) ||
                String(left.access).localeCompare(String(right.access))
            );
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
            descendantSkillAccesses,
            childSlotAccesses: unresolvedChildAccesses,
        };
    }, [
        selectedRawNode,
        semanticNodes,
        ancestorSlotSourcesByPath,
        tabs,
        activeTabId,
    ]);

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
            measureEditorTask(
                "Build validation request",
                () =>
                    buildActiveValidationRequest({
                        nodes: semanticNodes,
                        availableDataModel,
                        behaviorDirectories,
                        isBehaviorWorkflow,
                        ancestorSlotSourcesByPath,
                    }),
                {
                    nodes: semanticNodes?.length || 0,
                    overlays: semanticNodes?.length || 0,
                }
            ),
        [
            semanticNodes,
            availableDataModel,
            behaviorDirectories,
            isBehaviorWorkflow,
            ancestorSlotSourcesByPath,
        ]
    );

    const [editorProblems, setEditorProblems] = useState([]);
    const validationRevisionRef = useRef(0);
    const semanticNodeCount = semanticNodes?.length || 0;
    const edgeCount = edges?.length || 0;
    const manualSlotCount = manualSlots?.length || 0;

    useEffect(() => {
        // Validation is deliberately frozen while a node is being dragged.
        // React Flow emits many intermediate graph updates during a drag and
        // none of those need a Rust IPC round-trip.
        if (isDraggingNode) return undefined;

        const revision = ++validationRevisionRef.current;
        let cancelled = false;

        slotDebug("validation: effect scheduled", {
            effectRevision: revision,
            validationRevision,
            overlays: validationRequest?.nodeOverlays?.length || 0,
            semanticNodes: semanticNodeCount,
            edges: edgeCount,
            manualSlots: manualSlotCount,
        });

        const commitProblems = (next) => {
            if (cancelled || revision !== validationRevisionRef.current) {
                slotDebug("validation: result discarded", {
                    effectRevision: revision,
                    currentEffectRevision: validationRevisionRef.current,
                    cancelled,
                });
                return;
            }
            // Always commit a fresh array with fresh problem objects.  The
            // Problems panel is intentionally small, so correctness is more
            // important here than preserving object identity across validation
            // runs.  This also protects the UI if the Tauri bridge ever reuses
            // a result array/object reference.
            const normalized = Array.isArray(next)
                ? next.map((problem) => ({ ...problem }))
                : [];
            slotDebug("validation: Problems panel committed", {
                effectRevision: revision,
                validationRevision,
                problemCount: normalized.length,
                problems: summarizeProblems(normalized),
            });
            setEditorProblems(normalized);
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
                slotDebug("validation: Rust query begin", {
                    effectRevision: revision,
                    validationRevision,
                    overlays: validationRequest?.nodeOverlays?.length || 0,
                });
                const next = await measureEditorAsync(
                    "IPC validate editor workflow",
                    () => {
                        const query = () => validateActiveWorkflow(validationRequest);
                        return runRustReadQuery
                            ? runRustReadQuery("validation", query)
                            : query();
                    },
                    {
                        overlays: validationRequest?.nodeOverlays?.length || 0,
                    }
                );
                if (next !== null && next !== undefined) {
                    slotDebug("validation: Rust query returned", {
                        effectRevision: revision,
                        validationRevision,
                        problemCount: Array.isArray(next) ? next.length : 0,
                        problems: summarizeProblems(
                            Array.isArray(next) ? next : []
                        ),
                    });
                    commitProblems(Array.isArray(next) ? next : []);
                } else {
                    slotDebug("validation: Rust query returned no result", {
                        effectRevision: revision,
                        validationRevision,
                    });
                }
            } catch (error) {
                slotDebug("validation: Rust query failed", {
                    effectRevision: revision,
                    validationRevision,
                    error: String(error?.message || error || "Unknown error"),
                });
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
        }, 100);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        isDraggingNode,
        validationRequest,
        semanticNodeCount,
        edgeCount,
        manualSlotCount,
        runRustReadQuery,
        validationRevision,
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
