const PROXY_MARKER = Symbol.for("bonsai.apiProxyFetch");

function apiPath(input, origin) {
    const url = typeof input === "string" ? input : input?.url || input?.href;
    if (!url) return null;
    if (url.startsWith("/api/")) return url;

    try {
        const parsed = new URL(url);
        return parsed.origin === origin && parsed.pathname.startsWith("/api/")
            ? `${parsed.pathname}${parsed.search}`
            : null;
    } catch {
        return null;
    }
}

function abortReason(signal) {
    return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

async function invokeWithSignal(invoke, payload, signal) {
    if (!signal) return invoke("api_request", payload);
    if (signal.aborted) throw abortReason(signal);

    let onAbort;
    const aborted = new Promise((_, reject) => {
        onAbort = () => reject(abortReason(signal));
        signal.addEventListener("abort", onAbort, { once: true });
    });

    try {
        // IPC cannot cancel the backend operation, but fetch callers still stop waiting.
        return await Promise.race([invoke("api_request", payload), aborted]);
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}

export function installApiProxy(environment, invoke) {
    if (environment.fetch[PROXY_MARKER]) return;
    const originalFetch = environment.fetch;

    const proxyFetch = async function (input, init = {}) {
        const path = apiPath(input, environment.location?.origin);
        if (!path) return originalFetch.call(this, input, init);

        const request = input instanceof Request ? input : null;
        const signal = init?.signal ?? request?.signal;
        if (signal?.aborted) throw abortReason(signal);

        let body = init?.body ?? null;
        if (body === null && request?.body) body = await request.clone().text();
        if (body !== null && typeof body !== "string") body = String(body);

        const result = await invokeWithSignal(invoke, {
            method: (init?.method || request?.method || "GET").toUpperCase(),
            path,
            body: body || null,
        }, signal);

        return new Response([204, 205, 304].includes(result.status) ? null : result.body, {
            status: result.status,
            headers: { "Content-Type": "application/json" },
        });
    };

    Object.defineProperty(proxyFetch, PROXY_MARKER, { value: true });
    environment.fetch = proxyFetch;
}
