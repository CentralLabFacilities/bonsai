import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    getSlotPathFromNode,
    normalizeSlotPath,
} from "../utils/editorGraph";
import { buildRuntimeReplayContexts } from "../utils/runtimeReplayContexts";
import {
    parseRuntimeLogForReplay,
    prepareRuntimeReplayCacheForReplay,
} from "../utils/runtimeRust";

const EMPTY_RUNTIME_SET = new Set();

const yieldRuntimePreparationFrame = () =>
    new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve();
            return;
        }
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });

const hashRuntimeReplayValue = (seed, value) => {
    let hash = seed >>> 0;
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const buildRuntimeReplayCacheKey = (text, contexts = []) => {
    let hash = 2166136261;
    hash = hashRuntimeReplayValue(hash, text);

    (contexts || []).forEach((context) => {
        hash = hashRuntimeReplayValue(hash, context.tabId);
        hash = hashRuntimeReplayValue(hash, context.parentTabId);
        hash = hashRuntimeReplayValue(hash, (context.suffixParts || []).join("#"));
        (context.nodes || []).forEach((node) => {
            hash = hashRuntimeReplayValue(hash, node.id);
            hash = hashRuntimeReplayValue(hash, node.type);
            hash = hashRuntimeReplayValue(hash, node.parentId);
            hash = hashRuntimeReplayValue(hash, node.data?.fullSkillName);
            hash = hashRuntimeReplayValue(hash, node.data?.label);
            hash = hashRuntimeReplayValue(
                hash,
                JSON.stringify(node.data?.inSlots || [])
            );
            hash = hashRuntimeReplayValue(
                hash,
                JSON.stringify(node.data?.outSlots || [])
            );
        });
        (context.edges || []).forEach((edge) => {
            hash = hashRuntimeReplayValue(hash, edge.id);
            hash = hashRuntimeReplayValue(hash, edge.source);
            hash = hashRuntimeReplayValue(hash, edge.target);
            hash = hashRuntimeReplayValue(hash, edge.sourceHandle);
            hash = hashRuntimeReplayValue(hash, edge.targetHandle);
            hash = hashRuntimeReplayValue(hash, edge.data?.event);
            hash = hashRuntimeReplayValue(hash, edge.data?.path);
            hash = hashRuntimeReplayValue(hash, edge.data?.access);
        });
        (context.slotNodes || []).forEach((node) => {
            hash = hashRuntimeReplayValue(hash, node.id);
            hash = hashRuntimeReplayValue(hash, node.data?.path);
            hash = hashRuntimeReplayValue(hash, node.data?.label);
        });
        (context.slotEdges || []).forEach((edge) => {
            hash = hashRuntimeReplayValue(hash, edge.id);
            hash = hashRuntimeReplayValue(hash, edge.source);
            hash = hashRuntimeReplayValue(hash, edge.target);
            hash = hashRuntimeReplayValue(hash, edge.data?.path);
            hash = hashRuntimeReplayValue(hash, edge.data?.access);
            hash = hashRuntimeReplayValue(hash, edge.data?.slotKey);
        });
        (context.globalDataModel || []).forEach((entry) => {
            hash = hashRuntimeReplayValue(hash, entry?.id);
            hash = hashRuntimeReplayValue(hash, entry?.expr);
        });
    });

    return `${text.length}:${hash.toString(16)}`;
};

const appendRuntimeClass = (className, nextClass) => {
    const classes = String(className || "")
        .split(/\s+/)
        .filter(Boolean);
    if (!classes.includes(nextClass)) classes.push(nextClass);
    return classes.join(" ");
};

/**
 * Owns runtime-log loading, Rust replay preparation, playback state and the
 * temporary graph decorations used to visualize one execution trace.
 *
 * Keeping this controller outside App means runtime playback stays isolated
 * from normal editor selection/mutation state and can evolve independently of
 * the main graph orchestration.
 */
export function useRuntimeReplay({
    tabs,
    activeTabId,
    nodes,
    edges,
    slotNodes,
    slotEdges,
    globalDataModel,
    visibleNodes,
    visibleEdges,
    fitView,
    switchTab,
    setActiveMode,
}) {
    const [runtimeLog, setRuntimeLog] = useState(null);
    const [runtimeReplayCache, setRuntimeReplayCache] = useState(null);
    const [runtimePreparation, setRuntimePreparation] = useState(null);
    const [runtimeStepIndex, setRuntimeStepIndex] = useState(0);
    const [runtimeStarted, setRuntimeStarted] = useState(false);
    const [runtimeTraceNeedsFit, setRuntimeTraceNeedsFit] = useState(false);
    const [runtimePlaying, setRuntimePlaying] = useState(false);
    const [runtimePlaybackDelay, setRuntimePlaybackDelay] = useState(800);
    const [runtimeChangesPanelOpen, setRuntimeChangesPanelOpen] = useState(true);
    const [runtimeFocusRequest, setRuntimeFocusRequest] = useState(0);
    const runtimeFocusHandledRef = useRef(-1);
    const runtimeReplayContextsRef = useRef([]);
    const runtimeReplayCacheStoreRef = useRef(new Map());
    const runtimeLoadRequestRef = useRef(0);

    const runtimeReplayContexts = useMemo(
        () =>
            buildRuntimeReplayContexts(tabs, activeTabId, {
                nodes,
                edges,
                slotNodes,
                slotEdges,
                globalDataModel,
            }),
        [
            tabs,
            activeTabId,
            nodes,
            edges,
            slotNodes,
            slotEdges,
            globalDataModel,
        ]
    );

    useEffect(() => {
        runtimeReplayContextsRef.current = runtimeReplayContexts;
    }, [runtimeReplayContexts]);

    const handleLoadRuntimeLog = useCallback(
        async (text, fileName = "runtime.log") => {
            const requestId = runtimeLoadRequestRef.current + 1;
            runtimeLoadRequestRef.current = requestId;
            setRuntimePlaying(false);
            setRuntimePreparation({
                fileName,
                phase: "Reading runtime log…",
                progress: 0.08,
            });
            // Runtime playback also visualizes slot values, so always use the
            // overview mode where both state and slot nodes are mounted.
            setActiveMode("overview");

            try {
                // Yield once before doing any parsing so the loading screen is
                // guaranteed to paint, even for a very large local log file.
                await yieldRuntimePreparationFrame();
                if (runtimeLoadRequestRef.current !== requestId) return;

                const contexts = runtimeReplayContextsRef.current || [];
                const cacheKey = buildRuntimeReplayCacheKey(text, contexts);
                const cached = runtimeReplayCacheStoreRef.current.get(cacheKey);

                let parsed;
                let prepared;

                if (cached) {
                    setRuntimePreparation({
                        fileName,
                        phase: "Loading cached replay…",
                        progress: 0.9,
                    });
                    await yieldRuntimePreparationFrame();
                    if (runtimeLoadRequestRef.current !== requestId) return;
                    parsed = { ...cached.log, fileName };
                    prepared = cached.cache;
                    runtimeReplayCacheStoreRef.current.delete(cacheKey);
                    runtimeReplayCacheStoreRef.current.set(cacheKey, cached);
                } else {
                    setRuntimePreparation({
                        fileName,
                        phase: "Parsing transitions and runtime values…",
                        progress: 0.16,
                    });
                    await yieldRuntimePreparationFrame();
                    if (runtimeLoadRequestRef.current !== requestId) return;

                    parsed = {
                        ...(await parseRuntimeLogForReplay(text)),
                        fileName,
                    };

                    prepared = await prepareRuntimeReplayCacheForReplay(
                        parsed,
                        contexts,
                        {
                            onProgress: ({ phase, progress }) => {
                                if (runtimeLoadRequestRef.current !== requestId) {
                                    return;
                                }
                                setRuntimePreparation({
                                    fileName,
                                    phase,
                                    progress,
                                });
                            },
                            yieldControl: yieldRuntimePreparationFrame,
                        }
                    );

                    if (runtimeLoadRequestRef.current !== requestId) return;

                    const store = runtimeReplayCacheStoreRef.current;
                    store.set(cacheKey, { log: parsed, cache: prepared });
                    // Keep a small LRU-like in-memory cache. Re-loading a recent
                    // trace against the same graph becomes effectively instant
                    // without allowing large logs to accumulate indefinitely.
                    while (store.size > 4) {
                        const oldestKey = store.keys().next().value;
                        store.delete(oldestKey);
                    }
                }

                if (runtimeLoadRequestRef.current !== requestId) return;

                setRuntimeLog(parsed);
                setRuntimeReplayCache(prepared);
                setRuntimeStepIndex(0);
                setRuntimeStarted(false);
                setRuntimeTraceNeedsFit(true);
                setRuntimePlaying(false);
                setRuntimeChangesPanelOpen(true);
                setRuntimePreparation(null);
            } catch (error) {
                console.error("Failed to prepare runtime replay", error);
                if (runtimeLoadRequestRef.current === requestId) {
                    setRuntimePreparation(null);
                }
            }
        },
        [setActiveMode]
    );

    const handleClearRuntimeLog = useCallback(() => {
        runtimeLoadRequestRef.current += 1;
        setRuntimePlaying(false);
        setRuntimeStepIndex(0);
        setRuntimeStarted(false);
        setRuntimeTraceNeedsFit(false);
        setRuntimeLog(null);
        setRuntimeReplayCache(null);
        setRuntimePreparation(null);
    }, []);

    useEffect(() => {
        const stepCount = runtimeLog?.steps?.length || 0;
        if (!runtimePlaying || stepCount === 0) return undefined;

        const timer = window.setTimeout(() => {
            if (runtimeStepIndex >= stepCount - 1) {
                setRuntimePlaying(false);
                return;
            }

            setRuntimeStepIndex(runtimeStepIndex + 1);
            setRuntimeFocusRequest((value) => value + 1);
        }, runtimePlaybackDelay);

        return () => window.clearTimeout(timer);
    }, [
        runtimeLog,
        runtimePlaying,
        runtimeStepIndex,
        runtimePlaybackDelay,
    ]);

    // Runtime resolution is intentionally prepared once when the log is
    // loaded. Playback, timeline scrubbing and value rendering read from this
    // cache rather than re-resolving the full trace on every render.
    const resolvedRuntimeSteps = runtimeReplayCache?.resolvedSteps || [];
    const runtimeSlotTimeline = runtimeReplayCache?.slotTimeline || {
        snapshots: [],
        samples: [],
        unresolvedCount: 0,
    };
    const runtimeParameterTimeline = runtimeReplayCache?.parameterTimeline || {
        snapshots: [],
        samples: [],
        unresolvedCount: 0,
    };
    const runtimeChangesTimeline = runtimeReplayCache?.changesTimeline || {
        steps: [],
        dataSamples: [],
    };

    const activeRuntimeSlotSnapshot =
        runtimeStarted && runtimeSlotTimeline.snapshots.length > 0
            ? runtimeSlotTimeline.snapshots[
                  Math.min(
                      runtimeStepIndex,
                      runtimeSlotTimeline.snapshots.length - 1
                  )
              ] || {}
            : {};

    const activeRuntimeSlotValues =
        activeRuntimeSlotSnapshot[activeTabId] || {};

    const activeRuntimeParameterSnapshot =
        runtimeStarted && runtimeParameterTimeline.snapshots.length > 0
            ? runtimeParameterTimeline.snapshots[
                  Math.min(
                      runtimeStepIndex,
                      runtimeParameterTimeline.snapshots.length - 1
                  )
              ] || {}
            : {};

    const activeRuntimeParameterValues =
        activeRuntimeParameterSnapshot[activeTabId] || {};

    const activeRuntimeChanges =
        runtimeStarted && runtimeChangesTimeline.steps.length > 0
            ? runtimeChangesTimeline.steps[
                  Math.min(
                      runtimeStepIndex,
                      runtimeChangesTimeline.steps.length - 1
                  )
              ] || null
            : null;

    const activeRuntimeStep =
        runtimeStarted && resolvedRuntimeSteps.length > 0
            ? resolvedRuntimeSteps[
                  Math.min(runtimeStepIndex, resolvedRuntimeSteps.length - 1)
              ]
            : null;

    const activeRuntimeSlotEdgeIds = runtimeStarted
        ? runtimeReplayCache?.slotEdgeIdsByStep?.[
              Math.min(
                  runtimeStepIndex,
                  Math.max(
                      0,
                      (runtimeReplayCache?.slotEdgeIdsByStep?.length || 1) - 1
                  )
              )
          ]?.get(activeTabId) || EMPTY_RUNTIME_SET
        : EMPTY_RUNTIME_SET;

    const runtimeDisplayEdge = activeRuntimeStep?.edgeId
        ? runtimeReplayCache?.edgeByIdByTab
              ?.get(activeRuntimeStep.tabId || activeTabId)
              ?.get(activeRuntimeStep.edgeId) ||
          visibleEdges.find((edge) => edge.id === activeRuntimeStep.edgeId) ||
          null
        : null;

    const runtimeTraceEdgeIds =
        runtimeReplayCache?.traceEdgeIdsByTab?.get(activeTabId) ||
        EMPTY_RUNTIME_SET;

    const runtimeTraceNodeIds =
        runtimeReplayCache?.traceNodeIdsByTab?.get(activeTabId) ||
        EMPTY_RUNTIME_SET;

    // Before playback starts, frame the complete route once so loading a log
    // immediately presents the execution trace rather than the previous view.
    useEffect(() => {
        if (
            !runtimeLog ||
            runtimeStarted ||
            !runtimeTraceNeedsFit ||
            runtimeTraceNodeIds.size === 0
        ) {
            return undefined;
        }

        const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
        const traceNodes = Array.from(runtimeTraceNodeIds)
            .filter((id) => visibleNodeIds.has(id))
            .map((id) => ({ id }));

        if (traceNodes.length === 0) return undefined;

        const frame = window.requestAnimationFrame(() => {
            fitView({
                nodes: traceNodes,
                padding: 0.28,
                duration: 350,
                maxZoom: 1.05,
            });
            setRuntimeTraceNeedsFit(false);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [
        runtimeLog,
        runtimeStarted,
        runtimeTraceNeedsFit,
        runtimeTraceNodeIds,
        visibleNodes,
        fitView,
    ]);

    useEffect(() => {
        if (!activeRuntimeStep) return undefined;
        if (runtimeFocusHandledRef.current === runtimeFocusRequest) {
            return undefined;
        }

        // Follow runtime execution into a sub-state-machine only when that
        // sub-SM already has an open editor tab. Closed sub-SMs are resolved
        // to their visible wrapper node by the runtime resolver and stay in-place.
        if (
            activeRuntimeStep.tabId &&
            activeRuntimeStep.tabId !== activeTabId
        ) {
            switchTab(activeRuntimeStep.tabId);
            return undefined;
        }

        const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
        const followNodeIds = [
            runtimeDisplayEdge?.source,
            runtimeDisplayEdge?.target,
            activeRuntimeStep.sourceNodeId,
            activeRuntimeStep.targetNodeId,
        ].filter((nodeId, index, allIds) =>
            Boolean(
                nodeId &&
                    visibleNodeIds.has(nodeId) &&
                    allIds.indexOf(nodeId) === index
            )
        );

        if (followNodeIds.length === 0) return undefined;

        runtimeFocusHandledRef.current = runtimeFocusRequest;
        const frame = window.requestAnimationFrame(() => {
            fitView({
                nodes: followNodeIds.map((id) => ({ id })),
                padding: 0.55,
                duration: 320,
                maxZoom: 1.15,
            });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [
        runtimeFocusRequest,
        activeRuntimeStep,
        runtimeDisplayEdge,
        activeTabId,
        switchTab,
        visibleNodes,
        fitView,
    ]);

    const playbackVisibleNodes = useMemo(() => {
        if (!runtimeLog) return visibleNodes;

        const sourceIds = new Set(
            [activeRuntimeStep?.sourceNodeId, runtimeDisplayEdge?.source].filter(
                Boolean
            )
        );
        const targetIds = new Set(
            [activeRuntimeStep?.targetNodeId, runtimeDisplayEdge?.target].filter(
                Boolean
            )
        );

        return visibleNodes.map((node) => {
            const isSource = sourceIds.has(node.id);
            const isTarget = targetIds.has(node.id);
            const isInTrace = runtimeTraceNodeIds.has(node.id);
            const runtimeSlotValue =
                runtimeStarted && node.type === "slot"
                    ? activeRuntimeSlotValues[
                          normalizeSlotPath(getSlotPathFromNode(node))
                      ] || null
                    : null;
            const runtimeParameterValues = runtimeStarted
                ? activeRuntimeParameterValues[node.id] || null
                : null;
            const hasRuntimeSlotValue = Boolean(runtimeSlotValue);
            const shouldDim = runtimeStarted
                ? !isSource && !isTarget && !hasRuntimeSlotValue
                : !isInTrace;

            let className = node.className || "";
            if (runtimeStarted) {
                if (shouldDim) {
                    className = appendRuntimeClass(
                        className,
                        "runtime-log-dimmed-node"
                    );
                }
                if (isSource) {
                    className = appendRuntimeClass(
                        className,
                        "runtime-log-source-node"
                    );
                }
                if (isTarget) {
                    className = appendRuntimeClass(
                        className,
                        "runtime-log-target-node"
                    );
                }
            } else if (isInTrace) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-trace-node"
                );
            } else {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-dimmed-node"
                );
            }

            if (hasRuntimeSlotValue) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-slot-value-node"
                );
            }

            return {
                ...node,
                className,
                data: {
                    ...(node.data || {}),
                    ...(node.type === "slot"
                        ? {
                              runtimeSlotValue: runtimeSlotValue?.value,
                              runtimeSlotValueMeta: runtimeSlotValue,
                          }
                        : {}),
                    runtimeParameterValues,
                },
            };
        });
    }, [
        runtimeLog,
        runtimeStarted,
        activeRuntimeStep,
        runtimeDisplayEdge,
        runtimeTraceNodeIds,
        activeRuntimeSlotValues,
        activeRuntimeParameterValues,
        visibleNodes,
    ]);

    const playbackVisibleEdges = useMemo(() => {
        if (!runtimeLog) return visibleEdges;

        return visibleEdges.map((edge) => {
            const isActiveTransition =
                runtimeStarted &&
                Boolean(activeRuntimeStep?.edgeId) &&
                edge.id === activeRuntimeStep.edgeId;
            const isActiveSlot =
                runtimeStarted && activeRuntimeSlotEdgeIds.has(edge.id);
            const isInTrace = runtimeTraceEdgeIds.has(edge.id);
            const shouldDim = runtimeStarted
                ? !isActiveTransition && !isActiveSlot
                : !isInTrace;

            let className = edge.className || "";
            if (isActiveTransition) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-active-edge"
                );
            } else if (isActiveSlot) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-active-slot-edge"
                );
            } else if (!runtimeStarted && isInTrace) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-trace-edge"
                );
            } else if (shouldDim) {
                className = appendRuntimeClass(
                    className,
                    "runtime-log-dimmed-edge"
                );
            }

            if (isActiveTransition) {
                return {
                    ...edge,
                    animated: true,
                    className,
                    style: {
                        ...(edge.style || {}),
                        stroke: "#facc15",
                        strokeWidth: 4,
                    },
                    markerEnd: edge.markerEnd
                        ? { ...edge.markerEnd, color: "#facc15" }
                        : edge.markerEnd,
                };
            }

            if (isActiveSlot) {
                return {
                    ...edge,
                    animated: false,
                    className,
                    style: {
                        ...(edge.style || {}),
                        strokeWidth: 4,
                    },
                };
            }

            return { ...edge, className };
        });
    }, [
        runtimeLog,
        runtimeStarted,
        activeRuntimeStep,
        activeRuntimeSlotEdgeIds,
        runtimeTraceEdgeIds,
        visibleEdges,
    ]);

    const runtimePlayback = useMemo(() => {
        const stepCount = resolvedRuntimeSteps.length;
        const unresolvedCount = resolvedRuntimeSteps.reduce(
            (count, step) => count + (step.resolved ? 0 : 1),
            0
        );

        return {
            loaded: Boolean(runtimeLog),
            fileName: runtimeLog?.fileName || "",
            stepCount,
            stepIndex:
                stepCount > 0 ? Math.min(runtimeStepIndex, stepCount - 1) : 0,
            currentStep: activeRuntimeStep,
            unresolvedCount,
            started: runtimeStarted,
            isPlaying: runtimePlaying,
            delay: runtimePlaybackDelay,
            slotSampleCount: runtimeLog?.slotSamples?.length || 0,
            unresolvedSlotSampleCount:
                runtimeSlotTimeline.unresolvedCount || 0,
            parameterSampleCount: runtimeLog?.parameterSamples?.length || 0,
            unresolvedParameterSampleCount:
                runtimeParameterTimeline.unresolvedCount || 0,
            steps: resolvedRuntimeSteps,
        };
    }, [
        runtimeLog,
        resolvedRuntimeSteps,
        runtimeStepIndex,
        activeRuntimeStep,
        runtimeStarted,
        runtimePlaying,
        runtimePlaybackDelay,
        runtimeSlotTimeline.unresolvedCount,
        runtimeParameterTimeline.unresolvedCount,
    ]);

    const restartRuntimePlayback = useCallback(() => {
        if (resolvedRuntimeSteps.length === 0) return;
        setRuntimeStepIndex(0);
        setRuntimeStarted(true);
        setRuntimePlaying(true);
        setRuntimeFocusRequest((value) => value + 1);
    }, [resolvedRuntimeSteps.length]);

    const toggleRuntimePlayback = useCallback(() => {
        const stepCount = resolvedRuntimeSteps.length;
        if (stepCount === 0) return;

        if (runtimePlaying) {
            setRuntimePlaying(false);
            return;
        }

        if (!runtimeStarted) {
            setRuntimeStepIndex(0);
            setRuntimeStarted(true);
        } else if (runtimeStepIndex >= stepCount - 1) {
            setRuntimeStepIndex(0);
        }

        // Resuming playback intentionally re-focuses the current transition.
        // While paused there are no viewport updates, so the user can freely
        // pan/zoom around the graph until playback or navigation resumes.
        setRuntimeFocusRequest((value) => value + 1);
        setRuntimePlaying(true);
    }, [
        resolvedRuntimeSteps.length,
        runtimeStarted,
        runtimePlaying,
        runtimeStepIndex,
    ]);

    const seekRuntimePlayback = useCallback(
        (nextIndex) => {
            const stepCount = resolvedRuntimeSteps.length;
            if (stepCount === 0) return;
            const clampedIndex = Math.max(
                0,
                Math.min(Number(nextIndex) || 0, stepCount - 1)
            );
            setRuntimePlaying(false);
            setRuntimeStarted(true);
            setRuntimeStepIndex(clampedIndex);
            setRuntimeFocusRequest((value) => value + 1);
        },
        [resolvedRuntimeSteps.length]
    );

    const stepRuntimePlayback = useCallback(
        (direction) => {
            const stepCount = resolvedRuntimeSteps.length;
            if (stepCount === 0) return;
            const currentIndex = runtimeStarted ? runtimeStepIndex : 0;
            seekRuntimePlayback(currentIndex + direction);
        },
        [
            resolvedRuntimeSteps.length,
            runtimeStarted,
            runtimeStepIndex,
            seekRuntimePlayback,
        ]
    );

    return {
        runtimeLog,
        runtimePreparation,
        runtimePlayback,
        activeRuntimeChanges,
        runtimeChangesPanelOpen,
        setRuntimeChangesPanelOpen,
        playbackVisibleNodes,
        playbackVisibleEdges,
        handleLoadRuntimeLog,
        handleClearRuntimeLog,
        toggleRuntimePlayback,
        restartRuntimePlayback,
        seekRuntimePlayback,
        stepRuntimePlayback,
        setRuntimePlaybackDelay,
    };
}
