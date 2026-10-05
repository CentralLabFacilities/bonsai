import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { getOverviewLayoutNodeSize } from "../src/utils/layoutUtils.js";
import {
    GENERATING_SCXML,
    applyGeneratedCode,
    createGeneratedCodeDraft,
    editGeneratedCodeDraft,
} from "../src/components/canvasCodeDraft.js";
import {
    areBehaviorLibraryPropsEqual,
    areSkillLibraryPropsEqual,
} from "../src/components/canvasLibraryProps.js";

test("generated drafts start pending for their exact graph snapshot", () => {
    const graph = { nodes: [], edges: [] };
    const draft = createGeneratedCodeDraft(graph);
    assert.equal(draft.graph, graph);
    assert.equal(draft.code, GENERATING_SCXML);
    assert.equal(draft.edited, false);
});

test("a matching generation updates an untouched draft without mutating it", () => {
    const graph = { nodes: [], edges: [] };
    const pending = createGeneratedCodeDraft(graph);
    const generated = applyGeneratedCode(pending, graph, "<scxml/>");
    assert.equal(generated.code, "<scxml/>");
    assert.equal(generated.graph, graph);
    assert.equal(pending.code, GENERATING_SCXML);
    assert.notEqual(generated, pending);
});

test("out-of-order responses cannot overwrite the current graph", () => {
    const previousGraph = { nodes: [] };
    const currentGraph = { nodes: [] };
    const pending = createGeneratedCodeDraft(currentGraph);
    assert.equal(applyGeneratedCode(pending, previousGraph, "<old/>"), pending);
    const current = applyGeneratedCode(pending, currentGraph, "<current/>");
    assert.equal(applyGeneratedCode(current, previousGraph, "<old/>"), current);
    assert.equal(current.code, "<current/>");
});

test("new snapshot identity rejects old replies even when graph inputs match", () => {
    const nodes = [];
    const oldSnapshot = { nodes };
    const newSnapshot = { nodes };
    const draft = createGeneratedCodeDraft(newSnapshot);
    assert.equal(applyGeneratedCode(draft, oldSnapshot, "<old/>"), draft);
});

for (const code of ["<user-draft/>", "", GENERATING_SCXML]) {
    test(`typing ${JSON.stringify(code)} prevents a pending response from replacing the draft`, () => {
        const graph = { nodes: [] };
        const pending = createGeneratedCodeDraft(graph);
        const edited = editGeneratedCodeDraft(pending, code);
        assert.equal(applyGeneratedCode(edited, graph, "<generated/>"), edited);
        assert.equal(edited.code, code);
        assert.equal(pending.edited, false);
    });
}

test("error fallbacks also respect user edits", () => {
    const graph = { nodes: [] };
    const edited = editGeneratedCodeDraft(createGeneratedCodeDraft(graph), "<draft/>");
    assert.equal(applyGeneratedCode(edited, graph, "<!-- recovery -->"), edited);
});

test("a changed graph starts a new draft without inheriting the old edit guard", () => {
    const oldGraph = { nodes: [] };
    const oldDraft = editGeneratedCodeDraft(createGeneratedCodeDraft(oldGraph), "<draft/>");
    const newGraph = { nodes: [] };
    const newDraft = createGeneratedCodeDraft(newGraph);
    assert.equal(oldDraft.edited, true);
    assert.equal(newDraft.edited, false);
    assert.equal(applyGeneratedCode(newDraft, oldGraph, "<old/>"), newDraft);
    assert.equal(applyGeneratedCode(newDraft, newGraph, "<new/>").code, "<new/>");
});

test("library comparators preserve semantic reference gating", () => {
    const skillProps = { packages: [], filteredSkills: [], searchText: "" };
    const behaviorProps = { directories: [], activeLibraryTab: "behaviors" };
    assert.equal(areSkillLibraryPropsEqual(skillProps, { ...skillProps }), true);
    assert.equal(areBehaviorLibraryPropsEqual(behaviorProps, { ...behaviorProps }), true);
    assert.equal(areSkillLibraryPropsEqual(skillProps, { ...skillProps, packages: [] }), false);
    assert.equal(areBehaviorLibraryPropsEqual(behaviorProps, { ...behaviorProps, directories: [] }), false);
    assert.equal(areSkillLibraryPropsEqual(skillProps, { ...skillProps, isDraggingNode: true }), true);
    assert.equal(areBehaviorLibraryPropsEqual(behaviorProps, { ...behaviorProps, isDraggingNode: true }), true);
});

for (const key of [
    "setSearchText",
    "setActiveFilter",
    "setSelectedPackage",
    "setSelectedSubPackage",
    "fetchSkillData",
    "onLibraryTabChange",
    "onReloadSkills",
    "onAddSkill",
]) {
    test(`skill library notices a changed ${key} callback`, () => {
        const callback = () => {};
        assert.equal(areSkillLibraryPropsEqual({ [key]: callback }, { [key]: callback }), true);
        assert.equal(areSkillLibraryPropsEqual({ [key]: callback }, { [key]: () => {} }), false);
    });
}

for (const key of ["onDirectoriesChange", "onOpenBehavior", "onLibraryTabChange"]) {
    test(`behavior library notices a changed ${key} callback`, () => {
        const callback = () => {};
        assert.equal(areBehaviorLibraryPropsEqual({ [key]: callback }, { [key]: callback }), true);
        assert.equal(areBehaviorLibraryPropsEqual({ [key]: callback }, { [key]: () => {} }), false);
    });
}

test("skill refresh and library-tab changes invalidate memoized output", () => {
    assert.equal(areSkillLibraryPropsEqual({ refreshVersion: 1 }, { refreshVersion: 2 }), false);
    assert.equal(areSkillLibraryPropsEqual({ activeLibraryTab: "skills" }, { activeLibraryTab: "behaviors" }), false);
    assert.equal(areBehaviorLibraryPropsEqual({ activeLibraryTab: "skills" }, { activeLibraryTab: "behaviors" }), false);
    assert.equal(areSkillLibraryPropsEqual({ canAddSkill: true }, { canAddSkill: false }), false);
    for (const [key, before, after] of [
        ["skillLibraryStatus", "ready", "error"], ["skillLibraryError", null, "Unavailable"],
        ["hasLoadedSkills", false, true], ["skillCount", 0, 1],
    ]) assert.equal(areSkillLibraryPropsEqual({ [key]: before }, { [key]: after }), false);
});

test("keyboard controls, creation dialogs, and library insertion preserve editor interactions", async (t) => {
    const window = new Window({ url: "http://localhost/", width: 1440, height: 900 });
    const document = window.document;
    const originals = new Map();
    let server;
    let root;
    let container;
    const launcher = document.createElement("button");
    launcher.textContent = "Launch";
    document.body.append(launcher);
    for (const [name, value] of Object.entries({
        window, document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        HTMLInputElement: window.HTMLInputElement, Event: window.Event,
        ResizeObserver: window.ResizeObserver, MutationObserver: window.MutationObserver,
        getComputedStyle: window.getComputedStyle.bind(window),
        requestAnimationFrame: window.requestAnimationFrame.bind(window),
        cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const element = React.createElement;
    const noop = () => {};
    const deferred = () => {
        let resolve;
        const promise = new Promise((yes) => { resolve = yes; });
        return { promise, resolve };
    };
    const mount = async (component) => {
        if (root) await React.act(async () => root.unmount());
        container?.remove();
        launcher.focus();
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await React.act(async () => root.render(component));
    };
    const key = async (target, value, modifiers = {}) => {
        const event = new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...modifiers });
        await React.act(async () => target.dispatchEvent(event));
        return event;
    };
    const click = async (target) => {
        assert.ok(target, "click target exists");
        await React.act(async () => target.click());
    };
    const buttonByText = (scope, text) => [...scope.querySelectorAll("button")]
        .find((button) => button.textContent.trim() === text);
    const setInput = async (input, value) => React.act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    const setSelect = async (select, value) => React.act(async () => {
        select.value = value;
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    const submit = async (form) => React.act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    const node = (id = "work") => ({ id, type: "custom", position: { x: 20, y: 30 }, data: {
        label: id, fullSkillName: `pkg.${id}`, params: [], inSlots: [], outSlots: [], events: [], onEntry: [], onExit: [],
    } });
    const slotOptions = [{ id: "slot-0", nodeId: "work", nodeLabel: "Work", key: "input", access: "read", slotIndex: 0, type: "String" }];

    try {
        const { createServer } = await import("vite");
        const { default: react } = await import("@vitejs/plugin-react");
        server = await createServer({
            configFile: false, plugins: [react()], appType: "custom",
            server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
            optimizeDeps: { noDiscovery: true, include: [] },
        });
        const modules = await Promise.all([
            "/src/components/DetailsPanel.jsx", "/src/components/CreateSlotModal.jsx",
            "/src/components/CreateSubMachineModal.jsx", "/src/components/EditorOverlays.jsx",
            "/src/components/SkillLibrary.jsx", "/src/hooks/useEditorLibraryDrop.js",
            "/src/hooks/useEditorLibraryItems.js", "/src/hooks/useEditorGraphState.js",
            "/src/hooks/useWorkflowTabs.js", "/src/hooks/useGlobalEditorShortcuts.js",
            "/src/components/EditorChrome.jsx", "/src/components/BehaviorLibrary.jsx",
            "/src/components/ui/index.js", "/src/components/CodeView.jsx",
            "/src/hooks/useContainerCreation.js",
            "/src/hooks/useEditorClipboard.js", "/src/hooks/useEditorFind.js",
            "/src/hooks/useEditorHistory.js", "/src/hooks/useWorkflowDocument.js",
        ].map((path) => server.ssrLoadModule(path)));
        const [details, slots, submachines, overlays, skills, drop, items, graphState, tabState, shortcuts, chrome, behaviors, feedback, codeView, containers, clipboard, find, history, workflowDocument] = modules;

        await t.test("container selection is linear, sibling-scoped, stable on ties and frozen during drag", async () => {
            const a = { ...node("a"), selected: true, parentId: "first" };
            const a2 = { ...node("a2"), selected: true, parentId: "first" };
            const b = { ...node("b"), selected: true, parentId: "second" };
            const b2 = { ...node("b2"), selected: true, parentId: "second" };
            const excluded = [
                { ...node("lane"), selected: true, type: "parallelLane", parentId: "second" },
                { ...node("wrapper"), selected: true, data: { autoParallelLaneCompound: true } },
                node("unselected"),
            ];
            const nodes = [a, b, b2, a2, ...excluded];
            const selected = containers.projectContainerSelection([], nodes, false);
            assert.deepEqual(selected, [a, a2]);
            assert.equal(containers.projectContainerSelection(selected, [...nodes], false), selected);
            assert.equal(containers.projectContainerSelection(selected, [b, b2], true), selected);
            const updated = { ...a, data: { ...a.data, label: "Changed" } };
            assert.deepEqual(containers.projectContainerSelection(selected, [updated, a2], false), [updated, a2]);
            const empty = [];
            assert.equal(containers.projectContainerSelection(empty, excluded, false), empty);
            const root = { ...node("root"), selected: true };
            const child = { ...node("child"), selected: true, parentId: "__root__" };
            assert.deepEqual(containers.projectContainerSelection([], [child, root], false), [child]);
        });

        const setCode = async (value) => React.act(async () => {
            const textarea = container.querySelector("textarea");
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(textarea, value);
            textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
        });
        await t.test("supplied Code View resets committed sources without reviving old drafts", async () => {
            const props = { activeMode: "code", setActiveMode: noop, codeString: "<first/>" };
            await mount(element(codeView.default, props));
            await setCode("");
            await React.act(async () => root.render(element(codeView.default, { ...props, activeMode: "overview" })));
            assert.equal(container.querySelector("textarea").value, "");
            await React.act(async () => root.render(element(codeView.default, { ...props, codeString: "<second/>" })));
            assert.equal(container.querySelector("textarea").value, "<second/>");
            await React.act(async () => root.render(element(codeView.default, props)));
            assert.equal(container.querySelector("textarea").value, "<first/>");
        });

        await t.test("a suspended Code View source change cannot discard the committed user draft", async () => {
            let setSource;
            const pending = new Promise(() => {});
            function Suspend({ source }) {
                if (source === "<pending/>") throw pending;
                return null;
            }
            function Harness() {
                const [source, updateSource] = React.useState("<first/>");
                React.useLayoutEffect(() => { setSource = updateSource; }, []);
                return element(React.Fragment, null,
                    element(codeView.default, { codeString: source, activeMode: "code", setActiveMode: noop }),
                    element(Suspend, { source }));
            }
            await mount(element(React.Suspense, { fallback: element("span", null, "Pending") }, element(Harness)));
            await setCode("<edited/>");
            await React.act(async () => React.startTransition(() => setSource("<pending/>")));
            assert.equal(container.querySelector("textarea").value, "<edited/>");
            await React.act(async () => setSource("<first/>"));
            assert.equal(container.querySelector("textarea").value, "<edited/>");
        });

        await t.test("browser Code View caches fallback generation once per graph snapshot", async () => {
            let reads = 0;
            const measured = { ...node("first"), get data() { reads += 1; return node("first").data; } };
            const props = { nodes: [measured], edges: [], globalDataModel: [], manualSlots: [], activeMode: "code", setActiveMode: noop };
            await mount(element(codeView.default, props));
            assert.ok(reads > 0);
            const next = { ...props, nodes: [measured, node("next")] };
            await React.act(async () => root.render(element(codeView.default, next)));
            const afterGeneration = reads;
            await React.act(async () => root.render(element(codeView.default, { ...next, activeMode: "overview" })));
            assert.equal(reads, afterGeneration);
            await setCode("");
            await React.act(async () => root.render(element(codeView.default, next)));
            assert.equal(container.querySelector("textarea").value, "");
            assert.equal(reads, afterGeneration);
        });

        await t.test("feedback caps committed timers, cancels eviction and preserves replacement and action semantics", async () => {
            const originalSet = window.setTimeout;
            const originalClear = window.clearTimeout;
            const timers = new Map();
            const cleared = [];
            let sequence = 1000000;
            let api;
            let consumerRenders = 0;
            window.setTimeout = (callback, duration) => {
                const id = ++sequence;
                timers.set(id, { callback, duration });
                return id;
            };
            window.clearTimeout = (id) => { cleared.push(id); timers.delete(id); };
            const titles = () => [...document.querySelectorAll(".ui-toast__title")].map((item) => item.textContent);
            function Consumer() {
                consumerRenders += 1;
                const actions = feedback.useFeedback();
                React.useLayoutEffect(() => { api = actions; }, [actions]);
                return element("span", null, "Feedback consumer");
            }
            try {
                await mount(element(React.StrictMode, null, element(feedback.FeedbackProvider, null, element(Consumer))));
                const originalApi = api;
                const renders = consumerRenders;
                await React.act(async () => {
                    for (let index = 0; index < 5; index += 1) api.notify({ id: String(index), title: String(index), message: "Message", duration: 100 });
                });
                assert.deepEqual(titles(), ["1", "2", "3", "4"]);
                assert.equal(timers.size, 4);
                assert.equal(api, originalApi);
                assert.equal(consumerRenders, renders);
                const [oldId, oldTimer] = timers.entries().next().value;
                await React.act(async () => api.notify({ id: "5", title: "5", duration: 100 }));
                assert.deepEqual(titles(), ["2", "3", "4", "5"]);
                assert.ok(cleared.includes(oldId));
                await React.act(async () => oldTimer.callback());
                assert.deepEqual(titles(), ["2", "3", "4", "5"]);
                const [replacedId, replacedTimer] = timers.entries().next().value;
                await React.act(async () => api.notify({ id: "2", title: "Persistent", persistent: true }));
                assert.deepEqual(titles(), ["3", "4", "5", "Persistent"]);
                assert.ok(cleared.includes(replacedId));
                assert.equal(timers.size, 3);
                await React.act(async () => replacedTimer.callback());
                assert.ok(titles().includes("Persistent"));
                const articles = [...document.querySelectorAll(".ui-toast")];
                const beforeTimers = [...timers.keys()];
                await React.act(async () => api.dismiss("not-present"));
                assert.deepEqual([...document.querySelectorAll(".ui-toast")], articles);
                assert.deepEqual([...timers.keys()], beforeTimers);
                let acted = 0;
                await React.act(async () => api.notify({ id: "action", title: "Action", persistent: true,
                    actionLabel: "Retry", onAction: () => { acted += 1; } }));
                await click(document.querySelector(".ui-toast__action"));
                assert.equal(acted, 1);
                assert.equal(titles().includes("Action"), false);
                const persistentToast = [...document.querySelectorAll(".ui-toast")].find((toast) => toast.textContent.includes("Persistent"));
                await click(persistentToast.querySelector('button[aria-label="Dismiss notification"]'));
                assert.equal(titles().includes("Persistent"), false);
                assert.equal(api, originalApi);
                assert.equal(consumerRenders, renders);
                await mount(element("span", null, "Unmounted"));
                assert.equal(timers.size, 0);
                await React.act(async () => api.notify({ id: "late", title: "Late" }));
                assert.equal(timers.size, 0);
                assert.equal(document.querySelector(".ui-toast"), null);
            } finally {
                if (root) await React.act(async () => root.unmount());
                root = null;
                window.setTimeout = originalSet;
                window.clearTimeout = originalClear;
            }
        });

        await t.test("inspector tabs are linked buttons with wrapping arrow, Home and End navigation", async () => {
            let controls;
            function Harness() {
                const [selectedNode, setNode] = React.useState(node());
                const [activeTab, setActiveTab] = React.useState("allgemein");
                React.useLayoutEffect(() => { controls = { setNode, activeTab }; }, [activeTab]);
                return element(details.default, { selectedNode, activeTab, setActiveTab, packages: [],
                    getPackageSkillEvent: () => [], onSetInitial: noop, onUpdateName: noop, availableTargetNodes: [],
                    globalDataModel: [], cloneNodes: [], parallelLanes: [], containerOutgoingTransitions: [], });
            }
            await mount(element(Harness));
            const buttons = () => [...container.querySelectorAll('[role="tab"]')];
            assert.deepEqual(buttons().map((button) => button.textContent), ["Overall", "Parameter", "Slots", "Entry / Exit"]);
            assert.equal(buttons().filter((button) => button.tabIndex === 0).length, 1);
            buttons()[0].focus();
            await key(buttons()[0], "ArrowLeft");
            assert.equal(document.activeElement, buttons().at(-1));
            assert.equal(controls.activeTab, "actions");
            await key(document.activeElement, "Home");
            assert.equal(controls.activeTab, "allgemein");
            await key(document.activeElement, "ArrowRight");
            assert.equal(controls.activeTab, "parameter");
            const panel = container.querySelector('[role="tabpanel"]');
            assert.equal(panel.getAttribute("aria-labelledby"), document.activeElement.id);
            assert.equal(document.activeElement.getAttribute("aria-controls"), panel.id);
            await key(document.activeElement, "End");
            assert.equal(controls.activeTab, "actions");
            await React.act(async () => controls.setNode({ ...node("End"), data: { ...node("End").data, isFinal: true } }));
            assert.equal(buttons().find((button) => button.getAttribute("aria-selected") === "true").textContent, "Overall");
            assert.equal(panel.getAttribute("aria-labelledby"), buttons()[0].id);
        });

        await t.test("slot creation traps focus, retains validation and emits the original slot binding", async () => {
            const created = [];
            function Harness() {
                const [open, setOpen] = React.useState(true);
                return element(slots.default, { isOpen: open, skillSlotOptions: slotOptions, onClose: () => setOpen(false), onCreate: (slot) => created.push(slot) });
            }
            await mount(element(Harness));
            const dialog = document.querySelector("dialog[open]");
            assert.ok(dialog);
            assert.equal(document.activeElement, dialog.querySelector("select"));
            assert.ok(document.getElementById(dialog.getAttribute("aria-labelledby")));
            const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")];
            focusable[0].focus();
            await key(focusable[0], "Tab", { shiftKey: true });
            assert.equal(document.activeElement, focusable.at(-1));
            await key(document.activeElement, "Tab");
            assert.equal(document.activeElement, focusable[0]);
            assert.equal(dialog.querySelector('button[type="submit"]').disabled, true);
            await submit(dialog.querySelector("form"));
            assert.equal(created.length, 0);
            await setSelect(dialog.querySelectorAll("select")[0], "work");
            await setSelect(dialog.querySelectorAll("select")[1], "slot-0");
            await setInput(dialog.querySelector('input[type="text"]'), " /input ");
            await click(dialog.querySelector('input[type="checkbox"]'));
            await submit(dialog.querySelector("form"));
            assert.deepEqual(created, [{ path: "/input", type: "String", isInherited: true, inheritedFrom: "", linkedSkillSlot: { nodeId: "work", access: "read", slotIndex: 0 } }]);
            assert.equal(document.querySelector("dialog[open]"), null);
            assert.equal(document.activeElement, launcher);
        });

        await t.test("empty slot choices focus the path and Escape or backdrop restores the launcher", async () => {
            let cancelled = 0;
            function Harness() {
                const [open, setOpen] = React.useState(true);
                return element(slots.default, { isOpen: open, onCreate: noop, onClose: () => { cancelled += 1; setOpen(false); } });
            }
            await mount(element(Harness));
            assert.equal(document.activeElement, document.querySelector('dialog input[type="text"]'));
            await key(document.activeElement, "Escape");
            assert.equal(document.activeElement, launcher);
            assert.equal(cancelled, 1);
            await mount(element(Harness));
            await click(document.querySelector("dialog[open]"));
            assert.equal(cancelled, 2);
            assert.equal(document.activeElement, launcher);
        });

        await t.test("submachine submission locks duplicate submit and all cancellation until it settles", async () => {
            const pending = deferred();
            const confirmed = [];
            let cancelled = 0;
            function Harness() {
                const [open, setOpen] = React.useState(true);
                return element(submachines.default, { isOpen: open, defaultDirectory: "/behaviors", defaultFileName: "Child",
                    onConfirm: (value) => { confirmed.push(value); return pending.promise; },
                    onCancel: () => { cancelled += 1; setOpen(false); } });
            }
            await mount(element(Harness));
            const dialog = document.querySelector("dialog[open]");
            const name = dialog.querySelectorAll("input")[1];
            assert.equal(document.activeElement, name);
            assert.equal(name.selectionStart, 0);
            assert.equal(name.selectionEnd, name.value.length);
            await submit(dialog.querySelector("form"));
            await submit(dialog.querySelector("form"));
            assert.deepEqual(confirmed, [{ directory: "/behaviors", fileName: "Child.xml" }]);
            assert.equal(dialog.getAttribute("aria-busy"), "true");
            await key(dialog, "Escape");
            await click(dialog);
            await React.act(async () => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })));
            assert.equal(cancelled, 0);
            assert.equal(dialog.open, true);
            await React.act(async () => pending.resolve(false));
            assert.equal(dialog.open, true);
            assert.equal(dialog.getAttribute("aria-busy"), "false");
            await key(name, "Escape");
            assert.equal(cancelled, 1);
            assert.equal(document.activeElement, launcher);
        });

        await t.test("modal creation blocks global editor actions without consuming ordinary form input", async () => {
            const actions = [];
            function Harness() {
                shortcuts.useGlobalEditorShortcuts({ activeMode: "overview", activeTabId: "a", nodes: [], slotNodes: [],
                    setActiveMode: (mode) => actions.push(mode), handleAddNewTab: () => actions.push("new"),
                    handleCloseTab: () => actions.push("close"), fitView: () => actions.push("fit"),
                    setIsFindOpen: noop, clearEditorNodeSelection: noop, clearAllEdgeSelection: noop });
                return element(slots.default, { isOpen: true, onClose: noop, onCreate: noop, skillSlotOptions: slotOptions });
            }
            await mount(element(Harness));
            assert.equal(shortcuts.isEditorModalOpen(), true);
            for (const value of ["n", "w", "1", "2", "3"]) await key(document.activeElement, value, { ctrlKey: true });
            await key(document.activeElement, "ArrowLeft", { altKey: true });
            await key(document.activeElement, "f");
            assert.deepEqual(actions, []);
            await setInput(document.querySelector('dialog input[type="text"]'), "/draft");
            assert.equal(document.querySelector('dialog input[type="text"]').value, "/draft");
        });

        let pasteCurrent;
        let pasteActions;
        let pasteChoices;
        let pasteCancellations;
        function PasteHarness() {
            const graph = graphState.useEditorGraphState();
            const [selectedNodeId, setSelectedNodeId] = React.useState(null);
            const tabs = tabState.useWorkflowTabs({ ...graph, selectedNodeId, setSelectedNodeId, fitView: noop });
            const search = find.useEditorFind({ ...graph, activeMode: "overview", semanticNodes: graph.nodes });
            history.useEditorHistory({ ...graph, activeMode: "overview", activeTabId: tabs.activeTabId,
                setSelectedNodeId, setRightPanelTab: noop, updateNodeInternals: noop,
                syncRustDocument: async () => { pasteActions.push("history"); } });
            const documentActions = workflowDocument.useWorkflowDocument({ ...tabs, isDesktop: false });
            const graphClipboard = clipboard.useEditorClipboard({ ...graph, activeMode: "overview", selectedNodeId,
                setSelectedNodeId, setRightPanelTab: noop, setActiveTab: noop, clearAllEdgeSelection: noop,
                checkSlotConnection: noop, updateNodeInternals: noop, screenToFlowPosition: (position) => position,
                syncPastedEditorSubgraphAfterCommit: () => pasteActions.push("copy"),
                syncStateEditorPositions: () => pasteActions.push("reference") });
            shortcuts.useGlobalEditorShortcuts({ activeMode: "overview", activeTabId: tabs.activeTabId,
                nodes: graph.nodes, slotNodes: graph.slotNodes, contextMenu: {}, isDrawerOpen: true,
                isFindOpen: search.isFindOpen, setIsFindOpen: search.setIsFindOpen,
                setActiveMode: (mode) => pasteActions.push(mode), handleAddNewTab: () => pasteActions.push("new"),
                handleCloseTab: () => pasteActions.push("close"), fitView: () => pasteActions.push("fit"),
                setContextMenu: () => pasteActions.push("context"), setDrawerData: () => pasteActions.push("drawer"),
                clearEditorNodeSelection: () => pasteActions.push("selection"), clearAllEdgeSelection: noop,
                canGoFocusBack: true, canGoFocusForward: true,
                goFocusBack: () => pasteActions.push("back"), goFocusForward: () => pasteActions.push("forward") });
            React.useLayoutEffect(() => { pasteCurrent = { graph, tabs, search, documentActions, clipboard: graphClipboard }; });
            return element(overlays.default, { hint: {}, subMachine: {}, shortcuts: {}, condition: { drawer: {} }, slots: {},
                paste: { pending: graphClipboard.pendingSkillPaste,
                    onResolve: (choice) => { pasteChoices.push(choice); graphClipboard.resolvePendingSkillPaste(choice); },
                    onCancel: () => { pasteCancellations += 1; graphClipboard.cancelPendingSkillPaste(); } } });
        }
        const mountPaste = async () => {
            pasteActions = [];
            pasteChoices = [];
            pasteCancellations = 0;
            await mount(element(feedback.FeedbackProvider, null, element(PasteHarness)));
            await React.act(async () => pasteCurrent.tabs.openTab({ id: "background", title: "Background", nodes: [], edges: [] }, { fit: false }));
            await React.act(async () => pasteCurrent.tabs.switchTab("tab-1"));
            await React.act(async () => pasteCurrent.graph.setNodes([{ ...node(), selected: true }, node("other")]));
        };
        const openPaste = async () => React.act(async () => {
            assert.equal(pasteCurrent.clipboard.captureGraphSelection(), true);
            assert.equal(pasteCurrent.clipboard.requestGraphPaste({ x: 200, y: 200 }), true);
        });

        await t.test("paste enters a native modal on Cancel and wraps focus without stealing modified Tab", async () => {
            await mountPaste();
            await openPaste();
            const dialog = document.querySelector("dialog.skill-paste-choice-overlay[open]");
            assert.ok(dialog);
            assert.equal(dialog.parentElement, document.body);
            assert.ok(dialog.classList.contains("editor-creation-dialog"));
            assert.equal(dialog.getAttribute("aria-modal"), "true");
            assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby")).textContent, "Paste State");
            assert.equal(dialog.querySelector('[role="dialog"]'), null);
            const [reference, copy, cancel] = dialog.querySelectorAll("button");
            assert.equal(document.activeElement, cancel);
            assert.equal(reference.querySelector(".skill-paste-choice-option-title").textContent, "Reference");
            assert.equal(copy.querySelector(".skill-paste-choice-option-title").textContent, "Copy");
            assert.equal((await key(cancel, "Tab")).defaultPrevented, true);
            assert.equal(document.activeElement, reference);
            await key(reference, "Tab", { shiftKey: true });
            assert.equal(document.activeElement, cancel);
            await key(cancel, "Tab", { shiftKey: true });
            assert.equal(document.activeElement, copy);
            const activeTabId = pasteCurrent.tabs.activeTabId;
            const modified = await key(copy, "Tab", { ctrlKey: true });
            assert.equal(modified.defaultPrevented, false);
            assert.equal(document.activeElement, copy);
            assert.equal(pasteCurrent.tabs.activeTabId, activeTabId);
            await click(cancel);
            assert.equal(document.activeElement, launcher);
        });

        await t.test("paste Reference and Copy resolve once through the real clipboard action", async () => {
            for (const [choice, index, action] of [["clone", 0, "reference"], ["copy", 1, "copy"]]) {
                await mountPaste();
                await openPaste();
                const button = document.querySelectorAll("dialog.skill-paste-choice-overlay .skill-paste-choice-option")[index];
                await click(button);
                await click(button);
                assert.deepEqual(pasteChoices, [choice]);
                assert.deepEqual(pasteActions, [action]);
                assert.equal(pasteCurrent.graph.nodes.length, 3);
                const pasted = pasteCurrent.graph.nodes.find((candidate) => candidate.id !== "work" && candidate.id !== "other");
                assert.equal(Boolean(pasted.data.isSkillClone), choice === "clone");
                if (choice === "clone") assert.equal(pasted.data.cloneOfNodeId, "work");
                assert.equal(pasteCurrent.clipboard.pendingSkillPaste, null);
                assert.equal(document.querySelector("dialog.skill-paste-choice-overlay[open]"), null);
                assert.equal(document.activeElement, launcher);
            }
        });

        await t.test("paste blocks editor shortcuts and cancels once without changing the graph or underlying UI", async () => {
            for (const route of ["escape", "backdrop", "native", "button"]) {
                await mountPaste();
                const before = pasteCurrent.graph.getDocumentSnapshot();
                const activeTabId = pasteCurrent.tabs.activeTabId;
                await openPaste();
                const dialog = document.querySelector("dialog.skill-paste-choice-overlay[open]");
                if (route === "escape") {
                    assert.equal(shortcuts.isEditorModalOpen(), true);
                    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
                        for (const value of ["n", "w", "1", "2", "3", "a", "c", "v", "d", "f", "s", "z", "y", "Tab"])
                            await key(document.activeElement, value, modifier);
                        for (const value of ["z", "s", "Tab"]) await key(document.activeElement, value, { ...modifier, shiftKey: true });
                    }
                    await key(document.activeElement, "ArrowLeft", { altKey: true });
                    await key(document.activeElement, "ArrowRight", { altKey: true });
                    await key(document.activeElement, "f");
                    await key(document.activeElement, "f", { shiftKey: true });
                    await click(dialog.querySelector("h3"));
                    assert.equal(pasteCancellations, 0);
                    assert.equal(dialog.open, true);
                    assert.equal((await key(document.activeElement, "Escape")).defaultPrevented, true);
                } else if (route === "native") {
                    const event = new window.Event("cancel", { cancelable: true });
                    await React.act(async () => dialog.dispatchEvent(event));
                    assert.equal(event.defaultPrevented, true);
                } else await click(route === "backdrop" ? dialog : dialog.querySelector(".skill-paste-choice-cancel"));
                assert.equal(pasteCancellations, 1);
                assert.deepEqual(pasteChoices, []);
                assert.deepEqual(pasteActions, []);
                assert.equal(pasteCurrent.graph.getDocumentSnapshot(), before);
                assert.equal(pasteCurrent.tabs.activeTabId, activeTabId);
                assert.equal(pasteCurrent.tabs.tabs.length, 2);
                assert.equal(pasteCurrent.search.isFindOpen, false);
                assert.equal(pasteCurrent.documentActions.documentNotice, null);
                assert.equal(pasteCurrent.documentActions.saveStatus, "idle");
                assert.equal(dialog.open, false);
                assert.equal(document.activeElement, launcher);
                assert.equal(shortcuts.isEditorModalOpen(), false);
            }
            await key(launcher, "n", { ctrlKey: true });
            assert.deepEqual(pasteActions, ["new"]);
        });

        await t.test("paste never restores an opener removed or hidden inside an inactive drawer", async (context) => {
            for (const state of ["disconnected", "hidden", "inert", "aria-hidden"]) {
                await mountPaste();
                const drawer = document.createElement("section");
                const opener = document.createElement("button");
                drawer.append(opener);
                document.body.append(drawer);
                try {
                    opener.focus();
                    await openPaste();
                    assert.equal(document.activeElement.className, "skill-paste-choice-cancel");
                    if (state === "disconnected") opener.remove();
                    else drawer.setAttribute(state, state === "aria-hidden" ? "true" : "");
                    const focus = context.mock.method(opener, "focus");
                    await click(document.querySelector("dialog .skill-paste-choice-cancel"));
                    assert.equal(focus.mock.callCount(), 0, state);
                    assert.notEqual(document.activeElement, opener, state);
                    assert.equal(pasteCancellations, 1);
                } finally {
                    drawer.remove();
                }
            }
        });

        await t.test("the shortcut trigger is available when closed and its lazy reference is keyboard-dismissable", async () => {
            function Harness() {
                const [isOpen, setIsOpen] = React.useState(false);
                return element(overlays.default, { hint: {}, subMachine: {}, paste: {}, shortcuts: { isOpen, setIsOpen }, condition: { drawer: {} }, slots: {} });
            }
            await mount(element(Harness));
            const button = document.querySelector('button[aria-label="Show keyboard shortcuts"]');
            assert.ok(button);
            assert.equal(button.getAttribute("aria-expanded"), "false");
            assert.equal(document.getElementById(button.getAttribute("aria-controls")), null);
            button.focus();
            await click(button);
            await React.act(async () => server.ssrLoadModule("/src/components/EditorShortcutHelp.jsx"));
            const reference = document.getElementById(button.getAttribute("aria-controls"));
            assert.ok(reference);
            assert.equal(button.getAttribute("aria-expanded"), "true");
            reference.focus();
            await key(reference, "Escape");
            assert.equal(button.getAttribute("aria-expanded"), "false");
            assert.equal(document.activeElement, button);
        });

        await t.test("skill Add buttons retain drag payloads, deduplicate pending additions and report completion", async () => {
            const pending = deferred();
            const added = [];
            const props = { searchText: "", activeFilter: "Everything", selectedPackage: null, selectedSubPackage: null,
                packages: [], directSkills: ["pkg.skills.Work"], filteredSkills: [], searchedSkills: [], packageSkills: [],
                fetchSkillData: async () => ({ description: "Work description" }),
                onAddSkill: (skill) => { added.push(skill); return pending.promise; } };
            await mount(element(skills.default, props));
            const row = container.querySelector(".skill-item");
            const button = row.querySelector("button");
            assert.equal(row.getAttribute("draggable"), "true");
            assert.equal(button.getAttribute("draggable"), "false");
            assert.equal(button.getAttribute("aria-label"), "Add pkg.skills.Work to canvas");
            const payloads = [];
            const drag = new window.Event("dragstart", { bubbles: true, cancelable: true });
            Object.defineProperty(drag, "dataTransfer", { value: { setData: (...value) => payloads.push(value), setDragImage: noop } });
            await React.act(async () => row.dispatchEvent(drag));
            assert.deepEqual(payloads, [["skill", "pkg.skills.Work"]]);
            await click(button);
            await click(button);
            assert.deepEqual(added, ["pkg.skills.Work"]);
            assert.equal(button.disabled, true);
            await React.act(async () => pending.resolve(true));
            assert.equal(button.disabled, false);
            assert.match(container.querySelector('[role="status"]').textContent, /Added Work/);
            await React.act(async () => root.render(element(skills.default, { ...props, canAddSkill: false })));
            assert.equal(button.disabled, true);
        });

        await t.test("skill addition failures are announced and leave the Add action available for retry", async () => {
            await mount(element(skills.default, { searchText: "", activeFilter: "Everything", selectedPackage: null,
                selectedSubPackage: null, packages: [], directSkills: ["pkg.skills.Work"],
                onAddSkill: async () => false }));
            const button = container.querySelector(".skill-add-button");
            await click(button);
            assert.match(container.querySelector('[role="alert"]').textContent, /workflow changed/);
            assert.equal(button.disabled, false);
        });

        await t.test("library loading, backend failure, empty and filtered states stay distinct with actionable retry", async () => {
            const retries = [];
            const reset = [];
            const props = { searchText: "", activeFilter: "Everything", selectedPackage: null, selectedSubPackage: null,
                packages: [], directSkills: [], filteredSkills: [], searchedSkills: [], packageSkills: [],
                onReloadSkills: () => retries.push("retry"), setSearchText: (value) => reset.push(["search", value]),
                setActiveFilter: (value) => reset.push(["filter", value]), setSelectedPackage: (value) => reset.push(["package", value]),
                setSelectedSubPackage: (value) => reset.push(["subpackage", value]), skillCount: 0 };
            await mount(element(skills.default, { ...props, skillLibraryStatus: "loading" }));
            assert.match(container.querySelector('[role="status"]').textContent, /Loading skill library/);
            assert.equal(container.querySelector('[role="alert"]'), null);
            await React.act(async () => root.render(element(skills.default, { ...props, skillLibraryStatus: "error", skillLibraryError: "Server returned 502" })));
            assert.match(container.querySelector('[role="alert"]').textContent, /Skill library unavailable/);
            assert.match(container.querySelector('[role="alert"]').textContent, /502/);
            assert.equal(container.textContent.includes("The skill library is empty"), false);
            await click(buttonByText(container, "Retry loading skills"));
            assert.deepEqual(retries, ["retry"]);
            await React.act(async () => root.render(element(skills.default, { ...props, skillLibraryStatus: "error", skillLibraryError: "Server returned 502", isReloadingSkills: true })));
            assert.equal(buttonByText(container, "Retrying...").disabled, true);
            assert.match(container.querySelector('[role="alert"]').textContent, /502/);
            await React.act(async () => root.render(element(skills.default, { ...props, skillLibraryStatus: "ready", hasLoadedSkills: true })));
            assert.match(container.querySelector('[role="status"]').textContent, /skill library is empty/);
            assert.equal(container.querySelector('[role="alert"]'), null);
            await React.act(async () => root.render(element(skills.default, { ...props, searchText: "missing", skillCount: 1, skillLibraryStatus: "ready" })));
            assert.match(container.querySelector('[role="status"]').textContent, /No matching skills/);
            await click(buttonByText(container, "Clear filters"));
            assert.deepEqual(reset, [["search", ""], ["filter", "Everything"], ["package", null], ["subpackage", null]]);
            await React.act(async () => root.render(element(skills.default, { ...props, directSkills: ["pkg.skills.Work"],
                skillCount: 1, skillLibraryStatus: "error", skillLibraryError: "Disconnected", hasLoadedSkills: true })));
            assert.match(container.querySelector('[role="alert"]').textContent, /last successfully loaded skill list/);
            assert.ok(container.querySelector(".skill-item"));
        });

        await t.test("file notices expose source-aware retry and Save As, disable busy actions and explain browser limits", async () => {
            const actions = [];
            const notice = { action: "save", title: "Could not save A", message: "Permission denied", canRetry: true, busy: false };
            const props = { notice, onRetry: () => actions.push("retry"), onSaveAs: () => actions.push("save-as"), onDismiss: () => actions.push("dismiss") };
            await mount(element(chrome.EditorNotice, props));
            assert.match(container.querySelector('[role="alert"]').textContent, /Could not save A.*Permission denied/);
            const buttons = () => [...container.querySelectorAll("button")];
            await click(buttons()[0]);
            await click(buttons()[1]);
            await click(buttons()[2]);
            assert.deepEqual(actions, ["retry", "save-as", "dismiss"]);
            await React.act(async () => root.render(element(chrome.EditorNotice, { ...props, notice: { ...notice, busy: true } })));
            assert.equal(buttons()[0].disabled, true);
            assert.equal(buttons()[1].disabled, true);
            await React.act(async () => root.render(element(chrome.EditorNotice, { ...props, notice: { ...notice, canRetry: false, desktopRequired: true } })));
            assert.equal(buttons().length, 1);
            assert.match(container.textContent, /Use the Bonsai desktop app/);
            assert.equal(container.textContent.includes("closed or replaced"), false);
            await React.act(async () => root.render(element(chrome.EditorNotice, { ...props, notice: { ...notice, canRetry: false } })));
            assert.match(container.textContent, /closed or replaced/);
        });

        const installNative = (context, invoke) => {
            const original = window.__TAURI_INTERNALS__;
            window.__TAURI_INTERNALS__ = { invoke };
            context.after(() => {
                if (original) window.__TAURI_INTERNALS__ = original;
                else delete window.__TAURI_INTERNALS__;
            });
        };
        const fileEntry = { kind: "file", name: "child.xml", path: "/root/child.xml", source: "${ROOT}/child.xml" };
        const rootDirectory = { key: "ROOT", path: "/root", isDefault: false };
        await t.test("behavior listing failures retain cached files, and real empty lists differ from no search matches", async (context) => {
            context.mock.method(console, "error", noop);
            let result = [fileEntry];
            let failure = null;
            installNative(context, async (command) => {
                assert.equal(command, "list_behavior_directory");
                if (failure) throw failure;
                return result;
            });
            await mount(element(behaviors.default, { directories: [rootDirectory], onDirectoriesChange: noop }));
            assert.ok(container.querySelector(".behavior-file-row"));
            failure = "Read permission denied";
            await click(container.querySelector('[title="Refresh"]'));
            assert.match(container.querySelector('[role="alert"]').textContent, /Read permission denied/);
            assert.ok(container.querySelector(".behavior-file-row"));
            assert.match(container.querySelector(".behavior-library-cached").textContent, /cached|last|loaded/i);
            assert.equal(container.textContent.includes("No SCXML files found"), false);
            failure = null;
            await click(container.querySelector('[title="Refresh"]'));
            assert.equal(container.querySelector('[role="alert"]'), null);
            await setInput(container.querySelector(".skill-search"), "missing");
            assert.match(container.textContent, /No .*match/i);
            await setInput(container.querySelector(".skill-search"), "");
            result = [];
            await click(container.querySelector('[title="Refresh"]'));
            assert.match(container.textContent, /No SCXML files found/);
        });

        await t.test("behavior directory picker rejection is visible, cancellation stays quiet and successful retry changes the path", async (context) => {
            context.mock.method(console, "error", noop);
            let selected = null;
            let failure = "Directory picker unavailable";
            const changes = [];
            installNative(context, async (command) => {
                if (command === "list_behavior_directory") return [fileEntry];
                assert.equal(command, "pick_directory");
                if (failure) throw failure;
                return selected;
            });
            await mount(element(behaviors.default, { directories: [rootDirectory], onDirectoriesChange: (value) => changes.push(value) }));
            await click(container.querySelector('[title="Choose directory"]'));
            assert.match(container.querySelector('[role="alert"]').textContent, /Directory picker unavailable/);
            assert.ok(container.querySelector(".behavior-file-row"));
            assert.deepEqual(changes, []);
            failure = null;
            await click(container.querySelector('[title="Choose directory"]'));
            assert.deepEqual(changes, []);
            selected = "/new-root";
            await click(container.querySelector('[title="Choose directory"]'));
            assert.equal(changes[0][0].path, "/new-root");
            assert.equal(container.querySelector('[role="alert"]'), null);
        });

        await t.test("native directory picker failures preserve submachine drafts and are retried inline", async (context) => {
            context.mock.method(console, "error", noop);
            let failure = "Native picker failed";
            installNative(context, async (command) => {
                assert.equal(command, "pick_directory");
                if (failure) throw failure;
                return "/chosen";
            });
            await mount(element(submachines.default, { isOpen: true, defaultDirectory: "/initial", defaultFileName: "Child",
                onCancel: noop, onConfirm: async () => false }));
            const inputs = () => [...document.querySelectorAll("dialog input")];
            await setInput(inputs()[1], "MyDraft");
            await click(document.querySelector(".submachine-create-browse"));
            assert.match(document.querySelector('dialog [role="alert"]').textContent, /Native picker failed/);
            assert.equal(inputs()[0].value, "/initial");
            assert.equal(inputs()[1].value, "MyDraft");
            failure = null;
            await click(document.querySelector(".submachine-create-browse"));
            assert.equal(inputs()[0].value, "/chosen");
            assert.equal(inputs()[1].value, "MyDraft");
            assert.equal(document.querySelector('dialog [role="alert"]'), null);
        });

        await t.test("failed behavior opens report the filename inline and keep the library available for retry", async (context) => {
            context.mock.method(console, "error", noop);
            installNative(context, async () => [fileEntry]);
            let failure = "Malformed SCXML";
            let opened = 0;
            await mount(element(behaviors.default, { directories: [rootDirectory], onDirectoriesChange: noop,
                onOpenBehavior: async () => { if (failure) throw failure; opened += 1; } }));
            const openFile = async () => React.act(async () => container.querySelector(".behavior-file-row").dispatchEvent(
                new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }),
            ));
            await openFile();
            assert.match(container.querySelector('[role="alert"]').textContent, /child.xml.*Malformed SCXML/);
            assert.equal(opened, 0);
            failure = null;
            await openFile();
            assert.equal(opened, 1);
            assert.equal(container.querySelector('[role="alert"]'), null);
        });

        let current;
        let definition;
        let insertionCalls;
        function InsertionHarness() {
            const graph = graphState.useEditorGraphState();
            const tabs = tabState.useWorkflowTabs({ ...graph, selectedNodeId: null, setSelectedNodeId: noop, fitView: noop });
            const [selected, setSelectedNodeId] = React.useState(null);
            const [activeMode, setActiveMode] = React.useState("overview");
            const library = items.useEditorLibraryItems({ skills: { skills: [] }, nodes: graph.nodes,
                fetchSkillData: async (skill) => { insertionCalls.push(["definition", skill]); return definition(); } });
            const insertion = drop.useEditorLibraryDrop({ activeMode, nodes: graph.nodes,
                flowContainerRef: { current: { getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600 }) } },
                getTabSnapshot: tabs.getTabSnapshot, screenToFlowPosition: ({ x, y }) => ({ x: x / 2, y: y / 2 }),
                setParallelDropTargetId: noop, setCompoundDropTargetId: noop, createNode: library.createNode,
                createBehaviorNode: library.createBehaviorNode, checkSlotConnection: noop, getNodes: () => graph.getDocumentSnapshot().nodes,
                setNodes: graph.setNodes, setSelectedNodeId,
                syncInsertedEditorStatesAfterCommit: (id) => insertionCalls.push(["sync", id]),
            });
            React.useLayoutEffect(() => { current = { graph, tabs, insertion, selected, setActiveMode }; }, [graph, tabs, insertion, selected, setActiveMode]);
            return null;
        }
        const mountInsertion = async () => {
            insertionCalls = [];
            definition = () => ({ params: [{ key: "count", type: "Integer", default: "1" }], inSlots: [{ key: "input", type: "String" }], events: [{ event: "done" }] });
            await mount(element(InsertionHarness));
        };
        await t.test("Add inserts at the viewport center with complete skill data and existing synchronization", async () => {
            await mountInsertion();
            let added;
            await React.act(async () => { added = await current.insertion.handleAddLibrarySkill("pkg.skills.Work"); });
            assert.equal(added, true);
            const inserted = current.graph.nodes[0];
            const size = getOverviewLayoutNodeSize(inserted);
            assert.deepEqual(inserted.position, { x: 250 - size.width / 2, y: 175 - size.height / 2 });
            assert.equal(inserted.data.fullSkillName, "Work#1");
            assert.equal(inserted.data.params[0].key, "count");
            assert.equal(inserted.data.inSlots[0].key, "input");
            assert.equal(current.selected, inserted.id);
            assert.deepEqual(insertionCalls, [["definition", "Work"], ["sync", inserted.id]]);
            assert.equal(current.tabs.getTabSnapshot().isModified, true);
        });
        await t.test("Add is explicitly top-level while native drop retains compound parenting", async () => {
            const compound = { id: "container", type: "compound", position: { x: 0, y: 0 }, style: { width: 1000, height: 800 }, data: { label: "Group", events: [] } };
            await mountInsertion();
            await React.act(async () => current.graph.setNodes([compound]));
            await React.act(async () => current.insertion.handleAddLibrarySkill("pkg.skills.Work"));
            assert.equal(current.graph.nodes.find((candidate) => candidate.type === "custom").parentId, undefined);
            await mountInsertion();
            await React.act(async () => current.graph.setNodes([compound]));
            await React.act(async () => current.insertion.handleLibraryDrop({ preventDefault: noop, clientX: 500, clientY: 350,
                dataTransfer: { getData: (key) => key === "skill" ? "pkg.skills.Work" : "" } }));
            assert.equal(current.graph.nodes.find((candidate) => candidate.type === "custom").parentId, "container");
        });
        await t.test("pending additions are abandoned after a workflow switch instead of editing either document", async () => {
            await mountInsertion();
            const pending = deferred();
            definition = () => pending.promise;
            let operation;
            await React.act(async () => { operation = current.insertion.handleAddLibrarySkill("pkg.skills.Work"); });
            await React.act(async () => current.tabs.openTab({ id: "other", title: "Other", nodes: [node("other")], edges: [] }));
            let added;
            await React.act(async () => { pending.resolve({}); added = await operation; });
            assert.equal(added, false);
            assert.deepEqual(current.graph.nodes.map((candidate) => candidate.id), ["other"]);
            assert.deepEqual(current.tabs.getTabSnapshot("tab-1").nodes, []);
            assert.equal(insertionCalls.some(([command]) => command === "sync"), false);
        });
        await t.test("pending insertion rebases live edits and is fenced after replacing the same workflow", async () => {
            await mountInsertion();
            let pending = deferred();
            definition = () => pending.promise;
            let operation;
            await React.act(async () => { operation = current.insertion.handleAddLibrarySkill("pkg.skills.Work"); });
            await React.act(async () => current.graph.setNodes([node("existing")]));
            await React.act(async () => { pending.resolve({}); await operation; });
            assert.equal(current.graph.nodes.some((candidate) => candidate.id === "existing"), true);
            assert.equal(current.graph.nodes.length, 2);
            pending = deferred();
            await React.act(async () => { operation = current.insertion.handleAddLibrarySkill("pkg.skills.Work"); });
            await React.act(async () => current.tabs.replaceTabDocument("tab-1", { nodes: [node("replacement")], edges: [] }));
            let added;
            await React.act(async () => { pending.resolve({}); added = await operation; });
            assert.equal(added, false);
            assert.deepEqual(current.graph.nodes.map((candidate) => candidate.id), ["replacement"]);
        });

        await t.test("Code View prevents new and pending library additions without changing the workflow", async () => {
            await mountInsertion();
            const pending = deferred();
            definition = () => pending.promise;
            let operation;
            await React.act(async () => { operation = current.insertion.handleAddLibrarySkill("pkg.skills.Work"); });
            await React.act(async () => current.setActiveMode("code"));
            let added;
            await React.act(async () => { pending.resolve({}); added = await operation; });
            assert.equal(added, false);
            await React.act(async () => { added = await current.insertion.handleAddLibrarySkill("pkg.skills.Work"); });
            assert.equal(added, false);
            assert.deepEqual(insertionCalls, [["definition", "Work"]]);
            assert.deepEqual(current.graph.nodes, []);
            assert.equal(current.tabs.getTabSnapshot().isModified, false);
        });

        await t.test("unavailable skill definitions do not insert incomplete nodes and native drops report an actionable failure", async (context) => {
            context.mock.method(console, "error", noop);
            await mountInsertion();
            definition = () => null;
            await React.act(async () => assert.rejects(current.insertion.handleAddLibrarySkill("pkg.skills.Work"), /Could not load Work/));
            assert.deepEqual(current.graph.nodes, []);
            let added;
            const event = { preventDefault: noop, clientX: 500, clientY: 350,
                dataTransfer: { getData: (key) => key === "skill" ? "pkg.skills.Work" : "" } };
            await React.act(async () => { added = await current.insertion.handleLibraryDrop(event); });
            assert.equal(added, false);
            assert.match(current.insertion.libraryDropError.message, /Could not load Work/);
            assert.deepEqual(current.graph.nodes, []);
            assert.equal(current.tabs.getTabSnapshot().isModified, false);
            await React.act(async () => current.insertion.dismissLibraryDropError());
            assert.equal(current.insertion.libraryDropError, null);
            definition = () => ({});
            await React.act(async () => { added = await current.insertion.handleLibraryDrop(event); });
            assert.equal(added, true);
            assert.equal(current.graph.nodes.length, 1);
        });

        await t.test("the integrated editor recovers library failures, explains browser file limits and keeps narrow-window keyboard navigation", async (context) => {
            context.mock.method(console, "error", noop);
            originals.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"));
            let apiFailure = true;
            globalThis.fetch = async () => new Response(JSON.stringify({ skills: [] }), { status: apiFailure ? 503 : 200, headers: { "Content-Type": "application/json" } });
            window.HTMLElement.prototype.scrollIntoView = noop;
            const App = (await server.ssrLoadModule("/src/App.jsx")).default;
            await mount(element(App));
            assert.match(container.querySelector('.skill-library [role="alert"]').textContent, /503/);
            apiFailure = false;
            await click(buttonByText(container, "Retry loading skills"));
            assert.equal(container.querySelector('.skill-library [role="alert"]'), null);
            assert.match(container.querySelector(".library-state").textContent, /skill library is empty/);
            const openButton = container.querySelector(".header .menu-button");
            openButton.focus();
            await click(openButton);
            assert.match(container.querySelector('.editor-operation-notice [role="alert"]').textContent, /Use the Bonsai desktop app/);
            assert.equal(container.querySelectorAll(".editor-operation-notice button").length, 1);
            await click(container.querySelector(".editor-notice-dismiss"));
            assert.equal(container.querySelector(".editor-operation-notice"), null);
            assert.equal(document.activeElement, openButton);
            const workflowPanel = document.getElementById("workflow-tab-panel");
            assert.equal(workflowPanel.getAttribute("role"), "tabpanel");
            assert.equal(document.getElementById(workflowPanel.getAttribute("aria-labelledby")).getAttribute("aria-selected"), "true");
            const inspectorTabs = () => [...container.querySelectorAll('.right-panel-tabs [role="tab"]')];
            assert.deepEqual(inspectorTabs().map((button) => button.textContent), ["Data", "Problems"]);
            inspectorTabs()[0].focus();
            await key(document.activeElement, "ArrowRight");
            assert.equal(document.activeElement.textContent, "Problems");
            const inspectorPanel = document.getElementById("inspector-tab-panel");
            assert.equal(inspectorPanel.getAttribute("aria-labelledby"), document.activeElement.id);
            await React.act(async () => {
                window.happyDOM.setWindowSize({ width: 390, height: 844 });
                window.dispatchEvent(new window.Event("resize"));
            });
            const ledge = container.querySelector(".editor-panel-ledge-inspector");
            ledge.focus();
            await click(ledge);
            assert.equal(container.querySelector(".app").getAttribute("data-panel-mode"), "drawers");
            inspectorTabs()[1].focus();
            await key(document.activeElement, "Home");
            assert.equal(inspectorTabs()[0].getAttribute("aria-selected"), "true");
            await key(document.activeElement, "Escape");
            assert.equal(document.activeElement, ledge);
            assert.equal(document.getElementById("editor-inspector-panel").getAttribute("aria-hidden"), "true");
        });
    } finally {
        if (root) await React.act(async () => root.unmount());
        container?.remove();
        launcher.remove();
        await server?.close();
        await window.happyDOM.cancelAsync();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
});
