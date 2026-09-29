const DEFAULT_THRESHOLD_MS = 8;

const getNow = () =>
    typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

const getThreshold = () => {
    const configured = Number(globalThis?.BONSAI_CONTAINER_PERF_THRESHOLD_MS);
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_THRESHOLD_MS;
};

const shouldLog = (durationMs) => durationMs >= getThreshold();

const logMeasurement = (label, durationMs, details) => {
    if (!shouldLog(durationMs)) return;

    const suffix = details && Object.keys(details).length > 0 ? details : undefined;
    console.info(
        `[Bonsai perf][Compound/Parallel] ${label}: ${durationMs.toFixed(1)} ms`,
        suffix
    );
};

export const measureContainerTask = (label, task, details = null) => {
    const startedAt = getNow();
    try {
        return task();
    } finally {
        logMeasurement(label, getNow() - startedAt, details || undefined);
    }
};

export const measureContainerTaskAsync = async (label, task, details = null) => {
    const startedAt = getNow();
    try {
        return await task();
    } finally {
        logMeasurement(label, getNow() - startedAt, details || undefined);
    }
};

export const createContainerPerfTimer = (label, details = null) => {
    const startedAt = getNow();
    let finished = false;

    return () => {
        if (finished) return;
        finished = true;
        logMeasurement(label, getNow() - startedAt, details || undefined);
    };
};
