import {
    isTauri,
    parseRuntimeLogText,
    prepareRuntimeReplayCacheRust,
} from "../tauri-client.js";
import {
    parseSkillStateMachineLog,
    prepareRuntimeReplayCache as prepareRuntimeReplayCacheJs,
} from "./runtimeLog";

const normalize = (value) => String(value ?? "").trim();

const isSlotEdgeForReplay = (edge) =>
    edge?.data?.edgeKind === "slot" ||
    String(edge?.id || "").startsWith("edge-read-") ||
    String(edge?.id || "").startsWith("edge-write-");

const replayNodeNames = (node) => {
    const rawNames = [
        node?.data?.fullSkillName,
        node?.data?.scxmlStateId,
        node?.data?.label,
        node?.id,
    ]
        .map(normalize)
        .filter(Boolean);
    const names = new Set(rawNames);
    rawNames.forEach((name) => {
        const shortName = name.split(".").pop();
        if (shortName) names.add(shortName);
    });
    return Array.from(names);
};

const semanticTargetId = (edge) =>
    normalize(
        edge?.data?.boundaryOriginalTarget ||
            edge?.data?.compoundOriginalTarget ||
            edge?.data?.parallelOriginalTarget ||
            edge?.target
    );

const semanticSourceEntries = (edge) => {
    const stored = Array.isArray(edge?.data?.boundaryOriginalSources)
        ? edge.data.boundaryOriginalSources
              .map((entry) => ({
                  sourceId: normalize(
                      entry?.sourceId || entry?.nodeId || entry?.id
                  ),
                  sourceHandle: normalize(
                      entry?.sourceHandle || entry?.handle
                  ),
              }))
              .filter((entry) => entry.sourceId)
        : [];

    if (stored.length > 0) return stored;

    const sourceId = normalize(
        edge?.data?.boundaryOriginalSource ||
            edge?.data?.compoundOriginalSource ||
            edge?.data?.parallelOriginalSource ||
            edge?.source
    );
    if (!sourceId) return [];

    return [
        {
            sourceId,
            sourceHandle: normalize(
                edge?.data?.boundaryOriginalSourceHandle ||
                    edge?.data?.compoundOriginalSourceHandle ||
                    edge?.data?.parallelOriginalSourceHandle ||
                    edge?.sourceHandle ||
                    edge?.label
            ),
        },
    ];
};

const serializeReplayNode = (node) => ({
    id: normalize(node?.id),
    nodeType: normalize(node?.type),
    names: replayNodeNames(node),
    canonical: !(
        node?.data?.cloneOfNodeId ||
        node?.data?.isSkillClone ||
        node?.data?.isStateClone
    ),
    inSlotKeys: (node?.data?.inSlots || []).map((slot) => normalize(slot?.key)),
    outSlotKeys: (node?.data?.outSlots || []).map((slot) => normalize(slot?.key)),
});

const serializeTransitionEdge = (edge) => ({
    id: normalize(edge?.id),
    source: normalize(edge?.source),
    target: normalize(edge?.target),
    semanticTargetId: semanticTargetId(edge),
    semanticSources: semanticSourceEntries(edge),
});

const serializeSlotEdge = (edge) => {
    const rawSlotIndex = Number(edge?.data?.slotIndex);
    return {
        id: normalize(edge?.id),
        skillNodeId: normalize(edge?.data?.skillNodeId || edge?.source),
        access: normalize(edge?.data?.access),
        slotIndex: Number.isInteger(rawSlotIndex) ? rawSlotIndex : null,
        path: normalize(edge?.data?.path),
    };
};

const buildRuntimeReplayRequest = (runtimeLog, contexts = []) => ({
    runtimeLog: {
        steps: runtimeLog?.steps || [],
        firstEntry: runtimeLog?.firstEntry || null,
        slotSamples: runtimeLog?.slotSamples || [],
        parameterSamples: runtimeLog?.parameterSamples || [],
        dataSamples: runtimeLog?.dataSamples || [],
    },
    contexts: (contexts || []).map((context) => ({
        tabId: normalize(context?.tabId),
        parentTabId: context?.parentTabId || null,
        title: normalize(context?.title),
        suffixParts: (context?.suffixParts || []).map(normalize).filter(Boolean),
        nodes: (context?.nodes || []).map(serializeReplayNode),
        transitionEdges: (context?.edges || [])
            .filter((edge) => !isSlotEdgeForReplay(edge))
            .map(serializeTransitionEdge),
        slotEdges: (context?.slotEdges || [])
            .filter(isSlotEdgeForReplay)
            .map(serializeSlotEdge),
        globalDataModel: (context?.globalDataModel || []).map((entry) => ({
            id: normalize(entry?.id),
            expr: String(entry?.expr ?? ""),
        })),
    })),
});

const objectOfArraysToSetMap = (value = {}) =>
    new Map(
        Object.entries(value || {}).map(([key, values]) => [
            key,
            new Set(Array.isArray(values) ? values : []),
        ])
    );

const hydrateRuntimeReplayCache = (cache, contexts = []) => ({
    ...cache,
    slotEdgeIdsByStep: (cache?.slotEdgeIdsByStep || []).map(
        objectOfArraysToSetMap
    ),
    traceEdgeIdsByTab: objectOfArraysToSetMap(cache?.traceEdgeIdsByTab),
    traceNodeIdsByTab: objectOfArraysToSetMap(cache?.traceNodeIdsByTab),
    edgeByIdByTab: new Map(
        (contexts || []).map((context) => [
            context.tabId,
            new Map((context.edges || []).map((edge) => [edge.id, edge])),
        ])
    ),
    contexts,
});

/**
 * Parse a runtime log through the Rust backend in desktop mode while keeping
 * the historical JavaScript parser as browser/error fallback during the
 * migration. The DTO returned by Rust matches parseSkillStateMachineLog().
 */
export const parseRuntimeLogForReplay = async (text = "") => {
    if (!isTauri()) {
        return parseSkillStateMachineLog(text);
    }

    try {
        return await parseRuntimeLogText(text);
    } catch (error) {
        console.error(
            "Rust runtime-log parsing failed; falling back to JavaScript parser.",
            error
        );
        return parseSkillStateMachineLog(text);
    }
};

/**
 * Prepare the complete runtime replay cache in Rust in desktop mode. React
 * only projects the current editor graph into a compact semantic DTO and then
 * rehydrates Map/Set indexes expected by the existing playback UI.
 */
export const prepareRuntimeReplayCacheForReplay = async (
    runtimeLog = {},
    contexts = [],
    { onProgress, yieldControl } = {}
) => {
    if (!isTauri()) {
        return prepareRuntimeReplayCacheJs(runtimeLog, contexts, {
            onProgress,
            yieldControl,
        });
    }

    const report = async (phase, progress) => {
        onProgress?.({ phase, progress });
        if (yieldControl) await yieldControl();
    };

    try {
        await report("Preparing replay context…", 0.22);
        const request = buildRuntimeReplayRequest(runtimeLog, contexts);

        await report("Resolving runtime replay in Rust…", 0.36);
        const cache = await prepareRuntimeReplayCacheRust(request);

        await report("Hydrating replay indexes…", 0.96);
        const hydrated = hydrateRuntimeReplayCache(cache, contexts);
        await report("Replay ready", 1);
        return hydrated;
    } catch (error) {
        console.error(
            "Rust runtime replay preparation failed; falling back to JavaScript resolver.",
            error
        );
        return prepareRuntimeReplayCacheJs(runtimeLog, contexts, {
            onProgress,
            yieldControl,
        });
    }
};
