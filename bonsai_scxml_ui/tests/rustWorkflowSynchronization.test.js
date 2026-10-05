import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

test("real Rust workflow hooks preserve committed snapshots and native queue ownership", { timeout: 60000 }, async (t) => {
    const window = new Window({ url: "http://localhost/" });
    const document = window.document;
    const originals = new Map();
    const frames = new Map();
    let frameId = 0;
    let frameTime = 0;
    let React;
    let server;
    let root;
    let container;
    let current;
    let calls = [];
    let nativeRevision = 0;
    let respond;
    const noop = () => {};
    const node = (id, label = id) => ({ id, type: "custom", position: { x: 20, y: 30 }, data: {
        label, fullSkillName: `pkg.${id}`, params: [], events: [], inSlots: [], outSlots: [], onEntry: [], onExit: [],
    } });
    const deferred = () => {
        let resolve;
        const promise = new Promise((yes) => { resolve = yes; });
        return { promise, resolve };
    };
    const reply = ({ name }) => {
        if (name === "replace_active_editor_workflow_document" || name === "apply_workflow_command")
            return Promise.resolve({ revision: ++nativeRevision, patch: {} });
        assert.equal(name, "validate_active_workflow", "only the real native bridge commands are mocked");
        return Promise.resolve({ revision: nativeRevision, issues: [] });
    };
    window.requestAnimationFrame = (callback) => {
        const id = ++frameId;
        frames.set(id, callback);
        return id;
    };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    window.__TAURI_INTERNALS__ = { invoke: (name, args) => {
        const call = { name, args };
        calls.push(call);
        return respond(call);
    } };
    for (const [name, value] of Object.entries({
        window, document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        Event: window.Event, getComputedStyle: window.getComputedStyle.bind(window),
        requestAnimationFrame: window.requestAnimationFrame,
        cancelAnimationFrame: window.cancelAnimationFrame,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }

    try {
        React = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { createServer } = await import("vite");
        const { default: react } = await import("@vitejs/plugin-react");
        server = await createServer({
            configFile: false, plugins: [react()], appType: "custom",
            server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
            optimizeDeps: { noDiscovery: true, include: [] },
        });
        const [workflowModule, graphModule, containerModule, client, exporter] = await Promise.all([
            "/src/hooks/document/useRustWorkflowDocument.js", "/src/hooks/graph/useEditorGraphState.js",
            "/src/hooks/graph/useContainerCreation.js", "/src/tauri-client.js", "/src/utils/scxmlRustExport.js",
        ].map((path) => server.ssrLoadModule(path)));
        const suspended = new Promise(() => {});
        function Harness() {
            const graph = graphModule.useEditorGraphState();
            const workflow = workflowModule.useRustWorkflowDocument(graph);
            const containers = containerModule.useContainerCreation({ ...graph, isDraggingNode: false,
                setSelectedNodeId: noop, setActiveTab: noop, setContextMenu: noop, updateNodeInternals: noop,
                syncEditorStateAfterCommit: workflow.syncEditorStateAfterCommit,
                syncInsertedEditorStatesAfterCommit: () => assert.fail("lane actions must not use the insertion fallback") });
            React.useLayoutEffect(() => { current = { graph, workflow, containers }; });
            if (graph.nodes.some((candidate) => candidate.id === "suspended")) throw suspended;
            return null;
        }
        const mount = async (initialDocument = { nodes: [node("first")], edges: [], globalDataModel: [], manualSlots: [] }) => {
            if (root) await React.act(async () => root.unmount());
            container?.remove();
            frames.clear();
            calls = [];
            nativeRevision = 0;
            respond = reply;
            container = document.createElement("div");
            document.body.append(container);
            root = createRoot(container);
            await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness))));
            await React.act(async () => current.graph.replaceDocument(initialDocument));
        };
        const prime = async () => {
            await React.act(async () => current.workflow.syncEditorState());
            assert.equal(current.workflow.getRevision(), 1);
            assert.equal(current.workflow.validationRevision, 1);
            calls.length = 0;
        };
        const advanceFrame = async () => {
            assert.ok(frames.size > 0, "a real after-commit hook requested a frame");
            frameTime += 16;
            await React.act(async () => {
                for (const [id, callback] of [...frames]) {
                    frames.delete(id);
                    callback(frameTime);
                }
            });
        };

        await t.test("stable full-sync callbacks read the latest committed snapshot, never a suspended render", async () => {
            await mount();
            const sync = current.workflow.syncEditorStateAfterCommit;
            assert.equal(typeof sync, "function");
            let operation;
            await React.act(async () => {
                operation = sync();
                current.graph.replaceDocument({ nodes: [node("latest")], edges: [],
                    globalDataModel: [{ id: "mode", expr: "2" }],
                    manualSlots: [{ key: "input", path: "/input" }] });
            });
            assert.equal(calls.length, 0);
            await advanceFrame();
            assert.equal((await operation).revision, 1);
            assert.equal(calls[0].name, "replace_active_editor_workflow_document");
            assert.equal(calls[0].args.expectedRevision, null);
            assert.deepEqual(calls[0].args.request, exporter.buildRustEditorExportRequest(current.graph.getDocumentSnapshot()));
            assert.deepEqual(calls[0].args.request.nodes.map((candidate) => candidate.id), ["latest"]);
            assert.deepEqual(calls[0].args.request.dataModel, [{ id: "mode", expression: "2" }]);
            assert.equal(calls[0].args.request.extraSlotDeclarations[0].xpath, "/input");
            assert.equal(current.workflow.getRevision(), 1);
            assert.equal(current.workflow.validationRevision, 1);
            assert.equal(current.workflow.syncEditorStateAfterCommit, sync);

            await React.act(async () => React.startTransition(() => current.graph.setNodes([node("suspended")])));
            await React.act(async () => { operation = sync(); });
            await advanceFrame();
            assert.equal((await operation).revision, 2);
            assert.deepEqual(calls[1].args.request.nodes.map((candidate) => candidate.id), ["latest"]);
            assert.equal(calls[1].args.expectedRevision, 1);
            await React.act(async () => current.graph.setNodes([node("settled")]));
            assert.equal(current.workflow.syncEditorStateAfterCommit, sync);
            assert.equal(frames.size, 0);
        });

        await t.test("adjacent full snapshots coalesce to one native replacement and one validation bump", async () => {
            await mount();
            await prime();
            const operations = [];
            await React.act(async () => {
                for (let index = 0; index < 3; index += 1) operations.push(current.workflow.syncEditorStateAfterCommit());
                current.graph.setNodes([node("coalesced")]);
            });
            assert.equal(frames.size, 1);
            assert.equal(calls.length, 0);
            await advanceFrame();
            const results = await Promise.all(operations);
            assert.deepEqual(results.slice(0, 2), [null, null]);
            assert.equal(results[2].revision, 2);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].args.expectedRevision, 1);
            assert.equal(calls[0].args.request.nodes[0].id, "coalesced");
            assert.equal(current.workflow.validationRevision, 2);
        });

        await t.test("a newer adjacent snapshot supersedes a full sync already waiting for RAF", async () => {
            await mount();
            await prime();
            let first;
            const later = [];
            await React.act(async () => { first = current.workflow.syncEditorStateAfterCommit(); });
            assert.equal(frames.size, 1);
            await React.act(async () => {
                current.graph.setNodes([node("newest")]);
                later.push(current.workflow.syncEditorStateAfterCommit(), current.workflow.syncEditorStateAfterCommit());
            });
            await advanceFrame();
            assert.equal(await first, null);
            assert.equal(calls.length, 0);
            assert.equal(frames.size, 1);
            await advanceFrame();
            const results = await Promise.all(later);
            assert.equal(results[0], null);
            assert.equal(results[1].revision, 2);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].args.request.nodes[0].id, "newest");
            assert.equal(calls[0].args.expectedRevision, 1);
            assert.equal(current.workflow.validationRevision, 2);
        });

        await t.test("structural commands keep both prerequisite and following full snapshots in revision order", async () => {
            await mount();
            await prime();
            const operations = [];
            await React.act(async () => {
                operations.push(current.workflow.syncEditorStateAfterCommit());
                operations.push(current.workflow.applyWorkflowCommand({ type: "setRootInitial", stateId: "first" }));
                operations.push(current.workflow.syncEditorStateAfterCommit());
            });
            await advanceFrame();
            assert.deepEqual(calls.map(({ name, args }) => [name, args.expectedRevision]), [
                ["replace_active_editor_workflow_document", 1], ["apply_workflow_command", 2],
            ]);
            assert.equal(calls[1].args.command.type, "setRootInitial");
            assert.equal(frames.size, 1);
            await advanceFrame();
            assert.deepEqual((await Promise.all(operations)).map((result) => result.revision), [2, 3, 4]);
            assert.equal(calls[2].name, "replace_active_editor_workflow_document");
            assert.equal(calls[2].args.expectedRevision, 3);
            assert.equal(current.workflow.getRevision(), 4);
            assert.equal(current.workflow.validationRevision, 4);
        });

        await t.test("read barriers break a snapshot batch without letting a slow native read block later edits", async () => {
            await mount();
            await prime();
            const pendingRead = deferred();
            respond = (call) => call.name === "validate_active_workflow" ? pendingRead.promise : reply(call);
            let before;
            let read;
            let after;
            await React.act(async () => {
                before = current.workflow.syncEditorStateAfterCommit();
                read = current.workflow.runReadQuery("validation", () => client.validateActiveWorkflow({}));
                after = current.workflow.syncEditorStateAfterCommit();
            });
            await advanceFrame();
            assert.equal((await before).revision, 2);
            assert.deepEqual(calls.map(({ name }) => name), ["replace_active_editor_workflow_document", "validate_active_workflow"]);
            assert.equal(frames.size, 1);
            await advanceFrame();
            assert.equal((await after).revision, 3);
            assert.equal(calls[2].args.expectedRevision, 2);
            assert.equal(current.workflow.getRevision(), 3);
            await React.act(async () => pendingRead.resolve({ revision: 2, issues: [] }));
            assert.deepEqual(await read, { revision: 2, issues: [] });
            assert.equal(current.workflow.validationRevision, 3);

            const staleRead = deferred();
            respond = () => staleRead.promise;
            await React.act(async () => { read = current.workflow.runReadQuery("validation", () => client.validateActiveWorkflow({})); });
            current.workflow.invalidate();
            await React.act(async () => staleRead.resolve({ revision: 900, issues: ["stale"] }));
            assert.equal(await read, null);
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 3);
        });

        await t.test("document replacement fences queued snapshots and reads before any old IPC or publication", async () => {
            await mount();
            const oldReply = deferred();
            const newReply = deferred();
            respond = ({ args }) => args.request.nodes[0].id === "first" ? oldReply.promise : newReply.promise;
            let inFlight;
            let queued;
            let read;
            let replacement;
            await React.act(async () => { inFlight = current.workflow.syncEditorState(); });
            await React.act(async () => {
                queued = current.workflow.syncEditorStateAfterCommit();
                read = current.workflow.runReadQuery("validation", () => client.validateActiveWorkflow({}));
                current.graph.setNodes([node("other")]);
                replacement = current.workflow.syncEditorState({ nodes: [node("other")], edges: [], globalDataModel: [], manualSlots: [] });
            });
            await React.act(async () => oldReply.resolve({ revision: 900 }));
            assert.equal(await inFlight, null);
            assert.equal(await queued, null);
            assert.equal(await read, null);
            assert.equal(frames.size, 0);
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 0);
            assert.equal(calls.length, 2);
            assert.deepEqual(calls.map(({ args }) => args.request.nodes[0].id), ["first", "other"]);
            assert.equal(calls[1].args.expectedRevision, null);
            await React.act(async () => newReply.resolve({ revision: 20 }));
            assert.equal((await replacement).revision, 20);
            assert.equal(current.workflow.getRevision(), 20);
            assert.equal(current.workflow.validationRevision, 1);
        });

        await t.test("invalidate discards a snapshot during its commit wait and leaves native readiness cold", async () => {
            await mount();
            await prime();
            let obsolete;
            await React.act(async () => { obsolete = current.workflow.syncEditorStateAfterCommit(); });
            current.workflow.invalidate();
            await React.act(async () => current.graph.setNodes([node("other")]));
            await advanceFrame();
            assert.equal(await obsolete, null);
            assert.equal(calls.length, 0);
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 1);
            await React.act(async () => current.workflow.applyWorkflowCommand({ type: "setRootInitial", stateId: "other" }));
            assert.deepEqual(calls.map(({ name, args }) => [name, args.expectedRevision]), [
                ["replace_active_editor_workflow_document", null], ["apply_workflow_command", 2],
            ]);
            assert.equal(calls[0].args.request.nodes[0].id, "other");
            assert.equal(current.workflow.getRevision(), 3);
            assert.equal(current.workflow.validationRevision, 3);
        });

        await t.test("an in-flight full snapshot cannot restore invalidated readiness, revision or validation", async () => {
            await mount();
            await prime();
            const obsoleteReply = deferred();
            const initializationReply = deferred();
            respond = () => obsoleteReply.promise;
            let obsolete;
            let command;
            await React.act(async () => { obsolete = current.workflow.syncEditorStateAfterCommit(); });
            await advanceFrame();
            current.workflow.invalidate();
            await React.act(async () => {
                current.graph.setNodes([node("other")]);
                command = current.workflow.applyWorkflowCommand({ type: "setRootInitial", stateId: "other" });
            });
            respond = (call) => call.name === "replace_active_editor_workflow_document" ? initializationReply.promise : reply(call);
            await React.act(async () => obsoleteReply.resolve({ revision: 900 }));
            assert.equal(await obsolete, null);
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 1);
            assert.equal(calls.length, 2, "the command must reinitialize instead of accepting stale readiness");
            assert.equal(calls[1].name, "replace_active_editor_workflow_document");
            assert.equal(calls[1].args.expectedRevision, null);
            assert.equal(calls[1].args.request.nodes[0].id, "other");
            nativeRevision = 20;
            await React.act(async () => initializationReply.resolve({ revision: 20 }));
            assert.ok(await command);
            assert.equal(calls[2].args.expectedRevision, 20);
            assert.equal(current.workflow.getRevision(), 21);
            assert.equal(current.workflow.validationRevision, 3);
        });

        await t.test("a native full-sync rejection remains visible and does not poison the mutation queue", async () => {
            await mount();
            const failure = new Error("Native replacement failed");
            respond = () => Promise.reject(failure);
            let failed;
            await React.act(async () => { failed = current.workflow.syncEditorStateAfterCommit(); });
            const rejected = assert.rejects(failed, (error) => error === failure);
            await advanceFrame();
            await rejected;
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 0);
            respond = reply;
            let recovered;
            await React.act(async () => { recovered = current.workflow.syncEditorStateAfterCommit(); });
            await advanceFrame();
            assert.equal((await recovered).revision, 1);
            assert.equal(calls[1].args.expectedRevision, null);
            await React.act(async () => current.workflow.applyWorkflowCommand({ type: "setRootInitial", stateId: "first" }));
            assert.equal(calls[2].name, "apply_workflow_command");
            assert.equal(calls[2].args.expectedRevision, 1);
            assert.equal(current.workflow.getRevision(), 2);
            assert.equal(current.workflow.validationRevision, 2);
        });

        await t.test("actual lane add, rename, reorder and delete handlers use full sync rather than insertion", async () => {
            const parallel = { id: "parallel", type: "parallel", position: { x: 0, y: 0 },
                style: { width: 420, height: 400 }, data: { label: "Parallel", lanes: ["Lane_1", "Lane_2"], events: [] } };
            const lane = (id, label, y) => ({ id, type: "parallelLane", parentId: "parallel", position: { x: 0, y },
                style: { width: 420, height: 140 }, data: { label, events: [] } });
            await mount({ nodes: [parallel, lane("left", "Lane_1", 40), { ...node("child"), parentId: "left" },
                lane("right", "Lane_2", 180), { ...node("other"), parentId: "right" }],
                edges: [{ id: "exit", source: "child", target: "other", sourceHandle: "success" }], globalDataModel: [], manualSlots: [] });
            await prime();
            const sync = current.workflow.syncEditorStateAfterCommit;
            for (const action of [
                () => current.containers.handleAddLaneToParallel("parallel"),
                () => current.containers.handleRenameParallelLane("parallel", "left", "Renamed"),
                () => current.containers.handleMoveParallelLane("parallel", "left", "down"),
                () => current.containers.handleDeleteParallelLane("parallel", "left"),
            ]) {
                await React.act(async () => action());
                const snapshot = current.graph.getDocumentSnapshot();
                await advanceFrame();
                const call = calls.at(-1);
                assert.equal(call.name, "replace_active_editor_workflow_document");
                assert.deepEqual(call.args.request, exporter.buildRustEditorExportRequest(snapshot));
                assert.equal(current.workflow.syncEditorStateAfterCommit, sync);
            }
            assert.equal(calls.length, 4);
            assert.deepEqual(calls.map(({ args }) => args.expectedRevision), [1, 2, 3, 4]);
            assert.equal(current.graph.nodes.filter((candidate) => candidate.type === "parallelLane").length, 2);
            assert.equal(current.graph.nodes.some((candidate) => candidate.id === "left" || candidate.id === "child"), false);
            assert.deepEqual(current.graph.edges, []);
            assert.equal(current.workflow.getRevision(), 5);
            assert.equal(current.workflow.validationRevision, 5);
            assert.equal(frames.size, 0);
        });

        await t.test("queued configuration work and an old structural response cannot touch a switched document", async () => {
            await mount();
            await prime();
            const obsoleteReply = deferred();
            respond = () => obsoleteReply.promise;
            let command;
            let configuration;
            await React.act(async () => { command = current.workflow.applyWorkflowCommand({ type: "renameState", stateId: "first", name: "Obsolete" }); });
            await React.act(async () => {
                configuration = current.workflow.syncStateConfigurationAfterCommit("first");
                current.workflow.invalidate();
                current.graph.setNodes([node("first", "New document")]);
            });
            await React.act(async () => obsoleteReply.resolve({ revision: 900, patch: { states: [{ id: "first", label: "Obsolete" }] } }));
            assert.equal(await command, null);
            assert.equal(await configuration, null);
            assert.equal(calls.length, 1);
            assert.equal(frames.size, 0);
            assert.equal(current.graph.nodes[0].data.label, "New document");
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 1);
        });

        await t.test("configuration commit waits are fenced after both invalidate and document replacement", async () => {
            for (const boundary of ["invalidate", "replacement"]) {
                await mount();
                await prime();
                let configuration;
                let replacement;
                await React.act(async () => { configuration = current.workflow.syncStateConfigurationAfterCommit("first"); });
                assert.equal(frames.size, 1);
                await React.act(async () => {
                    current.graph.setNodes([node("first", "New document")]);
                    if (boundary === "invalidate") current.workflow.invalidate();
                    else replacement = current.workflow.syncEditorState({ nodes: [node("first", "New document")], edges: [], globalDataModel: [], manualSlots: [] });
                });
                await advanceFrame();
                assert.equal(await configuration, null);
                assert.equal(calls.some(({ name }) => name === "apply_workflow_command"), false);
                if (replacement) {
                    assert.equal((await replacement).revision, 2);
                    assert.equal(calls.length, 1);
                    assert.equal(calls[0].args.request.nodes[0].label, "New document");
                    assert.equal(current.workflow.getRevision(), 2);
                    assert.equal(current.workflow.validationRevision, 2);
                } else {
                    assert.equal(calls.length, 0);
                    assert.equal(current.workflow.getRevision(), null);
                    assert.equal(current.workflow.validationRevision, 1);
                }
            }
        });

        await t.test("in-flight configuration responses neither publish nor continue to the next slot command after invalidate", async () => {
            await mount();
            await prime();
            const obsoleteReply = deferred();
            respond = () => obsoleteReply.promise;
            let configuration;
            await React.act(async () => { configuration = current.workflow.syncStateConfigurationAfterCommit("first"); });
            await advanceFrame();
            assert.equal(calls.length, 1);
            assert.equal(calls[0].args.command.type, "replaceStateParameters");
            current.workflow.invalidate();
            await React.act(async () => current.graph.setNodes([node("first", "New document")]));
            await React.act(async () => obsoleteReply.resolve({ revision: 900, patch: { dataModel: [{ id: "obsolete", expression: "1" }] } }));
            assert.equal(await configuration, null);
            assert.equal(calls.length, 1, "the obsolete configuration must not send replaceSlotsSnapshot");
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 1);
            assert.deepEqual(current.graph.globalDataModel, []);
            respond = reply;
            let active;
            await React.act(async () => { active = current.workflow.syncEditorStateAfterCommit(); });
            await advanceFrame();
            assert.equal((await active).revision, 2);
            assert.equal(calls[1].args.expectedRevision, null);
            assert.equal(calls[1].args.request.nodes[0].label, "New document");
            assert.equal(current.workflow.validationRevision, 2);
        });

        await t.test("configuration invalidated during cold initialization cannot send its following semantic commands", async () => {
            await mount();
            const obsoleteReply = deferred();
            respond = () => obsoleteReply.promise;
            let configuration;
            await React.act(async () => { configuration = current.workflow.syncStateConfigurationAfterCommit("first"); });
            await advanceFrame();
            assert.equal(calls.length, 1);
            assert.equal(calls[0].name, "replace_active_editor_workflow_document");
            current.workflow.invalidate();
            await React.act(async () => current.graph.setNodes([node("first", "New document")]));
            await React.act(async () => obsoleteReply.resolve({ revision: 900 }));
            assert.equal(await configuration, null);
            assert.equal(calls.length, 1);
            assert.equal(current.workflow.getRevision(), null);
            assert.equal(current.workflow.validationRevision, 0);
            assert.equal(frames.size, 0);
        });
    } finally {
        if (root) await React.act(async () => root.unmount());
        container?.remove();
        frames.clear();
        delete window.__TAURI_INTERNALS__;
        await server?.close();
        await window.happyDOM.cancelAsync();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
});
