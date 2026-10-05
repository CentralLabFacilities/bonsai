import test from "node:test";
import assert from "node:assert/strict";
import {
    areDetailsPanelPropsEqual,
    createDetailsTargetIndex,
    getAvailableActionLocations,
    getEditableExitTokens,
    getExitTokenType,
    getMatchingTargetNodeOptions,
    getSemanticTargetNodeIds,
    getSkillPackageName,
} from "../src/components/detailsPanel/selectors.js";

const node = (id, data = {}) => ({ id, data });

test("skill package names retain the skills marker and instance suffix semantics", () => {
    for (const [input, expected] of [
        ["org.bonsai.skills.navigation.Walk#one", "navigation"],
        ["org.bonsai.skills.Walk", ""],
        ["navigation.Walk#one", "navigation"],
        ["a..b.Walk", "a.b"],
        ["Walk", ""], ["", ""], [null, ""],
    ]) {
        assert.equal(getSkillPackageName(input), expected);
    }
});

test("target options preserve input order and the full public display shape", () => {
    const nodes = [
        node("walk", { fullSkillName: "org.bonsai.skills.navigation.Walk#one", label: "Walk" }),
        node("nop", { fullSkillName: "org.bonsai.skills.Nop", editorInstanceId: " 42 " }),
        node("ref", { fullSkillName: "p.Walk#one", label: "Walk", isSkillClone: true, editorInstanceId: " ref-1 " }),
        node("state-ref", { label: "Branch", isStateClone: true }),
        node("bare"),
    ];
    const { options } = createDetailsTargetIndex(nodes, [], "source");
    assert.deepEqual(options, [
        { id: "walk", displayName: "Walk#one", skillName: "Walk", stateName: "one", fullSkillName: "org.bonsai.skills.navigation.Walk#one", editorInstanceId: "", isReference: false, referenceId: "", packageName: "navigation" },
        { id: "nop", displayName: "Nop#42", skillName: "Nop", stateName: "#42", fullSkillName: "org.bonsai.skills.Nop", editorInstanceId: "42", isReference: false, referenceId: "", packageName: "" },
        { id: "ref", displayName: "Walk [ref-1]", skillName: "Walk", stateName: "one", fullSkillName: "p.Walk#one", editorInstanceId: "ref-1", isReference: true, referenceId: "ref-1", packageName: "p" },
        { id: "state-ref", displayName: "Branch [state-ref]", skillName: "Branch", stateName: "", fullSkillName: "", editorInstanceId: "", isReference: true, referenceId: "state-ref", packageName: "" },
        { id: "bare", displayName: "bare", skillName: "bare", stateName: "", fullSkillName: "", editorInstanceId: "", isReference: false, referenceId: "", packageName: "" },
    ]);
});

test("target naming preserves suffix fallback rather than normalizing instance names", () => {
    const { options } = createDetailsTargetIndex([
        node("same", { fullSkillName: "p.Walk#Walk" }),
        node("hash", { fullSkillName: "p.Walk##two" }),
        node("named", { fullSkillName: "p.Walk#old", editorInstanceId: "new", label: "Label" }),
        node("fallback", { fullSkillName: "#Named" }),
    ], [], "source");
    assert.deepEqual(options.map(({ displayName }) => displayName), ["Walk", "Walk#two", "Label#new", "fallback#Named"]);
});

test("semantic alias lookup preserves the earliest option across alias types", () => {
    const index = createDetailsTargetIndex([
        node("early", { fullSkillName: "same", label: "visible" }),
        node("same", { label: "other" }),
        node("visible", { label: "last" }),
    ], [], "source");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success", target: "same" }, index), ["early"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success", target: "visible" }, index), ["early"]);
    assert.equal(index.byId.get("same"), index.options[1]);
    assert.equal(index.byExactQuery.get("same"), index.options[0]);
});

test("duplicate IDs and case-insensitive exact search use first-wins option precedence", () => {
    const index = createDetailsTargetIndex([
        node("duplicate", { label: "One", fullSkillName: "match.Skill" }),
        node("duplicate", { label: "MATCH" }),
        node("third", { label: "one" }),
    ], [], "source");
    assert.equal(index.byId.get("duplicate"), index.options[0]);
    assert.equal(index.byExactQuery.get("one"), index.options[0]);
    // The earlier package-name match outranks the later skill-name match.
    assert.equal(index.byExactQuery.get("match"), index.options[0]);
});

test("semantic targets keep the declared target first, dedupe, and retain transition order", () => {
    const transitions = [
        { sourceNodeId: "other", eventId: "success", targetNodeId: "ignored" },
        { sourceNodeId: "source", eventId: "error", targetNodeId: "wrong-event" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "b" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "a" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "b" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "c" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "" },
        null,
    ];
    const index = createDetailsTargetIndex([node("a", { fullSkillName: "p.A", label: "A" })], transitions, "source");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success", target: "p.A" }, index), ["a", "b", "c"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success" }, index), ["b", "a", "c"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: "error" }, index), ["wrong-event"]);
});

test("semantic aliases are case-sensitive and unknown declared targets remain visible", () => {
    const index = createDetailsTargetIndex([node("a", { label: "Alpha" })], [], "source");
    assert.deepEqual(getSemanticTargetNodeIds({ target: "Alpha" }, index), ["a"]);
    assert.deepEqual(getSemanticTargetNodeIds({ target: "alpha" }, index), ["alpha"]);
    assert.deepEqual(getSemanticTargetNodeIds({ target: " Alpha " }, index), [" Alpha "]);
    assert.deepEqual(getSemanticTargetNodeIds({ target: "missing" }, index), ["missing"]);
    assert.deepEqual(getSemanticTargetNodeIds(null, index), []);
});

test("transition grouping preserves event coercion and strict target ID equality", () => {
    const index = createDetailsTargetIndex([], [
        { sourceNodeId: "source", eventId: 12, targetNodeId: 1 },
        { sourceNodeId: "source", eventId: "12", targetNodeId: "1" },
        { sourceNodeId: "source", eventId: 0, targetNodeId: "zero" },
        { sourceNodeId: "source", targetNodeId: "empty" },
        { sourceNodeId: "source", eventId: "", targetNodeId: null },
    ], "source");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "12" }, index), [1, "1"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: 0 }, index), ["zero", "empty"]);
    assert.deepEqual(getSemanticTargetNodeIds({}, index), ["zero", "empty"]);
});

test("target filtering searches every existing field with case-insensitive substrings", () => {
    const index = createDetailsTargetIndex([
        node("target-id", { fullSkillName: "org.skills.navigation.Walk#instance", label: "Visible" }),
        node("ref", { label: "Ref", editorInstanceId: "reference-id", isStateClone: true }),
    ], [], "source");
    for (const query of ["visible", "INSTANCE", "walk", "NAVIGATION", "target-id", "org.skills"]) {
        assert.deepEqual(getMatchingTargetNodeOptions(` ${query} `, index), [index.options[0]]);
    }
    assert.deepEqual(getMatchingTargetNodeOptions("reference-id", index), [index.options[1]]);
    assert.deepEqual(getMatchingTargetNodeOptions("not-found", index), []);
});

test("target dropdowns are unbounded and unsorted, including empty-query results", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`id-${i}`, { label: `Match${12 - i}` }));
    const index = createDetailsTargetIndex(nodes, [], "source");
    assert.equal(getMatchingTargetNodeOptions("  ", index), index.options);
    assert.deepEqual(getMatchingTargetNodeOptions("match", index), index.options);
    assert.equal(getMatchingTargetNodeOptions("match", index).length, 12);
});

test("index construction and target selection do not mutate caller inputs or shared target lists", () => {
    const nodes = Object.freeze([Object.freeze(node("a", Object.freeze({ label: "A" })))]);
    const transitions = Object.freeze([Object.freeze({ sourceNodeId: "source", eventId: "success", targetNodeId: "a" })]);
    const index = createDetailsTargetIndex(nodes, transitions, "source");
    const result = getSemanticTargetNodeIds({ id: "success" }, index);
    result.push("extra");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success" }, index), ["a"]);
    assert.deepEqual(nodes, [node("a", { label: "A" })]);
});

test("writable locations keep datamodel precedence and then parameter order", () => {
    const first = { id: "shared", expr: "1", source: "Data" };
    const data = [first, { id: "shared", expr: "2" }, { id: "data", expr: "3" }];
    const parameters = [
        { key: "shared", expr: "4" },
        { key: "param", expr: "5", id: "old", source: "old" },
        { key: "param", expr: "6" },
        { key: "last" },
    ];
    const result = getAvailableActionLocations(data, parameters, false);
    assert.deepEqual(result, [first, data[2], { key: "param", expr: "5", id: "param", source: "Parameter" }, { key: "last", id: "last", source: "Parameter" }]);
    assert.equal(result[0], first);
    assert.equal(parameters[1].id, "old");
});

test("location dedupe preserves exact ID semantics and the existing reserved-ID scope", () => {
    const result = getAvailableActionLocations([
        null, {}, { id: "" }, { id: "#_STATE_PREFIX" }, { id: " #_STATE_PREFIX " },
        { id: "name" }, { id: "Name" }, { id: " name " }, { id: 1 }, { id: "1" },
    ], [{ key: "#_STATE_PREFIX" }, { key: "" }], false);
    assert.deepEqual(result.map(({ id }) => id), ["name", "Name", " name ", 1, "1", "#_STATE_PREFIX"]);
});

test("sub-machine writable locations contain only supplied child datamodel entries", () => {
    const childData = [{ id: "child", expr: "1" }, { id: "#_STATE_PREFIX" }];
    assert.deepEqual(getAvailableActionLocations(childData, [{ key: "parameter" }], true), [childData[0]]);
    assert.deepEqual(getAvailableActionLocations(null, null, false), []);
    const index = createDetailsTargetIndex(null, null, "source");
    assert.deepEqual(index.options, []);
    assert.deepEqual(getSemanticTargetNodeIds({}, index), []);
});

test("inspector memoization detects changed, added and removed callbacks", () => {
    const selectedNode = node("selected");
    const onUpdateName = () => {};
    const previous = { selectedNode, onUpdateName };
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous }), true);
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, onUpdateName: () => {} }), false);
    assert.equal(areDetailsPanelPropsEqual(previous, { selectedNode }), false);
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, onNavigateClone: () => {} }), false);
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, selectedNode: node("other") }), false);
});

test("inspector memoization ignores only the unused package inputs", () => {
    const previous = { selectedNode: node("selected"), packages: [], getPackageSkillEvent: () => [] };
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, packages: ["new"], getPackageSkillEvent: () => [] }), true);
    for (const key of ["setActiveTab", "onUpdateNameCommit", "onSetEventTarget", "onRenameParallelLane", "onUpdateInSlotPath", "onUpdateSendEvents"]) {
        assert.equal(areDetailsPanelPropsEqual({ ...previous, [key]: () => {} }, previous), false);
        assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, [key]: () => {} }), false);
    }
});

test("exit selectors retain stable event identity, priority and the exact implicit fatal rule", () => {
    const events = Object.freeze([
        Object.freeze({ id: "custom" }), Object.freeze({ id: "fatal.details" }),
        Object.freeze({ id: "error.second" }), Object.freeze({ id: "success.one" }),
        Object.freeze({ id: "error.first" }), Object.freeze({ id: "synthetic", sourceNodeId: "n", transitionHandleId: "h" }),
    ]);
    const sorted = getEditableExitTokens(events);
    assert.deepEqual(sorted.map(({ id }) => id), ["success.one", "error.second", "error.first", "fatal.details", "custom"]);
    assert.equal(sorted[0], events[3]);
    assert.equal(events.length, 6);
    assert.deepEqual(getEditableExitTokens(events, true).map(({ id }) => id), ["success.one", "error.second", "error.first", "fatal.details", "fatal", "custom"]);
    const fatal = { id: " fatal " };
    assert.deepEqual(getEditableExitTokens([fatal], true), [fatal]);
    assert.deepEqual(getEditableExitTokens([], false), []);
    assert.equal(getExitTokenType(" FATAL.details "), "fatal");
    assert.equal(getExitTokenType("fatality"), "other");
});

test("isolated inspector editors preserve draft, focus, commit and render contracts", async (t) => {
    const { Window } = await import("happy-dom");
    const window = new Window({ url: "http://localhost/" });
    const document = window.document;
    const errors = [];
    window.addEventListener("error", (event) => errors.push(event.error || event.message));
    const originals = new Map();
    const outside = document.createElement("button");
    document.body.append(outside);
    for (const [name, value] of Object.entries({
        window, document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        HTMLInputElement: window.HTMLInputElement, Event: window.Event,
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
    let server;
    let root;
    let container;
    const render = async (component) => React.act(async () => root.render(element(React.StrictMode, null, component)));
    const mount = async (component) => {
        if (root) await React.act(async () => root.unmount());
        container?.remove();
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await render(component);
    };
    const focus = async (target) => React.act(async () => target.focus());
    const blur = async (target) => React.act(async () => target.blur());
    const click = async (target) => React.act(async () => target.click());
    const key = async (target, value) => {
        const event = new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
        await React.act(async () => target.dispatchEvent(event));
        return event;
    };
    const type = async (input, value) => React.act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    const skill = (id = "source", data = {}) => ({ id, type: "custom", data: {
        label: "Work", fullSkillName: "p.Work", events: [], params: [], inSlots: [], outSlots: [], ...data,
    } });

    try {
        const { createServer } = await import("vite");
        const { default: react } = await import("@vitejs/plugin-react");
        server = await createServer({
            root: new URL("..", import.meta.url).pathname,
            configFile: false, plugins: [react()], appType: "custom",
            server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
            optimizeDeps: { noDiscovery: true, include: [] },
        });
        const [lanes, slots, general, nop, details, inspector] = await Promise.all([
            "/src/components/detailsPanel/ParallelLaneEditor.jsx",
            "/src/components/detailsPanel/SlotDetailsPanel.jsx",
            "/src/components/detailsPanel/GeneralDetailsSection.jsx",
            "/src/components/detailsPanel/NopSendEditor.jsx",
            "/src/components/DetailsPanel.jsx", "/src/components/EditorInspectorPanel.jsx",
        ].map((path) => server.ssrLoadModule(path)));

        await t.test("lane Escape cancels synchronous blur while Enter commits once and external renames resync", async () => {
            const commits = [];
            let props = { lanes: [{ id: "lane", data: { label: "Original" } }], onRename: (...args) => commits.push(args) };
            await mount(element(lanes.default, props));
            const input = container.querySelector("input");
            await focus(input);
            await type(input, "Canceled");
            await key(input, "Escape");
            assert.equal(input.value, "Original");
            assert.equal(document.activeElement, document.body);
            assert.deepEqual(commits, []);
            await focus(input);
            await type(input, "  Renamed  ");
            await key(input, "Enter");
            assert.deepEqual(commits, [["lane", "Renamed"]]);
            await focus(input);
            await blur(input);
            assert.equal(commits.length, 1);
            await focus(input);
            await type(input, "Typing");
            props = { ...props, lanes: [{ id: "lane", data: { label: "Original" }, childCount: 2 }] };
            await render(element(lanes.default, props));
            assert.equal(container.querySelector("input"), input);
            assert.equal(input.value, "Typing");
            props = { ...props, lanes: [{ id: "lane", data: { label: "External" } }] };
            await render(element(lanes.default, props));
            assert.equal(input.value, "External");
            await blur(input);
            assert.equal(commits.length, 1);
            await focus(input);
            await type(input, "");
            await key(input, "Enter");
            assert.deepEqual(commits.at(-1), ["lane", ""]);
            props = { ...props, lanes: [{ id: "lane", data: { label: "Lane_1" } }] };
            await render(element(lanes.default, props));
            assert.equal(input.value, "Lane_1");
            await focus(input);
            await blur(input);
            assert.equal(commits.length, 2);
        });

        await t.test("same-ID slot paths resync only for committed changes and suggestion click does not double commit", async () => {
            const commits = [];
            let props = { selectedNode: { id: "slot", type: "slot", data: { path: "/Alpha", slotType: "int" } },
                availableSlotPaths: [{ path: "/Alpha", type: "int" }, { path: "/Beta", type: "int" }, { path: "/Wrong", type: "String" }],
                onUpdateSlotPath: (value) => { commits.push(value); } };
            await mount(element(slots.default, props));
            const input = container.querySelector(".compact-slot-path-input");
            await focus(input);
            await type(input, "Draft");
            await render(element(slots.default, { ...props, selectedNode: { ...props.selectedNode, selected: true } }));
            assert.equal(input.value, "Draft");
            props = { ...props, selectedNode: { ...props.selectedNode, data: { path: "/Updated", slotType: "int" } } };
            await render(element(slots.default, props));
            assert.equal(input.value, "/Updated");
            await type(input, "");
            assert.deepEqual([...container.querySelectorAll('[role="option"]')].map((option) => option.textContent.trim()), ["/Alpha", "/Beta"]);
            const option = container.querySelectorAll('[role="option"]')[1];
            await focus(option);
            assert.ok(container.querySelector('[role="listbox"]'));
            assert.deepEqual(commits, []);
            const mouseDown = new window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
            await React.act(async () => option.dispatchEvent(mouseDown));
            assert.equal(mouseDown.defaultPrevented, true);
            assert.deepEqual(commits, []);
            await click(option);
            assert.equal(document.activeElement, input);
            assert.deepEqual(commits, ["/Beta"]);
            await blur(input);
            assert.deepEqual(commits, ["/Beta"]);
            await focus(input);
            await type(input, "Canceled");
            await key(input, "Escape");
            await blur(input);
            assert.equal(input.value, "/Beta");
            assert.equal(commits.length, 1);
            await focus(input);
            await type(input, "   ");
            await key(input, "Enter");
            assert.equal(input.value, "/Beta");
            assert.equal(commits.length, 1);
        });

        await t.test("skill slot drafts stay local, clamp shrunken suggestions and retain raw new/empty path commits", async () => {
            const commits = [];
            const available = ["/A", "/B", "/C"].map((path) => ({ path, type: "int" }));
            let props = { nodeId: "skill", access: "read", slots: [{ key: "in", type: "int", path: "" }], availableSlotPaths: available,
                onChange: (...args) => commits.push(args) };
            await mount(element(slots.SkillSlotSection, props));
            const input = container.querySelector("input");
            await focus(input);
            await type(input, "/");
            assert.deepEqual(commits, []);
            await key(input, "ArrowDown");
            await key(input, "ArrowDown");
            await key(input, "ArrowDown");
            props = { ...props, availableSlotPaths: [available[0]] };
            await render(element(slots.SkillSlotSection, props));
            assert.equal(input.getAttribute("aria-activedescendant"), container.querySelector('[role="option"]').id);
            await key(input, "Enter");
            await blur(input);
            assert.deepEqual(commits, [[0, "/A", true]]);
            await focus(input);
            await type(input, " /new/path ");
            await key(input, "Enter");
            assert.deepEqual(commits.at(-1), [0, " /new/path ", true]);
            await focus(input);
            await type(input, "");
            await focus(outside);
            assert.deepEqual(commits.at(-1), [0, "", true]);
            assert.equal(commits.length, 3);
            await focus(input);
            await type(input, "other-node-draft");
            await render(element(slots.SkillSlotSection, { ...props, nodeId: "other" }));
            assert.equal(container.querySelector("input").value, "");
        });

        await t.test("target typing is row-local, external targets/names resync, and blur/Escape cancel lookup drafts", async () => {
            let siblingReads = 0;
            const events = [{ id: "success", target: "a" }, { id: "error", get target() { siblingReads += 1; return "b"; } }];
            const commits = [];
            let props = { selectedNode: skill(), editableExitTokens: events,
                availableTargetNodes: [node("a", { label: "Alpha" }), node("b", { label: "Beta" })],
                onSetEventTarget: (...args) => commits.push(args) };
            await mount(element(general.default, props));
            const inputs = container.querySelectorAll(".exit-target-input");
            await focus(inputs[0]);
            const readsBeforeTyping = siblingReads;
            for (const value of ["A", "Al", "Alp", "Alpha", "Unknown"]) await type(inputs[0], value);
            assert.equal(siblingReads, readsBeforeTyping);
            assert.equal(inputs[1].value, "Beta");
            await render(element(general.default, { ...props, selectedNode: { ...props.selectedNode, selected: true } }));
            assert.equal(inputs[0].value, "Unknown");
            await focus(outside);
            assert.equal(inputs[0].value, "Alpha");
            assert.deepEqual(commits, []);
            await focus(inputs[0]);
            await type(inputs[0], "Beta");
            await key(inputs[0], "Escape");
            assert.equal(inputs[0].value, "Alpha");
            props = { ...props, editableExitTokens: [{ id: "success", target: "b" }, events[1]] };
            await render(element(general.default, props));
            assert.equal(inputs[0].value, "Beta");
            props = { ...props, availableTargetNodes: [props.availableTargetNodes[0], node("b", { label: "Renamed" })] };
            await render(element(general.default, props));
            assert.equal(inputs[0].value, "Renamed");
            await type(inputs[0], "Renamed");
            await key(inputs[0], "Enter");
            assert.deepEqual(commits, []);
            await type(inputs[0], "Alpha");
            await key(inputs[0], "Enter");
            assert.equal(commits.at(-1)[1], "a");
            await type(inputs[0], "Renamed");
            await key(inputs[0], "Enter");
            assert.equal(commits.at(-1)[1], "b");
            assert.equal(commits.length, 2);
        });

        await t.test("target buttons support focus-contained click and clamped keyboard selection with multi-ID normalization", async () => {
            const commits = [];
            const event = { id: "success", target: "shared" };
            let props = { selectedNode: skill(), editableExitTokens: [event],
                availableTargetNodes: [node("first", { fullSkillName: "shared", label: "First" }), node("shared", { label: "Later" }),
                    node("ref", { label: "State", isStateClone: true, editorInstanceId: "reference" })],
                skillOutgoingTransitions: [{ sourceNodeId: "source", eventId: "success", targetNodeId: "shared" }],
                onSetEventTarget: (...args) => commits.push(args) };
            await mount(element(general.default, props));
            const input = container.querySelector(".exit-target-input");
            assert.equal(input.value, "First");
            assert.equal(container.querySelectorAll(".exit-token-node-reference").length, 2);
            await focus(input);
            await type(input, "reference");
            const reference = container.querySelector(".exit-target-suggestion");
            await focus(reference);
            assert.ok(reference.isConnected);
            assert.ok(container.querySelector('[role="listbox"]'));
            await click(reference);
            assert.deepEqual(commits, [[{ id: "success", target: "first" }, "ref"]]);
            assert.equal(input.value, "State [reference]");
            assert.equal(document.activeElement, input);
            await blur(input);
            assert.equal(commits.length, 1);
            await focus(input);
            await type(input, "");
            await key(input, "ArrowDown");
            await key(input, "ArrowDown");
            await key(input, "ArrowDown");
            props = { ...props, availableTargetNodes: [props.availableTargetNodes[0]] };
            await render(element(general.default, props));
            assert.equal(input.getAttribute("aria-activedescendant"), container.querySelector('[role="option"]').id);
            await key(input, "Enter");
            assert.deepEqual(commits.at(-1), [{ id: "success", target: "first" }, "first"]);
        });

        await t.test("Nop focus remains inside suggestions and custom events retain immediate raw-value semantics", async () => {
            const changes = [];
            function Harness() {
                const [events, setEvents] = React.useState([]);
                return element(nop.default, { nodeId: "nop", events, onChange: (next) => { changes.push(next); setEvents(next); } });
            }
            await mount(element(Harness));
            const input = container.querySelector("input");
            await focus(input);
            const suggestion = container.querySelector(".nop-send-suggestion");
            await focus(suggestion);
            await React.act(async () => new Promise((resolve) => window.setTimeout(resolve, 130)));
            assert.ok(suggestion.isConnected);
            await click(suggestion);
            assert.deepEqual(changes, [["success"]]);
            assert.equal(document.activeElement, input);
            await click(container.querySelector(".nop-send-preset.active"));
            assert.equal(changes.length, 1);
            await type(input, "  my.custom.event  ");
            assert.deepEqual(changes.at(-1), ["  my.custom.event  "]);
            await focus(outside);
            assert.equal(input.value, "  my.custom.event  ");
            await click(container.querySelector(".nop-send-clear"));
            assert.deepEqual(changes.at(-1), []);
        });

        await t.test("DetailsPanel retains implicit fatal gates and request IDs without refocusing on unrelated updates", async () => {
            const events = [{ id: "success" }];
            let props = { selectedNode: skill("source", { events }), activeTab: "allgemein", setActiveTab: noop,
                onSetInitial: noop, onUpdateName: noop, onUpdateParameter: noop, onUpdateOutSlotPath: noop,
                transitionFocusRequest: { nodeId: "source", eventId: "fatal", requestId: 1 } };
            await mount(element(details.default, props));
            const fatalInput = document.getElementById("transition-target-source-1");
            let scrolls = 0;
            fatalInput.scrollIntoView = () => { scrolls += 1; };
            await React.act(async () => new Promise((resolve) => window.setTimeout(resolve, 80)));
            assert.equal(document.activeElement, fatalInput);
            assert.equal(scrolls, 1);
            await focus(outside);
            await render(element(details.default, { ...props, selectedNode: { ...props.selectedNode, selected: true } }));
            await React.act(async () => new Promise((resolve) => window.setTimeout(resolve, 80)));
            assert.equal(document.activeElement, outside);
            props = { ...props, transitionFocusRequest: { ...props.transitionFocusRequest, requestId: 2 } };
            await render(element(details.default, props));
            await React.act(async () => new Promise((resolve) => window.setTimeout(resolve, 80)));
            assert.equal(document.activeElement, fatalInput);
            for (const [type, data] of [["submachine", { src: "behavior.scxml" }], ["custom", { fullSkillName: "p.End" }], ["custom", { fullSkillName: "p.Fatal" }]]) {
                await render(element(details.default, { ...props, selectedNode: { ...skill("source", { events, ...data }), type } }));
                assert.deepEqual([...container.querySelectorAll(".event-list > .exit-token-card > .compact-slot-header .detail-card-title")].map((item) => item.textContent), ["success"]);
            }
            const selectedNode = skill("source", { params: [{ key: "speed", type: "int" }], outSlots: [{ key: "output", type: "int" }] });
            for (const [activeTab, request, inputId] of [
                ["parameter", { parameterFocusRequest: { nodeId: "source", parameterKey: "speed", requestId: 1 } }, "param-source-0"],
                ["slots", { slotFocusRequest: { nodeId: "source", slotKey: "output", access: "write", requestId: 1 } }, "out-slot-source-0"],
            ]) {
                await render(element(details.default, { ...props, selectedNode, activeTab, ...request }));
                const input = document.getElementById(inputId);
                input.scrollIntoView = noop;
                await React.act(async () => new Promise((resolve) => window.setTimeout(resolve, 80)));
                assert.equal(document.activeElement, input);
                await focus(outside);
                await render(element(details.default, { ...props, selectedNode: { ...selectedNode, selected: true }, activeTab, ...request }));
                await React.act(async () => new Promise((resolve) => window.setTimeout(resolve, 80)));
                assert.equal(document.activeElement, outside);
            }
        });

        await t.test("Data drafts survive outer tabs while runtime rows skip draft renders and real callbacks stay current", async () => {
            let runtimeReads = 0;
            let added;
            let replaceAdd;
            const changes = { slotWrites: [], get variables() { runtimeReads += 1; return [{ line: 1, key: "value", value: "1" }]; }, parameters: [] };
            const playback = { currentStep: { timestamp: "now" }, stepIndex: 0 };
            function Harness() {
                const [rightPanelTab, setRightPanelTab] = React.useState("datamodel");
                const [panelOpen, setPanelOpen] = React.useState(true);
                const [onAddParameter, setAddParameter] = React.useState(() => (...args) => { added = ["first", ...args]; });
                React.useLayoutEffect(() => { replaceAdd = setAddParameter; }, []);
                return element(inspector.default, { rightPanelTab, setRightPanelTab, selection: { selectedNode: skill() },
                    dataModel: { global: [], onAddParameter, onUpdateParameter: noop, onDeleteParameter: noop },
                    problems: { items: [], errorCount: 0 }, runtime: { log: {}, panelOpen, setPanelOpen, playback, changes },
                    details: { activeTab: "allgemein", setActiveTab: noop, callbacks: { onUpdateName: noop } } });
            }
            await mount(element(Harness));
            const readsBeforeTyping = runtimeReads;
            await type(container.querySelector('input[placeholder="ID"]'), "draft");
            await type(container.querySelector('input[placeholder="Value"]'), "42");
            assert.equal(runtimeReads, readsBeforeTyping);
            await click(container.querySelector("#inspector-tab-problems"));
            await click(container.querySelector("#inspector-tab-datamodel"));
            assert.equal(container.querySelector('input[placeholder="ID"]').value, "draft");
            assert.equal(container.querySelector('input[placeholder="Value"]').value, "42");
            assert.equal(runtimeReads, readsBeforeTyping);
            await React.act(async () => replaceAdd(() => (...args) => { added = ["latest", ...args]; }));
            await key(container.querySelector('input[placeholder="Value"]'), "Enter");
            assert.deepEqual(added, ["latest", "draft", "42"]);
            assert.equal(container.querySelector('input[placeholder="ID"]').value, "");
            assert.equal(runtimeReads, readsBeforeTyping);
            await click(container.querySelector(".runtime-changes-drawer-ledge"));
            assert.equal(container.querySelector(".runtime-changes-drawer-ledge").getAttribute("aria-expanded"), "false");
            await click(container.querySelector(".runtime-changes-drawer-ledge"));
            assert.equal(container.querySelector(".runtime-changes-drawer-ledge").getAttribute("aria-expanded"), "true");
            assert.ok(runtimeReads > readsBeforeTyping);
        });
        assert.deepEqual(errors, []);
    } finally {
        if (root) await React.act(async () => root.unmount());
        if (server) await server.close();
        await window.happyDOM.abort();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
});
