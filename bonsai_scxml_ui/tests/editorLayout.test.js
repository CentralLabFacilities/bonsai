import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/", width: 1440, height: 900 });
const document = window.document;
const originalGlobals = new Map();
let React;
let createRoot;
let server;
let useLayout;
let useGraph;
let useTabs;
let Header;
let Panel;
let Resizer;
let Ledge;
let ContextMenu;
let root;
let container;
let current;

test.before(async () => {
    for (const [key, value] of Object.entries({
        window,
        document,
        navigator: window.navigator,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        Node: window.Node,
        Event: window.Event,
        IS_REACT_ACT_ENVIRONMENT: true,
        requestAnimationFrame: window.requestAnimationFrame.bind(window),
        cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    })) {
        originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
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
    ({ useEditorPanelLayout: useLayout } = await server.ssrLoadModule(
        "/src/hooks/useEditorPreferences.js",
    ));
    ({ useEditorGraphState: useGraph } = await server.ssrLoadModule(
        "/src/hooks/useEditorGraphState.js",
    ));
    ({ useWorkflowTabs: useTabs } = await server.ssrLoadModule("/src/hooks/useWorkflowTabs.js"));
    ({
        default: Header,
        EditorPanel: Panel,
        EditorPanelResizer: Resizer,
        EditorPanelLedge: Ledge,
    } = await server.ssrLoadModule("/src/components/EditorChrome.jsx"));
    ({ default: ContextMenu } = await server.ssrLoadModule(
        "/src/components/CanvasContextMenu.jsx",
    ));
});

const size = async (width) =>
    React.act(async () => {
        window.happyDOM.setWindowSize({ width, height: 900 });
        window.dispatchEvent(new window.Event("resize"));
    });

function Input({ side }) {
    const [value, setValue] = React.useState("");
    return React.createElement("input", {
        "aria-label": `${side} draft`,
        value,
        onChange: (event) => setValue(event.target.value),
    });
}

function Harness() {
    const panels = useLayout();
    const graph = useGraph();
    const tabs = useTabs({
        ...graph,
        selectedNodeId: null,
        setSelectedNodeId: () => {},
        fitView: () => {},
    });
    React.useLayoutEffect(() => {
        current = { panels, graph, tabs };
    }, [panels, graph, tabs]);
    return React.createElement(
        "div",
        { className: "container" },
        React.createElement(Header, { panels }),
        React.createElement(
            "div",
            { className: "app", "data-panel-mode": panels.isDocked ? "docked" : "drawers" },
            React.createElement(
                Panel,
                { side: "library", panels },
                React.createElement(Input, { side: "library" }),
            ),
            React.createElement(Resizer, { side: "library", panels }),
            React.createElement(
                "main",
                { className: "editor-area" },
                React.createElement("button", { id: "canvas" }, "Canvas"),
            ),
            React.createElement(Resizer, { side: "inspector", panels }),
            React.createElement(
                Panel,
                { side: "inspector", panels },
                React.createElement(Input, { side: "inspector" }),
            ),
            React.createElement(Ledge, { side: "library", panels }),
            React.createElement(Ledge, { side: "inspector", panels }),
        ),
    );
}

const mount = async (preferences = null, width = 1440) => {
    window.localStorage.clear();
    if (preferences) window.localStorage.setItem("bonsai.panelLayout", JSON.stringify(preferences));
    await size(width);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await React.act(async () => root.render(React.createElement(Harness)));
};
test.afterEach(async () => {
    await React.act(async () => root?.unmount());
    container?.remove();
    await window.happyDOM.cancelAsync();
});
test.after(async () => {
    await server?.close();
    for (const [key, descriptor] of originalGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    }
});
const panel = (side) => document.querySelector(`#editor-${side}-panel`);
const handle = (side) => document.querySelector(`[role="separator"][aria-label="Resize ${side}"]`);
const toggle = (side) => document.querySelector(`button[aria-controls="editor-${side}-panel"]`);
const key = async (target, value) =>
    React.act(async () =>
        target.dispatchEvent(
            new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
        ),
    );
const pointer = async (side, type, x) =>
    React.act(async () =>
        handle(side).dispatchEvent(
            new window.PointerEvent(type, {
                clientX: x,
                pointerId: 1,
                button: 0,
                bubbles: true,
                cancelable: true,
            }),
        ),
    );

test("desktop panel controls collapse without unmounting content or modifying the workflow", async () => {
    await mount();
    assert.equal(current.panels.libraryWidth, 350);
    assert.equal(current.panels.inspectorWidth, 400);
    const input = panel("library").querySelector("input");
    await React.act(async () => toggle("library").click());
    assert.equal(panel("library").getAttribute("aria-hidden"), "true");
    assert.equal(panel("library").hasAttribute("inert"), true);
    assert.equal(handle("library").tabIndex, -1);
    assert.equal(current.panels.libraryWidth, 0);
    await React.act(async () => toggle("library").click());
    assert.equal(panel("library").querySelector("input"), input);
    assert.equal(current.tabs.getTabSnapshot().isModified, false);
});

test("both edge ledges remain available to collapse and reopen docked panels", async () => {
    await mount();
    for (const side of ["library", "inspector"]) {
        const ledge = document.querySelector(`.editor-panel-ledge-${side}`);
        const input = panel(side).querySelector("input");
        assert.equal(ledge.getAttribute("aria-expanded"), "true");
        assert.equal(ledge.getAttribute("aria-controls"), `editor-${side}-panel`);
        await React.act(async () => ledge.click());
        assert.equal(ledge.getAttribute("aria-expanded"), "false");
        assert.equal(ledge.getAttribute("aria-label"), `Expand ${side}`);
        assert.equal(current.panels[`${side}Open`], false);
        assert.equal(ledge.isConnected, true);
        assert.equal(ledge.closest("[inert]"), null);
        await React.act(async () => ledge.click());
        assert.equal(ledge.getAttribute("aria-expanded"), "true");
        assert.equal(panel(side).querySelector("input"), input);
    }
    assert.equal(current.tabs.getTabSnapshot().isModified, false);
});

test("edge ledges toggle one narrow drawer at a time and restore keyboard focus", async () => {
    await mount(null, 390);
    const library = document.querySelector(".editor-panel-ledge-library");
    const inspector = document.querySelector(".editor-panel-ledge-inspector");
    library.focus();
    await React.act(async () => library.click());
    assert.equal(current.panels.libraryOpen, true);
    assert.ok(panel("library").contains(document.activeElement));
    await key(document.activeElement, "Escape");
    assert.equal(document.activeElement, library);
    assert.equal(current.panels.libraryOpen, false);
    await React.act(async () => library.click());
    await React.act(async () => inspector.click());
    assert.equal(current.panels.libraryOpen, false);
    assert.equal(current.panels.inspectorOpen, true);
    await React.act(async () => inspector.click());
    assert.equal(current.panels.inspectorOpen, false);
    assert.equal(current.tabs.getTabSnapshot().isModified, false);
});

test("keyboard resizing respects bounds, inspector direction, and persisted preferences", async () => {
    await mount();
    await key(handle("library"), "ArrowRight");
    assert.equal(current.panels.libraryWidth, 366);
    await key(handle("inspector"), "ArrowLeft");
    assert.equal(current.panels.inspectorWidth, 416);
    await key(handle("library"), "Home");
    assert.equal(current.panels.libraryWidth, 240);
    await key(handle("inspector"), "End");
    assert.equal(current.panels.inspectorWidth, 560);
    const saved = JSON.parse(window.localStorage.getItem("bonsai.panelLayout"));
    assert.equal(saved.libraryWidth, 240);
    assert.equal(saved.inspectorWidth, 560);
    assert.equal(current.tabs.getTabSnapshot().isModified, false);
});

test("pointer resize previews without storage writes, commits on release and cancels safely", async () => {
    await mount();
    const saved = window.localStorage.getItem("bonsai.panelLayout");
    await pointer("library", "pointerdown", 350);
    await pointer("library", "pointermove", 430);
    assert.equal(current.panels.libraryWidth, 430);
    assert.equal(window.localStorage.getItem("bonsai.panelLayout"), saved);
    await pointer("library", "pointerup", 440);
    assert.equal(current.panels.libraryWidth, 440);
    assert.equal(JSON.parse(window.localStorage.getItem("bonsai.panelLayout")).libraryWidth, 440);
    await pointer("library", "pointerdown", 440);
    await pointer("library", "pointermove", 300);
    await pointer("library", "pointercancel", 300);
    assert.equal(current.panels.libraryWidth, 440);
    assert.equal(current.tabs.getTabSnapshot().isModified, false);
});

test("narrow windows use one drawer and restore focus on Escape", async () => {
    await mount(null, 390);
    assert.equal(current.panels.isDocked, false);
    assert.equal(current.panels.libraryOpen, false);
    assert.equal(current.panels.inspectorOpen, false);
    toggle("library").focus();
    await React.act(async () => toggle("library").click());
    assert.equal(current.panels.libraryOpen, true);
    assert.ok(panel("library").contains(document.activeElement));
    await key(document.activeElement, "Escape");
    assert.equal(current.panels.libraryOpen, false);
    assert.equal(document.activeElement, toggle("library"));
    await React.act(async () => toggle("library").click());
    await React.act(async () => toggle("inspector").click());
    assert.equal(current.panels.libraryOpen, false);
    assert.equal(current.panels.inspectorOpen, true);
    assert.ok(current.panels.inspectorWidth <= 378);
});

test("viewport transitions preserve saved desktop widths and visibility without reopening drawers", async () => {
    await mount({
        libraryWidth: 430,
        inspectorWidth: 500,
        libraryOpen: false,
        inspectorOpen: true,
    });
    await size(1024);
    assert.equal(current.panels.libraryOpen, false);
    assert.equal(current.panels.inspectorOpen, false);
    await React.act(async () => toggle("library").click());
    await size(1600);
    assert.equal(current.panels.libraryOpen, false);
    assert.equal(current.panels.inspectorOpen, true);
    assert.equal(current.panels.inspectorWidth, 500);
    await size(768);
    assert.equal(current.panels.libraryOpen, false);
    assert.equal(current.panels.inspectorOpen, false);
    const saved = JSON.parse(window.localStorage.getItem("bonsai.panelLayout"));
    assert.equal(saved.libraryWidth, 430);
    assert.equal(saved.libraryOpen, false);
});

test("explicit inspection opens a closed panel and library dragging keeps the source mounted", async () => {
    await mount(null, 768);
    await React.act(async () => current.panels.showPanel("inspector"));
    assert.equal(current.panels.inspectorOpen, true);
    await React.act(async () => current.panels.showPanel("library"));
    const input = panel("library").querySelector("input");
    await React.act(async () =>
        panel("library").dispatchEvent(new window.Event("dragstart", { bubbles: true })),
    );
    assert.equal(current.panels.libraryDragging, true);
    assert.equal(current.panels.libraryOpen, true);
    assert.equal(panel("library").querySelector("input"), input);
    await React.act(async () =>
        panel("library").dispatchEvent(new window.Event("dragend", { bubbles: true })),
    );
    assert.equal(current.panels.libraryDragging, false);
    assert.equal(current.panels.libraryOpen, false);
});

test("resizing a fitted desktop panel changes its pixels rather than growing the opposite panel", async () => {
    await mount(null, 1100);
    const previousLibrary = current.panels.libraryWidth;
    const previousInspector = current.panels.inspectorWidth;
    await key(handle("library"), "ArrowLeft");
    assert.ok(Math.abs(current.panels.libraryWidth - (previousLibrary - 16)) < 1e-6);
    assert.equal(current.panels.inspectorWidth, previousInspector);
    assert.ok(1100 - current.panels.libraryWidth - current.panels.inspectorWidth - 12 - 2 >= 420);
});

test("a successful library drop can reveal the inspector without dragend closing it again", async () => {
    await mount(null, 768);
    await React.act(async () => current.panels.showPanel("library"));
    await React.act(async () => current.panels.onLibraryDragStart());
    await React.act(async () => current.panels.showPanel("inspector"));
    await React.act(async () => current.panels.onLibraryDragEnd());
    assert.equal(current.panels.libraryDragging, false);
    assert.equal(current.panels.inspectorOpen, true);
});

test("interrupted pointer resizing never leaves a stuck cursor or changes the saved widths", async () => {
    await mount();
    await pointer("library", "pointerdown", 350);
    await pointer("library", "pointermove", 420);
    await React.act(async () => window.dispatchEvent(new window.Event("blur")));
    assert.equal(current.panels.resizing, false);
    assert.equal(current.panels.libraryWidth, 350);
    await pointer("library", "pointerdown", 350);
    await pointer("library", "pointermove", 420);
    await size(390);
    assert.equal(current.panels.resizing, false);
    await size(1440);
    await pointer("library", "pointermove", 450);
    await pointer("library", "pointerup", 450);
    assert.equal(current.panels.libraryWidth, 350);
});

test("context menus clamp rendered geometry without changing graph insertion coordinates", async () => {
    await mount(null, 390);
    const context = Object.freeze({ kind: "pane", x: 385, y: 895 });
    const clicks = [];
    const prototype = window.HTMLElement.prototype;
    const original = prototype.getBoundingClientRect;
    prototype.getBoundingClientRect = function () {
        return this.classList.contains("context-menu")
            ? { width: 250, height: 200, left: 0, top: 0, right: 250, bottom: 200 }
            : original.call(this);
    };
    try {
        await React.act(async () =>
            root.render(
                React.createElement(ContextMenu, {
                    contextMenu: context,
                    activeMode: "overview",
                    hasGraphClipboard: true,
                    handleSelectAction: (action) => clicks.push([action, context.x, context.y]),
                }),
            ),
        );
        const menu = document.querySelector(".context-menu");
        assert.equal(menu.parentElement, document.body);
        assert.equal(menu.style.left, "132px");
        assert.equal(menu.style.top, "692px");
        await React.act(async () =>
            [...menu.querySelectorAll("button")]
                .find((button) => button.textContent === "New Compound State")
                .click(),
        );
        assert.deepEqual(clicks, [["compound", 385, 895]]);
        await React.act(async () => {
            window.happyDOM.setWindowSize({ width: 300, height: 500 });
            window.dispatchEvent(new window.Event("resize"));
        });
        assert.equal(menu.style.left, "42px");
        assert.equal(menu.style.top, "292px");
        assert.equal(context.x, 385);
    } finally {
        prototype.getBoundingClientRect = original;
    }
});
