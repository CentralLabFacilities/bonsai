import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
const document = window.document;
const originals = new Map();
let React;
let createRoot;
let server;
let hooks;
let overlays;
let tabBar;
let feedback;
let root;
let container;
let current;
let native;
let calls;
let subscriptions;
let callbacks;
let nextCallbackId = 0;

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};

const node = (id = "work") => ({
    id,
    type: "custom",
    position: { x: 50, y: 60 },
    data: {
        label: id,
        fullSkillName: `pkg.skills.${id}`,
        isInitial: true,
        params: [{ key: "rate", expr: "1" }],
    },
});

const loadedTab = (id = "a") => ({
    id,
    title: id.toUpperCase(),
    fileName: `${id}.xml`,
    filePath: `/${id}.xml`,
    nodes: [node(id)],
    edges: [],
    manualSlots: [],
    globalDataModel: [],
    slotNodes: [],
    slotEdges: [],
    inheritedGlobalDataModel: [],
});

const inspection = (path = "/opened.xml") => ({
    path,
    fileName: "opened.xml",
    content: "<scxml/>",
    workflow: { states: [], transitions: [], dataModel: [{ id: "opened", expression: "3" }] },
});

test.before(async () => {
    for (const name of [
        "window",
        "document",
        "navigator",
        "HTMLElement",
        "Element",
        "HTMLInputElement",
        "Node",
        "Event",
        "KeyboardEvent",
        "MouseEvent",
        "ResizeObserver",
        "DOMMatrixReadOnly",
        "MutationObserver",
    ]) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, {
            value: name === "window" ? window : window[name],
            configurable: true,
            writable: true,
        });
    }
    for (const [name, value] of Object.entries({
        getComputedStyle: window.getComputedStyle.bind(window),
        requestAnimationFrame: window.requestAnimationFrame.bind(window),
        cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        alert: (message) => calls.push({ command: "alert", message }),
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    React = await import("react");
    ({ createRoot } = await import("react-dom/client"));
    const { createServer } = await import("vite");
    const { default: react } = await import("@vitejs/plugin-react");
    server = await createServer({
        configFile: false,
        plugins: [react()],
        appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
    // Sub-SM creation captures desktop mode when its module is evaluated.
    window.__TAURI_INTERNALS__ = {};
    const [graph, tabs, documents, submachines] = await Promise.all([
        server.ssrLoadModule("/src/hooks/useEditorGraphState.js"),
        server.ssrLoadModule("/src/hooks/useWorkflowTabs.js"),
        server.ssrLoadModule("/src/hooks/useWorkflowDocument.js"),
        server.ssrLoadModule("/src/hooks/useSubStateMachines.js"),
    ]);
    hooks = { ...graph, ...tabs, ...documents, ...submachines };
    overlays = (await server.ssrLoadModule("/src/components/EditorOverlays.jsx")).default;
    tabBar = (await server.ssrLoadModule("/src/components/WorkflowTabBar.jsx")).default;
    feedback = await server.ssrLoadModule("/src/components/ui/index.js");
});

test.beforeEach(async () => {
    calls = [];
    subscriptions = new Map();
    callbacks = new Map();
    native = {
        serialize: (request) => JSON.stringify(request),
        save: ({ path, title }) => ({ success: true, path: path || `/${title}`, file_name: title }),
        open: () => "/opened.xml",
        inspect: () => inspection(),
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (_, id) => subscriptions.delete(id),
    };
    window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" } },
        transformCallback: (callback) => {
            callbacks.set(++nextCallbackId, callback);
            return nextCallbackId;
        },
        invoke: async (command, args) => {
            calls.push({ command, args: structuredClone(args) });
            if (command === "serialize_editor_workflow") return native.serialize(args.request);
            if (command === "save_file") return native.save(args);
            if (command === "open_file") return native.open();
            if (command === "inspect_workflow_source") return native.inspect(args);
            if (command === "plugin:event|listen") {
                subscriptions.set(args.handler, args);
                return args.handler;
            }
            if (command === "plugin:event|unlisten" || command === "plugin:window|destroy")
                return null;
            throw new Error(`Unexpected native command: ${command}`);
        },
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    function Harness() {
        const graph = hooks.useEditorGraphState();
        const [selectedNodeId, setSelectedNodeId] = React.useState(null);
        const [isDraggingNode, setIsDraggingNode] = React.useState(false);
        const tabs = hooks.useWorkflowTabs({
            ...graph,
            selectedNodeId,
            setSelectedNodeId,
            isDraggingNode,
            fitView: () => {},
            getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
            setViewport: () => {},
            syncRustDocument: async (snapshot) => {
                calls.push({ command: "sync", snapshot });
            },
        });
        const submachines = hooks.useSubStateMachines({
            ...tabs,
            selectedNodes: graph.nodes.filter((node) => node.selected),
            behaviorDirectories: [{ key: "BEH", path: "/behaviors" }],
            fetchSkillData: async () => null,
            setContextMenu: (value) => calls.push({ command: "context", value }),
            checkSlotConnection: (...args) => calls.push({ command: "slots", args }),
        });
        const documents = hooks.useWorkflowDocument({
            ...tabs,
            isDesktop: true,
            fetchSkillData: async () => null,
            hydrateSubMachineInheritedSlots: async (nodes) => native.hydrate ? native.hydrate(nodes) : nodes,
            checkSlotConnection: (...args) => calls.push({ command: "slots", args }),
        });
        React.useLayoutEffect(() => {
            current = { graph, tabs, documents, submachines, setIsDraggingNode };
        }, [graph, tabs, documents, submachines, setIsDraggingNode]);
        return React.createElement(
            React.Fragment,
            null,
            React.createElement("button", { id: "original-focus" }, "Focus"),
            React.createElement(tabBar, { ...tabs, ...documents }),
            React.createElement(overlays, {
                documentGuard: documents.documentGuard,
                hint: {},
                subMachine: {},
                shortcuts: {},
                condition: { drawer: {} },
                slots: {},
                paste: {},
            }),
        );
    }
    await React.act(async () => root.render(React.createElement(feedback.FeedbackProvider, null, React.createElement(Harness))));
});

test.afterEach(async () => {
    await React.act(async () => root.unmount());
    container.remove();
    document.querySelectorAll(".bonsai-save-toast").forEach((element) => element.remove());
    await window.happyDOM.cancelAsync();
});

test.after(async () => {
    await server?.close();
    await window.happyDOM.cancelAsync();
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
});

const edit = async (value = "2") =>
    React.act(async () =>
        current.graph.setNodes((nodes) =>
            nodes.map((node) => ({
                ...node,
                data: { ...node.data, params: [{ key: "rate", expr: value }] },
            })),
        ),
    );
const openTab = async (id = "a") => React.act(async () => current.tabs.openTab(loadedTab(id)));
const begin = async (callback) => {
    let promise;
    await React.act(async () => {
        promise = callback();
        await Promise.resolve();
    });
    return { promise };
};
const settle = async (operation, callback) => {
    let result;
    let failure;
    let failed = false;
    await React.act(async () => {
        callback?.();
        try {
            result = await operation.promise;
        } catch (error) {
            failure = error;
            failed = true;
        }
    });
    if (failed) throw failure;
    return result;
};
const dialog = () => document.querySelector("[data-workflow-document-guard]");
const choose = async (label) => {
    const button = [...dialog().querySelectorAll("button")].find(
        (button) => button.textContent === label,
    );
    assert.ok(button, label);
    await React.act(async () => button.click());
};
const nativeClose = () => {
    const entry = [...subscriptions.entries()].find(
        ([, subscription]) => subscription.event === "tauri://close-requested",
    );
    assert.ok(entry, "native close listener");
    return callbacks.get(entry[0])({
        event: "tauri://close-requested",
        id: entry[0],
        payload: null,
    });
};

test("modified markers ignore selection and measurements, and clear when content returns to the checkpoint", async () => {
    await openTab();
    assert.equal(current.tabs.activeTab.isModified, false);
    await React.act(async () =>
        current.graph.setNodes((nodes) =>
            nodes.map((node) => ({ ...node, selected: true, measured: { width: 400 } })),
        ),
    );
    assert.equal(current.tabs.activeTab.isModified, false);
    await edit();
    assert.equal(current.tabs.activeTab.isModified, true);
    assert.ok(container.querySelector('[aria-label="Unsaved changes"]'));
    await edit("1");
    assert.equal(current.tabs.activeTab.isModified, false);
    assert.equal(container.querySelector('[aria-label="Unsaved changes"]'), null);
});

test("saving updates its originating tab after a tab switch without replacing either graph", async () => {
    await openTab();
    await edit();
    const write = deferred();
    native.save = () => write.promise;
    const saving = await begin(() => current.documents.handleSaveAsCurrentTab());
    await openTab("b");
    await edit("3");
    await settle(saving, () =>
        write.resolve({ success: true, path: "/renamed.xml", file_name: "renamed.xml" }),
    );
    const a = current.tabs.getTabSnapshot("a");
    const b = current.tabs.getTabSnapshot("b");
    assert.equal(a.fileName, "renamed.xml");
    assert.equal(a.isModified, false);
    assert.equal(a.nodes[0].data.params[0].expr, "2");
    assert.equal(b.fileName, "b.xml");
    assert.equal(b.isModified, true);
    assert.equal(b.nodes[0].data.params[0].expr, "3");
    assert.equal(current.tabs.activeTabId, "b");
    const serialized = JSON.parse(calls.find((call) => call.command === "save_file").args.content);
    assert.equal(serialized.nodes[0].id, "a");
});

test("edits during serialization or file writing remain modified after the earlier snapshot saves", async () => {
    await openTab();
    await edit();
    const serialization = deferred();
    native.serialize = () => serialization.promise;
    const saving = await begin(() => current.documents.handleSaveCurrentTab());
    await edit("3");
    await settle(saving, () => serialization.resolve("<scxml/>"));
    assert.equal(current.tabs.activeTab.isModified, true);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "3");
    const write = deferred();
    native.save = () => write.promise;
    const nextSave = await begin(() => current.documents.handleSaveCurrentTab());
    await edit("4");
    await settle(nextSave, () =>
        write.resolve({ success: true, path: "/a.xml", file_name: "a.xml" }),
    );
    assert.equal(current.tabs.activeTab.isModified, true);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "4");
});

test("completion from a replaced or closed document never renames or restores it", async () => {
    await openTab();
    await edit();
    const write = deferred();
    native.save = () => write.promise;
    const saving = await begin(() => current.documents.handleSaveCurrentTab());
    await React.act(async () =>
        current.tabs.replaceTabDocument(
            "a",
            { ...loadedTab("fresh"), nodes: [node("fresh")] },
            { title: "Fresh", fileName: "fresh.xml", filePath: "/fresh.xml", id: "a" },
        ),
    );
    await settle(saving, () =>
        write.resolve({ success: true, path: "/old.xml", file_name: "old.xml" }),
    );
    assert.equal(current.tabs.activeTab.fileName, "fresh.xml");
    assert.equal(current.graph.nodes[0].id, "fresh");
    assert.equal(current.tabs.activeTab.isModified, false);
    const nextWrite = deferred();
    native.save = () => nextWrite.promise;
    const next = await begin(() => current.documents.handleSaveCurrentTab());
    await React.act(async () => current.tabs.closeTab("a"));
    await settle(next, () =>
        nextWrite.resolve({ success: true, path: "/fresh.xml", file_name: "fresh.xml" }),
    );
    assert.equal(current.tabs.getTabSnapshot("a"), null);
    assert.equal(current.tabs.activeTabId, "tab-1");
});

test("duplicate saves share I/O only for the same tab and document generation", async () => {
    await openTab();
    await edit();
    const write = deferred();
    native.save = () => write.promise;
    const first = await begin(() => current.documents.handleSaveCurrentTab());
    const duplicate = await begin(() => current.documents.handleSaveCurrentTab());
    assert.equal(first.promise, duplicate.promise);
    await openTab("b");
    await edit("3");
    native.save = ({ title }) => ({ success: true, path: `/${title}`, file_name: title });
    const second = await begin(() => current.documents.handleSaveCurrentTab());
    assert.equal(calls.filter((call) => call.command === "save_file").length, 1);
    await settle(first, () => write.resolve({ success: true, path: "/a.xml", file_name: "a.xml" }));
    await settle(second);
    assert.equal(current.tabs.activeTab.isModified, false);
    assert.equal(calls.filter((call) => call.command === "save_file").length, 2);
});

test("reopening the same tab ID does not accept an earlier incarnation's save completion", async () => {
    await openTab();
    await edit();
    const write = deferred();
    native.save = () => write.promise;
    const saving = await begin(() => current.documents.handleSaveCurrentTab());
    const originalGeneration = current.tabs.activeTab.documentGeneration;
    await React.act(async () => current.tabs.closeTab("a"));
    await openTab();
    assert.notEqual(current.tabs.activeTab.documentGeneration, originalGeneration);
    await settle(saving, () =>
        write.resolve({ success: true, path: "/old.xml", file_name: "old.xml" }),
    );
    assert.equal(current.tabs.activeTab.fileName, "a.xml");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "1");
    assert.equal(current.tabs.activeTab.isModified, false);
});

test("Cancel preserves a modified tab; Discard closes it without saving", async () => {
    await openTab();
    await edit();
    const first = await begin(() => current.documents.handleCloseTab("a"));
    assert.equal(dialog().open, true);
    await choose("Cancel");
    assert.equal(await first.promise, false);
    assert.equal(current.tabs.activeTab.isModified, true);
    const second = await begin(() => current.documents.handleCloseTab("a"));
    await choose("Discard");
    assert.equal(await second.promise, true);
    assert.equal(current.tabs.getTabSnapshot("a"), null);
    assert.equal(
        calls.some((call) => call.command === "save_file"),
        false,
    );
});

test("Save closes a modified tab only after successful persistence", async () => {
    await openTab();
    await edit();
    const closing = await begin(() => current.documents.handleCloseTab("a"));
    await choose("Save");
    assert.equal(await closing.promise, true);
    assert.equal(current.tabs.getTabSnapshot("a"), null);
    assert.equal(calls.filter((call) => call.command === "save_file").length, 1);
});

test("cancelled and failed saves keep the close guard and document intact", async () => {
    await openTab();
    await edit();
    native.save = () => ({ success: false, path: "", file_name: "" });
    const closing = await begin(() => current.documents.handleCloseTab("a"));
    await choose("Save");
    assert.equal(dialog().querySelector('[role="alert"]'), null);
    assert.match(dialog().querySelector('[role="status"]').textContent, /Save cancelled/);
    assert.equal(current.tabs.activeTab.isModified, true);
    native.serialize = () => {
        throw new Error("Write failed");
    };
    await choose("Save");
    assert.ok(dialog().textContent.includes("Write failed"));
    assert.equal(current.tabs.activeTab.isModified, true);
    await choose("Cancel");
    assert.equal(await closing.promise, false);
});

test("a guarded save cannot close newer edits; its busy choices stay disabled", async () => {
    await openTab();
    await edit();
    const write = deferred();
    native.save = () => write.promise;
    const closing = await begin(() => current.documents.handleCloseTab("a"));
    await choose("Save");
    assert.ok([...dialog().querySelectorAll("button")].every((button) => button.disabled));
    await edit("3");
    await React.act(async () => {
        write.resolve({ success: true, path: "/a.xml", file_name: "a.xml" });
        await Promise.resolve();
    });
    assert.ok(dialog().textContent.includes("changed while saving"));
    assert.equal(current.tabs.activeTab.isModified, true);
    await choose("Cancel");
    assert.equal(await closing.promise, false);
});

test("closing an inactive modified tab saves that tab and preserves the active document", async () => {
    await openTab();
    await edit();
    await openTab("b");
    await edit("3");
    const closing = await begin(() => current.documents.handleCloseTab("a"));
    await choose("Save");
    assert.equal(await closing.promise, true);
    assert.equal(current.tabs.activeTabId, "b");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "3");
    assert.equal(current.tabs.activeTab.isModified, true);
    assert.equal(calls.find((call) => call.command === "save_file").args.path, "/a.xml");
});

test("opening a file can be cancelled without replacing the document or Rust store", async () => {
    await openTab();
    await edit();
    const opening = await begin(() => current.documents.handleOpenDocument());
    assert.ok(dialog().textContent.includes("opening another workflow"));
    await choose("Cancel");
    assert.equal(await opening.promise, null);
    assert.equal(current.graph.nodes[0].id, "a");
    assert.equal(current.tabs.activeTab.isModified, true);
    assert.equal(
        calls.some((call) => call.command === "parse_scxml_workflow"),
        false,
    );
});

test("discarding for Open installs a clean checkpoint only on the originating tab", async () => {
    await openTab();
    await edit();
    const picking = deferred();
    native.open = () => picking.promise;
    const opening = await begin(() => current.documents.handleOpenDocument());
    await openTab("b");
    await edit("3");
    await React.act(async () => {
        picking.resolve("/opened.xml");
        await Promise.resolve();
    });
    assert.ok(dialog());
    await choose("Discard");
    await settle(opening);
    const a = current.tabs.getTabSnapshot("a");
    assert.equal(a.fileName, "opened.xml");
    assert.equal(a.isModified, false);
    assert.equal(a.nodes.length, 0);
    assert.equal(a.globalDataModel[0].id, "opened");
    assert.equal(current.tabs.activeTabId, "b");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "3");
    assert.equal(calls.filter((call) => call.command === "sync").length, 2);
});

test("save-before-Open completes the old save before installing the inspected file", async () => {
    await openTab();
    await edit();
    const opening = await begin(() => current.documents.handleOpenDocument());
    await choose("Save");
    await settle(opening);
    assert.equal(current.tabs.activeTab.fileName, "opened.xml");
    assert.equal(current.tabs.activeTab.isModified, false);
    assert.equal(calls.find((call) => call.command === "save_file").args.path, "/a.xml");
    assert.equal(
        calls.some((call) => call.command === "parse_scxml_workflow"),
        false,
    );
});

test("edits made during import hydration require fresh approval", async () => {
    await openTab();
    const hydrating = deferred();
    const hydration = deferred();
    native.hydrate = async (nodes) => {
        hydrating.resolve();
        await hydration.promise;
        return nodes;
    };
    const opening = await begin(() => current.documents.handleOpenDocument());
    await React.act(async () => { await hydrating.promise; });
    await edit();
    await React.act(async () => {
        hydration.resolve();
        await Promise.resolve();
    });
    assert.ok(dialog(), "the new edit must not be overwritten after parsing");
    await choose("Cancel");
    assert.equal(await opening.promise, null);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "2");
    assert.equal(current.tabs.activeTab.isModified, true);
});

test("an invalid Open preserves the original workflow even after Discard approval", async () => {
    await openTab();
    await edit();
    native.inspect = () => ({ ...inspection(), workflow: null });
    const opening = await begin(() => current.documents.handleOpenDocument());
    await choose("Discard");
    await settle(opening);
    assert.equal(current.graph.nodes[0].id, "a");
    assert.equal(current.tabs.activeTab.isModified, true);
    assert.match(current.documents.documentNotice.message, /did not return an inspected workflow/);
    assert.equal(calls.some((call) => call.command === "alert"), false);
});

test("modality starts on Cancel, traps Tab, restores focus and blocks workflow shortcuts", async () => {
    await openTab();
    await edit();
    const focus = document.querySelector("#original-focus");
    focus.focus();
    const closing = await begin(() => current.documents.handleCloseTab("a"));
    assert.equal(document.activeElement.textContent, "Cancel");
    await React.act(async () =>
        document.activeElement.dispatchEvent(
            new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(document.activeElement.textContent, "Discard");
    await React.act(async () =>
        document.activeElement.dispatchEvent(
            new window.KeyboardEvent("keydown", {
                key: "Tab",
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            }),
        ),
    );
    assert.equal(document.activeElement.textContent, "Cancel");
    await React.act(async () =>
        window.dispatchEvent(
            new window.KeyboardEvent("keydown", {
                key: "Tab",
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
            }),
        ),
    );
    assert.equal(current.tabs.activeTabId, "a");
    await React.act(async () =>
        document.activeElement.dispatchEvent(
            new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(await closing.promise, false);
    assert.equal(document.activeElement, focus);
});

test("beforeunload protects modified inactive tabs and stops warning once they are saved", async () => {
    await openTab();
    await edit();
    await openTab("b");
    const before = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    assert.equal(before.defaultPrevented, true);
    await React.act(async () => current.tabs.switchTab("a"));
    await React.act(async () => {
        await current.documents.handleSaveCurrentTab();
    });
    const after = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    assert.equal(after.defaultPrevented, false);
});

test("native application exit respects Cancel and requests approval for every modified tab", async () => {
    await openTab();
    await edit();
    await openTab("b");
    await edit("3");
    const first = await begin(nativeClose);
    await choose("Cancel");
    await settle(first);
    assert.equal(
        calls.some((call) => call.command === "plugin:window|destroy"),
        false,
    );
    const second = await begin(nativeClose);
    await choose("Discard");
    assert.ok(dialog().textContent.includes("B"));
    await choose("Save");
    await settle(second);
    assert.equal(calls.filter((call) => call.command === "plugin:window|destroy").length, 1);
    assert.equal(calls.find((call) => call.command === "save_file").args.path, "/b.xml");
});

test("existing asynchronous library opens preserve an already-open modified workflow", async () => {
    await openTab();
    await edit();
    await React.act(async () => current.tabs.openTab(loadedTab("a")));
    assert.equal(current.graph.nodes[0].data.params[0].expr, "2");
    assert.equal(current.tabs.activeTab.isModified, true);
});

test("empty workflows can be saved after deleting their last state", async () => {
    await openTab();
    await React.act(async () => current.graph.setNodes([]));
    assert.equal(current.tabs.activeTab.isModified, true);
    await React.act(async () => {
        await current.documents.handleSaveCurrentTab();
    });
    assert.equal(current.tabs.activeTab.isModified, false);
    assert.deepEqual(
        JSON.parse(calls.find((call) => call.command === "save_file").args.content).nodes,
        [],
    );
});

test("Save before reopening the same file imports the newly written bytes", async () => {
    await React.act(async () => current.tabs.openTab({ ...loadedTab(), nodes: [], globalDataModel: [{ id: "rate", expr: "1" }] }));
    await React.act(async () => current.graph.setGlobalDataModel([{ id: "rate", expr: "2" }]));
    let disk = [{ id: "rate", expression: "1" }];
    native.open = () => "/a.xml";
    native.save = ({ content, path, title }) => {
        disk = JSON.parse(content).dataModel;
        return { success: true, path, file_name: title };
    };
    native.inspect = () => ({ ...inspection("/a.xml"), workflow: { states: [], transitions: [], dataModel: disk } });
    const opening = await begin(() => current.documents.handleOpenDocument());
    assert.equal(calls.some((call) => call.command === "inspect_workflow_source"), false);
    await choose("Save");
    await settle(opening);
    assert.equal(disk[0].expression, "2");
    assert.equal(current.graph.globalDataModel.find((entry) => entry.id === "rate").expr, "2");
    assert.equal(current.tabs.activeTab.isModified, false);
});

test("a stale serialization is fenced before writing over a reopened document", async () => {
    await openTab();
    await edit();
    const serialization = deferred();
    native.serialize = () => serialization.promise;
    let disk;
    native.save = ({ content, path, title }) => {
        disk = JSON.parse(content);
        return { success: true, path, file_name: title };
    };
    const old = await begin(() => current.documents.handleSaveCurrentTab());
    const oldRequest = calls.find((call) => call.command === "serialize_editor_workflow").args.request;
    await React.act(async () => current.tabs.closeTab("a"));
    await openTab();
    await edit("4");
    native.serialize = (request) => JSON.stringify(request);
    const latest = await begin(() => current.documents.handleSaveCurrentTab());
    const result = await settle(old, () => serialization.resolve(JSON.stringify(oldRequest)));
    await settle(latest);
    assert.equal(result.success, false);
    assert.equal(calls.filter((call) => call.command === "save_file").length, 1);
    assert.equal(disk.nodes[0].parameters[0].expression, "4");
    assert.equal(current.tabs.activeTab.isModified, false);
});

test("an already-started native write finishes before a newer incarnation writes the same path", async () => {
    await openTab();
    await edit();
    const writing = deferred();
    const writes = [];
    let disk;
    native.save = async ({ content, path, title }) => {
        if (writes.length === 0) {
            writes.push("pending");
            await writing.promise;
        }
        disk = JSON.parse(content);
        writes.push(disk.nodes[0].parameters[0].expression);
        return { success: true, path, file_name: title };
    };
    const old = await begin(() => current.documents.handleSaveCurrentTab());
    await React.act(async () => current.tabs.closeTab("a"));
    await openTab();
    await edit("4");
    const latest = await begin(() => current.documents.handleSaveCurrentTab());
    assert.deepEqual(writes, ["pending"]);
    await settle(old, () => writing.resolve());
    await settle(latest);
    assert.deepEqual(writes, ["pending", "2", "4"]);
    assert.equal(disk.nodes[0].parameters[0].expression, "4");
    assert.equal(current.tabs.activeTab.isModified, false);
});

test("async child patches address and rebase the originating parent, not the newly active tab", async () => {
    await openTab();
    const origin = current.tabs.getTabSnapshot("a");
    await edit("3");
    await openTab("b");
    await edit("4");
    await React.act(async () => current.tabs.openTab(loadedTab("child"), {
        originTabId: origin.id, originGeneration: origin.documentGeneration,
        currentTabPatch: (parent) => ({ nodes: [...parent.nodes, node("added")] }),
    }));
    const a = current.tabs.getTabSnapshot("a");
    const b = current.tabs.getTabSnapshot("b");
    assert.deepEqual(a.nodes.map((node) => node.id), ["a", "added"]);
    assert.equal(a.nodes[0].data.params[0].expr, "3");
    assert.deepEqual(b.nodes.map((node) => node.id), ["b"]);
    assert.equal(b.nodes[0].data.params[0].expr, "4");
    assert.equal(b.filePath, "/b.xml");
});

test("destructive child extraction rejects changed, replaced or closed parent checkpoints", async () => {
    await openTab();
    const origin = current.tabs.getTabSnapshot("a");
    const options = { originTabId: "a", originGeneration: origin.documentGeneration, expectedFingerprint: origin.fingerprint, currentTabPatch: () => ({ nodes: [] }) };
    await edit();
    let applied;
    await React.act(async () => { applied = current.tabs.openTab(loadedTab("child"), options); });
    assert.equal(applied, false);
    assert.equal(current.tabs.activeTabId, "a");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "2");
    await React.act(async () => current.tabs.replaceTabDocument("a", { ...loadedTab(), nodes: [node("new")] }));
    await React.act(async () => { applied = current.tabs.openTab(loadedTab("child"), options); });
    assert.equal(applied, false);
    await React.act(async () => current.tabs.closeTab("a"));
    await React.act(async () => { applied = current.tabs.openTab(loadedTab("child"), options); });
    assert.equal(applied, false);
    assert.equal(current.tabs.getTabSnapshot("child"), null);
});

test("path-based reuse does not reopen a different file after a path-derived tab ID is repurposed", async () => {
    const original = { ...loadedTab(), id: "tab-behavior-original", filePath: "/original.xml" };
    await React.act(async () => current.tabs.openTab(original));
    await React.act(async () => current.tabs.replaceTabDocument(original.id, loadedTab("different"), { id: original.id, filePath: "/different.xml", parentTabId: null }));
    await React.act(async () => current.tabs.openTab(original));
    assert.equal(current.tabs.activeTab.filePath, "/original.xml");
    assert.notEqual(current.tabs.activeTabId, original.id);
    assert.equal(current.tabs.getTabSnapshot(original.id).filePath, "/different.xml");
    await edit();
    const reopenedId = current.tabs.activeTabId;
    await React.act(async () => current.tabs.openTab({ ...original, id: "another-path-alias" }));
    assert.equal(current.tabs.activeTabId, reopenedId);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "2");
});

test("selection and measurement updates do not repeat full export normalization", async () => {
    let reads = 0;
    const entry = node("tracked");
    Object.defineProperty(entry.data.params[0], "expr", { enumerable: true, get: () => { reads += 1; return "1"; } });
    await React.act(async () => current.tabs.openTab({ ...loadedTab(), nodes: [entry] }));
    reads = 0;
    await React.act(async () => current.graph.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: true, measured: { width: 300 } }))));
    assert.equal(reads, 0);
    await React.act(async () => current.graph.setNodes((nodes) => nodes.map((node) => ({ ...node, position: { x: 80, y: 60 } }))));
    assert.ok(reads > 0);
    assert.equal(current.tabs.activeTab.isModified, true);
});

test("a graph edit batched with native save completion cannot be lost by the close guard", async () => {
    await openTab();
    await edit();
    const write = deferred();
    native.save = () => write.promise;
    const closing = await begin(() => current.documents.handleCloseTab("a"));
    const saving = await begin(() => current.documents.documentGuard.onResolve("save"));
    await React.act(async () => {
        current.graph.setNodes((nodes) => nodes.map((node) => ({ ...node, data: { ...node.data, params: [{ key: "rate", expr: "3" }] } })));
        write.resolve({ success: true, path: "/a.xml", file_name: "a.xml" });
        await saving.promise;
    });
    assert.ok(dialog(), "the guard must retain the newer edit rather than close it");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "3");
    await choose("Cancel");
    assert.equal(await closing.promise, false);
});

test("Sub-SM inspection rebases live parent edits without overwriting a newly active workflow", async () => {
    const source = "${BEH}/child.xml";
    const reference = {
        ...node("reference"),
        type: "submachine",
        data: {
            ...node("reference").data,
            src: source,
            events: [{ id: "success", target: "retained", cond: "old", editorImportedSynthetic: true }],
            inheritedSlots: [{ key: "obsolete" }],
            localDataModel: [{ id: "obsolete", expr: "0" }],
        },
    };
    await React.act(async () => current.tabs.openTab({
        ...loadedTab(),
        nodes: [reference, { ...reference, id: "rerouted" }, node("retained")],
        globalDataModel: [{ id: "_parent", expr: "1" }],
        inheritedGlobalDataModel: [{ id: "_ancestor", expr: "0", inheritedFrom: "Ancestor" }],
    }));
    const inspecting = deferred();
    const inspected = deferred();
    native.inspect = (args) => {
        inspecting.resolve(args);
        return inspected.promise;
    };
    const handler = current.submachines.handleOpenSubMachine;
    const opening = await begin(() => handler(source, "Child"));
    const request = await inspecting.promise;
    assert.equal(request.src, source);
    assert.equal(request.currentFilePath, "/a.xml");
    const events = [
        { id: "success", target: "concurrent", cond: "rate > 2", assignments: [{ location: "_rate", expr: "rate" }], editorImportedSynthetic: true },
        { id: "missing", editorBoundarySynthetic: true },
    ];
    await React.act(async () => current.graph.setNodes((nodes) => [
        ...nodes.map((node) => node.id === "reference"
            ? { ...node, data: { ...node.data, label: "Edited reference", events } }
            : node.id === "rerouted"
                ? { ...node, data: { ...node.data, src: "${BEH}/other.xml" } }
                : node),
        node("concurrent"),
    ]));
    const editedParent = current.tabs.getTabSnapshot("a");
    await openTab("b");
    await edit("4");
    const b = current.tabs.getTabSnapshot("b");
    assert.equal(current.submachines.handleOpenSubMachine, handler);
    await settle(opening, () => inspected.resolve({
        ...inspection("/behaviors/child.xml"),
        behaviorExitEvents: ["success", "failure"],
    }));
    const a = current.tabs.getTabSnapshot("a");
    const refreshed = a.nodes[0];
    assert.deepEqual(a.nodes.map((node) => node.id), ["reference", "rerouted", "retained", "concurrent"]);
    assert.equal(refreshed.data.label, "Edited reference");
    assert.deepEqual(refreshed.data.events[0], { ...events[0], editorImportedSynthetic: false, editorBoundarySynthetic: false });
    assert.equal(refreshed.data.events[1].id, "failure");
    assert.deepEqual(refreshed.data.events[2], events[1]);
    assert.deepEqual(refreshed.data.inheritedSlots, []);
    assert.equal(refreshed.data.localDataModel[0].id, "opened");
    assert.equal(a.nodes[1], editedParent.nodes[1]);
    assert.equal(a.nodes[3], editedParent.nodes[3]);
    assert.equal(current.tabs.getTabSnapshot("b").nodes, b.nodes);
    assert.equal(current.tabs.getTabSnapshot("b").fingerprint, b.fingerprint);
    assert.equal(current.tabs.activeTab.filePath, "/behaviors/child.xml");
    assert.equal(current.tabs.activeTab.parentTabId, "a");
    assert.deepEqual(current.graph.inheritedGlobalDataModel.map((entry) => entry.id), ["_ancestor", "_parent"]);
    assert.equal(calls.filter((call) => call.command === "slots").length, 1);
});

test("empty Sub-SM creation appends to live parent content and determines its initial state after writing", async () => {
    await openTab("b");
    await edit("4");
    const b = current.tabs.getTabSnapshot("b");
    const cases = [
        { initialNodes: [], liveNodes: [node("concurrent")], isInitial: false },
        { initialNodes: [node("removed")], liveNodes: [], isInitial: true },
    ];
    for (const [index, scenario] of cases.entries()) {
        const parentId = `empty-parent-${index}`;
        await React.act(async () => current.tabs.openTab({ ...loadedTab(parentId), nodes: scenario.initialNodes }));
        const write = deferred();
        native.save = () => write.promise;
        const fileName = `empty-${index}.xml`;
        const path = `/behaviors/${fileName}`;
        const position = { x: 20, y: 30 };
        const creating = await begin(() => current.submachines.handleCreateEmptySubMachine(position, {
            directory: "/behaviors", fileName,
        }));
        assert.equal(calls.filter((call) => call.command === "save_file").length, index + 1);
        const created = await settle(creating, () => {
            current.graph.setNodes(scenario.liveNodes);
            current.tabs.switchTab("b");
            write.resolve({ success: true, path, file_name: fileName });
        });
        assert.equal(created, true);
        const parentNodes = current.tabs.getTabSnapshot(parentId).nodes;
        assert.deepEqual(parentNodes.slice(0, -1), scenario.liveNodes);
        assert.equal(parentNodes.at(-1).data.isInitial, scenario.isInitial);
        assert.equal(parentNodes.at(-1).data.src, `\${BEH}/${fileName}`);
        assert.deepEqual(parentNodes.at(-1).position, position);
        assert.equal(current.tabs.getTabSnapshot("b").nodes, b.nodes);
        assert.equal(current.tabs.getTabSnapshot("b").fingerprint, b.fingerprint);
        assert.equal(current.tabs.activeTab.parentTabId, parentId);
        assert.equal(current.tabs.activeTab.filePath, path);
        assert.deepEqual(current.graph.nodes, []);
        assert.deepEqual(current.graph.edges, []);
    }
    assert.equal(calls.filter((call) => call.command === "context").length, 2);
});

test("Sub-SM extraction retains edited, closed or replaced origins when a child write finishes", async () => {
    await openTab("b");
    await edit("4");
    const b = current.tabs.getTabSnapshot("b");
    const writtenFiles = new Map();
    for (const change of ["edited", "closed", "replaced"]) {
        const parentId = `parent-${change}`;
        const selected = { ...node("selected"), selected: true };
        await React.act(async () => current.tabs.openTab({
            ...loadedTab(parentId), nodes: [selected, node("retained")],
        }));
        const origin = current.tabs.getTabSnapshot(parentId);
        const writing = deferred();
        const write = deferred();
        native.save = async ({ content, path }) => {
            writing.resolve();
            await write.promise;
            writtenFiles.set(path, content);
            return { success: true, path, file_name: path.split("/").pop() };
        };
        const path = `/behaviors/extracted-${change}.xml`;
        const extracting = await begin(() => current.submachines.handleCreateSubMachineFromSelected({
            directory: "/behaviors", fileName: `extracted-${change}.xml`,
        }));
        await writing.promise;
        let failure;
        await assert.rejects(() => settle(extracting, () => {
            if (change === "edited") {
                current.graph.setNodes((nodes) => nodes.map((node) => ({
                    ...node, data: { ...node.data, params: [{ key: "rate", expr: "2" }] },
                })));
            }
            current.tabs.switchTab("b");
            if (change === "closed") current.tabs.closeTab(parentId);
            if (change === "replaced") current.tabs.replaceTabDocument(parentId, loadedTab("replacement"), { id: parentId });
            write.resolve();
        }), (error) => {
            failure = error;
            return error.message.includes("no states were removed");
        });
        const parent = current.tabs.getTabSnapshot(parentId);
        if (change === "closed") {
            assert.equal(parent, null);
        } else if (change === "replaced") {
            assert.notEqual(parent.documentGeneration, origin.documentGeneration);
            assert.equal(parent.nodes[0].id, "replacement");
        } else {
            assert.deepEqual(parent.nodes.map((node) => node.id), ["selected", "retained"]);
            assert.equal(parent.nodes[0].data.params[0].expr, "2");
            assert.equal(parent.isModified, true);
        }
        assert.equal(current.tabs.activeTabId, "b");
        assert.equal(current.tabs.getTabSnapshot("b").nodes, b.nodes);
        assert.equal(current.tabs.getTabSnapshot("b").fingerprint, b.fingerprint);
        assert.equal(current.tabs.getTabsSnapshot().some((tab) => tab.filePath === path), false);
        const written = JSON.parse(writtenFiles.get(path));
        assert.equal(written.nodes.length, 1);
        assert.equal(written.nodes[0].id, "selected");
        assert.equal(written.nodes[0].parameters[0].expression, "1");
        const message = failure.message;
        assert.match(message, /original workflow changed|no longer available/);
        assert.match(message, /no states were removed/);
        assert.ok(message.includes(`The new child file was kept at ${path}`));
        assert.equal(calls.some((call) => call.command === "alert"), false);
    }
    assert.equal(writtenFiles.size, 3);
    assert.equal(calls.filter((call) => call.command === "save_file").length, 3);
    assert.equal(calls.filter((call) => call.command === "slots").length, 0);
});

test("Sub-SM extraction permits UI-only edits and rebases current parent node and edge metadata", async () => {
    const selected = { ...node("selected"), selected: true, position: { x: 120, y: 140 } };
    const edge = { id: "exit", source: "selected", sourceHandle: "success", target: "retained", data: { cond: "rate > 0" } };
    await React.act(async () => current.tabs.openTab({ ...loadedTab(), nodes: [selected, node("retained")], edges: [edge] }));
    await openTab("b");
    await edit("4");
    const b = current.tabs.getTabSnapshot("b");
    await React.act(async () => current.tabs.switchTab("a"));
    const origin = current.tabs.getTabSnapshot("a");
    const writing = deferred();
    const write = deferred();
    native.save = () => {
        writing.resolve();
        return write.promise;
    };
    const extracting = await begin(() => current.submachines.handleCreateSubMachineFromSelected({
        directory: "/behaviors", fileName: "ui-extraction.xml",
    }));
    await writing.promise;
    const controlPoints = [{ id: "ui-route", x: 10, y: 20 }];
    let liveParent;
    const extracted = await settle(extracting, () => {
        current.graph.setNodes((nodes) => nodes.map((node) => ({
            ...node,
            selected: node.id === "retained",
            measured: { width: 321 },
            data: { ...node.data, runtimeStatus: "live" },
        })));
        current.graph.setEdges((edges) => edges.map((edge) => ({
            ...edge, selected: true, data: { ...edge.data, controlPoints },
        })));
        liveParent = current.tabs.getTabSnapshot("a");
        assert.equal(liveParent.fingerprint, origin.fingerprint);
        current.tabs.switchTab("b");
        write.resolve({ success: true, path: "/behaviors/ui-extraction.xml", file_name: "ui-extraction.xml" });
    });
    assert.equal(extracted, true);
    const parent = current.tabs.getTabSnapshot("a");
    const replacement = parent.nodes[1];
    assert.equal(parent.nodes[0], liveParent.nodes[1]);
    assert.equal(parent.nodes[0].selected, true);
    assert.equal(parent.nodes[0].measured.width, 321);
    assert.equal(parent.nodes[0].data.runtimeStatus, "live");
    assert.equal(parent.edges[0].selected, true);
    assert.deepEqual(parent.edges[0].data.controlPoints, controlPoints);
    assert.equal(parent.edges[0].source, replacement.id);
    assert.equal(parent.edges[0].target, "retained");
    assert.equal(replacement.data.isInitial, true);
    assert.equal(replacement.data.events[0].cond, "rate > 0");
    assert.equal(replacement.data.events[0].target, "retained");
    assert.equal(current.tabs.getTabSnapshot("b").nodes, b.nodes);
    assert.equal(current.tabs.getTabSnapshot("b").fingerprint, b.fingerprint);
    assert.equal(current.tabs.activeTab.parentTabId, "a");
    assert.deepEqual(current.graph.nodes[0].position, { x: 50, y: 50 });
    assert.equal(current.graph.nodes[0].selected, false);
    assert.equal(calls.filter((call) => call.command === "slots").length, 1);
});

test("Sub-SM opening reuses alternate-ID children without refreshing their live graphs or slots", async () => {
    await openTab();
    const reference = { ...node("reference"), type: "submachine", data: { src: "${BEH}/child.xml", events: [{ id: "success" }] } };
    await React.act(async () => current.graph.setNodes([reference]));
    await React.act(async () => current.tabs.openTab({
        ...loadedTab("child-alias"), filePath: "/behaviors/child.xml", slotNodes: [node("child-slot")],
    }));
    await edit("3");
    const child = current.tabs.getTabSnapshot("child-alias");
    await React.act(async () => current.tabs.switchTab("a"));
    const inspecting = deferred();
    const inspected = deferred();
    native.inspect = () => {
        inspecting.resolve();
        return inspected.promise;
    };
    const opening = await begin(() => current.submachines.handleOpenSubMachine("${BEH}/child.xml"));
    await inspecting.promise;
    await edit("2");
    const a = current.tabs.getTabSnapshot("a");
    await openTab("b");
    await edit("4");
    const b = current.tabs.getTabSnapshot("b");
    await settle(opening, () => inspected.resolve({ ...inspection("/behaviors/child.xml"), behaviorExitEvents: ["failure"] }));
    assert.equal(current.tabs.activeTabId, "child-alias");
    assert.equal(current.tabs.getTabSnapshot("child-alias").nodes, child.nodes);
    assert.equal(current.tabs.getTabSnapshot("child-alias").slotNodes, child.slotNodes);
    assert.equal(current.tabs.getTabSnapshot("child-alias").isModified, true);
    assert.equal(current.tabs.getTabSnapshot("a").nodes, a.nodes);
    assert.equal(current.tabs.getTabSnapshot("b").nodes, b.nodes);
    assert.equal(calls.filter((call) => call.command === "slots").length, 0);

    await React.act(async () => current.tabs.switchTab("a"));
    const hydrating = deferred();
    const hydrated = deferred();
    native.inspect = ({ src }) => {
        if (src === "${BEH}/late-child.xml") return {
            ...inspection("/behaviors/late-child.xml"),
            workflow: { states: [{ id: "nested", scxmlId: "nested", source: "nested.xml" }], transitions: [], dataModel: [] },
        };
        hydrating.resolve();
        return hydrated.promise;
    };
    const lateOpening = await begin(() => current.submachines.handleOpenSubMachine("${BEH}/late-child.xml"));
    await hydrating.promise;
    await React.act(async () => current.tabs.openTab({
        ...loadedTab("late-alias"), filePath: "/behaviors/late-child.xml", slotNodes: [node("late-slot")],
    }));
    await edit("5");
    const lateChild = current.tabs.getTabSnapshot("late-alias");
    await React.act(async () => current.tabs.switchTab("b"));
    await settle(lateOpening, () => hydrated.resolve(inspection("/behaviors/nested.xml")));
    assert.equal(current.tabs.activeTabId, "late-alias");
    assert.equal(current.tabs.getTabSnapshot("late-alias").nodes, lateChild.nodes);
    assert.equal(current.tabs.getTabSnapshot("late-alias").slotNodes, lateChild.slotNodes);
    assert.equal(current.tabs.getTabSnapshot("late-alias").isModified, true);
    assert.equal(current.tabs.getTabSnapshot("a").nodes, a.nodes);
    assert.equal(current.tabs.getTabSnapshot("b").nodes, b.nodes);
    assert.equal(calls.filter((call) => call.command === "slots").length, 0);
});

test("Sub-SM extraction does not refresh slots when its written child is already open under another ID", async () => {
    const selected = { ...node("selected"), selected: true };
    await React.act(async () => current.tabs.openTab({ ...loadedTab(), nodes: [selected, node("retained")] }));
    const writing = deferred();
    const write = deferred();
    native.save = () => {
        writing.resolve();
        return write.promise;
    };
    const extracting = await begin(() => current.submachines.handleCreateSubMachineFromSelected({
        directory: "/behaviors", fileName: "existing-child.xml",
    }));
    await writing.promise;
    await React.act(async () => current.tabs.openTab({
        ...loadedTab("existing-alias"), filePath: "/behaviors/existing-child.xml", slotNodes: [node("existing-slot")],
    }));
    await edit("3");
    const child = current.tabs.getTabSnapshot("existing-alias");
    await openTab("b");
    await edit("4");
    const b = current.tabs.getTabSnapshot("b");
    assert.equal(await settle(extracting, () => write.resolve({
        success: true, path: "/behaviors/existing-child.xml", file_name: "existing-child.xml",
    })), true);
    assert.equal(current.tabs.activeTabId, "existing-alias");
    assert.equal(current.tabs.getTabSnapshot("existing-alias").nodes, child.nodes);
    assert.equal(current.tabs.getTabSnapshot("existing-alias").slotNodes, child.slotNodes);
    assert.equal(current.tabs.getTabSnapshot("existing-alias").isModified, true);
    assert.equal(current.tabs.getTabSnapshot("a").nodes[0].id, "retained");
    assert.equal(current.tabs.getTabSnapshot("a").nodes[1].type, "submachine");
    assert.equal(current.tabs.getTabSnapshot("b").nodes, b.nodes);
    assert.equal(calls.filter((call) => call.command === "slots").length, 0);
});

test("workflow tab buttons navigate the current order with arrows, Home and End", async () => {
    await openTab("a");
    await openTab("b");
    const button = (id) => document.getElementById(`workflow-tab-${id}`);
    const key = async (value) => React.act(async () => document.activeElement.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
    ));
    assert.equal(button("b").tagName, "BUTTON");
    assert.equal(button("b").getAttribute("aria-controls"), "workflow-tab-panel");
    assert.equal(button("b").getAttribute("aria-selected"), "true");
    button("b").focus();
    await key("ArrowRight");
    assert.equal(current.tabs.activeTabId, "tab-1");
    assert.equal(document.activeElement, button("tab-1"));
    await key("ArrowLeft");
    assert.equal(current.tabs.activeTabId, "b");
    await key("Home");
    assert.equal(current.tabs.activeTabId, "tab-1");
    await key("End");
    assert.equal(current.tabs.activeTabId, "b");
    await React.act(async () => current.tabs.handleTabDragStart({ dataTransfer: { setData: () => {} } }, "a"));
    await React.act(async () => current.tabs.handleTabDragOver({ preventDefault: () => {} }, "b"));
    assert.deepEqual(current.tabs.tabs.map((tab) => tab.id), ["tab-1", "b", "a"]);
    await key("ArrowRight");
    assert.equal(current.tabs.activeTabId, "a");
    assert.equal(document.activeElement, button("a"));
    assert.equal([...document.querySelectorAll('[role="tab"]')].filter((tab) => tab.tabIndex === 0).length, 1);
    assert.equal(document.querySelector("button button"), null);
});

test("keyboard workflow close buttons preserve guard cancellation and restore surviving tab focus", async () => {
    await openTab("a");
    await edit();
    const close = document.querySelector('button[aria-label="Close A tab"]');
    assert.ok(close);
    close.focus();
    await React.act(async () => close.click());
    assert.ok(dialog());
    await choose("Cancel");
    assert.equal(document.activeElement, close);
    assert.equal(current.tabs.activeTabId, "a");
    await React.act(async () => close.click());
    await choose("Discard");
    assert.equal(current.tabs.activeTabId, "tab-1");
    assert.equal(document.activeElement, document.getElementById("workflow-tab-tab-1"));
    assert.equal(document.querySelector(".intellij-tab-close"), null);
});

test("creation modality prevents workflow switching and saving beneath the dialog", async () => {
    await openTab("a");
    const SlotModal = (await server.ssrLoadModule("/src/components/CreateSlotModal.jsx")).default;
    const holder = document.createElement("div");
    document.body.append(holder);
    const modalRoot = createRoot(holder);
    try {
        await React.act(async () => modalRoot.render(React.createElement(SlotModal, { isOpen: true, onClose: () => {}, onCreate: () => {} })));
        const original = current.tabs.getTabSnapshot().fingerprint;
        for (const key of ["Tab", "s"]) {
            await React.act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", {
                key, ctrlKey: true, bubbles: true, cancelable: true,
            })));
        }
        assert.equal(current.tabs.activeTabId, "a");
        assert.equal(current.tabs.getTabSnapshot().fingerprint, original);
        assert.equal(calls.some((call) => ["save_file", "serialize_editor_workflow"].includes(call.command)), false);
        await React.act(async () => modalRoot.unmount());
        await React.act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", {
            key: "Tab", ctrlKey: true, bubbles: true, cancelable: true,
        })));
        assert.equal(current.tabs.activeTabId, "tab-1");
    } finally {
        await React.act(async () => modalRoot.unmount());
        holder.remove();
    }
});

test("write failures remain errors with actionable origin-owned feedback and do not advance the saved checkpoint", async (context) => {
    context.mock.method(console, "error", () => {});
    await openTab("a");
    await edit();
    const checkpoint = current.tabs.getTabSnapshot().savedFingerprint;
    native.save = () => { throw "Permission denied writing /a.xml"; };
    const result = await settle(await begin(() => current.documents.handleSaveCurrentTab()));
    assert.equal(result.success, false);
    assert.equal(result.cancelled, undefined);
    assert.equal(result.error, "Permission denied writing /a.xml");
    assert.equal(current.documents.saveStatus, "error");
    assert.equal(current.documents.lastSavedAt, null);
    assert.equal(current.documents.documentNotice.action, "save");
    assert.equal(current.documents.documentNotice.tabId, "a");
    assert.equal(current.documents.documentNotice.canRetry, true);
    assert.equal(current.tabs.getTabSnapshot().savedFingerprint, checkpoint);
    assert.equal(current.tabs.getTabSnapshot().filePath, "/a.xml");
    assert.equal(current.tabs.getTabSnapshot().isModified, true);
    assert.equal(calls.some((call) => call.command === "alert"), false);
});

test("Retry Save and Save As address the failed workflow after switching tabs", async (context) => {
    context.mock.method(console, "error", () => {});
    await openTab("a");
    await edit();
    native.save = () => { throw new Error("Read-only file"); };
    await settle(await begin(() => current.documents.handleSaveCurrentTab()));
    await openTab("b");
    await edit("3");
    native.save = () => ({ success: true, path: "/copy-a.xml", file_name: "copy-a.xml" });
    const retried = await settle(await begin(() => current.documents.handleRetryDocumentAction({ forceSaveAs: true })));
    assert.equal(retried.success, true);
    assert.equal(current.tabs.activeTabId, "b");
    assert.equal(current.tabs.getTabSnapshot("a").filePath, "/copy-a.xml");
    assert.equal(current.tabs.getTabSnapshot("a").isModified, false);
    assert.equal(current.tabs.getTabSnapshot("b").isModified, true);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "3");
    assert.equal(calls.filter((call) => call.command === "save_file").at(-1).args.path, null);
    assert.equal(calls.filter((call) => call.command === "serialize_editor_workflow").at(-1).args.request.nodes[0].id, "a");
    assert.equal(current.documents.documentNotice, null);
});

test("retry refuses a replaced document and dismissing a notice changes no workflow state", async (context) => {
    context.mock.method(console, "error", () => {});
    await openTab("a");
    await edit();
    native.save = () => { throw new Error("Write failed"); };
    await settle(await begin(() => current.documents.handleSaveCurrentTab()));
    await React.act(async () => current.tabs.replaceTabDocument("a", { nodes: [node("replacement")], edges: [] }));
    const writes = calls.filter((call) => call.command === "save_file").length;
    assert.equal(current.documents.documentNotice.canRetry, false);
    assert.equal(await settle(await begin(() => current.documents.handleRetryDocumentAction())), null);
    assert.equal(calls.filter((call) => call.command === "save_file").length, writes);
    const fingerprint = current.tabs.getTabSnapshot().fingerprint;
    await React.act(async () => current.documents.dismissDocumentNotice());
    assert.equal(current.documents.documentNotice, null);
    assert.equal(current.tabs.getTabSnapshot().fingerprint, fingerprint);
});

test("native picker cancellation remains quiet and does not mark a modified workflow saved", async () => {
    await openTab("a");
    await edit();
    native.save = () => ({ success: false, path: "", file_name: "" });
    const saved = await settle(await begin(() => current.documents.handleSaveAsCurrentTab()));
    assert.equal(saved.cancelled, true);
    assert.equal(current.documents.saveStatus, "idle");
    assert.equal(current.documents.documentNotice, null);
    assert.equal(current.tabs.getTabSnapshot().isModified, true);
    native.open = () => null;
    await settle(await begin(() => current.documents.handleOpenDocument()));
    assert.equal(current.documents.isOpening, false);
    assert.equal(current.documents.documentNotice, null);
    assert.equal(calls.some((call) => call.command === "alert"), false);
});

test("Open failure can retry the chosen file on its original tab without reopening the picker", async (context) => {
    context.mock.method(console, "error", () => {});
    await openTab("a");
    native.open = () => "/retry.xml";
    native.inspect = () => { throw "Invalid SCXML in retry.xml"; };
    await settle(await begin(() => current.documents.handleOpenDocument()));
    assert.equal(current.documents.documentNotice.action, "open");
    assert.match(current.documents.documentNotice.message, /Invalid SCXML/);
    assert.equal(current.documents.isOpening, false);
    await openTab("b");
    native.inspect = () => inspection("/retry.xml");
    await settle(await begin(() => current.documents.handleRetryDocumentAction()));
    assert.equal(calls.filter((call) => call.command === "open_file").length, 1);
    assert.equal(current.tabs.getTabSnapshot("a").filePath, "/retry.xml");
    assert.deepEqual(current.tabs.getTabSnapshot("a").nodes, []);
    assert.equal(current.tabs.getTabSnapshot("a").globalDataModel[0].id, "opened");
    assert.equal(current.tabs.activeTabId, "b");
    assert.equal(current.graph.nodes[0].id, "b");
    assert.equal(current.documents.documentNotice, null);
});

test("a successful save in another workflow does not erase an outstanding failure notice", async (context) => {
    context.mock.method(console, "error", () => {});
    await openTab("a");
    native.save = () => { throw new Error("A is read-only"); };
    await settle(await begin(() => current.documents.handleSaveCurrentTab()));
    await openTab("b");
    native.save = () => ({ success: true, path: "/b.xml", file_name: "b.xml" });
    await settle(await begin(() => current.documents.handleSaveCurrentTab()));
    assert.equal(current.documents.documentNotice.tabId, "a");
    assert.equal(current.documents.documentNotice.message, "A is read-only");
});

test("missing native save confirmation is an error rather than cancellation or a clean checkpoint", async (context) => {
    context.mock.method(console, "error", () => {});
    await openTab("a");
    await edit();
    for (const response of [null, {}, { success: true }]) {
        native.save = () => response;
        const result = await settle(await begin(() => current.documents.handleSaveCurrentTab()));
        assert.equal(result.success, false);
        assert.equal(result.cancelled, undefined);
        assert.match(result.error, /backend did not report/);
        assert.equal(current.tabs.getTabSnapshot().isModified, true);
        assert.equal(current.documents.lastSavedAt, null);
        assert.equal(current.documents.documentNotice.canRetry, true);
    }
});
