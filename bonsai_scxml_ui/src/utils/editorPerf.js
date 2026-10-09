const DEFAULT_SLOW_THRESHOLD_MS = 50;

const now = () =>
    typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

const readGlobal = (name) => {
    try {
        return globalThis?.[name];
    } catch {
        return undefined;
    }
};

const isVerbose = () => Boolean(readGlobal("BONSAI_PERF"));

const getSlowThreshold = () => {
    const configured = Number(readGlobal("BONSAI_PERF_THRESHOLD_MS"));
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_SLOW_THRESHOLD_MS;
};

const shouldLog = (durationMs) =>
    isVerbose() || durationMs >= getSlowThreshold();

const log = (label, durationMs, details) => {
    if (!shouldLog(durationMs)) return;
    const suffix = details && Object.keys(details).length > 0 ? details : undefined;
    const method = durationMs >= getSlowThreshold() ? "warn" : "info";
    console[method](
        `[Bonsai perf] ${label}: ${durationMs.toFixed(1)} ms`,
        suffix
    );
};

/**
 * Measure synchronous editor work with negligible overhead when it is fast.
 * Slow operations (>= 50 ms by default) are logged automatically. Set
 * `window.BONSAI_PERF = true` to log every measurement, or override the slow
 * threshold with `window.BONSAI_PERF_THRESHOLD_MS`.
 */
export const measureEditorTask = (label, task, details = null) => {
    const startedAt = now();
    try {
        return task();
    } finally {
        log(label, now() - startedAt, details || undefined);
    }
};

/** Same as measureEditorTask, but for Promise-returning work. */
export const measureEditorAsync = async (label, task, details = null) => {
    const startedAt = now();
    try {
        return await task();
    } finally {
        log(label, now() - startedAt, details || undefined);
    }
};

/**
 * Queue wait time is especially useful for spotting a backed-up Tauri command
 * bridge: the Rust command itself can be fast while the UI still waits behind
 * many older commands.
 */
export const logEditorQueueWait = (label, enqueuedAt, details = null) => {
    const durationMs = Math.max(0, now() - enqueuedAt);
    log(label, durationMs, details || undefined);
    return durationMs;
};

export const editorPerfNow = now;
