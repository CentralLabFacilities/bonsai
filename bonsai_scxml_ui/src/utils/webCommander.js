export async function requestWebCommander(endpoint, {
    method = "GET",
    body,
    signal,
    timeout = method === "GET" ? 8000 : 60000,
} = {}) {
    const requestSignal = AbortSignal.any([
        AbortSignal.timeout(timeout),
        ...(signal ? [signal] : []),
    ]);
    const response = await fetch(endpoint === "status" ? "/api/status" : `/api/bonsai/${endpoint}`, {
        method,
        signal: requestSignal,
        ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body } : {}),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`WebCommander ${endpoint}: HTTP ${response.status}${text.trim() ? ` - ${text.trim().slice(0, 500)}` : ""}`);
    }
    return text;
}

export async function getWebCommanderStatus(signal) {
    const status = (await requestWebCommander("status", { signal })).trim();
    if (!["UNKNOWN", "LOADING", "INITIALIZED", "INITIALIZED_BUT_WARNINGS", "RUNNING", "PAUSED"].includes(status)) {
        throw new Error("WebCommander status did not return a recognized engine status.");
    }
    return status;
}

export async function getWebCommanderSnapshot(signal) {
    const status = await getWebCommanderStatus(signal);
    if (status === "UNKNOWN" || status === "LOADING") {
        return { status, currentStates: [], stateIds: [], transitions: [], checkedAt: Date.now() };
    }
    const endpoints = [["states", "ids"], ["all_states", "ids"], ["transitions", "transitions"]];
    const lists = await Promise.all(endpoints.map(async ([endpoint, field]) => {
        const text = await requestWebCommander(endpoint, { signal });
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(`WebCommander ${endpoint} did not return valid JSON.`);
        }
        if (!Array.isArray(data?.[field]) || data[field].some((item) => typeof item !== "string")) {
            throw new Error(`WebCommander ${endpoint} did not return a list of ${field}.`);
        }
        return [...new Set(data[field])];
    }));
    return { status, currentStates: lists[0], stateIds: lists[1], transitions: lists[2], checkedAt: Date.now() };
}

export async function loadWebCommander(payload, signal, workflow) {
    let text;
    if (workflow && isTauri()) {
        const requestSignal = AbortSignal.any([
            AbortSignal.timeout(60000),
            ...(signal ? [signal] : []),
        ]);
        if (requestSignal.aborted) throw requestSignal.reason;
        const loading = loadRuntimeWorkflow(buildRustEditorExportRequest(workflow), payload.pathToConfig,
            payload.includeMapping, payload.forceConfigure, workflow.filePath || null);
        const response = await new Promise((resolve, reject) => {
            const abort = () => { requestSignal.removeEventListener("abort", abort); reject(requestSignal.reason); };
            requestSignal.addEventListener("abort", abort, { once: true });
            if (requestSignal.aborted) abort();
            // The native load keeps its file lease; cancellation only stops this caller waiting.
            loading.then((value) => { requestSignal.removeEventListener("abort", abort); resolve(value); },
                (reason) => { requestSignal.removeEventListener("abort", abort); reject(reason); });
        });
        if (requestSignal.aborted) throw requestSignal.reason;
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`WebCommander load: HTTP ${response.status}${response.body?.trim() ? ` - ${response.body.trim().slice(0, 500)}` : ""}`);
        }
        text = response.body;
    } else {
        if (workflow && (workflow.isModified || !workflow.filePath)) {
            throw new Error("Running an unsaved workflow requires the Bonsai desktop app's native SCXML serializer. No save is required in the desktop app.");
        }
        text = await requestWebCommander("load", { method: "POST", body: JSON.stringify(payload), signal });
    }
    let result;
    try {
        result = JSON.parse(text);
    } catch {
        throw new Error("WebCommander load did not return valid JSON.");
    }
    const messages = result?.messages === undefined ? [] : result.messages;
    if (typeof result?.success !== "boolean" || !Array.isArray(messages)
        || messages.some((message) => typeof message !== "string")) {
        throw new Error("WebCommander load did not return a valid success/messages result.");
    }
    return { ...result, messages };
}

export function classifyWebCommanderMessages(messages) {
    const groups = { warnings: [], errors: [], diagnostics: [] };
    for (const message of messages) {
        // WebCommander omits severity, but these exact engine fault formats are known.
        const text = message.trim();
        if (/^(?:warn(?:ing)?\s*[:\-]|\[warn(?:ing)?\])\s*/i.test(text)
            || /^State with id '.+' has only conditional transitions for event '.+'$/.test(text)
            || /^Skill .+ has ExitStatus .+ with and without ps$/.test(text)) {
            groups.warnings.push(message);
        } else if (/^(?:err(?:or)?\s*[:\-]|\[err(?:or)?\])\s*/i.test(text)
            || /^State with id '.+' misses transition for event '.+'$/.test(text)
            || /^State with id '.+' sending event '.+' that is not captured in transitions$/.test(text)) {
            groups.errors.push(message);
        } else {
            groups.diagnostics.push(message);
        }
    }
    return groups;
}
import { isTauri, loadRuntimeWorkflow } from "../tauri-client.js";
import { buildRustEditorExportRequest } from "./scxmlRustExport.js";
