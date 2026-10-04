import test from "node:test";
import assert from "node:assert/strict";
import { installApiProxy } from "../src/utils/apiProxy.js";
import { openFile, saveFile, readFile, selectDirectory } from "../src/tauri-client.js";

function proxyEnvironment(result = { status: 200, body: "{}" }) {
    const calls = [];
    const forwarded = [];
    const environment = {
        location: { origin: "http://tauri.localhost" },
        fetch: async (...args) => {
            forwarded.push(args);
            return new Response("forwarded");
        },
    };
    installApiProxy(environment, async (...args) => {
        calls.push(args);
        return result;
    });
    return { environment, calls, forwarded };
}

test("desktop proxy intercepts API paths and preserves method, query and JSON body", async () => {
    const { environment, calls } = proxyEnvironment({ status: 201, body: '{"created":true}' });
    const response = await environment.fetch("/api/skills?package=test", { method: "post", body: '{"value":1}' });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { created: true });
    assert.deepEqual(calls, [["api_request", {
        method: "POST", path: "/api/skills?package=test", body: '{"value":1}',
    }]]);
});

test("Request inputs are proxied without consuming the original body", async () => {
    const { environment, calls } = proxyEnvironment();
    const request = new Request("http://tauri.localhost/api/configure", { method: "POST", body: "configuration" });
    await environment.fetch(request);
    assert.equal(await request.text(), "configuration");
    assert.deepEqual(calls[0][1], { method: "POST", path: "/api/configure", body: "configuration" });
});

test("non-API paths and other origins retain the original fetch behavior", async () => {
    const { environment, calls, forwarded } = proxyEnvironment();
    const inputs = ["/assets/app.js", "/apiary", "https://other.example/api/skills"];
    for (const input of inputs) assert.equal(await (await environment.fetch(input)).text(), "forwarded");
    assert.equal(calls.length, 0);
    assert.deepEqual(forwarded.map(([input]) => input), inputs);
});

test("same-origin URL inputs and explicit Request overrides are supported", async () => {
    const { environment, calls } = proxyEnvironment();
    await environment.fetch(new URL("http://tauri.localhost/api/skills?x=1"));
    const request = new Request("http://tauri.localhost/api/configure", { method: "POST", body: "original" });
    await environment.fetch(request, { method: "PUT", body: "override" });
    assert.deepEqual(calls.map(([, payload]) => payload), [
        { method: "GET", path: "/api/skills?x=1", body: null },
        { method: "PUT", path: "/api/configure", body: "override" },
    ]);
});

test("installation is idempotent and empty HTTP response statuses are valid", async () => {
    const { environment, calls } = proxyEnvironment({ status: 204, body: "" });
    const proxyFetch = environment.fetch;
    installApiProxy(environment, () => assert.fail("proxy was reinstalled"));
    assert.equal(environment.fetch, proxyFetch);
    assert.equal((await environment.fetch("/api/delete")).status, 204);
    assert.equal(calls.length, 1);
});

test("already-aborted requests never reach IPC", async () => {
    const { environment, calls } = proxyEnvironment();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(environment.fetch("/api/skills", { signal: controller.signal }), { name: "AbortError" });
    assert.equal(calls.length, 0);
});

test("aborting an in-flight request stops waiting even if IPC has not completed", async () => {
    const environment = { fetch: () => assert.fail("original fetch called"), location: { origin: "http://tauri.localhost" } };
    installApiProxy(environment, () => new Promise(() => {}));
    const controller = new AbortController();
    const pending = environment.fetch("/api/skills", { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
});

test("IPC failures propagate to callers", async () => {
    const environment = { fetch: () => {}, location: { origin: "http://tauri.localhost" } };
    installApiProxy(environment, async () => { throw new Error("backend unavailable"); });
    await assert.rejects(environment.fetch("/api/skills"), /backend unavailable/);
});

test("file picker cancellation and successful file IO preserve native result contracts", async (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    const values = new Map([
        ["open_file", null], ["save_file", { success: false, path: "", file_name: "" }],
        ["read_file", ""], ["pick_directory", null],
    ]);
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
        __TAURI_INTERNALS__: { invoke: async (command) => values.get(command) },
    } });
    context.after(() => {
        if (original) Object.defineProperty(globalThis, "window", original);
        else delete globalThis.window;
    });
    assert.equal(await openFile(), null);
    assert.deepEqual(await saveFile("<scxml/>"), { success: false, path: "", file_name: "" });
    assert.equal(await readFile("/empty.xml"), "");
    assert.equal(await selectDirectory(), null);
    values.set("open_file", "/workflow.xml");
    values.set("save_file", { success: true, path: "/workflow.xml", file_name: "workflow.xml" });
    values.set("pick_directory", "/behaviors");
    assert.equal(await openFile(), "/workflow.xml");
    assert.deepEqual(await saveFile("<scxml/>", "/workflow.xml"), values.get("save_file"));
    assert.equal(await selectDirectory(), "/behaviors");
});

test("file and directory IPC failures reject instead of masquerading as cancellation", async (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    const calls = [];
    const reason = "Permission denied";
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
        __TAURI_INTERNALS__: { invoke: async (command, args) => { calls.push({ command, args }); throw reason; } },
    } });
    context.after(() => {
        if (original) Object.defineProperty(globalThis, "window", original);
        else delete globalThis.window;
    });
    for (const request of [() => openFile("Open SCXML"), () => saveFile("<scxml/>", "/workflow.xml", "Workflow"),
        () => readFile("/workflow.xml"), () => selectDirectory("Behaviors")]) {
        await assert.rejects(request(), (error) => error === reason);
    }
    assert.deepEqual(calls, [
        { command: "open_file", args: { title: "Open SCXML" } },
        { command: "save_file", args: { content: "<scxml/>", path: "/workflow.xml", title: "Workflow" } },
        { command: "read_file", args: { path: "/workflow.xml" } },
        { command: "pick_directory", args: { title: "Behaviors" } },
    ]);
});
