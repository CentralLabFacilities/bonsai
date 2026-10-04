import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { Window } from "happy-dom";
import { useSkillDefinitions } from "../src/hooks/useSkillDefinitions.js";

function mockSkillRequests(context) {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
        calls.push({
            url, options,
            reply: (data, status = 200) => resolve(new Response(JSON.stringify(data), { status })),
            replyResponse: resolve,
            reject,
        });
    });
    context.after(() => { globalThis.fetch = originalFetch; });
    return calls;
}

function skillService(context) {
    const calls = mockSkillRequests(context);
    // Capture the request API without browser effects, polling or DOM timers.
    let service;
    function Capture() {
        service = useSkillDefinitions();
        return null;
    }
    renderToString(createElement(Capture));
    return { service, calls };
}

async function mountedSkillService(context) {
    const calls = mockSkillRequests(context);
    const window = new Window({ url: "http://localhost/" });
    const document = window.document;
    const originals = new Map();
    for (const [name, value] of Object.entries({
        window, document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let service;
    let renders = 0;
    let mounted = true;
    function Capture() {
        service = useSkillDefinitions();
        renders += 1;
        return service.skillLibraryError
            ? createElement("p", { role: "alert" }, service.skillLibraryError)
            : null;
    }
    const unmount = async () => {
        if (!mounted) return;
        await act(async () => root.unmount());
        mounted = false;
    };
    context.after(async () => {
        await unmount();
        container.remove();
        await window.happyDOM.cancelAsync();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    });
    await act(async () => root.render(createElement(Capture)));
    return {
        calls, window, document, unmount,
        get service() { return service; },
        get renders() { return renders; },
    };
}

test("equivalent concurrent configurations share one POST and a resolved cache entry", async (context) => {
    const { service, calls } = skillService(context);
    const first = service.fetchSkillData("org.skills.Example", { z: " 'a\\'b' ", a: " @count ", ignored: null });
    const second = service.fetchSkillData("org.skills.Example", { a: "@count", z: "a'b" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/skill/org.skills.Example");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { params: { z: "a'b", a: "@count" } });
    calls[0].reply({ definition: "configured" });
    const [firstData, secondData] = await Promise.all([first, second]);
    assert.equal(firstData, secondData);
    assert.equal(await service.fetchSkillData("org.skills.Example", { z: "a'b", a: "@count" }), firstData);
    assert.equal(calls.length, 1);
});

test("empty configurations use the base GET while zero and false remain POST parameters", async (context) => {
    const { service, calls } = skillService(context);
    const base = service.fetchSkillData("Example", { absent: undefined, missing: null });
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[0].options.method, undefined);
    calls[0].reply({ definition: "base" });
    await base;
    const configured = service.fetchSkillData("Example", { enabled: false, count: 0 });
    assert.deepEqual(JSON.parse(calls[1].options.body), { params: { enabled: false, count: 0 } });
    calls[1].reply({ definition: "configured" });
    await configured;
});

test("library refresh invalidates pending definitions and old replies cannot replace new requests", async (context) => {
    const { service, calls } = skillService(context);
    const old = service.fetchSkillData("Example", { count: "1" });
    const refresh = service.fetchSkills();
    calls[1].reply({ skills: ["Example"] });
    assert.equal(await refresh, true);

    const fresh = service.fetchSkillData("Example", { count: "1" });
    assert.equal(calls.length, 3);
    calls[0].reply({ definition: "old" });
    assert.deepEqual(await old, { definition: "old" });
    const sharedFresh = service.fetchSkillData("Example", { count: "1" });
    assert.equal(calls.length, 3);
    calls[2].reply({ definition: "new" });
    const [freshData, sharedData] = await Promise.all([fresh, sharedFresh]);
    assert.equal(freshData, sharedData);
    assert.deepEqual(freshData, { definition: "new" });
    assert.equal(await service.fetchSkillData("Example", { count: "1" }), freshData);
    assert.equal(calls.length, 3);
});

test("failed base requests are removed from the cache and can be retried", async (context) => {
    context.mock.method(console, "error", () => {});
    const { service, calls } = skillService(context);
    const failed = service.fetchSkillData("Example");
    calls[0].reply({ error: "unavailable" }, 500);
    assert.equal(await failed, null);
    const retry = service.fetchSkillData("Example");
    assert.equal(calls.length, 2);
    calls[1].reply({ definition: "retried" });
    assert.deepEqual(await retry, { definition: "retried" });
});

test("parameterized failures share the base fallback with concurrent base callers", async (context) => {
    context.mock.method(console, "warn", () => {});
    const { service, calls } = skillService(context);
    const configured = service.fetchSkillData("Example", { count: "1" });
    calls[0].reply({ error: "invalid configuration" }, 400);
    await setImmediate();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.cache, "no-store");
    const base = service.fetchSkillData("Example");
    assert.equal(calls.length, 2);
    calls[1].reply({ definition: "fallback" });
    const [configuredData, baseData] = await Promise.all([configured, base]);
    assert.equal(configuredData, baseData);
    assert.equal(await service.fetchSkillData("Example", { count: "1" }), baseData);
    assert.equal(calls.length, 2);
});

test("older overlapping library replies neither change the signature nor clear fresh definitions", async (context) => {
    const { service, calls } = skillService(context);
    const old = service.fetchSkills({ manual: true });
    const fresh = service.fetchSkills({ manual: true });
    calls[1].reply({ skills: ["New"] });
    assert.equal(await fresh, true);
    const definition = service.fetchSkillData("New");
    calls[2].reply({ definition: "fresh" });
    const data = await definition;
    calls[0].reply({ skills: ["Old"] });
    assert.equal(await old, false);
    assert.equal(await service.fetchSkillData("New"), data);
    assert.equal(calls.length, 3);
});

test("the library starts loading and a valid empty list becomes ready", async (context) => {
    const harness = await mountedSkillService(context);
    assert.equal(harness.service.skillLibraryStatus, "loading");
    assert.equal(harness.service.skillLibraryError, null);
    assert.equal(harness.service.hasLoadedSkills, false);
    assert.equal(harness.service.isReloadingSkills, false);
    assert.deepEqual(harness.service.skills, { skills: [] });
    assert.equal(harness.calls[0].url, "/api/skills");
    assert.equal(harness.calls[0].options.cache, "no-store");

    await act(async () => harness.calls[0].reply({ skills: [] }));
    assert.equal(harness.service.skillLibraryStatus, "ready");
    assert.equal(harness.service.skillLibraryError, null);
    assert.equal(harness.service.hasLoadedSkills, true);
    assert.equal(harness.service.skillLibraryRefreshVersion, 1);
    assert.deepEqual(harness.service.skills, { skills: [] });
    assert.equal(harness.document.querySelector('[role="alert"]'), null);
});

test("malformed lists and non-string or blank identifiers fail visibly instead of appearing empty", async (context) => {
    context.mock.method(console, "error", () => {});
    const harness = await mountedSkillService(context);
    const payloads = [
        null, [], {}, { skills: null }, { skills: "Example" }, { skills: {} },
        { skills: [null] }, { skills: [123] }, { skills: [{}] },
        { skills: [""] }, { skills: [" \n\t "] }, { skills: ["Example", false] },
    ];
    for (const [index, payload] of payloads.entries()) {
        let request;
        if (index > 0) {
            await act(async () => { request = harness.service.fetchSkills(); });
        }
        await act(async () => harness.calls.at(-1).reply(payload));
        if (request) assert.equal(await request, false);
        assert.equal(harness.service.skillLibraryStatus, "error", JSON.stringify(payload));
        assert.match(harness.service.skillLibraryError, /Invalid skill library response:/);
        assert.equal(harness.service.hasLoadedSkills, false);
        assert.equal(harness.service.skillLibraryRefreshVersion, 0);
        assert.deepEqual(harness.service.skills, { skills: [] });
        assert.equal(harness.document.querySelector('[role="alert"]').textContent, harness.service.skillLibraryError);
    }
});

test("fetch, HTTP and JSON failures expose concise underlying errors until a successful retry", async (context) => {
    context.mock.method(console, "error", () => {});
    const harness = await mountedSkillService(context);
    await act(async () => harness.calls[0].reject(new Error(" \nNetwork is offline.\t ")));
    assert.equal(harness.service.skillLibraryStatus, "error");
    assert.equal(harness.service.skillLibraryError, "Network is offline.");
    assert.equal(harness.service.hasLoadedSkills, false);

    let retry;
    await act(async () => { retry = harness.service.fetchSkills({ manual: true }); });
    assert.equal(harness.service.isReloadingSkills, true);
    assert.equal(harness.service.skillLibraryStatus, "error");
    assert.equal(harness.document.querySelector('[role="alert"]').textContent, "Network is offline.");
    await act(async () => harness.calls.at(-1).reply({ error: "unavailable" }, 503));
    assert.equal(await retry, false);
    assert.equal(harness.service.isReloadingSkills, false);
    assert.equal(harness.service.skillLibraryError, "Server returned 503");

    await act(async () => { retry = harness.service.fetchSkills(); });
    await act(async () => harness.calls.at(-1).replyResponse({
        ok: true,
        json: async () => { throw new SyntaxError("Invalid JSON in skill response"); },
    }));
    assert.equal(await retry, false);
    assert.equal(harness.service.skillLibraryError, "Invalid JSON in skill response");
    assert.equal(harness.service.hasLoadedSkills, false);

    await act(async () => { retry = harness.service.fetchSkills(); });
    await act(async () => harness.calls.at(-1).reject("  Connection refused  "));
    assert.equal(await retry, false);
    assert.equal(harness.service.skillLibraryError, "Connection refused");

    await act(async () => { retry = harness.service.fetchSkills(); });
    await act(async () => harness.calls.at(-1).reject(null));
    assert.equal(await retry, false);
    assert.equal(harness.service.skillLibraryError, "Unable to load skills.");

    await act(async () => { retry = harness.service.fetchSkills(); });
    assert.equal(harness.service.skillLibraryStatus, "error");
    await act(async () => harness.calls.at(-1).reply({ skills: [] }));
    assert.equal(await retry, true);
    assert.equal(harness.service.skillLibraryStatus, "ready");
    assert.equal(harness.service.skillLibraryError, null);
    assert.equal(harness.service.hasLoadedSkills, true);
    assert.equal(harness.document.querySelector('[role="alert"]'), null);
});

test("failed refreshes retain the valid list and definitions while unchanged successful retries clear errors and caches", async (context) => {
    context.mock.method(console, "error", () => {});
    const harness = await mountedSkillService(context);
    await act(async () => harness.calls[0].reply({ skills: ["Z", "A"], metadata: "original" }));
    const originalList = harness.service.skills;
    const base = harness.service.fetchSkillData("A");
    harness.calls.at(-1).reply({ definition: "base" });
    const baseData = await base;
    const configured = harness.service.fetchSkillData("A", { count: "1" });
    const configuredCall = harness.calls.at(-1);

    for (const payload of [{ error: "unavailable" }, { skills: ["A", ""] }]) {
        let failed;
        await act(async () => { failed = harness.service.fetchSkills(); });
        await act(async () => harness.calls.at(-1).reply(payload, payload.error ? 500 : 200));
        assert.equal(await failed, false);
        assert.equal(harness.service.skillLibraryStatus, "error");
        assert.equal(harness.service.hasLoadedSkills, true);
        assert.equal(harness.service.skills, originalList);
        assert.equal(harness.service.skillLibraryRefreshVersion, 1);
        const callCount = harness.calls.length;
        assert.equal(await harness.service.fetchSkillData("A"), baseData);
        assert.equal(harness.calls.length, callCount);
    }
    configuredCall.reply({ definition: "configured before failures" });
    const configuredData = await configured;
    const callCount = harness.calls.length;
    assert.equal(await harness.service.fetchSkillData("A", { count: "1" }), configuredData);
    assert.equal(harness.calls.length, callCount);

    const error = harness.service.skillLibraryError;
    let retry;
    await act(async () => { retry = harness.service.fetchSkills({ manual: true }); });
    assert.equal(harness.service.skillLibraryError, error);
    assert.equal(harness.service.skillLibraryStatus, "error");
    assert.equal(harness.service.skills, originalList);
    await act(async () => harness.calls.at(-1).reply({ skills: ["A", "Z"], metadata: "new" }));
    assert.equal(await retry, false);
    assert.equal(harness.service.isReloadingSkills, false);
    assert.equal(harness.service.skillLibraryStatus, "ready");
    assert.equal(harness.service.skillLibraryError, null);
    assert.equal(harness.service.hasLoadedSkills, true);
    assert.equal(harness.service.skills, originalList);
    assert.equal(harness.service.skillLibraryRefreshVersion, 1);

    const freshBase = harness.service.fetchSkillData("A");
    const freshConfigured = harness.service.fetchSkillData("A", { count: "1" });
    assert.equal(harness.calls.length, callCount + 3);
    harness.calls.at(-2).reply({ definition: "fresh base" });
    harness.calls.at(-1).reply({ definition: "fresh configuration" });
    assert.deepEqual(await freshBase, { definition: "fresh base" });
    assert.deepEqual(await freshConfigured, { definition: "fresh configuration" });
});

test("repeated identical background failures do not rerender or replace the existing alert", async (context) => {
    context.mock.method(console, "error", () => {});
    const harness = await mountedSkillService(context);
    await act(async () => harness.calls[0].reject(new Error("Offline")));
    const renders = harness.renders;
    const alert = harness.document.querySelector('[role="alert"]');
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await act(async () => harness.window.dispatchEvent(new harness.window.Event("focus")));
        assert.equal(harness.renders, renders);
        assert.equal(harness.service.isReloadingSkills, false);
        await act(async () => harness.calls.at(-1).reject(new Error(" Offline ")));
        assert.equal(harness.renders, renders);
        assert.equal(harness.document.querySelector('[role="alert"]'), alert);
        assert.equal(alert.textContent, "Offline");
    }
    await act(async () => harness.window.dispatchEvent(new harness.window.Event("focus")));
    await act(async () => harness.calls.at(-1).reject(new Error("Connection reset")));
    assert.equal(harness.renders, renders + 1);
    assert.equal(harness.service.skillLibraryError, "Connection reset");
    assert.equal(alert.textContent, "Connection reset");
});

test("older list successes, HTTP failures and fetch or JSON rejections cannot publish state or invalidate fresh definitions", async (context) => {
    const errors = context.mock.method(console, "error", () => {});
    const harness = await mountedSkillService(context);
    await act(async () => harness.calls[0].reply({ skills: ["Fresh"] }));
    for (const newestFails of [false, true]) {
        for (const staleKind of ["success", "malformed", "HTTP", "fetch", "JSON"]) {
            let stale;
            await act(async () => { stale = harness.service.fetchSkills(); });
            const staleCall = harness.calls.at(-1);
            let finishStale;
            if (staleKind === "JSON") {
                await act(async () => staleCall.replyResponse({
                    ok: true,
                    json: () => new Promise((resolve, reject) => {
                        finishStale = () => reject(new SyntaxError("Stale invalid JSON"));
                    }),
                }));
            } else {
                finishStale = () => {
                    if (staleKind === "fetch") staleCall.reject(new Error("Stale network error"));
                    else if (staleKind === "HTTP") staleCall.reply({}, 500);
                    else staleCall.reply(staleKind === "success" ? { skills: ["Stale"] } : {});
                };
            }
            let newest;
            await act(async () => { newest = harness.service.fetchSkills(); });
            await act(async () => {
                if (newestFails) harness.calls.at(-1).reject(new Error("Newest library request failed"));
                else harness.calls.at(-1).reply({ skills: ["Fresh"] });
            });
            assert.equal(await newest, false);
            const definition = harness.service.fetchSkillData("Fresh", { kind: staleKind, newestFails });
            harness.calls.at(-1).reply({ definition: `fresh ${staleKind} ${newestFails}` });
            const data = await definition;
            const callCount = harness.calls.length;
            const renders = harness.renders;
            await act(async () => finishStale());
            assert.equal(await stale, false);
            assert.equal(harness.renders, renders);
            assert.equal(harness.service.skillLibraryStatus, newestFails ? "error" : "ready");
            assert.equal(harness.service.skillLibraryError, newestFails ? "Newest library request failed" : null);
            assert.equal(harness.service.hasLoadedSkills, true);
            assert.deepEqual(harness.service.skills, { skills: ["Fresh"] });
            assert.equal(harness.service.skillLibraryRefreshVersion, 1);
            assert.equal(await harness.service.fetchSkillData("Fresh", { kind: staleKind, newestFails }), data);
            assert.equal(harness.calls.length, callCount);
        }
    }
    assert.equal(errors.mock.callCount(), 5);
});

test("overlapping manual reloads stay busy until all settle independently of the latest background request", async (context) => {
    const errors = context.mock.method(console, "error", () => {});
    const harness = await mountedSkillService(context);
    let older;
    let newer;
    await act(async () => { older = harness.service.fetchSkills({ manual: true }); });
    await act(async () => { newer = harness.service.fetchSkills({ manual: true }); });
    assert.equal(harness.service.isReloadingSkills, true);
    assert.equal(harness.service.skillLibraryStatus, "loading");
    await act(async () => harness.window.dispatchEvent(new harness.window.Event("focus")));
    await act(async () => harness.calls[3].reply({ skills: ["Newest"] }));
    assert.equal(harness.service.skillLibraryStatus, "ready");
    assert.equal(harness.service.isReloadingSkills, true);

    await act(async () => harness.calls[2].reply({ skills: ["Ignored"] }));
    assert.equal(await newer, false);
    assert.equal(harness.service.isReloadingSkills, true);
    await act(async () => harness.calls[1].reject(new Error("Ignored failure")));
    assert.equal(await older, false);
    assert.equal(harness.service.isReloadingSkills, false);
    await act(async () => harness.calls[0].reply({ skills: ["Ignored initial list"] }));
    assert.deepEqual(harness.service.skills, { skills: ["Newest"] });
    assert.equal(harness.service.skillLibraryError, null);
    assert.equal(harness.service.skillLibraryRefreshVersion, 1);
    assert.equal(errors.mock.callCount(), 0);
});

test("unmount fences pending list successes and failures without invalidating definition caches", async (context) => {
    const errors = context.mock.method(console, "error", () => {});
    const harness = await mountedSkillService(context);
    await act(async () => harness.calls[0].reply({ skills: ["Cached"] }));
    const service = harness.service;
    const definition = service.fetchSkillData("Cached");
    harness.calls.at(-1).reply({ definition: "cached" });
    const data = await definition;
    let pendingSuccess;
    let pendingFailure;
    await act(async () => { pendingSuccess = service.fetchSkills(); });
    const successCall = harness.calls.at(-1);
    await act(async () => { pendingFailure = service.fetchSkills({ manual: true }); });
    const failureCall = harness.calls.at(-1);
    await harness.unmount();
    const renders = harness.renders;
    await act(async () => {
        successCall.reply({ skills: ["Late"] });
        failureCall.reject(new Error("Late failure"));
    });
    assert.equal(await pendingSuccess, false);
    assert.equal(await pendingFailure, false);
    assert.equal(harness.renders, renders);
    assert.equal(errors.mock.callCount(), 0);
    const callCount = harness.calls.length;
    assert.equal(await service.fetchSkillData("Cached"), data);
    harness.window.dispatchEvent(new harness.window.Event("focus"));
    harness.document.dispatchEvent(new harness.window.Event("visibilitychange"));
    assert.equal(harness.calls.length, callCount);
});
