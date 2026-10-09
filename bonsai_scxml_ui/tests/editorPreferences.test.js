import test from "node:test";
import assert from "node:assert/strict";
import {
    getEditorPanelLayout,
    loadBehaviorDirectories,
    loadEdgeVisibility,
    loadPanelPreferences,
    loadRuntimeConfiguration,
    PANEL_DOCK_BREAKPOINT,
    PANEL_LIMITS,
    PANEL_MIN_CANVAS_WIDTH,
    PANEL_RESIZE_WIDTH,
    saveEditorPreferences,
    savePanelPreferences,
    saveRuntimeConfiguration,
} from "../src/utils/editorPreferences.js";

function storageWith(value) {
    return { getItem: () => value };
}

test("runtime configuration uses its own key and preserves the exact configured path", () => {
    const values = new Map([["bonsai.panelLayout", "unchanged"], ["bonsai.behaviorDirectories", "[]"]]);
    const storage = {
        getItem(key) { assert.equal(key, "bonsai.runtimeConfiguration"); return values.get(key) ?? null; },
        setItem(key, value) { assert.equal(key, "bonsai.runtimeConfiguration"); values.set(key, value); },
    };
    assert.equal(loadRuntimeConfiguration(storage), "");
    for (const path of ["/configs/bonsai.xml", " /workspace/config with spaces.xml ", ""]) {
        saveRuntimeConfiguration(path, storage);
        assert.equal(loadRuntimeConfiguration(storage), path);
    }
    assert.equal(values.get("bonsai.panelLayout"), "unchanged");
    assert.equal(values.get("bonsai.behaviorDirectories"), "[]");
});

test("runtime configuration cache is optional with missing, blocked or full storage", () => {
    for (const value of [null, undefined, ""]) assert.equal(loadRuntimeConfiguration(storageWith(value)), "");
    for (const storage of [{}, {
        getItem() { throw new Error("Access denied"); }, setItem() { throw new Error("Quota exceeded"); },
    }, {
        get getItem() { throw new Error("Storage blocked"); }, get setItem() { throw new Error("Storage blocked"); },
    }]) {
        assert.equal(loadRuntimeConfiguration(storage), "");
        assert.doesNotThrow(() => saveRuntimeConfiguration("/configs/current.xml", storage));
    }
    assert.equal(loadRuntimeConfiguration(), "");
    assert.doesNotThrow(() => saveRuntimeConfiguration("/configs/current.xml"));
});

test("default runtime cache survives a fresh consumer and blocked localStorage access", (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    const values = new Map();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
        localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    } });
    context.after(() => {
        if (original) Object.defineProperty(globalThis, "window", original);
        else delete globalThis.window;
    });
    saveRuntimeConfiguration("/configs/restart.xml");
    assert.equal(loadRuntimeConfiguration(), "/configs/restart.xml");
    assert.equal(loadRuntimeConfiguration(), "/configs/restart.xml");
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
        get localStorage() { throw new Error("Access denied"); },
    } });
    assert.equal(loadRuntimeConfiguration(), "");
    assert.doesNotThrow(() => saveRuntimeConfiguration("/configs/usable-without-cache.xml"));
});

test("behavior directories preserve custom mappings and remove only retired built-ins", () => {
    const stored = [
        { key: " robocup ", path: "/workspace", isDefault: true },
        { key: "exercise", path: "/old", isDefault: true },
        { key: "challenge", path: "/custom", isDefault: false },
        { key: 42, path: "/invalid" },
        null,
    ];
    assert.deepEqual(loadBehaviorDirectories(storageWith(JSON.stringify(stored))), [
        { key: "ROBOCUP", path: "/workspace", isDefault: true },
        { key: "CHALLENGE", path: "/custom", isDefault: false },
    ]);
    assert.deepEqual(stored[0].key, " robocup ");
    assert.deepEqual(loadBehaviorDirectories(storageWith("[]")), []);
});

test("malformed or blocked storage falls back to independent defaults", () => {
    const defaults = [{ key: "ROBOCUP", path: "/robocup_ws/robocup", isDefault: true }];
    for (const value of [null, "not JSON", "{}", "null"]) {
        assert.deepEqual(loadBehaviorDirectories(storageWith(value)), defaults);
    }
    const blocked = { getItem() { throw new Error("blocked"); } };
    assert.deepEqual(loadBehaviorDirectories(blocked), defaults);
    assert.equal(loadEdgeVisibility("slots", blocked), true);
    const first = loadBehaviorDirectories(storageWith(null));
    first[0].key = "CHANGED";
    assert.deepEqual(loadBehaviorDirectories(storageWith(null)), defaults);
});

test("edge visibility preserves the persisted string toggle semantics", () => {
    assert.equal(loadEdgeVisibility("transitions", storageWith("false")), false);
    for (const value of [null, "true", "", "0"]) {
        assert.equal(loadEdgeVisibility("slots", storageWith(value)), true);
    }
});

test("persisting preferences tolerates individual failures and keeps attempting other keys", () => {
    const writes = [];
    const preferences = { behaviorDirectories: [], showTransitionEdges: false, showSlotEdges: true };
    saveEditorPreferences(preferences, {
        setItem(key, value) {
            writes.push([key, value]);
            if (key === "bonsai.behaviorDirectories") throw new Error("quota exceeded");
        },
    });
    assert.deepEqual(writes, [
        ["bonsai.behaviorDirectories", "[]"],
        ["bonsai.showTransitionEdges", "false"],
        ["bonsai.showSlotEdges", "true"],
    ]);
});

test("panel limits preserve the desktop defaults and canvas reservation", () => {
    assert.equal(PANEL_DOCK_BREAKPOINT, 1100);
    assert.equal(PANEL_MIN_CANVAS_WIDTH, 420);
    assert.equal(PANEL_RESIZE_WIDTH, 6);
    assert.deepEqual(PANEL_LIMITS, {
        library: { min: 240, max: 480, default: 350 },
        inspector: { min: 280, max: 560, default: 400 },
    });
});

test("panel preferences fall back to fresh defaults for missing or malformed storage", () => {
    const defaults = { libraryWidth: 350, inspectorWidth: 400, libraryOpen: true, inspectorOpen: true };
    for (const value of [null, undefined, "", "not JSON", "{}", "null", "[]", "42", '"library"', "false"]) {
        const first = loadPanelPreferences(storageWith(value));
        assert.deepEqual(first, defaults);
        first.libraryWidth = 480;
        first.libraryOpen = false;
        assert.deepEqual(loadPanelPreferences(storageWith(value)), defaults);
    }
    assert.deepEqual(loadPanelPreferences(), defaults);
    assert.deepEqual(loadPanelPreferences({}), defaults);
    assert.deepEqual(loadPanelPreferences({ getItem() { throw new Error("blocked"); } }), defaults);
});

test("panel preferences validate individual fields, clamp widths, and ignore extra fields", () => {
    const stored = { libraryWidth: -10, inspectorWidth: 1000, libraryOpen: false, inspectorOpen: true, extra: "ignored" };
    const storage = {
        getItem(key) {
            assert.equal(key, "bonsai.panelLayout");
            return JSON.stringify(stored);
        },
    };
    assert.deepEqual(loadPanelPreferences(storage), {
        libraryWidth: 240, inspectorWidth: 560, libraryOpen: false, inspectorOpen: true,
    });
    assert.deepEqual(stored, {
        libraryWidth: -10, inspectorWidth: 1000, libraryOpen: false, inspectorOpen: true, extra: "ignored",
    });
    assert.deepEqual(loadPanelPreferences(storageWith('{"libraryWidth":460,"inspectorOpen":false}')), {
        libraryWidth: 460, inspectorWidth: 400, libraryOpen: true, inspectorOpen: false,
    });
    assert.deepEqual(loadPanelPreferences(storageWith('{"libraryWidth":1e400,"inspectorWidth":-1e400}')), {
        libraryWidth: 350, inspectorWidth: 400, libraryOpen: true, inspectorOpen: true,
    });
});

test("panel preferences require finite numbers and strict booleans without coercion", () => {
    const defaults = { libraryWidth: 350, inspectorWidth: 400, libraryOpen: true, inspectorOpen: true };
    for (const value of [null, "false", "320", 0, 1, [], {}]) {
        const stored = { libraryWidth: String(value), inspectorWidth: null, libraryOpen: value, inspectorOpen: value };
        assert.deepEqual(loadPanelPreferences(storageWith(JSON.stringify(stored))), defaults);
    }
    assert.deepEqual(loadPanelPreferences(storageWith('{"libraryOpen":false,"inspectorOpen":false}')), {
        ...defaults, libraryOpen: false, inspectorOpen: false,
    });
    assert.deepEqual(loadPanelPreferences(storageWith('{"libraryWidth":480,"inspectorWidth":280}')), {
        ...defaults, libraryWidth: 480, inspectorWidth: 280,
    });
});

test("loaded panel preferences are independent even when every stored field is valid", () => {
    const stored = { libraryWidth: 320, inspectorWidth: 420, libraryOpen: false, inspectorOpen: true };
    const storage = storageWith(JSON.stringify(stored));
    const first = loadPanelPreferences(storage);
    const second = loadPanelPreferences(storage);
    assert.notEqual(first, second);
    first.inspectorWidth = 560;
    first.inspectorOpen = false;
    assert.deepEqual(second, stored);
    assert.deepEqual(loadPanelPreferences(storage), stored);
});

test("panel preferences persist only their normalized shape under a separate key", () => {
    const preferences = Object.freeze({
        libraryWidth: 1000, inspectorWidth: -10, libraryOpen: false, inspectorOpen: "false", extra: "ignored",
    });
    const writes = [];
    savePanelPreferences(preferences, { setItem(key, value) { writes.push([key, value]); } });
    assert.deepEqual(writes, [["bonsai.panelLayout", JSON.stringify({
        libraryWidth: 480, inspectorWidth: 280, libraryOpen: false, inspectorOpen: true,
    })]]);
    assert.equal(preferences.libraryWidth, 1000);
    assert.equal(preferences.inspectorOpen, "false");

    for (const value of [undefined, null, [], {
        libraryWidth: NaN, inspectorWidth: Infinity, libraryOpen: 0, inspectorOpen: null,
    }]) {
        const normalizedWrites = [];
        savePanelPreferences(value, {
            setItem(key, saved) { normalizedWrites.push([key, JSON.parse(saved)]); },
        });
        assert.deepEqual(normalizedWrites, [["bonsai.panelLayout", {
            libraryWidth: 350, inspectorWidth: 400, libraryOpen: true, inspectorOpen: true,
        }]]);
    }
});

test("panel persistence tolerates unavailable, broken, blocked, and full storage", () => {
    const preferences = loadPanelPreferences(storageWith(null));
    assert.doesNotThrow(() => savePanelPreferences(preferences));
    assert.doesNotThrow(() => savePanelPreferences(preferences, {}));
    assert.doesNotThrow(() => savePanelPreferences(preferences, {
        setItem() { throw new Error("quota exceeded"); },
    }));
    const blocked = {
        get getItem() { throw new Error("blocked"); },
        get setItem() { throw new Error("blocked"); },
    };
    assert.deepEqual(loadPanelPreferences(blocked), preferences);
    assert.doesNotThrow(() => savePanelPreferences(preferences, blocked));
});

test("drawer layouts open only the selected panel regardless of saved visibility", () => {
    const preferences = { libraryWidth: 350, inspectorWidth: 400, libraryOpen: false, inspectorOpen: false };
    for (const width of [390, 768, 1024, 1099]) {
        for (const drawer of [null, undefined, "unknown", "Library", "library", "inspector"]) {
            const layout = getEditorPanelLayout(width, preferences, drawer);
            assert.equal(layout.isDocked, false);
            assert.equal(layout.libraryOpen, drawer === "library");
            assert.equal(layout.inspectorOpen, drawer === "inspector");
            assert.equal(layout.libraryWidth, drawer === "library" ? 350 : 0);
            assert.equal(layout.inspectorWidth, drawer === "inspector" ? Math.min(400, width - 12) : 0);
        }
    }
    assert.deepEqual(getEditorPanelLayout(1024, { ...preferences, libraryOpen: true, inspectorOpen: true }), {
        isDocked: false, libraryOpen: false, inspectorOpen: false, libraryWidth: 0, inspectorWidth: 0,
        libraryMaxWidth: 480, inspectorMaxWidth: 560,
    });
});

test("mobile drawers cap requested widths and resize maxima to the viewport inset", () => {
    const preferences = { libraryWidth: 480, inspectorWidth: 560 };
    assert.deepEqual(getEditorPanelLayout(390, preferences, "library"), {
        isDocked: false, libraryOpen: true, inspectorOpen: false, libraryWidth: 378, inspectorWidth: 0,
        libraryMaxWidth: 378, inspectorMaxWidth: 378,
    });
    assert.deepEqual(getEditorPanelLayout(390, preferences, "inspector"), {
        isDocked: false, libraryOpen: false, inspectorOpen: true, libraryWidth: 0, inspectorWidth: 378,
        libraryMaxWidth: 378, inspectorMaxWidth: 378,
    });
    for (const width of [0, 10, 12, 100, 200, 250]) {
        const maximum = Math.max(0, width - 12);
        for (const drawer of ["library", "inspector"]) {
            const layout = getEditorPanelLayout(width, preferences, drawer);
            assert.equal(layout[`${drawer}Width`], maximum);
            assert.equal(layout.libraryMaxWidth, maximum);
            assert.equal(layout.inspectorMaxWidth, maximum);
        }
    }
});

test("roomy desktop panels preserve defaults and expose their full resize limits", () => {
    assert.deepEqual(getEditorPanelLayout(1440), {
        isDocked: true, libraryOpen: true, inspectorOpen: true, libraryWidth: 350, inspectorWidth: 400,
        libraryMaxWidth: 480, inspectorMaxWidth: 560,
    });
    assert.deepEqual(getEditorPanelLayout(1440, undefined, "library"), getEditorPanelLayout(1440));
    const preferences = { libraryWidth: 480, inspectorWidth: 280, libraryOpen: true, inspectorOpen: false };
    assert.deepEqual(getEditorPanelLayout(1440, preferences, "inspector"), {
        isDocked: true, libraryOpen: true, inspectorOpen: false, libraryWidth: 480, inspectorWidth: 0,
        libraryMaxWidth: 480, inspectorMaxWidth: 532,
    });
});

test("desktop breakpoint fitting shrinks proportionally toward the panel minimums", () => {
    const layout = getEditorPanelLayout(1100);
    const budget = 1100 - PANEL_MIN_CANVAS_WIDTH - 2 - 2 * PANEL_RESIZE_WIDTH;
    const scale = (budget - PANEL_LIMITS.library.min - PANEL_LIMITS.inspector.min)
        / (350 + 400 - PANEL_LIMITS.library.min - PANEL_LIMITS.inspector.min);
    assert.equal(layout.isDocked, true);
    assert.equal(layout.libraryOpen, true);
    assert.equal(layout.inspectorOpen, true);
    assert.equal(layout.libraryWidth, PANEL_LIMITS.library.min + (350 - PANEL_LIMITS.library.min) * scale);
    assert.equal(layout.inspectorWidth, budget - layout.libraryWidth);
    assert.equal(layout.libraryMaxWidth, layout.libraryWidth);
    assert.equal(layout.inspectorMaxWidth, layout.inspectorWidth);
    assert.ok(Math.abs(1100 - (layout.libraryWidth + layout.inspectorWidth) - 2 * PANEL_RESIZE_WIDTH - 2 - 420) < 1e-9);
    assert.deepEqual(getEditorPanelLayout(1100, { libraryWidth: 240, inspectorWidth: 280 }), {
        isDocked: true, libraryOpen: true, inspectorOpen: true, libraryWidth: 240, inspectorWidth: 280,
        libraryMaxWidth: 386, inspectorMaxWidth: 426,
    });
});

test("oversized desktop requests always leave the canvas budget and usable resize boundaries", () => {
    for (const width of [1100, 1120, 1200, 1280, 1440, 1600]) {
        for (const libraryWidth of [240, 350, 480, 10000]) {
            for (const inspectorWidth of [280, 400, 560, 10000]) {
                const layout = getEditorPanelLayout(width, { libraryWidth, inspectorWidth });
                assert.ok(layout.libraryWidth >= PANEL_LIMITS.library.min);
                assert.ok(layout.inspectorWidth >= PANEL_LIMITS.inspector.min);
                assert.ok(layout.libraryWidth <= PANEL_LIMITS.library.max);
                assert.ok(layout.inspectorWidth <= PANEL_LIMITS.inspector.max);
                assert.ok(layout.libraryMaxWidth >= layout.libraryWidth - 1e-9);
                assert.ok(layout.inspectorMaxWidth >= layout.inspectorWidth - 1e-9);
                assert.ok(layout.libraryMaxWidth <= PANEL_LIMITS.library.max);
                assert.ok(layout.inspectorMaxWidth <= PANEL_LIMITS.inspector.max);
                assert.ok(width - layout.libraryWidth - layout.inspectorWidth - 2 * PANEL_RESIZE_WIDTH >= 420 - 1e-9);
                assert.ok(width - layout.libraryMaxWidth - layout.inspectorWidth - 2 * PANEL_RESIZE_WIDTH >= 420 - 1e-9);
                assert.ok(width - layout.libraryWidth - layout.inspectorMaxWidth - 2 * PANEL_RESIZE_WIDTH >= 420 - 1e-9);
            }
        }
    }
    const fitted = getEditorPanelLayout(1440, { libraryWidth: 480, inspectorWidth: 560 });
    assert.ok(Math.abs(fitted.libraryWidth + fitted.inspectorWidth - (1440 - 420 - 2 - 12)) < 1e-9);
});

test("hidden desktop panels reclaim both their width and their resize handle", () => {
    const preferences = { libraryWidth: 480, inspectorWidth: 560, libraryOpen: false, inspectorOpen: true };
    assert.deepEqual(getEditorPanelLayout(1100, preferences), {
        isDocked: true, libraryOpen: false, inspectorOpen: true, libraryWidth: 0, inspectorWidth: 560,
        libraryMaxWidth: 112, inspectorMaxWidth: 560,
    });
    assert.deepEqual(getEditorPanelLayout(1100, { ...preferences, libraryOpen: true, inspectorOpen: false }), {
        isDocked: true, libraryOpen: true, inspectorOpen: false, libraryWidth: 480, inspectorWidth: 0,
        libraryMaxWidth: 480, inspectorMaxWidth: 192,
    });
    assert.deepEqual(getEditorPanelLayout(1100, { ...preferences, inspectorOpen: false }), {
        isDocked: true, libraryOpen: false, inspectorOpen: false, libraryWidth: 0, inspectorWidth: 0,
        libraryMaxWidth: 480, inspectorMaxWidth: 560,
    });
});

test("layout fitting never changes requested widths or visibility across viewports", () => {
    const preferences = Object.freeze({ libraryWidth: 480, inspectorWidth: 560, libraryOpen: true, inspectorOpen: true });
    const saved = JSON.stringify(preferences);
    const first = getEditorPanelLayout(1100, preferences);
    getEditorPanelLayout(390, preferences, "inspector");
    const roomy = getEditorPanelLayout(1600, preferences);
    assert.equal(roomy.libraryWidth, 480);
    assert.equal(roomy.inspectorWidth, 560);
    assert.equal(JSON.stringify(preferences), saved);
    first.libraryWidth = 0;
    assert.notEqual(getEditorPanelLayout(1100, preferences).libraryWidth, 0);
});

test("layout normalizes invalid preferences and uses a finite SSR viewport default", () => {
    const fallback = getEditorPanelLayout(1400);
    for (const width of [undefined, null, NaN, Infinity, -Infinity, "390", {}]) {
        assert.deepEqual(getEditorPanelLayout(width), fallback);
    }
    assert.deepEqual(getEditorPanelLayout(1440, {
        libraryWidth: -1, inspectorWidth: Infinity, libraryOpen: "false", inspectorOpen: false,
    }), {
        isDocked: true, libraryOpen: true, inspectorOpen: false, libraryWidth: 240, inspectorWidth: 0,
        libraryMaxWidth: 480, inspectorMaxWidth: 560,
    });
    for (const preferences of [null, [], "invalid"]) {
        assert.deepEqual(getEditorPanelLayout(1400, preferences), fallback);
    }
});
